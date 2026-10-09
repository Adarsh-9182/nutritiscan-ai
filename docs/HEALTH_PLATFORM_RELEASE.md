# Personal health workspace release

## Resulting product

NutritiScan's landing page and Android home now describe a personal health companion, using the existing website's midnight, lime and mint styling and plus mark. The former hospital-workflow marketing has been replaced; fictional discharge demos and research pages are retained.

The public chat stays browser-based and now defaults to one supervisor with action tools. Separate specialist-model delegation is retained behind `HEALTH_MULTI_AGENT_ENABLED=true` for evaluation. The Android JSON bridge uses the same deterministic triage and answer-validation path, discloses demonstration fallback, and requires explicit chat consent. Local app conversations persist, can be reopened and are deleted with local health data.

The separate shared workspace introduces FastAPI, Postgres/S3 storage, consent, confirmed reports and exact longitudinal record retrieval. Web cookies are HttpOnly; native tokens use SecureStore. Native chat uses shared records when a shared account is connected and signed in, and does not silently switch a shared-record conversation to public chat after logout/expiry.

## What must be deployed

Deploy `backend/Dockerfile` as an API and an independent worker, provision private PostgreSQL/Redis/S3, run the schema migration and set the web deployment's `HEALTH_API_URL`. The frontend does not provision infrastructure or bundle server/model secrets. Until connected, web and app show an explicit service-setup state. Optional voice and AI rendering require an approved provider and patient cloud-processing consent.

The Android APK is built as a standalone release, signed with a persistent private key stored as GitHub Actions secrets. `v*` tags publish APK/checksum assets as prereleases. Native directories and signing materials are ignored.

## Memory and safety

- Structured facts: patient-entered/confirmed FHIR records in account-owned encrypted database rows. Dates and lab values are queried exactly; supported hemoglobin units normalize to g/dL.
- Documents: original encrypted reports plus encrypted extraction drafts, source snippets and page information. No draft candidate is treated as a confirmed fact.
- Conversations: encrypted, account-owned history on the service; the separate public app history stays local.

The supervisor routes to deterministic bounded tools. Medication questions return recorded history and require a pharmacist/doctor for interaction or dosing decisions. Emergency phrases route to urgent-care information. General clinical knowledge is limited rather than invented. Optional AI may rephrase a factual summary; the original exact facts remain authoritative. None of these engineering checks certify clinical correctness.

## Remaining scope

Report extraction is intentionally narrow, and scanned PDFs that lack text require manual transcription in this version. Image OCR uses Tesseract in the service container. Semantic embeddings/pgvector retrieval, prescription ingestion, certified FHIR profiles, clinical sign-off, comprehensive multilingual triage, evidence retrieval and verified drug interaction integrations are not completed. Wearables are not integrated. Langfuse is not configured; health content must not be enabled in external tracing without a separate privacy review. FHIR MedicationRequest is reserved for actual sourced prescriptions; patient-entered medicine lists use MedicationStatement.

Backup deletion/retention, encryption-key rotation, verified email/password recovery, clinician validation and jurisdiction-specific privacy/regulatory review are required for real patients. The current release is an educational engineering prototype.
