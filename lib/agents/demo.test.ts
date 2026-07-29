import { describe, expect, it } from "vitest";
import { demoAnswer, routeOf } from "./demo";
import { blankProfile, demoProfile } from "../memory/profile";
import { proteinTarget } from "../nutrition/analyze";

// With no Gateway credential the demo brain IS the product's voice in
// production. Every claim it makes has to come from the profile in front of
// it — it used to state a low B12, a healthy BMI and solid sleep to everyone.

describe("demo brain — claims are earned, not fixed", () => {
  it("refuses to interpret labs it does not have", () => {
    const answer = demoAnswer("explain my blood report", blankProfile);
    expect(answer).not.toMatch(/B12 is on the low side/i);
    expect(answer).toMatch(/don't have any lab values/i);
  });

  it("reads the panel that is actually recorded", () => {
    const answer = demoAnswer("explain my blood report", demoProfile);
    expect(answer).toContain("Vitamin B12");
    expect(answer).toContain("180 pg/mL");
  });

  it("does not call an out-of-range BMI healthy", () => {
    const heavy = { ...demoProfile, weightKg: 120, heightCm: 170 };
    const answer = demoAnswer("what workout should I do?", heavy);
    expect(answer).not.toMatch(/within the 18\.5–24\.9 healthy range/);
    expect(answer).toMatch(/above the healthy range/i);
  });

  it("does not call zero training days a strong base", () => {
    const answer = demoAnswer("what workout should I do?", { ...demoProfile, exerciseDaysPerWeek: 0 });
    expect(answer).not.toMatch(/strong, consistent base/);
    expect(answer).toMatch(/haven't recorded any training days/i);
  });

  it("does not call five hours of sleep solid", () => {
    const answer = demoAnswer("how is my sleep?", { ...demoProfile, sleepHours: 5 });
    expect(answer).toMatch(/below the 7–9h/i);
  });

  it("fills the trends section instead of leaving it blank", () => {
    const answer = demoAnswer("how are my habits?", { ...blankProfile, trends: [] });
    expect(answer).toMatch(/don't have enough history/i);
  });

  it("quotes the same protein target as the rest of the app", () => {
    for (const goal of ["Build muscle", "Lose fat", "Stay healthy"]) {
      const p = { ...demoProfile, goal };
      expect(demoAnswer("am I eating enough protein?", p)).toContain(`${proteinTarget(p)} g/day`);
    }
  });

  it("attaches no invented confidence figure to a symptom it knows nothing about", () => {
    const answer = demoAnswer("I have a headache", demoProfile);
    expect(answer).not.toMatch(/Confidence: ~\d+%/);
    expect(answer).toMatch(/can't tell you what you have/i);
  });

  it("still short-circuits to emergency advice", () => {
    expect(demoAnswer("I have chest pain", demoProfile)).toMatch(/emergency/i);
  });
});

// Medical Reasoning Format (lib/agents/safety.ts): Facts / Inference /
// Recommendation / Medical Warning / Confidence must stay visually distinct
// labels, and Inference/Confidence must never appear when there are no
// Facts to reason from — that's the "ask, don't guess" contract.
describe("demo brain — Medical Reasoning Format contract", () => {
  it("doctor route with no facts: has Medical Warning but withholds Inference and Confidence", () => {
    const answer = demoAnswer("I have a headache", demoProfile);
    expect(answer).toContain("**Facts**");
    expect(answer).toContain("**Medical Warning");
    expect(answer).not.toContain("**Inference**");
    expect(answer).not.toContain("**Confidence**");
  });

  it("lab route with recorded biomarkers: carries all five labels", () => {
    const answer = demoAnswer("explain my blood report", demoProfile);
    for (const label of ["**Facts**", "**Inference**", "**Recommendation**", "**Medical Warning**", "**Confidence**"]) {
      expect(answer).toContain(label);
    }
  });

  it("lab route Facts section states the value, Inference never invents a marker-specific clinical claim", () => {
    const answer = demoAnswer("explain my blood report", demoProfile);
    expect(answer).toMatch(/\*\*Facts\*\*[\s\S]*Vitamin B12: 180 pg\/mL/);
    // The Inference section may say a flagged value is "worth a closer look" —
    // it must not assert what a specific marker being low *means* physiologically;
    // that would be inventing a medical fact the demo brain has no basis for.
    const inferenceSection = answer.split("**Inference**")[1]?.split("**Recommendation**")[0] ?? "";
    expect(inferenceSection).not.toMatch(/energy and nerve health|deficiency causes|indicates/i);
  });

  it("lab confidence never claims 'likely' from marker count alone — profile.biomarkers is a snapshot, not a trend", () => {
    // mergeBiomarkers (lib/memory/labs.ts) replaces by name, so profile.biomarkers
    // can never hold two readings of the same marker — only trend data in the
    // journal could justify raising confidence. A user with several DIFFERENT
    // one-off markers must not be told that's the same thing as a trend.
    const manyDistinctMarkers = demoAnswer("explain my blood report", demoProfile);
    expect(manyDistinctMarkers).toMatch(/possible, ~30%/);
    expect(manyDistinctMarkers).not.toMatch(/likely,/);

    const oneMarker = demoAnswer("explain my blood report", { ...demoProfile, biomarkers: [demoProfile.biomarkers[0]] });
    expect(oneMarker).toMatch(/possible, ~30%/);
  });
});

describe("routeOf", () => {
  it("routes to the specialist the wording implies", () => {
    expect(routeOf("I have a fever")).toBe("doctor");
    expect(routeOf("am I eating enough protein")).toBe("nutrition");
    expect(routeOf("best workout split")).toBe("fitness");
    expect(routeOf("explain my TSH")).toBe("lab");
    expect(routeOf("help me build a sleep routine")).toBe("coach");
    expect(routeOf("hello")).toBe("supervisor");
  });
});
