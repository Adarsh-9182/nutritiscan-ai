# NutritiScan: active product strategy

Research snapshot: 29 September 2026. India-first is a working assumption until a pilot partner and target market are confirmed. This document describes product direction, not features available in the public chat.

## The job to solve

Start with the transition from hospital to home. A patient leaves with a discharge summary, medicine changes, tests that may still be pending, follow-up appointments, and warning signs. These items are distributed across records and people. The work is complete only when each required next step has an owner, a deadline, a verified outcome, and a way to escalate exceptions.

India's Safdarjung Hospital manual calls for a signed discharge summary containing investigations, treatment, medicines, understandable follow-up instructions, and directions for urgent care. It also calls for medication reconciliation at transitions. WHO identifies medication discrepancies at transitions as a patient safety priority. AHRQ describes pending tests after discharge as a follow-up risk. These sources establish the problem; they do not establish that NutritiScan can solve it yet.

Sources: [Safdarjung Hospital manual](https://vmmc-sjh.mohfw.gov.in/sites/default/files/Hospital%20Manual%2C%20April%202025%2C%20DGHS%2C%20MoHFW%20-%2001.04.2025.pdf), [WHO medication safety at transitions](https://www.who.int/publications/i/item/WHO-UHC-SDS-2019.9), [AHRQ pending results](https://www.ahrq.gov/patient-safety/settings/hospital/red/toolkit/redtool3a.html).

## First product: discharge-to-home agent

**Buyer and operating owner:** a hospital or care team. **Daily users:** discharge coordinator, nurse, treating clinician, and the patient after discharge. A pilot must identify the actual owner of each task in the hospital's workflow.

**First release within this product:** close the loop on test results still pending at discharge. Identify the test from an approved source, assign the responsible clinician and review deadline, detect when the result arrives, request clinical review, record the approved patient communication, and verify closure. Medication reconciliation and appointment coordination are the next workflows after this loop works. An overdue or unreviewed result remains open and escalates to a person; the agent never marks it clinically resolved by itself.

1. Import an authorized discharge packet: discharge note, current medicine list, orders, results and follow-up plan. Begin with synthetic packets, then consented files or a read-only hospital integration.
2. Extract structured facts with source document, page or record reference, timestamp, confidence, and an explicit `unknown` state. Never silently turn model inference into a recorded fact.
3. Produce a clinician review screen: medicine changes to reconcile, pending results, appointments to arrange, patient instructions, and missing or conflicting information. The agent can draft, but a qualified person confirms the plan.
4. Assign each confirmed action to a named role with a deadline. With an approved integration, send a task or patient message only after the authorized person approves it.
5. Track acknowledgments and completion. If a result arrives, the assigned clinician reviews it; if an appointment is missed or a patient reports a concerning symptom, the workflow routes the issue to the designated care team using an agreed escalation policy.
6. Show the care team what happened: original source, agent draft, human edits, approvals, delivery result, and task outcome. The patient sees a plain-language version of the approved plan.

The agent's loop is **observe → prepare → request approval → act → verify → escalate**. A generated answer or reminder alone is not completion.

## Why this wedge

| Candidate | Evidence and market signal | Product decision |
| --- | --- | --- |
| General symptom chat | NutritiScan already has this public prototype; it does not own a care workflow. | Keep as an educational entry point, not the main hospital product. |
| Ambient note writing | [HealthPlix H.A.L.O](https://www.healthplix.com/halo) and [Abridge](https://www.abridge.com/product) already offer transcription and clinical notes. | Avoid a standalone scribe as the first differentiator. |
| Imaging diagnosis | [Qure.ai qXR](https://www.qure.ai/product/qxr) already specializes in this space; validation and deployment needs are high. | Do not begin here. |
| Discharge and follow-up | The hospital manual, WHO and AHRQ identify concrete handoff, medicine and pending-result work. | Build one supervised, measurable end-to-end workflow. |

This is a hypothesis about a promising first market, not proof of willingness to pay. Interview discharge coordinators, nurses, doctors, hospital IT and patients before committing to a pilot contract or broad integration.

Use the [pending-result pilot discovery guide](PILOT_DISCOVERY.md) for the interview script, workflow map, selection criteria, and measures. Its field questions are open; desk research does not answer them.

## What changes in the current codebase

**Available now:** `/chat`, a supervisor with specialist routing, educational references, triage checks, and browser-local history/profile. The old account workspace is retired. Some source, extraction, provenance and task modules remain in the repository, but they are not a live hospital product.

**Build next:**

1. A synthetic discharge case and review screen with source-linked facts, missing fields and proposed actions. The local simulator at `/discharge-demo` uses one fixed fictional case, strict line-based pending-test extraction with page/line provenance, reviewer confirmation or correction, manual result-arrival simulation and browser-only event storage. It has no server persistence or real data. Extend it to multiple synthetic cases, PDF/OCR extraction and a missing-information review before a pilot.
2. A durable case model: patient and encounter identity, document versions, facts and provenance, proposed tasks, approvals, owner, deadline, status, and audit events. The fictional demo now replays browser-local events after refresh and checks simulated actor roles. This is not authenticated access or a tamper-resistant audit. Real cases require server storage, verified identities, role-scoped access and explicit consent or institutional authorization.
3. A workflow engine with idempotent task creation, retries, delivery receipts, escalation rules, and human takeover. Clinical decisions and outgoing messages require the appropriate review and authorization.
4. A clinician review experience and a patient-facing approved plan. Only then add a hospital or ABDM-compatible connector where access is actually granted. ABDM describes consent-based exchange and FHIR-aligned interoperability; availability of a standard is not access to every hospital.
5. Evaluate extraction accuracy, omissions, false alerts, clinician correction burden, and workflow outcomes with a pilot partner before expanding to other conditions or autonomous actions.

Sources: [ABDM interoperability overview](https://abdm.gov.in/static/media/Session%202%20-Promoting%20Interoperability%20in%20Digital%20Health.5740ed1d8ec896443683.pdf), [Government of India ABDM answer on consent and interoperability](https://abdm.gov.in/strapicms/uploads/AU_5642_Z2b_V_Ga_f9035b689e.pdf), [WHO AI governance guidance](https://www.who.int/news/item/18-01-2024-who-releases-ai-ethics-and-governance-guidance-for-large-multi-modal-models).

## Milestones and measures

| Milestone | Exit condition |
| --- | --- |
| Discovery | Observe the discharge process at a partner site; map who owns results, medicines, appointments and patient contact. |
| Synthetic prototype | Given a fixed packet, the review screen identifies every seeded pending test, preserves its source, and lets a reviewer assign an owner and deadline. |
| Shadow pilot | On consented or institutionally authorized cases, compare agent drafts with the team's normal process. No unsupervised writes or messages. |
| Assisted pilot | Approved tasks can be sent through one agreed channel; delivery and completion are recorded and exceptions have a human owner. |
| Expansion | Demonstrate useful time saved and fewer missed handoffs without unacceptable omissions, false alerts or extra clinician work. Then add more sources or workflows. |

For the first release, the primary measure is the proportion of pending results that receive documented clinical review and an appropriate follow-up within the agreed time window. Track time to assignment and review; extraction omissions; false alerts; clinician correction burden; delivery failures; and unresolved exceptions. Expand measurement to appointment completion, medicine discrepancies, patient understanding and time to an approved discharge plan as those workflows are added. Do not claim reduced readmissions without an appropriately designed evaluation.

## Boundaries

- The system must distinguish source facts, patient reports and model inferences, and show conflicts instead of choosing silently.
- It must not independently diagnose, prescribe, change a medicine, sign a discharge summary, close a clinical task, or contact a patient without the agreed authorization and review.
- A hospital pilot needs a real data processing, access, security, clinical governance and incident response arrangement. Synthetic cases can establish software behavior, not clinical safety.
- A complete AI health agent is the long-term platform: add other workflows only after the first one reliably reaches verified outcomes.
