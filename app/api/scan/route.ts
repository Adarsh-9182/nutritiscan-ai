import { generateText, Output } from "ai";
import { z } from "zod";
import { MODEL, SAFETY } from "@/lib/agents/safety";
import { analyzeMeal, parseMeal, resolveNamed, type ScanResult } from "@/lib/nutrition/analyze";
import { matchFood } from "@/lib/nutrition/foods";
import { demoProfile, type HealthProfile } from "@/lib/memory/profile";

export const maxDuration = 60;

// ------------------------------------------------------------
// The scan pipeline streams its own progress as NDJSON so the UI
// can show what the system is actually doing, stage by stage,
// instead of a spinner that means nothing.
// ------------------------------------------------------------

type Stage = { id: string; label: string };
type Event =
  | { type: "stage"; id: string; label: string; status: "active" | "done" }
  | { type: "result"; result: ScanResult }
  | { type: "error"; message: string };

type Body = {
  mode: "photo" | "describe";
  text?: string;
  image?: { base64: string; mediaType: string; filename?: string };
  profile?: HealthProfile;
};

const VisionSchema = z.object({
  title: z.string().describe("A short natural name for the meal, e.g. 'Dal, rice and salad'."),
  items: z
    .array(
      z.object({
        name: z.string().describe("A single food item, named plainly and in the singular, e.g. 'roti', 'paneer', 'white rice'."),
        grams: z.number().describe("Estimated edible weight of this item in grams, judged from the visible portion."),
        confidence: z.number().min(0).max(1).describe("How sure you are this item is present, 0–1."),
      }),
    )
    .describe("Every distinct food visible on the plate. Split composite dishes into their components where you can."),
  note: z.string().optional().describe("One short caveat if the photo is unclear, blurry, or partly hidden. Omit if the photo is clear."),
});

const VISION_PROMPT = `You are the Vision layer of NutritiScan AI, a health operating system.

Identify every distinct food in this photo and estimate each item's edible weight in grams
from the visible portion size. Use plain, common food names — prefer "roti" over "flatbread",
"white rice" over "grain", "curd" over "fermented dairy". Split combined dishes into components
when you can tell them apart (a thali is dal + rice + sabzi + roti, not "thali").

Be honest about uncertainty: if something is partly hidden or ambiguous, still list it with a
lower confidence rather than guessing wildly, and add a short note.

Estimate only what you can see. Do not invent items that are not in the photo.

${SAFETY}`;

function encoder(controller: ReadableStreamDefaultController) {
  const enc = new TextEncoder();
  return (e: Event) => controller.enqueue(enc.encode(JSON.stringify(e) + "\n"));
}

const PHOTO_STAGES: Stage[] = [
  { id: "read", label: "Reading the image" },
  { id: "identify", label: "Identifying foods" },
  { id: "match", label: "Matching the nutrition database" },
  { id: "memory", label: "Checking your Health Memory" },
  { id: "verdict", label: "Writing your verdict" },
];

const TEXT_STAGES: Stage[] = [
  { id: "parse", label: "Reading your description" },
  { id: "match", label: "Matching the nutrition database" },
  { id: "memory", label: "Checking your Health Memory" },
  { id: "verdict", label: "Writing your verdict" },
];

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ error: "Send a JSON body with a mode of 'photo' or 'describe'." }, { status: 400 });
  }

  const profile = body.profile ?? demoProfile;
  const mode = body.mode === "photo" ? "photo" : "describe";
  // The gateway accepts either an explicit key or a Vercel OIDC token, so try
  // the real model whenever either is present — and degrade, never fail, if it
  // turns out to be unusable (no billing, expired token, provider outage).
  const hasCredential = !!(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN);

  const stream = new ReadableStream({
    async start(controller) {
      const send = encoder(controller);
      const stages = mode === "photo" ? PHOTO_STAGES : TEXT_STAGES;
      let cursor = 0;
      const advance = async (pause = 260) => {
        if (cursor > 0) send({ type: "stage", ...stages[cursor - 1], status: "done" });
        if (cursor < stages.length) {
          send({ type: "stage", ...stages[cursor], status: "active" });
          cursor++;
          await wait(pause);
        }
      };
      const finishStages = () => {
        for (let i = cursor - 1; i < stages.length; i++) if (stages[i]) send({ type: "stage", ...stages[i], status: "done" });
      };

      try {
        let result: ScanResult;

        if (mode === "photo") {
          await advance(); // read
          let vision: ScanResult | null = null;
          let degraded: string | null = null;

          if (hasCredential && body.image?.base64) {
            send({ type: "stage", ...stages[0], status: "done" });
            send({ type: "stage", ...stages[1], status: "active" });
            cursor = 2;
            try {
              const { output } = await generateText({
                model: MODEL,
                output: Output.object({ schema: VisionSchema }),
                messages: [
                  {
                    role: "user",
                    content: [
                      { type: "text", text: VISION_PROMPT },
                      { type: "file", mediaType: body.image.mediaType || "image/jpeg", data: { type: "data", data: body.image.base64 } },
                    ],
                  },
                ],
              });

              await advance(200); // match
              const { items } = resolveNamed(output.items);
              if (!items.length) {
                send({ type: "error", message: "I couldn't make out any food in that photo. Try a clearer, closer shot — or describe the meal instead." });
                return;
              }
              await advance(200); // memory
              await advance(160); // verdict
              vision = analyzeMeal(items, profile, { source: "vision", title: output.title, note: output.note });
            } catch (err) {
              // The credential exists but the model is unreachable. Say so
              // plainly and fall through — a broken scan is worse than an
              // honest one.
              degraded = err instanceof Error ? err.message.split("\n")[0] : "the vision model is unavailable";
            }
          }

          if (vision) {
            result = vision;
          } else {
            // No usable vision model. Rather than fabricate a reading of a photo
            // nobody looked at, use the one real signal available — the filename —
            // and label everything else plainly as a sample.
            const guess = body.image?.filename ? matchFood(body.image.filename.replace(/[-_.]/g, " ")) : null;
            const why = degraded
              ? `Real photo recognition is configured but currently unavailable — ${degraded}`
              : "No vision model is configured";

            while (cursor < stages.length) await advance(200);

            if (guess) {
              result = analyzeMeal(parseMeal(guess.name), profile, {
                source: "text",
                title: guess.name,
                note: `${why}. I read the filename ("${body.image?.filename}") instead of the image itself — the nutrition below is real, the identification is a guess.`,
              });
            } else {
              result = analyzeMeal(parseMeal("2 rotis, a bowl of dal, curd and salad"), profile, {
                source: "sample",
                title: "Sample meal — dal, roti, curd",
                note: `${why}, so this is a sample meal rather than a reading of your photo. Switch to “Describe” — it works fully offline and every number there is computed from the food database.`,
              });
            }
          }
        } else {
          const text = (body.text ?? "").trim();
          if (!text) {
            send({ type: "error", message: "Tell me what you ate and I'll break it down." });
            return;
          }
          await advance(240); // parse
          const items = parseMeal(text);
          if (!items.length) {
            send({
              type: "error",
              message: `I couldn't find a food I know in "${text}". Try naming items plainly — "2 rotis, dal, curd" or "150g chicken and rice".`,
            });
            return;
          }
          await advance(200); // match
          await advance(200); // memory
          await advance(160); // verdict
          result = analyzeMeal(items, profile, { source: "text" });
        }

        finishStages();
        send({ type: "result", result });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Something went wrong analysing that meal.";
        send({ type: "error", message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

/** Lets the client show whether real vision is configured. */
export async function GET() {
  return Response.json({ vision: !!(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN) });
}
