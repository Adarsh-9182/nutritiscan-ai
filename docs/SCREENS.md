# NutritiScan — Screens

Each screen's full design rationale lives in the header comment of its component; this is
the index, plus the state matrix that isn't visible in code.

| Screen | Route | Component |
| --- | --- | --- |
| Ask · home | `/` | `screens/ask-home.tsx` |
| Conversation | `/ask/[id]`, `/ask/new?q=` | `screens/conversation.tsx` |
| Voice | `/ask/voice` | `screens/voice.tsx` |
| Scanner | `/scan` | `screens/scan.tsx` |
| Food verdict | (in place after a scan) | `screens/food-verdict.tsx` |
| Medicine | `/medicine/[id]` | `screens/medicine.tsx` |
| Lab reading | `/labs/reading` | `screens/lab-reading.tsx` |
| Lab summary | `/labs/[panel]` | `screens/lab-summary.tsx` |
| Biomarker | `/labs/[panel]/[marker]` | `screens/biomarker.tsx` |
| Meal plan | `/plan` | `screens/meal-plan.tsx` |
| Grocery | `/plan/grocery` | `screens/grocery.tsx` |
| Health | `/health` | `screens/health.tsx` |
| Records | `/records` | `screens/records.tsx` |
| You | `/you` | `screens/you.tsx` |
| Health profile | `/you/profile` | `screens/health-profile.tsx` |

---

## The one-line argument for each

**Ask · home** — a question field, not a dashboard. Exactly one insight is pushed; the
vertical order is reassure → raise the one thing → invite the question, which is the
order a good doctor uses.

**Conversation** — the answer is *not* in a bubble. The user's question is; the answer is
plain prose. Bubbles frame both parties as equal chat participants, and this is an
explanation, not a chat with a peer. Evidence sits directly under the claim, before any
chart, because provenance you have to scroll for is provenance you won't check.

**Voice** — the transcript is at reading size (`t-h2`) so it can be verified from a metre
away with wet hands. The whole backdrop is the interrupt target. Where the browser has no
speech recognition it says so, rather than animating an orb that listens to nothing.

**Scanner** — auto-detect is the default; the mode strip is an escape hatch, not a
decision. Most scanner UIs open on a mode picker, forcing the user to classify their own
photo before the app that exists to classify things has looked at it.

**Food verdict** — sentence, then reasons tied to *this user's* labs, then numbers. The
score ring is second and small: a big number at the top turns a meal into a grade.

**Medicine** — the timing rule gets the only amber card, because it is the one thing that
changes what the user does in the next hour. Side effects are present but *not*
prominent: leading with "dark stools, nausea" is how you talk someone out of a medicine
their doctor prescribed. There is no `dose` field in the data model at all.

**Lab reading** — reassurance is delivered *here*, before any result, because this is the
most emotionally loaded ten seconds in the product and the only moment the user is
guaranteed to be reading the screen. Named steps make the delay legible as work.

**Lab summary** — the headline counts what is **fine**. The 36 good markers collapse into
one green line; the two exceptions are amber. The exit is three questions for a doctor.

**Biomarker** — position on a range, never pass/fail. Recommendations carry evidence
grades, which costs one badge and buys the right to be believed on the strong ones.

**Meal plan** — constraint chips are real controls; the week is a pure function of them.
An allergy constraint is locked and explains why.

**Grocery** — grouped by aisle because that is how shopping happens. Swaps are always
labelled with what they save *and* what they cost; a silent substitution is the fastest
way to lose trust in a list.

**Health** — the written summary sits *above* the charts. Four metrics, not fourteen.

**Records** — no folders, no tags, no "move to". Organisation is derived. Every row says
what the app already *did* with the document, which is the difference between a drive and
an assistant. Search covers extracted contents, so "ferritin" finds "Full blood panel".

**You** — goals at the top, because goals are the input to every answer. Privacy copy
describes what actually happens, including the unflattering parts.

**Health profile** — answers the question every AI product dodges: *what do you actually
know about me?* Every fact carries its origin, and "not recorded" is a first-class value.

---

## State matrix

| Screen | Empty | Loading | Error |
| --- | --- | --- | --- |
| Ask · home | Insight card renders **nothing** when no candidate clears the bar; greeting adapts ("Nothing needs you right now") | — (static) | route `error.tsx` |
| Conversation | Fresh thread shows only the composer | `ThinkingDots` + "Reading your health memory", then `ns-caret` while streaming | `ErrorState`: "the connection dropped… nothing was saved". Mid-answer failures are marked in-stream by the API so half an answer is never read as whole |
| Voice | "Say what you need…" placeholder | live transcript | `denied` → how to unblock; `unsupported` → "type it instead" |
| Scanner | Drop-zone when no camera | `StatusPill` narrating real NDJSON stages + reticle sweep | `ErrorState` inline, camera stays live for a retry |
| Food verdict | n/a | — | unmatched foods labelled `est.`; the note explains any degraded path |
| Lab reading | n/a | the whole screen: named steps + progress + privacy line | falls through to the summary |
| Lab summary | "Nothing on this panel needs a conversation" when zero flagged | — (SSG) | `notFound()` |
| Meal plan | "Nothing is guiding this plan right now" when all constraints off; never an empty week (falls back to the unfiltered pool) | — | — |
| Grocery | `EmptyState` → back to the plan | — | — |
| Records | Two distinct empties: no-results-for-query vs nothing-filed-yet, with different actions | — | — |
| Health | Protein tile reads 0 g with "0 meals" rather than hiding | hydration-guarded | — |

**Skeletons** (`Skeleton`, `SkeletonCard`) match the real card's geometry so nothing jumps
on arrival, and collapse to a flat surface under `prefers-reduced-motion` — a frozen
shimmer reads as a rendering bug rather than a loading state.

**Error copy rules.** Say what happened, whether anything was lost, and what to do — in
that order, in plain words, with no red. The route error boundary's second sentence is
"everything you've recorded is stored on this device and is untouched", because that is
the actual question a person has when a health app crashes.
