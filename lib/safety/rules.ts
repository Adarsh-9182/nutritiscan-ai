// ============================================================
// TRIAGE RULES
//
// Deterministic predicates over ClinicalState. See docs/SAFETY.md §2.
//
// ── READ THIS BEFORE TRUSTING ANY RULE BELOW ──────────────────
// Every rule ships with `reviewedBy: null`, which means NO CLINICIAN HAS
// REVIEWED IT. These are an engineering approximation of the domains the
// product spec enumerates, written so that code can execute them. They are
// not derived from any clinical guideline, and this repository does not
// claim they are — fabricating a guideline citation would be exactly the
// failure this product exists to prevent.
//
// `reviewedBy: null` has a mechanical consequence, not just a documentary
// one: docs/EVALUATION.md §2.2 makes unreviewed rules advisory in the eval
// gate, and the product's own disclosures must describe this layer as a
// conservative approximation until sign-off lands in docs/clinical-review/.
// ──────────────────────────────────────────────────────────────
//
// Design bias, stated once and applied throughout: these rules optimise for
// RECALL. A false "please get this looked at" costs a user some worry. A
// false "that sounds fine" is unbounded. Where a rule could reasonably go
// either way, it fires.
// ============================================================

import {
  hasCurrent,
  hasAnyCurrent,
  hasRisk,
  hasSevere,
  hasSudden,
  type ClinicalState,
  type TriageVerdict,
} from "../clinical/state";

export type TriageRule = {
  id: string;
  version: string;
  domain: string;
  verdict: Extract<TriageVerdict, "emergency" | "urgent">;
  /** For clinical reviewers and audit. Never shown to a patient. */
  rationale: string;
  /** Name + date of the clinician who signed this rule off. null = unreviewed. */
  reviewedBy: string | null;
  /** Routes the response to a dedicated non-clinical path. */
  channel?: "mental_health";
  matches: (s: ClinicalState) => boolean;
};

const STROKE_SIGNS = ["facial-droop", "unilateral-weakness", "slurred-speech"];

