# NutritiScan — Engineering

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · Motion (Framer Motion's
successor) · AI SDK v7 · Vitest.

Two notes on the brief's stack list:

- **shadcn/ui** was not installed. The design language here is specific enough
  (semantic-token-only, no red, custom chart specs) that shadcn's Radix defaults would be
  fought more than used. `components/ds/` is built in the shadcn *idiom* — composable
  primitives, `cn()` merge, variant tables — on native elements, which is what shadcn
  itself does underneath.
- **React Query** was not added. Every piece of state here is either local
  (`localStorage` via `useSyncExternalStore`) or a stream (`useChat`, NDJSON). There is
  no server cache to manage, and an unused dependency in a health product is
  unjustifiable surface area. If a sync backend lands, this is the first thing to revisit.

## Architecture

```
app/                     routes — thin. metadata + a screen component.
components/ds/           the design system. hook-free where possible.
components/screens/      one file per screen. all rationale in header comments.
lib/v2/                  the V2 domain: labs, persona, medicines, plan, records,
                         insight, conversation, client store
lib/agents/              multi-agent supervisor + safety + keyless demo brain
lib/memory/              health memory: schema (sanitisation), store, profile, meals
lib/nutrition/           deterministic meal analysis + food database
lib/health/              longitudinal insight engine
```

### The layering that matters

**The AI-facing contract and the presentation model are deliberately separate.**

`HealthProfile` (`lib/memory/profile.ts`) is what agents receive. It is
safety-critical, sanitised on every request (`lib/memory/schema.ts`), and deliberately
coarse. `lib/v2/` layers a richer presentation model *on top* of it —
`Marker` carries an axis, a comfortable band, four readings of history and graded
recommendations; `Biomarker` carries a name, a string value and a status.

`personToProfile()` is the one bridge. It narrows deliberately: sending the full `Marker`
into an instruction block would widen an untrusted prompt-injection surface for no gain,
since the model reasons about "ferritin is low-normal at 38 µg/L", not about the shape of
a trend line it cannot see. It also sends only the notable markers, not all 38 — shipping
every row is context stuffing, and it would push the two that matter into the noise.

### Data flow

```
localStorage ──useSyncExternalStore──> screens
     ▲                                    │
     │                                    ▼
  addMealFromScan                   POST /api/chat
                                    { messages, profile, meals }
                                          │
                                    safeProfile / safeMeals   ← never trust the client
                                          │
                              hasModelCredential()?
                                   ├── yes → Supervisor (5 specialists) → UI stream
                                   └── no  → demo brain (deterministic, safe, streamed)
```

The keyless path is not a stub. With no `AI_GATEWAY_API_KEY`, `lib/agents/demo.ts`
answers from the real profile and the real meal log, and it refuses to assert anything it
cannot support — with nothing logged, it says so rather than quoting a formula.

### Component hierarchy

```
RootLayout  (theme boot script, fonts, skip link)
├── MotionConfig reducedMotion="user"
├── .app-shell  (480px column)
│   └── <page>
│       ├── ScreenHeader   sticky, blurred, back-aware
│       ├── <main id="main" class="app-scroll">
│       │   ├── Card / Section / Row / Badge / Chip
│       │   ├── LineChart | RangeBar | Meter | ScoreRing | Sparkline
│       │   └── EmptyState | ErrorState | ProcessSteps | Skeleton
│       └── ScreenFooter?  (primary action, above the tab bar)
└── TabBar  (fixed; Ask · [Scan] · Health · You)
```

`ScreenHeader`'s back button calls `router.back()` only when there is history, and falls
back to an explicit `backHref` otherwise — half these screens are reachable by deep link
(a lab summary from a notification, a medicine from a record), where a bare
`router.back()` either does nothing or drops the user out of the app.

---

## What is real vs. simulated

Stated plainly, because a health demo that blurs this line is the exact failure the
product is designed against.

### Real

- **Multi-agent reasoning.** Supervisor + 5 specialists, scoped memory per specialist,
  live streaming. Needs `AI_GATEWAY_API_KEY`.
- **Keyless demo brain.** Deterministic, safety-bound, answers from actual stored data.
- **Meal analysis.** `lib/nutrition/` is a real food database and a real scoring engine.
  Every macro, micronutrient, flag and swap is computed, and personalised against the
  user's own labs and allergies.
- **Vision scanning.** Real model call, real NDJSON stage stream. Degrades honestly when
  unavailable (says so, and labels a sample as a sample).
