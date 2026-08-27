# NutritiScan — Data Architecture

> Status: design document. **Nothing in §3 onward is implemented.** The system
> currently has no database; see §1.
>
> `lib/memory/store.ts` points here before anyone adds accounts, sync, or a
> third-party script tag.

---

## 1. Where the data lives today

In `localStorage`, on one device, under three keys:

| Key | Contents |
|---|---|
| `ns-profile-v1` | Name, age, sex, height, weight, goal, sleep, activity, **biomarkers, medicines, conditions, allergies**, journal, trends |
| `ns-meals-v1` | Up to 200 logged meals |
| `ns-chat-v1` | Chat transcript |

This is health data in a store that is readable by any script on the origin,
never evicted, not encrypted, not backed up, and not deletable by us.

It is acceptable *only* because this build is single-device, account-less, and
sends nothing anywhere except the model provider at request time. Every one of
those conditions is about to stop being true.

### 1.1 The consequences

The client is authoritative. The server sanitizes what it receives
(`lib/memory/schema.ts`) and discards it. Therefore:

- **No provenance.** A B12 value the *user typed* and one the *model extracted
  from a photographed report* are the same shape and indistinguishable. §4 of
  the product spec says the LLM must never be the source of truth for clinical
  data; today there is no mechanism that could enforce that even in principle.
- **No audit.** "What did the system know when it said that?" is unanswerable.
- **No caching of derived data.** `recall.ts` re-embeds the entire journal on
  every chat turn because there is nowhere durable to put a vector.
- **No consent record, no export, no deletion, no residency guarantee.**

Fixing provenance is the point of this document. Everything else follows.

---

## 2. Principles

**P1 — Structured systems own clinical state.** The model reads it and proposes
changes to it. It never writes it directly. Every write is an explicit,
attributed transaction.

**P2 — Every clinical fact carries provenance.** Not metadata — a required
column. `source` is `NOT NULL` on every clinical table.

```
patient_reported     the patient told us, in their own words
document_extracted   pulled from an uploaded report; carries document_id + confidence
device_measured      from a connected device or manual vital entry
model_inferred       the system's own inference. NEVER presented as fact.
clinician_verified   a qualified human confirmed it. The only value that upgrades trust.
```

The rule that makes this worth the column: **a `model_inferred` row may never
be rendered in a "Facts" section, fed to an agent as a fact, or counted as
evidence for another inference.** This is `MEDICAL_REASONING_FORMAT`'s
Facts/Inference split, moved out of a prompt and into the schema, where it can
be enforced by a query instead of hoped for.

**P3 — Clinical facts are append-only.** Nothing is updated in place. A
correction is a new row that supersedes an old one
(`superseded_by`, `superseded_at`). A timeline that can silently rewrite its own
past is worse than no timeline — the same reasoning as
`lib/memory/journal.ts`.

**P4 — Reference ranges belong to the result, not to the system.** Per spec
§15. Stored as they appear on the report. See §4.

**P5 — Identity and health data are separated.** Different tables, different
access paths, joined only through an opaque `patient_id`. See §8.

**P6 — Units are normalized on write, and the original is kept.** Both the
value as reported and the value in a canonical unit. Never one or the other.

**P7 — Absent means absent.** No defaulting a missing age, sex or lab value to
a plausible number. `NULL` renders as "not recorded", which is the truth. This
is already how `HealthProfile.age` and `restingHr` behave, and why
`blankProfile` exists.

---

## 3. Core schema

Postgres 16+, `pgcrypto` for UUIDs, `pgvector` for embeddings.

### 3.1 Identity (separate logical domain)

```sql
CREATE TABLE accounts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_hash      bytea NOT NULL UNIQUE,   -- lookup only; never the plaintext
  email_encrypted bytea NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);

-- The only bridge between identity and health. Kept deliberately thin so the
-- health domain can be queried, exported and deleted without touching PII.
CREATE TABLE patients (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);
```

### 3.2 Provenance, shared by every clinical table

