# NutritiScan: health companion and connected records

Updated: 16 September 2026. This is the delivery plan, not a claim that the target system is already built.

## 1. Product direction

**One place to ask a health question, bring together the relevant history, understand the evidence, and take a confirmed next step.**

The long-term product covers everyday health questions, symptoms, medicines, nutrition, sleep, mental wellbeing, preventive care and longitudinal health records. Reports are one input. The conversation is the main interface.

The first complete user journey is deliberately concrete:

1. A person asks a question about their health.
2. The companion clarifies the question and identifies information it lacks.
3. The person imports relevant records or authorizes a supported connection.
4. The system separates patient statements, source records and general evidence.
5. It explains supported information and helps prepare for appropriate care.
6. The person reviews a visit brief or follow-up before anything is saved or shared.
7. The next conversation can use explicitly saved context with visible provenance.

Breadth is the product ambition. Each supported workflow must have a tested boundary. Do not market an educational model as an autonomous doctor, or imply that good software tests establish clinical accuracy.

### Initial audience and geography

Initial audience hypothesis: adults managing their own health questions across appointments and scattered records. Validate this with user interviews before expanding into clinic operations or insurance workflows.

Geography is a pending product decision. Build the shared upload/import and consent infrastructure first. An India-first product should investigate ABDM/ABHA through the official sandbox. A US-first product should evaluate patient-authorized EHR/FHIR integrations or a retrieval partner. Do not assume a US integration covers Indian hospitals, or imply access to all providers.

## 2. What Hubble contributes to the direction

