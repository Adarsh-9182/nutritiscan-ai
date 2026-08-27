# NutritiScan — Architecture

> Status: design document. Describes both what exists today and the target
> system. Every "target" section states what is *not* built yet, explicitly.
> Nothing in this document should be read as a description of shipped behaviour
> unless it is in [Current State](#1-current-state).

---

## 0. The thesis

The chatbot is the interface. The product is the clinical intelligence
underneath it: the data model, the safety architecture, the evidence layer, the
patient context engine, and the evaluation harness.

The model is a replaceable component. Everything else is the asset.

The architectural rule that follows from this, and which the rest of this
document exists to enforce:

> **The LLM is never the source of truth for clinical state, and never the last
> thing that runs before a user sees an answer.**

Today the codebase violates the second half of that rule. See §3.

---

## 1. Current state

A deployed Next.js 16 / React 19 application. ~6,900 lines, 94 unit tests,
TypeScript throughout. No backend, no database, no accounts.

### 1.1 What works, and should not be rewritten

| Component | File | What it does |
|---|---|---|
| Supervisor + specialists | `lib/agents/index.ts` | 5 specialists (Nutrition, Fitness, Doctor, Lab, Coach) behind a routing supervisor, via `ToolLoopAgent` |
| Per-specialist context scoping | `lib/memory/profile.ts` | Each specialist declares which memory sections it needs; Supervisor and Doctor keep all of them |
| Safety prompt + reasoning format | `lib/agents/safety.ts` | `SAFETY` block; `MEDICAL_REASONING_FORMAT` enforces Facts / Inference / Recommendation / Medical Warning / Confidence |
| Input sanitization | `lib/memory/schema.ts` | Zod shape validation + free-text flattening. Strips control chars, zero-width/bidi, `[...]` delimiters, the literal strings `END MEMORY` / `USER HEALTH MEMORY`, and `system:` / `assistant:` / `user:` openers. Applies to model-authored meal titles too |
| Deterministic nutrition | `lib/nutrition/analyze.ts`, `foods.ts` | 56 foods, Indian staples first. Parses portions, computes macros/micros, scores against *this* user's target. Keyless — the model identifies, this file decides meaning |
| Evidence-grounded insights | `lib/health/insights.ts` | Every claim carries `certainty`, `confidence`, `evidence[]`, `limitations[]`. Confidence is derived from sample size, never asserted |
| Patient-history retrieval | `lib/memory/recall.ts` | Embedding similarity over journal + meals; degrades to `null` on failure |
| Request guards | `lib/http/guard.ts` | Per-instance rate limiting, hard body caps, shared credential check |
| Journal / timeline | `lib/memory/journal.ts`, `lib/health/timeline.ts` | Dated, append-only. Nothing inferred, nothing back-dated |

Several of these already satisfy spec requirements that a from-scratch build
would get wrong:

- `insights.ts` implements §22's calibrated-category requirement
  (`known / likely / possible / unknown`) and derives the number from sample
  size. It does not invent an "87% chance".
- `blankProfile` exists because first-run once patched user answers on top of
  the demo profile, leaving a stranger's biomarkers in place. The product told
  real people they had a deficiency it had invented. That class of bug is the
  reason §4 exists.
- `analyze.ts` refuses to attribute micronutrients to a food it could not
  resolve — an unmatched item has no `foodId` and contributes nothing to B12,
  iron, vitamin D or calcium totals.

### 1.2 The current request path

```
Browser (localStorage: profile, meals, transcript)
   │  POST /api/chat  { messages, profile, meals }
   ▼
guard: rate limit → body cap
   ▼
safeProfile() / safeMeals()          ← sanitize, never trust the client
   ▼
nutritionContext() + recallRelevant()
   ▼
buildSupervisor() ──tool──▶ 5 specialists
   ▼
stream chunks straight to the browser   ← NOTHING INSPECTS THE OUTPUT
```

The last line is the problem. See §3.1.

---

## 2. Target architecture

```
                             User
                              │
                    ┌─────────▼──────────┐
                    │ Conversation layer │
                    └─────────┬──────────┘
                              ▼
   L1  ┌──────────────────────────────────────┐
       │ Input safety classifier              │
       └──────────────────┬───────────────────┘
                          ▼
       ┌──────────────────────────────────────┐
       │ Patient Context Engine               │  canonical state, Postgres
       └──────────────────┬───────────────────┘
                          ▼
       ┌──────────────────────────────────────┐
       │ Clinical Intake Engine               │  next-question selection
       └──────────────────┬───────────────────┘
                          ▼
   L2  ┌──────────────────────────────────────┐
       │ TRIAGE — deterministic red flags     │──▶ EMERGENCY: stop, escalate
       └──────────────────┬───────────────────┘
                          ▼
       ┌──────────────────────────────────────┐
       │ Evidence Retrieval  (guidelines RAG) │  + Knowledge Graph
       └──────────────────┬───────────────────┘
                          ▼
       ┌──────────────────────────────────────┐
       │ Clinical Reasoning → ClinicalState    │  structured, not prose
       └──────────────────┬───────────────────┘
                          ▼
       ┌──────────────────────────────────────┐
       │ Specialist Agents (fan-out)          │
       └──────────────────┬───────────────────┘
                          ▼
       ┌──────────────────────────────────────┐
       │ Critic Agent — tries to be wrong     │
       └──────────────────┬───────────────────┘
                          ▼
   L3  ┌──────────────────────────────────────┐
   L4  │ Validators: clinical / medication /  │
   L5  │ recommendation / evidence            │
       └──────────────────┬───────────────────┘
                          ▼
       ┌──────────────────────────────────────┐
       │ Clinical Synthesis → response        │
       └──────────────────┬───────────────────┘
                          ▼
   L6  ┌──────────────────────────────────────┐
       │ Final response safety check          │──▶ fail: withhold, escalate
       └──────────────────┬───────────────────┘
                          ▼
   L7  ┌──────────────────────────────────────┐
       │ Escalation / doctor handoff          │
       └──────────────────┬───────────────────┘
                          ▼
                   Patient Memory (write-back)
                          ▼
                   Follow-up / Monitoring
```

Layer numbering (L1–L7) is the §21 safety stack. It is specified in
`SAFETY.md`, not here.

---

## 3. Gap analysis

Ordered by risk, not by spec section number.

### 3.1 Emergency triage is a prompt, not a layer — **critical**

§6 requires a deterministic classifier that runs *before* clinical reasoning
and can halt the pipeline.

Today, red-flag handling is these two lines inside a system prompt:

```
- Surface RED FLAGS that warrant urgent in-person care, and say so plainly.
- For emergencies (chest pain, trouble breathing, stroke signs, severe bleeding,
  suicidal thoughts) tell the user to seek emergency care immediately
```

A prompt is a request, not a guarantee. It can be diluted by a long context,
outvoted by a specialist's fluent answer, or simply not followed. There is no
code path in the repository that can stop the supervisor from discussing
differential diagnoses while the user is describing crushing chest pain.

**Target:** `lib/safety/triage.ts` — a deterministic rule engine over the
structured `ClinicalState`, running before retrieval and reasoning, with the
authority to terminate the turn and emit a fixed escalation response. Rules,
not generation. Specified in `SAFETY.md §2`.

### 3.2 No canonical patient state — **critical**

§4: "structured systems must own the canonical patient state."

Today the browser owns it. `localStorage` holds biomarkers, medicines and
conditions; the client POSTs them on every request; the server sanitizes them
and throws them away. Consequences:

- No audit trail. Nobody can answer "what did the system know when it said that?"
- No provenance. A value the *model* extracted from a lab report is
  indistinguishable from one the *user* typed.
- No cross-device continuity, no export, no deletion, no consent record.
- Embeddings are recomputed per request because there is nowhere to cache them
  (`recall.ts` says so in its own header comment).
- Health data sits in `localStorage`, readable by any script on the origin,
  never evicted. `store.ts` flags this and points here.

**Target:** Postgres as the system of record, with provenance on every clinical
fact. Specified in `DATA.md`.

### 3.3 No medical evidence layer — **high**

§10, §11, §12 do not exist in any form. Agents reason from pretrained knowledge
and cite nothing. The landing page's "RAG" claim refers to `recall.ts`, which
retrieves the *patient's own history* — that is patient memory, not medical
evidence.

**Target:** guideline corpus → chunk → embed → pgvector, hybrid retrieval with
metadata filtering and reranking. Every clinical claim in a response must carry
a retrieved source or be marked as general knowledge. Specified in
`ORCHESTRATION.md §6`.

### 3.4 Nothing validates the output — **high**

§21 L3–L6. All existing safety is input-side (sanitization) or prompt-side
(instructions). The stream in `app/api/chat/route.ts` forwards model chunks
directly to the client.

This also means the `MEDICAL_REASONING_FORMAT` contract is unenforced. If the
model skips the **Medical Warning** section, nothing notices.

**Target:** validators between synthesis and emission, and a buffered
(not straight-through) stream for any turn classified as clinical.
Specified in `SAFETY.md §4`.

### 3.5 Reasoning is prose, not structure — **high**

§7 requires a structured internal representation (`chief_complaint`,
`differential`, `red_flags`, `missing_information`, …). Today the reasoning
exists only as formatted text produced by a prompt. Nothing downstream can
inspect it, validate it, store it, or evaluate it — which is precisely why
§3.1 and §3.4 are hard to fix without it.

`ClinicalState` is the keystone of this whole redesign. Specified in
`ORCHESTRATION.md §3`.

### 3.6 Lab reference ranges are hardcoded universals — **high**

§15: "Reference ranges can differ between laboratories. Never assume a
universal reference range."

`lib/memory/labs.ts` does exactly that — B12 `< 200` is "low" for everyone,
regardless of the issuing lab, assay, age or sex. There is also no unit
normalization: a report in pmol/L would be read as pg/mL.

**Target:** store `reference_low` / `reference_high` / `unit` / `lab_name` as
they appear *on the report*, and fall back to a documented default range only
when the report omits them — labelled as such. Specified in `DATA.md §4`.

### 3.7 Medication intelligence absent — **high**

§16. `medicines` is `string[]`. No RxNorm/ATC coding, no interaction checking,
no allergy cross-check against drug class. The Doctor Agent is told not to
prescribe, which is necessary but unrelated: the risk here is failing to *warn*.

### 3.8 No critic, no consensus — **medium**

§9. The supervisor synthesizes specialist output; nothing challenges it.

### 3.9 No adaptive intake — **medium**

§5. Every turn is one-shot. There is no clinical-state uncertainty model and
therefore no next-question selection.

### 3.10 No evaluation, no observability — **medium, blocking for launch**

§27, §28, §29. 94 unit tests cover parsing, scoring and sanitization. Zero
clinical evaluation. There is no golden dataset, no red-flag recall metric, no
CI gate. Under §41 no clinical feature in this repository is currently "done".

### 3.11 Model abstraction is partial — **low**

§24. `MODEL` is a single exported string routed through Vercel AI Gateway,
which already provides provider portability. The `MedicalModel` interface is
not present, but the coupling is one constant, not a rewrite.

---

## 4. Open decision: implementation stack

**This decision is not made. It is flagged here rather than assumed.**

§30 suggests Next.js + FastAPI + PostgreSQL + pgvector + Redis.

The existing 6,900 lines are TypeScript, tested, deployed, and encode a lot of
hard-won judgment about honesty in health output. A Python rewrite discards
that to gain a language.

**Recommendation: stay TypeScript.** Add Postgres + pgvector + Redis; build the
new engines as a modular monolith inside the Next.js app (§31 explicitly warns
against starting with microservices). Introduce Python only when something
specifically needs it — a self-hosted vision model, a fine-tune, a classical ML
triage classifier — as a separate service behind an HTTP boundary, not as the
default runtime.

Nothing in `DATA.md`, `API.md`, `SAFETY.md` or `EVALUATION.md` depends on this
choice: the schema is SQL, the contracts are HTTP, the safety rules and eval
cases are language-agnostic. Only `ORCHESTRATION.md`'s code sketches assume
TypeScript, and they are sketches.

**Confirm or override before Phase 2 implementation begins.**

### 4.1 Second open decision: regulatory target

§37 names India as the initial market. This is consequential and not yet
reflected anywhere in the codebase:

- India's DPDP Act 2023, not HIPAA. Different consent, breach-notification and
  data-principal-rights obligations.
- Data residency expectations differ, which constrains where Postgres and the
  model provider may run.
- The line between "wellness information" and regulated medical-device software
  is drawn differently, and the current product's symptom triage sits near it.

I am not qualified to resolve this and will not guess. Treated as an
input to Phase 2 planning, tracked here so it is not discovered late.

---

## 5. Module boundaries

Modular monolith. One deployable, hard internal seams, so that extraction later
is mechanical.

```
lib/
  patient/        canonical profile, provenance, consent          [new]
  intake/         adaptive interview, uncertainty model           [new]
  safety/
    triage.ts     deterministic red-flag engine                   [new]
    validators/   clinical, medication, recommendation, evidence  [new]
    prompts.ts    SAFETY, MEDICAL_REASONING_FORMAT      [move from lib/agents/safety.ts]
  clinical/
    state.ts      ClinicalState type + reducers                   [new]
    reasoning.ts  differential generation                         [new]
    critic.ts     adversarial review                              [new]
    synthesis.ts  final assembly                                  [new]
  evidence/
    ingest/       source → chunk → metadata → embed               [new]
    retrieve.ts   hybrid search + rerank                          [new]
    graph.ts      knowledge graph queries                         [new]
  medication/     coding, interactions, contraindications         [new]
  labs/           OCR, extraction, unit normalization        [rewrite of memory/labs.ts]
  nutrition/      analyze.ts, foods.ts                            [keep]
  memory/         recall.ts, journal.ts, meals.ts     [keep; repoint store.ts at API]
  agents/         specialist roster                        [keep, expand to 10]
  models/         MedicalModel abstraction                        [new]
  observability/  tracing, metrics, redaction                     [new]

evals/            golden cases + runners                          [new]
```

Rules across seams:

1. `lib/clinical/**` may not call a model provider directly. It goes through
   `lib/models/**`.
2. `lib/safety/triage.ts` may not call a model at all in its rule path. A model
   may *add* suspicion; it may never *remove* a rule-triggered flag.
3. Nothing outside `lib/patient/**` writes canonical patient state.
4. Nothing outside `lib/evidence/**` decides what counts as a citation.

---

## 6. Phasing

Mapped onto §38, reordered so that the two critical gaps land first. §38's
Phase 1 (nutrition) is substantially complete already.

| Phase | Delivers | Gaps closed |
|---|---|---|
| **0. Foundations** | `ClinicalState`, `MedicalModel`, eval harness skeleton, golden-case format, observability spine | 3.5, 3.10, 3.11 |
| **1. Triage** | Deterministic red-flag engine, pipeline halt, escalation response, triage eval suite with a CI gate | 3.1 |
| **2. Persistence** | Postgres + pgvector, provenance model, auth, audit log, migration off localStorage, consent + export + deletion | 3.2 |
| **3. Output safety** | Buffered clinical stream, L3–L6 validators, format enforcement | 3.4 |
| **4. Evidence** | Guideline ingestion, hybrid retrieval, citation enforcement | 3.3 |
| **5. Clinical depth** | Full specialist roster, critic, consensus, adaptive intake | 3.8, 3.9 |
| **6. Labs & meds** | OCR, unit normalization, per-report ranges, medication coding + interactions | 3.6, 3.7 |
| **7. Human care** | Consultation summary, doctor handoff, clinician review loop | §19, §20 |

Phases 0 and 1 are prerequisites for everything else: without `ClinicalState`
there is nothing for triage to inspect, and without triage nothing else should
ship.

Phase 2 is a prerequisite for Phase 4 (nowhere to cache embeddings) and for any
claim of §41 completeness (no audit trail).

---

## 7. Definition of done

Per §41, a clinical feature is complete only with functionality, security,
privacy, medical safety, evidence grounding, evaluation, observability, error
handling and documentation.

Practical gate for this repository:

- [ ] Unit tests for the deterministic parts
- [ ] Integration test through the real pipeline
- [ ] Safety test: the feature cannot suppress or bypass a triage flag
- [ ] Golden-case coverage; `npm run eval` passes the regression threshold
- [ ] Traced, with health data redacted from logs
- [ ] Degrades honestly when the model, retrieval or database is unavailable
- [ ] Documented here or in the relevant `docs/` file

The last item is not bureaucracy. Every non-obvious refusal in this codebase —
why `blankProfile` exists, why unmatched foods contribute no micronutrients,
why the chat route inspects chunk types — is written down at the site of the
decision. That habit is why the existing code is trustworthy, and it is the
cheapest safety mechanism available.

---

## 8. Related documents

- `DATA.md` — database schema, provenance, retention, privacy
- `API.md` — HTTP contracts, auth, audit, error envelope
- `ORCHESTRATION.md` — `ClinicalState`, the reasoning loop, agents, evidence
- `SAFETY.md` — the seven layers, red-flag rules, fail-closed behaviour
- `EVALUATION.md` — golden dataset, suites, CI gates
