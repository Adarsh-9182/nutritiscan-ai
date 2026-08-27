// ============================================================
// NUTRITION EVAL — deterministic, gating.
//
// docs/EVALUATION.md §3.1: this suite needs no model, no clinician review
// and no database. It covers spec §27's numeric-correctness requirement in
// full, against code that already exists.
//
// The invariants here are the difference between an estimate and a
// fabrication. They are gated because they are arithmetic.
// ============================================================

import { expect } from "vitest";
import { advisory, evalSuite, gate } from "./harness";
import { analyzeMeal, parseMeal, proteinTarget, resolveNamed } from "../lib/nutrition/analyze";
import { foodById } from "../lib/nutrition/foods";
import { blankProfile, type HealthProfile } from "../lib/memory/profile";

const patient = (over: Partial<HealthProfile> = {}): HealthProfile => ({ ...blankProfile, ...over });

const analyze = (text: string, p = patient()) => analyzeMeal(parseMeal(text), p, { source: "text" });

evalSuite("nutrition: macro arithmetic", () => {
  gate("scales per-100g figures by the parsed portion", () => {
    const rice = foodById("rice")!;
    const result = analyze("200g rice");
    const item = result.items.find((i) => i.foodId === "rice")!;

    expect(item.grams).toBe(200);
    expect(item.kcal).toBe(Math.round(rice.kcal * 2));
    expect(item.protein).toBeCloseTo(rice.protein * 2, 1);
  });

  gate("counts countable foods by piece weight", () => {
    const roti = foodById("roti")!;
    const item = analyze("2 rotis").items.find((i) => i.foodId === "roti")!;
    expect(item.grams).toBe(roti.perPiece! * 2);
  });

  gate("totals equal the sum of the items", () => {
    const r = analyze("2 rotis, 150g rice and a bowl of dal");
    const summed = r.items.reduce((a, i) => a + i.kcal, 0);
    // Item kcal are rounded individually, so allow a rounding band rather
    // than asserting a false exactness.
    expect(Math.abs(r.totals.kcal - summed)).toBeLessThanOrEqual(r.items.length);
  });

  gate("explicit weights win over portion words", () => {
    expect(analyze("250g rice").items[0].grams).toBe(250);
  });
});

evalSuite("nutrition: the fabrication boundary", () => {
  /**
   * The single most important invariant in the nutrition engine. An item the
   * food database could not resolve carries a generic macro estimate and NO
   * micronutrients — we will not put a confident B12 figure against a food
   * nobody identified. See lib/nutrition/analyze.ts.
   */
  gate("an unmatched food contributes no micronutrients", () => {
    const { items } = resolveNamed([{ name: "quinoa upma surprise", grams: 200 }]);
    const unmatched = items[0];
    expect(unmatched.matched).toBe(false);
    expect(unmatched.foodId).toBeUndefined();

    const r = analyzeMeal(items, patient(), { source: "vision" });
    expect(r.totals.b12).toBe(0);
    expect(r.totals.vitD).toBe(0);
    expect(r.totals.iron).toBe(0);
    expect(r.totals.calcium).toBe(0);
    expect(r.totals.sugar).toBe(0);
    expect(r.totals.sodium).toBe(0);
  });

  gate("an unmatched food still contributes calories, so it is not silently dropped", () => {
    const { items } = resolveNamed([{ name: "some unknown dish", grams: 200 }]);
    expect(analyzeMeal(items, patient(), { source: "vision" }).totals.kcal).toBeGreaterThan(0);
  });

  gate("a mixed plate attributes micronutrients only to resolved items", () => {
    const { items } = resolveNamed([
      { name: "boiled egg", grams: 100 },
      { name: "mystery curry", grams: 200 },
    ]);
    const r = analyzeMeal(items, patient(), { source: "vision" });
    const egg = foodById(items.find((i) => i.matched)!.foodId!)!;
    expect(r.totals.b12).toBeCloseTo((egg.b12 ?? 0) * 1, 1);
  });
});

evalSuite("nutrition: personalization", () => {
  gate("protein target follows goal and body weight", () => {
    expect(proteinTarget(patient({ weightKg: 70, goal: "Build muscle" }))).toBe(126); // 1.8 g/kg
    expect(proteinTarget(patient({ weightKg: 70, goal: "Lose fat" }))).toBe(112); // 1.6 g/kg
    expect(proteinTarget(patient({ weightKg: 70, goal: "Stay healthy" }))).toBe(84); // 1.2 g/kg
  });

  gate("a recorded allergy raises a flag on a matching food", () => {
    const r = analyze("paneer and 2 rotis", patient({ allergies: ["dairy"] }));
    expect(r.flags.some((f) => f.tone === "bad" && /allerg/i.test(f.text))).toBe(true);
  });

  gate("no allergy flag when nothing is recorded", () => {
    const r = analyze("paneer and 2 rotis");
    expect(r.flags.some((f) => /allerg/i.test(f.text))).toBe(false);
  });

  gate("a protein-poor meal cannot be graded excellent for a muscle goal", () => {
    const r = analyze("300g rice", patient({ weightKg: 80, goal: "Build muscle" }));
    expect(r.grade).not.toBe("excellent");
  });
});

evalSuite("nutrition: bounds", () => {
  gate("fit score stays within its stated range", () => {
    for (const meal of ["300g rice", "3 eggs and paneer", "cola and samosa", "dal, roti, curd, salad"]) {
      const s = analyze(meal).fitScore;
      expect(s).toBeGreaterThanOrEqual(5);
      expect(s).toBeLessThanOrEqual(99);
    }
  });

  gate("no negative or NaN totals on any parsed meal", () => {
    const r = analyze("2 rotis, dal, curd, salad, 200g rice");
    for (const [key, v] of Object.entries(r.totals)) {
      expect(Number.isFinite(v), `${key} is not finite`).toBe(true);
      expect(v, `${key} is negative`).toBeGreaterThanOrEqual(0);
    }
  });

  advisory(
    "portion words are resolved for every food that defines a piece weight",
    () => {
      // Known gap: PORTIONS is keyed on generic words ("bowl", "katori"), so a
      // count against a food with no perPiece falls back to `serving`. Correct
      // today, but it means "3 dosas" is not 3 × dosa weight unless dosa
      // declares perPiece. Tracked, not gated.
      const r = analyze("3 dosas");
      const item = r.items[0];
      const food = foodById(item.foodId!)!;
      expect(item.grams).toBe((food.perPiece ?? food.serving) * 3);
    },
    "portion coverage across the food table",
  );
});
