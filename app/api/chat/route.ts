import {
  createAgentUIStream,
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessage,
  type UIMessageStreamWriter,
} from "ai";
import { buildSupervisor } from "@/lib/agents";
import { demoAnswer, routeOf } from "@/lib/agents/demo";
import { safeMeals, safeProfile } from "@/lib/memory/schema";
import { nutritionContext } from "@/lib/memory/nutrition-context";
import { recallRelevant } from "@/lib/memory/recall";
import { type HealthProfile } from "@/lib/memory/profile";
import { type LoggedMeal } from "@/lib/memory/meals";
import { checkRate, clientKey, hasModelCredential, readJsonCapped, tooManyRequests } from "@/lib/http/guard";

export const maxDuration = 60;

/**
 * Chunk types with no user-visible payload (ai/dist/index.d.ts →
 * UIMessageChunk). `start` in particular carries only a messageId — writing
 * it to the client is correct (the UI stream needs it), but it must NOT
 * count as "real content was shown," or an error arriving right after it
 * gets treated as a mid-answer interruption instead of a clean, pre-content
 * failure that the demo brain could still answer honestly.
 */
const NON_CONTENT_CHUNK_TYPES = new Set(["start", "finish", "start-step", "finish-step", "message-metadata", "abort"]);

/** Leave headroom under maxDuration so we can degrade instead of being hard-cut. */
const MODEL_BUDGET_MS = 50_000;

const MAX_BODY_BYTES = 128 * 1024;
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60_000;

/** Transcript ceiling — the supervisor re-reads history on every turn. */
const MAX_MESSAGES = 40;

function lastUserText(messages: UIMessage[]): string {
  const last = [...messages].reverse().find((m) => m.role === "user");
  if (!last) return "";
  return last.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join(" ")
    .trim();
}

type RealOutcome = "ok" | "unavailable" | "partial";

/**
 * Run the real multi-agent supervisor, forwarding chunks as they arrive.
 *
 * The previous implementation wrapped `createAgentUIStreamResponse` in a
 * try/catch and claimed to "fall through to demo mode on any provider
 * error". It could not, for two separate reasons:
 *   1. That call returns a Response synchronously, while provider failures
 *      (429, no billing, outage) happen later, during stream consumption.
 *   2. Even consuming the stream here, a mid-stream provider failure does
 *      NOT throw — the AI SDK writes it as an ordinary `{type: "error"}`
 *      chunk. A version that only watched for a thrown exception (confirmed
 *      live against the "AI Gateway requires a valid credit card" 403: the
 *      loop wrote a `start` chunk, then an `error` chunk, then returned
 *      normally) counted "a chunk was written" as success and forwarded the
 *      raw provider error straight to the user instead of ever trying the
 *      demo brain — a broken experience for every real message, silently.
 *
 * Consuming the stream and checking each chunk's type lets us distinguish
 * the three cases that matter:
 *   - failed before emitting anything    → nothing is on the wire, fall back cleanly
 *   - failed mid-answer (real content already shown) → cannot retract; say so plainly
 *   - failed via an in-band error chunk before any real content → same as
 *     "failed before emitting anything": the demo brain can still answer.
 */
async function streamRealSupervisor(
  writer: UIMessageStreamWriter,
  messages: UIMessage[],
  profile: HealthProfile,
  nutrition: string,
  recalled: string | null,
  signal: AbortSignal,
): Promise<RealOutcome> {
  let wrote = false;
  try {
    const stream = await createAgentUIStream({
      agent: buildSupervisor(profile, nutrition, recalled),
      uiMessages: messages,
      abortSignal: signal,
    });

    for await (const chunk of stream) {
      const type = (chunk as { type?: string }).type;
      if (type === "error") {
        if (!wrote) return "unavailable";
        writeInterrupted(writer);
        return "partial";
      }
      writer.write(chunk as never);
      if (!NON_CONTENT_CHUNK_TYPES.has(type ?? "")) wrote = true;
    }
    return wrote ? "ok" : "unavailable";
  } catch {
    if (!wrote) return "unavailable";
    writeInterrupted(writer);
    return "partial";
  }
}

