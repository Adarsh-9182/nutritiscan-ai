// ============================================================
// ESCALATION TEMPLATES — FIXED TEXT, NOT GENERATED
//
// docs/SAFETY.md §2.2: "On `emergency` the system emits a fixed, reviewed
// response template — NOT generated text."
//
// The whole point of halting the pipeline is that we stop trusting the
// model for this turn. Asking it to write the escalation would put the
// model back in the one position we just removed it from. So these are
// string templates with a structured, non-generated summary line.
//
// The only variable content is a list of finding LABELS taken from
// ClinicalState — text this repository authored in lib/clinical/extract.ts,
// not text a model produced.
// ============================================================

import type { ClinicalState } from "../clinical/state";
import { ruleById } from "./rules";
import { crisisBlock } from "./crisis";

/**
 * What to tell the clinician, assembled from findings rather than written.
 * Deduped and capped — this is a handover line, not a transcript.
 */
function findingsLine(state: ClinicalState): string | null {
  const labels = [...new Set(state.findings.map((f) => f.label))].slice(0, 6);
  if (!labels.length) return null;
  return labels.join("; ");
}

/**
 * The general emergency response.
 *
 * Deliberately contains NO differential, no "possible explanations", and no
 * reassurance. `docs/SAFETY.md §2.2`: the AI must not continue casually
 * discussing diagnoses while a potential emergency is present — and a
 * reassuring sentence here is exactly what would make someone wait.
 */
export function emergencyResponse(state: ClinicalState): string {
  const summary = findingsLine(state);

  return [
    "**This needs to be assessed by a person now — please get emergency help.**",
    "",
    "Call your local emergency number, or go to the nearest emergency department. If you can, have someone take you or go with you rather than driving yourself.",
    "",
    summary
      ? `When you get through, tell them: **${summary}** — and when it started.`
      : "When you get through, describe exactly what you told me, and when it started.",
    "",
    "I'm not going to talk through possible causes with you right now. What you've described needs someone in front of you, and anything I said about likely explanations could make you wait when you shouldn't.",
    "",
    "If things change or get worse while you're waiting, call back and say so.",
    "",
    "_If I've misread this and you're asking out of general curiosity rather than about yourself right now, tell me and we can talk about it properly._",
  ].join("\n");
}

/**
 * The mental-health response. A separate path, not a differently-worded
 * emergency — see `docs/SAFETY.md §3`.
 *
 * Deliberately: no risk stratification, no assessment questions, no
 * "how serious is it" triage, and nothing else in the same turn.
 */
export function mentalHealthResponse(): string {
  return [
    "Thank you for telling me. I'd rather you said it here than carried it alone.",
    "",
    crisisBlock(),
    "",
    "I'm not going to try to work out how serious this is — that's not something I can judge, and you deserve a person for it, not a system.",
    "",
    "What I can tell you is that this kind of pain is survivable far more often than it feels like from inside it, and that talking to someone real is the step that tends to help.",
    "",
    "I'm still here. I'm just not going to do health analysis in this conversation right now — that can wait.",
  ].join("\n");
}

/**
 * The framing prepended to a normal answer when triage said `urgent`.
 *
 * Unlike `emergency`, the pipeline continues — but the answer must be
 * bounded by the urgency rather than quietly contradicting it.
 */
export function urgentPreamble(state: ClinicalState): string {
  const summary = findingsLine(state);
  return [
    "**Before anything else: what you've described should be looked at by a clinician today, not left to see how it goes.**",
    summary ? `\nSpecifically: ${summary}.` : "",
    "\nIf it gets worse, or you develop new symptoms, treat that as a reason to seek emergency care rather than to wait.",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Instruction injected into the supervisor when triage returned `urgent`.
 *
 * The deterministic layer has already decided the urgency; the model's job
 * is to answer *within* it. This does not ask the model to assess urgency,
 * because it does not get a vote — see `escalateWithModelSuspicion`.
 */
export function urgentAgentDirective(state: ClinicalState): string {
  const rules = state.triage.firedRules
    .map((id) => ruleById(id)?.rationale)
    .filter(Boolean)
    .slice(0, 4);

  return `[TRIAGE — DECIDED BY THE SAFETY LAYER, NOT BY YOU]
This turn has been classified as URGENT by a deterministic clinical safety layer that ran before you.
Reason${rules.length === 1 ? "" : "s"}: ${rules.join(" / ") || "an urgent pattern was detected"}.

You MUST:
- Open by stating plainly that this needs same-day clinical assessment.
- Answer the user's actual question, but never in a way that implies waiting is fine.
- Include the Medical Warning section, naming what would make this an emergency.
- Never reassure the user that this is probably nothing.

You may NOT downgrade this assessment, disagree with it, or explain it away. If you
believe it is more serious than urgent, say so — you can raise the concern, never lower it.
[END TRIAGE]`;
}
