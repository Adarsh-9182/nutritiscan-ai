import { describe, expect, it } from "vitest";
import { buildSpecialists, buildSupervisor } from "./index";
import { demoProfile } from "../memory/profile";

// buildSpecialists/buildSupervisor construct ToolLoopAgent instances. The
// AI SDK stores the raw instructions string on `agent.settings.instructions`
// (confirmed against the installed `ai` package — not officially documented,
// but the only place the prompt actually lives), which lets these tests
// verify the real wired-up prompt content instead of only the memoryContext
// helper in isolation. A passing memoryContext test does not catch a
// specialist() call site that forgot to pass the right section list — this
// does.
//
// `settings` is typed `private` on ToolLoopAgent, but TypeScript's `private`
// is a compile-time check only — the field is a plain, readable JS property
// at runtime (verified directly against the installed package). The `unknown`
// cast below is reaching past that compile-time-only restriction on purpose,
// for test introspection, not routing around a real type error.
function instructionsOf(agent: unknown): string {
  const text = (agent as { settings: { instructions?: unknown } }).settings.instructions;
  if (typeof text !== "string") throw new Error("expected a string system prompt on the agent");
  return text;
}

const NUTRITION_CONTEXT_SAMPLE = "[NUTRITION MEMORY]\nNo meals logged.\n[END NUTRITION MEMORY]";

describe("agent context scoping — each specialist gets only the memory it needs", () => {
  const specialists = buildSpecialists(demoProfile, NUTRITION_CONTEXT_SAMPLE);

  it("Nutrition Agent: has allergies/medicines/biomarkers, not sleep/activity", () => {
    const text = instructionsOf(specialists.nutrition);
    expect(text).toContain("Allergies:");
    expect(text).toContain("Vitamin B12: 180 pg/mL");
    expect(text).not.toContain("Sleep:");
    expect(text).not.toContain("Exercise:");
    expect(text).toContain(NUTRITION_CONTEXT_SAMPLE); // meal log IS relevant here
  });

  it("Fitness Agent: has vitals/sleep/activity, not allergies/medicines/biomarkers", () => {
    const text = instructionsOf(specialists.fitness);
    expect(text).toContain("Height/Weight:");
    expect(text).toContain("Sleep:");
    expect(text).toContain("Exercise:");
    expect(text).not.toContain("Allergies:");
    expect(text).not.toContain("Medicines:");
    expect(text).not.toContain("Vitamin B12: 180 pg/mL");
  });

  it("Doctor Agent: gets everything — triage is the one place narrowing is the risk", () => {
    const text = instructionsOf(specialists.doctor);
    for (const marker of ["Sleep:", "Exercise:", "Allergies:", "Medicines:", "Conditions:", "Vitamin B12: 180 pg/mL", "Height/Weight:", "Primary goal:"]) {
      expect(text).toContain(marker);
    }
  });

  it("Lab Agent: has biomarkers/medicines/conditions, not vitals/sleep/activity/allergies/meals", () => {
    const text = instructionsOf(specialists.lab);
    expect(text).toContain("Vitamin B12: 180 pg/mL");
    expect(text).toContain("Medicines:");
    expect(text).toContain("Conditions:");
    expect(text).not.toContain("Height/Weight:");
    expect(text).not.toContain("Sleep:");
    expect(text).not.toContain("Exercise:");
    expect(text).not.toContain("Allergies:");
    expect(text).not.toContain(NUTRITION_CONTEXT_SAMPLE); // meal log isn't lab-relevant
  });

  it("Health Coach: has goal/sleep/activity, not allergies/medicines/biomarkers/meals", () => {
    const text = instructionsOf(specialists.coach);
    expect(text).toContain("Primary goal:");
    expect(text).toContain("Sleep:");
    expect(text).toContain("Exercise:");
    expect(text).not.toContain("Allergies:");
    expect(text).not.toContain("Vitamin B12: 180 pg/mL");
    expect(text).not.toContain(NUTRITION_CONTEXT_SAMPLE);
  });

  it("Supervisor: gets everything, so it can decide when a question crosses domains", () => {
    const text = instructionsOf(buildSupervisor(demoProfile, NUTRITION_CONTEXT_SAMPLE));
    for (const marker of ["Sleep:", "Exercise:", "Allergies:", "Medicines:", "Vitamin B12: 180 pg/mL", "Height/Weight:"]) {
      expect(text).toContain(marker);
    }
    expect(text).toContain(NUTRITION_CONTEXT_SAMPLE);
  });

  // Narrowing specialist context makes the Supervisor's routing the safety
  // net: if it under-routes a cross-domain question to a single specialist
  // that can't see the relevant fact, the answer is blind to it. This test
  // exists so nobody "simplifies" that guidance back to bare minimum-routing
  // instructions later, undoing the reason scoping is safe to do at all.
  it("Supervisor is explicitly told to consult a second specialist for cross-domain signals", () => {
    const text = instructionsOf(buildSupervisor(demoProfile, NUTRITION_CONTEXT_SAMPLE));
    expect(text).toMatch(/cross-domain/i);
    expect(text).toMatch(/only one positioned to notice/i);
  });
});
