// ============================================================
// EVAL HARNESS
//
// docs/EVALUATION.md. Built on vitest so it needs no new dependency and
// gets reporting, filtering and CI integration for free — but it is NOT
// the unit test suite and must not be confused with it. `npm test` covers
// lib/**/*.test.ts; `npm run eval` covers evals/**/*.eval.ts.
//
// The distinction that matters is `gate` vs `advisory`:
//
//   gate(...)      A failure fails the build. Reserved for assertions that
//                  are either deterministic (arithmetic, sanitization) or
//                  clinician-reviewed. docs/EVALUATION.md §2.2.
//
//   advisory(...)  Runs, reports, never fails the build. For expectations
//                  that encode a KNOWN GAP not yet implemented, or clinical
//                  cases no clinician has signed off. An advisory failure
//                  is information, not a defect.
//
// Advisories exist so that a known gap is executable rather than a
// paragraph in a document that drifts out of date. When Phase 6 lands,
// the labs advisories start passing and get promoted to gates — the diff
// that promotes them is the proof the gap closed.
// ============================================================

import { afterAll, describe, expect, it } from "vitest";

type AdvisoryResult = { suite: string; name: string; ok: boolean; error?: string };

const results: AdvisoryResult[] = [];
let currentSuite = "(unknown)";

/** Skip advisory bodies entirely when only the gating subset is wanted. */
const GATE_ONLY = process.env.EVAL_GATE_ONLY === "1";

export function evalSuite(name: string, fn: () => void) {
  describe(name, () => {
    const previous = currentSuite;
    currentSuite = name;
    fn();
    currentSuite = previous;
  });
}

/** A gating assertion. Failure fails the build. */
export function gate(name: string, fn: () => void | Promise<void>) {
  it(`[gate] ${name}`, fn);
}

/**
 * A non-gating assertion.
 *
 * The body runs and its outcome is recorded, but the test always passes.
 * Deliberately not `it.skip` or `it.fails`: skipping loses the signal, and
 * `it.fails` inverts it — an advisory that starts passing (the gap closed)
 * would then fail the build, which is precisely backwards.
 */
export function advisory(name: string, fn: () => void | Promise<void>, why?: string) {
  const label = `[advisory] ${name}${why ? ` — ${why}` : ""}`;
  if (GATE_ONLY) {
    it.skip(label, () => {});
    return;
  }
  const suite = currentSuite;
  it(label, async () => {
    try {
      await fn();
      results.push({ suite, name, ok: true });
    } catch (err) {
      results.push({ suite, name, ok: false, error: err instanceof Error ? err.message.split("\n")[0] : String(err) });
    }
  });
}

/**
 * Assert a rule fired. Kept as a helper so every clinical suite reports the
 * same way: rule IDs, never prose (docs/EVALUATION.md §2.1).
 */
export function expectRule(firedRules: string[], ruleId: string) {
  expect(firedRules, `expected rule ${ruleId} to fire; got [${firedRules.join(", ")}]`).toContain(ruleId);
}

afterAll(() => {
  if (!results.length) return;

  const failed = results.filter((r) => !r.ok);
  const passed = results.length - failed.length;

  const lines = [
    "",
    "─".repeat(62),
    `ADVISORY RESULTS  ${passed}/${results.length} passing (non-gating)`,
    "─".repeat(62),
  ];

  for (const r of failed) {
    lines.push(`  ✗ ${r.suite} › ${r.name}`);
    if (r.error) lines.push(`      ${r.error}`);
  }

  const closed = results.filter((r) => r.ok);
  if (closed.length) {
    lines.push("", "  Advisories now PASSING — promote these to gate():");
    for (const r of closed) lines.push(`  ✓ ${r.suite} › ${r.name}`);
  }

  lines.push("─".repeat(62), "");
  console.log(lines.join("\n"));
});
