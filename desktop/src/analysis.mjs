import { z } from "zod";
import { setImmediate } from "node:timers/promises";
import { parseDelimited, profileDelimited } from "./datasets.mjs";

export const ANALYSIS_ENGINE = "nutritiscan-descriptive-v1";
const column = z.string().min(1).max(300);
export const AnalysisOperation = z.discriminatedUnion("type", [
  z.object({ type: z.literal("profile") }).strict(),
  z.object({ type: z.literal("group-summary"), value: column, group: column }).strict(),
  z.object({ type: z.literal("correlation"), x: column, y: column }).strict(),
]);
export const AnalysisSpec = z.object({
  title: z.string().trim().min(1).max(160), question: z.string().trim().min(3).max(1500),
  path: z.string().min(1).max(500).refine((value) => /\.(csv|tsv)$/i.test(value), "Select a CSV or TSV dataset."),
  missingValues: z.array(z.string().trim().min(1).max(40)).max(20).refine((values) => new Set(values).size === values.length),
  operations: z.array(AnalysisOperation).min(1).max(6),
}).strict();
export const AnalysisRecord = z.object({
  id: z.string().uuid(), spec: AnalysisSpec, engine: z.literal(ANALYSIS_ENGINE),
  source: z.object({ sha256: z.string().regex(/^[a-f\d]{64}$/), bytes: z.number().int().min(1).max(2_000_000), modifiedAt: z.string() }).strict(),
  status: z.enum(["pending", "running", "completed", "failed", "rejected", "interrupted", "stale"]),
  createdAt: z.string().datetime(), approvedAt: z.string().datetime().nullable(), completedAt: z.string().datetime().nullable(),
  result: z.record(z.string(), z.unknown()).nullable(), artifact: z.string().nullable(), error: z.string().max(1000).nullable(),
}).strict();
const numeric = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;
const missing = (value, codes) => !value.trim() || codes.includes(value.trim());

