import { describe, expect, it } from "vitest";
import { composeAnswer, EMERGENCY_ANSWER } from "./index";
import { detectEmergency, isPrescriptionInstruction, validate } from "./validate";
import type { DiagnosisResult, TreatmentResult, TriageResult } from "./contract";

const triage = (over: Partial<TriageResult> = {}): TriageResult => ({
  urgency: "routine",
  redFlags: [],
  presentingProblem: "headache for two days",
  facts: ["Headache for two days"],
  missingInfo: [],
  enoughToProceed: true,
  ...over,
});

const treatment = (over: Partial<TreatmentResult> = {}): TreatmentResult => ({
  selfCare: ["Rest and keep fluids up."],
  whenToSeeClinician: ["If it lasts more than a week."],
  questionsForClinician: ["Could my current medicines be contributing?"],
  watchFor: ["Sudden worsening."],
  ...over,
});

const diagnosis = (over: Partial<DiagnosisResult> = {}): DiagnosisResult => ({
  possibilities: [{ condition: "Tension headache", reasoning: "Pattern fits.", likelihood: "possible" }],
  distinguishers: ["Whether light makes it worse."],
  confidence: "possible",
  confidencePct: 40,
  confidenceReason: "Single symptom, no history.",
  ...over,
});

describe("detectEmergency", () => {
  it.each([
    ["I have chest pain radiating to my arm", "chest pain"],
    ["i cant breathe properly since morning", "breathing difficulty"],
    // Conversational word order — the shape people actually type. An earlier
    // version required the body part and the sign to be adjacent and missed
    // every one of these.
    ["my face is drooping and speech is slurred", "possible stroke signs"],
    ["my speech has been slurred since an hour ago", "possible stroke signs"],
    ["one arm suddenly went numb", "possible stroke signs"],
    ["there is weakness on my left side", "possible stroke signs"],
    ["he became suddenly confused", "possible stroke signs"],
    ["been coughing up blood", "bleeding"],
    ["i keep thinking about how to kill myself", "suicidal ideation"],
    ["worst headache of my life came on suddenly", "sudden severe headache"],
  ])("flags %j", (text, label) => {
    expect(detectEmergency(text)).toContain(label);
  });

  it("does not flag ordinary complaints", () => {
    expect(detectEmergency("I have a mild headache and feel tired")).toEqual([]);
    expect(detectEmergency("my chest feels a bit tight after the gym")).not.toContain("breathing difficulty");
  });
});

describe("validate — forced emergency escalation", () => {
  it("overrides an under-triaged emergency", () => {
    const out = validate({
      userText: "I have chest pain and can't breathe",
      triage: triage({ urgency: "self-care" }),
      diagnosis: null,
      treatment: null,
    });

    expect(out.urgency).toBe("emergency");
    expect(out.violations.join(" ")).toMatch(/forced to emergency/i);
    expect(out.redFlags).toEqual(expect.arrayContaining(["chest pain", "breathing difficulty"]));
  });

  it("leaves a correctly triaged routine case alone", () => {
    const out = validate({
      userText: "mild headache for two days",
      triage: triage(),
      diagnosis: diagnosis(),
      treatment: treatment(),
    });

    expect(out.urgency).toBe("routine");
    expect(out.violations).toEqual([]);
  });
});

describe("isPrescriptionInstruction", () => {
  it("catches a named drug with a dose", () => {
    expect(isPrescriptionInstruction("Take amoxicillin 500mg three times a day")).toBe(true);
  });

  it("catches an imperative without a dose", () => {
    expect(isPrescriptionInstruction("Start metformin and see how you feel")).toBe(true);
  });

  it("allows discussing a drug class as a question for a clinician", () => {
    expect(isPrescriptionInstruction("Ask your doctor whether an antibiotic is warranted")).toBe(false);
  });

  it("allows generic OTC advice", () => {
    expect(isPrescriptionInstruction("An over-the-counter pain reliever may help")).toBe(false);
  });
});

describe("validate — treatment neutralisation", () => {
  it("strips a prescription instruction but keeps the rest", () => {
    const out = validate({
      userText: "sore throat for three days",
      triage: triage(),
      diagnosis: diagnosis(),
      treatment: treatment({
        selfCare: ["Gargle warm salt water.", "Take amoxicillin 500mg twice daily."],
      }),
    });

    expect(out.treatment?.selfCare).toEqual(["Gargle warm salt water."]);
    expect(out.violations.join(" ")).toMatch(/Removed a prescription instruction/);
  });

  it("substitutes a watchFor line when the model returned none", () => {
    const out = validate({
      userText: "sore throat",
      triage: triage(),
      diagnosis: diagnosis(),
      treatment: treatment({ watchFor: [] }),
    });

    expect(out.treatment?.watchFor).toHaveLength(1);
    expect(out.violations.join(" ")).toMatch(/no watchFor/i);
  });

  it("flags verdict phrasing in the differential", () => {
    const out = validate({
      userText: "sore throat",
      triage: triage(),
      diagnosis: diagnosis({
        possibilities: [{ condition: "Strep", reasoning: "You have strep throat.", likelihood: "likely" }],
      }),
      treatment: treatment(),
    });

    expect(out.violations.join(" ")).toMatch(/verdict/i);
  });
});

describe("composeAnswer", () => {
  it("returns the constant emergency copy and nothing else", () => {
    const answer = composeAnswer({
      triage: triage({ urgency: "emergency" }),
      diagnosis: null,
      treatment: null,
      violations: [],
      stoppedAt: "emergency",
    });

    expect(answer).toBe(EMERGENCY_ANSWER);
    // No differential may leak into an emergency answer.
    expect(answer).not.toMatch(/Inference|Confidence/);
  });

  it("asks questions instead of guessing when triage lacked information", () => {
    const answer = composeAnswer({
      triage: triage({ enoughToProceed: false, missingInfo: ["How long has it lasted?", "Any fever?"] }),
      diagnosis: null,
      treatment: null,
      violations: [],
      stoppedAt: "needs-info",
    });

    expect(answer).toMatch(/How long has it lasted\?/);
    expect(answer).not.toMatch(/\*\*Inference\*\*/);
    expect(answer).toMatch(/Medical Warning/);
  });

  it("renders all five labelled sections for a complete run", () => {
    const answer = composeAnswer({
      triage: triage(),
      diagnosis: diagnosis(),
      treatment: treatment(),
      violations: [],
      stoppedAt: "complete",
    });

    for (const section of ["**Facts**", "**Inference**", "**Recommendation**", "**Medical Warning**", "**Confidence**"]) {
      expect(answer).toContain(section);
    }
    expect(answer).toMatch(/isn't a diagnosis/);
  });

  it("never omits the Medical Warning section, even with a bare treatment", () => {
    const answer = composeAnswer({
      triage: triage(),
      diagnosis: diagnosis(),
      treatment: treatment({ watchFor: ["Sudden worsening."], whenToSeeClinician: [] }),
      violations: [],
      stoppedAt: "complete",
    });

    expect(answer).toContain("**Medical Warning**");
    expect(answer).toContain("Sudden worsening.");
  });
});
