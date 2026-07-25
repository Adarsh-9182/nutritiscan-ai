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

export type Trend = { label: string; delta: string; direction: "up" | "down" | "flat"; good: boolean };

export type HealthProfile = {
  name: string;
  age: number;
  sex: "male" | "female" | "other";
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
  trends: [
    { label: "Sleep duration", delta: "+48 min / month", direction: "up", good: true },
    { label: "Workout consistency", delta: "+2 days / week", direction: "up", good: true },
    { label: "Resting heart rate", delta: "-3 bpm", direction: "down", good: true },
    { label: "Protein intake", delta: "1.4 g/kg avg", direction: "up", good: true },
  ],
};

// Where the memory lives between visits. Shared by every surface
// (dashboard, chat, scanner) so they all reason about the same person.
export const PROFILE_KEY = "ns-profile-v1";

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

// A composite, illustrative "health score" (NOT a medical assessment).
export function healthScore(p: HealthProfile): number {
  let score = 72;
  if (p.sleepHours >= 7) score += 6;
  if (p.exerciseDaysPerWeek >= 4) score += 8;
  const b = bmi(p);
  if (b >= 18.5 && b <= 24.9) score += 6;
  const lows = p.biomarkers.filter((x) => x.status === "low" || x.status === "high").length;
  score -= lows * 4;
  const borderline = p.biomarkers.filter((x) => x.status === "borderline").length;
  score -= borderline * 2;
  return Math.max(35, Math.min(98, score));
}

// A short longitudinal insight for the Health Memory Engine (illustrative).
export function insight(p: HealthProfile): string {
  const sleepUp = p.trends?.find((t) => /sleep/i.test(t.label) && t.direction === "up");
  const workoutUp = p.trends?.find((t) => /workout|consistency/i.test(t.label) && t.direction === "up");
  const low = p.biomarkers.find((b) => b.status === "low");
  const parts: string[] = [];
  if (sleepUp) parts.push(`your sleep is trending up (${sleepUp.delta})`);
  if (workoutUp) parts.push(`workout consistency has improved (${workoutUp.delta})`);
  if (low) parts.push(`keep an eye on your ${low.name.toLowerCase()}`);
  if (!parts.length) return `${p.name}, your fundamentals look steady. Keep the streak going.`;
  const joined = parts.length > 1 ? parts.slice(0, -1).join(", ") + " and " + parts.slice(-1) : parts[0];
  return `${p.name}, ${joined}.`;
}

// Render the memory as context injected into every agent's instructions.
export function memoryContext(p: HealthProfile): string {
  const labs = p.biomarkers.map((b) => `  - ${b.name}: ${b.value} (${b.status}${b.note ? `, ${b.note}` : ""})`).join("\n");
  return `[USER HEALTH MEMORY — remember and personalize everything to this person]
Name: ${p.name}
Age/Sex: ${p.age} / ${p.sex}
Height/Weight: ${p.heightCm} cm (${heightImperial(p.heightCm)}) / ${p.weightKg} kg  |  BMI ${bmi(p)}
Primary goal: ${p.goal}
Sleep: ~${p.sleepHours} h/night   Exercise: ${p.exerciseDaysPerWeek} days/week   Resting HR: ${p.restingHr ?? "n/a"} bpm
Allergies: ${p.allergies.length ? p.allergies.join(", ") : "none recorded"}
Medicines: ${p.medicines.length ? p.medicines.join(", ") : "none recorded"}
Conditions: ${p.conditions.length ? p.conditions.join(", ") : "none recorded"}
Recent lab biomarkers:
${labs || "  - none recorded"}
[END MEMORY]`;
}
