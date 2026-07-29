// ============================================================
// HEALTH MEMORY ENGINE
// The AI remembers everything: body, goals, sleep, labs, habits.
// This profile is injected into every agent so answers are personal.
// ============================================================

export type Biomarker = {
  name: string;
  value: string;
  status: "low" | "normal" | "high" | "borderline";
  note?: string;
};

import { demoJournal, type JournalEntry } from "./journal";

export type Trend = { label: string; delta: string; direction: "up" | "down" | "flat"; good: boolean };

export type HealthProfile = {
  name: string;
  /**
   * Optional because we never ask for them at first run. A health product
   * must be able to say "not recorded" — printing a default age and sex into
   * the agent prompt is indistinguishable, downstream, from the user having
   * told us.
   */
  age?: number;
  sex?: "male" | "female" | "other";
  heightCm: number;
  weightKg: number;
  goal: string;
  sleepHours: number;
  exerciseDaysPerWeek: number;
  restingHr?: number;
  biomarkers: Biomarker[];
  allergies: string[];
  medicines: string[];
  conditions: string[];
  // derived analytics for the dashboard
  trends?: Trend[];
  /** set once the user has been through first-run so we never ask twice */
  onboarded?: boolean;
  /** dated, append-only history — the spine of the patient timeline */
  journal?: JournalEntry[];
};

// Default demo memory — Adarsh (from the product brief).
export const demoProfile: HealthProfile = {
  name: "Adarsh",
  age: 24,
  sex: "male",
  heightCm: 173, // 5'8"
  weightKg: 65,
  goal: "Build muscle",
  sleepHours: 7,
  exerciseDaysPerWeek: 5,
  restingHr: 61,
  biomarkers: [
    { name: "Vitamin B12", value: "180 pg/mL", status: "low", note: "Below optimal (200–900)" },
    { name: "Vitamin D", value: "34 ng/mL", status: "borderline", note: "Aim for 40–60" },
    { name: "Hemoglobin", value: "14.6 g/dL", status: "normal" },
    { name: "Fasting glucose", value: "88 mg/dL", status: "normal" },
  ],
  allergies: [],
  medicines: [],
  conditions: [],
  journal: demoJournal,
  trends: [
    { label: "Sleep duration", delta: "+48 min / month", direction: "up", good: true },
    { label: "Workout consistency", delta: "+2 days / week", direction: "up", good: true },
    { label: "Resting heart rate", delta: "-3 bpm", direction: "down", good: true },
    { label: "Protein intake", delta: "1.4 g/kg avg", direction: "up", good: true },
  ],
};

/**
 * The memory a *real* person starts with: empty.
 *
 * This exists because first-run used to `patch()` the user's answers on top of
 * `demoProfile`, which left Adarsh's biomarkers and trends in place. A brand
 * new user was shown "Vitamin B12 180 pg/mL — low" as their own recorded lab,
 * it was subtracted from their health score, the insight engine cited it as
 * evidence, and `memoryContext()` fed it to all five agents. The product told
 * people they had a deficiency it had invented.
 *
 * Anything not recorded stays absent. The screens are responsible for saying
 * "nothing yet" — never for filling the gap.
 */
export const blankProfile: HealthProfile = {
  name: "there",
  heightCm: 170,
  weightKg: 70,
  goal: "Stay healthy",
  sleepHours: 7,
  exerciseDaysPerWeek: 3,
  biomarkers: [],
  allergies: [],
  medicines: [],
  conditions: [],
  journal: [],
  trends: [],
};

// Where the memory lives between visits. Shared by every surface
// (dashboard, chat, scanner) so they all reason about the same person.
export const PROFILE_KEY = "ns-profile-v1";

/**
 * Whether what's on screen is still the shipped demo memory rather than the
 * user's own. The "skip" path at first run deliberately keeps it, so every
 * surface showing labs or trends must be able to label them as a sample.
 */
export const isDemoMemory = (p: HealthProfile): boolean => !!p.journal?.some((e) => e.id.startsWith("j-seed-"));

export function bmi(p: HealthProfile): number {
  const m = p.heightCm / 100;
  return +(p.weightKg / (m * m)).toFixed(1);
}

export function heightImperial(cm: number): string {
  const totalIn = cm / 2.54;
  const ft = Math.floor(totalIn / 12);
  const inch = Math.round(totalIn % 12);
  return `${ft}'${inch}"`;
}

export type ScoreFactor = { label: string; delta: number; detail: string };

/**
 * A composite, illustrative "health score" — NOT a medical assessment.
 *
 * It returns the factors alongside the number. The number on its own is the
 * least defensible thing on the dashboard: it is the largest type on the page
 * and it used to arrive with no stated basis, in a product whose entire
 * differentiator (`lib/health/insights.ts`) is refusing to assert more than
 * the evidence supports. If we show a score, we show our working.
 */
