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
import type { UIMessage } from "ai";
import { demoProfile, PROFILE_KEY, type HealthProfile } from "./profile";
import { MEALS_KEY, type LoggedMeal } from "./meals";
import { capTranscript, CHAT_KEY, safeTranscript } from "./transcript";
import {
  ACTIVE_THREAD_KEY,
  capThreads,
  createThread,
  migrateTranscript,
  retitle,
  safeThreads,
  THREADS_KEY,
  type Thread,
} from "./threads";

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
const transcriptStore = createStore<UIMessage[]>(CHAT_KEY, []);

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
export const readMeals = () => mealsStore.read();

/**
 * The chat transcript.
 *
 * Deliberately *not* exposed as a hook: `useChat` owns the live message list
 * and re-rendering the transcript from two sources would fight it. These are
 * the seam — read once at mount, write back when a turn settles.
 */
export const readTranscript = () => safeTranscript(transcriptStore.read());
export const writeTranscript = (messages: UIMessage[]) => transcriptStore.write(capTranscript(messages));
export const clearTranscript = () => transcriptStore.write([]);

// ------------------------------------------------------------
// CONVERSATIONS
//
// The same seam as the transcript above, widened to many threads: the
// live message list still belongs to `useChat`, and these functions are
// where it is read from and written back to. See threads.ts.
// ------------------------------------------------------------

const threadsStore = createStore<Thread[]>(THREADS_KEY, []);

/**
 * The active id lives under its own key rather than as a field on the thread
 * list. Switching conversations then costs one small write instead of
 * rewriting every stored thread, and a failed write cannot lose messages —
 * the worst case is landing back on the previous conversation.
 */
const activeStore = createStore<string | null>(ACTIVE_THREAD_KEY, null);

/**
 * Read the stored conversations, carrying the pre-threads transcript forward
 * on first run.
 *
 * The migration is done on read rather than as a one-shot at boot: this is
 * the first thing any chat surface calls, and a read that has to be preceded
 * by an initialisation call is a rule someone eventually forgets.
 *
 * The result is cached against the value it was derived from, and that is
 * not an optimisation — it is a correctness requirement. This function is a
 * `useSyncExternalStore` snapshot, and `safeThreads` builds a new array on
 * every call; returning a fresh array each time makes React see a changed
 * store on every commit and re-render forever. The underlying store already
 * hands back a stable value until the stored string changes, so identity on
 * that is the right key.
 */
const NOT_LOADED = Symbol("threads-not-loaded");
let cachedSource: unknown = NOT_LOADED;
let cachedThreads: Thread[] = [];

function loadThreads(): Thread[] {
  const raw = threadsStore.read();
  if (raw === cachedSource) return cachedThreads;

  const stored = safeThreads(raw);
  const migrated = migrateTranscript(stored, readTranscript());
  if (migrated !== stored) {
    threadsStore.write(migrated);
    // The legacy key has been copied, not moved — clearing it keeps a second
    // stale copy of a health conversation from sitting in storage forever.
    clearTranscript();
    cachedSource = threadsStore.read();
    cachedThreads = migrated;
    return migrated;
  }

  cachedSource = raw;
  cachedThreads = stored;
  return stored;
}

const writeThreads = (next: Thread[]) => threadsStore.write(capThreads(next));

export const readThreads = loadThreads;

/** The conversation in view, creating the first one if there is none. */
export function readActiveThread(): Thread {
  const threads = loadThreads();
  const id = activeStore.read();
  const found = threads.find((t) => t.id === id);
  if (found) return found;
  // Prefer resuming the most recent conversation over opening an empty one:
  // an id can go stale (deleted in another tab, evicted by the cap) without
  // meaning the user wanted to start over.
  const fallback = threads[0] ?? createThread();
  activeStore.write(fallback.id);
  if (!threads.length) writeThreads([fallback]);
  return fallback;
}

export function useThreads(): Thread[] {
  return useSyncExternalStore(threadsStore.subscribe, loadThreads, threadsStore.serverValue);
}

export function useActiveThreadId(): string | null {
  return useSyncExternalStore(activeStore.subscribe, activeStore.read, activeStore.serverValue);
}

/**
 * Save the live messages into a conversation.
 *
 * A thread that has since been deleted is not resurrected — a save arriving
 * after a delete is a race, not an instruction, and the user's last explicit
 * action should win.
 */
export function saveThread(id: string, messages: UIMessage[]) {
  const threads = loadThreads();
  if (!threads.some((t) => t.id === id)) return;
  writeThreads(
    threads.map((t) => (t.id === id ? retitle({ ...t, messages, updatedAt: Date.now() }) : t)),
  );
}

/**
 * Start a conversation, reusing an empty one if it is already open.
 *
 * Pressing "New" twice should not leave two blank rows in the sidebar, and
 * the second press has no work to do — the user is already looking at an
 * empty conversation.
 */
export function newThread(): Thread {
  const threads = loadThreads();
  const active = threads.find((t) => t.id === activeStore.read());
  if (active && active.messages.length === 0) return active;

  const thread = createThread();
  writeThreads([thread, ...threads]);
  activeStore.write(thread.id);
  return thread;
}

export function selectThread(id: string) {
  if (loadThreads().some((t) => t.id === id)) activeStore.write(id);
}

export function renameThread(id: string, title: string) {
  const clean = title.replace(/\s+/g, " ").trim();
  if (!clean) return;
  writeThreads(loadThreads().map((t) => (t.id === id ? { ...t, title: clean } : t)));
}

/**
 * Delete a conversation. Health conversations are the most sensitive thing
 * stored here, so this removes rather than archives.
 */
export function deleteThread(id: string) {
  const remaining = loadThreads().filter((t) => t.id !== id);
  if (remaining.length) {
    writeThreads(remaining);
    if (activeStore.read() === id) activeStore.write(remaining[0].id);
    return;
  }
  // Never leave the chat with nothing to render: deleting the last
  // conversation starts a fresh one rather than an empty sidebar.
  const fresh = createThread();
  writeThreads([fresh]);
  activeStore.write(fresh.id);
}

/** Everything, gone. Separate from deleteThread because it is a different intent. */
export function deleteAllThreads() {
  const fresh = createThread();
  writeThreads([fresh]);
  activeStore.write(fresh.id);
  clearTranscript();
}
