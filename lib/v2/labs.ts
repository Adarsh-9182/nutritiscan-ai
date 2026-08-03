// ============================================================
// LAB PANELS — THE HARD PROBLEM
//
// A lab PDF is an anxiety machine: 38 rows, red flags, no
// context. This module is the data model that lets the UI do the
// opposite — lead with what is fine, name the few things that
// aren't, and never leave a number without a sentence.
//
// Three modelling decisions carry most of that weight:
//
// 1. `flag` IS NOT `tone`. A marker can be outside its reference
//    range and still be nothing to act on today. Keeping the
//    clinical fact (`flag`) separate from the presentation
//    weight (`tone`) is what stops the UI painting every
//    out-of-range row the same alarming colour. There is no
//    "critical" tone and no red anywhere — see globals.css.
//
// 2. EVERY MARKER OWNS ITS SENTENCE. `plain` is required, not
//    optional. If we cannot say in one line what a number means
//    for this person, we have no business showing the number.
//    Making the field non-optional means the type system refuses
//    a bare row.
//
// 3. RANGES ARE POSITIONS, NOT VERDICTS. `axis` (what the bar
//    spans) is deliberately separate from `comfortable` (where
//    you'd rather be). That's what lets the range bar show where
//    you sit rather than pass/fail — the difference between
//    information and a grade.
// ============================================================

export type MarkerFlag =
  | "in-range"
  | "low-normal"   // inside the reference range, at the bottom of it
  | "high-normal"  // inside, at the top
  | "below-range"
  | "above-range";

/**
 * How much visual weight a marker earns. Only two values, on
 * purpose: the moment a third ("urgent") exists, someone will use
 * it, and the product's promise that nothing here is an emergency
 * stops being true.
 */
export type MarkerTone = "steady" | "attention";

/**
 * How well-supported a recommendation is. Shown to the user
 * verbatim. This is the honest move — it stops the app sounding
 * equally certain about iron absorption (decades of trials) and
 * cast-iron cookware (a handful of small studies).
 */
export type EvidenceGrade = "strong" | "moderate" | "mixed" | "limited";

export const EVIDENCE_LABEL: Record<EvidenceGrade, string> = {
  strong: "Strong evidence",
  moderate: "Moderate evidence",
  mixed: "Mixed",
  limited: "Limited evidence",
};

export type MarkerGroup =
  | "Iron studies"
  | "Lipids"
  | "Blood counts"
  | "Kidney"
  | "Liver"
  | "Thyroid"
  | "Sugar"
  | "Vitamins";

export type Reading = { date: string; value: number };

export type Marker = {
  id: string;
  name: string;
  /** What it measures, in three words. Sits under the name. */
  subtitle: string;
  group: MarkerGroup;
  value: number;
  unit: string;
  /** The span the range bar draws — usually the reference interval. */
  axis: [number, number];
  /** Where you'd rather sit inside that span. Drawn as the green band. */
  comfortable: [number, number];
  flag: MarkerFlag;
  tone: MarkerTone;
  /**
   * The one-sentence read. Required — see the header note.
   * Written to be true whether or not the reader knows any
   * physiology.
   */
  plain: string;
  /** Prior readings, oldest first. Drives the trend line. */
  history?: Reading[];
  /** Plain-language explanation of what the marker actually is. */
  about?: string;
  /** Graded, so the app never sounds certain about things it isn't. */
  helps?: { text: string; grade: EvidenceGrade }[];
};

export type Panel = {
  id: string;
  label: string;
  date: string;      // ISO
  pages: number;
  markers: Marker[];
  /** Panel this one is automatically compared against. */
  comparedTo?: string;
};

export const FLAG_LABEL: Record<MarkerFlag, string> = {
  "in-range": "In range",
  "low-normal": "Low-normal",
  "high-normal": "High-normal",
  "below-range": "Below range",
  "above-range": "Above target",
};

// ------------------------------------------------------------
// Derived reads. Kept as functions rather than stored fields so
// a marker can never carry a percentage that contradicts its own
// value — the classic way a mock becomes a lie in production.
// ------------------------------------------------------------

/** Where the value sits along its own axis, 0–1. Clamped. */
export function axisPosition(m: Pick<Marker, "value" | "axis">): number {
  const [lo, hi] = m.axis;
  if (hi <= lo) return 0;
  return Math.min(1, Math.max(0, (m.value - lo) / (hi - lo)));
}

