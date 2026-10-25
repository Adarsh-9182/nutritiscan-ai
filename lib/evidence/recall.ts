import type { Pico } from "@/lib/agent-runtime/query";

/** Share of the gold PMIDs found in the first k retrieved. 1 when there is nothing to find. */
export function recallAt(gold: readonly string[], retrieved: readonly string[], k: number): number {
  if (!gold.length) return 1;
  const found = new Set(retrieved.slice(0, k));
  return gold.filter((pmid) => found.has(pmid)).length / gold.length;
}

export type RecallRow = { recall10: number; recall50: number; retrieved: number };

export function summarizeRecall(rows: readonly RecallRow[]): { recall10: number; recall50: number; hitRate: number; retrieved: number } {
  const mean = (pick: (row: RecallRow) => number) => (rows.length ? rows.reduce((total, row) => total + pick(row), 0) / rows.length : 0);
  return { recall10: mean((row) => row.recall10), recall50: mean((row) => row.recall50), hitRate: mean((row) => (row.recall50 > 0 ? 1 : 0)), retrieved: mean((row) => row.retrieved) };
}

/**
 * Cochrane titles read "Intervention [versus Comparator] for|in Condition", so
 * the title itself gives the concepts a good extraction would. This stands in
 * for the model when the evaluation runs without a key, and shows what the
 * query ladder can do once the concepts are right.
 */
export function picoFromTitle(title: string): Pico | null {
  const clean = title.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").replace(/[.:].*$/, "").trim();
  const match = clean.match(/^(.+?)\s+(?:for|in)\s+(.+)$/i);
  if (!match) return null;
  const [left, condition] = [match[1], match[2]];
  const [intervention, comparison] = left.split(/\s+(?:versus|vs\.?)\s+/i);
  const term = (value?: string) => (value ? [value.trim().slice(0, 60)].filter((entry) => entry.length >= 2) : []);
  return { population: term(condition), intervention: term(intervention), comparison: term(comparison), outcome: [], designs: [] };
}
