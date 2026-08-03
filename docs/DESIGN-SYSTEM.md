# NutritiScan — Design System

Everything here is implemented in `app/globals.css` and `components/ds/`. This document
explains the *reasoning*; the CSS is the source of truth.

---

## 1. The three colour rules

These are enforced at the token layer, not left to each component's judgement.

### Rule 1 — No red. Anywhere.

Not for out-of-range labs, not for "high" markers, not for form errors, not for the error
boundary. **There is no red token in the system**, so there is nothing for a component to
reach for.

Red is the colour of emergency. This product is not an emergency room, and the single
fastest way to make someone panic about a number that does not warrant it is to paint it
the colour of danger. "Worth attention" gets amber. "Danger" is a sentence a human
writes, not a colour we paint.

### Rule 2 — One accent on results.

Amber/orange is the only accent that appears on a result surface. Green appears *solely*
to say "this is fine, it needs nothing from you". Blue appears *solely* on evidence
provenance. A screen lighting up in four colours reads as four competing alarms.

### Rule 3 — Semantic tokens only.

Components never name a hue. They name a meaning: `--attention`, `--steady`,
`--evidence`, `--accent`. Light mode is then a **token flip, not a re-layout**.

---

## 2. Palette

### Primitives (warm neutral, not blue-grey)

A pure `#000`/`#111` grey reads clinical and cold. Shifting the neutrals a few degrees
toward amber makes the dark theme feel like a dimmed room rather than a piece of medical
equipment.

`--n-0` … `--n-950` · `--o-300` … `--o-800` (accent) · `--a-300` … `--a-800` (attention)
`--g-400` … `--g-800` (steady) · `--b-400` … `--b-800` (evidence)

### Semantic tokens

| Token | Dark | Light | Job |
| --- | --- | --- | --- |
| `--bg` | `#0b0908` | `#fdfaf7` | page |
| `--surface` / `-2` / `-3` | `#17130f` → `#262019` | `#fff` → `#ece5dc` | layered containers |
| `--text` | `#f5efe8` (16.8:1) | `#1c1815` (15.9:1) | primary |
| `--text-2` | `#b6aca1` (7.9:1) | `#57504a` (7.6:1) | secondary prose |
| `--text-3` | `#8b8177` (4.9:1) | `#7b736b` (4.7:1) | metadata — still AA |
| `--accent` | `#f97316` | `#e35d07` | the product's one voice |
| `--accent-text` | `#ff8f45` (7.2:1) | `#c2410c` (5.6:1) | accent used **as text** |
| `--attention-text` | `#fbd38d` | `#86530c` (5.9:1) | "worth attention" |
| `--steady-text` | `#5cc79a` | `#175942` (6.4:1) | "nothing needed" |
| `--evidence-text` | `#7aa7f5` | `#24488f` (6.8:1) | provenance only |

### The light-mode contrast trap

`#f97316` on cream is **~2.9:1** and fails WCAG AA outright. Every "colour as text" token
steps down two stops in light mode so badges and links clear 4.5:1. This is the single
most common accessibility failure in a themed design system, and it is fixed **once, at
the token**, rather than per component.

### Colourblind safety

The four status colours were run through the dataviz validator against the dark surface:

- Contrast vs surface: **all four ≥ 3:1** ✓
- Amber ↔ orange separation: **ΔE 11.7 (deutan), 15.8 (normal)** ✓ (target ≥ 8)
- Amber ↔ orange under **tritanopia: ΔE 4.1** — weak.

That last number is acceptable **only** because these colours never carry meaning alone:
every status ships with a text label ("Low-normal", "Above target") and, where relevant,
an icon. Colour is the secondary channel throughout.

The validator's "lightness band" check fails for this set — correctly, because it is a
*categorical-palette* check and these are *status* colours, where differing lightness is
intentional.

---

## 3. Typography

Geist, one family, one weight axis. Named by **role**, not size, so a screen can be
re-tuned without hunting `text-[13px]` across forty files.

| Class | Size | Use |
| --- | --- | --- |
| `.t-display` | clamp 27→34 | the one sentence that matters ("36 of 38 markers…") |
| `.t-h1` | clamp 23→28 | screen title |
| `.t-h2` | clamp 18→21 | section headline, voice transcript |
| `.t-h3` | 16 | card title |
| `.t-body` | **15** | all prose |
| `.t-meta` | 13 | secondary detail |
| `.t-label` | 11, uppercase, tracked | section eyebrows **only** |
| `.t-numeral` | clamp 38→50 | one measured hero number per screen |

