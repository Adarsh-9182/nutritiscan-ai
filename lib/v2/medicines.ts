// ============================================================
// MEDICINE INTELLIGENCE
//
// The hardest editorial line in the product runs through this
// file. A medicine screen that says too little is useless; one
// that says too much is practising medicine.
//
// The rule we settled on: WE EXPLAIN, WE NEVER DOSE.
//
// - "Each tablet gives 68 mg of elemental iron" is a fact about
//   the product in your hand. We say it.
// - "Take one a day" is a dose. We never say it — even though
//   every box says it — because the moment the app states a
//   dose, a user who was told something different by their
//   doctor has two authorities disagreeing, and the app is the
//   one that doesn't know them.
//
// The type system carries that rule: there is no `dose` field.
// The one genuinely actionable thing we DO surface is TIMING,
// because absorption timing is a property of chemistry rather
// than of the patient, and getting it wrong quietly wastes the
// medicine.
// ============================================================

export type InteractionSeverity = "avoid-together" | "space-apart" | "note";

export type Interaction = {
  /** What it interacts with — a food, a drink, or another of the user's items. */
  with: string;
  severity: InteractionSeverity;
  what: string;
  /** Present only when the fix is a timing gap. */
  spaceHours?: number;
  /** True when this collides with something in the user's own records. */
  fromYourItems?: boolean;
};

export type Medicine = {
  id: string;
  name: string;
  /** Generic/ingredient line under the name. */
  kind: string;
  form: string;
  /** What the drug does, in plain words. Never why *you* were given it. */
  purpose: string;
  /**
   * The one genuinely actionable fact. Optional — most medicines
   * don't have a timing rule worth an amber card, and inventing
   * one to fill the space would be exactly the wrong instinct.
   */
  timing?: { headline: string; detail: string };
  commonEffects: string[];
  interactions: Interaction[];
  storage: string;
  /** Suggested reminder, and the human reason for that clock time. */
  reminder?: { time: string; why: string };
};

export const MEDICINES: Medicine[] = [
  {
    id: "ferrous-fumarate-210",
    name: "Ferrous fumarate 210 mg",
    kind: "Iron supplement",
    form: "tablet",
    purpose:
      "Replaces iron stores. Each tablet gives 68 mg of elemental iron — which is why the 210 mg on the box is a much bigger number than the iron you actually absorb.",
    timing: {
      headline: "Timing matters here",
      detail:
        "Tea, coffee and calcium cut absorption sharply. Take it with water or citrus, at least an hour away from your morning chai and your evening curd.",
    },
    commonEffects: ["Dark stools", "Mild nausea", "Constipation"],
    interactions: [
      {
        with: "Tea & coffee",
        severity: "space-apart",
        what: "Tannins bind iron in the gut and can cut absorption by more than half.",
        spaceHours: 1,
        fromYourItems: true,
      },
      {
        with: "Curd, milk, paneer",
        severity: "space-apart",
        what: "Calcium competes with iron for the same absorption pathway.",
        spaceHours: 2,
        fromYourItems: true,
      },
      {
        with: "Vitamin C",
        severity: "note",
        what: "Works in your favour — citrus alongside the tablet increases how much iron you take up.",
      },
    ],
    storage: "Dry, below 25°C",
    reminder: { time: "09:00", why: "Before breakfast, after the chai" },
  },
  {
    id: "vitamin-d3-1000",
    name: "Vitamin D3 1000 IU",
    kind: "Cholecalciferol",
    form: "soft gel",
    purpose:
      "Supports calcium absorption and bone maintenance. Fat-soluble, so it is stored rather than flushed out daily.",
    timing: {
      headline: "Take it with fat",
      detail:
        "Absorption roughly doubles when it's taken with a meal containing fat, compared to on an empty stomach. Your evening meal is the easiest anchor.",
    },
    commonEffects: ["Rarely any at this strength"],
    interactions: [
      {
        with: "Ferrous fumarate",
        severity: "note",
        what: "No meaningful interaction — these two can share a meal.",
        fromYourItems: true,
      },
    ],
    storage: "Cool and dark, away from sunlight",
  },
];

export const medicineById = (id: string) => MEDICINES.find((m) => m.id === id);

export const SEVERITY_LABEL: Record<InteractionSeverity, string> = {
  "avoid-together": "Don't combine",
  "space-apart": "Space apart",
  note: "Worth knowing",
};

/** How many of the user's own recorded items a medicine collides with. */
export const yourItemClashes = (m: Medicine) =>
  m.interactions.filter((i) => i.fromYourItems && i.severity !== "note").length;

/**
 * Shown under every medicine screen, verbatim, with no way to
 * dismiss it. Educational framing is not a footnote to be A/B
 * tested away.
 */
export const MEDICINE_DISCLAIMER =
  "Educational information, not a prescription. Dose changes belong to your clinician — we can prepare the question for you.";
