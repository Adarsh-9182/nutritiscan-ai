// ============================================================
// DETERMINISTIC CLINICAL EXTRACTION
//
// Turns a patient's turn into the structured findings the triage engine
// reasons over. No model call — deliberately.
//
// docs/SAFETY.md §2.1: "Deterministic core. Rules over the structured
// ClinicalState. No model call in the decision path." A rule engine whose
// *input* is produced by a model still has a model in its decision path:
// if extraction hallucinates, times out, or is rate-limited, the red-flag
// layer silently stops working. So the safety-critical path is phrase
// matching over the raw text, which cannot fail open.
//
// Model-based extraction (ORCHESTRATION.md §4) is additive on top of this,
// and — like the model red-flag classifier — may only ever ESCALATE.
//
// WHAT THIS IS NOT: this is not NLP research and it does not claim
// clinical validity. It is a conservative phrase matcher, and every
// design choice below resolves ambiguity in the direction of firing
// rather than staying silent. See §"Suppression" for the two cases where
// it stays silent, and why those two only.
// ============================================================

import type { HealthProfile } from "../memory/profile";
import {
  emptyState,
  type ClinicalState,
  type Finding,
  type Qualifiers,
  type RiskFactor,
  type SuppressedFinding,
} from "./state";

// ------------------------------------------------------------
// Normalization
// ------------------------------------------------------------

/**
 * Contractions are expanded BEFORE matching so that negation detection sees
 * a standalone "not". Order matters: "won't"/"can't" must be handled before
 * the general `n't` rule, which would otherwise produce "wo not"/"ca not".
 */
