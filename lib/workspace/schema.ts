// Additive, isolated tables: existing anonymous patient records are untouched.
export const workspaceSchema = `
CREATE TABLE IF NOT EXISTS ns_users (
  id text PRIMARY KEY, username text NOT NULL UNIQUE,
  password_hash text NOT NULL, recovery_hash text NOT NULL,
  record_count integer NOT NULL DEFAULT 0 CHECK (record_count BETWEEN 0 AND 500),
  profile text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE ns_users ADD COLUMN IF NOT EXISTS record_count integer NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS ns_sessions (
  token_hash text PRIMARY KEY, user_id text NOT NULL REFERENCES ns_users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS ns_sessions_user ON ns_sessions(user_id);
CREATE TABLE IF NOT EXISTS ns_records (
  id text PRIMARY KEY, user_id text NOT NULL REFERENCES ns_users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('report','task','message')),
  payload text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1
);
UPDATE ns_users SET record_count=(SELECT count(*) FROM ns_records WHERE user_id=ns_users.id AND kind NOT IN ('day','message'));
-- Daily logs ('day') are one record per calendar date; the kind list is widened idempotently.
ALTER TABLE ns_records DROP CONSTRAINT IF EXISTS ns_records_kind_check;
ALTER TABLE ns_records ADD CONSTRAINT ns_records_kind_check CHECK (kind IN ('report','task','message','day'));
-- One day log per account and date, enforced by the database. The key is a
-- hash of account and date, so the date itself is not stored in clear.
ALTER TABLE ns_records ADD COLUMN IF NOT EXISTS day_key text;
CREATE UNIQUE INDEX IF NOT EXISTS ns_records_day_key ON ns_records(day_key) WHERE day_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS ns_records_owner ON ns_records(user_id, kind, created_at);
CREATE TABLE IF NOT EXISTS ns_rate_limits (
  key text PRIMARY KEY, count integer NOT NULL, expires_at timestamptz NOT NULL
);
-- Proactive companion: one messaging channel per account. The chat id is sealed.
CREATE TABLE IF NOT EXISTS ns_channels (
  user_id text PRIMARY KEY REFERENCES ns_users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('telegram')),
  chat_hash text NOT NULL UNIQUE, chat text NOT NULL,
  time_zone text NOT NULL DEFAULT 'Asia/Kolkata',
  settings text NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ns_link_codes (
  code_hash text PRIMARY KEY, user_id text NOT NULL REFERENCES ns_users(id) ON DELETE CASCADE,
  time_zone text NOT NULL, expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS ns_notify_log (
  user_id text NOT NULL REFERENCES ns_users(id) ON DELETE CASCADE,
  key text NOT NULL, sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);
CREATE TABLE IF NOT EXISTS ns_pending (
  id text PRIMARY KEY, user_id text NOT NULL REFERENCES ns_users(id) ON DELETE CASCADE,
  payload text NOT NULL, expires_at timestamptz NOT NULL
);
`;
