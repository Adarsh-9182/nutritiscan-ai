// ============================================================
// CONSULTATIONS — writing the record
//
// docs/ARCHITECTURE.md §3.2 names the question this exists to answer:
// given a response the patient disputes, what did the system know, what
// fired, which validators passed, and what produced it. Until now nothing
// could answer it, because nothing was written down.
//
// Two rules shape every function here.
//
//   PERSISTENCE NEVER COSTS AN ANSWER. There may be no database — that is
//   the normal state today — and a write may fail. Neither is allowed to
//   turn into an error the patient sees, so everything returns null on the
//   way out rather than throwing, and the caller is written to ignore it.
//
//   BUT A LOST RECORD IS LOUD. Swallowing a failed audit write silently is
//   how a system quietly stops being auditable while still claiming to be.
//   Failures are logged with the consultation id, every time.
// ============================================================

import { createHash } from "node:crypto";
import { db } from "./client";
import type { ClinicalState } from "../clinical/state";
import type { ValidationResult } from "../safety/validate";

/** The anon key is a bearer token; only its hash is ever stored. See 0003. */
const hashKey = (key: string) => createHash("sha256").update(key).digest();

/**
 * Find or create the patient behind an anonymous browser key.
 *
 * Written as an upsert on the unique hash rather than select-then-insert:
 * two tabs opening a first consult at the same moment is an ordinary race,
 * and the version that reads first loses one of them to a constraint error.
 */
export async function ensureAnonymousPatient(anonKey: string): Promise<string | null> {
  const sql = db();
  if (!sql || !anonKey.trim()) return null;

  try {
    const rows = await sql<{ id: string }[]>`
      INSERT INTO patients (anon_key_hash)
      VALUES (${hashKey(anonKey)})
      ON CONFLICT (anon_key_hash) DO UPDATE SET anon_key_hash = EXCLUDED.anon_key_hash
      RETURNING id
    `;
    return rows[0]?.id ?? null;
  } catch (err) {
    console.error("[db] could not resolve patient", err);
    return null;
  }
}

/**
 * Open a consultation, or reuse the one already open for this patient.
 *
 * A consult is a conversation, not a turn — the transcript in the browser
 * has no notion of where one ends, so the server decides: the most recent
 * still-active consultation, or a new one.
 */
export async function startConsultation(
  patientId: string,
  chiefComplaint: string | null,
): Promise<string | null> {
  const sql = db();
  if (!sql) return null;

  try {
    const open = await sql<{ id: string }[]>`
      SELECT id FROM consultations
      WHERE patient_id = ${patientId} AND status = 'active'
      ORDER BY started_at DESC
      LIMIT 1
    `;
    if (open[0]) return open[0].id;

    const rows = await sql<{ id: string }[]>`
      INSERT INTO consultations (patient_id, chief_complaint, status)
      VALUES (${patientId}, ${chiefComplaint}, 'active')
      RETURNING id
    `;
    return rows[0]?.id ?? null;
  } catch (err) {
    console.error("[db] could not start consultation", err);
    return null;
  }
}

export type AssessmentInput = {
  consultationId: string;
  state: ClinicalState;
  validation: ValidationResult | null;
  specialists: string[];
  modelId: string;
  promptVersion: string;
  latencyMs: number;
  /** Exactly one of these two. The schema enforces it; this shape says it. */
  outcome: { kind: "answered"; text: string } | { kind: "withheld"; reason: string };
};

/**
 * Write the audit record for one completed turn.
 *
 * `clinical_state` is stored whole. Its shape is still moving
 * (ORCHESTRATION.md §3), and a schema migration must never be the thing that
 * loses an audit record.
 *
 * `validators` is written even when everything passed: "nothing fired" is
 * only meaningful if the absence was recorded at the time, rather than
 * inferred later from a missing row.
 */
export async function recordAssessment(input: AssessmentInput): Promise<string | null> {
  const sql = db();
  if (!sql) return null;

  // Narrowed off the discriminant rather than a boolean, so the schema's
  // answered-or-withheld constraint is also a type-level guarantee here.
  const { outcome } = input;
  const responseText = outcome.kind === "answered" ? outcome.text : null;
  const withheldReason = outcome.kind === "withheld" ? outcome.reason : null;

  const validators = {
    ran: input.validation !== null,
    ok: input.validation?.ok ?? null,
    blocked: input.validation?.blocked ?? null,
    failedClosed: input.validation?.failedClosed ?? null,
    violations: input.validation?.violations.map((v) => v.id) ?? [],
  };

  try {
    const rows = await sql<{ id: string }[]>`
      INSERT INTO assessments (
        consultation_id, clinical_state, triage_verdict, triage_rules,
        specialists, validators, response_text, withheld_reason,
        model_id, prompt_version, latency_ms
      ) VALUES (
        ${input.consultationId},
        ${sql.json(JSON.parse(JSON.stringify(input.state)))},
        ${input.state.triage.verdict},
        ${input.state.triage.firedRules},
        ${input.specialists},
        ${sql.json(validators)},
        ${responseText},
        ${withheldReason},
        ${input.modelId},
        ${input.promptVersion},
        ${input.latencyMs}
      )
      RETURNING id
    `;
    return rows[0]?.id ?? null;
  } catch (err) {
    // Loud on purpose. A system that loses audit records quietly is worse
    // than one that never claimed to keep them.
    console.error("[db] LOST ASSESSMENT", {
      consultationId: input.consultationId,
      turn: input.state.turn,
      verdict: input.state.triage.verdict,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