const CONTRACTIONS: [RegExp, string][] = [
  [/\bwon['’]t\b/g, "will not"],
  [/\bcan['’]t\b/g, "can not"],
  [/\bshan['’]t\b/g, "shall not"],
  [/n['’]t\b/g, " not"],
  [/['’]ve\b/g, " have"],
  [/['’]m\b/g, " am"],
  [/['’]re\b/g, " are"],
  [/['’]ll\b/g, " will"],
];

/** Unapostrophised spellings people actually type. Whole words only. */
const MISSPELLINGS: [RegExp, string][] = [
  [/\bcant\b/g, "can not"],
  [/\bwont\b/g, "will not"],
  [/\bdont\b/g, "do not"],
  [/\bdidnt\b/g, "did not"],
  [/\bdoesnt\b/g, "does not"],
  [/\bisnt\b/g, "is not"],
  [/\bwasnt\b/g, "was not"],
  [/\bhavent\b/g, "have not"],
  [/\bhasnt\b/g, "has not"],
  [/\bcouldnt\b/g, "could not"],
  [/\bwouldnt\b/g, "would not"],
  [/\bshouldnt\b/g, "should not"],
];

export function normalize(raw: string): string {
  let t = raw.toLowerCase().normalize("NFKC");
  for (const [re, to] of CONTRACTIONS) t = t.replace(re, to);
  for (const [re, to] of MISSPELLINGS) t = t.replace(re, to);
  return t.replace(/\s+/g, " ").trim();
}

// ------------------------------------------------------------
// Concept lexicon
// ------------------------------------------------------------

type ConceptSpec = { id: string; label: string; patterns: string[] };

/**
 * Phrases, not single words. "chest" alone matches "chest of drawers";
 * "fit" matches "fit and healthy". Every entry here is a phrase a patient
 * would plausibly type about themselves.
 *
 * Bounded wildcards (`.{0,20}`) only — an unbounded `.*` between two
 * alternations is a backtracking hazard on adversarial input, and this
 * runs on every chat turn.
 */
const CONCEPTS: ConceptSpec[] = [
  // ---------- Cardiac ----------
  {
    id: "chest-pain",
    label: "Chest pain or pressure",
    patterns: [
      "chest pain", "pain in (my|the) chest", "chest hurts", "chest is hurting",
      "chest discomfort", "chest tightness", "tight(ness)? in my chest", "tight chest",
      "pressure (in|on) my chest", "chest pressure", "heavy chest", "heaviness in my chest",
      "weight on my chest", "elephant (sitting )?on my chest", "band around my chest",
    ],
  },
  {
    id: "radiation-arm-jaw",
    label: "Pain radiating to arm, jaw, neck or back",
    patterns: [
      "(radiat|spread|shoot|going|travel)\\w*.{0,20}(arm|jaw|shoulder|neck|back)",
      "down my (left|right) arm", "into my jaw", "pain in my jaw", "jaw (pain|ache)",
      "arm (feels )?(heavy|numb|tingl)",
    ],
  },
  {
    id: "diaphoresis",
    label: "Cold sweat",
    // Bare "sweating" is included even though it also fires on exercise.
    // Diaphoresis only matters here in combination (chest pain + sweating),
    // and "chest pain and I'm sweating" is exactly how people type the
    // pairing that must not be missed. Over-firing is the safe direction.
    patterns: ["cold sweat", "clammy", "sweat(ing|y)", "drenched in sweat", "breaking out in a sweat"],
  },
  {
    id: "palpitations",
    label: "Palpitations",
    patterns: ["palpitation", "heart.{0,14}(racing|pounding|hammering|skipping)", "irregular heart ?beat"],
  },

  // ---------- Respiratory ----------
  {
    id: "dyspnea",
    label: "Breathlessness",
    patterns: [
      "short(ness)? of breath", "can not breath", "cannot breath", "trouble breathing",
      "difficulty breathing", "struggling to breath", "hard to breath", "breathless",
      "gasping for (air|breath)", "out of breath", "wheez",
    ],
  },
  {
    id: "dyspnea-at-rest",
    label: "Breathless at rest or unable to speak in sentences",
    patterns: [
      "breathless (at rest|just sitting|doing nothing)",
      "can not (breath\\w*|catch my breath) (lying|sitting|at rest)",
      "can not (finish|complete) a sentence", "can only (say|manage) a few words",
      "too breathless to (talk|speak)",
    ],
  },
  {
    id: "cyanosis",
    label: "Blue lips or extremities",
    patterns: ["lips (are|look|have gone) blue", "blue lips", "turning blue", "(fingers|nails).{0,10}blue"],
  },

  // ---------- Neurological ----------
  {
    id: "facial-droop",
    label: "Facial droop",
    patterns: ["fac(e|ial).{0,15}droop", "face (has )?(dropped|fallen)", "one side of (my|his|her|their) face", "mouth (is )?droop", "smile is crooked"],
  },
  {
    id: "unilateral-weakness",
    label: "One-sided weakness or numbness",
    patterns: [
      "weak(ness)? (on|down) (one|my left|my right) side", "(left|right) side (is|feels|went) (weak|numb|dead)",
      "can not (move|lift|feel) my (left|right) (arm|leg|hand|side)",
      "arm (went|has gone) (limp|dead|numb)", "one side.{0,15}numb",
    ],
  },
  {
    id: "slurred-speech",
    label: "Speech disturbance",
    patterns: [
      "slur\\w*.{0,10}speech", "speech (is|has become|sounds) slurred", "words are (coming out wrong|jumbled)",
      "can not (speak|talk) properly", "can not get my words out", "trouble (speaking|finding words)",
    ],
  },
  {
    id: "thunderclap-headache",
    label: "Sudden severe headache",
    patterns: [
      "worst headache", "worst.{0,15}headache", "thunderclap", "headache.{0,20}(hit|came on).{0,20}(sudden|like a)",
      "(sudden|instant)\\w*.{0,15}(severe|blinding|explosive) headache", "head feels like it (exploded|burst)",
    ],
  },
  {
    id: "seizure",
    label: "Seizure",
    patterns: ["seizure", "convuls", "had a fit", "having a fit", "shaking uncontrollably and (passed out|unresponsive)"],
  },
  {
    id: "loss-of-consciousness",
    label: "Loss of consciousness",
    patterns: [
      "passed out", "blacked out", "lost consciousness", "fainted", "unresponsive",
      "(would|will) not wake up", "can not wake (him|her|them|up)", "collapsed",
    ],
  },
  {
    id: "acute-confusion",
    label: "New confusion or altered awareness",
    patterns: [
      "suddenly confused", "(is |am |seems )?(very )?confused", "not making (any )?sense",
      "disorient", "does not know (where|what day)", "acting strange(ly)?", "drowsy and (confused|unresponsive)",
    ],
  },
  {
    id: "vision-loss",
    label: "Sudden vision loss",
    patterns: ["lost (my|his|her) (vision|sight)", "vision (went|has gone) (black|dark)", "can not see (out of|anything)", "sudden.{0,15}vision loss", "curtain over my (eye|vision)"],
  },

  // ---------- Anaphylaxis ----------
  {
    id: "airway-swelling",
    label: "Airway swelling",
    patterns: [
      "throat.{0,20}(clos|swell|tight|constrict)", "tongue.{0,20}swell", "lips.{0,20}swell",
      "face.{0,20}swell", "can not swallow", "difficulty swallowing", "throat feels like it is closing",
    ],
  },
  {
    id: "allergic-reaction",
    label: "Allergic reaction",
    patterns: ["allergic reaction", "anaphyla", "hives", "urticaria", "rash (all over|everywhere)", "covered in (a rash|welts)", "(bee|wasp) sting"],
  },

  // ---------- Haemorrhage ----------
  {
    id: "severe-bleeding",
    label: "Uncontrolled bleeding",
    patterns: [
      "bleeding (heavily|badly|a lot)", "(will|would) not stop bleeding", "can not stop the bleeding",
      "losing a lot of blood", "soaked through", "gushing blood", "pouring blood",
    ],
  },
  {
    id: "haematemesis",
    label: "Vomiting blood",
    patterns: ["vomit\\w*.{0,15}blood", "throw\\w*.{0,10}up blood", "blood in my vomit", "coffee ground"],
  },
  {
    id: "melaena",
    label: "Blood in stool or black stools",
    patterns: ["black.{0,10}(stool|poo|motion)", "tarry stool", "blood in (my )?(stool|poo|motion)", "rectal bleeding", "bleeding from my (back passage|bottom|rectum)", "blood in the toilet"],
  },
  {
    id: "haemoptysis",
    label: "Coughing up blood",
    patterns: ["cough\\w*.{0,15}up blood", "blood when i cough", "blood in my (sputum|phlegm)"],
  },

  // ---------- Mental health ----------
  {
    id: "suicidal-ideation",
    label: "Suicidal ideation or self-harm",
    patterns: [
      "kill myself", "killing myself", "end my life", "ending my life", "take my own life",
      "want to die", "wish i (was|were) dead", "better off (dead|without me)", "no reason to (live|go on)",
      "suicidal", "suicide", "end it all", "not want to be here (any ?more)?",
      "(harm|hurt) myself", "self.?harm", "cutting myself",
    ],
  },

  // ---------- Obstetric ----------
  {
    id: "pregnancy",
    label: "Pregnancy",
    patterns: ["pregnant", "pregnancy", "\\d+ weeks (pregnant|gone)", "expecting a baby"],
  },
  {
    id: "vaginal-bleeding",
    label: "Vaginal bleeding",
    patterns: ["vaginal bleeding", "bleeding (down there|from my vagina)", "spotting heavily", "heavy bleeding.{0,20}pregnan"],
  },
  {
    id: "reduced-fetal-movement",
    label: "Reduced fetal movement",
    patterns: ["baby.{0,20}(not|stopped) mov", "no fetal movement", "have not felt the baby"],
  },

  // ---------- Abdominal ----------
  {
    id: "abdominal-pain",
    label: "Abdominal pain",
    patterns: [
      "stomach (pain|ache|hurts|is hurting)", "abdominal pain", "abdomen hurts",
      "belly (pain|hurts)", "tummy (pain|ache|hurts)", "pain in my (stomach|abdomen|belly|tummy|gut)",
      "cramp\\w*.{0,15}(stomach|abdomen|belly|tummy)", "gut pain",
    ],
  },
  {
    id: "rlq-pain",
    label: "Right lower quadrant pain",
    patterns: ["(lower|bottom) right", "right (lower|bottom)", "right (iliac|side).{0,20}(pain|hurt)", "moved to the right"],
  },
  {
    id: "peritonism",
    label: "Rigid or guarded abdomen",
    patterns: ["(stomach|abdomen|belly) is (rigid|hard|board)", "board.?like", "can not (touch|press) my (stomach|abdomen|belly)", "hurts (more )?when i (let go|release)", "guarding"],
  },
  {
    id: "testicular-pain",
    label: "Testicular pain",
    patterns: ["testic", "(pain|swelling) in my (groin|scrotum)", "scrotum"],
  },

  // ---------- Infection ----------
  {
    id: "fever",
    label: "Fever",
    patterns: ["fever", "feverish", "burning up", "(high |raised )?temperature (of|is|at)", "\\d{2,3}\\s*(°|deg)"],
  },
  {
    id: "rigors",
    label: "Rigors",
    patterns: ["shivering uncontrollably", "shaking chills", "rigors", "teeth (are )?chattering", "can not stop shivering"],
  },
  {
    id: "non-blanching-rash",
    label: "Non-blanching rash",
    patterns: ["rash.{0,25}(does not fade|will not fade|not fade)", "rash.{0,25}glass", "non.?blanch", "purple (spots|blotches)", "petechia", "purpura"],
  },
  {
    id: "neck-stiffness",
    label: "Neck stiffness",
    patterns: ["stiff neck", "neck is stiff", "can not (move|bend) my neck", "can not put my chin"],
  },
  {
    id: "photophobia",
    label: "Photophobia",
    patterns: ["light hurts my eyes", "sensitive to light", "photophobia", "can not stand the light"],
  },

  // ---------- Poisoning ----------
  {
    id: "poisoning",
    label: "Poisoning or overdose",
    patterns: [
      "overdose", "took too many", "swallow\\w*.{0,20}(pills|tablets|bleach|chemical)",
      "took (a )?(whole|entire) (bottle|packet|strip)", "poisoned", "drank.{0,15}(bleach|chemical|detergent)",
    ],
  },

  // ---------- Dehydration ----------
  {
    id: "no-urine-output",
    label: "No urine output",
    patterns: ["not (passed|passing) urine", "have not (peed|urinated)", "no wet nappies", "no urine", "not been to the toilet in"],
  },
  {
    id: "cannot-keep-fluids",
    label: "Unable to keep fluids down",
    patterns: ["can not keep (anything|fluids|water) down", "not keeping (fluids|anything) down", "vomit\\w*.{0,20}everything"],
  },
];

// Compiled once. Each concept keeps a single alternation regex.
const COMPILED = CONCEPTS.map((c) => ({
  id: c.id,
  label: c.label,
  re: new RegExp(`(?:${c.patterns.join("|")})`, "g"),
}));

// ------------------------------------------------------------
// Suppression
//
// Only TWO things stop a matched concept becoming a finding. Both are
// cases where the phrase is demonstrably not about this patient's current
// state, and both are detected conservatively — when in doubt, the finding
// stands. `docs/SAFETY.md §2.5`: never treat missing information as
// absence, and never de-escalate on reassuring wording.
// ------------------------------------------------------------

const NEGATIONS = new Set(["no", "not", "never", "without", "denies", "denied", "deny", "negative", "nil", "none"]);

/**
 * Explicit relation nouns only. Bare pronouns ("he", "she", "they") are
 * deliberately EXCLUDED: they are ambiguous, and a wrong third-party call
 * suppresses a real red flag. Over-firing is the safe direction here.
 */
const PERSONS = new Set([
  "friend", "mother", "father", "mom", "mum", "mummy", "dad", "daddy", "wife", "husband",
  "son", "daughter", "brother", "sister", "colleague", "neighbour", "neighbor",
  "uncle", "aunt", "grandmother", "grandfather", "grandma", "grandpa", "granny",
  "cousin", "partner", "boss", "boyfriend", "girlfriend", "roommate", "flatmate",
]);

/** Tokens that end a backward scan: the negation before them governs a different clause. */
const CLAUSE_BREAKS = new Set(["and", "but", "however", "though", "although", "while", "then", "so", ",", ";", ".", ":", "-", "—"]);

const NEGATION_WINDOW = 4;
const PERSON_WINDOW = 6;

type Tok = { t: string; i: number };

function tokenize(s: string): Tok[] {
  const out: Tok[] = [];
  const re = /[a-z0-9]+|[.,;:—-]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) out.push({ t: m[0], i: m.index });
  return out;
}

/** Tokens immediately preceding `index`, nearest first, stopping at a clause break. */
function backwardWindow(tokens: Tok[], index: number, size: number): string[] {
  const out: string[] = [];
  for (let i = tokens.length - 1; i >= 0 && out.length < size; i--) {
    if (tokens[i].i >= index) continue;
    if (CLAUSE_BREAKS.has(tokens[i].t)) break;
    out.push(tokens[i].t);
  }
  return out;
}

function isNegated(tokens: Tok[], index: number): boolean {
  return backwardWindow(tokens, index, NEGATION_WINDOW).some((t) => NEGATIONS.has(t));
}

/**
 * "my father has chest pain" → third party.
 * "my father said I have chest pain" → NOT third party: a first-person
 * pronoun sits between the relation noun and the symptom, so the patient
 * is the subject.
 */
function isThirdParty(tokens: Tok[], index: number): boolean {
  const window = backwardWindow(tokens, index, PERSON_WINDOW);
  const personAt = window.findIndex((t) => PERSONS.has(t));
  if (personAt === -1) return false;
  const nearer = window.slice(0, personAt);
  return !nearer.some((t) => t === "i" || t === "me" || t === "my" || t === "mine");
}

// ------------------------------------------------------------
// Qualifiers
// ------------------------------------------------------------

const SEVERITY = /\b(severe|severely|worst|excruciating|unbearable|agonising|agonizing|crushing|intense|extreme|terrible|awful|10\s*\/\s*10|9\s*\/\s*10|blinding)\b/;
const SUDDEN = /\b(sudden|suddenly|abrupt|abruptly|out of nowhere|all at once|came on fast|instantly)\b/;

/** Backward phrases that frame a mention as past history. */
const HISTORY_BEFORE = /\b(history of|used to|previously|in the past|years back)\s*$/;
/**
 * Forward markers. Deliberately narrow: "last week" is excluded because
 * "since last week" describes something ONGOING, and misreading that as
 * resolved history would silently suppress a live red flag.
 */
const HISTORY_AFTER = /^\s*(\w+\s+){0,3}(ago\b|as a child\b|when i was\b|back in\b|in (19|20)\d{2}\b)/;
/** "since"/"for" mark a symptom that started then and continues. */
const ONGOING_BEFORE = /\b(since|for the (past|last))\s*$/;

const WINDOW_CHARS = 45;

function qualify(text: string, start: number, end: number): Qualifiers {
  const before = text.slice(Math.max(0, start - WINDOW_CHARS), start);
  const after = text.slice(end, end + WINDOW_CHARS);
  const around = before + text.slice(start, end) + after;

  const historical = !ONGOING_BEFORE.test(before) && (HISTORY_BEFORE.test(before) || HISTORY_AFTER.test(after));

  return {
    historical,
    severe: SEVERITY.test(around),
    sudden: SUDDEN.test(around),
  };
}

// ------------------------------------------------------------
// Risk factors from the recorded profile
// ------------------------------------------------------------

const CONDITION_RISKS: [RegExp, string, string][] = [
  [/diabet/i, "diabetes", "Diabetes"],
  [/hypertension|high blood pressure/i, "hypertension", "Hypertension"],
  [/heart|cardiac|angina|infarct/i, "cardiac-history", "Cardiac history"],
  [/asthma/i, "asthma", "Asthma"],
  [/copd|emphysema/i, "copd", "COPD"],
  [/kidney|renal/i, "renal", "Kidney disease"],
  [/liver|hepatic|cirrhosis/i, "hepatic", "Liver disease"],
  [/cancer|malignan|chemo|lymphoma|leukaemia|leukemia|myeloma|carcinoma|sarcoma|tumou?r/i, "malignancy", "Malignancy"],
  [/immunosupp|hiv|transplant/i, "immunosuppression", "Immunosuppression"],
  [/clot|thrombo|embol/i, "thromboembolic", "Thromboembolic history"],
];

const MEDICINE_RISKS: [RegExp, string, string][] = [
  [/warfarin|apixaban|rivaroxaban|dabigatran|heparin|blood thinner|anticoagul/i, "anticoagulated", "On an anticoagulant"],
  [/steroid|prednis/i, "steroids", "On corticosteroids"],
  [/insulin/i, "insulin", "On insulin"],
];

function profileRisks(p: HealthProfile): RiskFactor[] {
  const out: RiskFactor[] = [];
  const add = (id: string, label: string) => {
    if (!out.some((r) => r.id === id)) out.push({ id, label, source: "profile_recorded" });
  };

  // Age bands only where a rule actually uses them. `age` is optional and
  // absent must stay absent — see HealthProfile's comment on why.
  if (typeof p.age === "number") {
    if (p.age >= 65) add("age-65-plus", "Aged 65 or over");
    if (p.age <= 2) add("age-infant", "Infant or toddler");
  }

  for (const c of p.conditions) {
    for (const [re, id, label] of CONDITION_RISKS) if (re.test(c)) add(id, label);
  }
  for (const m of p.medicines) {
    for (const [re, id, label] of MEDICINE_RISKS) if (re.test(m)) add(id, label);
  }
  return out;
}

// ------------------------------------------------------------
// Entry point
// ------------------------------------------------------------

/** Hard cap so a pathological input cannot turn matching into a DoS. */
const MAX_TEXT = 8_000;

export function extractFindings(text: string): { findings: Finding[]; suppressed: SuppressedFinding[] } {
  const norm = normalize(text).slice(0, MAX_TEXT);
  const tokens = tokenize(norm);

  const findings: Finding[] = [];
  const suppressed: SuppressedFinding[] = [];

  for (const c of COMPILED) {
    c.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    let seen = false;

    while ((m = c.re.exec(norm))) {
      // One finding per concept — the first unsuppressed mention. Repetition
      // is emphasis, not additional clinical information.
      if (seen) break;
      if (m[0].length === 0) {
        c.re.lastIndex++;
        continue;
      }

      const start = m.index;
      const end = start + m[0].length;
      const base: Finding = {
        conceptId: c.id,
        label: c.label,
        span: m[0],
        index: start,
        qualifiers: qualify(norm, start, end),
      };

      if (isNegated(tokens, start)) {
        suppressed.push({ ...base, reason: "negated" });
        continue;
      }
      if (isThirdParty(tokens, start)) {
        suppressed.push({ ...base, reason: "third_party" });
        continue;
      }

      findings.push(base);
      seen = true;
    }
  }

  return { findings, suppressed };
}

/**
 * Build the state triage reasons over.
 *
 * `text` is the patient's latest turn only. Earlier turns are deliberately
 * not concatenated: a red flag mentioned three turns ago and since resolved
 * should not re-fire on every subsequent message. Carrying findings forward
 * across a consultation is a Phase 2 concern that needs the persisted
 * consultation record to do correctly.
 */
export function buildClinicalState(input: {
  text: string;
  profile: HealthProfile;
  consultationId: string;
  turn: number;
}): ClinicalState {
  const state = emptyState(input.consultationId, input.turn, input.text);
  const { findings, suppressed } = extractFindings(input.text);

  const risks = profileRisks(input.profile);
  // Pregnancy stated in the turn itself is a risk factor as well as a finding.
  if (findings.some((f) => f.conceptId === "pregnancy") && !risks.some((r) => r.id === "pregnant")) {
    risks.push({ id: "pregnant", label: "Pregnant", source: "patient_reported" });
  }

  return {
    ...state,
    findings,
    suppressed,
    // An explicit denial is a finding in its own right — see ClinicalState.negatives.
    negatives: suppressed.filter((s) => s.reason === "negated").map((s) => s.conceptId),
    riskFactors: risks,
    chiefComplaint: findings[0]?.label ?? null,
  };
}
