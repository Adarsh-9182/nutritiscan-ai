# NutritiScan — Product Strategy

## The category argument

Every consumer health app on the market is a **ledger**. MyFitnessPal logs calories,
Practo logs appointments, a lab portal logs results. They are all built on the same
assumption: the user is the analyst, and the app's job is to hand them clean data.

That assumption is wrong for health, for one reason — **the user cannot do the
analysis.** They do not know whether a ferritin of 38 µg/L matters. They do not know
that tea blocks iron absorption. They do not know that their 4pm crash and their lunch
composition are the same fact. Handing them a dashboard is handing them homework in a
subject they never studied, at a moment when they are anxious.

NutritiScan inverts it. **The app does the analysis and hands back a sentence.**

That single inversion is what produces every design decision in this repository:

| The ledger model | The companion model |
| --- | --- |
| Home is a dashboard | Home is a question field |
| Data first, meaning maybe | Meaning first, data on request |
| Out-of-range values are red | "Worth attention" is amber; nothing is red |
| The app is neutral about your numbers | The app has read your numbers and has a view |
| More metrics = more value | One insight that gets read beats six that don't |
| Confidence is uniform | Every claim carries its evidence and its uncertainty |

## The five principles, and where each one lives in the code

**1. Start with a question, not a dashboard.**
`components/screens/ask-home.tsx`. There is no calorie ring, no streak, no six-metric
grid. Exactly one insight is pushed; everything else is asked for. The tab bar has three
destinations, not five, because a fourth tab is a browsing surface and browsing is what
we are replacing.

**2. Every answer has three parts: plain English, evidence, one next step.**
`lib/v2/conversation.ts` (`NEXT_STEP_RULE`) and `lib/agents/safety.ts`
(`MEDICAL_REASONING_FORMAT`). The response contract is enforced at the prompt, and the
evidence chips under an answer are *derived from the context actually sent to the model*
(`evidenceForTurn`) rather than authored — a chip that is always present stops meaning
anything.

**3. Sentence first, evidence second, numbers last.**
`components/screens/food-verdict.tsx` renders in exactly that order, and the comment at
the top of the file explains why the score ring is second and small. A big number at the
top turns a meal into a grade, and grading people's dinner is how a nutrition app becomes
something they feel judged by and stop opening.

**4. The interface disappears.**
The scanner auto-detects by default and the mode strip is an escape hatch
(`components/screens/scan.tsx`). The status pill narrates real pipeline stages streamed
from the API, so a slow recognition reads as work rather than as a freeze.

**5. Health should feel calm.**
Enforced at the design token, not left to each screen's judgement. `app/globals.css` has
**no red token at all** — there is nothing for a component to reach for. Out-of-range
markers get amber. The lab summary leads with the count of what is fine. The error
boundary's second sentence is "your data is untouched", because that is the actual
question a person has when a health app crashes.

---

## Personas

### Primary — Dev Raman, 34. "I have results and no idea what they mean."

Software lead, Bengaluru. Gluten-sensitive. Gets an annual panel through work. His last
one came back with 38 rows and two red asterisks, and he spent an evening on Google
convincing himself he had something serious. He is not tracking anything; he does not
want to. He wants someone to read the report and tell him whether to worry.

- **Trigger:** a PDF lands in his inbox.
- **Fear:** that a number means something terrible and nobody told him.
- **Win:** "36 of 38 are fine. Two are worth a conversation. Here's what to ask."
- **What loses him:** a red flag, a paywall on the explanation, or an upsell to supplements.

*He is the reason the lab flow is the most carefully designed part of this product.*

### Secondary — Meera, 41. "I do everything right and I'm still tired."

Teacher, two kids. Cooks at home. Has been told she's "borderline" three times without
anyone explaining what that means. She has logged food in three apps and quit all three
because the logging was the whole product and it never paid her back.

- **Trigger:** a persistent symptom with no obvious cause.
- **Fear:** being dismissed.
- **Win:** an answer that connects her labs to her actual meals and proposes one cheap test.
- **What loses her:** being asked to log for two weeks before getting anything back.

*She is the reason answers must be useful on day one, with whatever data exists — and the
reason the demo brain (`lib/agents/demo.ts`) refuses to state a protein average when
nothing has been logged.*

### Tertiary — Raghav, 67. "Which of these do I take with food?"

Retired, four prescriptions, mild cataracts. Adult children installed the app.

- **Trigger:** a new prescription.
- **Fear:** taking something wrong.
- **Win:** the timing rule, in large type, with the interaction against what he already takes.
- **What loses him:** small text, and any suggestion that contradicts his doctor.

