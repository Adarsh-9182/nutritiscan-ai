import { describe, expect, it } from "vitest";
import { clinicalBrief } from "./brief";
import { emptyState, type ClinicalState } from "./state";

const finding = (label: string, span: string, q: Partial<{ severe: boolean; sudden: boolean; historical: boolean }> = {}) => ({
  conceptId: label,
  label,
  span,
  index: 0,
  qualifiers: { historical: false, severe: false, sudden: false, ...q },
});

const state = (patch: Partial<ClinicalState> = {}): ClinicalState => ({
  ...emptyState("c-1", 1, "text"),
  ...patch,
});

describe("clinical brief", () => {
  it("says nothing when there is nothing to say", () => {
    // An empty block spends context and trains the model to skim the heading.
    expect(clinicalBrief(state())).toBeNull();
  });

  it("carries the patient's own words, not the concept label", () => {
    const b = clinicalBrief(state({ findings: [finding("Dyspnoea", "can't catch my breath")] }))!;
    expect(b).toContain(`"can't catch my breath"`);
  });

  it("marks severity and onset only when set", () => {
    const marked = clinicalBrief(state({ findings: [finding("Headache", "worst ever", { severe: true, sudden: true })] }))!;
    expect(marked).toContain("[sudden onset, severe]");

    // Check the finding line itself: the block's own headers use brackets.
    const plain = clinicalBrief(state({ findings: [finding("Headache", "a headache")] }))!;
    const line = plain.split("\n").find((l) => l.startsWith("- Headache"))!;
    expect(line).toBe(`- Headache: "a headache"`);
  });

  it("separates current from historical", () => {
    const b = clinicalBrief(
      state({
        findings: [finding("Fever", "fever now"), finding("Surgery", "appendix out in 2019", { historical: true })],
      }),
    )!;
    expect(b).toContain("Reported now:");
    expect(b).toContain("Reported as past, not current:");
    expect(b.indexOf("fever now")).toBeLessThan(b.indexOf("appendix out in 2019"));
  });

  it("passes denials through with an instruction not to re-ask", () => {
    const b = clinicalBrief(state({ negatives: ["chest pain", "shortness of breath"] }))!;
    expect(b).toContain("do not ask about these again");
    expect(b).toContain("chest pain");
  });

  it("distinguishes profile risk factors from reported ones", () => {
    const b = clinicalBrief(
      state({
        riskFactors: [
          { id: "diabetes", label: "Diabetes", source: "profile_recorded" },
          { id: "smoker", label: "Smoker", source: "patient_reported" },
        ],
      }),
    )!;
    expect(b).toContain("Diabetes (from their profile)");
    expect(b).toContain("Smoker (they told us)");
  });

  it("never restates the triage verdict — that reaches the model elsewhere", () => {
    const b = clinicalBrief(
      state({
        findings: [finding("Chest pain", "chest hurts")],
        triage: { verdict: "emergency", firedRules: ["cardiac.chest-pain-with-features"], modelSuspicion: [], failedClosed: false },
      }),
    )!;
    expect(b.toLowerCase()).not.toContain("emergency");
    expect(b).not.toContain("cardiac.chest-pain-with-features");
  });

  it("stays bounded on a long turn", () => {
    const many = Array.from({ length: 40 }, (_, i) => finding(`F${i}`, `span ${i}`));
    const b = clinicalBrief(state({ findings: many }))!;
    expect((b.match(/^- F/gm) ?? []).length).toBeLessThanOrEqual(12);
  });
});
