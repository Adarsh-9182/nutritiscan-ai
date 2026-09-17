# Health workspace release

This release puts a health companion at the centre of the workspace, with account-based health records and visit preparation. It is an early-access product, not a clinically validated autonomous doctor.

## Implemented

- Responsive public site, workspace, report review, care tasks, assistant, settings and policies.
- Username/password accounts, one-use rotating recovery keys and revocable seven-day sessions.
- Encrypted profile and records (AES-256-GCM, bound to user/record IDs), password hashing (scrypt), HttpOnly/SameSite cookies, same-origin mutation checks, durable SQL rate limits and version-checked updates.
- Browser-side PDF/TXT extraction: up to 5 MB / 20 pages. Users correct and confirm observations. Original files and source text are not sent to the server. Scanned-image PDFs require manual entry.
- Reference-range comparisons use the printed range and unit. Missing ranges remain unknown. The product does not diagnose from results.
- User-created follow-up tasks, JSON export, downloadable visit summary, password-confirmed account deletion.
- Fictional demo is isolated in browser memory and resets on reload.
- Health trends group confirmed observations by test name and exact unit, display dated readings with source-report links, and suppress changes when dates, labs or ranges are ambiguous. Numerical changes are not clinical interpretations.
- Visit preparation creates record-based discussion questions, lets users choose questions and add temporary notes, and exports a customised brief. Notes and selections are not saved and reset when leaving the page.
- The demo and authenticated assistant share the same record tools for summaries, comparisons, visit questions and escalation; the demo does not simulate a model response.
- Deterministic report summaries and visit questions work without an LLM. Existing emergency-pattern checks run before server assistant answers. These checks are incomplete and have not been clinically validated.

## Companion release — 16 September 2026

