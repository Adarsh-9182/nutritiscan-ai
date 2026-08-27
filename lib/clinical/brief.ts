// ============================================================
// CLINICAL BRIEF — what the extractor found, handed to the model
//
// ClinicalState exists so that stages after extraction can read structure
// instead of re-deriving it from prose. Until now only triage did. The
// supervisor received the raw message and worked everything out again, which
// meant two things:
//
//   1. The extractor and the model could disagree about what the patient
//      said, and nothing would notice.
//   2. Denials were thrown away. DATA.md §3.5: "'no chest pain' is a
//      clinical finding, and the intake engine must not re-ask what has
//      already been answered." The model could not honour that rule because
//      it was never told.
//
// This is context engineering — deciding what the model sees. It is the
// cheapest lever on answer quality and the easiest one to get wrong in the
// expensive direction, so two rules constrain it:
//
//   FACTS ONLY. Extracted findings are patient_reported, which is assertable
//   under lib/patient/provenance.ts. Nothing inferred goes in this block; an
//   inference presented as a finding is exactly the confusion the provenance
//   column exists to prevent.
//
//   NO VERDICT. The triage verdict is deliberately absent. Urgency reaches
//   the model through urgentAgentDirective, which is worded so it cannot be
//   argued with. Restating a verdict here as ordinary context would invite
//   the model to reason about it, and triage is not up for discussion.
// ============================================================

import type { ClinicalState } from "./state";

/** Keeps the block bounded on a long turn; the transcript still carries everything. */
const MAX_ITEMS = 12;

function describe(label: string, span: string, q: { severe: boolean; sudden: boolean; historical: boolean }): string {
  const marks: string[] = [];
  if (q.sudden) marks.push("sudden onset");
  if (q.severe) marks.push("severe");
  if (q.historical) marks.push("historical, not current");
  // The patient's own words, not the concept label: a brief that says
  // "dyspnoea" when they said "can't catch my breath" has already begun
  // editorialising, and the model then reasons about our paraphrase.
  return `- ${label}: "${span}"${marks.length ? ` [${marks.join(", ")}]` : ""}`;
}

/**
 * Render the extracted state for the supervisor prompt.
 *
 * Returns null when there is nothing worth saying. An empty block is worse
 * than no block: it spends context and teaches the model to skim past the
 * heading on the turns where it does matter.
 */
export function clinicalBrief(state: ClinicalState): string | null {
  const current = state.findings.filter((f) => !f.qualifiers.historical).slice(0, MAX_ITEMS);
  const historical = state.findings.filter((f) => f.qualifiers.historical).slice(0, MAX_ITEMS);
  const negatives = state.negatives.slice(0, MAX_ITEMS);
  const risks = state.riskFactors.slice(0, MAX_ITEMS);

  if (!current.length && !historical.length && !negatives.length && !risks.length) return null;

  const lines: string[] = [
    "[EXTRACTED CLINICAL STATE — read this before answering]",
    "A deterministic extractor read the patient's message before you. This is what it found.",
    "Treat it as what the patient said, not as a diagnosis, and do not contradict it.",
  ];

  if (current.length) {
    lines.push("", "Reported now:", ...current.map((f) => describe(f.label, f.span, f.qualifiers)));
  }

  if (historical.length) {
    lines.push(
      "",
      "Reported as past, not current:",
      ...historical.map((f) => describe(f.label, f.span, f.qualifiers)),
    );
  }

  if (negatives.length) {
    lines.push(
      "",
      "Explicitly DENIED by the patient — do not ask about these again:",
      ...negatives.map((n) => `- ${n}`),
    );
  }

  if (risks.length) {
    lines.push(
      "",
      "Risk factors on record:",
      ...risks.map(
        (r) => `- ${r.label} (${r.source === "profile_recorded" ? "from their profile" : "they told us"})`,
      ),
    );
  }

  lines.push(
    "",
    "If something here is wrong, ask the patient rather than silently overriding it.",
    "[END EXTRACTED CLINICAL STATE]",
  );

  return lines.join("\n");
}