*He is the reason body text is 15px not 14px, why nothing renders below 11px, why
pinch-zoom is not disabled, and why `lib/v2/medicines.ts` has no `dose` field.*

---

## Information architecture

```
Ask  (/)                        ← the default. a question field.
├── /ask/[id]                   conversation, with evidence + follow-ups
├── /ask/voice                  hands-free capture
└── /ask/new?q=…                a live question

Scan (/scan)                    ← an action, not a place. raised button.
├── food · barcode · label      → /  (food verdict, in place)
├── report                      → /labs/reading → /labs/[panel]
└── medicine                    → /medicine/[id]

Health (/health)                ← yourself, over time. four metrics.
├── /plan                       the week, built from constraints
├── /plan/grocery               the week, as a shopping list
└── /labs/[panel]               a summary
    └── /labs/[panel]/[marker]  one number, explained

You (/you)                      ← what it knows, and what you control
├── /you/profile                the health memory, with provenance
└── /records                    an intelligent timeline
```

**Why three tabs and one action.** A tab implies a place you browse; a camera is
something you do. Plan, Records, Labs and Medicine deliberately have *no* tab — they are
destinations you arrive at from an answer. That is what keeps the home screen a question
field rather than a menu, and it is the structural expression of principle 1.

**Depth is capped at three.** Ask → Panel → Marker. Nothing in the product is four taps
from home.

---

## The journeys

### A. "Read my blood report" — the flagship

1. **Trigger.** Home, tap `Read my blood report` (or Scan → Report).
2. **Upload.** Drop a PDF or photo.
3. **The wait** (`/labs/reading`) — *the emotionally critical screen.* Reassurance is
   delivered **here, before any result**: "Nothing here is an emergency." Named steps
   ("Comparing to your March panel") make the delay legible as work. A privacy line sits
   next to the progress bar, because this is the most sensitive document a person owns.
4. **The summary** (`/labs/[panel]`) — headline counts what is **fine**: "36 of 38
   markers are where they should be." The 36 collapse into one green line. The two
   exceptions are amber cards, each with a sentence, a trend, and a delta.
5. **The detail** (`/labs/[panel]/[marker]`) — position on a range (never pass/fail), the
   trend across four panels, what the marker actually is in plain terms, and graded
   recommendations.
6. **The exit** — three questions to bring to a doctor. Phrased as questions the user
   asks, not conclusions the app reached. *The exit from a lab report is a conversation
   with a human, not a purchase.*

### B. "Why am I tired at 4pm?" — the reasoning proof

Home → conversation. The answer names two candidate causes, shows the evidence chips it
used (July labs, 14 logged lunches, sleep average), draws the self-reported energy curve
with 4pm marked, and closes with **the cheapest test that would distinguish them**: 25 g
of protein at lunch for a week. Follow-ups branch to the meal plan or to iron sources.

This journey is the product's whole thesis in one screen: it reasons *across* labs, food
logs and device data, then proposes an experiment rather than advice.

### C. "Is this dinner OK?" — capture

Scan (auto) → recognition narrated by the status pill → **a sentence** ("Good for you
tonight — add one thing"), then the score, then three reasons *tied to this user's own
labs*, then the numbers, then one suggested addition. Log it, or ask about it.

### D. "What is this tablet?" — medicine

Scan → Medicine. Purpose, then the amber **timing** card (the one genuinely actionable
fact), then effects, interactions checked against the user's own items, storage, an
optional reminder — and an undismissable line deferring dose to a clinician, with an
offer to draft the question.

### E. "Feed me this week" — planning

Health → This week. Constraint chips state *why they exist* and are **real controls**:
loosening one regenerates the week from the candidate pool. An allergy constraint is
locked and says so. Each meal is tagged with the marker it serves, linking back to the
lab that motivated it. The week rolls into an aisle-grouped list where every swap is
labelled with what it saves and what it costs.

---

## What earns trust, concretely

1. **Provenance is derived, not decorated.** Evidence chips reflect the context actually
   attached to the request.
2. **Uncertainty is visible.** Recommendations carry evidence grades. The reasoning
   format forces Facts / Inference / Confidence apart so a guess cannot read with the
   authority of something the user said.
3. **The product says "I don't know."** With no meals logged, the nutrition answer says
   so and refuses to quote an average.
4. **Absence is shown, not hidden.** `/you/profile` lists "not recorded" as a first-class
   value, with the origin of every fact it does hold.
5. **Deletion is a first-class action**, next to export, with an honest description of
   where data actually lives.
6. **No dark patterns.** No streaks, no shame, no notifications engineered for return
   visits, no supplement store.

## Non-goals

- Diagnosis. Ever.
- Dosing advice.
- Gamification of a person's body.
- Being the most feature-complete health app. Being the most trusted one.
