// ============================================================
// THE PERSON THE PRODUCT IS BUILT AROUND
//
// Dev Raman, 34 — gluten-sensitive, low-normal ferritin, LDL
// trending up. Everything the demo says about him is derived
// from the values here or from lib/v2/labs.ts. Nothing is
// hard-coded prose in a component.
//
// WHY THAT MATTERS: the fastest way to build a health product
// that lies is to write "Your iron is low" into JSX. The moment
// the number changes, the sentence doesn't. Every claim in this
// app is computed from data that lives in this folder, so a
// changed value changes the sentence too.
//
// This module also owns the bridge to `HealthProfile` — the
// shape the AI agents actually receive. The two are deliberately
// separate: the agent contract is safety-critical and already
// sanitized (lib/memory/schema.ts), so the richer presentation
// model layers on top of it rather than replacing it.
// ============================================================

import type { HealthProfile } from "../memory/profile";
import { JULY_PANEL, type Marker } from "./labs";

export type Goal = { id: string; label: string; marker?: string };

export type Person = {
  name: string;
  initials: string;
  age: number;
  heightCm: number;
  weightKg: number;
  /** Hard dietary constraints. These gate every meal the planner may suggest. */
  restrictions: string[];
  conditions: string[];
  goals: Goal[];
  goalsReviewed: string; // ISO
};

export const DEV: Person = {
  name: "Dev Raman",
  initials: "DR",
  age: 34,
  heightCm: 178,
  weightKg: 71.2,
  restrictions: ["Gluten", "Lactose"],
  conditions: [],
  goals: [
    { id: "ferritin-up", label: "Raise ferritin", marker: "ferritin" },
    { id: "ldl-down", label: "Lower LDL", marker: "ldl" },
    { id: "weight-hold", label: "Hold weight" },
  ],
  goalsReviewed: "2026-07-14",
};

// ------------------------------------------------------------
// Self-reported and device-sourced series.
//
// Kept separate from labs because they differ in kind: a lab
// value is measured once by an instrument, these are noisy
// observations sampled daily. The UI is careful to label them
// "self-reported" for exactly that reason — presenting a mood
// log with the same authority as a blood test is a category
// error the product should never make.
// ------------------------------------------------------------

export type Series = { label: string; unit: string; points: { t: string; v: number }[] };

/** Energy through a typical day, 0–10, averaged over the logging window. */
export const ENERGY_CURVE: Series = {
  label: "Your energy, self-reported",
  unit: "/10",
  points: [
    { t: "8am", v: 7.1 },
    { t: "10am", v: 7.4 },
    { t: "12pm", v: 6.8 },
    { t: "2pm", v: 5.2 },
    { t: "4pm", v: 3.9 },
    { t: "6pm", v: 5.4 },
    { t: "8pm", v: 6.3 },
    { t: "10pm", v: 6.0 },
  ],
};

export const IRON_INTAKE: Series = {
  label: "Iron intake",
  unit: "mg",
  points: [
    { t: "W1", v: 8.9 },
    { t: "W2", v: 9.4 },
    { t: "W3", v: 11.8 },
    { t: "W4", v: 12.6 },
  ],
};

export const SLEEP: Series = {
  label: "Sleep",
  unit: "h",
  points: [
    { t: "W1", v: 6.9 },
    { t: "W2", v: 6.4 },
    { t: "W3", v: 6.1 },
    { t: "W4", v: 6.2 },
  ],
};

export const WEIGHT: Series = {
  label: "Weight",
  unit: "kg",
  points: [
    { t: "W1", v: 71.6 },
    { t: "W2", v: 71.0 },
    { t: "W3", v: 71.4 },
    { t: "W4", v: 71.2 },
  ],
};

/** Days in the last month the user logged an afternoon energy dip. */
export const FATIGUE_DAYS_LOGGED = 11;

/** Averaged daily iron from the last three days of logged meals. */
export const IRON_3DAY_AVG = 9;
/** The useful daily target for someone with Dev's ferritin. */
export const IRON_TARGET = 14;

export const PROTEIN_TARGET = 115;
export const PROTEIN_TODAY = 91;

// ------------------------------------------------------------
// Bridge to the agent-facing profile.
// ------------------------------------------------------------

/**
 * Map a rich Marker onto the coarse `Biomarker` shape the agents
 * see.
 *
 * The narrowing is intentional. `HealthProfile.biomarkers` is
 * interpolated into agent instructions, and the schema in
 * lib/memory/schema.ts clamps every field. Sending the full
 * Marker (with history arrays and evidence grades) would widen
 * that untrusted surface for no gain — the agent reasons about
 * "ferritin is low-normal at 38 µg/L", not about the shape of
 * the trend line, which it cannot see anyway.
 */
function toBiomarker(m: Marker): HealthProfile["biomarkers"][number] {
  const status =
    m.flag === "below-range" ? "low"
    : m.flag === "above-range" ? "high"
    : m.flag === "low-normal" || m.flag === "high-normal" ? "borderline"
    : "normal";
  return { name: m.name, value: `${m.value} ${m.unit}`, status, note: m.plain.slice(0, 120) };
}

/**
 * The demo person, in the shape every agent already expects.
 *
 * Only the markers that earn attention plus a handful of
 * headline-normal ones are sent. Shipping all 38 rows into the
 * prompt would be context stuffing — the same mistake
 * lib/agents/index.ts documents avoiding for specialists — and
 * would push the two values that actually matter into the noise.
 */
export function personToProfile(p: Person = DEV): HealthProfile {
  const notable = JULY_PANEL.markers.filter(
    (m) => m.tone === "attention" || ["hemoglobin", "tsh", "hba1c", "vit-d", "b12"].includes(m.id),
  );
  return {
    name: p.name.split(" ")[0],
    age: p.age,
    sex: "male",
    heightCm: p.heightCm,
    weightKg: p.weightKg,
    goal: p.goals.map((g) => g.label).join(", "),
    sleepHours: 6.2,
    exerciseDaysPerWeek: 3,
    biomarkers: notable.map(toBiomarker),
    allergies: p.restrictions,
    medicines: ["Ferrous fumarate 210 mg"],
    conditions: p.conditions,
    proteinGoal: PROTEIN_TARGET,
    onboarded: true,
    trends: [
      { label: "Iron intake", delta: "+3.7 mg/day", direction: "up", good: true },
      { label: "Sleep", delta: "-48 min", direction: "down", good: false },
      { label: "Ferritin", delta: "44 → 38 µg/L", direction: "down", good: false },
      { label: "LDL", delta: "3.1 → 3.6 mmol/L", direction: "up", good: false },
    ],
  };
}
