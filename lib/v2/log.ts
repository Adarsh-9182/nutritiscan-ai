"use client";

// ============================================================
// LOGGING A SCANNED MEAL
//
// A thin seam over the existing meal store rather than a second
// one. `lib/memory/meals.ts` already owns the LoggedMeal shape
// and the conversion from a ScanResult; the API route reads that
// same store to tell the agents what the user actually ate.
//
// This exists so screens don't import two modules to log one
// meal, and so there is a single place to add anything that must
// happen alongside a log (a journal entry, a reminder) later.
// ============================================================

import { toLoggedMeal, type LoggedMeal } from "../memory/meals";
import { readMeals } from "../memory/store";
import type { ScanResult } from "../nutrition/analyze";

const MEALS_KEY = "ns-meals-v1";
const MAX_MEALS = 200;

/**
 * Append a scanned meal to the log.
 *
 * Writes through localStorage directly rather than via the React
 * hook, because this is called from an event handler where no
 * hook is in scope. The store's `storage` listener and its
 * cached-raw check mean subscribed components still re-render.
 */
export function addMealFromScan(result: ScanResult): LoggedMeal {
  const meal = toLoggedMeal(result);
  if (typeof window === "undefined") return meal;

  const next = [...readMeals(), meal].slice(-MAX_MEALS);
  try {
    localStorage.setItem(MEALS_KEY, JSON.stringify(next));
    // `storage` doesn't fire in the tab that wrote it, so nudge
    // same-tab subscribers explicitly.
    window.dispatchEvent(new StorageEvent("storage", { key: MEALS_KEY }));
  } catch {
    // Quota or private mode. The meal is still returned so the UI
    // can confirm what it read; only persistence was lost.
  }
  return meal;
}
