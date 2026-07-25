// ============================================================
// MEAL MEMORY
// Scanned meals the user chose to log. Persisted locally so the
// dashboard shows real intake instead of placeholder numbers —
// the Health Memory Engine, extended to what you actually ate.
// ============================================================

import type { ScanResult } from "../nutrition/analyze";

export type LoggedMeal = {
  id: string;
  at: string; // ISO timestamp
  title: string;
  items: string[];
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  fitScore: number;
  source: ScanResult["source"];
};

export const MEALS_KEY = "ns-meals-v1";

export function toLoggedMeal(r: ScanResult): LoggedMeal {
  return {
    id: `meal-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    at: new Date().toISOString(),
    title: r.title,
    items: r.items.map((i) => `${i.name} (${i.grams} g)`),
    kcal: r.totals.kcal,
    protein: r.totals.protein,
    carbs: r.totals.carbs,
    fat: r.totals.fat,
    fiber: r.totals.fiber,
    fitScore: r.fitScore,
    source: r.source,
  };
}

const sameDay = (iso: string, day: Date) => {
  const d = new Date(iso);
  return d.getFullYear() === day.getFullYear() && d.getMonth() === day.getMonth() && d.getDate() === day.getDate();
};

export function mealsOn(meals: LoggedMeal[], day = new Date()): LoggedMeal[] {
  return meals.filter((m) => sameDay(m.at, day));
}

export function dayTotals(meals: LoggedMeal[], day = new Date()) {
  return mealsOn(meals, day).reduce(
    (a, m) => ({
      kcal: a.kcal + m.kcal,
      protein: Math.round((a.protein + m.protein) * 10) / 10,
      carbs: Math.round((a.carbs + m.carbs) * 10) / 10,
      fat: Math.round((a.fat + m.fat) * 10) / 10,
      fiber: Math.round((a.fiber + m.fiber) * 10) / 10,
      count: a.count + 1,
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, count: 0 },
  );
}

export const mealTime = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
