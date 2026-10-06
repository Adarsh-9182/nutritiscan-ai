-- Account chat history is opt-in. Existing accounts remain local-only until
-- the user explicitly enables sync in the application.
CREATE TABLE IF NOT EXISTS ns_chat_sync_consents (
  user_id text PRIMARY KEY REFERENCES ns_users(id) ON DELETE CASCADE,
  notice_version text NOT NULL,
  enabled_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE TABLE IF NOT EXISTS ns_conversations (
  user_id text NOT NULL REFERENCES ns_users(id) ON DELETE CASCADE,
  id text NOT NULL,
  payload text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS ns_conversations_recent
  ON ns_conversations(user_id, updated_at DESC);
