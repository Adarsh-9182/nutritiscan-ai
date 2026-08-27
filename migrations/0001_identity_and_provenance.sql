-- ============================================================
-- 0001 — identity, and the provenance vocabulary
--
-- The first slice of docs/DATA.md: the two identity tables (§3.1) and the
-- enums every clinical table will carry (§3.2). No clinical tables yet —
-- they are added per-domain in later migrations, once each one's shape has
-- been settled against the code that reads it.
--
-- Requires Postgres 16+ with pgcrypto. pgvector arrives with the evidence
-- corpus (DATA.md §6.1), not here.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ------------------------------------------------------------
-- Provenance (DATA.md §3.2)
--
-- Declared before any table that uses it. `fact_source` is NOT NULL on every
-- clinical table by policy (P2) — provenance is a column, not metadata.
--
-- The rule this vocabulary exists to enforce: a `model_inferred` row may
-- never be rendered in a Facts section, given to an agent as fact, or counted
-- as evidence for another inference. Enforced in application code by
-- lib/patient/provenance.ts, which mirrors this enum exactly.
-- ------------------------------------------------------------

CREATE TYPE fact_source AS ENUM (
  'patient_reported',    -- the patient told us, in their own words
  'document_extracted',  -- pulled from an uploaded report; carries document_id
  'device_measured',     -- from a connected device or manual vital entry
  'model_inferred',      -- the system's own inference. NEVER presented as fact.
  'clinician_verified'   -- a qualified human confirmed it. The only trust upgrade.
);

-- Reuses the ladder already in lib/health/insights.ts. One honesty
-- vocabulary across prompts, UI, insights and schema — not four.
CREATE TYPE certainty AS ENUM ('known', 'likely', 'possible', 'unknown');

-- ------------------------------------------------------------
-- Identity (DATA.md §3.1, P5)
--
-- Identity and health data are separated: different tables, different access
-- paths, joined only through an opaque patient_id. The health domain can then
-- be queried, exported and deleted without touching PII.
-- ------------------------------------------------------------

CREATE TABLE accounts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Lookup only. The plaintext address is never stored in a queryable column,
  -- so an index scan cannot enumerate users' emails.
  email_hash      bytea NOT NULL UNIQUE,
  email_encrypted bytea NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  -- Soft delete: the row survives long enough to honour an export request and
  -- to keep audit entries referentially intact. Hard deletion is a scheduled
  -- job under DATA.md §7.4, not a cascade triggered by a click.
  deleted_at      timestamptz
);

-- The only bridge between identity and health, kept deliberately thin.
CREATE TABLE patients (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX patients_account_id_idx ON patients (account_id) WHERE deleted_at IS NULL;

-- ------------------------------------------------------------
-- Audit (DATA.md §7.2)
--
-- Created in the first migration on purpose: an audit log added after the
-- tables it is meant to watch has a blind spot exactly as old as the delay.
--
-- Append-only. No UPDATE or DELETE grant is ever issued on this table; a
-- correction is a new row, the same rule clinical facts follow under P3.
-- ------------------------------------------------------------

CREATE TABLE audit_log (
  id          bigserial PRIMARY KEY,
  at          timestamptz NOT NULL DEFAULT now(),
  patient_id  uuid REFERENCES patients(id),
  -- Who acted: an account id, a service name, or NULL for the system itself.
  actor       text,
  action      text NOT NULL,
  entity      text NOT NULL,
  entity_id   uuid,
  -- Structured context. Health values are NOT written here — the audit log
  -- records that something happened, never a second copy of the clinical row.
  detail      jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX audit_log_patient_at_idx ON audit_log (patient_id, at DESC);