export function healthScore(p: HealthProfile): { score: number; factors: ScoreFactor[] } {
  const factors: ScoreFactor[] = [];
  const add = (label: string, delta: number, detail: string) => {
    if (delta !== 0) factors.push({ label, delta, detail });
  };

  const BASE = 72;
  add("Baseline", BASE, "every score starts here");

  add("Sleep", p.sleepHours >= 7 ? 6 : 0, `${p.sleepHours} h a night`);
  add("Training", p.exerciseDaysPerWeek >= 4 ? 8 : 0, `${p.exerciseDaysPerWeek} days a week`);

  const b = bmi(p);
  add("BMI", b >= 18.5 && b <= 24.9 ? 6 : 0, `${b} — within 18.5–24.9`);

  const outOfRange = p.biomarkers.filter((x) => x.status === "low" || x.status === "high");
  add("Labs out of range", outOfRange.length * -4, outOfRange.map((x) => x.name).join(", "));

  const borderline = p.biomarkers.filter((x) => x.status === "borderline");
  add("Borderline labs", borderline.length * -2, borderline.map((x) => x.name).join(", "));

  const raw = factors.reduce((a, f) => a + f.delta, 0);
  return { score: Math.max(35, Math.min(98, raw)), factors };
}

/**
 * A short longitudinal note for the Health Memory card.
 *
 * With nothing recorded it says so. It previously fell through to "your
 * fundamentals look steady" — a reassurance about a body it knew nothing
 * about, which is the failure mode this product exists to avoid.
 */
export function insight(p: HealthProfile): string {
  const sleepUp = p.trends?.find((t) => /sleep/i.test(t.label) && t.direction === "up");
  const workoutUp = p.trends?.find((t) => /workout|consistency/i.test(t.label) && t.direction === "up");
  const low = p.biomarkers.find((b) => b.status === "low");
  const parts: string[] = [];
  if (sleepUp) parts.push(`your sleep is trending up (${sleepUp.delta})`);
  if (workoutUp) parts.push(`workout consistency has improved (${workoutUp.delta})`);
  if (low) parts.push(`keep an eye on your ${low.name.toLowerCase()}`);
  if (!parts.length) {
    return `I don't know enough about you yet to say anything useful. Scan a meal or paste a lab report and this becomes real.`;
  }
  const joined = parts.length > 1 ? parts.slice(0, -1).join(", ") + " and " + parts.slice(-1) : parts[0];
  return `${p.name}, ${joined}.`;
}

// ------------------------------------------------------------
// Memory sections — context engineering, not just rendering.
//
// Every specialist used to get the FULL profile every turn: a Fitness
// question got the complete lab panel, allergy list, and medicines dumped
// into its instructions alongside the one field it actually needed (BMI).
// That's context stuffing, not context engineering — it dilutes the
// specialist's attention with irrelevant detail and costs tokens on every
// one of the (possibly several) specialist calls a single turn can fan out
// to. Each specialist now declares which sections it needs (lib/agents/index.ts);
// this module only has to make that declaration possible and correct.
//
// The Supervisor and Doctor Agent still get ALL_MEMORY_SECTIONS — the
// Supervisor is the one deciding whether a question is single- or
// cross-domain (and can route to more than one specialist when it is), and
// Doctor's triage role means narrowing its facts is exactly the kind of
// "invent by omission" failure the safety rules exist to prevent.
// ------------------------------------------------------------

export type MemorySection = "identity" | "vitals" | "goal" | "sleep" | "activity" | "allergies" | "medicines" | "conditions" | "biomarkers";

export const ALL_MEMORY_SECTIONS: MemorySection[] = ["identity", "vitals", "goal", "sleep", "activity", "allergies", "medicines", "conditions", "biomarkers"];

const SECTION_RENDERERS: Record<MemorySection, (p: HealthProfile) => string> = {
  identity: (p) => `Name: ${p.name}\nAge: ${p.age ?? "not recorded — do not assume one"}\nSex: ${p.sex ?? "not recorded — do not assume one"}`,
  vitals: (p) => `Height/Weight: ${p.heightCm} cm (${heightImperial(p.heightCm)}) / ${p.weightKg} kg  |  BMI ${bmi(p)}`,
  goal: (p) => `Primary goal: ${p.goal}`,
  sleep: (p) => `Sleep: ~${p.sleepHours} h/night`,
  activity: (p) => `Exercise: ${p.exerciseDaysPerWeek} days/week   Resting HR: ${p.restingHr ? `${p.restingHr} bpm` : "not recorded"}`,
  allergies: (p) => `Allergies: ${p.allergies.length ? p.allergies.join(", ") : "none recorded"}`,
  medicines: (p) => `Medicines: ${p.medicines.length ? p.medicines.join(", ") : "none recorded"}`,
  conditions: (p) => `Conditions: ${p.conditions.length ? p.conditions.join(", ") : "none recorded"}`,
  biomarkers: (p) => {
    const labs = p.biomarkers.map((b) => `  - ${b.name}: ${b.value} (${b.status}${b.note ? `, ${b.note}` : ""})`).join("\n");
    return `Recent lab biomarkers:\n${labs || "  - none recorded"}`;
  },
};

/**
 * Render the memory as context injected into an agent's instructions.
 * Defaults to every section (the original, pre-scoping behavior) so
 * existing callers — and the Supervisor/Doctor, which want the full
 * picture — don't have to spell out the section list.
 */
export function memoryContext(p: HealthProfile, sections: MemorySection[] = ALL_MEMORY_SECTIONS): string {
  const body = sections.map((s) => SECTION_RENDERERS[s](p)).join("\n");
  return `[USER HEALTH MEMORY — remember and personalize everything to this person]\n${body}\n[END MEMORY]`;
}