**Body is 15px, not 14px.** This is a health product read by people over 50 and by anyone
anxious enough to be re-reading a sentence. One point costs nothing and buys real
legibility.

**Nothing renders below 11px**, and 11px is reserved for eyebrows — never content.

**Figures.** `.t-numeral` uses **proportional** figures; `tabular-nums` gives every digit
the width of a zero, which makes a standalone `121` look loose at display size. `.tnum`
(tabular) is applied only where digits align vertically — table rows, axis ticks, and any
counter that changes in place.

Fluid sizing is used where the string can be long, so a 34px headline does not wrap to
five lines on a 360px phone.

---

## 4. Space, radius, elevation

- **Spacing:** 4pt base, `--s-1` (4px) … `--s-10` (64px).
- **Radius:** `--r-xs` 8 · `--r-sm` 11 · `--r-md` 15 · `--r-lg` 20 (the card) · `--r-xl` 26 · `--r-full`.
- **Layout:** `--app-max: 480px`. The product is phone-shaped by design; on a desktop it
  centres in a column rather than stretching a conversation to 1600px. `--reading-max: 62ch`.

**Elevation is theme-dependent, and this is the one real structural difference between
the themes.** In dark mode, hierarchy is carried by **surface contrast** — each layer is
a little lighter than the one behind it, and shadows are nearly invisible on near-black.
In light mode a lighter surface is invisible, so `.card` picks up `--shadow-2` and a
hairline. Same markup, different mechanism.

---

## 5. Components (`components/ds/`)

| File | Contents |
| --- | --- |
| `primitives.tsx` | Button, ButtonLink, Card, Eyebrow, DotLabel, Badge, Chip, ChipLink, Row, Divider, Section, Disclaimer |
| `interactive.tsx` | Toggle, Segmented, Disclosure, Sheet |
| `charts.tsx` | LineChart, RangeBar, ScoreRing, Meter, Sparkline |
| `states.tsx` | Skeleton, SkeletonCard, EmptyState, ErrorState, ProcessSteps, ThinkingDots, StatusPill |
| `screen.tsx` | ScreenHeader, ScreenBody, ScreenFooter |
| `tabbar.tsx` | TabBar |
| `markdown.tsx` | Markdown |
| `icons.tsx` | 24 icons, one grid, one stroke weight |

### Decisions worth stating

**`primitives.tsx` has no `"use client"` and no hooks.** The same components render in
Server and Client Components alike. The moment a primitive reaches for `useState`, every
page that uses it gets pulled across the client boundary.

**Badge vs Chip are separate components.** A Badge states a status and is not
interactive; a Chip is a control. Keeping them apart stops a status badge quietly
acquiring an `onClick` and becoming an invisible affordance.

**Interactive primitives are built on native elements** — a real `<input type=checkbox>`
inside Toggle, a real `<dialog>` inside Sheet, a real `<details>` inside Disclosure.
Focus trapping, Escape-to-close, keyboard behaviour and screen-reader semantics are then
correct by default rather than by remembering.

**Icons are hand-rolled** on a 24-grid at 1.6 stroke with round caps. Icon libraries mix
1.5 and 2.0 weights across their catalogue, which reads as sloppy when five sit together
in a tab bar.

**Markdown builds React elements directly — no `dangerouslySetInnerHTML`, no library.**
This is a security decision: the text arrives from a model that has been fed
user-authored content (meal titles, profile fields, a pasted report). A renderer that
parses to HTML is one prompt-injection away from putting an attacker's markup in the
page. The worst case here is ugly text.

---

## 6. Charts

Every chart is **single-series**, which follows from the product line "a sentence beats a
sparkline" — the prose carries the meaning, the chart only shows shape. One series means
no legend (the title names it) and no categorical palette to get wrong.

Fixed specs:

- 2px lines, round cap/join
- end markers r=4.5 (≥8px) with a **2px surface ring** so the dot stays legible where it
  crosses the line
- area wash at ~9% opacity — never a saturated block
- **solid** hairline gridlines one step off the surface
- selective direct labels only — never a number on every point
- **labels wear text tokens, never the series colour.** Light amber is illegible as text;
  identity comes from the coloured mark beside it
- container height includes the axis band, so a card never gets a nested scrollbar
- **every chart ships a `<table>` twin** in the accessibility tree — a chart is never the
  only route to a value
