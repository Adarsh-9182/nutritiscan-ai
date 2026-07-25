import { describe, expect, it } from "vitest";
import { analyzeMeal, parseMeal, proteinTarget, resolveNamed, goalPhrase } from "./analyze";
import { demoProfile, type HealthProfile } from "../memory/profile";

const profile = (over: Partial<HealthProfile> = {}): HealthProfile => ({ ...demoProfile, ...over });

describe("parseMeal", () => {
  it("reads counts of countable foods", () => {
    const items = parseMeal("2 rotis");
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe("Roti");
    expect(items[0].grams).toBe(80); // perPiece 40 × 2
  });

  it("reads explicit weights", () => {
    expect(parseMeal("200g chicken")[0].grams).toBe(200);
  });

  it("reads named portions", () => {
    expect(parseMeal("a katori of dal")[0].grams).toBe(120);
  });

  it("splits a multi-item meal on separators", () => {
    const names = parseMeal("2 rotis, dal and a bowl of curd").map((i) => i.name);
    expect(names).toContain("Roti");
    expect(names).toContain("Dal");
    expect(names).toContain("Curd / yogurt");
  });

  it("prefers the longest alias so a qualifier is not lost", () => {
    expect(parseMeal("brown rice")[0].name).toBe("Brown rice");
  });

  it("returns nothing for a meal made only of unknown words", () => {
    expect(parseMeal("qwerty zxcvb")).toHaveLength(0);
  });

  it("records the resolved food id on every matched item", () => {
    for (const item of parseMeal("2 rotis, dal, curd")) {
      expect(item.foodId).toBeTruthy();
      expect(item.matched).toBe(true);
    }
  });
});

describe("resolveNamed", () => {
  it("marks a food the database does not know as unverified and id-less", () => {
    const { items } = resolveNamed([{ name: "zorblax stew", grams: 200 }]);
    expect(items[0].matched).toBe(false);
    expect(items[0].foodId).toBeUndefined();
    expect(items[0].kcal).toBeGreaterThan(0); // still estimated, not dropped
  });

  it("scales the generic estimate by the stated portion", () => {
    const small = resolveNamed([{ name: "zorblax stew", grams: 100 }]).items[0];
    const large = resolveNamed([{ name: "zorblax stew", grams: 300 }]).items[0];
    expect(large.kcal).toBeCloseTo(small.kcal * 3, 0);
  });
});

describe("totals", () => {
  // This is the regression that motivated recording foodId: an unmatched
  // item used to fuzzy re-match during the totals pass and contribute
  // confident micronutrients for a food nobody had actually identified.
  it("never attributes micronutrients to an unmatched food", () => {
    const { items } = resolveNamed([{ name: "zorblax casserole", grams: 300 }]);
    expect(items[0].matched).toBe(false);

    const result = analyzeMeal(items, profile(), { source: "vision" });
    expect(result.totals.b12).toBe(0);
    expect(result.totals.iron).toBe(0);
    expect(result.totals.sodium).toBe(0);
  });

  it("does attribute micronutrients to a matched food", () => {
    const result = analyzeMeal(parseMeal("3 eggs"), profile(), { source: "text" });
    expect(result.totals.b12).toBeGreaterThan(0);
  });

  it("sums macros across the plate", () => {
    const result = analyzeMeal(parseMeal("2 rotis, dal, curd"), profile(), { source: "text" });
    expect(result.totals.kcal).toBeGreaterThan(0);
    expect(result.totals.protein).toBeGreaterThan(0);
  });
});

describe("personalisation", () => {
  it("scales the protein target with goal and body weight", () => {
    expect(proteinTarget(profile({ goal: "Build muscle", weightKg: 100 }))).toBe(180);
    expect(proteinTarget(profile({ goal: "Lose weight", weightKg: 100 }))).toBe(160);
    expect(proteinTarget(profile({ goal: "Stay healthy", weightKg: 100 }))).toBe(120);
  });

  it("flags a food the user has recorded an allergy to", () => {
    const result = analyzeMeal(parseMeal("paneer"), profile({ allergies: ["dairy"] }), { source: "text" });
    const allergy = result.flags.find((f) => /allergy/i.test(f.text));
    expect(allergy).toBeDefined();
    expect(allergy?.tone).toBe("bad");
  });

  it("does not flag an allergy the user has not recorded", () => {
    const result = analyzeMeal(parseMeal("paneer"), profile({ allergies: [] }), { source: "text" });
    expect(result.flags.some((f) => /allergy/i.test(f.text))).toBe(false);
  });

  it("will not call a meal excellent while it badly misses the protein target", () => {
    // High fibre and micronutrients must not paper over the user's actual goal.
    const result = analyzeMeal(parseMeal("a bowl of salad"), profile({ goal: "Build muscle", weightKg: 90 }), { source: "text" });
    expect(result.grade).not.toBe("excellent");
  });

  it("turns an imperative goal into a gerund for use inside a sentence", () => {
    expect(goalPhrase(profile({ goal: "Build muscle" }))).toBe("building muscle");
    expect(goalPhrase(profile({ goal: "Lose weight" }))).toBe("losing weight");
  });
});

describe("scoring bounds", () => {
  it("keeps the fit score inside 5–99 for both extremes", () => {
    const junk = analyzeMeal(parseMeal("maggi, coke, samosa"), profile(), { source: "text" });
    const good = analyzeMeal(parseMeal("200g chicken, dal, a bowl of salad"), profile(), { source: "text" });
    for (const r of [junk, good]) {
      expect(r.fitScore).toBeGreaterThanOrEqual(5);
      expect(r.fitScore).toBeLessThanOrEqual(99);
    }
    expect(good.fitScore).toBeGreaterThan(junk.fitScore);
  });

  it("survives an empty plate without throwing or emitting NaN", () => {
    const result = analyzeMeal([], profile(), { source: "text" });
    expect(Number.isFinite(result.fitScore)).toBe(true);
    expect(Number.isFinite(result.totals.kcal)).toBe(true);
    expect(result.headline).toBeTruthy();
  });
});
