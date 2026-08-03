"use client";

// ============================================================
// INTERACTIVE PRIMITIVES
//
// Built on native elements wherever one exists — a checkbox for
// the toggle, a <dialog> for the sheet, a <details> for the
// disclosure. Every one of these is a component people
// habitually rebuild from divs and then bolt ARIA onto; using
// the platform element instead means focus handling, keyboard
// behaviour, and screen-reader semantics are correct by default
// rather than by remembering.
// ============================================================

import { useCallback, useEffect, useId, useRef } from "react";
import { cn } from "@/lib/cn";
import { ChevronDown, CloseIcon } from "./icons";

// ------------------------------------------------------------
// Toggle
// ------------------------------------------------------------

export function Toggle({
  checked,
  onChange,
  label,
  description,
  className,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
  className?: string;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className={cn("flex cursor-pointer items-center gap-4 px-4 py-3.5", className)}>
      <span className="min-w-0 flex-1">
        <span className="t-body block font-[560] text-[var(--text)]">{label}</span>
        {description && <span className="t-meta mt-0.5 block text-[var(--text-3)]">{description}</span>}
      </span>

      {/* A real checkbox, visually replaced. Keyboard, form
          semantics and `aria-checked` come free. */}
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className={cn(
          "relative h-[30px] w-[50px] shrink-0 rounded-[var(--r-full)] transition-colors duration-[var(--dur-2)]",
          "peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--accent)]",
          checked ? "bg-[var(--accent)]" : "bg-[var(--surface-3)]",
        )}
      >
        <span
          className={cn(
            "absolute top-[3px] size-6 rounded-full bg-white shadow-[var(--shadow-1)] transition-[left] duration-[var(--dur-2)] ease-[var(--ease)]",
            checked ? "left-[23px]" : "left-[3px]",
          )}
        />
      </span>
    </label>
  );
}

// ------------------------------------------------------------
// Segmented control
// ------------------------------------------------------------

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn("flex gap-1 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-2)] p-1", className)}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex-1 rounded-[var(--r-sm)] px-3 py-2 text-[13px] transition-colors duration-[var(--dur-1)]",
              selected
                ? "bg-[var(--surface)] font-[590] text-[var(--text)] shadow-[var(--shadow-1)]"
                : "text-[var(--text-3)] hover:text-[var(--text-2)]",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------
// Disclosure
// ------------------------------------------------------------

/**
 * Native <details>. Used for the "everything that's fine"
 * summary on the lab screen — the reassurance is visible, the 36
 * rows behind it are one tap away and not in the way.
 */
export function Disclosure({
  summary,
  children,
  tone = "neutral",
  defaultOpen,
}: {
  summary: React.ReactNode;
  children: React.ReactNode;
  tone?: "neutral" | "steady";
  defaultOpen?: boolean;
}) {
  return (
    <details
      open={defaultOpen}
      className={cn(
        "group overflow-hidden rounded-[var(--r-lg)] border",
        tone === "steady" ? "border-[var(--steady-line)] bg-[var(--steady-soft)]" : "border-[var(--border)] bg-[var(--surface)]",
      )}
    >
      <summary className="flex cursor-pointer list-none items-center gap-3 p-4 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">{summary}</span>
        <ChevronDown
          size={18}
          className={cn(
            "shrink-0 transition-transform duration-[var(--dur-2)] group-open:rotate-180",
            tone === "steady" ? "text-[var(--steady-text)]" : "text-[var(--text-3)]",
          )}
        />
      </summary>
      <div className="border-t border-[var(--border)] px-4 pb-4 pt-3">{children}</div>
    </details>
  );
}

// ------------------------------------------------------------
// Bottom sheet
// ------------------------------------------------------------

/**
 * A native <dialog> presented as a bottom sheet.
 *
 * `showModal()` gives us the focus trap, the inert background,
 * and Escape-to-close for free — three things a div-based sheet
 * almost always gets wrong.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  // The dialog's own close (Escape, or the backdrop click below)
  // must drive React state, or `open` and reality diverge and the
  // sheet can't be reopened.
  const handleClose = useCallback(() => onClose(), [onClose]);

  return (
    <dialog
      ref={ref}
      onClose={handleClose}
      onClick={(e) => {
        // Backdrop clicks land on the dialog element itself.
        if (e.target === ref.current) onClose();
      }}
      aria-labelledby={titleId}
      className={cn(
        "m-0 mt-auto w-full max-w-[var(--app-max)] rounded-t-[var(--r-xl)] border border-[var(--border)] bg-[var(--bg-2)] p-0 text-[var(--text)]",
        "backdrop:bg-black/55 backdrop:backdrop-blur-sm",
        "open:animate-none sm:mx-auto",
      )}
      style={{ marginInline: "auto" }}
    >
      <div className="flex items-center justify-between gap-4 border-b border-[var(--border)] px-5 py-4">
        <h2 id={titleId} className="t-h3">
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="tap grid size-8 place-items-center rounded-full text-[var(--text-3)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
        >
          <CloseIcon size={17} />
        </button>
      </div>
      <div
        className="max-h-[70dvh] overflow-y-auto px-5 py-5"
        style={{ paddingBottom: "calc(var(--s-6) + var(--safe-b))" }}
      >
        {children}
      </div>
    </dialog>
  );
}
