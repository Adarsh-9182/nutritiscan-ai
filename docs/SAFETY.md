# NutritiScan — Safety Architecture

> Status: design document. Layer 1 exists in part; layers 2–6 do not exist.
> See §1.2 for an honest inventory before relying on anything here.

---

## 0. The one-sentence version

**No model output reaches a user until deterministic code has decided it may.**

Today the opposite is true: `app/api/chat/route.ts` forwards model chunks
straight to the browser, and every safety property of this product is a
sentence inside a prompt.

---

## 1. Where safety lives today

### 1.1 What is real

| Mechanism | File | Assessment |
|---|---|---|
| Input sanitization | `lib/memory/schema.ts` | **Genuinely strong.** Zod shape + free-text flattening. Strips control chars, zero-width/bidi, brackets, the literal delimiter phrases, and role-prefix openers. Applies to model-authored meal titles as well as user input. Clamps numbers to physiologically plausible ranges because `weightKg` drives the protein target and therefore every verdict |
| Rate limits, body caps | `lib/http/guard.ts` | Real, and honest about being per-instance |
| Honest degradation | `app/api/chat/route.ts` | Distinguishes pre-content failure (fall back to the demo brain) from mid-answer failure (say plainly the answer was cut off). Half an answer in a health product is worse than none |
| Refusal to fabricate | `lib/nutrition/analyze.ts` | Unmatched foods contribute no micronutrients. `lib/memory/profile.ts` prints "not recorded — do not assume one" rather than a default age |
| Calibrated certainty | `lib/health/insights.ts` | `known/likely/possible/unknown`, derived from sample size |

### 1.2 What is a prompt pretending to be a layer

`SAFETY` and `MEDICAL_REASONING_FORMAT` in `lib/agents/safety.ts` are
well-written and cover the right ground. They are also **requests to a
language model**, and they are the *only* thing standing between a user
describing crushing chest pain and a chatty differential diagnosis.

A prompt can be:

- diluted by a long context or a large retrieved-evidence block,
- outweighed by a fluent specialist answer the supervisor is synthesizing,
- skipped under distribution shift or on a model swap,
- and — critically — **not observed by any code**, so a violation is invisible.

There is no code path in this repository that can halt a turn, and nothing
checks whether the five-part format was actually produced.

This document specifies the layers that make those properties enforced rather
than requested.

---

## 2. Layer 2 — Triage (the one that matters most)

Runs **after** structured extraction, **before** evidence retrieval and
reasoning. Has the authority to terminate the turn.

### 2.1 Design rules

1. **Deterministic core.** Rules over the structured `ClinicalState`. No model
   call in the decision path.
2. **A model may add suspicion; it may never subtract it.** An LLM red-flag
   classifier runs *in parallel* and can only escalate. If rules say emergency
   and the model disagrees, it is an emergency.
3. **Fail closed.** If triage throws, times out, or cannot parse the state, the
   verdict is `urgent`, not `routine`. An unavailable safety layer is not a
   passing safety layer.
4. **Conservative thresholds.** Optimize for recall, accept poor precision. The
   cost of a false positive is an unnecessary "please get this looked at". The
   cost of a false negative is unbounded and asymmetric. `EVALUATION.md §4.1`
   sets red-flag recall at 100% as a hard CI gate and deliberately does not gate
   on precision.
5. **Rules are data, versioned, and identified.** Each has a stable id recorded
   in `assessments.triage_rules`, so an eval can assert exactly which fired and
   a regression is traceable to a rule change.

### 2.2 Verdicts

```
emergency   Stop. Emergency-services response. No differential, no reasoning.
urgent      Same-day clinical assessment. Reasoning continues but is framed by this.
routine     Continue normally; recommend clinical follow-up where appropriate.
self_care   Continue normally.
```

`emergency` is the only verdict that halts the pipeline. On `emergency` the
system emits a fixed, reviewed response template — **not generated text** — and
records the consultation as `escalated`.

### 2.3 Rule shape