- The workspace opens directly to the conversation. Signed-in visits to `/` redirect to the workspace; `/?home` opens the public site.
- Original editorial design: ivory surfaces, quiet green navigation, terracotta serif headlines, a prominent composer and a contextual records rail. The [Figma dashboard template directory](https://www.figma.com/templates/dashboard-designs/) informed the compact navigation and hierarchy; no community file or artwork was copied.
- Eight curated educational topics: nutrition, sleep, medicines, mental health, prevention, women’s health, diabetes and lab results. These are authored summaries with MedlinePlus links, not a comprehensive medical dataset, live retrieval or clinical review.
- Symptom intake asks users to describe what they noticed; existing deterministic escalation runs first, including recent conversation context. It does not diagnose or establish that someone is safe.
- Optional on-device Qwen2.5-1.5B-Instruct through WebLLM 0.2.85, Apache-2.0 model. Download is opt-in, roughly 1 GB; configured runtime estimates about 1.9 GB GPU memory. Device/browser support varies. The initial files come from Hugging Face and GitHub; patient text stays inside the browser worker.
- Bounded model planning (allowlisted read tools, at most three) followed by educational synthesis. The model cannot mutate records, fetch arbitrary URLs, prescribe, send messages or book care. Reference links come from the supplied notes, never generated URLs. Links indicate context used, not independent verification of each generated claim. Record arithmetic is deterministic. Lexical output checks are limited, not a medical safety guarantee.
- Download progress, cancellation, per-turn timeout, stop control, GPU cleanup, unavailable-model fallback and explicit inference labels. Model weights can remain in browser cache after turning inference off; clearing site data removes them.
- Follow-up proposals require an editable title/date and a separate confirmation. They are care-list items, not notifications or bookings. Conversations are transient and reset on refresh or sign-out.
- Free cloud inference is not silently enabled for patient content. See [Gemini API data-use terms](https://ai.google.dev/gemini-api/terms) before changing this policy.

## Sources and design refinement — 17 September 2026

- The companion and public site use a more confident editorial hierarchy: larger readable type, restrained proof labels, generous spacing, a wide product demonstration and clearer record-source context. Hubble's current public site informed the centered headline, evidence-led product preview and compact status language; NutritiScan keeps its own ivory, forest and terracotta identity, content and components.
- A new Sources & access screen lists each saved report, its recorded import method, confirmation time and optional SHA-256 file fingerprint. Older records correctly say that source details were not recorded. The original file is still processed in the browser and is not stored.
- Each report has a persisted “Use in assistant” control. Disabled reports remain visible in My records and account exports but are excluded at the shared record-tool boundary from future assistant summaries, comparisons and generated visit questions.
- Changing assistant access starts a fresh local conversation and cancels in-flight work, preventing an answer created from an older permission snapshot from appearing afterward. This control does not delete earlier answers a person may have copied or seen.
- Source labels and file fingerprints are user-supplied provenance aids, not provider verification, clinical validation or proof that reviewed fields still match the original file. Hospital connections and automatic retrieval remain planned and unavailable.

## Daily log — 17 September 2026

- A new **Daily log** screen records meals, water, sleep, mood, symptoms, medicines and activity in a few taps. Each calendar day is one encrypted record (`kind = 'day'`, AES-256-GCM like other records), versioned so concurrent edits fail instead of overwriting. Day logs sit outside the 500 report/task quota and are capped at 400 days per account; the workspace loads the latest 120.
- Meals are estimated with the existing Indian-first food table and portion vocabulary (roti, dal, katori…). Unrecognised meals are stored as notes and never given a guessed estimate.
- The companion understands first-person notes (“had 2 idli for breakfast, slept 7 hours”, “2 glass paani piya”), shows the proposed entries and saves them only after the person confirms. Symptoms are logged only on explicit request (“log symptom: …”), and urgent-care escalation still runs first.
- Questions about the log (“what did I eat today”, “how did I sleep this week”, “weekly summary”) are answered deterministically from the record. General education questions such as “how can I understand my sleep?” are not redirected to the log.
- “What stands out” lists observations only from logged data, each with its sample size: short average sleep, lower mood after short nights, repeated symptom days, estimated protein and logging consistency. These are not diagnoses and do not imply causes.
- Migration: the `ns_records` kind check is widened to include `day`, the quota recount excludes day logs, and a unique `day_key` (a hash of account and date) makes concurrent first writes for one date fail instead of duplicating it. Export returns all stored days (up to 400); the workspace shows the latest 120. A failed save keeps what the person typed. Run `node scripts/workspace-migrate.mjs` before deploying.

### Validation and limits

The new tests cover non-report routing, reference coverage, Hindi tokenisation, citation allowlists, invalid tools, urgent-context handling, medication boundaries, cancellation, and explicit follow-up confirmation. Real browser checks cover desktop/mobile home, medicine references, navigation and saved demo follow-ups. A real Qwen model download, WebGPU initialization, read-tool planning and a supported sleep-education answer were exercised in Chromium with Metal WebGPU enabled. Default headless Chromium had no compatible GPU and returned the explicit fallback. This single inference smoke test does not establish clinical performance. Software tests do not establish clinical reliability. Small general-purpose models can be inaccurate; this remains an educational experiment.

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

The test runner explicitly uses `NODE_ENV=test` even inside a production hosting build and strips database, model and encryption credentials from the child process. The subsequent Next.js build retains its own production configuration. This fixes the React `act` production-bundle failure that blocked the previous release and prevents isolated tests from connecting to the live database.

## Production configuration

Use a persistent Postgres database. This deployment uses a dedicated Neon free-plan database in Singapore connected to Vercel. Free quotas and cold-start latency apply; configure monitoring and capacity limits before a larger rollout.

Required values:

| Variable               | Meaning                                                                  |
| ---------------------- | ------------------------------------------------------------------------ |
| `DATABASE_URL`         | TLS Postgres connection (pooler supported, prepared statements disabled) |
| `HEALTH_DATA_KEY`      | Random 32-byte key encoded as 64 hex characters; back up securely        |
| `APP_ORIGIN`           | Exact trusted browser origin, e.g. `https://www.nutritiscan.com`         |
| `NEXT_PUBLIC_SITE_URL` | Same canonical site URL for metadata                                     |

Run `npm run migrate:workspace` with `DATABASE_URL` supplied before deployment. Migration takes an advisory lock and only adds `ns_*` workspace tables; old patient/consultation tables are retained. Use an isolated database branch to test later migrations against representative synthetic records.

The migration owner and application currently use the integration-provided database role. A separate least-privilege runtime role is a recommended hardening step before handling sensitive data at scale. Do not give the browser database credentials.

Encryption is server-side, not end-to-end: the application operator can decrypt records. Losing the encryption key loses access to the records. Rotation requires a deliberate decrypt/re-encrypt migration; replacing the key alone will break access. Establish and test a restricted backup/restore procedure for both data and keys.

Deploy with the existing Vercel project. After deployment, run:

```sh
SMOKE_ORIGIN=https://www.nutritiscan.com node scripts/smoke-workspace.mjs
```

The working public origin is `https://www.nutritiscan.com`. The apex `nutritiscan.com` currently resolves to registrar parking; Vercel domain inspection recommends updating its A record to `76.76.21.21` at the external DNS provider. Keep canonical metadata and `APP_ORIGIN` on the working www origin until DNS and redirects are verified. Production credentials marked Secret cannot be downloaded by the CLI; `[SENSITIVE]` placeholders in env-pull output are not valid local secrets.

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

The release uses authored summaries in `lib/workspace/health-library.ts`, including [MedlinePlus lab-result guidance](https://medlineplus.gov/lab-tests/how-to-understand-your-lab-results/) and hand-authored synthetic report fixtures. It does not ship a patient dataset or claim training on medical data. Record source URL, usage rights, revision, geography and clinician review for every future knowledge entry. Do not ingest arbitrary scraped patient records or assume every MedlinePlus-linked third-party page has the same reuse terms.

## Before clinical or paid launch

- Qualified clinicians review intended use, escalation wording, language coverage and representative failure cases; measure false negatives and unsafe advice, not only answer fluency.
- Establish the applicable privacy, clinical and regulatory operating model, a real support process, incident response, retention period, consent/version audit and legal review.
- Add verified contact recovery, abuse controls/bot challenges, MFA and account security events; test load, cross-account access and restore/recovery.
- Build clinician hand-off with real availability and ownership if offering consultations. No doctor network, diagnosis, prescribing, treatment plan, automatic booking or emergency monitoring is implemented.
- Add a real hosted payment processor with signed webhooks, entitlements, idempotency, refunds and cancellation before selling subscriptions. There is no billing flow in this release.
- Image OCR, meal analysis, family accounts, clinical interpretation of longitudinal changes and email/push reminders remain future work. Numerical history and source-linked trend views are available.

Do not market this build as a replacement for a doctor, a medical device approval, or the best health agent in the market.

## Continuous deployment gate

`vercel.json` runs `npm run verify` for every deployment and places functions in Singapore near the database. A failing software/evaluation gate blocks publication. The current GitHub CLI token lacks workflow scope, so this release uses the Vercel build gate rather than adding a GitHub Actions workflow that cannot be pushed with those credentials.