Hubble is listed in YC Summer 2026. Its stated product retrieves medical records through an API using patient authorization, healthcare-system integrations and browser/voice agents where standard connections are insufficient. Its site describes normalized records, source traceability and patient control. These are vendor descriptions, not an independent coverage audit. Sources: [YC company profile](https://www.ycombinator.com/companies/hubble-ai), [Hubble](https://www.hubble.ai/), [patient-mediated access](https://www.hubble.ai/solutions/patient-mediated-access).

For NutritiScan, this becomes the **Connected Health Records** module:

| Capability | NutritiScan implementation sequence |
| --- | --- |
| Patient authorizes access | Source-specific consent, purpose, record types, time window, expiry and revocation |
| Gather records from different systems | Uploads → structured imports → one approved live connector → additional connectors |
| Normalize different formats | A common health-record schema; preserve originals and unmapped fields |
| Trace values to their origins | Document/resource ID, page or field path, source time, retrieval time, extraction version and reviewer status |
| Fill retrieval gaps | Show missing, partial, failed and unsupported sources; never label an incomplete history “complete” |
| Agent-assisted retrieval | Durable jobs, retry limits, scoped credentials and reviewable activity; later browser/voice integrations |
| Keep history current | Consent-aware sync cursors, change detection and visible last-sync status |

This is not a plan to recreate a nationwide healthcare network for free. Identity verification, network access, calling, operational support and some integrations can require contracts and recurring costs. At zero budget, build the interface, data model, synthetic connectors and user-controlled imports. Evaluate build-versus-partner economics before buying or launching retrieval services. No Hubble integration or partnership exists yet.

## 3. Verified starting point

Use [WORKSPACE_RELEASE.md](WORKSPACE_RELEASE.md) for the implemented foundation. The repository contains accounts, encrypted Postgres records, PDF/text extraction with confirmation, record comparisons, visit briefs, care tasks, export/deletion, and isolated fictional demos.

Current delivery in progress: conversational home, redesigned public site, eight curated educational topics, optional browser-local open-model inference, read-tool planning and confirmed follow-up drafts. This milestone must pass its release checks before being called live.

Not implemented: comprehensive medical RAG; clinician-validated clinical reasoning; persistent consented conversation memory; live provider retrieval; identity verification; durable retrieval workers; voice calls; booking; push/email reminders; subscriptions; a clinician network.

The legacy multi-specialist code is not evidence that those features are production-enabled. Older architecture documents describe a historical baseline; do not reconnect disabled anonymous clinical endpoints to obtain an impressive demo.

## 4. Phased delivery

Work one milestone at a time. Each milestone ends in a working user journey, tests, a Git commit, deployment verification and a short release note. Estimates are planning ranges for focused engineering after prerequisites exist, not promises; external healthcare approvals have separate timelines.

### Phase 1 — Product and frontend foundation

**Outcome:** a person immediately understands what the companion can do and can complete the core journey on a phone.

- Conversational home with broad topic entry points; reports live as a supporting tool.
- Consistent typography, spacing, responsive navigation and accessible controls.
- Explicit modes: reference information, AI generation, record tools, unsupported question and urgent-care guidance.
- Real empty/loading/error/offline states, cancellation and recovery.
- Records, care list, visit brief and privacy controls connected to existing APIs.
- A future Sources screen shows available integrations and their actual connection state. Unsupported connectors are labelled unavailable, not fake “connected” buttons.

**Exit gate:** keyboard and mobile journeys pass; no horizontal overflow at supported widths; account and demo content never mix; follow-ups require confirmation; every main control has a real result. No invented testimonials, usage metrics, certifications or clinical endorsements.

**Indicative effort:** 1–2 focused weeks including user feedback. Current redesign is part of this phase.

### Phase 2 — Backend and health-data foundation

**Outcome:** the product can reliably represent more than lab values and can support retrieval later.

Keep the existing Next.js/Postgres application. Add modules and a worker boundary rather than immediately splitting into microservices.

Data entities to introduce through versioned migrations:

- `documents`: encrypted object reference, content hash, MIME type, size, owner, original source and retention state.
- `health_facts`: type, value/unit, effective time, source assertion, status and provenance. Support observations, allergies, medication statements, encounters, conditions and procedures. Patient-reported and provider-recorded are distinct.
- `source_connections`: provider, region, connector capability, connection status and encrypted credential reference.
- `consent_grants`: owner, source, purpose, data categories, date range, granted/expiry/revoked timestamps and policy version.
- `retrieval_jobs`: consent ID, source, state, attempts, last error category, sync cursor and idempotency key.
- `agent_runs` and `action_proposals`: permitted tools, state, proposed arguments, confirmation and result references.
- `audit_events`: actor, operation, affected resource, time and outcome; exclude raw health content from routine logs.
- Optional `conversations`: encrypted, opt-in retention, deletion and clearly scoped memory.

Requirements: user isolation, scoped access, payload validation, key rotation plan, optimistic updates, idempotent writes, bounded queues, dead-letter handling, backup/restore rehearsal and deletion across database/object storage/indexes. Keep model-generated content separate from source facts.

**Exit gate:** cross-account attempts fail; retries cannot duplicate actions; revoked consent prevents execution; worker restart resumes correctly; conflicting facts remain visible; restoring a backup is demonstrated with synthetic data.

**Indicative effort:** 2–3 weeks, depending on storage and worker choices.

### Phase 3 — Connected records, starting with imports

**Outcome:** different health documents become a reviewable, traceable personal history.

Build in three increments:

**3A. Upload and review**

- Existing PDF/text import plus scanned-image OCR after an extraction evaluation.
- Prescriptions, discharge summaries and visit notes alongside labs.
- Document hash deduplication, page references and confidence-aware review queues.
- Show proposed extracted facts beside the source; require review before using uncertain facts.

**3B. Structured records**

- Define a supported FHIR R4 import/export profile, not a claim of universal FHIR support.
- Start with Patient references, Observation, DiagnosticReport, MedicationStatement, AllergyIntolerance, Condition, Encounter and DocumentReference.
- Validate subject ownership, units, dates and identifiers. Preserve unsupported resources; do not silently reinterpret them.
- Use provenance and consent concepts from [HL7 FHIR Provenance](https://hl7.org/fhir/R4/provenance.html) and [FHIR Consent](https://www.hl7.org/fhir/R4/consent.html). A Consent record alone does not enforce authorization; execution must check it.

**3C. First live connection**

- Pick one supported provider or authorized aggregator in the chosen launch country.
- Add OAuth/identity flow as required, explicit data scope, revocation and audit trail.
- Real background retrieval with `queued → running → needs_user → partial/completed/failed/cancelled` states.
- Show source coverage and last successful sync. Distinguish no matching records, no authorization and connector failure.

**Exit gate:** a synthetic record imports twice without duplication; every extracted fact opens its origin; mixed-patient files are rejected; partial failures remain partial; cancelled/revoked requests stop; one approved live connector is verified before claiming automatic retrieval.

**Indicative effort:** 2–4 weeks for imports. Live integration timing depends on credentials, agreements and regional onboarding.

### Phase 4 — Health AI and evidence retrieval

**Outcome:** useful, context-aware answers that expose what is known and what is missing.

Build a curated retrieval-augmented generation pipeline (RAG: retrieve relevant evidence before asking the model to write):

1. Parse the question and check urgent/risky requests before inference.
2. Retrieve only authorized patient context relevant to the question.
3. Retrieve health evidence by topic, language, geography and freshness.
4. Generate an explanation that separates source facts from general education.
5. Validate references, unsupported numerical assertions and tool proposals.
6. Abstain or ask a clarifying question when evidence is missing or conflicting.

Use free/open models behind a replaceable provider interface. Benchmark candidates on this product’s cases before choosing them. Browser-local inference is an optional private mode, with device limitations. Larger self-hosted models require compute; an open-weight license does not make hosting free. Do not send sensitive patient content to free cloud endpoints whose terms prohibit it.

Start with high-value educational workflows across nutrition, sleep, medication literacy, common symptom intake and care preparation. Expand the topic catalogue using official source distribution, not model memory alone. Review Hindi/Hinglish content separately; English success does not demonstrate Hindi safety.

**Exit gate:** versioned evaluation set, answer/evidence alignment review, abstention tests, prompt-injection tests, conflicting-record cases, source freshness checks, language evaluation and expert review for the intended use. Release thresholds are defined with clinical reviewers before patient-specific medical guidance is offered.

**Indicative effort:** 2–4 weeks for the initial evidence pipeline; ongoing clinical review and coverage expansion.

### Phase 5 — Agent workflows

**Outcome:** a request can run a bounded, observable sequence of useful tools.

Start with one coordinator and typed tools; add specialist agents only when evaluation demonstrates a benefit.

Read tools: authorized records, source status, timeline, reference search, deterministic comparisons and existing care tasks.

Draft tools: visit brief, record-request draft, follow-up proposal and missing-information checklist.

Write tools: save a confirmed care task, launch an explicitly authorized retrieval job, or share a brief with a named recipient after preview and confirmation. External communication stays disabled until a real integration, recipient verification and explicit authorization flow exist.

Execution contract:

- `question → permitted plan → bounded read tools → evidence-backed response → proposal → confirmation → durable execution → receipt`.
- Recheck identity, authorization, consent and tool scope when executing, including queued retries.
- Cap tool calls, latency, tokens, retries and spending. Persist run state and return a real outcome.
- Keep records/attachments/tool results as untrusted input. They cannot grant privileges or change instructions.
- No self-prescribing, silent medication changes, invented appointments or unapproved outreach.

**Hubble-style browser/voice expansion:** first support one sanctioned workflow with test credentials and synthetic patients. Add domain allowlists, explicit call purpose, session isolation, human takeover, auditable artifacts and stop conditions. Production calling and portal automation require the relevant authorization and operational arrangements. Do not promise to bypass portals, CAPTCHA or provider restrictions.

**Exit gate:** a complete read → draft → approve → execute → receipt scenario survives retries, cancellation and a worker crash; unauthorized tool calls fail; no duplicate external effects; user sees partial failure honestly.

**Indicative effort:** 2–4 weeks for internal tools. External voice/browser integrations are a later milestone, not part of the free first release.

### Phase 6 — Pilot, reliability and subscriptions

**Outcome:** a small group gets measurable value from a reliable product.

- Pilot the chosen adult-user workflows with consent; collect task success, time to useful outcome, correction rates and retention.
- Track operational health without logging conversation content: availability, model load failure, response latency, connector completion, queue age and cost per completed workflow.
- Security review, dependency checks, abuse protection, account recovery, accessibility, incident response and restore/deletion drills.
- Introduce subscriptions only after repeated value and sustainable unit economics are measured.
- Billing requires provider-signed webhooks, idempotency, entitlements, quotas, clear price, cancellation, refunds and usage reporting. Choose a provider for the launch region and entity; do not invent a price now.

**Exit gate:** pilot evidence, resolved high-priority failures, support ownership, tested recovery and billing lifecycle, and appropriate professional review of product claims. Passing CI alone is not this gate.

## 5. Data and models: concrete starting set

| Resource | Use | Constraint |
| --- | --- | --- |
| [MedlinePlus XML](https://medlineplus.gov/xml.html) | Topic summaries, synonyms and source links for educational retrieval | Preserve attribution and source/version metadata; linked external pages have their own rights. Do not call it clinical validation. |
| [Synthea](https://github.com/synthetichealth/synthea) | Synthetic FHIR patients for import, consent, isolation, timeline and retrieval tests | Synthetic data tests software behavior; it does not establish real-world clinical accuracy. |
| [Qwen2.5 model card](https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct) | Current small on-device candidate | General-purpose model, not a medical model; evaluate accuracy, language behavior and hardware costs. |
| Clinician-authored synthetic cases | Symptom language, conflicting records, medication questions and escalation evaluation | Keep a separate held-out set; document reviewer agreement and unresolved cases. |
| Consented real-user records | The individual’s workspace and agreed pilot workflows | Never default these records into training, public examples or evaluation exports. |

No model fine-tuning is planned before evidence retrieval, provenance and evaluation demonstrate a need. A larger dataset is not a substitute for a sound source policy.

## 6. Delivery backlog and immediate next milestone

| Order | Milestone | Completion evidence |
| --- | --- | --- |
| Now | Finish companion/design release and push this roadmap | CI/build, real-browser checks, Git SHA and live deployment |
| Next | Health-source/provenance schema and versioned migrations | Isolated schema tests and no regressions in existing records |
| Then | Consent lifecycle and durable retrieval job service | Expiry/revocation, retry and restart tests |
| Then | Sources UI and synthetic connector | End-to-end authorized synthetic retrieval with a visible receipt |
| Then | FHIR upload and extraction review | Correct source links, subject matching and deduplication fixtures |
| Then | Broader evidence ingestion and clinical evaluation set | Reproducible source snapshot and reviewed evaluation results |
| After prerequisites | First live regional connector | Real integration access and verified consent/retrieval/revocation |

The next implementation slice is the provenance/consent/retrieval foundation, not a screen that pretends hospital connectivity exists. Keep production claims aligned with completed milestones.

## 7. How we judge progress

A YC-style demonstration should show a real transformation: a user starts with a question and scattered records, authorizes what is relevant, receives a traceable explanation, and leaves with a useful brief or confirmed action. Show what happened, what failed and what remains unknown.

Measure completed user tasks and repeat use. Do not optimize for the number of agents, decorative dashboards, claimed provider coverage or an unsupported “best medical AI” label.
