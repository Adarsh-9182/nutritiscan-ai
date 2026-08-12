// ============================================================
// NUTRITISCAN ENGINE · INTENT
//
// Decides whether a message belongs to the clinical pipeline
// (Triage → Diagnosis → Treatment) or to the existing topic
// supervisor (nutrition, fitness, labs, coaching).
//
// A heuristic, on purpose. Asking a model "is this medical?"
// costs a round trip before the pipeline that is itself a round
// trip, and gets it wrong in the same direction the pipeline
// would. The cost of a miss is asymmetric and handled elsewhere:
// the emergency detector runs on EVERY message regardless of what
// this returns, so the dangerous case never depends on it.
// ============================================================

/** Words that indicate someone is describing something wrong with their body. */
const SYMPTOM_TERMS = [
  "pain", "ache", "aching", "hurts", "hurting", "sore", "swollen", "swelling",
  "fever", "chills", "nausea", "nauseous", "vomit", "diarrhea", "diarrhoea", "constipat",
  "rash", "itch", "bleeding", "bruis", "dizzy", "dizziness", "faint", "numb", "tingl",
  "cough", "sneez", "congest", "runny nose", "sore throat", "headache", "migraine",
  "cramp", "spasm", "stiff", "burning", "discharge", "infection", "infected",
  "short of breath", "breathless", "palpitation", "heartburn", "bloat",
  "insomnia", "can't sleep", "fatigue", "exhausted", "weak",
  "symptom", "sick", "ill", "unwell", "feel off",
];

/** Framings that ask for a clinical read even without a symptom word. */
const CLINICAL_FRAMINGS = [
  "what's wrong with me", "whats wrong with me", "do i have", "is this serious",
  "should i see a doctor", "should i go to the", "is it normal that",
  "diagnos", "what could this be", "why do i keep", "how do i treat",
  "is this an emergency", "should i be worried",
];

/**
 * True when the message reads as someone describing a health complaint.
 *
 * Biased toward routing INTO the pipeline: a nutrition question answered by
 * the clinical pipeline is a slightly over-careful answer, while a symptom
 * answered by the nutrition supervisor skips triage entirely.
 */
export function isClinicalQuestion(text: string): boolean {
  const t = text.toLowerCase();
  if (CLINICAL_FRAMINGS.some((f) => t.includes(f))) return true;
  if (SYMPTOM_TERMS.some((s) => t.includes(s))) return true;

  // First-person present-tense distress without a named symptom, e.g.
  // "I've been feeling awful since Tuesday".
  return /\bi(?:'ve| have| am|m)?\s+(?:been\s+)?feel(?:ing)?\s+(?:really\s+|very\s+|so\s+)?(?:bad|awful|terrible|horrible|rough|off|weird|strange)\b/i.test(
    text,
  );
}
