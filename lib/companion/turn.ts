import { escalation } from "@/lib/workspace/escalation";
import { runHealthAgent, type AgentReply } from "@/lib/workspace/health-agent";
import { speaksHinglish } from "@/lib/workspace/voice";
import { ProfileSchema, type Workspace } from "@/lib/workspace/types";
import { buildMessages, type Turn } from "./prompt";
import { cloudModelReady, streamChat } from "./llm";
import { boundaryText, guardRule } from "./guard";

export type TurnOutcome =
  "answered" | "escalated" | "deterministic" | "guarded" | "error" | "aborted";

export type TurnEvent =
  /** A fixed or tool answer (records, drafts, next steps, fallback). */
  | { t: "answer"; reply: AgentReply }
  | { t: "delta"; v: string }
  | { t: "replace"; v: string; mode?: "escalation" }
  | { t: "error"; v: string }
  | { t: "done"; outcome: TurnOutcome; rule?: string };

/** Minimal tracing surface, so the pipeline does not depend on a sink. */
export type TurnTrace = {
  mark(stage: string): void;
  set(fields: Record<string, string | number | boolean>): void;
};

/**
 * How much generated text is held back before release. Every guard pattern
 * spans fewer characters than this, so a match always completes while its
 * first character is still unreleased: unsafe text never reaches a screen.
 */
export const HOLD_BACK = 96;

const guest = () => ({
  profile: ProfileSchema.parse({ name: "Guest" }),
  reports: [],
  tasks: [],
  days: [],
});

/**
 * One conversational turn, identical for every channel:
 *   1. triage (server-side, deterministic, English/Hindi/Hinglish)
 *   2. optional routing to record tools and drafts
 *   3. context (permission-filtered) and generation
 *   4. guard with hold-back release
 */
export async function* runTurn(input: {
  messages: Turn[];
  workspace: Workspace | null;
  /** Run the deterministic router first (Telegram). The web client routes
   * locally so drafts can use in-browser demo data. */
  route: boolean;
  signal: AbortSignal;
  today?: string;
  trace?: TurnTrace;
  generate?: typeof streamChat;
}): AsyncGenerator<TurnEvent> {
  const { messages, workspace, signal, trace } = input;
  const last = messages[messages.length - 1];
  const profile = workspace?.profile ?? guest().profile;
  const hinglish = speaksHinglish(last.text, profile);
  const known = `${profile.conditions}\n${profile.medicines}`;
  trace?.set({
    historyTurns: messages.length,
    signedIn: Boolean(workspace),
    language: /[ऀ-ॿ]/.test(last.text) ? "hi" : hinglish ? "hinglish" : "en",
    reportsInContext:
      workspace?.reports.filter((r) => r.assistantAccess !== false).length ?? 0,
  });

  // 1. Triage on the last few user turns, before anything else.
  const recent = messages
    .filter((m) => m.role === "user")
    .slice(-3)
    .map((m) => m.text)
    .join("\n");
  const urgent = escalation(recent, profile);
  trace?.mark("triage");
  if (urgent) {
    yield { t: "replace", v: urgent.text, mode: "escalation" };
    yield { t: "done", outcome: "escalated" };
    return;
  }

  // 2. Deterministic tools.
  let fallback: AgentReply | undefined;
  if (input.route) {
    const reply = await runHealthAgent(last.text, workspace ?? guest(), {
      today: input.today,
      history: messages
        .filter((m) => m.role === "user")
        .slice(-4, -1)
        .map((m) => m.text),
      signal,
    });
    trace?.mark("route");
    const open =
      (reply.mode === "reference" || reply.mode === "unavailable") &&
      !reply.draftLog &&
      !reply.draftReminder;
    if (!open || !cloudModelReady()) {
      yield { t: "answer", reply };
      yield { t: "done", outcome: "deterministic" };
      return;
    }
    fallback = reply;
  }

  // 3–4. Generate with hold-back release.
  const prompt = buildMessages(messages, workspace);
  trace?.mark("context");
  trace?.set({
    promptChars: prompt.reduce((n, m) => n + m.content.length, 0),
  });
  const generate = input.generate ?? streamChat;
  let text = "";
  let released = 0;
  let first = true;
  try {
    for await (const delta of generate(prompt, signal)) {
      if (first) {
        trace?.mark("first_token");
        first = false;
      }
      text += delta;
      const rule = guardRule(text, known);
      if (rule) {
        trace?.set({ guardRule: rule, outputChars: text.length });
        yield { t: "replace", v: boundaryText(hinglish) };
        yield { t: "done", outcome: "guarded", rule };
        return;
      }
      // Release up to a word boundary before the held-back window.
      const limit = text.length - HOLD_BACK;
      if (limit > released) {
        const cut = Math.max(
          text.lastIndexOf(" ", limit),
          text.lastIndexOf("\n", limit),
        );
        if (cut > released) {
          if (!released) trace?.mark("first_release");
          yield { t: "delta", v: text.slice(released, cut) };
          released = cut;
        }
      }
    }
    if (text.length > released) {
      if (!released) trace?.mark("first_release");
      yield { t: "delta", v: text.slice(released) };
    }
    trace?.set({ outputChars: text.length });
    trace?.mark("done");
    if (!text.trim() && fallback) {
      yield { t: "answer", reply: fallback };
      yield { t: "done", outcome: "deterministic" };
      return;
    }
    yield { t: "done", outcome: "answered" };
  } catch {
    if (signal.aborted) {
      yield { t: "done", outcome: "aborted" };
      return;
    }
    if (!released && fallback) {
      // The model failed before anything was shown: fall back quietly.
      yield { t: "answer", reply: fallback };
      yield { t: "done", outcome: "deterministic" };
      return;
    }
    yield {
      t: "error",
      v: released
        ? "The answer was cut off. Please try again."
        : "The AI is busy right now. Please try again in a minute.",
    };
    yield { t: "done", outcome: "error" };
  }
}
