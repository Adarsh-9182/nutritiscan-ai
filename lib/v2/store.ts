"use client";

// ============================================================
// CLIENT STATE
//
// Built on useSyncExternalStore for the same reason
// lib/memory/store.ts is: no setState-in-effect hydration dance,
// and two screens can never disagree about what is stored.
//
// SENSITIVITY: like the existing memory store, this is health
// data in localStorage — readable by any script on the origin.
// That is acceptable only because this build is single-device
// and account-less. The privacy toggles in Settings describe
// this honestly rather than implying encryption we don't do.
// ============================================================

import { useCallback, useSyncExternalStore } from "react";
import type { ConstraintId } from "./plan";

type Listener = () => void;

/**
 * A localStorage-backed store with a stable snapshot.
 *
 * `read` must return a referentially stable value between
 * renders or useSyncExternalStore loops forever, so the parsed
 * object is cached and rebuilt only when the raw string changes.
 */
function createStore<T>(key: string, fallback: T) {
  const listeners = new Set<Listener>();
  let cachedRaw: string | null = null;
  let cachedValue: T = fallback;
  let primed = false;
  let detach: (() => void) | null = null;

  const emit = () => {
    for (const l of listeners) l();
  };

  const read = (): T => {
    if (typeof window === "undefined") return fallback;
    const raw = localStorage.getItem(key);
    if (!primed || raw !== cachedRaw) {
      cachedRaw = raw;
      primed = true;
      try {
        // Merge over the fallback so a stored object written by an
        // older build doesn't leave newly-added keys undefined.
        const parsed = raw ? JSON.parse(raw) : null;
        cachedValue =
          parsed && typeof parsed === "object" && !Array.isArray(parsed) && typeof fallback === "object" && fallback !== null && !Array.isArray(fallback)
            ? { ...(fallback as object), ...(parsed as object) } as T
            : (parsed as T) ?? fallback;
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
      // Quota exhausted or private mode. Persistence failed, but the
      // session must not silently revert what the user just chose —
      // keep the value in memory and leave cachedRaw pointing at what
      // is actually on disk so `read` won't overwrite it.
      cachedRaw = localStorage.getItem(key);
    }
    cachedValue = value;
    primed = true;
    emit();
  };

  return { subscribe, read, write, server: () => fallback };
}

// ------------------------------------------------------------
// Theme
// ------------------------------------------------------------

export type ThemeChoice = "dark" | "light" | "system";

export const THEME_KEY = "ns2-theme";

const themeStore = createStore<ThemeChoice>(THEME_KEY, "dark");

/** Resolve "system" against the OS preference. */
function resolveTheme(choice: ThemeChoice): "dark" | "light" {
  if (choice !== "system") return choice;
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

/**
 * Stamp the resolved theme on <html>.
 *
 * The attribute — not a class — because globals.css keys its
 * light overrides off `:root[data-theme="light"]`, which must
 * win over the `prefers-color-scheme` default in both
 * directions. A user who set Light on a dark-mode phone gets
 * light, and vice versa.
 */
export function applyTheme(choice: ThemeChoice) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", resolveTheme(choice));
}

export function useTheme(): [ThemeChoice, (t: ThemeChoice) => void] {
  const choice = useSyncExternalStore(themeStore.subscribe, themeStore.read, themeStore.server);
  const set = useCallback((t: ThemeChoice) => {
    themeStore.write(t);
    applyTheme(t);
  }, []);
  return [choice, set];
}

/**
 * Runs before first paint, inlined in <head>.
 *
 * Without this the page renders dark, then flips to light one
 * frame later for every light-mode user — the flash-of-wrong-
 * theme that makes an app feel cheap. Kept as a string because
 * it must execute before React exists.
 */
export const THEME_BOOT_SCRIPT = `(function(){try{
var c=localStorage.getItem(${JSON.stringify(THEME_KEY)});
c=c?JSON.parse(c):"dark";
var r=c==="system"?(matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"):c;
document.documentElement.setAttribute("data-theme",r);
}catch(e){document.documentElement.setAttribute("data-theme","dark");}})();`;

// ------------------------------------------------------------
// Privacy & settings
// ------------------------------------------------------------

export type Settings = {
  /** Files stay on the device; nothing is uploaded to a server we own. */
  keepOnDevice: boolean;
  /** Off by default. Stated as such in the UI, because that is the point. */
  improveAnswers: boolean;
  /** Medicine reminders the user switched on, by medicine id. */
  reminders: Record<string, boolean>;
};

const SETTINGS_KEY = "ns2-settings";

const DEFAULT_SETTINGS: Settings = {
  keepOnDevice: true,
  improveAnswers: false,
  reminders: {},
};

const settingsStore = createStore<Settings>(SETTINGS_KEY, DEFAULT_SETTINGS);

export function useSettings(): [Settings, (patch: Partial<Settings>) => void] {
  const settings = useSyncExternalStore(settingsStore.subscribe, settingsStore.read, settingsStore.server);
  const patch = useCallback((p: Partial<Settings>) => {
    settingsStore.write({ ...settingsStore.read(), ...p });
  }, []);
  return [settings, patch];
}

export function useReminder(medicineId: string): [boolean, (on: boolean) => void] {
  const [settings, patch] = useSettings();
  const on = settings.reminders[medicineId] ?? false;
  const set = useCallback(
    (next: boolean) => patch({ reminders: { ...settingsStore.read().reminders, [medicineId]: next } }),
    [medicineId, patch],
  );
  return [on, set];
}

// ------------------------------------------------------------
// Meal plan constraints
// ------------------------------------------------------------

const PLAN_KEY = "ns2-plan-constraints";

const DEFAULT_CONSTRAINTS: ConstraintId[] = ["iron-up", "ldl-down", "gluten-free", "quick", "protein"];

const constraintStore = createStore<ConstraintId[]>(PLAN_KEY, DEFAULT_CONSTRAINTS);

export function useConstraints(): [Set<ConstraintId>, (id: ConstraintId) => void] {
  const list = useSyncExternalStore(constraintStore.subscribe, constraintStore.read, constraintStore.server);
  const toggle = useCallback((id: ConstraintId) => {
    const current = constraintStore.read();
    constraintStore.write(current.includes(id) ? current.filter((c) => c !== id) : [...current, id]);
  }, []);
  return [new Set(list), toggle];
}

// ------------------------------------------------------------
// Grocery ticks
// ------------------------------------------------------------

const GROCERY_KEY = "ns2-grocery-checked";

const groceryStore = createStore<Record<string, boolean>>(GROCERY_KEY, {});

export function useGroceryChecks(): [Record<string, boolean>, (item: string) => void, () => void] {
  const checked = useSyncExternalStore(groceryStore.subscribe, groceryStore.read, groceryStore.server);
  const toggle = useCallback((item: string) => {
    const current = groceryStore.read();
    groceryStore.write({ ...current, [item]: !current[item] });
  }, []);
  const clear = useCallback(() => groceryStore.write({}), []);
  return [checked, toggle, clear];
}

// ------------------------------------------------------------
// Hydration guard
// ------------------------------------------------------------

const NOOP = () => () => {};

/**
 * True only after hydration.
 *
 * Screens that read localStorage must not render that data into
 * static HTML — the server has no idea what the user stored, and
 * rendering the fallback then swapping is a hydration mismatch.
 */
export const useHydrated = () => useSyncExternalStore(NOOP, () => true, () => false);

/** Wipe everything this app stored. Backs the "Export or delete everything" action. */
export function deleteEverything() {
  if (typeof window === "undefined") return;
  for (const key of [THEME_KEY, SETTINGS_KEY, PLAN_KEY, GROCERY_KEY, "ns-profile-v1", "ns-meals-v1", "ns-chat-v1"]) {
    try {
      localStorage.removeItem(key);
    } catch {
      // Nothing useful to do — the delete button reports success only
      // for what it could actually remove.
    }
  }
}

/** Everything we hold, as a downloadable object. */
export function exportEverything(): Record<string, unknown> {
  if (typeof window === "undefined") return {};
  const out: Record<string, unknown> = {};
  for (const key of [THEME_KEY, SETTINGS_KEY, PLAN_KEY, GROCERY_KEY, "ns-profile-v1", "ns-meals-v1", "ns-chat-v1"]) {
    const raw = localStorage.getItem(key);
    if (raw === null) continue;
    try {
      out[key] = JSON.parse(raw);
    } catch {
      out[key] = raw;
    }
  }
  return out;
}
