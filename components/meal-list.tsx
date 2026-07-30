"use client";

// ============================================================
// TODAY'S LOG
//
// This list existed twice — once on the dashboard (read-only,
// capped at four, no way to correct a mistake) and once on the
// scanner (removable, uncapped) — in two different markups that
// had already drifted apart. One component, one behaviour.
// ============================================================

import { mealTime, type LoggedMeal } from "@/lib/memory/meals";

export default function MealList({
  meals,
  onRemove,
  limit,
}: {
  /** Already filtered to the day being shown, newest first. */
  meals: LoggedMeal[];
  /** Omit to render read-only. */
  onRemove?: (id: string) => void;
  limit?: number;
}) {
  const shown = limit ? meals.slice(0, limit) : meals;

  return (
    <ul className="space-y-1.5">
      {shown.map((m) => (
        <li key={m.id} className="flex items-center gap-2 rounded-lg bg-[var(--surface-2)] px-3 py-2">
          <span className="min-w-0 flex-1 truncate t-meta text-[var(--text-muted)]">{m.title}</span>
          <span className="shrink-0 t-label tnum text-[var(--text-dim)]">
            {mealTime(m.at)} · {m.kcal} kcal · {m.protein} g P
          </span>
          {onRemove && (
            /*
             * Always visible.
             *
             * This was `opacity-0 group-hover:opacity-100`, which on any touch
             * device meant the only way to correct a mis-scanned meal did not
             * exist — and a wrong meal skews every average and sits on the
             * timeline permanently. It is dimmed rather than hidden: present
             * enough to find, quiet enough not to compete with the meal.
             */
            <button
              type="button"
              onClick={() => onRemove(m.id)}
              aria-label={`Remove ${m.title} from today's log`}
              title="Remove this meal"
              className="-mr-1 grid h-7 w-7 shrink-0 place-items-center rounded-md text-[var(--text-dim)] opacity-60 transition hover:bg-[var(--surface)] hover:text-[var(--rose)] hover:opacity-100 focus-visible:opacity-100 focus-ring"
            >
              <span aria-hidden="true">×</span>
            </button>
          )}
        </li>
      ))}
      {limit && meals.length > limit && (
        <li className="pt-0.5 text-center t-label text-[var(--text-dim)]">
          + {meals.length - limit} more today
        </li>
      )}
    </ul>
  );
}