/** The comfortable band as [startFraction, widthFraction] along the axis. */
export function comfortBand(m: Pick<Marker, "axis" | "comfortable">): [number, number] {
  const [lo, hi] = m.axis;
  const span = hi - lo;
  if (span <= 0) return [0, 0];
  const start = Math.min(1, Math.max(0, (m.comfortable[0] - lo) / span));
  const end = Math.min(1, Math.max(0, (m.comfortable[1] - lo) / span));
  return [start, Math.max(0, end - start)];
}

/**
 * "Bottom 12% of range" — phrased as a position, never a score.
 *
 * Returns null in the middle band because "you are at the 47th
 * percentile of the reference range" is a number with no meaning
 * to act on, and printing it would be noise dressed as insight.
 */
export function positionPhrase(m: Marker): string | null {
  const pct = Math.round(axisPosition(m) * 100);
  if (pct <= 25) return `Bottom ${Math.max(1, pct)}% of range`;
  if (pct >= 75) return `Top ${Math.max(1, 100 - pct)}% of range`;
  return null;
}

/** Change since the previous reading, if there is one to compare. */
export function delta(m: Marker): { from: number; diff: number; direction: "up" | "down" | "flat" } | null {
  const prev = m.history?.[m.history.length - 1];
  if (!prev) return null;
  const diff = +(m.value - prev.value).toFixed(2);
  return { from: prev.value, diff, direction: diff > 0 ? "up" : diff < 0 ? "down" : "flat" };
}

export const attentionMarkers = (p: Panel) => p.markers.filter((m) => m.tone === "attention");
export const steadyMarkers = (p: Panel) => p.markers.filter((m) => m.tone === "steady");

/** "36 of 38 markers are where they should be." */
export function steadyCount(p: Panel): { steady: number; total: number } {
  return { steady: steadyMarkers(p).length, total: p.markers.length };
}

/** Groups that came back entirely clean — the reassurance line. */
export function calmGroups(p: Panel): MarkerGroup[] {
  const dirty = new Set(attentionMarkers(p).map((m) => m.group));
  const all = [...new Set(p.markers.map((m) => m.group))];
  return all.filter((g) => !dirty.has(g));
}

export const markerById = (p: Panel, id: string) => p.markers.find((m) => m.id === id);

// ------------------------------------------------------------
// The demo panel — Dev Raman, 12 July.
//
// 38 markers, two of which earn attention. Everything here is a
// plausible adult male panel; the two flagged values are the ones
// the whole product narrative hangs off (ferritin explains the
// 4pm fatigue, LDL is the diet-responsive one).
// ------------------------------------------------------------

/** Shorthand for the 30-odd markers that are simply fine. */
function steady(
  id: string,
  name: string,
  subtitle: string,
  group: MarkerGroup,
  value: number,
  unit: string,
  axis: [number, number],
  comfortable: [number, number],
  plain: string,
): Marker {
  return { id, name, subtitle, group, value, unit, axis, comfortable, flag: "in-range", tone: "steady", plain };
}

