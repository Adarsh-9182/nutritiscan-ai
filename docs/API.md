# NutritiScan — API Contracts

> Status: design document. Two routes exist today (§2); everything in §4 is
> target design.

---

## 1. Principles

1. **The client is never authoritative.** Today it is — the browser POSTs the
   whole profile on every request. After Phase 2 the server reads canonical
   state from Postgres and the client sends only the message. Sanitization
   (`lib/memory/schema.ts`) stays regardless: anything user- or model-authored
   that reaches a prompt is still untrusted.
2. **Every clinically relevant endpoint** has authentication, authorization,
   audit logging, validation, and rate limiting. No exceptions, including
   read-only ones — reading a health record is an audited event.
3. **Errors are honest and non-leaking.** A user-facing message that says what
   to do; no provider errors, hostnames, or request ids. The scan route already
   does this deliberately.
4. **Degradation is stated, never faked.** If retrieval, the model, or a
   validator is unavailable, the response says so. It does not silently produce
   a lower-quality answer that looks identical to a good one.
5. **Versioned.** `/api/v1/…`. Clinical response shapes will change.

---

## 2. What exists today

### `POST /api/chat`

Body `{ messages, profile, meals }` → UI message stream.
Rate limit 20/min per IP, body cap 128 KB, 50 s model budget, transcript capped
at 40 messages. Falls back to a keyless demo brain when no credential is present
or the provider fails before any content is emitted.

### `POST /api/scan`

Body `{ mode: "photo" | "describe", text?, image?, profile? }` →
`application/x-ndjson` stream of `{type:"stage"|"result"|"error"}`.
Rate limit 10/min, body cap 8 MB, 45 s budget, media type allow-list.

### `GET /api/scan`

`{ vision: boolean }` — whether a real vision model is configured, so the client
can stop advertising a capability it does not have.

Both are unauthenticated and stateless. Both must move behind auth in Phase 2.

---

## 3. Cross-cutting contracts

### 3.1 Error envelope

```json
{ "error": { "code": "rate_limited", "message": "…", "retryAfter": 12 } }
```

Codes: `unauthenticated`, `forbidden`, `not_found`, `invalid_request`,
`payload_too_large`, `rate_limited`, `unavailable`, `withheld`.

`withheld` is specific to this product: the pipeline produced a response and a
safety validator refused to emit it (`SAFETY.md §4.5`). It carries a plain
explanation and, where relevant, an escalation. It is a `200`-class outcome in
product terms and is returned as `422` with the reason recorded in
`assessments.withheld_reason`.

### 3.2 Emergency responses

Any endpoint whose pipeline hits an `emergency` triage verdict returns the
fixed escalation payload and **nothing else** — no differential, no partial
reasoning:

```json
{
  "triage": "emergency",
  "response": "<reviewed template>",
  "ruleIds": ["cardiac.chest-pain-with-features"],
  "consultationId": "…",
  "escalated": true
}
```

Same shape whether the trigger arrived through chat, a lab upload with a
critical flag, or a symptom endpoint. One code path, one template set.

### 3.3 Streaming

Per `SAFETY.md §4.1`: non-clinical turns stream tokens; clinical turns stream
*stage events* and then the validated answer. The `stage` event vocabulary is
the one `/api/scan` already uses, because it works and users read it.

### 3.4 Rate limits

Per authenticated patient, not per IP, once accounts exist. The shared-counter
implementation replaces the in-memory one in `lib/http/guard.ts`, which was
deliberately shaped so the swap is a one-function change.

---

## 4. Target surface

Auth on everything below. `patient_id` is derived from the session, never
accepted from the client — an endpoint that takes a patient id as a parameter is
an IDOR waiting to happen.

### Consultations

```http
POST   /api/v1/consultations                  → { consultationId }
POST   /api/v1/consultations/{id}/messages    → stream (§3.3)
GET    /api/v1/consultations/{id}             → transcript + assessments
GET    /api/v1/consultations                  → list
POST   /api/v1/consultations/{id}/summary     → doctor-ready summary (§19)
POST   /api/v1/consultations/{id}/escalate    → handoff (§20)
```

`POST /messages` is the main pipeline. Its response includes the triage verdict
and the citation list alongside the text — the client must be able to render
urgency and sources without re-parsing prose.

### Symptoms and intake

```http
POST   /api/v1/symptoms/analyze     → { clinicalState, nextQuestions[], triage }
```

Returns at most 3 questions (`ORCHESTRATION.md §11`) with what each would
resolve, so the UI can show why it is asking.

### Labs

```http
POST   /api/v1/labs/upload          multipart → { documentId, status: "processing" }
GET    /api/v1/labs/{documentId}    → extraction status + parsed results
POST   /api/v1/labs/{id}/confirm    → patient confirms/corrects before commit
GET    /api/v1/labs/results         → history, filterable by test
```

The `confirm` step is not optional politeness. OCR of a lab report is
error-prone, and a mis-read value silently becomes the basis of every later
inference. The patient sees what we extracted, with the original document beside
it, before it enters the record. Corrections flip `source` to `patient_reported`.

A `critical` flag during extraction triggers §3.2 immediately, before confirm.

### Food

```http
POST   /api/v1/food/analyze         → ScanResult          (existing /api/scan)
POST   /api/v1/food/log             → persists a meal
PATCH  /api/v1/food/meals/{id}      → user correction (§34)
GET    /api/v1/food/meals           → history
```

`PATCH` is spec §34's requirement that the user is never locked into an AI
estimate. It sets `meals.user_corrected` and recomputes totals through the same
deterministic `analyzeMeal()` — the correction changes the input, never the
verdict logic.

### Medications

```http
GET    /api/v1/medications
POST   /api/v1/medications
DELETE /api/v1/medications/{id}
POST   /api/v1/medications/check    → interactions + contraindications
```

`check` returns `{ status: "checked" | "cannot_check", … }`. `cannot_check` when
any active medication is uncoded (`DATA.md §3.5`). The client must render that
differently from a clean result; they are different answers.

### Patient record

```http
GET    /api/v1/patient/profile
PATCH  /api/v1/patient/profile
GET    /api/v1/patient/timeline
GET    /api/v1/patient/memory       → what the system believes, with provenance
GET    /api/v1/patient/export       → full machine-readable record
DELETE /api/v1/patient              → real erase + audit tombstone
```

`GET /patient/memory` is a product feature, not a debug route. A person should
be able to read everything the system thinks it knows about them, labelled by
where each fact came from and how confident we are. It is also the only
practical way for a user to catch an extraction error before it compounds.

### Consent

```http
GET    /api/v1/consents
POST   /api/v1/consents             → grant or revoke, versioned
```

Revocation takes effect immediately, including for `model_training`.

---

## 5. Audit

Every request against a clinical endpoint writes `audit_log` (`DATA.md §7.2`)
with actor, action, resource and outcome — including denials, which are the
interesting ones. `meta` holds identifiers and outcomes, never clinical values;
an audit log full of lab results is a second copy of the health record with
weaker access control.