- crosshair + nearest-point hover on line charts (an 8px dot you must hit dead-centre is
  not a hover target)

**Charts render in true pixel space** via a `ResizeObserver`, not a fixed `viewBox` with
`preserveAspectRatio="none"`. The shortcut distorts every mark that should be round or
upright — a 100-unit sparkline stretched across 330px scales x by 6.6 and y by 2, turning
end-dots into flat ovals and axis labels into condensed type.

**One deliberate exception to "no dashed lines":** the comfortable-floor rule on a
biomarker trend. There, dashing *is* the meaning — it marks a threshold, not a grid — and
it carries a visible label saying so.

**RangeBar is the most important chart in the product**, because it is the one that
replaces a red "HIGH" flag. It shows **position, never pass/fail**: the comfortable band
is drawn as a region you would rather be in, not a boundary you failed to clear.

---

## 7. Motion

Durations and curves are tokens, because "how fast the app feels" must be one decision,
not fifty.

| Token | Value | Use |
| --- | --- | --- |
| `--dur-1` | 120ms | state flips: toggle, hover, press |
| `--dur-2` | 200ms | element enter/exit, chips, badges |
| `--dur-3` | 320ms | cards, sheets, list stagger |
| `--dur-4` | 520ms | page transitions, hero reveals |
| `--dur-5` | 900ms | data drawing: charts, range bars, rings |

`--ease: cubic-bezier(.22,.61,.36,1)` · `--ease-out: cubic-bezier(.16,1,.3,1)`

**Nothing uses a bouncy spring.** Overshoot reads as playful, and playful is wrong when
the content is a cholesterol trend.

Every keyframe answers a question the user is actually asking:

| Animation | The question | Where |
| --- | --- | --- |
| `ns-breathe` | "Is it still working?" | scan status pill, lab reader active step |
| `ns-bar` | "Is it listening?" | voice capture |
| `ns-dot` | "Is it thinking?" | before the first token lands |
| `ns-caret` | "Where am I in the answer?" | streaming text |
| `ns-skeleton` | "Is content coming?" | loading placeholders |
| `ns-pulse` | "Am I being heard?" | voice orb |
| `ns-draw` | "What is the value?" | range bars, rings, sparklines |
| `ns-sweep` | "Is it reading this?" | scan reticle |

Data drawing is slow (`--dur-5`) **on purpose**: a value sliding into place is legible as
a measurement, whereas an instant jump reads as a static image and gets skipped.

**`prefers-reduced-motion` is honoured globally**, in `globals.css`, so a new animation
can never ship without it. It disables *animation*, not *feedback* — transitions resolve
instantly to their end state, so a user who asked for less motion still sees the result,
just not the travel. `MotionConfig reducedMotion="user"` covers the JS-driven side.

---

## 8. Accessibility

- **Contrast:** every text token documented above clears AA on its own surface, in both
  themes. `--text-3`, the dimmest, is 4.9:1 (dark) / 4.7:1 (light) and is used for
  metadata only.
- **Colour is never the sole channel.** Every status has a text label. Every process step
  announces its state as words to a screen reader.
- **Targets:** the `.tap` utility guarantees 44×44pt even where a control looks smaller.
- **Focus:** a global `:focus-visible` ring is the floor, so a component that sets
  `outline: none` for a custom ring can never leave a keyboard user lost.
- **Zoom is not disabled.** The viewport deliberately omits `maximumScale: 1` — pinch-zoom
  is the assistive technology most people actually use, and a health product is the last
  place to disable it for a tidy layout.
- **Landmarks + skip link** on every screen; `<main id="main">` is the target.
- **Live regions** on the process steps, the scan status pill, the voice transcript, and
  the thinking indicator.
- **Charts** carry `role="img"` with a descriptive label *and* a table twin.
- **`prefers-contrast: more`** strengthens borders and lifts `--text-3` to `--text-2`.
- **Theme has no flash:** a blocking inline script resolves the stored theme before first
  paint (`THEME_BOOT_SCRIPT`).

## 9. Responsive

The app is a centred `480px` column. Below that it is fluid; above it, it stays a column
rather than stretching. Fluid type via `clamp()` handles 320px → 480px without a
breakpoint. Horizontal rails (`.rail`) scroll internally so the page body never scrolls
sideways. Safe-area insets (`--safe-t`, `--safe-b`) are respected by the header, the tab
bar, every screen footer, and `.app-scroll`.
