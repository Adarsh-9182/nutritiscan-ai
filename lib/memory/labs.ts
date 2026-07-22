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
    patterns: [/(?:vitamin\s*)?b[\s-]?12[^0-9]{0,12}(\d{2,4})/i, /cobalamin[^0-9]{0,12}(\d{2,4})/i],
    classify: (v) => (v < 200 ? "low" : v > 900 ? "high" : "normal"),
    note: (v) => (v < 200 ? "Below optimal (200–900)" : undefined),
  },
  {
    name: "Vitamin D",
    unit: "ng/mL",
    patterns: [/25[\s-]?oh[^0-9]{0,20}(\d{1,3})/i, /vitamin\s*d3?\b[^0-9]{0,12}(\d{1,3})/i],
    classify: (v) => (v < 20 ? "low" : v < 40 ? "borderline" : v > 100 ? "high" : "normal"),
    note: (v) => (v < 40 ? "Aim for 40–60" : undefined),
  },
  {
    name: "Hemoglobin",
    unit: "g/dL",
    patterns: [/h(?:a?emoglobin|gb|b)[^0-9]{0,12}(\d{1,2}(?:\.\d)?)/i],
    classify: (v) => (v < 13 ? "low" : v > 17.5 ? "high" : "normal"),
  },
  {
    name: "Fasting glucose",
    unit: "mg/dL",
    patterns: [/(?:fasting\s*)?glucose[^0-9]{0,12}(\d{2,3})/i],
    classify: (v) => (v < 70 ? "low" : v <= 99 ? "normal" : v <= 125 ? "borderline" : "high"),
    note: (v) => (v >= 100 && v <= 125 ? "Pre-diabetic range" : undefined),
  },
  {
    name: "TSH",
    unit: "mIU/L",
    patterns: [/tsh[^0-9]{0,12}(\d{1,2}(?:\.\d{1,2})?)/i],
    classify: (v) => (v < 0.4 ? "low" : v > 4 ? "high" : "normal"),
    note: (v) => (v > 4 ? "May suggest underactive thyroid — discuss with a clinician" : undefined),
  },
  {
    name: "Total cholesterol",
    unit: "mg/dL",
    patterns: [/(?:total\s*)?cholesterol[^0-9]{0,12}(\d{2,3})/i],
    classify: (v) => (v < 200 ? "normal" : v < 240 ? "borderline" : "high"),
  },
];

export function parseLabReport(text: string): Biomarker[] {
  const found: Biomarker[] = [];
  for (const spec of SPECS) {
    for (const re of spec.patterns) {
      const m = text.match(re);
      if (m) {
        const v = parseFloat(m[1]);
        if (!Number.isNaN(v)) {
          found.push({
            name: spec.name,
            value: `${v} ${spec.unit}`,
            status: spec.classify(v),
            note: spec.note?.(v),
          });
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
