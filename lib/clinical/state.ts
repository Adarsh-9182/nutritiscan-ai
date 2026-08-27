// ============================================================
// CLINICAL STATE
//
// The structured representation every stage of the pipeline reads and
// most stages write. See docs/ORCHESTRATION.md §3.
//
// It exists because prose cannot be inspected. Before this file, the
// system's clinical reasoning existed only as text produced by a prompt:
// nothing downstream could check whether a red flag was raised, nothing
// could halt a turn, and nothing could be asserted in a test. Triage,
// the output validators and the eval suites all read this type — none of
// them are buildable without it.
//
// PHASE 1 SCOPE, STATED HONESTLY: the fields below are the full target
// shape, but only `findings`, `suppressed`, `riskFactors` and `triage`
// are populated today, by the deterministic extractor in ./extract.ts.
// The reasoning fields (differential, evidence, critique) are declared
// so that the type is stable for the code that will fill them, and are
// left empty rather than faked. An empty differential means "not yet
// computed", never "nothing to consider".
// ============================================================

import type { Certainty } from "../health/insights";

// One honesty vocabulary across prompts, UI, insights and schema — the
// ladder already used by lib/health/insights.ts, not a second scale.
export type { Certainty };

export type TriageVerdict = "emergency" | "urgent" | "routine" | "self_care";

/** Ordered worst-first, so escalation comparisons are explicit. */
const VERDICT_RANK: Record<TriageVerdict, number> = {
  emergency: 3,
  urgent: 2,
  routine: 1,
  self_care: 0,
};

/** The more serious of two verdicts. Triage may escalate, never de-escalate. */
export function moreSevere(a: TriageVerdict, b: TriageVerdict): TriageVerdict {
  return VERDICT_RANK[a] >= VERDICT_RANK[b] ? a : b;
}

export const isAtLeast = (v: TriageVerdict, floor: TriageVerdict): boolean =>
  VERDICT_RANK[v] >= VERDICT_RANK[floor];

// ------------------------------------------------------------
// Findings
// ------------------------------------------------------------

/**
 * Why a matched concept was NOT treated as a finding about this patient.
 *
 * Recorded rather than discarded: a suppression is a decision the safety
 * layer made, and `docs/SAFETY.md §6` requires every triage decision to be
 * auditable. It is also the first place to look when a red flag is missed.
 */
export type SuppressionReason = "negated" | "third_party";

export type Qualifiers = {
  /** Explicitly framed as past and resolved ("three years ago", "history of"). */
  historical: boolean;
  /** Severity language attached to this mention ("severe", "worst", "10/10"). */
  severe: boolean;
  /** Framed as sudden or abrupt in onset. */
  sudden: boolean;
};

export type Finding = {
  conceptId: string;
  label: string;
  /** The verbatim span that matched. Never a paraphrase — see §4 of ORCHESTRATION.md. */
  span: string;
  index: number;
  qualifiers: Qualifiers;
};

export type SuppressedFinding = Finding & { reason: SuppressionReason };

export type RiskFactor = {
  id: string;
  label: string;
  /** Where this came from. Mirrors DATA.md's fact_source. */
  source: "patient_reported" | "profile_recorded";
};

// ------------------------------------------------------------
// Triage outcome
// ------------------------------------------------------------

export type TriageOutcome = {
  verdict: TriageVerdict;
  /** Rule IDs, not prose — so an eval can assert exactly which fired. */
  firedRules: string[];
  /**
   * Model-supplied suspicion. May escalate the verdict, may NEVER lower it.
   * Empty in Phase 1: no model participates in triage yet.
   */
  modelSuspicion: string[];
  /** True when triage failed and the verdict is a fail-closed default. */
  failedClosed: boolean;
  /** Set only when a dedicated non-clinical path owns the response. */
  channel?: "mental_health";
};

export const PENDING_TRIAGE: TriageOutcome = {
  verdict: "self_care",
  firedRules: [],
  modelSuspicion: [],
  failedClosed: false,
};