export function validateAnalysis(spec, text) {
  spec = AnalysisSpec.parse(spec);
  const dataset = parseDelimited(text, spec.path.toLowerCase().endsWith(".tsv") ? "\t" : ",");
  for (const op of spec.operations) {
    const columns = op.type === "group-summary" ? [op.value, op.group] : op.type === "correlation" ? [op.x, op.y] : [];
    if (columns.some((name) => !dataset.headers.includes(name))) throw new Error("An analysis column does not exist. Inspect the actual dataset schema before proposing it.");
    if (op.type === "correlation" && op.x === op.y) throw new Error("Select two distinct columns for correlation.");
  }
  return { spec, dataset };
}
function number(value) {
  const raw = value.trim();
  if (!numeric.test(raw) || !Number.isFinite(Number(raw))) throw new Error("A selected numeric column contains text or non-finite values. Explicitly declare missing-value codes or correct the source; no rows were silently discarded.");
  return Number(raw);
}
function summary(values) {
  if (!values.length) return { count: 0, min: null, max: null, mean: null, sampleStdDev: null };
  const scale = Math.max(...values.map(Math.abs)) || 1;
  let mean = 0, m2 = 0, count = 0;
  for (const value of values) { count++; const normalized = value / scale, delta = normalized - mean; mean += delta / count; m2 += delta * (normalized - mean); }
  const result = { count, min: Math.min(...values), max: Math.max(...values), mean: mean * scale, sampleStdDev: count > 1 ? Math.sqrt(Math.max(0, m2) / (count - 1)) * scale : null };
  if (Object.values(result).some((value) => value !== null && !Number.isFinite(value))) throw new Error("The numeric range exceeds this engine's reliable summary range. No result was returned.");
  return result;
}
function grouped(dataset, op, codes) {
  const vi = dataset.headers.indexOf(op.value), gi = dataset.headers.indexOf(op.group), groups = new Map();
  let missingGroup = 0, missingValue = 0;
  for (const row of dataset.rows) {
    if (missing(row[gi], codes)) { missingGroup++; continue; }
    const key = row[gi];
    if (key.length > 120) throw new Error("Group labels exceed 120 characters. Choose a categorical column rather than identifiers or free text.");
    if (!groups.has(key)) { if (groups.size >= 40) throw new Error("The group column exceeds 40 categories. Choose a bounded categorical column; no groups were truncated."); groups.set(key, { rows: 0, values: [], missing: 0 }); }
    const group = groups.get(key); group.rows++;
    if (missing(row[vi], codes)) { group.missing++; missingValue++; } else group.values.push(number(row[vi]));
  }
  return { type: op.type, valueColumn: op.value, groupColumn: op.group, totalRows: dataset.rows.length, excluded: { missingGroup, missingValue }, groups: [...groups].map(([label, group]) => ({ label, rows: group.rows, missing: group.missing, ...summary(group.values) })) };
}
function correlated(dataset, op, codes) {
  const xi = dataset.headers.indexOf(op.x), yi = dataset.headers.indexOf(op.y), pairs = [];
  let excludedMissing = 0;
  for (const row of dataset.rows) {
    // Validate every observed numeric value, even if its partner is missing.
    const x = missing(row[xi], codes) ? null : number(row[xi]), y = missing(row[yi], codes) ? null : number(row[yi]);
    if (x === null || y === null) excludedMissing++; else pairs.push([x, y]);
  }
  const base = { type: op.type, x: op.x, y: op.y, method: "Pearson sample correlation; pairwise complete observations", totalRows: dataset.rows.length, count: pairs.length, excludedMissing };
  if (pairs.length < 3) return { ...base, correlation: null, status: "insufficient-data", notice: "At least three complete pairs are required by this descriptive engine." };
  const sx = Math.max(...pairs.map(([x]) => Math.abs(x))) || 1, sy = Math.max(...pairs.map(([, y]) => Math.abs(y))) || 1;
  let mx = 0, my = 0, xx = 0, yy = 0, xy = 0, n = 0;
  for (const [rawX, rawY] of pairs) { const x = rawX / sx, y = rawY / sy; n++; const dx = x - mx, dy = y - my; mx += dx / n; my += dy / n; xx += dx * (x - mx); yy += dy * (y - my); xy += dx * (y - my); }
  if (xx <= 0 || yy <= 0) return { ...base, correlation: null, status: "constant-column", notice: "Correlation is undefined for a constant selected column." };
  const correlation = xy / Math.sqrt(xx * yy);
  if (!Number.isFinite(correlation) || Math.abs(correlation) > 1 + 1e-10) throw new Error("Correlation could not be computed reliably. No coefficient was returned.");
  return { ...base, correlation: Math.max(-1, Math.min(1, correlation)), status: "computed", notice: "Descriptive association only. No causal effect, treatment effect, significance test or clinical conclusion is established." };
}
export async function executeAnalysis(spec, text, signal = new AbortController().signal) {
  signal.throwIfAborted();
  const checked = validateAnalysis(spec, text), dataset = checked.dataset, results = [];
  spec = checked.spec;
  for (const op of spec.operations) {
    await setImmediate(); signal.throwIfAborted();
    if (op.type === "group-summary") results.push(grouped(dataset, op, spec.missingValues));
    else if (op.type === "correlation") results.push(correlated(dataset, op, spec.missingValues));
    else {
      const profile = profileDelimited(text, spec.path.toLowerCase().endsWith(".tsv") ? "\t" : ",", spec.missingValues);
      // Receipts contain aggregate results, not individual source rows.
      delete profile.preview;
      results.push({ ...profile, type: "profile" });
    }
  }
  signal.throwIfAborted();
  return { engine: ANALYSIS_ENGINE, rows: dataset.rows.length, columns: dataset.headers, duplicateRows: dataset.rows.length - new Set(dataset.rows.map((row) => JSON.stringify(row))).size, missingValues: spec.missingValues, results,
    limitations: ["Blank cells and the explicitly declared, case-sensitive codes are treated as missing. Exclusions are counted.", "Duplicate rows are counted but never removed; they may represent legitimate repeated observations.", "Column labels are preserved. Units, sample independence, study design, batch effects and confounding are not inferred.", "This bounded descriptive engine does not execute arbitrary code, perform hypothesis tests, validate biomarkers or establish a cure."] };
}
