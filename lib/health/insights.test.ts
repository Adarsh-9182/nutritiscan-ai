import { describe, expect, it } from "vitest";
import { buildInsights } from "./insights";
import { demoProfile, type HealthProfile } from "../memory/profile";
import type { LoggedMeal } from "../memory/meals";

const meal = (over: Partial<LoggedMeal> = {}): LoggedMeal => ({
  id: "m1",
  at: new Date().toISOString(),
  title: "Dal and rice",
  items: [],
  kcal: 400,
  protein: 20,
  carbs: 60,
  fat: 8,
  fiber: 9,
  fitScore: 75,
  source: "text",
  ...over,
});

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
const find = (p: HealthProfile, meals: LoggedMeal[], id: string) => buildInsights(p, meals).find((i) => i.id === id)!;

describe("confidence is earned, not asserted", () => {
  it("reports unknown with zero confidence when there is no data", () => {
    const i = find(demoProfile, [], "protein");
    expect(i.certainty).toBe("unknown");
    expect(i.confidence).toBe(0);
    expect(i.claim).toMatch(/can't say anything/i);
  });

  it("never claims certainty from a single day", () => {
    const i = find(demoProfile, [meal()], "protein");
    expect(i.certainty).toBe("possible");
    expect(i.confidence).toBeLessThan(50);
  });

  it("grows confidence as more days are logged", () => {
    const few = find(demoProfile, [meal({ id: "a", at: daysAgo(0) }), meal({ id: "b", at: daysAgo(1) })], "protein");
    const many = find(
      demoProfile,
      Array.from({ length: 10 }, (_, n) => meal({ id: `m${n}`, at: daysAgo(n) })),
      "protein",
    );
    expect(many.confidence).toBeGreaterThan(few.confidence);
  });

  it("never awards more than 88% to an inferred claim", () => {
    const meals = Array.from({ length: 14 }, (_, n) => meal({ id: `m${n}`, at: daysAgo(n) }));
    for (const i of buildInsights(demoProfile, meals)) expect(i.confidence).toBeLessThanOrEqual(88);
  });

  it("never returns a claim without evidence behind it", () => {
    const meals = Array.from({ length: 5 }, (_, n) => meal({ id: `m${n}`, at: daysAgo(n) }));
    for (const i of buildInsights(demoProfile, meals)) {
      expect(i.evidence.length).toBeGreaterThan(0);
      expect(i.limitations.length).toBeGreaterThan(0);
    }
  });
});

describe("protein maths", () => {
  it("averages over days with data, not the calendar window", () => {
    // Three meals in one day = 90 g that day, not 90/14.
    const meals = [meal({ id: "a", protein: 30 }), meal({ id: "b", protein: 30 }), meal({ id: "c", protein: 30 })];
    expect(find(demoProfile, meals, "protein").claim).toContain("90 g");
  });

  it("recognises when the target is met", () => {
    const meals = [meal({ id: "a", protein: 130 })];
    expect(find(demoProfile, meals, "protein").claim).toMatch(/clearing your/i);
  });

  it("excludes meals outside the 14-day window", () => {
    const i = find(demoProfile, [meal({ id: "old", at: daysAgo(40), protein: 200 })], "protein");
    expect(i.certainty).toBe("unknown");
  });
});

describe("clinical safety", () => {
  it("surfaces clinician-worthy insights above more confident ones", () => {
    const meals = Array.from({ length: 10 }, (_, n) => meal({ id: `m${n}`, at: daysAgo(n) }));
    const list = buildInsights(demoProfile, meals);
    const firstClinician = list.findIndex((i) => i.seeClinician);
    const firstPlain = list.findIndex((i) => !i.seeClinician);
    if (firstClinician !== -1 && firstPlain !== -1) expect(firstClinician).toBeLessThan(firstPlain);
  });

  it("flags a low B12 for clinical follow-up rather than treating it as diet-only", () => {
    const i = find(demoProfile, [meal()], "b12");
    expect(i.seeClinician).toBe(true);
    expect(i.limitations.join(" ")).toMatch(/causes beyond diet/i);
  });

  it("says nothing about B12 when no marker is recorded", () => {
    const clean: HealthProfile = { ...demoProfile, biomarkers: [] };
    expect(buildInsights(clean, [meal()]).find((i) => i.id === "b12")).toBeUndefined();
  });
});

describe("biomarker trends", () => {
  it("computes direction from dated journal metrics", () => {
    // Demo journal has B12 152 -> 180: improving, but still under range.
    const i = buildInsights(demoProfile, []).find((x) => x.id === "trend-vitamin-b12")!;
    expect(i.claim).toMatch(/right direction/i);
    expect(i.evidence.length).toBeGreaterThanOrEqual(2);
  });

  it("produces no trend from a single reading", () => {
    const p: HealthProfile = { ...demoProfile, journal: (demoProfile.journal ?? []).slice(0, 2) };
    expect(buildInsights(p, []).find((x) => x.id === "trend-vitamin-d")).toBeUndefined();
  });
});
