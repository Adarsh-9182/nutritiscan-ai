import { describe, expect, it } from "vitest";
import { demoProfile, memoryContext } from "./profile";

// Unit-level coverage of memoryContext's section scoping (the pure-function
// half of context engineering). lib/agents/index.test.ts covers the other
// half — that each specialist is actually wired to the right section list.
describe("memoryContext — section scoping", () => {
  it("renders only the requested sections, in the order given", () => {
    const ctx = memoryContext(demoProfile, ["identity", "biomarkers"]);
    expect(ctx).toContain("Name: " + demoProfile.name);
    expect(ctx).toContain("Vitamin B12: 180 pg/mL");
    // Excluded sections must not leak in — this is the whole point of scoping.
    expect(ctx).not.toContain("Sleep:");
    expect(ctx).not.toContain("Exercise:");
    expect(ctx).not.toContain("Allergies:");
    expect(ctx).not.toContain("Primary goal:");
  });

  it("still wraps a single-section render in the same block markers", () => {
    const ctx = memoryContext(demoProfile, ["goal"]);
    expect(ctx.match(/\[USER HEALTH MEMORY/g)).toHaveLength(1);
    expect(ctx.match(/\[END MEMORY\]/g)).toHaveLength(1);
    expect(ctx).toContain("Primary goal:");
  });

  it("defaults to every section when none are specified, matching pre-scoping behavior", () => {
    const ctx = memoryContext(demoProfile);
    for (const marker of ["Name:", "Age:", "Sex:", "Height/Weight:", "Primary goal:", "Sleep:", "Exercise:", "Allergies:", "Medicines:", "Conditions:", "Recent lab biomarkers:"]) {
      expect(ctx).toContain(marker);
    }
  });
});
