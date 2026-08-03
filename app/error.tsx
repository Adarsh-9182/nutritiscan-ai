"use client";

import { useEffect } from "react";

/**
 * Route-level error boundary.
 *
 * The copy is the point. This is a health product, and a person
 * who sees a crash has exactly one urgent question: IS MY DATA
 * GONE? So that is the second sentence, before anything about
 * retrying.
 *
 * And no red. A failed render is not a medical event, and
 * borrowing the visual language of one — the reflex for every
 * error screen ever built — would break the promise the rest of
 * the product makes.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[nutritiscan] route error", error);
  }, [error]);

  return (
    <main className="grid min-h-dvh place-items-center px-6">
      <div className="max-w-[34ch] text-center">
        <div
          aria-hidden="true"
          className="mx-auto grid size-12 place-items-center rounded-[var(--r-md)] border border-[var(--attention-line)] bg-[var(--attention-soft)] text-[var(--attention-text)]"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <circle cx="12" cy="12" r="8.6" />
            <path d="M12 7.8v4.6M12 16.1h.01" />
          </svg>
        </div>

        <h1 className="t-h2 mt-5 text-[var(--text)]">That screen didn&apos;t load.</h1>
        <p className="t-body mt-2 text-[var(--text-2)]">
          Something broke on our side, not yours. Everything you&apos;ve recorded is stored on this device and is
          untouched.
        </p>

        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={reset}
            className="h-11 rounded-[var(--r-md)] bg-[var(--accent)] px-4 text-[14px] font-[590] text-[var(--accent-ink)]"
          >
            Try again
          </button>
          {/*
            A deliberate full-document navigation, not a <Link />.
            We are already inside a client-side crash, so the router
            and the React tree are the two things least worth
            trusting to get the user out. A hard reload rebuilds both.
          */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/"
            className="grid h-11 place-items-center rounded-[var(--r-md)] border border-[var(--border-strong)] bg-[var(--surface-2)] px-4 text-[14px] font-[590] text-[var(--text)]"
          >
            Back to Ask
          </a>
        </div>

        {error.digest && <p className="t-meta mt-5 text-[var(--text-3)]">Reference: {error.digest}</p>}
      </div>
    </main>
  );
}
