# NutritiScan

NutritiScan is a supervised research agent for human biology. The Mac application
is the primary workspace: open a project, inspect evidence and data, propose an
analysis, review and run it, then preserve results and a reproducible record.
The active [product roadmap](docs/RESEARCH_PRODUCT_ROADMAP.md) focuses first on
cancer biology and treatment-resistance research, with measurable delivery gates.

The web workspace now adds an investigator-editable study protocol alongside
each question's selected evidence: question, methods, eligibility, outcomes,
sample-size rationale, analysis and ethics/data management. Missing choices stay
blank; drafts preview/export with their bibliography and survive conversation
reload and backups. This is a working draft editor, not automatic protocol
generation, scientific validation or institutional sign-off.

The [Mac biology workspace](desktop/README.md) adds project files, literature,
CSV/FHIR inspection, persistent context, a terminal and the user's existing
Codex/ChatGPT sign-in. Version 0.4.0 adds a PDF/PMC paper library, original-page previews, exact passage
citations and source verification alongside the 0.3.0 analysis proposals, local
profiles/grouped summaries/correlations, result charts and source-hashed receipts. It does not yet execute arbitrary Python/R or ingest public cancer
cohorts. The web and Mac project formats remain separate.
The website's [Mac download page](https://www.nutritiscan.com/download)
links a versioned GitHub Release ZIP, shows install requirements and the archive's
SHA-256, and labels the build as an Apple Silicon preview that is not notarized.

The earlier educational personal-health chat and Android app remain separate
surfaces. [Android APK releases](https://github.com/Adarsh-9182/nutritiscan/releases)
use the same midnight/lime/mint design. They are not the active research roadmap.

The `/health` workspace adds account-scoped reports, confirmed lab trends, health history, record questions, doctor summaries and privacy controls. It requires a separately deployed [FastAPI health service](backend/README.md); until `HEALTH_API_URL` is configured, the dashboard and Android shared-record screens clearly show that the service is not connected. Public chat and the app's local journal remain independent.

## Start the web app

```sh
npm ci
npm run dev
```

`/` is the research product landing page, `/download` the Mac preview download,
`/research` the web research workspace, `/chat` the earlier educational chat and
`/health` the separate shared health workspace. `/discharge-demo` retains fictional
demonstration workflows.

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

Educational prototype for all ages. Younger users should involve a parent or guardian when sharing personal health information. Not a diagnosis, prescription, emergency service or replacement for a clinician. Clinical evaluation, security/privacy review, provider processing review and intended-use regulatory review are required before real patient use. Do not commit API keys, signing keys or patient records.

## Research chat

Open `/research` for the chat-first human-biology research workspace. It reuses
the public-source plugin gateway while keeping research conversations separate
from health memory. Follow-ups carry a bounded selection of the current research
conversation, and the public search query is separately visible and editable.

Configure `GOOGLE_GENERATIVE_AI_API_KEY` on the server to enable model reasoning.
Research uses direct Gemini only: `gemini-3.8-flash`, then `gemini-3.6-flash`, then
`gemini-3.5-flash-lite`. These models have advertised free-tier access; eligibility,
availability and quota depend on your Google project. A paid Google project can
still be billed. Research never falls back to the paid AI Gateway. Free-tier
content may be used for product improvement; use public research data.

Each finding must cite retrieved sources and exact excerpts. A separate model
pass checks source support; unsupported findings are withheld. These checks do
not establish scientific truth, clinical efficacy or hypothesis novelty. Missing
credentials, failed checks and exhausted quotas produce a labelled source
collection rather than an invented AI answer. Local tests use synthetic sources;
a live provider call is not verified by those tests.

The web release supports literature-based research, hypothesis drafting and study
planning. It does not execute code, analyze uploaded datasets, conduct lab
experiments, validate disease cures or establish human age reversal. Research
history is device-local (eight conversations, twelve turns each, 1 MB total), not
account-synced or a background execution service. Interrupted runs can be retried
as fresh searches. See [research chat implementation](docs/RESEARCH_CHAT.md).
