"use client";

import { useEffect } from "react";

/**
 * Route-level error boundary. Without this, an uncaught render error anywhere
 * in the dashboard or scanner drops the user on Next's default error screen —
 * a stack trace in development, a blank page in production.
 *
 * The copy matters here: this is a health product, and the one thing a user
 * must not conclude from a crash is that their recorded memory is gone.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[nutritiscan] route error", error);
  }, [error]);

  return (
    <main className="bg-aurora grid min-h-[100svh] place-items-center px-6">
      <div className="max-w-md text-center">
        <div aria-hidden="true" className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[color-mix(in_oklab,var(--rose)_16%,transparent)] text-2xl">
          ⚠︎
        </div>
        <h1 className="mt-4 text-xl font-semibold">That screen didn&apos;t load.</h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
          Something broke on our side, not yours. Your Health Memory is stored on this device and is untouched.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button onClick={reset} className="btn-primary rounded-xl px-4 py-2.5 text-sm">
            Try again
          </button>
          {/*
            A deliberate full-document navigation, not a <Link />. We are
            already inside a client-side crash, so the router and React tree
            are the things least worth trusting to get the user out. A hard
            reload rebuilds both.
          */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/" className="btn-ghost rounded-xl px-4 py-2.5 text-sm">
            Back to home
          </a>
        </div>
        {error.digest && <p className="mt-4 text-[11px] text-[var(--text-dim)]">Reference: {error.digest}</p>}
      </div>
    </main>
  );
}
