-- Ten-minute OAuth state only. Payloads are authenticated and encrypted.
CREATE TABLE IF NOT EXISTS ns_account_oauth_states (
  state_hash text PRIMARY KEY,
  browser_hash text NOT NULL,
  provider text NOT NULL CHECK(provider IN ('google','github')),
  payload text NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS ns_account_oauth_expiry ON ns_account_oauth_states(expires_at);