```typescript
type TriageRule = {
  id: string;                 // "cardiac.chest-pain-with-features"
  version: string;
  verdict: "emergency" | "urgent";
  rationale: string;          // shown to clinical reviewers, never to the patient
  matches: (s: ClinicalState) => boolean;
  requiresReview: true;       // every rule; see §2.5
};
```

### 2.4 Rule domains

The starting rule set covers the domains spec §6 enumerates. Each domain
becomes a small family of rules over symptom labels, qualifiers, severity,
duration, age band, pregnancy status, and structured lab flags:

| Domain | Triggers on |
|---|---|
| Cardiac | Chest pain with concerning features; radiation; exertional onset; associated diaphoresis/nausea |
| Respiratory | Dyspnoea at rest, speaking in short sentences, cyanosis |
| Neurological | Sudden focal deficit, facial droop, speech disturbance, worst-ever headache, new seizure, altered consciousness |
| Anaphylaxis | Airway/breathing involvement, rapidly spreading urticaria with systemic features, known-allergen exposure |
| Haemorrhage | Uncontrolled bleeding, haematemesis, melaena, large-volume PR bleeding |
| Mental health | Suicidal or homicidal ideation, intent, plan, or means. Handled separately — see §3 |
| Obstetric | Pregnancy with bleeding, severe abdominal pain, reduced fetal movement, severe headache with visual change |
| Abdominal | Severe pain with rigidity/guarding, pain with fever and vomiting, testicular pain of sudden onset |
| Sepsis-adjacent | Fever with confusion, rigors, non-blanching rash |
| Poisoning / overdose | Any reported ingestion of a toxic dose or unknown substance |
| Dehydration | Reduced consciousness, no urine output, in the very young or very old |
| Lab-driven | `lab_results.flag = 'critical'` on any incoming report |

**These are engineering scaffolding, not a clinical protocol.** They are drafted
from the domains the product spec lists, in a form code can execute. Per §40's
instruction not to fabricate clinical guidelines: this repository will not claim
these thresholds are guideline-derived, and no rule ships with
`requiresReview: false` until a qualified clinician has reviewed and signed off
the specific rule, recorded in `docs/clinical-review/`. Until that sign-off
exists, the honest description of this layer is "a conservative
engineering approximation", and the product must say so in its own disclosures.

### 2.5 What triage must never do

- Never de-escalate based on reassurance in the patient's wording.
- Never suppress a flag because the retrieved evidence suggests a benign cause.
- Never let a specialist's confidence override a fired rule.
- Never treat missing information as absence. "Not asked" is not "denied" —
  which is why `symptoms.negatives` exists in `DATA.md §3.5`.

---

## 3. Mental-health safety

A separate path, not a triage rule with a different label, because the correct
response differs in kind rather than degree.

- Detection is deliberately over-broad, including passive ideation and indirect
  phrasing.
- Response is a reviewed template: direct, non-judgmental, with
  jurisdiction-appropriate crisis contacts. Not generated prose.
- The system does not attempt risk stratification. It does not ask assessment
  questions to decide how serious it is.
- No differential, no "possible explanations", no nutrition advice in the same
  turn.
- Crisis resources are configuration keyed to the deployment's jurisdiction, not
  a model's recollection of a phone number. A hallucinated helpline number is a
  uniquely bad failure, and it is exactly the kind of fact models get wrong.

---

## 4. Output-side validators (L3–L6)

All of these are missing today. They require the response to be **buffered**
before emission for any clinically-classified turn.

### 4.1 The streaming trade-off, stated explicitly

Buffering costs the token-by-token feel that makes the product pleasant. The
resolution:

- **Non-clinical turns** (nutrition logging, general wellness, app questions)
  stream as they do now.
- **Clinical turns** stream *stage progress* — the pattern
  `app/api/scan/route.ts` already uses successfully, where the UI shows real
  pipeline stages instead of a meaningless spinner — then deliver the validated
  answer.