```sql
CREATE TYPE fact_source AS ENUM (
  'patient_reported', 'document_extracted', 'device_measured',
  'model_inferred', 'clinician_verified'
);

CREATE TYPE certainty AS ENUM ('known','likely','possible','unknown');
```

`certainty` intentionally reuses the ladder already in
`lib/health/insights.ts`. One honesty vocabulary across prompts, UI, insights
and schema — not four.

### 3.3 Demographics and vitals

```sql
CREATE TABLE patient_demographics (
  patient_id     uuid PRIMARY KEY REFERENCES patients(id) ON DELETE CASCADE,
  display_name   text,
  birth_year     int  CHECK (birth_year BETWEEN 1900 AND 2100),  -- not full DOB
  biological_sex text CHECK (biological_sex IN ('male','female','intersex')),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
```

`birth_year` rather than date of birth: age bands drive every clinical rule we
have; the exact date buys nothing and is a stronger identifier. Data
minimization (§36) as a schema decision.

`biological_sex` is recorded because reference ranges and risk models depend on
it. It is not gender identity and must not be used as such in UI copy.

```sql
CREATE TABLE vitals (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id   uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  kind         text NOT NULL,          -- weight_kg | height_cm | resting_hr | bp_systolic | ...
  value        numeric NOT NULL,
  unit         text NOT NULL,
  measured_at  timestamptz NOT NULL,   -- when it was true
  recorded_at  timestamptz NOT NULL DEFAULT now(),  -- when we learned it
  source       fact_source NOT NULL,
  superseded_by uuid REFERENCES vitals(id),
  CHECK (source <> 'model_inferred')   -- a vital is measured or reported, never inferred
);
CREATE INDEX ON vitals (patient_id, kind, measured_at DESC);
```

The `measured_at` / `recorded_at` split matters: a user entering last month's
weight today must land on the timeline where it belongs, not where it was
typed.

### 3.4 Clinical problem list

```sql
CREATE TABLE conditions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id    uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  label         text NOT NULL,        -- as the patient or document said it
  code_system   text,                 -- 'ICD-10' | 'SNOMED-CT' | NULL if uncoded
  code          text,
  status        text NOT NULL CHECK (status IN ('active','resolved','suspected')),
  onset_at      date,
  source        fact_source NOT NULL,
  certainty     certainty NOT NULL DEFAULT 'known',
  note          text,
  recorded_at   timestamptz NOT NULL DEFAULT now(),
  superseded_by uuid REFERENCES conditions(id)
);

CREATE TABLE allergies (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id   uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  substance    text NOT NULL,
  substance_class text,               -- drug class or food allergen group
  reaction     text,
  severity     text CHECK (severity IN ('mild','moderate','severe','anaphylaxis')),
  source       fact_source NOT NULL,
  recorded_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON allergies (patient_id);
```

`allergies` is never soft-filtered and never scoped away from an agent. It is
the one table where an omission is directly dangerous.

### 3.5 Symptoms

```sql
CREATE TABLE symptoms (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id      uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  consultation_id uuid REFERENCES consultations(id),
  label           text NOT NULL,
  body_site       text,
  onset_at        timestamptz,
  duration_text   text,               -- verbatim: "since Tuesday", "about 3 hours"
  severity        int CHECK (severity BETWEEN 0 AND 10),
  character       text,               -- burning, cramping, dull...
  radiation       text,
  timing          text,               -- constant, intermittent, post-prandial...
  modifiers       jsonb,              -- {"worse_with":["food"],"better_with":["antacid"]}
  associated      text[],             -- vomiting, fever, ...
  negatives       text[],             -- explicitly denied — as clinically important as positives
  source          fact_source NOT NULL DEFAULT 'patient_reported',
  recorded_at     timestamptz NOT NULL DEFAULT now()
);
```

`negatives` exists because "no chest pain, no shortness of breath" is a finding.
Without it, "not asked" and "asked and denied" collapse into the same empty
state — and the intake engine (§5 of the spec) would keep re-asking questions
it already has answers to.

### 3.6 Medications

