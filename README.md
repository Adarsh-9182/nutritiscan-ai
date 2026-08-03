# NutritiScan

**The AI health operating system. Start with a question, not a dashboard.**

One surface answers everything — food, labs, medicine, plans. The intelligence never
announces itself: it shows up as a plain answer, the evidence behind it, and one next
step.

```bash
npm install
npm run dev        # http://localhost:3000
npm run verify     # lint + types + tests + production build
```

**It works with no API key.** Without `AI_GATEWAY_API_KEY` a deterministic, safety-bound
demo brain answers from your actual stored profile and meal log — and refuses to assert
anything it can't support. Set the key to switch on the real multi-agent supervisor.

---

## What it does

- **Ask** — conversational health reasoning across your labs, meals and device data.
  Every answer carries the sources it used and ends in one testable action.
- **Scan** — one camera, five things it understands: food, barcode, nutrition label, lab
  report, medicine. Recognition resolves to a verdict *in words* before any number.
- **Labs** — a blood report that lowers the pulse. Leads with what is fine, names the few
  things that aren't, and never leaves a number without a sentence.
- **Medicine** — purpose, timing, interactions checked against your own items. Explains,
  never doses.
- **Plan** — a week built from constraints you can see and change, each meal tagged with
  the marker it serves.
- **Records** — an intelligent timeline. Nothing is filed by you; every row states what
  the app already did with the document.
- **You** — what the assistant knows, where each fact came from, and a delete button that
  works.

## Documentation

| Doc | Contents |
| --- | --- |
| [`docs/PRODUCT.md`](docs/PRODUCT.md) | Category argument, the five principles, personas, information architecture, user journeys |
| [`docs/DESIGN-SYSTEM.md`](docs/DESIGN-SYSTEM.md) | Colour rules, tokens, type scale, components, chart specs, motion specs, accessibility, responsive |
| [`docs/SCREENS.md`](docs/SCREENS.md) | Screen index, the argument for each, and the empty/loading/error state matrix |
| [`docs/ENGINEERING.md`](docs/ENGINEERING.md) | Architecture, data flow, component hierarchy, **what's real vs simulated**, bugs fixed, roadmap |

Per-screen and per-module rationale lives in the header comment of each file.

## The three rules that shape everything

1. **No red. Anywhere.** There is no red token in the design system, so there is nothing
   for a component to reach for. "Worth attention" is amber; "danger" is a sentence a
   human writes.
2. **Sentence first, evidence second, numbers last.** Universally, including the food
   scanner and the lab report.
3. **Never invent data.** Absence is shown as "not recorded", provenance chips are derived
   from the context actually sent to the model, and recommendations carry evidence grades.

## Safety

Educational companion, not a doctor. It explains, it never diagnoses. Emergency phrases
short-circuit to "seek care now". Dosing is always deferred to a clinician. Health data
stays in this browser's local storage — the settings screen says so plainly, including
the parts that aren't flattering.

## Status

Lint clean · types clean · 105 tests passing · production build green (61 static pages).
Verified at 390×844 in both themes.

The largest gap is a real lab-report parser — see the roadmap in
[`docs/ENGINEERING.md`](docs/ENGINEERING.md).
