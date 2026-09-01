"use client";

// ============================================================
// THE CLOCK, AS AN EXTERNAL VALUE
//
// "Today" is a fact about the clock, not about props or state.
// Reading Date.now() during render makes what the interface says
// depend on when React happened to re-render, and the lint config
// rejects it for exactly that reason.
//
// useSyncExternalStore is the seam React provides: the snapshot is
// stable for a whole day, and the subscription is a timer that
// fires at midnight — so a tab left open overnight relabels itself
// instead of insisting yesterday is still today.
//
// The server snapshot is 0, because the server does not know the
// reader's timezone. Every caller must render something sensible
// for 0 rather than assuming a date is available.
// ============================================================

import { useSyncExternalStore } from "react";

export const DAY_MS = 86_400_000;

export const startOfDay = (ms: number) => new Date(ms).setHours(0, 0, 0, 0);

function subscribeToMidnight(onChange: () => void) {
  let timer: ReturnType<typeof setTimeout>;
  const schedule = () => {
    const now = Date.now();
    timer = setTimeout(
      () => {
        onChange();
        schedule();
      },
      // A second past the boundary, so a timer that fires marginally early
      // does not re-read the clock while it is still yesterday.
      startOfDay(now) + DAY_MS - now + 1000,
    );
  };
  schedule();
  return () => clearTimeout(timer);
}

/** Midnight this morning, in the reader's timezone. 0 before hydration. */
export const useStartOfToday = () =>
  useSyncExternalStore(subscribeToMidnight, () => startOfDay(Date.now()), () => 0);

/** "Monday, 1 September" — or an empty string before the date is known. */
export function formatDay(startOfToday: number, locale?: string): string {
  if (!startOfToday) return "";
  return new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long" }).format(startOfToday);
}