```sql
CREATE TABLE medications (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id   uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  label        text NOT NULL,         -- what the patient called it
  rxnorm_cui   text,                  -- NULL until coded; NULL blocks interaction checks
  atc_code     text,
  dose_text    text,                  -- verbatim, unparsed
  frequency_text text,
  route        text,
  started_at   date,
  stopped_at   date,
  is_active    boolean GENERATED ALWAYS AS (stopped_at IS NULL) STORED,
  source       fact_source NOT NULL,
  recorded_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON medications (patient_id) WHERE stopped_at IS NULL;
```

An uncoded medication (`rxnorm_cui IS NULL`) must cause the medication safety
validator to report **"cannot check"**, never "no interactions found". Those are
different answers and only one of them is true. See `SAFETY.md §4.2`.

---

## 4. Laboratory results

The table the current `lib/memory/labs.ts` violates.

```sql
CREATE TABLE lab_reports (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id    uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  lab_name      text,
  collected_at  date,
  reported_at   date,
  document_id   uuid REFERENCES documents(id),
  ingest_method text NOT NULL CHECK (ingest_method IN ('ocr','pdf_text','manual','pasted_text')),
  ingest_confidence numeric CHECK (ingest_confidence BETWEEN 0 AND 1),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE lab_results (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id       uuid NOT NULL REFERENCES lab_reports(id) ON DELETE CASCADE,
  patient_id      uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,

  test_name       text NOT NULL,      -- verbatim from the report
  loinc_code      text,

  value_raw       numeric NOT NULL,
  unit_raw        text NOT NULL,      -- exactly as printed
  value_si        numeric,            -- normalized; NULL if we cannot convert
  unit_si         text,

  -- P4: the range as the ISSUING LAB stated it.
  reference_low   numeric,
  reference_high  numeric,
  reference_text  text,               -- for non-numeric ranges: "Negative", "<5"
  reference_source text NOT NULL
      CHECK (reference_source IN ('report','system_default','unknown')),

  flag            text CHECK (flag IN ('low','normal','high','borderline','critical','unknown')),
  collected_at    date,
  source          fact_source NOT NULL,
  extraction_confidence numeric CHECK (extraction_confidence BETWEEN 0 AND 1),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON lab_results (patient_id, test_name, collected_at DESC);
```

Rules:

1. `reference_source = 'report'` whenever the report printed a range. Use ours
   only when it did not — and then the UI and every agent prompt must say *"no
   range on the report; compared against a general reference"*.
2. `value_si IS NULL` when conversion is not certain. A B12 in pmol/L read as
   pg/mL is a ~1.35× error in the direction of false reassurance. Unknown beats
   wrong.
3. `flag` is computed from the range actually stored, never from a global
   constant.
4. `flag = 'critical'` is a **triage input**, not a display style.
   See `SAFETY.md §2.4`.

### 4.1 Migrating the existing parser

`lib/memory/labs.ts` becomes an extractor that emits `lab_results` rows with
`reference_source = 'system_default'` and a documented default range per marker,
rather than a classifier that asserts a universal truth. Its six regexes are
kept — they work — but they stop being the authority on what "low" means.

---

## 5. Nutrition

Existing types map over cleanly; `lib/nutrition/foods.ts` stays a code-owned
reference table (it is version-controlled, reviewable, and diffable — better
properties than a database row for 56 curated entries).

```sql
CREATE TABLE meals (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id    uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  eaten_at      timestamptz NOT NULL,
  title         text NOT NULL,
  source        text NOT NULL CHECK (source IN ('vision','text','sample','manual')),
  image_id      uuid REFERENCES documents(id),
  totals        jsonb NOT NULL,       -- Totals from lib/nutrition/analyze.ts
  fit_score     int CHECK (fit_score BETWEEN 0 AND 100),
  user_corrected boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE meal_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meal_id     uuid NOT NULL REFERENCES meals(id) ON DELETE CASCADE,
  food_id     text,                   -- FK into the code-owned FOODS table; NULL = unmatched
  name        text NOT NULL,
  grams       numeric NOT NULL,
  matched     boolean NOT NULL,
  confidence  numeric,
  corrected_by_user boolean NOT NULL DEFAULT false
);
```