export const JULY_PANEL: Panel = {
  id: "panel-2026-07",
  label: "Full blood panel",
  date: "2026-07-12",
  pages: 4,
  comparedTo: "panel-2026-03",
  markers: [
    // ---- The two that earn attention -------------------------
    {
      id: "ferritin",
      name: "Ferritin",
      subtitle: "Iron stores",
      group: "Iron studies",
      value: 38,
      unit: "µg/L",
      axis: [30, 400],
      comfortable: [50, 150],
      flag: "low-normal",
      tone: "attention",
      plain:
        "Inside the reference range, at the bottom of it. This is the most likely explanation for the afternoon fatigue you logged eleven times.",
      history: [
        { date: "2024-08-14", value: 61 },
        { date: "2025-03-02", value: 52 },
        { date: "2025-11-19", value: 44 },
      ],
      about:
        "Ferritin is the iron you have banked, not the iron in your blood today. It falls slowly and rises slowly, which is why the line has drifted down over four panels rather than dropping.",
      helps: [
        { text: "Iron-rich food with vitamin C", grade: "strong" },
        { text: "Tea and coffee away from meals", grade: "strong" },
        { text: "Cast-iron cooking", grade: "mixed" },
      ],
    },
    {
      id: "ldl",
      name: "LDL cholesterol",
      subtitle: "Up from 3.1 in March",
      group: "Lipids",
      value: 3.6,
      unit: "mmol/L",
      axis: [1.5, 5.0],
      comfortable: [1.5, 3.0],
      flag: "above-range",
      tone: "attention",
      plain:
        "A 0.5 rise over four months. Diet moves this marker more reliably than anything else at your age and weight.",
      history: [
        { date: "2024-08-14", value: 2.8 },
        { date: "2025-03-02", value: 2.9 },
        { date: "2025-11-19", value: 3.1 },
      ],
      about:
        "LDL carries cholesterol out to your tissues. It matters because of what it does over decades, not what it is doing this week — which is why a rise is worth changing something about, and not worth losing sleep over.",
      helps: [
        { text: "Soluble fibre — oats, beans, psyllium", grade: "strong" },
        { text: "Replacing saturated fat with unsaturated", grade: "strong" },
        { text: "Regular aerobic exercise", grade: "moderate" },
        { text: "Red yeast rice supplements", grade: "limited" },
      ],
    },

    // ---- Iron studies (rest) ---------------------------------
    steady("serum-iron", "Serum iron", "Iron in circulation", "Iron studies", 16.1, "µmol/L", [10, 30], [12, 25],
      "Normal. This is iron moving around today, which is why it can look fine while stores run low."),
    steady("tibc", "TIBC", "Iron-carrying capacity", "Iron studies", 68, "µmol/L", [45, 80], [45, 72],
      "At the upper end, which is the expected pattern when stores are on the low side."),
    steady("transferrin-sat", "Transferrin saturation", "How full the carriers are", "Iron studies", 24, "%", [15, 50], [20, 45],
      "Comfortably normal."),

    // ---- Lipids (rest) ---------------------------------------
    steady("total-chol", "Total cholesterol", "All cholesterol", "Lipids", 5.4, "mmol/L", [3, 7.5], [3, 5.2],
      "Slightly above the ideal line, driven by the LDL above rather than by anything separate."),
    steady("hdl", "HDL cholesterol", "The protective one", "Lipids", 1.4, "mmol/L", [0.8, 2.2], [1.2, 2.2],
      "Good. Higher is better here, and yours is comfortably in the useful band."),
    steady("triglycerides", "Triglycerides", "Circulating fat", "Lipids", 1.1, "mmol/L", [0.4, 2.5], [0.4, 1.7],
      "Well within range."),
    steady("non-hdl", "Non-HDL cholesterol", "Everything but HDL", "Lipids", 4.0, "mmol/L", [2, 6], [2, 4.0],
      "At the edge of ideal, and it moves when LDL moves."),

    // ---- Blood counts ----------------------------------------
    steady("hemoglobin", "Haemoglobin", "Oxygen carrier", "Blood counts", 14.4, "g/dL", [13, 17.5], [13.5, 17],
      "Normal — worth noting, because low iron stores can sit behind a perfectly normal haemoglobin for months."),
    steady("rbc", "Red cell count", "Red blood cells", "Blood counts", 5.0, "10¹²/L", [4.3, 6.0], [4.5, 5.9], "Normal."),
    steady("hematocrit", "Haematocrit", "Share of red cells", "Blood counts", 43, "%", [38, 52], [40, 50], "Normal."),
    steady("mcv", "MCV", "Average red cell size", "Blood counts", 86, "fL", [80, 100], [82, 98],
      "Normal. This is the number that would fall first if low iron started affecting cell production."),
    steady("mch", "MCH", "Haemoglobin per cell", "Blood counts", 29, "pg", [27, 33], [27, 33], "Normal."),
    steady("mchc", "MCHC", "Haemoglobin concentration", "Blood counts", 33.5, "g/dL", [32, 36], [32, 36], "Normal."),
    steady("wbc", "White cell count", "Immune cells", "Blood counts", 6.2, "10⁹/L", [4, 11], [4.5, 10], "Normal."),
    steady("neutrophils", "Neutrophils", "First responders", "Blood counts", 3.5, "10⁹/L", [2, 7.5], [2, 7], "Normal."),
    steady("lymphocytes", "Lymphocytes", "Adaptive immunity", "Blood counts", 2.1, "10⁹/L", [1, 4], [1.2, 3.5], "Normal."),
    steady("eosinophils", "Eosinophils", "Allergy-linked cells", "Blood counts", 0.2, "10⁹/L", [0, 0.5], [0, 0.45], "Normal."),
    steady("platelets", "Platelets", "Clotting cells", "Blood counts", 248, "10⁹/L", [150, 400], [180, 380], "Normal."),

    // ---- Kidney ----------------------------------------------
    steady("creatinine", "Creatinine", "Kidney filtering", "Kidney", 84, "µmol/L", [60, 110], [65, 105], "Normal."),
    steady("egfr", "eGFR", "Estimated filtration", "Kidney", 96, "mL/min", [60, 120], [80, 120],
      "Healthy filtration. Anything above 90 is considered normal function."),
    steady("urea", "Urea", "Protein waste", "Kidney", 5.2, "mmol/L", [2.5, 7.8], [2.5, 7.5], "Normal."),
    steady("uric-acid", "Uric acid", "Purine waste", "Kidney", 320, "µmol/L", [200, 430], [200, 400], "Normal."),
    steady("sodium", "Sodium", "Fluid balance", "Kidney", 140, "mmol/L", [135, 145], [136, 144], "Normal."),
    steady("potassium", "Potassium", "Nerve and muscle signalling", "Kidney", 4.3, "mmol/L", [3.5, 5.1], [3.6, 5], "Normal."),

    // ---- Liver -----------------------------------------------
    steady("alt", "ALT", "Liver enzyme", "Liver", 26, "U/L", [7, 55], [7, 50], "Normal."),
    steady("ast", "AST", "Liver enzyme", "Liver", 22, "U/L", [8, 48], [8, 45], "Normal."),
    steady("alp", "ALP", "Liver and bone enzyme", "Liver", 74, "U/L", [40, 130], [45, 125], "Normal."),
    steady("ggt", "GGT", "Bile duct enzyme", "Liver", 24, "U/L", [8, 61], [8, 55], "Normal."),
    steady("bilirubin", "Bilirubin", "Red cell breakdown", "Liver", 11, "µmol/L", [3, 21], [3, 20], "Normal."),
    steady("albumin", "Albumin", "Main blood protein", "Liver", 44, "g/L", [35, 50], [38, 48], "Normal."),

    // ---- Thyroid ---------------------------------------------
    steady("tsh", "TSH", "Thyroid signal", "Thyroid", 2.1, "mIU/L", [0.4, 4.5], [0.5, 3.5],
      "Normal — and worth knowing, because an underactive thyroid is the other common explanation for persistent fatigue. Yours isn't it."),
    steady("ft4", "Free T4", "Thyroid hormone", "Thyroid", 15.2, "pmol/L", [10, 22], [11, 21], "Normal."),

    // ---- Sugar -----------------------------------------------
    steady("glucose", "Fasting glucose", "Blood sugar", "Sugar", 4.9, "mmol/L", [3.5, 7], [3.9, 5.5], "Normal."),
    steady("hba1c", "HbA1c", "Three-month sugar average", "Sugar", 5.4, "%", [4, 7], [4, 5.6],
      "Normal, and unchanged since March — your glucose handling is steady."),

    // ---- Vitamins --------------------------------------------
    steady("vit-d", "Vitamin D", "25-hydroxy", "Vitamins", 68, "nmol/L", [25, 150], [50, 125], "Sufficient."),
    steady("b12", "Vitamin B12", "Nerve and blood vitamin", "Vitamins", 412, "pmol/L", [140, 650], [250, 650], "Comfortably normal."),
  ],
};

export const PANELS: Panel[] = [JULY_PANEL];

export const panelById = (id: string) => PANELS.find((p) => p.id === id);

/**
 * The three questions worth taking to a clinician.
 *
 * Deliberately phrased as questions the *user* asks, not
 * conclusions the app reached. The exit from a lab report should
 * be a conversation with a human, not a purchase.
 */
export const DOCTOR_QUESTIONS = [
  "My ferritin has fallen from 61 to 38 over two years while my haemoglobin stayed normal. Is that worth investigating, or worth watching?",
  "Should I look for a reason I'm losing iron, or is diet a reasonable first step?",
  "My LDL has risen 0.5 in four months. At my age and with no family history, is this a diet conversation or a medication conversation?",
] as const;