Honesty about latency beats a fast answer that no one checked. And the scan
route demonstrates users accept staged progress when the stages are true.

### 4.2 L4 — Medication safety validator

Runs whenever the response mentions a medication, supplement, or dose, or when
the patient's active medication list is non-empty and the response recommends
anything ingestible.

Checks: interaction against the active list, contraindication against
`conditions`, cross-check against `allergies` **by substance class, not just by
name**, and duplicate-therapy detection.

The critical behaviour: if any active medication has `rxnorm_cui IS NULL`
(`DATA.md §3.5`), the validator returns **"cannot check"** and the response must
say so. It must never return "no interactions found", because an uncoded drug
was not checked. Those are different claims and only one is true.

### 4.3 L5 — Recommendation validator

- No prescription-drug start/stop/dose recommendations.
- No recommendation that contradicts a fired triage rule.
- No dietary recommendation that conflicts with a recorded allergy — a rule
  `lib/nutrition/analyze.ts` already implements for meals (`allergyFlags`) and
  which must now cover generated text.
- Every actionable recommendation must be traceable to either retrieved evidence
  or a deterministic engine (the nutrition calculator, the lab range).

### 4.4 L5b — Evidence validator

- Every citation resolves to a real `evidence_chunks` row retrieved *this turn*.
  A citation the model produced from memory is rejected.
- Cited text must actually support the claim (entailment check).
- A clinical claim with no citation is either marked as general knowledge or
  removed. It is never silently presented as sourced.

This is the layer that makes "never fabricate citations" enforceable rather than
requested.

### 4.5 L6 — Final response check

- **Format contract**: the five-part structure is present when the turn is
  clinical. `Medical Warning` in particular must exist — the prompt already
  says "never omit it", and this is the code that verifies it did not.
- No definitive diagnostic language ("you have X").
- No fabricated numeric confidence (§22). Only the calibrated ladder.
- No fabricated lab values, reference ranges, or medication names.
- Escalation language present when triage said `urgent` or `emergency`.

**On failure:** withhold. Do not patch and re-emit silently. Emit a plain,
honest fallback, record `assessments.withheld_reason`, and alert. A validator
that fails open is decorative.

---

## 5. Layer inventory

| Layer | Purpose | Today | Target |
|---|---|---|---|
| L1 | Input safety: injection, abuse, scope | Sanitization ✓; classifier ✗ | `lib/safety/input.ts` |
| L2 | Triage / red flags | Prompt only | `lib/safety/triage.ts` — deterministic, halts |
| L3 | Clinical reasoning validator | ✗ | Contradiction + overconfidence checks on `ClinicalState` |
| L4 | Medication safety | ✗ | `lib/medication/validate.ts` |
| L5 | Recommendation + evidence | ✗ | `lib/safety/validators/` |
| L6 | Final response check | ✗ | Format, language, fabrication |
| L7 | Human escalation | ✗ | Doctor-ready summary + handoff |

---

## 6. Invariants

Stated as invariants because each is directly testable, and `EVALUATION.md`
asserts every one of them.

1. A fired `emergency` rule always terminates the turn. No configuration, model,
   prompt, or specialist can override it.
2. A safety layer that errors fails closed.
3. `model_inferred` data is never presented as fact, never fed to another agent
   as fact, and never counted as evidence.
4. A response mentioning medications with an uncoded active list says
   "cannot check", never "no interactions".
5. Uncertainty is expressed on the calibrated ladder, never as an invented
   percentage.
6. Allergies are never scoped out of an agent's context.
7. Every emitted clinical response has an `assessments` row recording what fired.
8. Crisis contacts come from configuration, never from generation.

---

## 7. Known limitation

Rate limiting is per-instance and in-memory (`lib/http/guard.ts` says so
plainly). On serverless it bounds one warm lambda, not the fleet, and resets on
cold start. That is an availability and cost control, not a safety control, and
nothing in this document depends on it. The shared-counter replacement is a
one-function change the file was deliberately shaped to accommodate.
