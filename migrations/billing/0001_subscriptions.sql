-- Additive billing metadata only. No passwords, medical records or chat content.
CREATE TABLE IF NOT EXISTS ns_billing_subscriptions (
  provider text NOT NULL CHECK (provider IN ('stripe','razorpay')),
  subscription_id text NOT NULL,
  account_id text NOT NULL,
  customer_id text,
  plan text NOT NULL CHECK (plan IN ('pro','max')),
  status text NOT NULL,
  livemode boolean NOT NULL DEFAULT false,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, subscription_id)
);
CREATE INDEX IF NOT EXISTS ns_billing_subscription_owner ON ns_billing_subscriptions(account_id, period_end DESC);
CREATE TABLE IF NOT EXISTS ns_billing_checkouts (
  id text PRIMARY KEY,
  account_id text NOT NULL,
  provider text NOT NULL CHECK (provider IN ('stripe','razorpay')),
  plan text NOT NULL CHECK (plan IN ('pro','max')),
  provider_id text UNIQUE,
  subscription_id text,
  url text,
  status text NOT NULL DEFAULT 'creating',
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ns_billing_checkout_owner ON ns_billing_checkouts(account_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS ns_billing_one_open_checkout ON ns_billing_checkouts(account_id) WHERE status IN ('creating','open');
CREATE TABLE IF NOT EXISTS ns_billing_events (
  provider text NOT NULL,
  event_id text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider,event_id)
);
CREATE TABLE IF NOT EXISTS ns_billing_holds (
  account_id text PRIMARY KEY,
  reason text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- A refund/dispute may arrive before the subscription-created event.
CREATE TABLE IF NOT EXISTS ns_billing_payment_holds (
  provider text NOT NULL,
  reference text NOT NULL,
  reason text NOT NULL,
  PRIMARY KEY(provider,reference)
);
CREATE TABLE IF NOT EXISTS ns_billing_usage (
  account_id text NOT NULL,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  used_microusd bigint NOT NULL DEFAULT 0 CHECK (used_microusd >= 0),
  PRIMARY KEY (account_id,period_start)
);
CREATE TABLE IF NOT EXISTS ns_billing_reservations (
  id text PRIMARY KEY,
  account_id text NOT NULL,
  period_start timestamptz NOT NULL,
  reserved_microusd bigint NOT NULL CHECK (reserved_microusd > 0),
  settled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
