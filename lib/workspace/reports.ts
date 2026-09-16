import type { Observation } from "./types";

// Conservative line-based extraction. No inferred unit, range or diagnosis.
// Ambiguous lines remain in the preview for manual entry instead of guessing.
const KNOWN: [string, RegExp][] = [
  ["Vitamin B12", /(?:vitamin\s*)?b[ -]?12\b|cobalamin/i],
  [
    "Vitamin D",
    /(?:25[ -]?(?:oh|hydroxy)\s*)?vitamin\s*d(?:3)?\b|25[ -]?oh\b/i,
  ],
  ["HbA1c", /\bhb\s*a1c\b|glycated h(?:ae|e)moglobin/i],
  ["Hemoglobin", /\bh(?:ae|e)moglobin\b|\bhgb\b|\bhb\b(?!\s*a1c)/i],
  ["Glucose", /(?:fasting\s+|random\s+)?(?:blood\s+)?glucose\b/i],
  ["TSH", /\btsh\b/i],
  ["Total cholesterol", /\btotal cholesterol\b/i],
  ["LDL cholesterol", /\bldl(?:[ -]cholesterol)?\b/i],
  ["HDL cholesterol", /\bhdl(?:[ -]cholesterol)?\b/i],
  ["Triglycerides", /\btriglycerides\b/i],
  ["Creatinine", /\bcreatinine\b/i],
  ["Ferritin", /\bferritin\b/i],
];
const NUMBER = "(\\d+(?:\\.\\d+)?)";
const UNIT =
  "(pg\\/ml|ng\\/ml|ng\\/dl|mg\\/dl|g\\/dl|mmol\\/l|pmol\\/l|nmol\\/l|miu\\/l|uiu\\/ml|µiu\\/ml|%|µg\\/dl|ug\\/dl|µmol\\/l|umol\\/l)";
export function extractReport(text: string): Observation[] {
  const observations: Observation[] = [];
  for (const line of text.normalize("NFKC").split(/\r?\n/)) {
    // Reference-only lines are not results.
    if (/^\s*(reference|normal range|method|note|interpretation)/i.test(line))
      continue;
    for (const [name, re] of KNOWN) {
      const match = re.exec(line);
      if (!match || observations.some((o) => o.name === name)) continue;
      const after = line.slice(match.index + match[0].length);
      const result = new RegExp(
        `^[\\s:|]*${NUMBER}\\s*${UNIT}(?=\\s|$|[|,;(])`,
        "i",
      ).exec(after);
      if (!result) continue;
      const trailing = after.slice(result[0].length);
      const range = new RegExp(
        `(?:range|ref(?:erence)?|[|(])?[:\\s]*${NUMBER}\\s*[-–—]\\s*${NUMBER}`,
        "i",
      ).exec(trailing);
      const low = range ? Number(range[1]) : null;
      const high = range ? Number(range[2]) : null;
      observations.push({
        name,
        value: Number(result[1]),
        unit: result[2],
        low: low !== null && high !== null && low > high ? null : low,
        high: low !== null && high !== null && low > high ? null : high,
      });
      break;
    }
  }
  return observations;
}
