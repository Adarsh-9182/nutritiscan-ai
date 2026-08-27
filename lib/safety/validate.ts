// ============================================================
// OUTPUT VALIDATION — SAFETY LAYERS 3–6
//
// Triage made the INPUT side deterministic: a rule, not a prompt, decides
// whether a turn may proceed. This file does the same job on the way out.
//
// Until now the model's answer went straight to the browser
// (app/api/chat/route.ts) and MEDICAL_REASONING_FORMAT — declared in
// lib/agents/safety.ts as "a hard requirement, not a style preference" —
// was enforced by nothing at all. A model that dropped the Medical Warning
// section produced no error, no log, and a user reading medical reasoning
// with the safety half missing.
//
// Same three properties as triage, for the same reasons:
//
//   1. DETERMINISTIC. No model call. Same answer in, same verdict out,
//      which is what makes it testable.
//   2. FAIL CLOSED. A validator that throws does not wave the answer
//      through; it withholds it.
//   3. TRIAGE WINS. Where the answer contradicts the triage verdict, the
//      verdict stands. A fluent paragraph never outranks a fired rule.
//
// What this file does NOT do: judge whether the clinical reasoning is
// correct. It checks that the answer is SHAPED safely and does not
// contradict what the safety layer already established. Correctness is
// what the evidence layer and the eval suites are for.
// ============================================================

import type { ClinicalState, TriageVerdict } from "../clinical/state";

/** Ordered by how bad it is to show the user the answer anyway. */
export type Severity = "block" | "repair" | "note";

export type Violation = {
  /** Stable id so an eval can assert exactly which check fired. */
  id: string;
  severity: Severity;
  detail: string;
};

export type ValidationResult = {
  ok: boolean;
  /** True when the answer must not be shown as written. */
  blocked: boolean;
  violations: Violation[];
  /** Set when a validator itself failed. The answer is withheld regardless. */
  failedClosed: boolean;
};

// ------------------------------------------------------------
// The contract
// ------------------------------------------------------------

/**
 * Sections MEDICAL_REASONING_FORMAT requires, in order.
 *
 * Matched on the bold heading the prompt asks for rather than the bare word,
 * so the noun appearing in a sentence ("the facts suggest…") is not mistaken
 * for the section itself.
 */
const REQUIRED_SECTIONS = [
  "Facts",
  "Inference",
  "Recommendation",
  "Medical Warning",
  "Confidence",
] as const;

const sectionPattern = (name: string) =>
  new RegExp(`(^|\\n)\\s*(\\*\\*|##+\\s*)?${name.replace(" ", "\\s+")}\\s*(\\*\\*)?\\s*(—|-|–|:)`, "i");

export function missingSections(answer: string): string[] {
  return REQUIRED_SECTIONS.filter((s) => !sectionPattern(s).test(answer));
}

// ------------------------------------------------------------
// Overreach
// ------------------------------------------------------------

/**
 * Language the product is not allowed to use.
 *
 * Deliberately narrow. A broad "sounds too confident" filter would fire on
 * ordinary sentences and train everyone to ignore it — the same reason
 * triage does not cry emergency on every crash. These are phrasings that
 * cross a line the prompt already draws: a verdict stated as fact, or a
 * prescribing instruction.
 */
