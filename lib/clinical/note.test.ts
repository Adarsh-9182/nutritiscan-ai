import { describe, expect, it } from "vitest";
import { buildConsultNote, renderNoteText } from "./note";
import { emptyState, type ClinicalState } from "./state";

function state(patch: Partial<ClinicalState> = {}): ClinicalState {
  return { ...emptyState("c-1", 1, "text"), ...patch };
}

const finding = (label: string, span: string, q: Partial<{ severe: boolean; sudden: boolean; historical: boolean }> = {}) => ({
  conceptId: label,
  label,
  span,
  index: 0,
  qualifiers: { historical: false, severe: false, sudden: false, ...q },
});

describe("consult note", () => {
  it("quotes the patient rather than the concept label", () => {
    const note = buildConsultNote(state({ findings: [finding("Dyspnoea", "can't catch my breath")] }));
    expect(note.subjective.lines.join(" ")).toContain("can't catch my breath");
  });

  it("marks qualifiers only when the extractor set them", () => {
    const note = buildConsultNote(
      state({ findings: [finding("Headache", "worst headache ever", { severe: true, sudden: true })] }),
    );
    const line = note.subjective.lines[0];
    expect(line).toContain("sudden onset");
    expect(line).toContain("described as severe");

    const plain = buildConsultNote(state({ findings: [finding("Headache", "a headache")] }));
    expect(plain.subjective.lines[0]).not.toContain("(");
  });

  it("records denials, because a negative is information", () => {
    const note = buildConsultNote(state({ negatives: ["chest pain", "fever"] }));
    expect(note.subjective.lines.join(" ")).toContain("Explicitly denied: chest pain, fever");
  });

  it("leads the plan with the triage verdict and names the rules", () => {
    const note = buildConsultNote(
      state({
        triage: { verdict: "emergency", firedRules: ["cardiac.chest-pain-with-features"], modelSuspicion: [], failedClosed: false },
      }),
    );
    expect(note.verdict).toBe("emergency");
    expect(note.assessment.lines[0]).toContain("EMERGENCY");
    expect(note.assessment.lines.join(" ")).toContain("cardiac.chest-pain-with-features");
  });

  it("says out loud when the verdict came from a failure, not a rule", () => {
    const note = buildConsultNote(
      state({ triage: { verdict: "urgent", firedRules: [], modelSuspicion: [], failedClosed: true } }),
    );
    expect(note.assessment.lines.join(" ")).toContain("Triage failed");
  });

  it("orders next steps by urgency, keeping original order within a tier", () => {
    const note = buildConsultNote(
      state({
        recommendedNextSteps: [
          { action: "Track meals", rationale: "baseline", urgency: "routine" },
          { action: "See a doctor today", rationale: "risk", urgency: "urgent" },
          { action: "Hydrate", rationale: "support", urgency: "routine" },
        ],
      }),
    );
    expect(note.plan.lines[0]).toContain("See a doctor today");
    expect(note.plan.lines[1]).toContain("Track meals");
    expect(note.plan.lines[2]).toContain("Hydrate");
  });

  it("flags must-not-miss items in the differential", () => {
    const note = buildConsultNote(
      state({
        differential: [
          { label: "Tension headache", supportingEvidence: [], contradictingEvidence: [], discriminators: [], dangerous: false, likelihood: "reasonably_possible" },
          { label: "Subarachnoid haemorrhage", supportingEvidence: [], contradictingEvidence: [], discriminators: [], dangerous: true, likelihood: "possible_uncertain" },
        ],
      }),
    );
    const text = note.assessment.lines.join(" ");
    expect(text).toContain("Subarachnoid haemorrhage");
    expect(text).toContain("[must not miss]");
    expect(text).not.toContain("Tension headache — reasonably possible [must not miss]");
  });

  it("never fabricates a section to look complete", () => {
    const note = buildConsultNote(state());
    expect(note.subjective.lines).toHaveLength(0);
    expect(note.objective.lines).toHaveLength(0);
    expect(note.plan.lines).toHaveLength(0);
    expect(note.objective.emptyNote).toContain("No examination or vitals");
  });

  it("distinguishes recorded profile facts from patient-reported ones", () => {
    const note = buildConsultNote(
      state({
        riskFactors: [
          { id: "diabetes", label: "Diabetes", source: "profile_recorded" },
          { id: "smoker", label: "Smoker", source: "patient_reported" },
        ],
      }),
    );
    expect(note.objective.lines[0]).toContain("from recorded profile");
    expect(note.objective.lines[1]).toContain("patient-reported");
  });

  it("always carries the disclaimer through to the rendered text", () => {
    const text = renderNoteText(buildConsultNote(state()));
    expect(text).toContain("not been reviewed by a licensed clinician");
    expect(text).toContain("NUTRITISCAN CONSULT NOTE");
  });
});