/**
 * Half an answer is worse than no answer in a health product — the user
 * must not read a truncated thought as a complete one. Shared by both the
 * thrown-exception path and the in-band error-chunk path above, since a
 * provider failure can surface either way depending on when it happens.
 */
function writeInterrupted(writer: UIMessageStreamWriter) {
  const id = `interrupted-${Date.now()}`;
  writer.write({ type: "text-start", id });
  writer.write({
    type: "text-delta",
    id,
    delta:
      "\n\n_That answer was cut off before I finished it — please don't read it as complete. Ask again and I'll start over._",
  });
  writer.write({ type: "text-end", id });
}

/**
 * Demo brain — a safe, structured, keyless answer streamed word by word,
 * with the specialist trace the UI renders.
 */
async function streamDemo(writer: UIMessageStreamWriter, userText: string, profile: HealthProfile, meals: LoggedMeal[], signal: AbortSignal) {
  const route = routeOf(userText);
  const consulting = route === "supervisor" ? [] : [route];

  if (consulting.length) {
    writer.write({ type: "data-trace", id: "trace", data: { agents: consulting, done: false } });
    await sleep(550, signal);
  }

  const id = `msg-${Date.now()}`;
  writer.write({ type: "text-start", id });
  for (const w of demoAnswer(userText, profile, meals).split(/(\s+)/)) {
    if (signal.aborted) break;
    writer.write({ type: "text-delta", id, delta: w });
    await sleep(w.trim() ? 16 : 6, signal);
  }
  writer.write({ type: "text-end", id });

  if (consulting.length) {
    writer.write({ type: "data-trace", id: "trace", data: { agents: consulting, done: true } });
  }
}

/** Abort-aware delay, so a disconnected client stops costing us a timer. */
function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const t = setTimeout(done, ms);
    signal.addEventListener("abort", done, { once: true });
    function done() {
      clearTimeout(t);
      signal.removeEventListener("abort", done);
      resolve();
    }
  });
}

export async function POST(req: Request) {
  const rate = checkRate(`chat:${clientKey(req)}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!rate.ok) {
    return tooManyRequests(rate.retryAfter, "You're sending messages faster than I can think. Give me a few seconds.");
  }

  const body = await readJsonCapped(req, MAX_BODY_BYTES);
  if (!body.ok) return Response.json({ error: body.error }, { status: body.status });

  const raw = body.value as { messages?: unknown; profile?: unknown; meals?: unknown };
  const messages = (Array.isArray(raw.messages) ? raw.messages : []) as UIMessage[];
  if (!messages.length) {
    return Response.json({ error: "Send at least one message." }, { status: 400 });
  }

  // Never trust the client profile: it is interpolated into agent instructions.
  const profile = safeProfile(raw.profile);
  // Meal titles are model- or user-authored free text, so they get the same
  // sanitising as the profile before going anywhere near an instruction block.
  const meals = safeMeals(raw.meals);
  const nutrition = nutritionContext(profile, meals);
  const recent = messages.slice(-MAX_MESSAGES);
  const userText = lastUserText(recent);

  // Bound the model call and drop everything if the client disconnects.
  const budget = AbortSignal.timeout(MODEL_BUDGET_MS);
  const signal = AbortSignal.any([req.signal, budget]);

  const stream = createUIMessageStream({
    async execute({ writer }) {
      if (hasModelCredential()) {
        // Best-effort: a failed or slow embedding call must not cost the
        // user their answer, so recall degrades to null rather than
        // propagating a rejection into the supervisor call below it.
        const recalled = await recallRelevant(userText, profile, meals, signal);
        const outcome = await streamRealSupervisor(writer, recent, profile, nutrition, recalled, signal);
        if (outcome !== "unavailable") return;
        // "unavailable" means nothing reached the client yet — the demo
        // brain can still answer, and an honest answer beats a dead spinner.
      }
      await streamDemo(writer, userText, profile, meals, signal);
    },
    onError: () => "Something went wrong on our side. Please try again.",
  });

  return createUIMessageStreamResponse({ stream });
}
