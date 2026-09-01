import type { Biomarker } from "./profile";

// ------------------------------------------------------------
// Lightweight lab-report parser. Pastes of common panels are
// scanned for known markers and classified against rough
// reference ranges. This is educational structuring, NOT a
// diagnosis — the Lab Agent interprets the values in context.
// ------------------------------------------------------------

type MarkerSpec = {
  name: string;
  unit: string;
  patterns: RegExp[];
  classify: (v: number) => Biomarker["status"];
  note?: (v: number) => string | undefined;
};

const SPECS: MarkerSpec[] = [
  {
    name: "Vitamin B12",
    unit: "pg/mL",
    patterns: [/(?:vitamin\s*)?b[\s-]?12[^0-9]*(\d{2,4})/i, /cobalamin[^0-9]*(\d{2,4})/i],
    classify: (v) => (v < 200 ? "low" : v > 900 ? "high" : "normal"),
    note: (v) => (v < 200 ? "Below optimal (200–900)" : undefined),
  },
  {
    name: "Vitamin D",
    unit: "ng/mL",
    patterns: [/25[\s-]?oh[^0-9]*(\d{1,3})/i, /vitamin\s*d3?\b[^0-9]*(\d{1,3})/i],
    classify: (v) => (v < 20 ? "low" : v < 40 ? "borderline" : v > 100 ? "high" : "normal"),
    note: (v) => (v < 40 ? "Aim for 40–60" : undefined),
  },
  {
    name: "Hemoglobin",
    unit: "g/dL",
    // The negative lookahead is load-bearing: without it "HbA1c 5.6" matched
    // `hb`, skipped "A" as padding and captured the 1 out of "A1c" — the
    // parser reported "Hemoglobin 1 g/dL, low", inventing severe anaemia out
    // of a routine diabetes marker. HbA1c has its own spec below.
    patterns: [/\bh(?:a?emoglobin|gb|b)(?!\s*a1c)[^0-9]*(\d{1,2}(?:\.\d)?)/i],
    classify: (v) => (v < 13 ? "low" : v > 17.5 ? "high" : "normal"),
  },
  {
    name: "Fasting glucose",
    unit: "mg/dL",
    patterns: [/(?:fasting\s*)?glucose[^0-9]*(\d{2,3})/i],
    classify: (v) => (v < 70 ? "low" : v <= 99 ? "normal" : v <= 125 ? "borderline" : "high"),
    note: (v) => (v >= 100 && v <= 125 ? "Pre-diabetic range" : undefined),
  },
  {
    name: "TSH",
    unit: "mIU/L",
    patterns: [/\btsh\b[^0-9]*(\d{1,2}(?:\.\d{1,2})?)/i],
    classify: (v) => (v < 0.4 ? "low" : v > 4 ? "high" : "normal"),
    note: (v) => (v > 4 ? "May suggest underactive thyroid — discuss with a clinician" : undefined),
  },
  {
    // Ahead of Hemoglobin in intent, not position: the lookahead above is what
    // keeps them apart. Present as its own marker because a nutrition product
    // that reads a lab report and silently drops the glucose-control number is
    // missing the one value most of its advice should turn on.
    name: "HbA1c",
    unit: "%",
    patterns: [/\bhb\s*a1c\b[^0-9]*(\d{1,2}(?:\.\d{1,2})?)/i, /\bglycated\s+h(?:a?emoglobin)\b[^0-9]*(\d{1,2}(?:\.\d{1,2})?)/i],
    classify: (v) => (v < 4 ? "low" : v < 5.7 ? "normal" : v <= 6.4 ? "borderline" : "high"),
    note: (v) =>
      v >= 6.5
        ? "In the diabetic range — this needs a clinician, not an app"
        : v >= 5.7
          ? "Pre-diabetic range (5.7–6.4)"
          : undefined,
  },
  {
    name: "Total cholesterol",
    unit: "mg/dL",
    patterns: [/(?:total\s*)?cholesterol[^0-9]*(\d{2,3})/i],
    classify: (v) => (v < 200 ? "normal" : v < 240 ? "borderline" : "high"),
  },
];

/**
 * Scan a pasted or OCR'd report for known markers.
 *
 * Line by line, deliberately. Matching against the whole document let a
 * marker name on one line reach across the newline and capture a number
 * belonging to a different marker on the next — a report that lists "TSH"
 * with the result in a column that failed to extract would be given whoever
 * came after it. A lab value attributed to the wrong marker is worse than a
 * missing one: the user cannot tell it is wrong, and every agent downstream
 * treats it as recorded Fact.
 *
 * Within a line the gap between name and value is unbounded (`[^0-9]*`
 * rather than the old `{0,12}`), because real reports are column-aligned and
 * a marker padded out past twelve characters — "TSH" followed by fourteen
 * spaces — was silently dropped.
 *
 * First line wins per marker: reports repeat the name in a reference-range
 * footer, and the result line comes first.
 */
export function parseLabReport(text: string): Biomarker[] {
  const lines = text.split(/\r?\n/);
  const found: Biomarker[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    for (const spec of SPECS) {
      if (seen.has(spec.name)) continue;
      for (const re of spec.patterns) {
        const m = line.match(re);
        if (!m) continue;
        const v = parseFloat(m[1]);
        if (!Number.isNaN(v)) {
          found.push({
            name: spec.name,
            value: `${v} ${spec.unit}`,
            status: spec.classify(v),
            note: spec.note?.(v),
          });
          seen.add(spec.name);
        }
        break; // first matching pattern per spec
      }
    }
  }
  return found;
}

// Merge parsed markers into an existing list (replace by name, keep the rest).
export function mergeBiomarkers(existing: Biomarker[], incoming: Biomarker[]): Biomarker[] {
  if (!incoming.length) return existing;
  const map = new Map(existing.map((b) => [b.name, b]));
  for (const b of incoming) map.set(b.name, b);
  return [...map.values()];
}
