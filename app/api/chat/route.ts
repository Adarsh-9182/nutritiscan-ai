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
import { assessTurn, halts } from "@/lib/safety/triage";
import { isClinicalTurn, validateAnswer, withheldResponse } from "@/lib/safety/validate";
import { clinicalBrief } from "@/lib/clinical/brief";
import { buildConsultNote, renderNoteText } from "@/lib/clinical/note";
import { emergencyResponse, mentalHealthResponse, urgentAgentDirective, urgentPreamble } from "@/lib/safety/templates";
import type { ClinicalState } from "@/lib/clinical/state";

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
  triage: string | null,
  /** Needed to decide whether this turn is buffered, and to validate against. */
  state: ClinicalState,
  signal: AbortSignal,
): Promise<RealOutcome> {
  let wrote = false;

  /*
   * Streaming and validation want opposite things.
   *
   * A validator can only judge a finished answer — a missing Medical Warning
   * is invisible until the last token — but by then a straight-through stream
   * has already put the answer on screen, and nothing can be taken back.
   *
   * So the turn decides. Clinical turns are buffered: text is held, checked,
   * and only then emitted. Everything else streams exactly as before, because
   * making someone wait for a paragraph about protein is how a safety check
   * earns a reputation for being in the way. Non-text chunks (traces, step
   * markers) pass through either way so the UI still shows progress.
   */
  const buffered = isClinicalTurn(state);
  let held = "";

  try {
    const stream = await createAgentUIStream({
      agent: buildSupervisor(profile, nutrition, recalled, triage, clinicalBrief(state)),
      uiMessages: messages,
      abortSignal: signal,
    });

    for await (const chunk of stream) {
      const c = chunk as { type?: string; delta?: string };
      const type = c.type;

      if (type === "error") {
        // Same reasoning as the catch below: in a buffered turn only the
        // held text counts as something the reader has seen.
        if (!(buffered ? held.length > 0 : wrote)) return "unavailable";
        if (held) writeFixed(writer, held);
        writeInterrupted(writer);
        return "partial";
      }

      if (buffered && (type === "text-delta" || type === "text-start" || type === "text-end")) {
        if (type === "text-delta" && c.delta) held += c.delta;
        continue;
      }

      writer.write(chunk as never);
      if (!NON_CONTENT_CHUNK_TYPES.has(type ?? "")) wrote = true;
    }

    if (buffered) {
      if (!held.trim()) return "unavailable";
      const verdict = validateAnswer(held, state);

      if (verdict.blocked) {
        // Loud in the logs, calm on screen. The reader asked a health
        // question and gets a usable reply; the failure is ours to fix.
        console.error("[validate] answer withheld", {
          consultationId: state.consultationId,
          turn: state.turn,
          violations: verdict.violations.map((v) => v.id),
          failedClosed: verdict.failedClosed,
        });
        writeFixed(writer, withheldResponse(state));
        return "ok";
      }

      if (!verdict.ok) {
        console.warn("[validate] answer shown with violations", {
          consultationId: state.consultationId,
          violations: verdict.violations.map((v) => v.id),
        });
      }
      writeFixed(writer, held);
      return "ok";
    }

    return wrote ? "ok" : "unavailable";
  } catch {
    /*
     * `wrote` means "the reader has already seen real content", which is why
     * it decides between falling back cleanly and admitting a cut-off answer.
     * Buffering broke that: text never goes through in a buffered turn, so
     * `wrote` was being set true by tool-call chunks alone and a turn that
     * died before producing a single word reported "partial" — leaving an
     * empty bubble and the interruption notice attached to nothing.
     *
     * In a buffered turn the held text is the only thing that counts.
     */
    const shown = buffered ? held.length > 0 : wrote;
    if (!shown) return "unavailable";
    if (held) writeFixed(writer, held);
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
 * Emit a fixed escalation template.
 *
 * Written in one chunk rather than word-by-word like the demo brain: the
 * typing effect is a nicety for a conversational answer and an obstacle in
 * front of "call an ambulance". Nothing here is generated — see
 * lib/safety/templates.ts.
 */
function writeFixed(writer: UIMessageStreamWriter, text: string) {
  const id = `safety-${Date.now()}`;
  writer.write({ type: "text-start", id });
  writer.write({ type: "text-delta", id, delta: text });
  writer.write({ type: "text-end", id });
}

/**
 * Surface the triage outcome to the client alongside the text, so the UI can
 * render urgency as urgency (a banner, a colour, an interstitial) instead of
 * relying on the user to read to the end of a paragraph.
 */
function writeTriage(writer: UIMessageStreamWriter, state: ClinicalState) {
  writer.write({
    type: "data-triage",
    id: "triage",
    data: {
      verdict: state.triage.verdict,
      firedRules: state.triage.firedRules,
      channel: state.triage.channel ?? null,
      failedClosed: state.triage.failedClosed,
    },
  });
}

/**
 * Emit the consult note for a clinical turn.
 *
 * Sent as a data part rather than folded into the answer text so it stays a
 * record: the UI can render it separately, and the reader can hand it to a
 * clinician without the surrounding conversation. Assembled from
 * ClinicalState, never asked of the model — see lib/clinical/note.ts.
 *
 * Only on clinical turns. A note attached to "how much protein do I need"
 * is filing, not medicine, and would train people to ignore the ones that
 * matter.
 */
function writeNote(writer: UIMessageStreamWriter, state: ClinicalState) {
  if (!isClinicalTurn(state)) return;
  const note = buildConsultNote(state);
  writer.write({
    type: "data-note",
    id: "note",
    data: { note, text: renderNoteText(note) },
  });
}

/**
 * Demo brain — a safe, structured, keyless answer streamed word by word,
 * with the specialist trace the UI renders.
 */
async function streamDemo(writer: UIMessageStreamWriter, userText: string, profile: HealthProfile, meals: LoggedMeal[], state: ClinicalState, signal: AbortSignal) {
  const route = routeOf(userText);
  const consulting = route === "supervisor" ? [] : [route];

  if (consulting.length) {
    writer.write({ type: "data-trace", id: "trace", data: { agents: consulting, done: false } });
    await sleep(550, signal);
  }

  const id = `msg-${Date.now()}`;
  writer.write({ type: "text-start", id });
  for (const w of demoAnswer(userText, profile, meals, state).split(/(\s+)/)) {
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

  // ----------------------------------------------------------------
  // SAFETY LAYER 2 — TRIAGE. Runs before retrieval, before reasoning,
  // and before the credential check, because it is deterministic and
  // must work on a deployment with no model configured at all.
  // See docs/SAFETY.md §2.
  // ----------------------------------------------------------------
  const state = assessTurn({
    text: userText,
    profile,
    // No persisted consultation yet (docs/DATA.md §6). Per-request id keeps
    // the audit shape correct so Phase 2 only has to change where it comes from.
    consultationId: `req-${Date.now().toString(36)}`,
    turn: recent.filter((m) => m.role === "user").length,
  });

  // Bound the model call and drop everything if the client disconnects.
  const budget = AbortSignal.timeout(MODEL_BUDGET_MS);
  const signal = AbortSignal.any([req.signal, budget]);

  const stream = createUIMessageStream({
    async execute({ writer }) {
      writeTriage(writer, state);

      // A dedicated non-clinical path owns this turn entirely — no
      // differential, no nutrition advice, nothing else alongside it.
      if (state.triage.channel === "mental_health") {
        writeFixed(writer, mentalHealthResponse());
        return;
      }

      // The pipeline stops here. No model call, no specialists, no
      // "possible explanations" while someone should be calling an ambulance.
      if (halts(state.triage)) {
        writeFixed(writer, emergencyResponse(state));
        return;
      }

      const directive = state.triage.verdict === "urgent" ? urgentAgentDirective(state) : null;

      if (hasModelCredential()) {
        // Best-effort: a failed or slow embedding call must not cost the
        // user their answer, so recall degrades to null rather than
        // propagating a rejection into the supervisor call below it.
        const recalled = await recallRelevant(userText, profile, meals, signal);
        const outcome = await streamRealSupervisor(writer, recent, profile, nutrition, recalled, directive, state, signal);
        if (outcome !== "unavailable") {
          // A partial turn still gets its note: the record of what the system
          // concluded is independent of whether the prose finished.
          writeNote(writer, state);
          return;
        }
        // "unavailable" means nothing reached the client yet — the demo
        // brain can still answer, and an honest answer beats a dead spinner.
      }
      // The demo brain has no idea about triage, so the urgency is prepended
      // deterministically. A keyless deployment must not lose the one part of
      // the answer that matters most.
      if (directive) writeFixed(writer, `${urgentPreamble(state)}\n\n---\n\n`);
      await streamDemo(writer, userText, profile, meals, state, signal);
      writeNote(writer, state);
    },
    onError: () => "Something went wrong on our side. Please try again.",
  });

  return createUIMessageStreamResponse({ stream });
}
