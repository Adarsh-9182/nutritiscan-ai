"use client";

// ============================================================
// UPLOAD · LOADING STATE
//
// "The wait is where dread builds, so the reassurance is
// delivered here — before any result."
//
// That single line reverses the normal order of a loading
// screen. Almost every product treats the wait as dead time to
// be disguised with a spinner. For a blood report it is the
// opposite: this is the most emotionally loaded ten seconds in
// the entire product, and it is the only moment where the user
// is guaranteed to be reading the screen.
//
// So this screen does three things a spinner cannot:
//
// 1. IT SAYS THE REASSURING THING FIRST — "Nothing here is an
//    emergency" — before any number exists. Waiting until the
//    results are ready to say that means ten seconds of silence
//    that the user fills with the worst case.
//
// 2. IT NAMES THE STEPS. "Comparing to your March panel" makes
//    the delay legible as work. It also quietly teaches what the
//    product does — the user learns it keeps their history
//    without being told.
//
// 3. IT STATES WHERE THE FILE WENT. On a screen about the most
//    sensitive document a person owns, "processed on your
//    device" belongs next to the progress bar, not buried in a
//    settings page.
// ============================================================

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LockIcon } from "@/components/ds/icons";
import { ProcessSteps, type Step } from "@/components/ds/states";
import { JULY_PANEL } from "@/lib/v2/labs";

const STEPS: Step[] = [
  { id: "pages", label: `${JULY_PANEL.pages} pages read`, status: "pending" },
  { id: "markers", label: `${JULY_PANEL.markers.length} markers matched`, status: "pending" },
  { id: "compare", label: "Comparing to your March panel", status: "pending" },
  { id: "write", label: "Writing your summary", status: "pending" },
];

/**
 * Per-step dwell times.
 *
 * Deliberately uneven. A progress sequence with identical
 * intervals reads as a scripted animation — which is exactly
 * what a fake one is — while uneven timings read as real work of
 * differing cost. Comparing panels genuinely is the slow step.
 */
const DWELL = [900, 1200, 1600, 1100];

export function LabReadingScreen() {
  const router = useRouter();
  const [steps, setSteps] = useState<Step[]>(STEPS);
  const [progress, setProgress] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    let elapsed = 0;

    STEPS.forEach((_, i) => {
      timers.current.push(
        setTimeout(() => {
          setSteps((prev) => prev.map((s, j) => ({ ...s, status: j < i ? "done" : j === i ? "active" : "pending" })));
          setProgress((i + 1) / (STEPS.length + 1));
        }, elapsed),
      );
      elapsed += DWELL[i];
    });

    timers.current.push(
      setTimeout(() => {
        setSteps((prev) => prev.map((s) => ({ ...s, status: "done" })));
        setProgress(1);
      }, elapsed),
    );

    timers.current.push(
      setTimeout(() => {
        // `replace`, not `push` — a user who taps back from the
        // summary should return to where they started the upload,
        // not watch the loading screen run again.
        router.replace(`/labs/${JULY_PANEL.id}`);
      }, elapsed + 500),
    );

    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, [router]);

  return (
    <main id="main" className="flex min-h-dvh flex-col px-5 pt-[calc(var(--s-9)+var(--safe-t))]">
      {/* The reassurance, before any result exists. */}
      <h1 className="t-h1 text-[var(--text)]">Reading your panel.</h1>
      <p className="t-body t-prose mt-3 text-[var(--text-2)]">
        Nothing here is an emergency. We&apos;ll show what&apos;s steady first, then the few things worth a
        conversation.
      </p>

      <div
        className="mt-7 h-1.5 w-full overflow-hidden rounded-[var(--r-full)] bg-[var(--surface-2)]"
        role="progressbar"
        aria-valuenow={Math.round(progress * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Reading your panel"
      >
        <div
          className="h-full rounded-[var(--r-full)] bg-[var(--accent)] transition-[width] duration-[var(--dur-4)] ease-[var(--ease-out)]"
          style={{ width: `${progress * 100}%` }}
        />
      </div>

      <ProcessSteps steps={steps} className="mt-7" />

      <div className="flex-1" />

      <p className="t-meta mb-[calc(var(--s-9)+var(--safe-b))] flex gap-2 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)] p-3.5 text-[var(--text-3)]">
        <LockIcon size={14} className="mt-0.5 shrink-0" />
        <span>Processed on your device. The file never leaves it unless you choose to share.</span>
      </p>
    </main>
  );
}
