import { describe, expect, it } from "vitest";
import { extractFindings, normalize, buildClinicalState } from "./extract";
import { blankProfile } from "../memory/profile";

const ids = (text: string) => extractFindings(text).findings.map((f) => f.conceptId);
const suppressedIds = (text: string) => extractFindings(text).suppressed.map((f) => `${f.conceptId}:${f.reason}`);
const find = (text: string, id: string) => extractFindings(text).findings.find((f) => f.conceptId === id);

describe("normalize", () => {
  it("expands contractions so negation is a standalone token", () => {
    expect(normalize("I can't breathe")).toBe("i can not breathe");
    expect(normalize("I don't have chest pain")).toBe("i do not have chest pain");
    expect(normalize("It won't stop")).toBe("it will not stop");
  });

  it("handles unapostrophised spellings people actually type", () => {
    expect(normalize("i cant breathe")).toBe("i can not breathe");
    expect(normalize("i didnt faint")).toBe("i did not faint");
  });
});

describe("concept matching", () => {
  it("finds chest pain across natural phrasings", () => {
    expect(ids("my chest hurts")).toContain("chest-pain");
    expect(ids("there's a lot of pressure in my chest")).toContain("chest-pain");
    expect(ids("feels like an elephant sitting on my chest")).toContain("chest-pain");
  });

  it("does not fire on words that merely contain a body part", () => {
    expect(ids("I bought a chest of drawers")).not.toContain("chest-pain");
    // "fit" is deliberately excluded from the seizure lexicon for this reason.
    expect(ids("I'm feeling fit and healthy")).not.toContain("seizure");
  });

  it("records the verbatim span, never a paraphrase", () => {
    expect(find("I have really bad chest pain", "chest-pain")?.span).toBe("chest pain");
  });

  it("reports one finding per concept even when repeated", () => {
    const found = ids("chest pain, chest pain, my chest hurts so much");
    expect(found.filter((i) => i === "chest-pain")).toHaveLength(1);
  });
});

describe("negation suppression", () => {
  it("suppresses an explicitly denied symptom", () => {
    expect(ids("I have no chest pain")).not.toContain("chest-pain");
    expect(suppressedIds("I have no chest pain")).toContain("chest-pain:negated");
  });

  it("handles contracted negation", () => {
    expect(ids("I don't have any chest pain")).not.toContain("chest-pain");
  });

  it("suppresses each denial in a list independently", () => {
    const text = "no chest pain and no shortness of breath";
    expect(ids(text)).not.toContain("chest-pain");
    expect(ids(text)).not.toContain("dyspnea");
  });

  /**
   * The case a naive backward scan gets wrong. "no" negates "appetite",
   * not the chest pain that follows the conjunction. Getting this wrong
   * suppresses a real emergency, so it is pinned here.
   */
  it("does not let a negation leak across a clause boundary", () => {
    const text = "I have no appetite and crushing chest pain";
    expect(ids(text)).toContain("chest-pain");
    expect(suppressedIds(text)).not.toContain("chest-pain:negated");
  });

  it("does not suppress when the negation is too far away", () => {
    expect(ids("no idea why this is happening but my chest hurts")).toContain("chest-pain");
  });
});

describe("third-party suppression", () => {
  it("suppresses a symptom attributed to someone else", () => {
    expect(ids("my father has chest pain")).not.toContain("chest-pain");
    expect(suppressedIds("my father has chest pain")).toContain("chest-pain:third_party");
  });

  /**
   * A first-person pronoun between the relation noun and the symptom means
   * the patient is the subject after all.
   */
  it("does not suppress when the patient is the subject", () => {
    expect(ids("my wife says I have chest pain")).toContain("chest-pain");
  });

  it("ignores bare pronouns, which are too ambiguous to suppress on", () => {
    // Deliberate over-firing: a wrong third-party call hides a real red flag.
    expect(ids("they have chest pain")).toContain("chest-pain");
  });
});

describe("qualifiers", () => {
  it("marks severity language", () => {
    expect(find("severe abdominal pain", "abdominal-pain")?.qualifiers.severe).toBe(true);
    expect(find("mild abdominal pain", "abdominal-pain")?.qualifiers.severe).toBe(false);
  });

  it("marks sudden onset", () => {
    expect(find("sudden chest pain", "chest-pain")?.qualifiers.sudden).toBe(true);
  });

  it("marks resolved history", () => {
    expect(find("I had chest pain three years ago", "chest-pain")?.qualifiers.historical).toBe(true);
    expect(find("history of chest pain", "chest-pain")?.qualifiers.historical).toBe(true);
  });

  /**
   * "since"/"for the past" describe something ONGOING. Reading them as
   * resolved history would silently downgrade a live symptom, so the
   * historical markers are deliberately narrow.
   */
  it("does not mistake an ongoing symptom for history", () => {
    expect(find("chest pain since last week", "chest-pain")?.qualifiers.historical).toBe(false);
    expect(find("I've had chest pain for the past 3 days", "chest-pain")?.qualifiers.historical).toBe(false);
  });
});

describe("risk factors", () => {
  it("derives risks from recorded conditions and medicines", () => {
    const state = buildClinicalState({
      text: "I feel unwell",
      profile: { ...blankProfile, conditions: ["Type 2 diabetes"], medicines: ["Warfarin 5mg"] },
      consultationId: "t",
      turn: 1,
    });
    expect(state.riskFactors.map((r) => r.id)).toEqual(expect.arrayContaining(["diabetes", "anticoagulated"]));
  });

  it("does not invent an age band when age is not recorded", () => {
    const state = buildClinicalState({ text: "hi", profile: blankProfile, consultationId: "t", turn: 1 });
    expect(state.riskFactors.map((r) => r.id)).not.toContain("age-65-plus");
  });

  it("treats pregnancy stated in the turn as a risk factor", () => {
    const state = buildClinicalState({
      text: "I'm 30 weeks pregnant and having cramps",
      profile: blankProfile,
      consultationId: "t",
      turn: 1,
    });
    expect(state.riskFactors.map((r) => r.id)).toContain("pregnant");
  });
});

describe("negatives", () => {
  it("records denied concepts separately from 'never mentioned'", () => {
    const state = buildClinicalState({
      text: "no chest pain, but my stomach hurts",
      profile: blankProfile,
      consultationId: "t",
      turn: 1,
    });
    expect(state.negatives).toContain("chest-pain");
    expect(state.findings.map((f) => f.conceptId)).toContain("abdominal-pain");
  });
});
