"use client";

// ============================================================
// HEALTH MEMORY STORE
// One reactive, persistent store behind every surface. The
// dashboard, the scanner and the timeline don't own copies of
// the user's memory — they subscribe to it. A write anywhere
// lands everywhere, including in other browser tabs.
//
// Built on useSyncExternalStore so there is no setState-in-effect
// hydration dance and no chance of two screens disagreeing about
// what the AI remembers.
// ============================================================

import { useSyncExternalStore } from "react";
import { demoProfile, PROFILE_KEY, type HealthProfile } from "./profile";
import { MEALS_KEY, type LoggedMeal } from "./meals";

type Listener = () => void;

function createStore<T>(key: string, fallback: T) {
  const listeners = new Set<Listener>();
  let cachedRaw: string | null = null;
  let cachedValue: T = fallback;
  let primed = false;
  let bound = false;

  const emit = () => {
    for (const l of listeners) l();
  };

  /**
   * Must return a referentially stable value between renders, so the parsed
   * object is cached and only rebuilt when the underlying string changes.
   */
  const read = (): T => {
    if (typeof window === "undefined") return fallback;
    const raw = localStorage.getItem(key);
    if (!primed || raw !== cachedRaw) {
      cachedRaw = raw;
      primed = true;
      try {
        cachedValue = raw ? (JSON.parse(raw) as T) : fallback;
      } catch {
        cachedValue = fallback;
      }
    }
    return cachedValue;
  };

  const subscribe = (l: Listener) => {
    listeners.add(l);
    if (!bound && typeof window !== "undefined") {
      // Keep tabs in sync — the memory is one thing, not one per tab.
      window.addEventListener("storage", (e) => {
        if (e.key === key) emit();
      });
      bound = true;
    }
    return () => {
      listeners.delete(l);
    };
  };

  const write = (value: T) => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Quota or private-mode failure: keep the in-memory value so the session
      // still works, and let the next write try again.
    }
    primed = false;
    emit();
  };

  return { subscribe, read, write, serverValue: () => fallback };
}

const profileStore = createStore<HealthProfile>(PROFILE_KEY, demoProfile);
const mealsStore = createStore<LoggedMeal[]>(MEALS_KEY, []);

export function useProfile(): [HealthProfile, (next: HealthProfile) => void, (patch: Partial<HealthProfile>) => void] {
  const profile = useSyncExternalStore(profileStore.subscribe, profileStore.read, profileStore.serverValue);
  const set = (next: HealthProfile) => profileStore.write(next);
  const patch = (p: Partial<HealthProfile>) => profileStore.write({ ...profileStore.read(), ...p });
  return [profile, set, patch];
}

export function useMeals(): [LoggedMeal[], (next: LoggedMeal[]) => void, (meal: LoggedMeal) => void] {
  const meals = useSyncExternalStore(mealsStore.subscribe, mealsStore.read, mealsStore.serverValue);
  const set = (next: LoggedMeal[]) => mealsStore.write(next.slice(-200));
  const add = (meal: LoggedMeal) => mealsStore.write([...mealsStore.read(), meal].slice(-200));
  return [meals, set, add];
}

/** Non-reactive read, for code paths outside React (e.g. building a request body). */
export const readProfile = () => profileStore.read();
