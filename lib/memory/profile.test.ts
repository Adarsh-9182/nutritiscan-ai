import { describe, expect, it } from "vitest";
import { blankProfile, demoProfile, healthScore, insight, isDemoMemory, memoryContext } from "./profile";

// The failure this file exists to prevent: a real person being shown, and told
// about, health data that belongs to the shipped demo profile.
describe("blankProfile", () => {
  it("records no labs, trends or journal", () => {
    expect(blankProfile.biomarkers).toEqual([]);
    expect(blankProfile.trends).toEqual([]);
    expect(blankProfile.journal).toEqual([]);
  });

  it("leaves age and sex unrecorded rather than guessing", () => {
    expect(blankProfile.age).toBeUndefined();
    expect(blankProfile.sex).toBeUndefined();
  });

  it("is not mistaken for the demo memory", () => {
    expect(isDemoMemory(blankProfile)).toBe(false);
    expect(isDemoMemory(demoProfile)).toBe(true);
  });
});

describe("memoryContext", () => {
  it("tells the agent when age and sex are unknown", () => {
    const ctx = memoryContext(blankProfile);
    expect(ctx).toMatch(/Age: not recorded/);
    expect(ctx).toMatch(/Sex: not recorded/);
    expect(ctx).toMatch(/Resting HR: not recorded/);
  });

  it("reports an empty panel as empty", () => {
    expect(memoryContext(blankProfile)).toContain("none recorded");
  });

  it("passes recorded values through", () => {
    const ctx = memoryContext(demoProfile);
    expect(ctx).toContain("Vitamin B12: 180 pg/mL");
    expect(ctx).toContain("Age: 24");
  });
});

describe("healthScore", () => {
  it("shows the working behind the number", () => {
    const { score, factors } = healthScore(demoProfile);
    expect(score).toBeGreaterThan(0);
    expect(factors.length).toBeGreaterThan(1);
    // The factors must actually explain the score, not decorate it.
    const summed = factors.reduce((a, f) => a + f.delta, 0);
    expect(score).toBe(Math.max(35, Math.min(98, summed)));
  });

  it("does not penalise a profile for labs it has never recorded", () => {
    const { factors } = healthScore(blankProfile);
    expect(factors.some((f) => f.delta < 0)).toBe(false);
  });

  it("stays inside its stated 35–98 bounds", () => {
    const wrecked = { ...demoProfile, sleepHours: 3, exerciseDaysPerWeek: 0, biomarkers: Array.from({ length: 12 }, (_, i) => ({ name: `M${i}`, value: "1", status: "low" as const })) };
    expect(healthScore(wrecked).score).toBe(35);
  });
});

describe("insight", () => {
  it("says it doesn't know rather than reassuring an empty profile", () => {
    const text = insight(blankProfile);
    expect(text).toMatch(/don't know enough/i);
    expect(text).not.toMatch(/steady|look good|keep the streak/i);
  });

  it("cites a recorded low marker when there is one", () => {
    expect(insight(demoProfile).toLowerCase()).toContain("vitamin b12");
  });
});
