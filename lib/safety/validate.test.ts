import { describe, expect, it } from "vitest";
import { isClinicalTurn, missingSections, validateAnswer, withheldResponse } from "./validate";
import { emptyState, type ClinicalState, type TriageVerdict } from "../clinical/state";

function state(verdict: TriageVerdict = "routine", findings = 1): ClinicalState {
  const s = emptyState("c-1", 1, "text");
  return {
    ...s,
    triage: { verdict, firedRules: verdict === "emergency" ? ["cardiac.chest-pain-with-features"] : [], modelSuspicion: [], failedClosed: false },
    findings: Array.from({ length: findings }, (_, i) => ({
      conceptId: `f${i}`,
      label: `Finding ${i}`,
      span: "span",
      index: i,
      qualifiers: { historical: false, severe: false, sudden: false },
    })),
  };
}

const FULL = `Thanks for telling me.

**Facts** — You reported a headache for two days.

**Inference** — This may relate to tension or dehydration.

**Recommendation** — Track when it happens and hydrate.

**Medical Warning** — Seek urgent care if it becomes sudden and severe.

**Confidence** — possible, ~50%. One symptom, no history yet.

This is educational, not a diagnosis.`;

const ids = (a: string, s: ClinicalState) => validateAnswer(a, s).violations.map((v) => v.id);

describe("section contract", () => {
  it("accepts a well-formed clinical answer", () => {
    const r = validateAnswer(FULL, state());
    expect(r.ok).toBe(true);
    expect(r.blocked).toBe(false);
  });

  it("blocks when the Medical Warning is missing", () => {
    const without = FULL.replace(/\*\*Medical Warning\*\*.*\n/, "");
    const r = validateAnswer(without, state());
    expect(r.blocked).toBe(true);
    expect(ids(without, state())).toContain("output.missing-section.medical-warning");
  });

  it("flags other missing sections as repairable, not blocking", () => {
    const without = FULL.replace(/\*\*Confidence\*\*.*\n/, "");
    const r = validateAnswer(without, state());
    expect(r.ok).toBe(false);
    expect(r.blocked).toBe(false);
    expect(r.violations[0].severity).toBe("repair");
  });

  it("does not mistake the noun for the heading", () => {
    // "the facts" in prose must not satisfy the Facts section.
    expect(missingSections("Looking at the facts and my inference here.")).toContain("Facts");
  });

  it("accepts ## headings as well as bold", () => {
    const hashed = FULL.replace(/\*\*(.+?)\*\*/g, "## $1");
    expect(validateAnswer(hashed, state()).blocked).toBe(false);
  });
});

describe("scope", () => {
  it("does not demand the contract on a non-clinical turn", () => {
    const s = { ...state("self_care", 0) };
    expect(isClinicalTurn(s)).toBe(false);
    expect(validateAnswer("You need about 60g of protein a day.", s).ok).toBe(true);
  });

  it("treats an escalated verdict as clinical even with no findings", () => {
    expect(isClinicalTurn(state("urgent", 0))).toBe(true);
  });

  it("allows a clarifying-questions reply to skip the structure", () => {
    const q = "Since when has this been going on, and how severe is it right now?";
    expect(validateAnswer(q, state()).ok).toBe(true);
  });
});

describe("overreach", () => {
  it("blocks a diagnosis stated as fact", () => {
    const a = FULL.replace("This may relate to", "You have");
    expect(validateAnswer(a, state()).blocked).toBe(true);
    expect(ids(a, state())).toContain("output.diagnostic-verdict");
  });

  it("blocks a dose", () => {
    const a = FULL.replace("hydrate.", "take 500 mg twice a day.");
    expect(ids(a, state())).toContain("output.prescribing");
  });

  it("leaves ordinary hedged language alone", () => {
    expect(validateAnswer(FULL, state()).violations).toHaveLength(0);
  });
});

describe("contradiction — the model may not overrule triage", () => {
  it("blocks reassurance when triage escalated", () => {
    const a = FULL.replace("Track when it happens and hydrate.", "This is nothing to worry about.");
    const r = validateAnswer(a, state("emergency"));
    expect(r.blocked).toBe(true);
    expect(r.violations.map((v) => v.id)).toContain("output.contradicts-triage");
  });

  it("allows the same sentence on a routine turn", () => {
    const a = FULL.replace("Track when it happens and hydrate.", "This is nothing to worry about.");
    expect(ids(a, state("routine")).includes("output.contradicts-triage")).toBe(false);
  });
});

describe("fail closed", () => {
  it("blocks an empty answer rather than showing nothing", () => {
    const r = validateAnswer("   ", state());
    expect(r.blocked).toBe(true);
    expect(r.violations[0].id).toBe("output.empty");
  });
});

describe("withheld response", () => {
  it("never shows an error, and carries the verdict through", () => {
    const urgent = withheldResponse(state("urgent"));
    expect(urgent).toContain("seen by a clinician today");
    expect(urgent).not.toMatch(/error/i);

    const routine = withheldResponse(state("routine"));
    expect(routine).toContain("rather say that than guess");
  });
});
