// ============================================================
// ACTION TOOLS — what makes the agents act, not just answer.
//
// The chat's memory lives in the person's browser, so these tools never
// write anything themselves. Each one validates what the model proposes,
// computes any numbers deterministically, and returns the change as its
// output. The client applies a tool's output to the chart once, when the
// call completes (components/chat.tsx → applyActions), and shows it in the
// message so the person can see exactly what was saved.
//
// Two rules the model cannot bend:
//   - Nutrition numbers come from the food database (lib/nutrition), never
//     from the model. A food the database does not know is reported back as
//     unmatched rather than guessed.
//   - Targets are arithmetic, done here. The model explains them; it does
//     not compute them.
// ============================================================

import { tool } from "ai";
import { z } from "zod";
import { analyzeMeal, parseMeal, proteinTarget } from "../nutrition/analyze";
import { toLoggedMeal, type LoggedMeal } from "../memory/meals";
import { isRecorded, type Biomarker, type HealthProfile, type RecordedField } from "../memory/profile";

export type ProfilePatch = Partial<Pick<HealthProfile, "name" | "age" | "sex" | "weightKg" | "heightCm" | "goal" | "sleepHours" | "exerciseDaysPerWeek">> & {
  addAllergies?: string[];
  addMedicines?: string[];
  addConditions?: string[];
};

export type ActionOutput =
  | { kind: "profile"; patch: ProfilePatch; recorded: RecordedField[]; summary: string }
  | { kind: "meal"; meal: LoggedMeal; unmatched: string[]; summary: string }
  | { kind: "lab"; biomarker: Biomarker; summary: string }
  | { kind: "none"; summary: string };

/** Tool names whose completed output the client applies to the chart. */
export const ACTION_TOOLS = ["updateProfile", "logMeal", "recordLabResult"] as const;

const shortList = z.array(z.string().trim().min(1).max(60)).max(8);

function applyPatch(p: HealthProfile, patch: ProfilePatch): HealthProfile {
  const { addAllergies, addMedicines, addConditions, ...fields } = patch;
  const merge = (a: string[], b?: string[]) => [...new Set([...a, ...(b ?? [])])];
  return {
    ...p,
    ...fields,
    allergies: merge(p.allergies, addAllergies),
    medicines: merge(p.medicines, addMedicines),
    conditions: merge(p.conditions, addConditions),
  };
}

/**
 * Deterministic targets for a profile. Every figure says what it was
 * computed from, and anything that needs a missing input is left out with
 * the reason, so the model can ask instead of estimating.
 */
export function targetsFor(p: HealthProfile) {
  const hasW = isRecorded(p, "weightKg");
  const hasH = isRecorded(p, "heightCm");
  const missing: string[] = [];
  if (!hasW) missing.push("weight");
  if (!hasH) missing.push("height");

  const out: Record<string, string | number> = {};
  if (hasW && hasH) {
    const m = p.heightCm / 100;
    out.bmi = Math.round((p.weightKg / (m * m)) * 10) / 10;
  }
  if (hasW) {
    out.proteinGramsPerDay = proteinTarget(p);
    out.proteinBasis = `${p.weightKg} kg × ${/muscle|gain|strength|bulk/i.test(p.goal) ? 1.8 : /lose|fat|cut|weight/i.test(p.goal) ? 1.6 : 1.2} g/kg for goal "${p.goal}"`;
    out.waterLitresPerDay = Math.round(p.weightKg * 0.035 * 10) / 10;
  }
  if (hasW && hasH && p.age && (p.sex === "male" || p.sex === "female")) {
    // Mifflin–St Jeor, then a conservative activity factor from training days.
    const bmr = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age + (p.sex === "male" ? 5 : -161);
    const factor = 1.2 + Math.min(7, p.exerciseDaysPerWeek) * 0.05;
    const tdee = Math.round(bmr * factor);
    const adjust = /lose|fat|cut/i.test(p.goal) ? -400 : /muscle|gain|bulk/i.test(p.goal) ? 250 : 0;
    out.bmrKcal = Math.round(bmr);
    out.maintenanceKcal = tdee;
    out.goalKcal = tdee + adjust;
    out.calorieBasis = `Mifflin–St Jeor BMR × ${factor.toFixed(2)} activity${adjust ? `, ${adjust > 0 ? "+" : ""}${adjust} kcal for the goal` : ""}`;
  } else {
    if (!p.age) missing.push("age");
    if (!p.sex || p.sex === "other") missing.push("sex (for a calorie estimate)");
  }
  return { targets: out, missingForMore: missing };
}

/**
 * The action tools, bound to this turn's profile.
 *
 * `profile` is updated in place as the turn records things, so a
 * calculateTargets call after an updateProfile in the same turn computes
 * from the new numbers.
 */
