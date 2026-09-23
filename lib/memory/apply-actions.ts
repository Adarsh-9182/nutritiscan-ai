// ============================================================
// Applying what the agents did.
//
// The action tools (lib/agents/actions.ts) run on the server but the chart
// lives here, in the browser. When one of their calls completes, its output
// is the change; this applies it to the stores exactly once per call —
// a restored conversation or a re-render must not log the same lunch twice.
// ============================================================

import type { UIMessage } from "ai";
import type { ActionOutput } from "../agents/actions";
import { readMeals, readProfile } from "./store";
import type { HealthProfile } from "./profile";
import type { LoggedMeal } from "./meals";

const APPLIED_KEY = "ns-applied-actions-v1";
const MAX_REMEMBERED = 500;

export type ActionPart = {
  type: string;
  toolCallId: string;
  state: string;
  output?: ActionOutput;
};

const ACTION_TYPES = new Set(["tool-updateProfile", "tool-logMeal", "tool-recordLabResult"]);

export function actionPartsOf(m: { parts: unknown[] }): ActionPart[] {
  return (m.parts as ActionPart[]).filter((p) => ACTION_TYPES.has(p.type) && typeof p.toolCallId === "string");
}

function loadApplied(): Set<string> {
  try {
    const raw = localStorage.getItem(APPLIED_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function saveApplied(ids: Set<string>) {
  try {
    localStorage.setItem(APPLIED_KEY, JSON.stringify([...ids].slice(-MAX_REMEMBERED)));
  } catch {}
}

function merge(a: string[], b?: string[]) {
  return [...new Set([...a, ...(b ?? [])])];
}

/** The profile after one action; pure, so it can be tested without a browser. */
export function profileAfter(p: HealthProfile, out: ActionOutput): HealthProfile {
  if (out.kind === "profile") {
    const { addAllergies, addMedicines, addConditions, ...fields } = out.patch;
    return {
      ...p,
      ...fields,
      allergies: merge(p.allergies, addAllergies),
      medicines: merge(p.medicines, addMedicines),
      conditions: merge(p.conditions, addConditions),
      recorded: merge(p.recorded ?? [], out.recorded) as HealthProfile["recorded"],
    };
  }
  if (out.kind === "lab") {
    const b = out.biomarker;
    return { ...p, biomarkers: [...p.biomarkers.filter((x) => x.name.toLowerCase() !== b.name.toLowerCase()), b] };
  }
  return p;
}

/**
 * A retry down the model ladder can re-run a tool with a new call id. The
 * same meal with the same numbers inside a few minutes is that, not a second
 * lunch.
 */
function isDuplicateMeal(meals: LoggedMeal[], meal: LoggedMeal): boolean {
  const at = new Date(meal.at).getTime();
  return meals.some((m) => m.title === meal.title && m.kcal === meal.kcal && Math.abs(new Date(m.at).getTime() - at) < 5 * 60_000);
}

/**
 * Apply every completed, not-yet-applied action in these messages.
 * Returns true when anything changed.
 */
export function applyActions(
  messages: UIMessage[],
  write: { setProfile: (p: HealthProfile) => void; addMeal: (m: LoggedMeal) => void },
): boolean {
  const applied = loadApplied();
  const before = applied.size;
  let profile = readProfile();
  let profileChanged = false;
  let changed = false;

  for (const m of messages) {
    if (m.role !== "assistant") continue;
    for (const part of actionPartsOf(m)) {
      if (part.state !== "output-available" || !part.output || applied.has(part.toolCallId)) continue;
      applied.add(part.toolCallId);
      const out = part.output;
      if (out.kind === "meal") {
        if (!isDuplicateMeal(readMeals(), out.meal)) {
          write.addMeal(out.meal);
          changed = true;
        }
      } else if (out.kind === "profile" || out.kind === "lab") {
        profile = profileAfter(profile, out);
        profileChanged = true;
      }
    }
  }

  if (profileChanged) {
    write.setProfile(profile);
    changed = true;
  }
  if (applied.size !== before) saveApplied(applied);
  return changed;
}
