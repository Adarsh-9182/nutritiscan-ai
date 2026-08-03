"use client";

// ============================================================
// SCREEN CHROME
//
// One header component for the whole product, so back
// navigation, the title, and the trailing action can never drift
// between screens.
//
// The back button calls `router.back()` when there is history to
// go back to and falls back to an explicit `backHref` otherwise.
// That matters because half these screens are reachable by deep
// link (a lab summary from a notification, a medicine from a
// record) — a bare `router.back()` on a cold entry either does
// nothing or drops the user out of the app entirely.
// ============================================================

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { cn } from "@/lib/cn";
import { ChevronLeft } from "./icons";

export function ScreenHeader({
  title,
  eyebrow,
  backHref,
  trailing,
  sticky = true,
  className,
}: {
  title?: React.ReactNode;
  /** Small label above/instead of the title — "PANEL · 12 JULY". */
  eyebrow?: React.ReactNode;
  backHref?: string;
  trailing?: React.ReactNode;
  sticky?: boolean;
  className?: string;
}) {
  const router = useRouter();

  const goBack = useCallback(() => {
    // `history.length > 1` is the only signal available for "did
    // the user arrive here from somewhere inside the app".
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push(backHref ?? "/");
  }, [router, backHref]);

  return (
    <header
      className={cn(
        "z-30 flex items-center gap-2 px-5 py-3",
        sticky && "blur-bar sticky top-0",
        className,
      )}
      style={sticky ? { paddingTop: "calc(var(--s-3) + var(--safe-t))" } : undefined}
    >
      {backHref !== undefined && (
        <button
          type="button"
          onClick={goBack}
          aria-label="Back"
          className="tap -ml-2 grid size-9 shrink-0 place-items-center rounded-full text-[var(--text-2)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
        >
          <ChevronLeft size={19} />
        </button>
      )}

      <div className="min-w-0 flex-1">
        {eyebrow && <p className="t-label text-[var(--text-3)]">{eyebrow}</p>}
        {title && <h1 className="t-h3 truncate text-[var(--text)]">{title}</h1>}
      </div>

      {trailing}
    </header>
  );
}

/**
 * The scrolling body of a screen.
 *
 * Owns the tab bar's height as bottom padding so no screen has
 * to remember, and caps the reading column at the phone width.
 */
export function ScreenBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <main className={cn("app-scroll px-5", className)}>{children}</main>;
}

/**
 * A footer pinned above the tab bar for a screen's single
 * primary action ("Log this", "Send to Blinkit").
 *
 * Blurred rather than opaque so the content behind stays
 * visible — a solid bar reads as the end of the page and stops
 * people scrolling.
 */
export function ScreenFooter({
  className,
  style,
  children,
}: {
  className?: string;
  /** Callers that sit above the tab bar override `bottom` here. */
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "blur-bar fixed inset-x-0 z-30 mx-auto max-w-[var(--app-max)] border-t border-[var(--border)] px-5 py-3",
        className,
      )}
      style={{ bottom: 0, paddingBottom: "calc(var(--s-3) + var(--safe-b))", ...style }}
    >
      {children}
    </div>
  );
}
