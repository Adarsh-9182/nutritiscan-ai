import { describe, expect, it } from "vitest";
import { actionTools, targetsFor } from "./actions";
import { isSmallTalk, routeOf } from "./demo";
import { blankProfile, recordedSections } from "../memory/profile";
import { nutritionContext } from "../memory/nutrition-context";
import { profileAfter } from "../memory/apply-actions";

const run = async (t: { execute?: unknown }, input: unknown) =>
  (t.execute as (i: unknown, o: unknown) => Promise<unknown>)(input, { toolCallId: "t", messages: [] });

describe("routing", () => {
  it("reads Hinglish symptoms as the doctor's", () => {
    expect(routeOf("mujhe 3 din se bukhar hai aur sar dard")).toBe("doctor");
  });
  it("sends values with units to the lab agent even when they are vitamins", () => {
    expect(routeOf("My vitamin D is 12 ng/mL and B12 is 180 pg/mL")).toBe("lab");
  });
  it("keeps plain food questions with nutrition", () => {
    expect(routeOf("I had 2 roti and dal for lunch")).toBe("nutrition");
  });
  it("recognises small talk and nothing else", () => {
    expect(isSmallTalk("hi")).toBe(true);
    expect(isSmallTalk("namaste")).toBe(true);
    expect(isSmallTalk("hi, I have a fever")).toBe(false);
  });
});

describe("no default numbers presented as the person's", () => {
  it("states no protein target without a recorded weight", () => {
    const ctx = nutritionContext(blankProfile, []);
    expect(ctx).toContain("UNKNOWN");
    expect(ctx).not.toMatch(/\d+ g\./);
  });
  it("withholds vitals until something is recorded, then shows only what was", () => {
    expect(recordedSections(blankProfile)).not.toContain("vitals");
    const p = { ...blankProfile, weightKg: 68, recorded: ["weightKg" as const] };
    expect(recordedSections(p)).toContain("vitals");
    expect(targetsFor(p).targets.proteinGramsPerDay).toBeGreaterThan(0);
    expect(targetsFor(p).targets.bmi).toBeUndefined();
    expect(targetsFor(p).missingForMore).toContain("height");
  });
});

describe("action tools", () => {
  it("logs a meal with database numbers, not model ones", async () => {
    const out = (await run(actionTools(blankProfile).logMeal, { description: "2 roti, 1 katori dal, 100 g paneer" })) as {
      kind: string;
      meal: { protein: number; kcal: number };
    };
    expect(out.kind).toBe("meal");
    expect(out.meal.protein).toBeGreaterThan(15);
    expect(out.meal.kcal).toBeGreaterThan(200);
  });
  it("refuses to log food the database does not know", async () => {
    const out = (await run(actionTools(blankProfile).logMeal, { description: "zorblax stew" })) as { kind: string };
    expect(out.kind).toBe("none");
  });
  it("computes targets from what was saved earlier in the same turn", async () => {
    const tools = actionTools(blankProfile);
    await run(tools.updateProfile, { weightKg: 80, heightCm: 180, goal: "Lose fat", age: 30, sex: "male" });
    const t = (await run(tools.calculateTargets, {})) as ReturnType<typeof targetsFor>;
    expect(t.targets.proteinGramsPerDay).toBe(128);
    expect(t.targets.bmi).toBe(24.7);
    expect(t.targets.goalKcal).toBeLessThan(t.targets.maintenanceKcal as number);
  });
  it("applies a profile patch on the client as recorded fields", async () => {
    const out = (await run(actionTools(blankProfile).updateProfile, { weightKg: 68, addAllergies: ["peanut"] })) as Parameters<typeof profileAfter>[1];
    const next = profileAfter(blankProfile, out);
    expect(next.weightKg).toBe(68);
    expect(next.recorded).toContain("weightKg");
    expect(next.allergies).toEqual(["peanut"]);
  });
});
