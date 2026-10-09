# NutritiScan shared health service

FastAPI API for the web `/health` workspace and Android shared-account screens. This is an engineering prototype, not a clinically validated product.

## What works

- Opaque, revocable bearer sessions; scrypt password hashing; HMAC email index and encrypted account email.
- Explicit, versioned consent for health storage, with separate optional cloud AI processing. No training pipeline exists.
- Per-account access on every health query and original-file download. AES-GCM encrypted record, document metadata and conversation content, with owner-associated authentication.
- Private, application-encrypted original documents in S3-compatible storage; encrypted local files only for development.
- PDF text extraction and image OCR; source-page snippets and proposed measurements stay separate from confirmed health memory. Unreadable scans and missing dates require manual review. The prototype does not infer dates or automatically interpret values.
- Patient-confirmed FHIR R5 Observation, DiagnosticReport and DocumentReference records. Patient-entered medicines use MedicationStatement, not an invented prescription/MedicationRequest.
- Exact trends from structured records; known hemoglobin g/L↔g/dL normalization, with unsupported units kept in separate series.
- A LangGraph supervisor selects specialized record, lab, nutrition, medication-boundary and doctor-summary tools. At most one optional LLM call rephrases a deterministic factual summary. Original factual text remains authoritative. It does not fan out to separate LLM agents.
- Redis/Celery extraction jobs and distributed rate limits when configured. In development without Redis, extraction runs as a background task and limits are per-process.
- Encrypted conversations, audit events without clinical payloads, JSON/FHIR export and password-confirmed account deletion. Export includes document metadata; originals are downloaded separately.
- Optional OpenAI voice transcription with cloud consent; audio is not persisted by this service. The user reviews the transcript before submitting a question.

## Run locally with synthetic data

From the repository root:

```sh
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements-dev.txt
# Set HEALTH_DATA_KEY to 64 random hex characters in your shell or secret manager.
PYTHONPATH=backend .venv/bin/python -m nutritiscan.migrate
PYTHONPATH=backend .venv/bin/uvicorn nutritiscan.main:app --port 8000 --no-access-log
```

Set `HEALTH_API_URL=http://127.0.0.1:8000` in the web app's ignored `.env.local`, then run `npm run dev`. Local development uses SQLite and encrypted files under ignored `.local/`; production startup refuses SQLite or an absent private S3 bucket.

## Deploy

Use `backend/Dockerfile` for the API and worker. `backend/compose.yaml` is a VPS deployment starting point with Postgres/pgvector and Redis on a private Compose network. Copy `.env.example` to `.env`, configure the database, a separately managed encryption key, private S3 bucket and scoped credentials. Set a TLS reverse proxy in front of the loopback API; do not expose the database or Redis ports. `docker compose --env-file .env up --build -d` runs the initial schema migration before API/worker startup.

For Railway or Render, deploy this Dockerfile with independent managed Postgres/Redis and private object storage. Run `python -m nutritiscan.migrate` as a release task. Run `celery -A nutritiscan.worker worker --loglevel warning` as a separate worker. Point the web deployment's server-only `HEALTH_API_URL` at the API's HTTPS origin. Both clients use the same web proxy, so the APK needs no backend credentials or endpoint change.

Provider options are `none`, `openai`, `gemini` and `anthropic`. Set an explicit model, key and `HEALTH_MODEL_APPROVED=true` only after reviewing processing terms and intended use. Patient cloud consent still gates each provider invocation. Do not enable LangSmith/Langfuse input/output tracing for real records. OpenTelemetry API is available for metadata-only spans; an exporter is not configured in the prototype.

## Validation and remaining work

```sh
PYTHONPATH=backend .venv/bin/pytest backend/tests -q
.venv/bin/ruff check backend --select E9,F
```

Tests cover patient isolation, consent revocation, encrypted content, source confirmation, exact trends, unknown units, emergency/medicine boundaries, export and deletion. These are engineering checks, not clinical evidence. Extraction coverage is deliberately narrow: no full clinical parser, validated triage engine, drug interaction database, clinician sign-off workflow or wearable integration ships here.

`migrations/0001_document_search.sql` reserves an owner-scoped pgvector table with row-level security and no access policy. Embedding generation and semantic retrieval are **not active**; exact health facts always come from structured records. FHIR output is a focused R5 mapping, not a certified FHIR server; formal profile validation and terminology integration remain required. Initial table creation is included; later schema changes need versioned migration/recovery design.

Before real patient use: clinical evaluation; authenticated ingress/global rate limiting; TLS; security/privacy review; disaster recovery and key rotation; backup retention/deletion; data residency and provider processing review; and intended-use regulatory review. India privacy requirements must be reviewed with qualified counsel; the repository does not claim compliance certification.
