# NutritiScan — AI Orchestration

> Status: design document. `ClinicalState` and everything that consumes it do
> not exist yet. §2 describes what runs today.

---

## 1. The loop

```
UNDERSTAND → STRUCTURE → TRIAGE → RETRIEVE → REASON
     → CHALLENGE → VERIFY → RESPOND → MONITOR → LEARN
```

`ClinicalState` is the object that flows through it. Every stage reads it, most
stages add to it, and it is persisted at the end (`assessments.clinical_state`).

Without it, triage has nothing to inspect, validators have nothing to check,
and evaluation has nothing to assert against. It is built first.

---

## 2. What runs today

```
messages + profile + meals
   → safeProfile / safeMeals          sanitize
   → nutritionContext()               fixed 14-day meal window
   → recallRelevant()                 embedding search over journal + meals
   → buildSupervisor()                one ToolLoopAgent, 5 delegate tools
   → stream to client
```

Real strengths worth preserving:

- **Per-specialist context scoping.** Each specialist declares the memory
  sections its expertise uses. The Supervisor and Doctor keep all of them,
  because a narrowed view is only dangerous where triage and routing decisions
  are made. This is genuine context engineering and it survives the redesign
  intact — it just starts scoping `ClinicalState` instead of `HealthProfile`.
- **Honest degradation.** The route distinguishes a failure before any content
  from a failure mid-answer, and refuses to let a truncated thought read as a
  complete one.

What it is not: there is no structured representation, no triage gate, no
critic, no evidence, and nothing inspects the output.

---

## 3. ClinicalState

The keystone. Spec §7's structure, as a type.

```typescript
type ClinicalState = {
  consultationId: string;
  turn: number;

  chiefComplaint: string | null;

  // STRUCTURE — extracted, each with provenance. Never model-asserted as fact.
  symptoms: StructuredSymptom[];
  negatives: string[];          // explicitly denied. "not asked" ≠ "denied"
  keyFindings: Finding[];
  riskFactors: RiskFactor[];

  // TRIAGE — written by lib/safety/triage.ts, read-only downstream
  triage: {
    verdict: "emergency" | "urgent" | "routine" | "self_care";
    firedRules: string[];       // rule ids, for audit and eval
    modelSuspicion: string[];   // may escalate, may never de-escalate
  };

  // RETRIEVE
  evidence: EvidenceRef[];      // chunk ids retrieved THIS turn

  // REASON
  differential: DifferentialItem[];
  missingInformation: MissingInfo[];   // drives the next question
  recommendedNextSteps: NextStep[];

  // CHALLENGE
  critique: Critique | null;

  // Calibrated ladder only. Never an invented percentage.
  confidence: "known" | "likely" | "possible" | "unknown";
  confidenceReason: string;
};

type DifferentialItem = {
  label: string;
  supportingEvidence: string[];    // findings + evidence refs
  contradictingEvidence: string[];
  discriminators: string[];        // what would tell this apart from the others
  dangerous: boolean;              // "must not miss", regardless of likelihood
  likelihood: "strongly_supported" | "reasonably_possible"
            | "possible_uncertain" | "insufficient_information";
};
```

Two deliberate choices:

**`dangerous` is separate from `likelihood`.** A must-not-miss diagnosis stays
visible to the safety layers even when it ranks last. Sorting by likelihood
alone is how a rare, lethal possibility quietly falls off the end of a list.

**`likelihood` uses spec §22's words, not numbers.** The same vocabulary the
existing `lib/health/insights.ts` uses. One honesty vocabulary product-wide.

### 3.1 What never enters ClinicalState

Chain-of-thought. Per spec §7, hidden reasoning is never exposed to the user;
it is also not persisted. `assessments` stores the structured conclusion and
which rules and validators fired — enough to audit a decision, without
retaining a transcript of the model's deliberation about a person's health.

---

## 4. STRUCTURE — extraction

A constrained-output model call, `ClinicalState` as the schema. The pattern is
already in the repo: `app/api/scan/route.ts` uses `Output.object({ schema })`
to make the vision model return typed items rather than prose.

Rules:

- Extraction proposes; `lib/patient/**` writes. Extracted facts land as
  `document_extracted` or `patient_reported` with confidence, never as
  `clinician_verified`.
- The model may not invent a symptom the patient did not describe. Every
  `StructuredSymptom` carries the verbatim span it came from.