`matched = false` carries the same meaning it does in `analyze.ts`: the item is
on the plate but contributes nothing to micronutrient totals. The invariant is
worth stating as a check the eval suite enforces, since it is the difference
between an estimate and a fabrication.

`corrected_by_user` supports spec §34 — the user must be able to overrule the
vision estimate, and we must be able to tell corrected data from raw. It is also
the highest-quality training signal the product will ever generate, which is a
reason to store it carefully and a reason not to train on it without explicit,
separate consent (§7.3).

---

## 6. Consultations, reasoning, evidence

```sql
CREATE TABLE consultations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id    uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  started_at    timestamptz NOT NULL DEFAULT now(),
  ended_at      timestamptz,
  chief_complaint text,
  status        text NOT NULL CHECK (status IN ('active','completed','escalated','abandoned')),
  escalated_at  timestamptz,
  escalation_reason text
);

CREATE TABLE messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultation_id uuid NOT NULL REFERENCES consultations(id) ON DELETE CASCADE,
  role            text NOT NULL CHECK (role IN ('patient','system','assistant')),
  content         text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- One row per completed reasoning turn. THE audit record.
CREATE TABLE assessments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultation_id uuid NOT NULL REFERENCES consultations(id) ON DELETE CASCADE,
  clinical_state  jsonb NOT NULL,     -- the full ClinicalState (ORCHESTRATION.md §3)
  triage_verdict  text NOT NULL,      -- emergency | urgent | routine | self_care
  triage_rules    text[] NOT NULL,    -- WHICH rules fired, by id
  specialists     text[] NOT NULL,
  critic_output   jsonb,
  validators      jsonb NOT NULL,     -- per-layer pass/fail
  response_text   text,               -- NULL if withheld
  withheld_reason text,
  model_id        text NOT NULL,
  prompt_version  text NOT NULL,
  latency_ms      int,
  created_at      timestamptz NOT NULL DEFAULT now()
);
```

`assessments` answers the question §3.2 of `ARCHITECTURE.md` says is currently
unanswerable: given a response the user disputes, what did the system know, what
fired, what did the critic say, which validators passed, which model and which
prompt version produced it. Immutable. Never deleted before the patient's own
data, and deleted with it.

`triage_rules` stores rule **ids**, not prose, so an eval can assert exactly
which rule fired.

### 6.1 Evidence corpus

```sql
CREATE TABLE evidence_documents (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title            text NOT NULL,
  source_name      text NOT NULL,     -- 'WHO' | 'ICMR' | 'NICE' | 'PubMed' | ...
  source_url       text,
  publication_date date,
  specialty        text[],
  country          text,              -- jurisdiction the guidance applies to
  is_guideline     boolean NOT NULL DEFAULT false,
  evidence_level   text,
  license          text NOT NULL,     -- ingestion is blocked without this
  retrieved_at     timestamptz NOT NULL DEFAULT now(),
  superseded_by    uuid REFERENCES evidence_documents(id)
);

CREATE TABLE evidence_chunks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id  uuid NOT NULL REFERENCES evidence_documents(id) ON DELETE CASCADE,
  ordinal      int NOT NULL,
  text         text NOT NULL,
  section_path text,                  -- so a citation can point at a section
  embedding    vector(1536),
  tsv          tsvector GENERATED ALWAYS AS (to_tsvector('english', text)) STORED
);
CREATE INDEX ON evidence_chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX ON evidence_chunks USING gin (tsv);
```

`license NOT NULL` is the ingestion gate. Spec §26: never scrape what we are not
licensed to use. A nullable column would make that a policy; `NOT NULL` makes it
a constraint.

`country` exists because guidance is jurisdictional. An India-first product
citing a US screening interval is wrong even when the citation is real.

### 6.2 Cached patient embeddings

Closes the cost note in `lib/memory/recall.ts`.

