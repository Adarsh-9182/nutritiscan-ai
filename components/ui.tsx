"use client";

// ============================================================
// SURFACE PRIMITIVES
//
// `rounded-[var(--radius)] panel p-5` was hand-written a dozen
// times across three screens, every card title was a bare <p>,
// and the same stat tile existed in three slightly different
// shapes. That is how a product drifts: nothing is wrong in any
// one place, and no two places agree.
//
// These are deliberately thin. They own the shell, the spacing
// rhythm and — importantly — the heading level, so a card cannot
// be added without taking a position on where it sits in the
// document outline.
// ============================================================

import type { ReactNode } from "react";

type Tone = "good" | "warn" | "bad" | "neutral";

export const TONE_COLOR: Record<Tone, string> = {
  good: "var(--emerald)",
  warn: "var(--amber)",
  bad: "var(--rose)",
  neutral: "var(--text-dim)",
};

export function Card({
  children,
  strong = false,
  className = "",
  as: Tag = "section",
  ...rest
}: {
  children: ReactNode;
  /** The focal surface of a screen. One per view — otherwise nothing is focal. */
  strong?: boolean;
  className?: string;
  as?: "section" | "div" | "aside";
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <Tag className={`rounded-[var(--radius)] p-5 ${strong ? "panel-strong" : "panel"} ${className}`} {...rest}>
      {children}
    </Tag>
  );
}

/**
 * A card's title, as an actual heading.
 *
 * `level` is required rather than defaulted: the dashboard had no <h1> and
 * eleven <p> elements styled to look like headings, which left screen-reader
 * users with no document outline at all on the product's main screen.
 */
export function CardTitle({
  children,
  level,
  hint,
  action,
  id,
}: {
  children: ReactNode;
  level: 1 | 2 | 3;
  /** The quiet line under the title. Context, never a second title. */
  hint?: ReactNode;
  /** Controls that belong to this card, kept out of the heading itself. */
  action?: ReactNode;
  id?: string;
}) {
  const H = (level === 1 ? "h1" : level === 2 ? "h2" : "h3") as "h1" | "h2" | "h3";
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <H id={id} className={level === 1 ? "t-hero" : "t-title"}>
          {children}
        </H>
        {hint && <p className="mt-0.5 t-label text-[var(--text-dim)]">{hint}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/** A single readout: label above, value below, optional unit. */
export function Stat({
  label,
  value,
  unit,
  color = "var(--text)",
  className = "",
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  color?: string;
  className?: string;
}) {
  return (
    <div className={`rounded-xl bg-[var(--surface-2)] px-3 py-2.5 ${className}`}>
      <p className="t-label text-[var(--text-dim)]">{label}</p>
      <p className="mt-0.5 t-title tnum" style={{ color }}>
        {value}
        {unit && <span className="ml-1 t-label font-normal text-[var(--text-dim)]">{unit}</span>}
      </p>
    </div>
  );
}

/** The quiet pill used for filters, modes and secondary actions. */
export function Pill({
  children,
  active = false,
  ...rest
}: { children: ReactNode; active?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={`rounded-full border px-2.5 py-1 t-label transition focus-ring ${
        active
          ? "border-[color-mix(in_oklab,var(--emerald)_55%,transparent)] bg-[color-mix(in_oklab,var(--emerald)_14%,transparent)] text-white"
          : "border-[var(--border-strong)] text-[var(--text-dim)] hover:text-white"
      }`}
      {...rest}
    >
      {children}
    </button>
  );
}

/**
 * An empty state that says what to do next.
 *
 * Every "nothing here yet" in the product is a fork in the funnel — the user
 * either learns the next action or leaves. None of them should be a sentence
 * in grey text with no way forward.
 */
export function Empty({ glyph, title, body, action }: { glyph: string; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="grid place-items-center rounded-2xl bg-[var(--surface-2)] px-6 py-10 text-center">
      <div className="max-w-xs">
        <div aria-hidden="true" className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[color-mix(in_oklab,var(--emerald)_16%,transparent)] text-xl">
          {glyph}
        </div>
        <p className="mt-3 t-title">{title}</p>
        <p className="mt-1.5 t-label leading-relaxed text-[var(--text-muted)]">{body}</p>
        {action && <div className="mt-4">{action}</div>}
      </div>
    </div>
  );
}
