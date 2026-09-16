# Health workspace release

This release provides account-based health records and visit preparation. It is an early-access product, not a clinically validated autonomous doctor.

## Implemented

- Responsive public site, workspace, report review, care tasks, assistant, settings and policies.
- Username/password accounts, one-use rotating recovery keys and revocable seven-day sessions.
- Encrypted profile and records (AES-256-GCM, bound to user/record IDs), password hashing (scrypt), HttpOnly/SameSite cookies, same-origin mutation checks, durable SQL rate limits and version-checked updates.
- Browser-side PDF/TXT extraction: up to 5 MB / 20 pages. Users correct and confirm observations. Original files and source text are not sent to the server. Scanned-image PDFs require manual entry.
- Reference-range comparisons use the printed range and unit. Missing ranges remain unknown. The product does not diagnose from results.
- User-created follow-up tasks, JSON export, downloadable visit summary, password-confirmed account deletion.
- Fictional demo is isolated in browser memory and resets on reload.
- Deterministic report summaries and visit questions work without an LLM. Existing emergency-pattern checks run before server assistant answers. These checks are incomplete and have not been clinically validated.

## Run locally at zero provider cost

```sh
npm ci
npm run dev
```

Without `DATABASE_URL`, development uses PGlite in `.local/workspace` and generates a private encryption key in `.local/data-key`. Keep both together. Never commit `.local` or use this filesystem fallback on serverless production.

```sh
npm run verify
# With the development server on port 3100 and APP_ORIGIN=http://127.0.0.1:3100:
node scripts/smoke-workspace.mjs
```

`verify` runs lint, type checking, unit/integration tests, legacy UI tests, reviewed evaluation gates and the production build. A passing software suite is not clinical validation. Thirty existing clinical evaluation cases are skipped by the reviewed-case gate.

## Production configuration

Use a persistent Postgres database. This deployment uses a dedicated Neon free-plan database in Singapore connected to Vercel. Free quotas and cold-start latency apply; configure monitoring and capacity limits before a larger rollout.

Required values:

| Variable | Meaning |
| --- | --- |
| `DATABASE_URL` | TLS Postgres connection (pooler supported, prepared statements disabled) |
| `HEALTH_DATA_KEY` | Random 32-byte key encoded as 64 hex characters; back up securely |
| `APP_ORIGIN` | Exact trusted browser origin, e.g. `https://nutritiscan-ai.vercel.app` |
| `NEXT_PUBLIC_SITE_URL` | Same canonical site URL for metadata |

Run `npm run migrate:workspace` with `DATABASE_URL` supplied before deployment. Migration takes an advisory lock and only adds `ns_*` workspace tables; old patient/consultation tables are retained. Use an isolated database branch to test later migrations against representative synthetic records.

The migration owner and application currently use the integration-provided database role. A separate least-privilege runtime role is a recommended hardening step before handling sensitive data at scale. Do not give the browser database credentials.

Encryption is server-side, not end-to-end: the application operator can decrypt records. Losing the encryption key loses access to the records. Rotation requires a deliberate decrypt/re-encrypt migration; replacing the key alone will break access. Establish and test a restricted backup/restore procedure for both data and keys.

Deploy with the existing Vercel project. After deployment, run:

```sh
SMOKE_ORIGIN=https://nutritiscan-ai.vercel.app node scripts/smoke-workspace.mjs
```

This creates and removes a synthetic account and checks persistence, sessions, report tools, tasks, export, concurrency and CSRF. Never run synthetic data tools against real patient accounts.

## Optional open-model adapter

The assistant supports an OpenAI-compatible chat endpoint, including a locally operated Ollama server. No paid provider or downloaded model is required for the records product.

```sh
# Example local configuration after installing a compatible open model:
HEALTH_MODEL_BASE_URL=http://127.0.0.1:11434/v1
HEALTH_MODEL_NAME=<installed-model-id>
HEALTH_MODEL_APPROVED=true
```

Set `HEALTH_MODEL_API_KEY` only if the endpoint requires it. The adapter sends the question and language preference, not the record/profile payload. Users can still type sensitive information, so verify hosting, license, retention and data-use terms before enabling it. A Vercel server cannot reach an Ollama server on your laptop through its own localhost address.

The current model experiment is constrained to explaining the included lab-reference source. It uses bounded structured output, source IDs, a timeout and a fail-closed output check. This is not broad clinical RAG and the lexical filter is not a medical safety guarantee. Failed/unconfigured generation is explicitly labelled; no canned answer is presented as a model response. `LEGACY_CLINICAL_ENABLED` stays false to prevent older anonymous/free-provider endpoints from bypassing the workspace boundary.

## Source and dataset policy

The release uses a short authored summary of [MedlinePlus lab-result guidance](https://medlineplus.gov/lab-tests/how-to-understand-your-lab-results/) and hand-authored synthetic report fixtures. It does not ship a patient dataset or claim training on medical data. Record source URL, usage rights, revision, geography and clinician review for every future knowledge entry. Do not ingest arbitrary scraped patient records or assume every MedlinePlus-linked third-party page has the same reuse terms.

## Before clinical or paid launch

- Qualified clinicians review intended use, escalation wording, language coverage and representative failure cases; measure false negatives and unsafe advice, not only answer fluency.
- Establish the applicable privacy, clinical and regulatory operating model, a real support process, incident response, retention period, consent/version audit and legal review.
- Add verified contact recovery, abuse controls/bot challenges, MFA and account security events; test load, cross-account access and restore/recovery.
- Build clinician hand-off with real availability and ownership if offering consultations. No doctor network, diagnosis, prescribing, treatment plan, automatic booking or emergency monitoring is implemented.
- Add a real hosted payment processor with signed webhooks, entitlements, idempotency, refunds and cancellation before selling subscriptions. There is no billing flow in this release.
- Image OCR, meal analysis, family accounts, longitudinal clinical interpretation and email/push reminders remain future work.

Do not market this build as a replacement for a doctor, a medical device approval, or the best health agent in the market.

## Continuous deployment gate

`vercel.json` runs `npm run verify` for every deployment and places functions in Singapore near the database. A failing software/evaluation gate blocks publication. The current GitHub CLI token lacks workflow scope, so this release uses the Vercel build gate rather than adding a GitHub Actions workflow that cannot be pushed with those credentials.
