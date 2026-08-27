import { describe, expect, it, vi, afterEach } from "vitest";
import { assessTurn, escalateWithModelSuspicion, halts, runTriage } from "./triage";
import { TRIAGE_RULES } from "./rules";
import { blankProfile, type HealthProfile } from "../memory/profile";
import { emptyState, moreSevere, type ClinicalState } from "../clinical/state";

const assess = (text: string, profile: HealthProfile = blankProfile) =>
  assessTurn({ text, profile, consultationId: "t", turn: 1 });

const verdictOf = (text: string, profile?: HealthProfile) => assess(text, profile).triage.verdict;

afterEach(() => vi.restoreAllMocks());

// ------------------------------------------------------------
// The cases this layer exists for.
// ------------------------------------------------------------

describe("emergency detection", () => {
  const emergencies: [string, string][] = [
    ["crushing chest pain going down my left arm", "cardiac.chest-pain-with-features"],
    ["chest pain and I'm in a cold sweat", "cardiac.chest-pain-with-features"],
    ["one side of my face is drooping and my speech is slurred", "neuro.stroke-signs"],
    ["worst headache of my life, came on suddenly", "neuro.thunderclap-headache"],
    ["I passed out at work", "neuro.loss-of-consciousness"],
    ["my throat is closing after eating peanuts", "anaphylaxis.airway-involvement"],
    ["I'm vomiting blood", "haemorrhage.haematemesis"],
    ["cut my hand and it won't stop bleeding", "haemorrhage.uncontrolled-bleeding"],
    ["fever and a stiff neck", "infection.meningism"],
    ["I took too many paracetamol", "poisoning.ingestion"],
    ["my stomach is rigid and I can't touch it", "abdominal.peritonism"],
    ["I can't breathe at rest", "respiratory.dyspnea-at-rest"],
    ["sudden pain in my testicle", "abdominal.testicular-pain"],
  ];

  it.each(emergencies)("halts on %s", (text, expectedRule) => {
    const state = assess(text);
    expect(state.triage.verdict).toBe("emergency");
    expect(state.triage.firedRules).toContain(expectedRule);
    expect(halts(state.triage)).toBe(true);
  });
});

describe("risk-factor-sensitive rules", () => {
  it("escalates isolated chest pain to emergency for a patient with cardiac history", () => {
    expect(verdictOf("I've got some chest pain")).toBe("urgent");
    expect(verdictOf("I've got some chest pain", { ...blankProfile, conditions: ["Angina"] })).toBe("emergency");
  });

  it("escalates GI bleeding for an anticoagulated patient", () => {
    expect(verdictOf("there's blood in my stool")).toBe("urgent");
    expect(verdictOf("there's blood in my stool", { ...blankProfile, medicines: ["Warfarin"] })).toBe("emergency");
  });

  it("escalates fever for an immunosuppressed patient", () => {
    expect(verdictOf("I've had a fever since yesterday")).toBe("routine");
    expect(verdictOf("I've had a fever since yesterday", { ...blankProfile, conditions: ["Lymphoma"] })).toBe("emergency");
  });

  it("fires the obstetric rule only when pregnancy is known", () => {
    expect(verdictOf("I'm 30 weeks pregnant and bleeding down there")).toBe("emergency");
  });
});

describe("mental health channel", () => {
  it("routes to the dedicated path", () => {
    const state = assess("I don't want to be here anymore");
    expect(state.triage.channel).toBe("mental_health");
    expect(state.triage.verdict).toBe("emergency");
  });

  it("fires on indirect phrasing", () => {
    expect(assess("everyone would be better off without me").triage.verdict).toBe("emergency");
  });
});

// ------------------------------------------------------------
// Suppression must not create false negatives.
// ------------------------------------------------------------

describe("suppression", () => {
  it("does not fire on an explicitly denied symptom", () => {
    expect(verdictOf("I have no chest pain, just a blocked nose")).toBe("self_care");
  });

  it("does not fire on someone else's symptom", () => {
    expect(verdictOf("my father has chest pain, should he worry?")).toBe("self_care");
  });

  it("still fires when a negation belongs to a different clause", () => {
    expect(verdictOf("I have no appetite and crushing chest pain")).toBe("emergency");
  });

  it("still fires when the patient is the subject of a reported symptom", () => {
    expect(verdictOf("my wife says I have chest pain and I'm sweating")).toBe("emergency");
  });
});

// ------------------------------------------------------------
// Non-clinical turns must stay out of the way.
// ------------------------------------------------------------