const OVERREACH: { id: string; re: RegExp; detail: string }[] = [
  {
    id: "output.diagnostic-verdict",
    re: /\b(you (definitely |certainly |clearly )?have|you are suffering from|this is definitely|you've got)\b/i,
    detail: "States a diagnosis as fact. The contract allows possibilities, never verdicts.",
  },
  {
    id: "output.prescribing",
    re: /\b(take|start|increase|double)\s+\d+\s*(mg|mcg|ml|g|iu)\b/i,
    detail: "Gives a medicine dose. The product must never prescribe.",
  },
  {
    id: "output.prescription-named",
    re: /\b(i (recommend|suggest) (you )?(take|start))\b.{0,40}\b(mg|mcg|tablet|capsule|antibiotic)\b/i,
    detail: "Recommends a prescription medicine.",
  },
];

// ------------------------------------------------------------
// Contradiction
// ------------------------------------------------------------

/**
 * Reassurance that must not appear once triage has escalated.
 *
 * This is the check that matters most. Everything above is about shape; this
 * one is about the model overruling the safety layer — telling someone whose
 * chest pain fired a cardiac rule that it is "nothing to worry about".
 */
const REASSURANCE =
  /\b(nothing to worry about|no need to (worry|see a doctor|seek)|not (a )?(serious|urgent|emergency)|should (resolve|settle|clear up) on its own|no cause for concern|perfectly (normal|fine))\b/i;

const ESCALATED: TriageVerdict[] = ["emergency", "urgent"];

// ------------------------------------------------------------
// The validator
// ------------------------------------------------------------

/**
 * Whether a turn's answer needs the full contract at all.
 *
 * A question about protein targets is not clinical reasoning, and demanding
 * a Medical Warning section on it would be noise — which is how a safety
 * check gets switched off. Findings or an escalated verdict make it
 * clinical; nothing else does.
 */
export function isClinicalTurn(state: ClinicalState): boolean {
  return state.findings.length > 0 || ESCALATED.includes(state.triage.verdict);
}

export function validateAnswer(answer: string, state: ClinicalState): ValidationResult {
  try {
    const violations: Violation[] = [];
    const clinical = isClinicalTurn(state);

    if (!answer.trim()) {
      return {
        ok: false,
        blocked: true,
        violations: [{ id: "output.empty", severity: "block", detail: "The model produced no answer." }],
        failedClosed: false,
      };
    }

    // Shape is only required where the contract applies. An answer that asks
    // clarifying questions instead is explicitly allowed by the prompt, so a
    // short question-only reply is not a missing-section violation.
    if (clinical && !looksLikeQuestionsOnly(answer)) {
      for (const s of missingSections(answer)) {
        violations.push({
          id: `output.missing-section.${s.toLowerCase().replace(/\s+/g, "-")}`,
          // A missing Medical Warning is the one that hurts someone, so it
          // blocks. The rest are repairable by appending a safe closing.
          severity: s === "Medical Warning" ? "block" : "repair",
          detail: `Required section "${s}" is absent.`,
        });
      }
    }

    for (const o of OVERREACH) {
      if (o.re.test(answer)) {
        violations.push({ id: o.id, severity: "block", detail: o.detail });
      }
    }

    if (ESCALATED.includes(state.triage.verdict) && REASSURANCE.test(answer)) {
      violations.push({
        id: "output.contradicts-triage",
        severity: "block",
        detail: `Answer reassures the patient while triage returned "${state.triage.verdict}". The verdict stands.`,
      });
    }

    const blocked = violations.some((v) => v.severity === "block");
    return { ok: violations.length === 0, blocked, violations, failedClosed: false };
  } catch (err) {
    // A validator that crashed has not passed the answer — it has failed to
    // examine it. Withhold, and make the failure loud.
    console.error("[validate] threw; withholding the answer", err);
    return {
      ok: false,
      blocked: true,
      violations: [{ id: "output.validator-failed", severity: "block", detail: "Validation could not run." }],
      failedClosed: true,
    };
  }
}

/**
 * The prompt permits skipping the structure to ask up to three clarifying
 * questions. Recognised so that path is not punished for having no sections.
 */
function looksLikeQuestionsOnly(answer: string): boolean {
  const marks = (answer.match(/\?/g) ?? []).length;
  return marks >= 1 && answer.length < 700 && missingSections(answer).length >= 4;
}

/**
 * What to show when an answer is withheld.
 *
 * Never an error screen: the person asked a health question and deserves a
 * usable reply. Never the model's text either, since that is what failed.
 */
export function withheldResponse(state: ClinicalState): string {
  const urgent = ESCALATED.includes(state.triage.verdict);
  return [
    "I'm not able to give you a reliable answer on this one.",
    "",
    urgent
      ? "Based on what you've described, please arrange to be seen by a clinician today. If anything worsens suddenly, treat it as an emergency."
      : "Nothing you've described looks urgent, but I couldn't produce an answer I'd stand behind — so I'd rather say that than guess.",
    "",
    "Please try rephrasing, or bring this to a doctor.",
  ].join("\n");
}