export const TRIAGE_RULES: TriageRule[] = [
  // ---------------- Mental health ----------------
  // First in the list because its response path differs in kind, not degree.
  {
    id: "mental-health.suicidal-ideation",
    version: "1",
    domain: "mental-health",
    verdict: "emergency",
    channel: "mental_health",
    rationale: "Any expression of suicidal ideation, intent or self-harm. Deliberately over-broad: passive ideation and indirect phrasing included. No risk stratification is attempted.",
    reviewedBy: null,
    matches: (s) => hasCurrent(s, "suicidal-ideation"),
  },

  // ---------------- Cardiac ----------------
  {
    id: "cardiac.chest-pain-with-features",
    version: "1",
    domain: "cardiac",
    verdict: "emergency",
    rationale: "Chest pain with radiation, diaphoresis, breathlessness, severity or sudden onset.",
    reviewedBy: null,
    matches: (s) =>
      hasCurrent(s, "chest-pain") &&
      (hasAnyCurrent(s, ["radiation-arm-jaw", "diaphoresis", "dyspnea"]) ||
        hasSevere(s, ["chest-pain"]) ||
        hasSudden(s, ["chest-pain"])),
  },
  {
    id: "cardiac.chest-pain-high-risk-patient",
    version: "1",
    domain: "cardiac",
    verdict: "emergency",
    rationale: "Chest pain in a patient with recorded cardiac history, diabetes, or aged 65+. Presentation is frequently atypical in these groups, so the feature-based rule above is not relied on.",
    reviewedBy: null,
    matches: (s) =>
      hasCurrent(s, "chest-pain") &&
      (hasRisk(s, "cardiac-history") || hasRisk(s, "diabetes") || hasRisk(s, "age-65-plus")),
  },
  {
    id: "cardiac.chest-pain-isolated",
    version: "1",
    domain: "cardiac",
    verdict: "urgent",
    rationale: "Chest pain with no additional features and no recorded risk factors. Still not routine.",
    reviewedBy: null,
    matches: (s) => hasCurrent(s, "chest-pain"),
  },

  // ---------------- Respiratory ----------------
  {
    id: "respiratory.dyspnea-at-rest",
    version: "1",
    domain: "respiratory",
    verdict: "emergency",
    rationale: "Breathlessness at rest, inability to speak in full sentences, or cyanosis.",
    reviewedBy: null,
    matches: (s) => hasAnyCurrent(s, ["dyspnea-at-rest", "cyanosis"]),
  },
  {
    id: "respiratory.severe-dyspnea",
    version: "1",
    domain: "respiratory",
    verdict: "emergency",
    rationale: "Breathlessness described with severity or sudden-onset language.",
    reviewedBy: null,
    matches: (s) => hasSevere(s, ["dyspnea"]) || hasSudden(s, ["dyspnea"]),
  },
  {
    id: "respiratory.dyspnea",
    version: "1",
    domain: "respiratory",
    verdict: "urgent",
    rationale: "Any current breathlessness not otherwise qualified.",
    reviewedBy: null,
    matches: (s) => hasCurrent(s, "dyspnea"),
  },

  // ---------------- Neurological ----------------
  {
    id: "neuro.stroke-signs",
    version: "1",
    domain: "neurological",
    verdict: "emergency",
    rationale: "Facial droop, unilateral weakness, or speech disturbance — time-critical regardless of severity language or apparent resolution.",
    reviewedBy: null,
    matches: (s) => hasAnyCurrent(s, STROKE_SIGNS),
  },
  {
    id: "neuro.sudden-vision-loss",
    version: "1",
    domain: "neurological",
    verdict: "emergency",
    rationale: "Sudden loss of vision.",
    reviewedBy: null,
    matches: (s) => hasCurrent(s, "vision-loss"),
  },
  {
    id: "neuro.thunderclap-headache",
    version: "1",
    domain: "neurological",
    verdict: "emergency",
    rationale: "Worst-ever or sudden severe headache.",
    reviewedBy: null,
    matches: (s) => hasCurrent(s, "thunderclap-headache"),
  },
  {
    id: "neuro.seizure",
    version: "1",
    domain: "neurological",
    verdict: "emergency",
    rationale: "Seizure activity reported.",
    reviewedBy: null,
    matches: (s) => hasCurrent(s, "seizure"),
  },
  {
    id: "neuro.loss-of-consciousness",
    version: "1",
    domain: "neurological",
    verdict: "emergency",
    rationale: "Loss of consciousness, collapse, or unresponsiveness.",
    reviewedBy: null,
    matches: (s) => hasCurrent(s, "loss-of-consciousness"),
  },
  {
    id: "neuro.confusion-with-fever",
    version: "1",
    domain: "neurological",
    verdict: "emergency",
    rationale: "New confusion with fever — a sepsis-adjacent pattern.",
    reviewedBy: null,
    matches: (s) => hasCurrent(s, "acute-confusion") && hasCurrent(s, "fever"),
  },
  {
    id: "neuro.acute-confusion",
    version: "1",
    domain: "neurological",
    verdict: "urgent",
    rationale: "New confusion or altered awareness without fever.",
    reviewedBy: null,
    matches: (s) => hasCurrent(s, "acute-confusion"),
  },

  // ---------------- Anaphylaxis ----------------
  {
    id: "anaphylaxis.airway-involvement",
    version: "1",
    domain: "anaphylaxis",
    verdict: "emergency",
    rationale: "Airway swelling, or an allergic reaction with any breathing involvement.",
    reviewedBy: null,
    matches: (s) =>
      hasCurrent(s, "airway-swelling") ||
      (hasCurrent(s, "allergic-reaction") && hasAnyCurrent(s, ["dyspnea", "dyspnea-at-rest", "cyanosis"])),
  },
  {
    id: "allergy.systemic-reaction",
    version: "1",
    domain: "anaphylaxis",
    verdict: "urgent",
    rationale: "Allergic reaction reported without airway or breathing involvement. Can progress quickly.",
    reviewedBy: null,
    matches: (s) => hasCurrent(s, "allergic-reaction"),
  },

  // ---------------- Haemorrhage ----------------
  {
    id: "haemorrhage.uncontrolled-bleeding",
    version: "1",
    domain: "haemorrhage",
    verdict: "emergency",
    rationale: "Bleeding described as heavy or not stopping.",
    reviewedBy: null,
    matches: (s) => hasCurrent(s, "severe-bleeding"),
  },
  {
    id: "haemorrhage.haematemesis",
    version: "1",
    domain: "haemorrhage",
    verdict: "emergency",
    rationale: "Vomiting blood, including coffee-ground vomit.",
    reviewedBy: null,
    matches: (s) => hasCurrent(s, "haematemesis"),
  },
  {
    id: "haemorrhage.gi-bleeding-anticoagulated",
    version: "1",
    domain: "haemorrhage",
    verdict: "emergency",
    rationale: "GI bleeding in a patient recorded as taking an anticoagulant.",
    reviewedBy: null,
    matches: (s) => hasAnyCurrent(s, ["melaena", "haemoptysis"]) && hasRisk(s, "anticoagulated"),
  },
  {
    id: "haemorrhage.gi-bleeding",
    version: "1",
    domain: "haemorrhage",
    verdict: "urgent",
    rationale: "Blood in stool, black stools, or coughing up blood.",
    reviewedBy: null,
    matches: (s) => hasAnyCurrent(s, ["melaena", "haemoptysis"]),
  },

  // ---------------- Obstetric ----------------
  {
    id: "obstetric.pregnancy-with-bleeding",
    version: "1",
    domain: "obstetric",
    verdict: "emergency",
    rationale: "Pregnancy with vaginal bleeding.",
    reviewedBy: null,
    matches: (s) => hasRisk(s, "pregnant") && hasCurrent(s, "vaginal-bleeding"),
  },
  {
    id: "obstetric.pregnancy-with-severe-abdominal-pain",
    version: "1",
    domain: "obstetric",
    verdict: "emergency",
    rationale: "Pregnancy with severe abdominal pain.",
    reviewedBy: null,
    matches: (s) => hasRisk(s, "pregnant") && hasSevere(s, ["abdominal-pain"]),
  },
  {
    id: "obstetric.reduced-fetal-movement",
    version: "1",
    domain: "obstetric",
    verdict: "emergency",
    rationale: "Reduced or absent fetal movement.",
    reviewedBy: null,
    matches: (s) => hasCurrent(s, "reduced-fetal-movement"),
  },
  {
    id: "obstetric.pregnancy-with-headache-or-visual-change",
    version: "1",
    domain: "obstetric",
    verdict: "emergency",
    rationale: "Pregnancy with severe headache or visual disturbance.",
    reviewedBy: null,
    matches: (s) => hasRisk(s, "pregnant") && hasAnyCurrent(s, ["thunderclap-headache", "vision-loss"]),
  },

  // ---------------- Abdominal ----------------
  {
    id: "abdominal.peritonism",
    version: "1",
    domain: "abdominal",
    verdict: "emergency",
    rationale: "Rigid or guarded abdomen, or rebound tenderness.",
    reviewedBy: null,
    matches: (s) => hasCurrent(s, "peritonism"),
  },
  {
    id: "abdominal.severe-pain-with-fever",
    version: "1",
    domain: "abdominal",
    verdict: "emergency",
    rationale: "Severe abdominal pain with fever.",
    reviewedBy: null,
    matches: (s) => hasSevere(s, ["abdominal-pain"]) && hasCurrent(s, "fever"),
  },
  {
    id: "abdominal.testicular-pain",
    version: "1",
    domain: "abdominal",
    verdict: "emergency",
    rationale: "Testicular or scrotal pain — torsion is time-critical, so this fires on any current mention rather than waiting for severity language.",
    reviewedBy: null,
    matches: (s) => hasCurrent(s, "testicular-pain"),
  },
  {
    id: "abdominal.rlq-pain-with-fever",
    version: "1",
    domain: "abdominal",
    verdict: "urgent",
    rationale: "Abdominal pain localising to the right lower quadrant with fever.",
    reviewedBy: null,
    matches: (s) => hasCurrent(s, "abdominal-pain") && hasCurrent(s, "rlq-pain") && hasCurrent(s, "fever"),
  },
  {
    id: "abdominal.rlq-pain",
    version: "1",
    domain: "abdominal",
    verdict: "urgent",
    rationale: "Abdominal pain localising to the right lower quadrant.",
    reviewedBy: null,
    matches: (s) => hasCurrent(s, "abdominal-pain") && hasCurrent(s, "rlq-pain"),
  },
  {
    id: "abdominal.severe-pain",
    version: "1",
    domain: "abdominal",
    verdict: "urgent",
    rationale: "Severe abdominal pain without other qualifying features.",
    reviewedBy: null,
    matches: (s) => hasSevere(s, ["abdominal-pain"]),
  },

  // ---------------- Infection ----------------
  {
    id: "infection.meningism",
    version: "1",
    domain: "infection",
    verdict: "emergency",
    rationale: "Fever with neck stiffness, photophobia, or a non-blanching rash.",
    reviewedBy: null,
    matches: (s) =>
      hasCurrent(s, "fever") && hasAnyCurrent(s, ["neck-stiffness", "photophobia", "non-blanching-rash"]),
  },
  {
    id: "infection.non-blanching-rash",
    version: "1",
    domain: "infection",
    verdict: "emergency",
    rationale: "Non-blanching rash, with or without fever.",
    reviewedBy: null,
    matches: (s) => hasCurrent(s, "non-blanching-rash"),
  },
  {
    id: "infection.fever-immunosuppressed",
    version: "1",
    domain: "infection",
    verdict: "emergency",
    rationale: "Fever in a patient recorded as immunosuppressed or with a malignancy.",
    reviewedBy: null,
    matches: (s) => hasCurrent(s, "fever") && (hasRisk(s, "immunosuppression") || hasRisk(s, "malignancy")),
  },
  {
    id: "infection.fever-with-rigors",
    version: "1",
    domain: "infection",
    verdict: "urgent",
    rationale: "Fever with rigors — shaking chills suggest a systemic response rather than a local infection.",
    reviewedBy: null,
    matches: (s) => hasCurrent(s, "fever") && hasCurrent(s, "rigors"),
  },

  // ---------------- Poisoning ----------------
  {
    id: "poisoning.ingestion",
    version: "1",
    domain: "poisoning",
    verdict: "emergency",
    rationale: "Any reported overdose or ingestion of a toxic or unknown substance.",
    reviewedBy: null,
    matches: (s) => hasCurrent(s, "poisoning"),
  },

  // ---------------- Dehydration ----------------
  {
    id: "dehydration.no-urine-output-infant",
    version: "1",
    domain: "dehydration",
    verdict: "emergency",
    rationale: "No urine output in an infant or toddler.",
    reviewedBy: null,
    matches: (s) => hasCurrent(s, "no-urine-output") && hasRisk(s, "age-infant"),
  },
  {
    id: "dehydration.no-urine-output",
    version: "1",
    domain: "dehydration",
    verdict: "urgent",
    rationale: "No urine output reported.",
    reviewedBy: null,
    matches: (s) => hasCurrent(s, "no-urine-output"),
  },
  {
    id: "dehydration.cannot-keep-fluids-down",
    version: "1",
    domain: "dehydration",
    verdict: "urgent",
    rationale: "Unable to keep fluids down.",
    reviewedBy: null,
    matches: (s) => hasCurrent(s, "cannot-keep-fluids"),
  },
];

/** Rule lookup for audit rendering and eval reporting. */
export const ruleById = (id: string): TriageRule | undefined => TRIAGE_RULES.find((r) => r.id === id);

/** Rules a clinician has signed off. Gating suites use only these. */
export const reviewedRules = (): TriageRule[] => TRIAGE_RULES.filter((r) => r.reviewedBy !== null);