export function actionTools(initial: HealthProfile) {
  let profile = initial;

  return {
    updateProfile: tool({
      description:
        "Save facts the user just stated ABOUT THEMSELVES to their health chart: weight, height, age, sex, goal, sleep, training days, name, allergies, medicines, conditions. Only values the user actually said in this conversation — never estimates or defaults.",
      inputSchema: z.object({
        name: z.string().trim().min(1).max(40).optional(),
        age: z.number().int().min(1).max(120).optional(),
        sex: z.enum(["male", "female", "other"]).optional(),
        weightKg: z.number().min(20).max(400).optional().describe("Convert lb to kg first."),
        heightCm: z.number().min(60).max(250).optional().describe("Convert feet/inches to cm first."),
        goal: z.string().trim().min(2).max(60).optional().describe('Short, e.g. "Lose fat", "Build muscle".'),
        sleepHours: z.number().min(0).max(24).optional(),
        exerciseDaysPerWeek: z.number().int().min(0).max(7).optional(),
        addAllergies: shortList.optional(),
        addMedicines: shortList.optional(),
        addConditions: shortList.optional(),
      }),
      execute: async (patch): Promise<ActionOutput> => {
        const recorded = (["name", "weightKg", "heightCm", "goal", "sleepHours", "exerciseDaysPerWeek"] as const).filter((k) => patch[k] !== undefined);
        const parts = [
          patch.weightKg !== undefined && `${patch.weightKg} kg`,
          patch.heightCm !== undefined && `${patch.heightCm} cm`,
          patch.age !== undefined && `${patch.age} y`,
          patch.sex,
          patch.goal && `goal: ${patch.goal}`,
          patch.sleepHours !== undefined && `sleep ${patch.sleepHours} h`,
          patch.exerciseDaysPerWeek !== undefined && `training ${patch.exerciseDaysPerWeek} d/wk`,
          patch.addAllergies?.length && `allergies: ${patch.addAllergies.join(", ")}`,
          patch.addMedicines?.length && `medicines: ${patch.addMedicines.join(", ")}`,
          patch.addConditions?.length && `conditions: ${patch.addConditions.join(", ")}`,
        ].filter(Boolean);
        if (!parts.length && !patch.name) return { kind: "none", summary: "Nothing to save." };
        profile = applyPatch({ ...profile, recorded: [...new Set([...(profile.recorded ?? []), ...recorded])] }, patch);
        return { kind: "profile", patch, recorded, summary: `Saved to your chart: ${parts.join(" · ") || patch.name}` };
      },
    }),

    logMeal: tool({
      description:
        "Log a meal the user says they ATE (past tense or today) to their food diary. Pass their own words; nutrition is computed from the food database, not by you. Do not call for meals they are only asking about or planning.",
      inputSchema: z.object({
        description: z.string().trim().min(2).max(300).describe('The meal in the user\'s words, with quantities, e.g. "2 roti, 1 katori dal, 100 g paneer".'),
        title: z.string().trim().max(60).optional().describe('e.g. "Lunch"'),
      }),
      execute: async ({ description, title }): Promise<ActionOutput> => {
        const items = parseMeal(description);
        if (!items.length) {
          return { kind: "none", summary: "None of those foods are in the database yet, so nothing was logged. Ask the user to name the foods more specifically." };
        }
        const result = analyzeMeal(items, profile, { source: "text", title });
        const meal = toLoggedMeal(result);
        const named = new Set(items.map((i) => i.name.toLowerCase()));
        const unmatched = description
          .split(/,| and | aur | with |\+/i)
          .map((x) => x.trim())
          .filter((x) => x && ![...named].some((n) => x.toLowerCase().includes(n.split(" ")[0])));
        return {
          kind: "meal",
          meal,
          unmatched,
          summary: `Logged ${meal.title}: ${meal.kcal} kcal, ${meal.protein} g protein, ${meal.carbs} g carbs, ${meal.fat} g fat (items: ${meal.items.join(", ")})${unmatched.length ? `. Not in the database, not counted: ${unmatched.join(", ")}` : ""}`,
        };
      },
    }),

    recordLabResult: tool({
      description:
        "Save a lab value the user reported from THEIR OWN report (e.g. Vitamin D 12 ng/mL) to their chart. Status must follow the reference range printed on their report when given; otherwise use the usual adult range and say so.",
      inputSchema: z.object({
        name: z.string().trim().min(1).max(40),
        value: z.string().trim().min(1).max(30).describe('Value with unit, e.g. "12 ng/mL".'),
        status: z.enum(["low", "normal", "high", "borderline"]),
        note: z.string().trim().max(80).optional().describe("e.g. the reference range used"),
      }),
      execute: async (b): Promise<ActionOutput> => {
        profile = { ...profile, biomarkers: [...profile.biomarkers.filter((x) => x.name.toLowerCase() !== b.name.toLowerCase()), b] };
        return { kind: "lab", biomarker: b, summary: `Saved lab result: ${b.name} ${b.value} (${b.status})` };
      },
    }),

    calculateTargets: tool({
      description:
        "Compute BMI, daily protein, water and calorie targets from the user's recorded chart (including anything saved earlier in this turn). Always use this instead of doing the arithmetic yourself.",
      inputSchema: z.object({}),
      execute: async () => targetsFor(profile),
    }),
  };
}

/** Standing orders for any agent that holds the action tools. */
export const ACTION_INSTRUCTIONS = `
You can ACT, not just answer. Tools that change the user's chart:
- updateProfile — when the user states their weight, height, age, sex, goal, sleep, training days, allergies, medicines or conditions.
- logMeal — when the user says they ate something.
- recordLabResult — when the user gives values from their own lab report.
- calculateTargets — whenever you need BMI, protein, water or calorie numbers. Never compute these yourself.
Call the saving tools FIRST, in one step if several apply, then answer using what they returned.
Only save what the user said about themselves in this conversation. Never save estimates, examples or defaults.
In your answer, mention briefly what you saved (e.g. "I've logged that lunch and saved your weight"), so they know their chart changed.`;