- Low-confidence extractions become `missingInformation` entries — questions to
  ask — rather than facts to reason from.

---

## 5. TRIAGE

Specified in `SAFETY.md §2`. Runs here, before retrieval and reasoning, and can
end the turn. Nothing downstream may modify `state.triage`.

---

## 6. RETRIEVE — medical evidence

Distinct from `lib/memory/recall.ts`, which retrieves the *patient's own*
history. Different corpus, different table, different query path, and per
`DATA.md §6.2` never joined — mixing them is how a patient's logged symptom
starts getting cited as medical evidence.

### 6.1 Ingestion

```
Licensed source → fetch → clean → chunk (section-aware)
  → metadata extraction → embed → evidence_chunks
```

`evidence_documents.license` is `NOT NULL`. Ingestion without a recorded
license is blocked by the schema, not by a code review.

Priority order for the India-first target (`ARCHITECTURE.md §4.1`): national
guidance (ICMR, MoHFW) → WHO → major specialty societies → PubMed reviews.
Jurisdiction is stored per document because an India-first product citing a US
screening interval is wrong even when the citation is real.

### 6.2 Hybrid retrieval

```
query → entity extraction (conditions, drugs, labs, nutrients)
      → parallel:  vector search (pgvector HNSW)
                   keyword search (tsvector)
                   graph expansion (§7)
      → metadata filter (specialty, jurisdiction, recency, guideline-first)
      → rerank
      → top-k into the reasoning context
```

Superseded documents are excluded by default: `evidence_documents.superseded_by`
exists so that retiring outdated guidance is a data operation rather than a
re-ingestion.

### 6.3 The citation contract

A chunk retrieved this turn is the *only* thing that may be cited. The evidence
validator (`SAFETY.md §4.4`) enforces it against `state.evidence`. A citation
the model produced from pretrained memory is rejected outright — that is the
mechanism behind "never fabricate citations".

---

## 7. Knowledge graph

Vector search retrieves prose. Some questions need a deterministic answer:
*does drug A interact with drug B*, *does this condition contraindicate this
supplement*, *which nutrient deficiency causes this*. Those should not depend
on whether a paragraph happened to rank in the top-k.

Entities and relationships are as spec §12 lists them. Implemented as ordinary
relational tables first — Postgres with recursive CTEs handles this scale
comfortably, and a graph database is a later optimization, not a starting
requirement.

Graph facts are deterministic and citable. Where a graph edge and a retrieved
chunk disagree, the disagreement is surfaced to the critic rather than silently
resolved.

---

## 8. Specialist agents

Current roster (5) expands to spec §8's (10). The `specialist()` factory in
`lib/agents/index.ts` already takes expertise + scoped sections, so each
addition is a registration, not a new architecture.

| Agent | Status | ClinicalState scope |
|---|---|---|
| General Medicine | rename of Doctor Agent | full |
| Nutrition | ✓ exists | findings, biomarkers, meals, goal, allergies |
| Gastroenterology | new | GI symptoms, meds, relevant labs |
| Cardiology Safety | new | cardiac symptoms, risk factors, lipids, BP, family history |
| Endocrinology | new | glucose, HbA1c, thyroid, weight trend, meds |
| Dermatology | new | skin findings, meds, allergies |
| Medication Safety | new | full medication list, allergies, conditions, renal/hepatic labs |
| Laboratory | ✓ exists | labs, meds, conditions |
| Preventive Health | new | demographics, risk factors, family history, screening history |
| Mental Health Safety | new | **separate path — see `SAFETY.md §3`** |
| Fitness / Coach | ✓ exists | non-clinical; retained |

Scoping rules carried forward from the current implementation, which got this
right:

- Allergies are **never** scoped out of any agent. An omission here is directly
  dangerous.
- The Supervisor and General Medicine keep the full state, because they make the
  routing and triage-adjacent judgments where a narrowed view causes harm.
- Everyone else gets the slice their expertise uses. Handing a Fitness agent a
  full lab panel is context stuffing, not context engineering — it dilutes
  attention and costs tokens on every fan-out call.

Each specialist returns the §9 structure: assessment, differential, supporting
and contradicting evidence, missing information, risk level, recommendation.
Structured output, not prose, so the critic and validators can inspect it.

---

## 9. CHALLENGE — the critic

Runs after the specialists, before synthesis. Its job is to be **wrong-finding,
not agreeable**. It is prompted to argue against the assembled state:

