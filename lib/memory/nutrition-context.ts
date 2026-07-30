// ============================================================
// NUTRITION MEMORY
//
// The product's core loop is scan → log. Until this file existed,
// none of that reached the agents: `memoryContext()` carried labs
// and body stats but not a single meal, so "am I eating enough
// protein?" was answered from body weight alone while two weeks
// of logged data sat unread. The tagline promises memory; this is
// the part that makes it true in conversation.
//
// Kept deliberately compact — this is prepended to every agent's
// instructions, and a wall of meal rows would crowd out the
// safety block that matters more.
// ============================================================

import type { HealthProfile } from "./profile";
import type { LoggedMeal } from "./meals";
import { dayTotals, mealsOn } from "./meals";
import { proteinTarget } from "../nutrition/analyze";

const DAY = 86_400_000;
const r1 = (n: number) => Math.round(n * 10) / 10;

/** How many recent meals to name individually before summarising. */
const DETAIL_LIMIT = 6;

export function nutritionContext(p: HealthProfile, meals: LoggedMeal[]): string {
  const target = proteinTarget(p);

  if (!meals.length) {
    return `[NUTRITION MEMORY]
No meals have been logged yet, so you do NOT know what this person eats.
Do not estimate, assume, or invent their intake. If they ask about their diet,
say plainly that nothing is logged yet and invite them to scan or describe a meal.
Daily protein target from their goal and weight: ${target} g.
[END NUTRITION MEMORY]`;
  }

  const cutoff = Date.now() - 14 * DAY;
  const window = meals.filter((m) => new Date(m.at).getTime() >= cutoff);

  // Average across days that actually have data. Dividing by 14 would blame
  // the user for not logging, and the agent would repeat that as fact.
  const byDay = new Map<string, { kcal: number; protein: number; fiber: number }>();
  for (const m of window) {
    const k = new Date(m.at).toDateString();
    const cur = byDay.get(k) ?? { kcal: 0, protein: 0, fiber: 0 };
    byDay.set(k, { kcal: cur.kcal + m.kcal, protein: cur.protein + m.protein, fiber: cur.fiber + m.fiber });
  }
  const days = byDay.size;
  const totals = [...byDay.values()];
  const avg = (pick: (d: { kcal: number; protein: number; fiber: number }) => number) =>
    days ? r1(totals.reduce((a, d) => a + pick(d), 0) / days) : 0;

  const today = dayTotals(meals);
  const loggedToday = mealsOn(meals).length;

  const recent = [...window]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, DETAIL_LIMIT)
    .map((m) => `  - ${new Date(m.at).toLocaleDateString()}: ${m.title} — ${m.kcal} kcal, ${m.protein} g protein (meal fit ${m.fitScore}/100)`)
    .join("\n");

  const confidence =
    days === 0
      ? "No days logged in the last 14 — treat intake as unknown."
      : days < 3
        ? `Only ${days} day${days === 1 ? "" : "s"} logged in the last 14 — call any dietary pattern tentative, not established.`
        : days < 7
          ? `${days} days logged in the last 14 — enough for a provisional read, not a firm conclusion.`
          : `${days} days logged in the last 14 — a reasonably solid basis for dietary comments.`;

  return `[NUTRITION MEMORY — what this person has actually eaten]
Daily protein target: ${target} g (from their goal and body weight).
Today so far: ${loggedToday} meal${loggedToday === 1 ? "" : "s"}, ${today.kcal} kcal, ${today.protein} g protein, ${today.fiber} g fibre.
Last 14 days, averaged over days with data: ${avg((d) => d.kcal)} kcal/day, ${avg((d) => d.protein)} g protein/day, ${avg((d) => d.fiber)} g fibre/day.
Most recent meals:
${recent || "  - none in the last 14 days"}

Evidence quality: ${confidence}
Only meals the user logged are visible to you — anything unlogged is invisible,
so never claim this is their complete intake.
[END NUTRITION MEMORY]`;
}
