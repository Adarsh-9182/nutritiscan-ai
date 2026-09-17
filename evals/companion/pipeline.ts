// ============================================================
// C10 — the function under test.
//
// Mirrors app/api/companion/route.ts for a signed-out guest, minus the
// transport: triage first (deterministic, cannot be skipped), then the
// model, then the output guard. The route checks the guard on every
// streamed delta; checking the full text once is equivalent for scoring
// because unsafeOutput only grows more true as text is appended.
//
// When lib/companion/turn.ts (C6) lands, this file should shrink to a thin
// adapter over it so the eval scores the real pipeline, not a copy.
// ============================================================

import { escalation } from "@/lib/workspace/escalation";
import { speaksHinglish } from "@/lib/workspace/voice";
import { ProfileSchema } from "@/lib/workspace/types";
import { buildMessages } from "@/lib/companion/prompt";
import { boundaryText, unsafeOutput } from "@/lib/companion/guard";

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
  const guest = ProfileSchema.parse({ name: "Guest" });
  const language = detectLanguage(text);
  // The route uses speaksHinglish, which is also true for Devanagari.
  const hinglish = speaksHinglish(text, guest);

  const urgent = escalation(text, guest);
  if (urgent) return { kind: "escalated", text: urgent.text, language };

  const output = await opts.generate(
    buildMessages([{ role: "user", text }], null),
  );
  if (unsafeOutput(output))
    return { kind: "guarded", text: boundaryText(hinglish), language };
  return { kind: "answered", text: output, language };
}
