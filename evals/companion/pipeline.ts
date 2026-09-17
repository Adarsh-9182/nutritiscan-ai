// ============================================================
// C10: the function under test.
//
// A thin adapter over the production turn pipeline (lib/companion/turn.ts)
// for a signed-out guest, so the evals score the real triage, guard and
// hold-back release rather than a copy of them.
// ============================================================

import { speaksHinglish } from "@/lib/workspace/voice";
import { runTurn } from "@/lib/companion/turn";

export type Language = "en" | "hinglish" | "hi";
export type TurnKind = "escalated" | "guarded" | "answered";
export type TurnResult = { kind: TurnKind; text: string; language: Language };
export type Generate = (
  messages: { role: string; content: string }[],
) => Promise<string>;

const DEVANAGARI = /[ऀ-ॿ]/;

export function detectLanguage(text: string): Language {
  if (DEVANAGARI.test(text)) return "hi";
  return speaksHinglish(text) ? "hinglish" : "en";
}

export async function answerTurn(
  text: string,
  opts: { generate: Generate },
): Promise<TurnResult> {
  const language = detectLanguage(text);
  // The model is asked once; its answer is streamed to the pipeline in
  // small pieces, as a provider would.
  const generate = async function* (
    messages: { role: string; content: string }[],
  ) {
    const output = await opts.generate(messages);
    for (let i = 0; i < output.length; i += 9) yield output.slice(i, i + 9);
  };
  let shown = "";
  let kind: TurnKind = "answered";
  for await (const event of runTurn({
    messages: [{ role: "user", text }],
    workspace: null,
    route: false,
    signal: new AbortController().signal,
    generate,
  })) {
    if (event.t === "delta") shown += event.v;
    else if (event.t === "replace") shown = event.v;
    else if (event.t === "error") throw new Error(event.v);
    else if (event.t === "done") {
      if (event.outcome === "escalated") kind = "escalated";
      else if (event.outcome === "guarded") kind = "guarded";
    }
  }
  return { kind, text: shown, language };
}