- What diagnosis is missing?
- What evidence contradicts this?
- What dangerous condition presents similarly?
- What information is missing that would change the answer?
- Is this overconfident for the data available?
- Is there a demographic or contextual bias in this reasoning?
- Does the cited evidence actually support the recommendation?

Design notes:

- The critic sees the state and the evidence, **not** the draft response. It
  should critique the reasoning, not edit the prose.
- Its output is structured (`Critique`) and stored in
  `assessments.critic_output`, so "did the critic catch it" is measurable rather
  than anecdotal.
- A critic finding of `dangerous_alternative` forces re-entry into triage with
  the new hypothesis. This is the only backward edge in the pipeline, and it is
  bounded to one iteration to keep latency predictable.
- Majority voting is explicitly not used (spec §9). Three specialists agreeing
  is not evidence; it is correlated error from a shared base model.

---

## 10. RESPOND — synthesis

Assembles §23's structure from the validated state:

```
What I understand
What could explain it
What makes each more or less likely
What I would do next
When to seek urgent care        ← never omitted; L6 verifies it exists
What I still need to know
Evidence
```

This is the same contract as the existing `MEDICAL_REASONING_FORMAT`
(Facts / Inference / Recommendation / Medical Warning / Confidence), in the
patient-facing wording spec §23 asks for. The mapping is one-to-one, so the
prompt is rewritten rather than replaced, and the existing labelled-sections
discipline carries over.

Synthesis writes prose from an already-decided state. It does not get to
introduce a new possibility, a new recommendation, or a new citation — anything
it adds beyond the state is caught by L5/L6 and the response is withheld.

---

## 11. Adaptive intake

Spec §5. Powered by `state.missingInformation`, which the reasoning stage
populates.

Each candidate question carries what it would resolve and how much. Selection
maximizes information gain toward *discriminating the current differential*,
with a hard override: any question that could confirm or exclude a `dangerous`
item is asked first regardless of its information score.

Practical constraints: at most 3 questions per turn (the existing
`MEDICAL_REASONING_FORMAT` already imposes this, and it is a good limit); never
re-ask something answered — including something in `negatives`; stop asking when
the remaining questions no longer change the recommendation, not when a
checklist is exhausted.

---

## 12. Model abstraction

Spec §24. Today `MODEL` is one exported string routed through Vercel AI Gateway,
which already provides provider portability — the coupling is one constant, not
a rewrite.

```typescript
interface MedicalModel {
  generate(req: GenerateRequest): Promise<GenerateResult>;
  classify<T>(req: ClassifyRequest<T>): Promise<T>;
  extract<T>(req: ExtractRequest<T>): Promise<T>;   // constrained output
  reason(req: ReasonRequest): Promise<ClinicalState>;
  summarize(req: SummarizeRequest): Promise<string>;
  embed(texts: string[]): Promise<number[][]>;
}
```

Registry-based, so each pipeline stage names a *role* rather than a model:
`extraction`, `reasoning`, `critic`, `synthesis`, `embedding`, `vision`.
Different stages want different trade-offs — extraction wants cheap and
constrained, critic wants strong, synthesis wants good prose — and the roster
should be changeable in configuration.

Every model call records `model_id` and `prompt_version` on the assessment.
Without those two fields, a regression six weeks later is unattributable, and
`EVALUATION.md`'s CI gate has nothing to compare against.

Embeddings already route to a different provider than generation
(`EMBEDDING_MODEL` in `lib/agents/safety.ts`, because Anthropic serves no
embeddings endpoint) through the same gateway credential. The abstraction just
makes that arrangement explicit instead of incidental.

---

## 13. MONITOR and LEARN

**Monitor**: scheduled follow-ups on open consultations — did the symptom
resolve, was the recommended test done, did the lab value move. This is what
turns single answers into longitudinal care, and it is the loop `lib/health/
timeline.ts` and `insights.ts` are already shaped for.

**Learn**, with the constraint spec §26 and §39 both impose: **no uncontrolled
self-training on patient conversations.** The learning loop is:

1. Failures and corrections are captured as candidate eval cases.
2. Cases are reviewed, de-identified, and added to the golden dataset.
3. Prompts, rules and retrieval improve against the dataset.
4. Fine-tuning happens only on data with an explicit `model_training` consent
   row (`DATA.md §7.3`, default off), never as a side effect of use.

The product improves by growing its evaluation set, not by absorbing its users.
