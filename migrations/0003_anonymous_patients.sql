-- ============================================================
-- 0003 — let a patient exist without an account
--
-- 0001 modelled identity first: patients.account_id NOT NULL, on the
-- assumption that a person signs up and then consults. The product works the
-- other way round. There is no sign-up, the landing page's whole promise is
-- "free · no account", and the first thing anyone does is type a symptom.
--
-- Under the original constraint that consult could not be recorded at all,
-- which would have left persistence useful only to users who do not exist
-- yet.
--
-- So an anonymous patient is a patient. `account_id` becomes nullable and
-- means exactly one thing: nobody has claimed this record. Claiming it later
-- is an UPDATE that sets the column, not a migration of rows between tables,
-- so a consult history survives someone deciding to sign up.
-- ============================================================

ALTER TABLE patients ALTER COLUMN account_id DROP NOT NULL;

-- The browser's own handle for its patient row. Opaque, generated
-- client-side, and the only thing linking a returning visitor to their
-- history before they have an account.
--
-- Stored hashed. It arrives from the client on every request, so treating it
-- as a bearer token is the honest reading — and a leaked database should not
-- hand over the means to read anyone's consults.
ALTER TABLE patients ADD COLUMN anon_key_hash bytea UNIQUE;

-- Exactly one of the two identifies a patient. Both is a claimed record;
-- neither is a row nothing can ever reach again.
ALTER TABLE patients ADD CONSTRAINT patients_identified
  CHECK (account_id IS NOT NULL OR anon_key_hash IS NOT NULL);

COMMENT ON COLUMN patients.account_id IS
  'NULL until the patient claims this record by signing up. See 0003.';
COMMENT ON COLUMN patients.anon_key_hash IS
  'SHA-256 of the browser-held key. Never the key itself — it is a bearer token.';
