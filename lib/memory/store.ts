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
//
// NOTE ON SENSITIVITY: this is health data (biomarkers, medicines,
// conditions) in localStorage — readable by any script on the origin
// and never evicted. It is acceptable only because this build is
// single-device and account-less. See `docs/DATA.md` before adding
// accounts, sync, or a third-party script tag.
// ============================================================

import { useSyncExternalStore } from "react";
import { demoProfile, PROFILE_KEY, type HealthProfile } from "./profile";
import { MEALS_KEY, type LoggedMeal } from "./meals";

type Listener = () => void;

/** Keep the logged-meal history bounded so localStorage can't fill up. */
const MAX_MEALS = 200;

function createStore<T>(key: string, fallback: T) {
  const listeners = new Set<Listener>();
  let cachedRaw: string | null = null;
  let cachedValue: T = fallback;
  let primed = false;
  let detach: (() => void) | null = null;

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

  const onStorage = (e: StorageEvent) => {
    if (e.key === key || e.key === null) emit();
  };

  const subscribe = (l: Listener) => {
    listeners.add(l);
    // Keep tabs in sync — the memory is one thing, not one per tab.
    if (!detach && typeof window !== "undefined") {
      window.addEventListener("storage", onStorage);
      detach = () => window.removeEventListener("storage", onStorage);
    }
    return () => {
      listeners.delete(l);
      if (listeners.size === 0 && detach) {
        detach();
        detach = null;
      }
    };
  };

  const write = (value: T) => {
    if (typeof window === "undefined") return;
    try {
      const json = JSON.stringify(value);
      localStorage.setItem(key, json);
      cachedRaw = json;
    } catch {
      // Quota exhausted, or private mode blocking writes. Persistence failed,
      // but the session must not silently revert what the user just entered —
      // so keep the new value in memory and leave `cachedRaw` pointing at
      // whatever is actually on disk, which stops `read` overwriting it.
      cachedRaw = localStorage.getItem(key);
    }
    cachedValue = value;
    primed = true;
    emit();
  };

  return { subscribe, read, write, serverValue: () => fallback };
}

const profileStore = createStore<HealthProfile>(PROFILE_KEY, demoProfile);
const mealsStore = createStore<LoggedMeal[]>(MEALS_KEY, []);

// Module-scope so identities are stable across renders — passing these to a
// memoized child must not defeat the memoization.
const setProfile = (next: HealthProfile) => profileStore.write(next);
const patchProfile = (p: Partial<HealthProfile>) => profileStore.write({ ...profileStore.read(), ...p });
const setMeals = (next: LoggedMeal[]) => mealsStore.write(next.slice(-MAX_MEALS));
const addMeal = (meal: LoggedMeal) => mealsStore.write([...mealsStore.read(), meal].slice(-MAX_MEALS));

export function useProfile(): [HealthProfile, typeof setProfile, typeof patchProfile] {
  const profile = useSyncExternalStore(profileStore.subscribe, profileStore.read, profileStore.serverValue);
  return [profile, setProfile, patchProfile];
}

export function useMeals(): [LoggedMeal[], typeof setMeals, typeof addMeal] {
  const meals = useSyncExternalStore(mealsStore.subscribe, mealsStore.read, mealsStore.serverValue);
  return [meals, setMeals, addMeal];
}

const NOOP_SUBSCRIBE = () => () => {};

/**
 * True only after hydration. Uses the store's own server/client snapshot split
 * so components can avoid rendering memory-dependent UI into static HTML —
 * without a setState-in-effect round trip.
 */
export const useHydrated = () => useSyncExternalStore(NOOP_SUBSCRIBE, () => true, () => false);

/** Non-reactive read, for code paths outside React (e.g. building a request body). */
export const readProfile = () => profileStore.read();
