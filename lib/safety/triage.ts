// ============================================================
// TRIAGE ENGINE — SAFETY LAYER 2
//
// Runs after deterministic extraction and BEFORE evidence retrieval and
// clinical reasoning. It is the only component in this system with the
// authority to end a turn. See docs/SAFETY.md §2.
//
// Three properties this file is responsible for, all of them testable:
//
//   1. DETERMINISTIC. No model call anywhere in this path.
//   2. FAIL CLOSED. If anything throws — a bad rule, malformed state,
//      an extractor crash — the verdict is `urgent`, never `routine`.
//      An unavailable safety layer is not a passing safety layer.
//   3. ESCALATE ONLY. A model may add suspicion. Nothing, including a
//      model, a specialist or a prompt, can lower a rule-derived verdict.
// ============================================================

import { buildClinicalState } from "../clinical/extract";
import {
  moreSevere,
  withTriage,
  type ClinicalState,
  type TriageOutcome,
  type TriageVerdict,
} from "../clinical/state";
import type { HealthProfile } from "../memory/profile";
import { TRIAGE_RULES } from "./rules";

/**
 * Evaluate every rule against the state.
 *
 * Rules are evaluated individually inside try/catch rather than the whole
 * loop being wrapped: a single buggy predicate must not prevent the
 * remaining rules from firing. A throwing rule floors the verdict at
 * `urgent` and sets `failedClosed`, so the failure is loud in the audit
 * record instead of being silently skipped.
 */
export function runTriage(state: ClinicalState): TriageOutcome {
  const firedRules: string[] = [];
  let failedClosed = false;
  let channel: TriageOutcome["channel"];

  // No findings at all means nothing clinical was said — a nutrition or app
  // question. Findings with no rule match are `routine`, not `self_care`:
  // the patient described a symptom and we simply have no rule for it.
  let verdict: TriageVerdict = state.findings.length > 0 ? "routine" : "self_care";

  for (const rule of TRIAGE_RULES) {
    let hit = false;
    try {
      hit = rule.matches(state);
    } catch (err) {
      console.error(`[triage] rule ${rule.id} threw; failing closed`, err);
      failedClosed = true;
      verdict = moreSevere(verdict, "urgent");
      continue;
    }
    if (!hit) continue;

    firedRules.push(rule.id);
    verdict = moreSevere(verdict, rule.verdict);
    if (rule.channel === "mental_health") channel = "mental_health";
  }

  return { verdict, firedRules, modelSuspicion: [], failedClosed, channel };
}

/**
 * The fail-closed default, used when triage could not run at all.
 *
 * `urgent` rather than `emergency`: an infrastructure failure is not
 * evidence of an emergency, and crying emergency on every crash would train
 * users to ignore the one that matters. `urgent` still routes the turn
 * through the escalation framing and is recorded as a failure.
 */
const FAILED_CLOSED: TriageOutcome = {
  verdict: "urgent",
  firedRules: [],
  modelSuspicion: [],
  failedClosed: true,
};

/**
 * Build clinical state from a patient turn and triage it.
 *
 * This is the entry point API routes use. The outer try/catch covers
 * extraction as well as rule evaluation — if the extractor throws, we still
 * must not proceed as though nothing was found.
 */
export function assessTurn(input: {
  text: string;
  profile: HealthProfile;
  consultationId: string;
  turn: number;
}): ClinicalState {
  try {
    const state = buildClinicalState(input);
    return withTriage(state, runTriage(state));
  } catch (err) {
    console.error("[triage] assessment failed; failing closed to urgent", err);
    const bare = buildBareState(input);
    return withTriage(bare, FAILED_CLOSED);
  }
}

/** Minimal state when extraction itself failed. Never used on the happy path. */
function buildBareState(input: { text: string; consultationId: string; turn: number }): ClinicalState {
  return {
    consultationId: input.consultationId,
    turn: input.turn,
    text: input.text,
    chiefComplaint: null,
    findings: [],
    suppressed: [],
    negatives: [],
    riskFactors: [],
    triage: FAILED_CLOSED,
    evidence: [],
    differential: [],
    missingInformation: [],
    recommendedNextSteps: [],
    critique: null,
    confidence: "unknown",
    confidenceReason: "Triage failed for this turn.",
  };
}

/**
 * Fold model-supplied suspicion into an existing outcome.
 *
 * The signature enforces the invariant: this function takes a verdict floor
 * and can only raise it. There is deliberately no way to express
 * de-escalation, so a future caller cannot accidentally write one.
 */
export function escalateWithModelSuspicion(
  outcome: TriageOutcome,
  suspicion: { verdict: TriageVerdict; reasons: string[] },
): TriageOutcome {
  return {
    ...outcome,
    verdict: moreSevere(outcome.verdict, suspicion.verdict),
    modelSuspicion: [...outcome.modelSuspicion, ...suspicion.reasons],
  };
}

/** True when the pipeline must stop and hand off. */
export const halts = (o: TriageOutcome): boolean => o.verdict === "emergency";
