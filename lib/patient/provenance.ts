// ============================================================
// PROVENANCE — where a clinical fact came from
//
// DATA.md P2: every clinical fact carries provenance, as a required column
// rather than metadata. This file is the TypeScript half of that, and the
// place the rule it exists for is enforced:
//
//   A `model_inferred` fact may never be rendered in a Facts section, fed
//   to an agent as fact, or counted as evidence for another inference.
//
// That is MEDICAL_REASONING_FORMAT's Facts/Inference split — currently a
// paragraph in a prompt — moved somewhere it can be checked. It is the same
// move made twice already in this codebase, and for the same reason:
//
//   triage      prompt -> rules      (a red flag can halt a turn)
//   validation  prompt -> validator  (a missing warning blocks an answer)
//   provenance  prompt -> schema     (an inference cannot become a fact)
//
// A prompt asks the model to keep facts and inferences apart. This makes it
// so that mixing them requires calling a function that does not exist.
// ============================================================

/** DATA.md §3.2. Mirrors the `fact_source` Postgres enum exactly. */
export const FACT_SOURCES = [
  "patient_reported",
  "document_extracted",
  "device_measured",
  "model_inferred",
  "clinician_verified",
] as const;

export type FactSource = (typeof FACT_SOURCES)[number];

/**
 * Sources that may be stated as fact.
 *
 * Everything the patient, a document, a device or a clinician asserted is a
 * fact about the world — we may be wrong about it, but we did not invent it.
 * `model_inferred` is the system's own guess and is the sole exclusion.
 */
const ASSERTED: ReadonlySet<FactSource> = new Set<FactSource>([
  "patient_reported",
  "document_extracted",
  "device_measured",
  "clinician_verified",
]);

/**
 * The only value that upgrades trust (DATA.md P2).
 *
 * Kept as its own predicate rather than inlined, because the difference
 * between "a human confirmed this" and "nobody has disputed it" is the
 * difference the whole column exists to record.
 */
export const isClinicianVerified = (s: FactSource): boolean => s === "clinician_verified";

/** True when a fact may appear in a Facts section or be given to an agent as fact. */
export const isAssertable = (s: FactSource): boolean => ASSERTED.has(s);

/** True when a fact must be presented as the system's inference, never as given. */
export const isInferred = (s: FactSource): boolean => s === "model_inferred";

/** The shape every clinical row carries. DATA.md §3.2 and P3. */
export type Provenance = {
  source: FactSource;
  recordedAt: string;
  /** Set when `source` is `document_extracted`. DATA.md §3.2. */
  documentId?: string;
  /** Extraction confidence, 0–1. Only meaningful alongside `documentId`. */
  extractionConfidence?: number;
  /**
   * P3: clinical facts are append-only. A correction is a new row that
   * supersedes an old one — never an update in place, because a timeline
   * that can rewrite its own past is worse than no timeline.
   */
  supersededBy?: string;
  supersededAt?: string;
};

export type ClinicalFact<T> = { id: string; value: T; provenance: Provenance };

/** A fact still in force: not superseded by a later correction. */
export const isCurrent = <T>(f: ClinicalFact<T>): boolean => !f.provenance.supersededBy;

// ------------------------------------------------------------
// The split, enforced
// ------------------------------------------------------------

/**
 * Partition facts into what may be asserted and what may only be inferred.
 *
 * Returning a tagged pair rather than a filtered list is deliberate: a caller
 * that wants "the facts" cannot get them without also being handed the
 * inferences, so dropping the distinction has to be a visible decision in the
 * calling code rather than an omission nobody notices in review.
 *
 * Superseded rows are excluded from both. A corrected value is not a fact and
 * is not an inference — it is history, and belongs on a timeline, not in
 * reasoning about the present.
 */
export function partitionByAssertability<T>(facts: ClinicalFact<T>[]): {
  assertable: ClinicalFact<T>[];
  inferred: ClinicalFact<T>[];
} {
  const live = facts.filter(isCurrent);
  return {
    assertable: live.filter((f) => isAssertable(f.provenance.source)),
    inferred: live.filter((f) => isInferred(f.provenance.source)),
  };
}

/**
 * Render a fact for a Facts section.
 *
 * Throws on an inferred fact rather than returning null or a placeholder.
 * A silent skip would let an inference disappear from an answer without
 * anything noticing, which is the failure this whole module exists to make
 * impossible — and a caller reaching this line has a bug that should surface
 * in a test, not in production on a patient's screen.
 */
export function assertAsFact<T>(fact: ClinicalFact<T>): T {
  if (!isCurrent(fact)) {
    throw new Error(
      `Refusing to state superseded fact ${fact.id} as current. It was corrected at ${fact.provenance.supersededAt}.`,
    );
  }
  if (!isAssertable(fact.provenance.source)) {
    throw new Error(
      `Refusing to state ${fact.provenance.source} fact ${fact.id} as fact. Inferences belong in Inference, never in Facts.`,
    );
  }
  return fact.value;
}

/**
 * How a source should be described to a reader.
 *
 * Wording matters here: "you told us" and "we think" carry different weight,
 * and collapsing them is how a guess acquires the authority of a report.
 */
export function describeSource(s: FactSource): string {
  switch (s) {
    case "patient_reported":
      return "you told us";
    case "document_extracted":
      return "from your uploaded report";
    case "device_measured":
      return "measured";
    case "clinician_verified":
      return "confirmed by a clinician";
    case "model_inferred":
      return "our inference, not confirmed";
  }
}
