// ============================================================
// NUTRITISCAN ENGINE · SAFETY / VALIDATION GATE
//
// The last stage before anything reaches a patient. Everything here
// is deterministic and pure — no model calls — for one reason: a
// safety check that is itself a language model can fail in exactly
// the same way as the thing it is checking. The prompt-level SAFETY
// block is the first line of defence; this is the backstop that does
// not depend on the model having complied.
//
// SCOPE, STATED HONESTLY: these are string heuristics over a small
// keyword set. They catch the blunt failures — a named prescription
// drug with a dose, a flat "you have X" verdict, a missing emergency
// line. They are not a clinical safety certification and must not be
// described as one.
// ============================================================

import type { DiagnosisResult, TreatmentResult, TriageResult } from "./contract";

/**
 * Symptom clusters that must never be triaged down to self-care, whatever
 * the model concluded. Deliberately short: every entry is a presentation
 * where delay is measured in minutes-to-hours, so a false positive costs
 * one unnecessary "get seen now" and a false negative can cost a life.
 *
 * Matched against the user's own words, not the model's summary — a model
 * that under-triaged is also likely to have paraphrased the red flag away.
 */
const EMERGENCY_PATTERNS: ReadonlyArray<{ re: RegExp; label: string }> = [
  { re: /\bchest (pain|tightness|pressure)\b/i, label: "chest pain" },
  { re: /\b(can'?t|cannot|trouble|difficulty) breath(e|ing)\b|\bshort(ness)? of breath\b/i, label: "breathing difficulty" },
  // Stroke signs are described conversationally ("my face is drooping", "speech
  // is slurred"), not in clinical word order, so these allow a bounded gap
  // between the body part and the sign, and match either ordering. The bound is
  // a character class that excludes sentence enders, which keeps the match
  // inside one clause and avoids unbounded backtracking.
  { re: /\b(face|arm|leg|mouth|side)\b[^.!?]{0,25}\b(droop|numb|weak|paralys)/i, label: "possible stroke signs" },
  { re: /\b(droop|numb|weak|paralys)\w*\b[^.!?]{0,25}\b(face|arm|leg|mouth|side)\b/i, label: "possible stroke signs" },
  { re: /\bslurr\w*\b[^.!?]{0,25}\bspeech\b|\bspeech\b[^.!?]{0,25}\bslurr\w*/i, label: "possible stroke signs" },
  { re: /\bsudden(ly)?\b[^.!?]{0,25}\bconfus/i, label: "possible stroke signs" },
  { re: /\bcough(ing)? (up )?blood\b|\bvomit(ing)? blood\b|\bblood in (my )?(stool|vomit)\b/i, label: "bleeding" },
  { re: /\bsevere (bleeding|burn)\b|\bwon'?t stop bleeding\b/i, label: "severe bleeding" },
  { re: /\b(suicidal|kill myself|end my life|self harm|hurt myself)\b/i, label: "suicidal ideation" },
  { re: /\banaphyla|throat closing|tongue swelling\b/i, label: "possible anaphylaxis" },
  { re: /\b(seizure|convulsion|unconscious|passed out|fainted)\b/i, label: "loss of consciousness / seizure" },
  { re: /\bworst headache of my life\b|\bthunderclap headache\b/i, label: "sudden severe headache" },
];

/**
 * Prescription-only substances the assistant must not be handing out as an
 * instruction. Not exhaustive by any measure — a representative set of the
 * classes users most often ask to start, stop, or re-dose.
 */
const PRESCRIPTION_TERMS = [
  "amoxicillin", "azithromycin", "ciprofloxacin", "doxycycline", "penicillin", "antibiotic",
  "prednisone", "prednisolone", "dexamethasone", "steroid",
  "metformin", "insulin", "glipizide",
  "lisinopril", "amlodipine", "atenolol", "metoprolol", "losartan",
  "atorvastatin", "simvastatin", "statin",
  "sertraline", "fluoxetine", "escitalopram", "alprazolam", "diazepam", "lorazepam",
  "tramadol", "codeine", "morphine", "oxycodone",
  "warfarin", "clopidogrel",
  "levothyroxine", "thyroxine",
  "omeprazole", "pantoprazole",
];

/** A dose-shaped string: "500 mg", "2 tablets", "10mg twice daily". */
const DOSE_RE = /\b\d+\s?(mg|mcg|g|ml|iu|units?|tablets?|pills?|capsules?)\b/i;

/** Phrasing that asserts a verdict rather than a possibility. */
const VERDICT_RE = /\byou (have|are suffering from|are diagnosed with|definitely have)\b/i;

export type ValidationOutcome = {
  violations: string[];
  /** Treatment with anything unsafe removed. Null in, null out. */
  treatment: TreatmentResult | null;
  /** Urgency after forced escalation — may be more severe than triage said. */
  urgency: TriageResult["urgency"];
  /** Red flags after merging anything the model missed. */
  redFlags: string[];
};

/**
 * Escalate urgency when the user's own words contain an emergency pattern the
 * model did not flag.
 *
 * This is the single most valuable check in the file. A model that mis-triages
 * chest pain as "routine" produces a fluent, calm, completely wrong answer,
 * and the calmness is what makes it dangerous.
 */
export function detectEmergency(userText: string): string[] {
  // Several patterns share a label (stroke signs are described in a few
  // different word orders), so the result is de-duplicated — a user should
  // not see "possible stroke signs" listed three times because their
  // sentence happened to match three ways.
  const labels = EMERGENCY_PATTERNS.filter(({ re }) => re.test(userText)).map(({ label }) => label);
  return [...new Set(labels)];
}

/** True when a line reads as an instruction to take a prescription-only drug. */
export function isPrescriptionInstruction(line: string): boolean {
  const lower = line.toLowerCase();
  const named = PRESCRIPTION_TERMS.find((t) => lower.includes(t));
  if (!named) return false;
  // A dose, or an imperative to start/take it, is what turns a mention into
  // an instruction. "Ask your doctor whether an antibiotic is warranted" is
  // fine and must survive; "take amoxicillin 500mg" must not.
  return DOSE_RE.test(line) || /\b(take|start|stop|increase|double|skip)\b/i.test(lower);
}

/**
 * Run the gate.
 *
 * Returns a *neutralised* treatment rather than throwing: a user asking about
 * a real symptom should still get the safe two-thirds of an answer, not an
 * error screen, when one bullet crossed a line.
 */
export function validate(input: {
  userText: string;
  triage: TriageResult;
  diagnosis: DiagnosisResult | null;
  treatment: TreatmentResult | null;
}): ValidationOutcome {
  const violations: string[] = [];

  // --- 1. Forced emergency escalation -------------------------------
  const detected = detectEmergency(input.userText);
  let urgency = input.triage.urgency;
  const redFlags = [...input.triage.redFlags];

  if (detected.length && urgency !== "emergency") {
    violations.push(
      `Triage returned "${urgency}" while the message contains ${detected.join(", ")}; forced to emergency.`,
    );
    urgency = "emergency";
  }
  for (const d of detected) {
    if (!redFlags.some((f) => f.toLowerCase().includes(d.toLowerCase()))) redFlags.push(d);
  }

  // --- 2. Verdict phrasing in the differential ----------------------
  if (input.diagnosis) {
    for (const p of input.diagnosis.possibilities) {
      if (VERDICT_RE.test(p.reasoning) || VERDICT_RE.test(p.condition)) {
        violations.push(`Differential stated a verdict rather than a possibility: "${p.condition}".`);
      }
    }
  }

  // --- 3. Prescription instructions in treatment --------------------
  let treatment = input.treatment;
  if (treatment) {
    const keptSelfCare = treatment.selfCare.filter((line) => {
      if (isPrescriptionInstruction(line)) {
        violations.push(`Removed a prescription instruction from self-care: "${line}".`);
        return false;
      }
      return true;
    });

    treatment = { ...treatment, selfCare: keptSelfCare };

    // watchFor is contractually non-empty; if the gate ever sees it empty,
    // the composer would silently omit the "when this gets worse" line.
    if (!treatment.watchFor.length) {
      violations.push("Treatment returned no watchFor items; substituted a generic escalation line.");
      treatment = {
        ...treatment,
        watchFor: ["Symptoms that get worse, last longer than expected, or start to worry you."],
      };
    }
  }

  return { violations, treatment, urgency, redFlags };
}
