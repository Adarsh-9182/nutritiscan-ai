-- 0001: consent-aware source and retrieval foundation.
-- Metadata only: credentials are referenced, never stored in these tables.
CREATE TABLE IF NOT EXISTS ns_source_connections (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES ns_users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('abdm','fhir_r4','partner')),
  label text NOT NULL CHECK (length(label) BETWEEN 1 AND 120),
  state text NOT NULL CHECK (state IN ('available','pending','connected','attention','disconnected','revoked')),
  credential_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id,user_id)
);
CREATE INDEX IF NOT EXISTS ns_source_connections_owner ON ns_source_connections(user_id,created_at DESC);

CREATE TABLE IF NOT EXISTS ns_consent_grants (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES ns_users(id) ON DELETE CASCADE,
  connection_id text NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('retrieve_records','keep_records_current')),
  categories text[] NOT NULL CHECK (
    cardinality(categories) BETWEEN 1 AND 8 AND
    categories <@ ARRAY['observation','report','medication','allergy','condition','encounter','procedure','document']::text[]
  ),
  date_from date,
  date_to date,
  granted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  FOREIGN KEY (connection_id,user_id) REFERENCES ns_source_connections(id,user_id) ON DELETE CASCADE,
  UNIQUE (id,user_id),
  CHECK (date_from IS NULL OR date_to IS NULL OR date_from <= date_to),
  CHECK (expires_at > granted_at)
);
CREATE INDEX IF NOT EXISTS ns_consent_active ON ns_consent_grants(user_id,connection_id,expires_at) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS ns_retrieval_jobs (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES ns_users(id) ON DELETE CASCADE,
  consent_id text NOT NULL,
  idempotency_key text NOT NULL,
  state text NOT NULL CHECK (state IN ('queued','running','needs_user','partial','completed','failed','cancelled')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 10),
  cursor text,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  FOREIGN KEY (consent_id,user_id) REFERENCES ns_consent_grants(id,user_id) ON DELETE RESTRICT,
  UNIQUE(user_id,idempotency_key)
);
CREATE INDEX IF NOT EXISTS ns_retrieval_queue ON ns_retrieval_jobs(state,created_at) WHERE state IN ('queued','running');

CREATE TABLE IF NOT EXISTS ns_source_audit (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES ns_users(id) ON DELETE CASCADE,
  connection_id text,
  consent_id text,
  job_id text,
  action text NOT NULL CHECK (action IN ('connection_created','connection_state_changed','consent_granted','consent_revoked','retrieval_requested','retrieval_state_changed')),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ns_source_audit_owner ON ns_source_audit(user_id,created_at DESC);