// ------------------------------------------------------------
// Reasoning fields — declared, not yet populated (see header)
// ------------------------------------------------------------

export type Likelihood =
  | "strongly_supported"
  | "reasonably_possible"
  | "possible_uncertain"
  | "insufficient_information";

export type DifferentialItem = {
  label: string;
  supportingEvidence: string[];
  contradictingEvidence: string[];
  discriminators: string[];
  /**
   * "Must not miss", independent of likelihood. Kept separate on purpose:
   * sorting a differential by likelihood alone is how a rare, dangerous
   * possibility falls off the end of the list.
   */
  dangerous: boolean;
  likelihood: Likelihood;
};

export type EvidenceRef = { chunkId: string; documentId: string; quote: string };
export type MissingInfo = { question: string; resolves: string; discriminates: string[] };
export type NextStep = { action: string; rationale: string; urgency: TriageVerdict };
export type Critique = { findings: string[]; dangerousAlternatives: string[]; overconfident: boolean };

// ------------------------------------------------------------

export type ClinicalState = {
  consultationId: string;
  turn: number;

  /** The verbatim patient turn triage reasoned over. Kept for audit. */
  text: string;
  chiefComplaint: string | null;

  findings: Finding[];
  suppressed: SuppressedFinding[];
  /**
   * Concepts the patient explicitly DENIED. Distinct from "never mentioned":
   * "no chest pain" is a clinical finding, and the intake engine must not
   * re-ask what has already been answered. See docs/DATA.md §3.5.
   */
  negatives: string[];
  riskFactors: RiskFactor[];

  triage: TriageOutcome;

  // Populated from Phase 4 onward. Empty means "not computed", not "none found".
  evidence: EvidenceRef[];
  differential: DifferentialItem[];
  missingInformation: MissingInfo[];
  recommendedNextSteps: NextStep[];
  critique: Critique | null;

  confidence: Certainty;
  confidenceReason: string;
};

export function emptyState(consultationId: string, turn: number, text: string): ClinicalState {
  return {
    consultationId,
    turn,
    text,
    chiefComplaint: null,
    findings: [],
    suppressed: [],
    negatives: [],
    riskFactors: [],
    triage: PENDING_TRIAGE,
    evidence: [],
    differential: [],
    missingInformation: [],
    recommendedNextSteps: [],
    critique: null,
    confidence: "unknown",
    confidenceReason: "No reasoning has run for this turn.",
  };
}

/**
 * Attach a triage outcome. Separate from the state builder because triage
 * is computed *from* a state, and because `docs/ORCHESTRATION.md §5` makes
 * `state.triage` read-only to every stage downstream of the safety layer.
 */
export function withTriage(state: ClinicalState, triage: TriageOutcome): ClinicalState {
  return { ...state, triage };
}

/** Whether a concept was found, ignoring suppressed mentions. */
export const has = (s: ClinicalState, conceptId: string): boolean =>
  s.findings.some((f) => f.conceptId === conceptId);

/** Whether a concept was found and is not framed as resolved history. */
export const hasCurrent = (s: ClinicalState, conceptId: string): boolean =>
  s.findings.some((f) => f.conceptId === conceptId && !f.qualifiers.historical);

export const hasAnyCurrent = (s: ClinicalState, ids: string[]): boolean =>
  ids.some((id) => hasCurrent(s, id));

export const hasRisk = (s: ClinicalState, id: string): boolean =>
  s.riskFactors.some((r) => r.id === id);

/** Any current mention of a concept carrying severity language. */
export const hasSevere = (s: ClinicalState, ids: string[]): boolean =>
  s.findings.some((f) => ids.includes(f.conceptId) && f.qualifiers.severe && !f.qualifiers.historical);

export const hasSudden = (s: ClinicalState, ids: string[]): boolean =>
  s.findings.some((f) => ids.includes(f.conceptId) && f.qualifiers.sudden && !f.qualifiers.historical);