```sql
CREATE TABLE memory_embeddings (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id   uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  kind         text NOT NULL CHECK (kind IN ('journal','meal','symptom','assessment')),
  ref_id       uuid NOT NULL,
  text         text NOT NULL,
  embedding    vector(1536) NOT NULL,
  model        text NOT NULL,         -- invalidate the cache on model change
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (patient_id, kind, ref_id, model)
);
CREATE INDEX ON memory_embeddings USING hnsw (embedding vector_cosine_ops);
```

Patient embeddings and evidence embeddings live in separate tables on purpose.
They must never be retrieved in the same query — mixing "what happened to this
person" with "what the guideline says" is how a patient's own logged symptom
starts getting cited as medical evidence.

---

## 7. Privacy, consent, retention

### 7.1 Encryption and access

- TLS everywhere; Postgres encryption at rest; separate KMS-held keys for
  `accounts.email_encrypted` and for document blobs.
- Application connects as a role with no `DELETE` on `assessments` or
  `audit_log`.
- Object storage is private, server-signed short-lived URLs only. Uploaded lab
  reports and meal photos are never publicly addressable.

### 7.2 Audit

```sql
CREATE TABLE audit_log (
  id          bigserial PRIMARY KEY,
  at          timestamptz NOT NULL DEFAULT now(),
  actor_type  text NOT NULL CHECK (actor_type IN ('patient','system','clinician','admin')),
  actor_id    uuid,
  patient_id  uuid,
  action      text NOT NULL,
  resource    text NOT NULL,
  resource_id uuid,
  ip_hash     bytea,
  meta        jsonb           -- NEVER clinical values. Identifiers and outcomes only.
);
```

Every read of another person's health data by a clinician or admin is logged.
`meta` holds ids and outcomes, never values — an audit log full of lab results
is a second copy of the health record with weaker access control.

### 7.3 Consent

```sql
CREATE TABLE consents (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id  uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  kind        text NOT NULL,   -- processing | external_model | clinician_share | research | model_training
  granted     boolean NOT NULL,
  version     text NOT NULL,   -- the consent text they actually saw
  at          timestamptz NOT NULL DEFAULT now()
);
```

Defaults, per spec §26 and §36:

- `model_training` — **off**. Requires separate, explicit, revocable opt-in.
- `research` — off.
- `external_model` — required to use the product at all while inference is
  hosted externally, and must be stated plainly rather than buried. If the
  chosen jurisdiction (`ARCHITECTURE.md §4.1`) forbids sending health data to a
  foreign provider, this consent cannot cure that, and the deployment model must
  change instead.
- Health data is never used for advertising. There is no consent row for it
  because it is not on offer.

### 7.4 Retention, export, deletion

| Data | Retention |
|---|---|
| Clinical facts, consultations, assessments | Until deletion is requested |
| Uploaded documents (reports, meal photos) | Until deletion; extracted values survive independently |
| Audit log | 24 months, then aggregated |
| Model traces (`observability`) | 30 days, health values redacted at write time |
| Rate-limit / abuse counters | 24 hours |

Deletion is a real erase of clinical rows, not a `deleted_at` flag, with a
tombstone in `audit_log` recording that it happened. Export produces the full
record — facts with provenance, consultations, assessments, documents — in a
machine-readable form.

---

## 8. Migration off localStorage

Non-negotiable: nobody loses their data, and nothing is silently uploaded.

1. **Ship the backend behind a flag.** `lib/memory/store.ts` keeps its
   `useSyncExternalStore` shape; only its read/write functions repoint at the
   API. The hook signatures do not change, so no screen is rewritten.
2. **Ask before uploading.** On first sign-in, show what is on the device and
   ask. Import is a user action with an explicit consent row, never a silent
   sync.
3. **Import with honest provenance.** Everything imported is
   `patient_reported`, because that is all we can honestly say about it — we do
   not know whether a localStorage biomarker was typed or parsed. Do not
   backfill a better-sounding source.
4. **Drop demo data.** `isDemoMemory()` already detects the seeded profile by
   its `j-seed-` ids. Seeded entries are never imported. A demo B12 reading
   entering a real patient record is the §1 failure of `blankProfile`, repeated
   with a database behind it.
5. **Wipe the device after confirmed import.** Leaving a stale unencrypted copy
   behind is the worst of both designs.