- **Meal & grocery planning.** `buildWeek()` is a pure function of the constraint set —
  loosening a chip genuinely re-ranks the candidate pool and changes the week. The
  grocery list is derived from the resulting week, never stored, so it cannot drift.
- **Lab model.** Every derived read (`axisPosition`, `positionPhrase`, `delta`,
  `steadyCount`, `calmGroups`) is computed from the panel, so a changed value changes the
  sentence. Covered by `lib/v2/labs.test.ts`.
- **Voice.** Real Web Speech API, with honest fallbacks for browsers that lack it.
- **Theme, privacy toggles, reminders, grocery ticks, export, delete.** All persist.
- **Security.** CSP, rate limiting, body caps, prompt-injection sanitisation, and a
  Permissions-Policy that grants camera/mic to self only.

### Simulated, and labelled as such in the UI

- **The demo panel** (`JULY_PANEL`) is authored clinical data for Dev Raman. Uploading a
  real PDF runs the reassurance flow and lands on this panel — **there is no PDF parser
  yet.** This is the largest gap. See below.
- **Seeded conversations** are marked `seeded: true`.
- **Grocery prices** are static estimates, stated as such on screen.
- **Voice amplitude bars** are a fixed rhythm, not real mic amplitude — reading true
  amplitude needs an `AudioContext` analyser on a second stream, i.e. a second permission
  prompt purely to animate six rectangles. The transcript carries the actual verification.
- **"Send to delivery"** confirms locally; no partner integration.
- **Reminders** persist but do not schedule a notification.

---

## Bugs found and fixed in existing code

Two pre-existing defects surfaced during this build. Both were real, both are fixed, both
have regression coverage or a clear note.

**1. `optionalNum` rejected `undefined` under Zod v4 — severity: high.**
`lib/memory/schema.ts`. A bare `z.unknown().transform(fn)` is treated as non-optional at
the output, so a transform returning `undefined` failed the *entire* object with
"expected nonoptional, received undefined". Neither `budgetPerDay` nor `proteinGoal` is
collected at onboarding, so **almost every real profile failed validation and silently
fell back to `demoProfile`** — meaning the agents were handed somebody else's body,
biomarkers and goals and answered a real person's health question as if they were the
demo user. Exactly the "invent data you weren't given" failure the SAFETY block forbids,
arriving *through* the validator meant to prevent it. Three tests in
`schema.test.ts` had been failing because of it. Fixed with `.optional()`; regression test
added (`accepts a profile that omits every optional field`).

**2. `Permissions-Policy: microphone=()` disabled the app's own microphone.**
`next.config.ts`. Camera and microphone were denied outright, silently breaking the voice
screen's speech recognition and the scanner's live viewfinder. The failure was invisible
in development because both degrade gracefully — the app looked like it merely lacked
browser support rather than like it was forbidding itself. Now `camera=(self),
microphone=(self)`, which still blocks any embedded third-party frame.

Also corrected: redirects pointed at `/home` and `/progress`, routes that no longer
exist, so both resolved to 404s. All six legacy paths now redirect to the v2 screen that
answers the same need.

---

## Verification

```bash
npm run verify     # lint + tsc --noEmit + vitest + next build
```

Current state: **lint clean · types clean · 105 tests passing · production build green
(61 static pages).** Every route smoke-tested at 390×844 in both themes.

---

## Roadmap, in priority order

1. **A real lab parser.** The single biggest gap between demo and product. A vision-model
   pass with a structured schema (the same pattern `app/api/scan/route.ts` already uses
   for food), plus a marker-name normaliser and unit conversion, plus a confidence
   threshold below which the app says "I couldn't read this reliably" rather than
   guessing. Everything downstream — summary, detail, trends, plan constraints — already
   works off the `Panel` type, so this is a data-source swap, not a redesign.
2. **Accounts and encrypted sync.** Health data currently sits unencrypted in
   `localStorage`, which the settings screen states honestly. This is the ceiling on
   everything else and needs a real threat model before it ships.
3. **Shared rate limiting.** `lib/http/guard.ts` is an in-memory per-instance counter and
   documents that it is not the real answer. Move to Upstash/KV — `checkRate` is shaped
   so it is a one-function change.
4. **Nonce-based CSP.** `'unsafe-inline'` is currently required by inline styles and
   Next's bootstrap; middleware nonces would close it.
5. **Real trend history from real panels.** Once (1) lands, `Marker.history` becomes
   observed rather than authored.
6. **Barcode decoding.** The mode exists and routes correctly; it needs a real decoder.
