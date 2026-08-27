-- ============================================================
-- 0002 — consultations, messages, assessments, symptoms
--
-- The tables that make a consult a record rather than a chat log. Together
-- they answer the question docs/ARCHITECTURE.md §3.2 says is currently
-- unanswerable: given a response the patient disputes, what did the system
-- know, what fired, which validators passed, and what produced it.
--
-- Ordered so foreign keys resolve: consultations, then everything hanging
-- off them. Requires 0001 (fact_source, patients).
-- ============================================================

-- ------------------------------------------------------------
-- Consultations (DATA.md §6)
-- ------------------------------------------------------------

CREATE TABLE consultations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id        uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  started_at        timestamptz NOT NULL DEFAULT now(),
  ended_at          timestamptz,
  chief_complaint   text,
  status            text NOT NULL CHECK (status IN ('active', 'completed', 'escalated', 'abandoned')),
  escalated_at      timestamptz,
  escalation_reason text
);

CREATE INDEX consultations_patient_started_idx ON consultations (patient_id, started_at DESC);

CREATE TABLE messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultation_id uuid NOT NULL REFERENCES consultations(id) ON DELETE CASCADE,
  role            text NOT NULL CHECK (role IN ('patient', 'system', 'assistant')),
  content         text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX messages_consultation_created_idx ON messages (consultation_id, created_at);

-- ------------------------------------------------------------
-- Assessments — one row per completed reasoning turn (DATA.md §6)
--
-- THE audit record, and the reason the audit_log in 0001 stays thin: this
-- is where "what did the system conclude, and why" lives.
--
-- Immutable by policy. A correction is a new assessment, never an edit —
-- the same append-only rule clinical facts follow under P3, and for the same
-- reason: a record that can rewrite its own past cannot be evidence of
-- anything.
-- ------------------------------------------------------------

CREATE TABLE assessments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultation_id uuid NOT NULL REFERENCES consultations(id) ON DELETE CASCADE,

  -- The full ClinicalState as it stood when the turn was answered.
  -- Stored whole rather than shredded into columns: its shape is still
  -- moving (ORCHESTRATION.md §3), and a schema migration must never be the
  -- thing that loses an audit record.
  clinical_state  jsonb NOT NULL,

  triage_verdict  text NOT NULL CHECK (triage_verdict IN ('emergency', 'urgent', 'routine', 'self_care')),
  -- Rule ids, not prose, so an eval can assert exactly which rule fired.
  triage_rules    text[] NOT NULL DEFAULT '{}',
  specialists     text[] NOT NULL DEFAULT '{}',

  critic_output   jsonb,
  -- Per-layer pass/fail from lib/safety/validate.ts. Recorded even when
  -- everything passed: "nothing fired" is only meaningful if the absence
  -- was written down at the time.
  validators      jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- NULL when the answer was withheld. The pair is the point: a withheld
  -- turn must be as inspectable as a delivered one.
  response_text   text,
  withheld_reason text,

  model_id        text NOT NULL,
  prompt_version  text NOT NULL,
  latency_ms      int,
  created_at      timestamptz NOT NULL DEFAULT now(),

  -- Either it was answered or it was withheld, never both and never neither.
  CONSTRAINT assessments_answered_or_withheld CHECK (
    (response_text IS NOT NULL AND withheld_reason IS NULL)
    OR (response_text IS NULL AND withheld_reason IS NOT NULL)
  )
);

CREATE INDEX assessments_consultation_created_idx ON assessments (consultation_id, created_at DESC);
-- Answering "how often does this rule fire" without scanning every row.
CREATE INDEX assessments_triage_rules_idx ON assessments USING gin (triage_rules);

-- ------------------------------------------------------------
-- Symptoms (DATA.md §3.5)
-- ------------------------------------------------------------

CREATE TABLE symptoms (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id      uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  consultation_id uuid REFERENCES consultations(id),

  label           text NOT NULL,
  body_site       text,
  onset_at        timestamptz,
  -- Verbatim: "since Tuesday", "about 3 hours". Kept as the patient said it,
  -- because normalising it here would discard the vagueness, and how vague
  -- someone is about onset is itself clinical information.
  duration_text   text,
  severity        int CHECK (severity BETWEEN 0 AND 10),
  character       text,
  radiation       text,
  timing          text,
  modifiers       jsonb,
  associated      text[],

  -- "No chest pain, no shortness of breath" is a finding. Without this
  -- column "not asked" and "asked and denied" collapse into the same empty
  -- state, and the intake engine keeps re-asking what it already has.
  negatives       text[],

  -- P2: provenance is a column, not metadata. NOT NULL on every clinical
  -- table. A model_inferred row may never be rendered as fact — enforced in
  -- lib/patient/provenance.ts.
  source          fact_source NOT NULL DEFAULT 'patient_reported',
  recorded_at     timestamptz NOT NULL DEFAULT now(),

  -- P3: append-only. A correction is a new row pointing at the old one.
  superseded_by   uuid REFERENCES symptoms(id),
  superseded_at   timestamptz,

  CONSTRAINT symptoms_superseded_together CHECK (
    (superseded_by IS NULL AND superseded_at IS NULL)
    OR (superseded_by IS NOT NULL AND superseded_at IS NOT NULL)
  )
);

-- Current symptoms are the common read; superseded rows are history.
CREATE INDEX symptoms_patient_current_idx
  ON symptoms (patient_id, recorded_at DESC)
  WHERE superseded_by IS NULL;

CREATE INDEX symptoms_consultation_idx ON symptoms (consultation_id);
