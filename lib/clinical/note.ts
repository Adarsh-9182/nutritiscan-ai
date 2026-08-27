// ============================================================
// CONSULT NOTE — the SOAP record for a consultation
//
// Competitors advertise "a free clinical SOAP note" with every visit, and
// it is the artefact that makes a consult portable: the thing a patient
// can hand to an actual clinician.
//
// It is assembled HERE, from ClinicalState, rather than asked of the
// model — for the same reason triage is code. A note is a record of what
// the system concluded; if the model wrote it, it would be a record of
// what the model felt like saying, and the two could differ without
// anything noticing. See docs/ARCHITECTURE.md §0.
//
// Three rules this file keeps:
//
//   1. NOTHING IS INVENTED. Every line traces to a field of ClinicalState.
//      An empty section says so; it never gets filled to look complete.
//   2. FACTS AND INFERENCE STAY APART. Subjective/Objective carry only
//      what was said or recorded. Assessment is the only section allowed
//      to be tentative, and is labelled as such.
//   3. THE VERDICT SURVIVES. Plan leads with the triage verdict. A note
//      that buries an emergency under diet advice is worse than no note.
// ============================================================

import type { ClinicalState, NextStep, TriageVerdict } from "./state";

export type NoteSection = {
  heading: string;
  /** Empty means the system genuinely has nothing here — render it as absent, not omitted. */
  lines: string[];
  /** Shown when `lines` is empty, so the gap is explicit rather than invisible. */
  emptyNote: string;
};

export type ConsultNote = {
  consultationId: string;
  turn: number;
  generatedAt: string;
  verdict: TriageVerdict;
  /** Rule ids behind the verdict. A clinician reading this can look them up. */
  firedRules: string[];
  subjective: NoteSection;
  objective: NoteSection;
  assessment: NoteSection;
  plan: NoteSection;
  /** Always present. The note is a record, not a discharge summary. */
  disclaimer: string;
};

const VERDICT_LINE: Record<TriageVerdict, string> = {
  emergency:
    "EMERGENCY — this consultation was halted. The patient was told to seek emergency care immediately.",
  urgent: "URGENT — same-day assessment by a clinician was advised.",
  routine: "ROUTINE — no red-flag rule fired on the information given.",
  self_care:
    "SELF-CARE — nothing clinical was raised in this turn.",
};

/** Urgency first, then original order: a note is read top-down under pressure. */
const STEP_RANK: Record<TriageVerdict, number> = {
  emergency: 0,
  urgent: 1,
  routine: 2,
  self_care: 3,
};

function sortSteps(steps: NextStep[]): NextStep[] {
  return steps
    .map((s, i) => ({ s, i }))
    .sort((a, b) => STEP_RANK[a.s.urgency] - STEP_RANK[b.s.urgency] || a.i - b.i)
    .map((x) => x.s);
}

/**
 * Describe a finding using the patient's own words.
 *
 * The verbatim span is quoted rather than the concept label, because a note
 * that says "dyspnoea" when the patient said "can't catch my breath" has
 * already begun editorialising. Qualifiers are appended only when the
 * extractor actually set them.
 */
function describeFinding(label: string, span: string, q: { severe: boolean; sudden: boolean; historical: boolean }): string {
  const marks: string[] = [];
  if (q.sudden) marks.push("sudden onset");
  if (q.severe) marks.push("described as severe");
  if (q.historical) marks.push("reported as historical");
  const tail = marks.length ? ` (${marks.join("; ")})` : "";
  return `${label} — “${span}”${tail}`;
}

export function buildConsultNote(state: ClinicalState, now: Date = new Date()): ConsultNote {
  const current = state.findings.filter((f) => !f.qualifiers.historical);
  const historical = state.findings.filter((f) => f.qualifiers.historical);

  const subjective: string[] = [];
  if (state.chiefComplaint) subjective.push(`Chief complaint: ${state.chiefComplaint}`);
  for (const f of current) subjective.push(describeFinding(f.label, f.span, f.qualifiers));
  for (const f of historical) subjective.push(describeFinding(f.label, f.span, f.qualifiers));
  // Denials are clinical information, not absence of it — a negative rules
  // things out and stops the intake re-asking. See DATA.md §3.5.
  if (state.negatives.length) subjective.push(`Explicitly denied: ${state.negatives.join(", ")}`);

  const objective: string[] = state.riskFactors.map(
    (r) =>
      `${r.label} — ${r.source === "profile_recorded" ? "from recorded profile" : "patient-reported"}`,
  );

  const assessment: string[] = [];
  assessment.push(VERDICT_LINE[state.triage.verdict]);
  if (state.triage.firedRules.length) {
    assessment.push(`Rules fired: ${state.triage.firedRules.join(", ")}`);
  }
  if (state.triage.failedClosed) {
    // Surfaced, never hidden: a clinician must know the verdict came from a
    // failure rather than from a rule matching.
    assessment.push(
      "Triage failed on this turn and defaulted to a safe verdict. This assessment is not based on a matched rule.",
    );
  }
  for (const d of state.differential) {
    const flag = d.dangerous ? " [must not miss]" : "";
    assessment.push(`${d.label} — ${d.likelihood.replace(/_/g, " ")}${flag}`);
  }
  assessment.push(`Confidence: ${state.confidence} — ${state.confidenceReason}`);

  const plan: string[] = sortSteps(state.recommendedNextSteps).map(
    (s) => `${s.action} — ${s.rationale}`,
  );

  return {
    consultationId: state.consultationId,
    turn: state.turn,
    generatedAt: now.toISOString(),
    verdict: state.triage.verdict,
    firedRules: [...state.triage.firedRules],
    subjective: {
      heading: "Subjective",
      lines: subjective,
      emptyNote: "The patient did not describe a symptom in this consultation.",
    },
    objective: {
      heading: "Objective",
      lines: objective,
      emptyNote:
        "No risk factors were recorded or reported. No examination or vitals were taken — this consultation was remote and text-only.",
    },
    assessment: {
      heading: "Assessment",
      lines: assessment,
      emptyNote: "No assessment was reached.",
    },
    plan: {
      heading: "Plan",
      lines: plan,
      emptyNote:
        "No next steps were computed. Absence here is not advice that none are needed.",
    },
    disclaimer:
      "Generated by NutritiScan, an AI system. This is not a diagnosis and has not been reviewed by a licensed clinician. It records what the system concluded from what was typed — no examination took place. Bring it to a clinician rather than in place of one.",
  };
}

/** Plain-text rendering, for copying into a message or handing to a doctor. */
export function renderNoteText(note: ConsultNote): string {
  const out: string[] = [
    "NUTRITISCAN CONSULT NOTE",
    `Consultation ${note.consultationId} · turn ${note.turn}`,
    `Generated ${note.generatedAt}`,
    "",
  ];
  for (const s of [note.subjective, note.objective, note.assessment, note.plan]) {
    out.push(s.heading.toUpperCase());
    if (s.lines.length) for (const l of s.lines) out.push(`  - ${l}`);
    else out.push(`  (${s.emptyNote})`);
    out.push("");
  }
  out.push(note.disclaimer);
  return out.join("\n");
}
