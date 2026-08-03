"use client";

// ============================================================
// EMPTY, LOADING & ERROR STATES
//
// These are not edge cases in a health product — they are most
// of the first-run experience and all of the anxious moments.
//
// The rules they encode:
//
// EMPTY says what will appear and how to make it appear. Never
//   "No data" — that tells the user they did something wrong.
//
// LOADING names the step. "Comparing to your March panel" makes
//   a four-second wait feel like work being done; a spinner
//   makes the same four seconds feel like a hang. The lab reader
//   goes further and delivers its REASSURANCE HERE, before any
//   result, because the wait is where dread builds.
//
// ERROR says what happened, whether anything was lost, and what
//   to do — in that order, in plain words, with no red. A failed
//   network call is not a medical emergency and must not borrow
//   the visual language of one.
// ============================================================

import { cn } from "@/lib/cn";
import { AlertIcon, CheckIcon } from "./icons";
import { Button } from "./primitives";

// ------------------------------------------------------------
// Skeleton
// ------------------------------------------------------------

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("ns-skeleton h-4 w-full", className)} aria-hidden="true" />;
}

/** A card-shaped placeholder that matches the real card's geometry. */
export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className="card p-4" aria-hidden="true">
      <Skeleton className="h-3 w-24" />
      <div className="mt-3 space-y-2">
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton key={i} className={i === lines - 1 ? "w-2/3" : "w-full"} />
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// Empty
// ------------------------------------------------------------

export function EmptyState({
  title,
  body,
  action,
  icon,
}: {
  title: string;
  body: string;
  action?: { label: string; onClick?: () => void; href?: string };
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      {icon && (
        <div className="mb-4 grid size-12 place-items-center rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-3)]">
          {icon}
        </div>
      )}
      <p className="t-h3 text-[var(--text)]">{title}</p>
      <p className="t-body t-prose mt-2 text-[var(--text-2)]">{body}</p>
      {action &&
        (action.href ? (
          <a href={action.href} className="mt-5">
            <Button variant="secondary">{action.label}</Button>
          </a>
        ) : (
          <Button variant="secondary" className="mt-5" onClick={action.onClick}>
            {action.label}
          </Button>
        ))}
    </div>
  );
}

// ------------------------------------------------------------
// Error
// ------------------------------------------------------------

export function ErrorState({
  title = "That didn't go through",
  body,
  retry,
  className,
}: {
  title?: string;
  body: string;
  retry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex gap-3 rounded-[var(--r-lg)] border border-[var(--attention-line)] bg-[var(--attention-soft)] p-4",
        className,
      )}
    >
      <AlertIcon size={18} className="mt-0.5 shrink-0 text-[var(--attention-text)]" />
      <div className="min-w-0 flex-1">
        <p className="t-body font-[590] text-[var(--text)]">{title}</p>
        <p className="t-meta mt-1 text-[var(--text-2)]">{body}</p>
        {retry && (
          <Button size="sm" variant="ghost" className="mt-3" onClick={retry}>
            Try again
          </Button>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// Process steps
//
// Used by the lab reader and the scanner. Named steps, ticked as
// they complete, with the active one breathing so a slow step
// never reads as a freeze.
// ------------------------------------------------------------

export type Step = { id: string; label: string; status: "pending" | "active" | "done" };

export function ProcessSteps({ steps, className }: { steps: Step[]; className?: string }) {
  return (
    <ol className={cn("space-y-3", className)} aria-live="polite" aria-atomic="false">
      {steps.map((s) => (
        <li key={s.id} className="flex items-center gap-3">
          <span
            className={cn(
              "grid size-5 shrink-0 place-items-center rounded-full border transition-colors duration-[var(--dur-2)]",
              s.status === "done" && "border-[var(--steady-line)] bg-[var(--steady-soft)] text-[var(--steady-text)]",
              s.status === "active" && "border-[var(--accent-line)] bg-[var(--accent-soft)] text-[var(--accent-text)]",
              s.status === "pending" && "border-[var(--border)] text-transparent",
            )}
          >
            {s.status === "done" ? (
              <CheckIcon size={12} strokeWidth={2.4} />
            ) : s.status === "active" ? (
              <span className="ns-breathe size-1.5 rounded-full bg-[var(--accent)]" />
            ) : null}
          </span>
          <span
            className={cn(
              "t-body transition-colors duration-[var(--dur-2)]",
              s.status === "pending" ? "text-[var(--text-3)]" : "text-[var(--text)]",
              s.status === "active" && "font-[560]",
            )}
          >
            {s.label}
          </span>
          {/* Screen readers get the state as words, not as a colour. */}
          <span className="sr-only">{s.status === "done" ? "complete" : s.status === "active" ? "in progress" : "waiting"}</span>
        </li>
      ))}
    </ol>
  );
}

/** Advance a step list immutably. Shared by the scanner and the lab reader. */
export function advanceSteps(steps: Step[], activeId: string): Step[] {
  const idx = steps.findIndex((s) => s.id === activeId);
  return steps.map((s, i) => ({ ...s, status: i < idx ? "done" : i === idx ? "active" : "pending" }));
}

export const completeSteps = (steps: Step[]): Step[] => steps.map((s) => ({ ...s, status: "done" }));

// ------------------------------------------------------------
// Thinking
// ------------------------------------------------------------

/** Three dots, shown only before the first token of an answer lands. */
export function ThinkingDots({ label = "Thinking" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5" role="status" aria-label={label}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="ns-dot size-1.5 rounded-full bg-[var(--accent)]"
          style={{ animationDelay: `${i * 160}ms` }}
        />
      ))}
    </span>
  );
}

/**
 * A status pill that narrates what the system is doing.
 *
 * The scanner's "Reading the label" and the chat's "Consulting
 * your labs" both use it. Live region so the narration reaches a
 * screen reader too.
 */
export function StatusPill({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      role="status"
      className={cn(
        "inline-flex items-center gap-2 rounded-[var(--r-full)] border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1.5 text-[12.5px] text-[var(--text-2)]",
        className,
      )}
    >
      <span className="ns-breathe size-1.5 rounded-full bg-[var(--accent)]" />
      {children}
    </span>
  );
}
