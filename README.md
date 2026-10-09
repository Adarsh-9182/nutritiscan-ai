# NutritiScan

An educational personal health companion for web and Android. The public health chat is live at [nutritiscan.com](https://nutritiscan.com); [Android APK releases](https://github.com/Adarsh-9182/nutritiscan/releases) use the same midnight/lime/mint design.

The `/health` workspace adds account-scoped reports, confirmed lab trends, health history, record questions, doctor summaries and privacy controls. It requires a separately deployed [FastAPI health service](backend/README.md); until `HEALTH_API_URL` is configured, the dashboard and Android shared-record screens clearly show that the service is not connected. Public chat and the app's local journal remain independent.

## Start the web app

```sh
npm ci
npm run dev
```

`/` is the personal-health landing page, `/chat` the public educational chat, `/health` the shared health workspace, and `/research` the existing research surface. `/discharge-demo` retains fictional demonstration workflows.

Public AI chat uses the configured provider credentials described in `.env.example`. Without a working provider it has limited demonstration behavior. The Android transport at `/api/mobile/chat` labels that fallback. A single supervisor handles the normal public-chat path; `HEALTH_MULTI_AGENT_ENABLED=true` retains separate LLM delegation only as an evaluation experiment.

## Shared architecture

Next.js web and Expo Android use the same authenticated web proxy at `/api/health/*`. The Next.js server forwards to FastAPI using its server-only `HEALTH_API_URL`; web access tokens remain in an HttpOnly cookie, and Android tokens use SecureStore.

The FastAPI service uses PostgreSQL for structured FHIR records and encrypted conversations, private encrypted S3-compatible storage for originals, Redis/Celery for extraction, and a LangGraph supervisor with bounded specialized tools. Report candidates never become health memory before user review and confirmation. Exact trends use saved measurements; supported units are normalized and unknown units stay separate. Patient-entered medication history uses MedicationStatement rather than an invented prescription. Account export and deletion are available after storage consent is revoked.

[Backend setup, deployment and current limits](backend/README.md) · [Implementation notes](docs/HEALTH_PLATFORM_RELEASE.md)

Semantic embedding retrieval, a verified interaction database, wearables, formal FHIR validation and clinician sign-off workflows remain future work. The pgvector migration is reserved infrastructure, not an active memory pipeline.

## Checks

```sh
npm run verify
PYTHONPATH=backend .venv/bin/pytest backend/tests -q
.venv/bin/ruff check backend --select E9,F
```

The GitHub workflow checks both web and backend. Tests use synthetic data and do not establish clinical validity.

Educational prototype for adults 18+. Not a diagnosis, prescription, emergency service or replacement for a clinician. Clinical evaluation, security/privacy review, provider processing review and intended-use regulatory review are required before real patient use. Do not commit API keys, signing keys or patient records.