describe("non-clinical turns", () => {
  it.each([
    "what should I eat after the gym?",
    "how much protein do I need to build muscle?",
    "can you read my lab report?",
    "2 rotis, dal and a bowl of curd",
  ])("classifies %s as self_care", (text) => {
    expect(verdictOf(text)).toBe("self_care");
  });

  it("classifies a recognised symptom with no matching rule as routine, not self_care", () => {
    // Palpitations are in the lexicon but no rule covers them on their own.
    // "We saw a symptom and have no rule for it" must not read as "nothing".
    expect(verdictOf("my heart has been racing a bit lately")).toBe("routine");
  });
});

// ------------------------------------------------------------
// Invariants from docs/SAFETY.md §6.
// ------------------------------------------------------------

describe("invariant: fail closed", () => {
  it("returns urgent, not routine, when a rule throws", () => {
    const rule = TRIAGE_RULES[1];
    vi.spyOn(rule, "matches").mockImplementation(() => {
      throw new Error("bad predicate");
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    const outcome = runTriage(emptyState("t", 1, "hello"));
    expect(outcome.failedClosed).toBe(true);
    expect(outcome.verdict).toBe("urgent");
  });

  it("lets other rules still fire an emergency when one rule is broken", () => {
    const rule = TRIAGE_RULES[1];
    vi.spyOn(rule, "matches").mockImplementation(() => {
      throw new Error("bad predicate");
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(verdictOf("I passed out")).toBe("emergency");
  });

  it("fails closed when extraction itself throws", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    // A profile whose fields throw on access exercises the outer catch.
    const hostile = {
      get conditions(): string[] {
        throw new Error("boom");
      },
    } as unknown as HealthProfile;

    const state = assessTurn({ text: "hello", profile: hostile, consultationId: "t", turn: 1 });
    expect(state.triage.verdict).toBe("urgent");
    expect(state.triage.failedClosed).toBe(true);
  });
});

describe("invariant: escalate only", () => {
  it("raises a verdict on model suspicion", () => {
    const base = { verdict: "routine" as const, firedRules: [], modelSuspicion: [], failedClosed: false };
    const out = escalateWithModelSuspicion(base, { verdict: "emergency", reasons: ["possible sepsis"] });
    expect(out.verdict).toBe("emergency");
    expect(out.modelSuspicion).toContain("possible sepsis");
  });

  it("never lowers a verdict, even when the model says self_care", () => {
    const base = { verdict: "emergency" as const, firedRules: ["neuro.stroke-signs"], modelSuspicion: [], failedClosed: false };
    const out = escalateWithModelSuspicion(base, { verdict: "self_care", reasons: ["probably benign"] });
    expect(out.verdict).toBe("emergency");
  });

  it("moreSevere is total and order-independent", () => {
    expect(moreSevere("routine", "emergency")).toBe("emergency");
    expect(moreSevere("emergency", "routine")).toBe("emergency");
    expect(moreSevere("urgent", "self_care")).toBe("urgent");
  });
});

describe("invariant: auditability", () => {
  it("records rule ids rather than prose", () => {
    const state = assess("crushing chest pain radiating to my jaw");
    expect(state.triage.firedRules.every((id) => /^[a-z-]+\.[a-z-]+$/.test(id))).toBe(true);
  });

  it("every rule has a stable id, version and rationale", () => {
    for (const r of TRIAGE_RULES) {
      expect(r.id).toMatch(/^[a-z-]+\.[a-z-]+$/);
      expect(r.version).toBeTruthy();
      expect(r.rationale.length).toBeGreaterThan(20);
    }
  });

  it("rule ids are unique", () => {
    const ids = TRIAGE_RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  /**
   * Guards the claim in docs/SAFETY.md §2.4 and rules.ts's header. If a rule
   * is ever marked reviewed, a clinician sign-off record must exist for it —
   * this test failing is the reminder to add one, not a nuisance to silence.
   */
  it("no rule claims clinical review without a sign-off record", () => {
    for (const r of TRIAGE_RULES) {
      expect(r.reviewedBy, `${r.id} claims review; add docs/clinical-review/ entry`).toBeNull();
    }
  });
});

describe("state shape", () => {
  it("carries the verbatim turn for audit", () => {
    const text = "crushing chest pain";
    expect(assess(text).text).toBe(text);
  });

  it("leaves reasoning fields empty rather than fabricating them", () => {
    const state: ClinicalState = assess("chest pain");
    expect(state.differential).toEqual([]);
    expect(state.evidence).toEqual([]);
    expect(state.confidence).toBe("unknown");
  });
});
