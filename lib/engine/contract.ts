// ============================================================
// NUTRITISCAN ENGINE · STAGE CONTRACT
//
// The three clinical stages return structured objects rather than
// prose. That is the whole point of the pipeline: a validator can
// inspect `urgency === "emergency"` or read the treatment list item
// by item, but it can only regex a paragraph and hope.
//
// Prose is composed once, at the end, from data that has already
// been checked — never checked after it has been written.
// ============================================================

import { z } from "zod";

/**
 * How fast this person needs a human, decided before anything else runs.
 *
 * Ordered most- to least-severe; `URGENCY_RANK` below depends on that order.
 */
export const Urgency = z.enum(["emergency", "urgent", "routine", "self-care"]);
export type Urgency = z.infer<typeof Urgency>;

export const URGENCY_RANK: Record<Urgency, number> = {
  emergency: 0,
  urgent: 1,
  routine: 2,
  "self-care": 3,
};

/**
 * Stage 1 — Triage.
 *
 * Runs first and can end the pipeline on its own. An emergency answer
 * must not wait behind two more model calls, and must never be diluted
 * by a differential or a self-care list.
 */
export const TriageResult = z.object({
  urgency: Urgency,
  /** Verbatim-ish red flags found in what the user described. Empty when none. */
  redFlags: z.array(z.string()).max(6),
  /** One line, in the user's own terms, of what they came in with. */
  presentingProblem: z.string(),
  /** Facts stated by the user or present in their Health Memory. Never inferred. */
  facts: z.array(z.string()).max(8),
  /** Up to 3 questions worth asking before reasoning any further. */
  missingInfo: z.array(z.string()).max(3),
  /**
   * False when the description is too thin to reason from. The engine then
   * asks `missingInfo` instead of manufacturing a differential — the failure
   * mode this guards against is a confident answer built on nothing.
   */
  enoughToProceed: z.boolean(),
});
export type TriageResult = z.infer<typeof TriageResult>;

/**
 * Stage 2 — Diagnosis.
 *
 * Deliberately named `possibilities`, not `diagnosis`. The field name is a
 * design constraint: a model filling in `possibilities` writes differently
 * from one filling in `diagnosis`, and the UI can never accidentally render
 * a verdict from a field that does not contain one.
 */
export const DiagnosisResult = z.object({
  possibilities: z
    .array(
      z.object({
        condition: z.string(),
        /** Why this pattern of facts could point here. */
        reasoning: z.string(),
        likelihood: z.enum(["likely", "possible", "unlikely"]),
      }),
    )
    .min(1)
    .max(4),
  /** What would distinguish between the possibilities above. */
  distinguishers: z.array(z.string()).max(4),
  confidence: z.enum(["known", "likely", "possible", "unknown"]),
  confidencePct: z.number().min(0).max(100),
  /** One line: data volume, symptom specificity, single reading vs. a trend. */
  confidenceReason: z.string(),
});
export type DiagnosisResult = z.infer<typeof DiagnosisResult>;

/**
 * Stage 3 — Treatment.
 *
 * `selfCare` is the only field that may contain actions. Prescription
 * decisions live in `questionsForClinician` by construction — there is
 * nowhere in this shape to put "start drug X at dose Y".
 */
export const TreatmentResult = z.object({
  selfCare: z.array(z.string()).max(6),
  whenToSeeClinician: z.array(z.string()).max(5),
  questionsForClinician: z.array(z.string()).max(5),
  /** What to watch for that would change the urgency. Never empty. */
  watchFor: z.array(z.string()).min(1).max(5),
});
export type TreatmentResult = z.infer<typeof TreatmentResult>;

/** Everything the engine produced, before composition into prose. */
export type EngineResult = {
  triage: TriageResult;
  diagnosis: DiagnosisResult | null;
  treatment: TreatmentResult | null;
  /** Violations the safety gate found and neutralised. */
  violations: string[];
  /** Why the pipeline stopped where it did. */
  stoppedAt: "emergency" | "needs-info" | "complete";
};
