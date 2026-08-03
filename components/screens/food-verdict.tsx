"use client";

// ============================================================
// FOOD VERDICT
//
// "Sentence first. Evidence second. Numbers last."
//
// This screen is where that principle is either honoured or
// quietly abandoned, because a plate of food produces a lot of
// numbers and they are very easy to lead with.
//
// The order on screen is therefore fixed and non-negotiable:
//
//   1. A SENTENCE that answers "should I eat this?"
//   2. WHY, FOR YOU — every reason tied to this user's own labs
//      or restrictions. This is the part that makes it feel
//      understood rather than generic; a reason that would be
//      true for any human is not worth the line.
//   3. THE NUMBERS, small, at the bottom, for the people who
//      want them.
//
// The score ring is second, not first, and it is small. A big
// number at the top turns a meal into a grade, and grading
// people's dinner is how a nutrition app becomes something they
// feel judged by and stop opening.
// ============================================================

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ScoreRing } from "@/components/ds/charts";
import { Button, Card, Eyebrow } from "@/components/ds/primitives";
import { ScreenFooter } from "@/components/ds/screen";
import { CheckIcon, PlusIcon } from "@/components/ds/icons";
import type { Flag, ScanResult } from "@/lib/nutrition/analyze";
import { addMealFromScan } from "@/lib/v2/log";
import { cn } from "@/lib/cn";

/**
 * Flag tone → visual tone.
 *
 * `bad` maps to attention (amber), NOT to a danger colour. A
 * low-protein lunch is worth mentioning; it is not an alarm, and
 * the palette has no red to reach for even if someone wanted one.
 */
const DOT: Record<Flag["tone"], string> = {
  good: "bg-[var(--steady)]",
  warn: "bg-[var(--attention)]",
  bad: "bg-[var(--attention)]",
};

export function FoodVerdict({
  result,
  preview,
  onRescan,
}: {
  result: ScanResult;
  preview?: string | null;
  onRescan: () => void;
}) {
  const router = useRouter();
  const [logged, setLogged] = useState(false);

  const { totals } = result;
  const shortBy = Math.max(0, Math.round(result.proteinTargetPerMeal - totals.protein));

  const numbers = [
    { label: "kcal", value: totals.kcal, unit: "" },
    { label: "Protein", value: totals.protein, unit: "g" },
    { label: "Fibre", value: totals.fiber, unit: "g" },
    { label: "Iron", value: totals.iron, unit: "mg", accent: totals.iron >= 3 },
  ];

  function log() {
    addMealFromScan(result);
    setLogged(true);
    // Let the tick register before leaving — an instant navigation
    // makes a confirmed action feel like it didn't happen.
    setTimeout(() => router.push("/health"), 650);
  }

  return (
    <>
      <main id="main" className="app-scroll" style={{ paddingBottom: "calc(var(--tabbar-h) + var(--safe-b) + 96px)" }}>
        {/* The photo, cropped short. It confirms what was read;
            it is not the content. */}
        <div className="relative h-44 w-full overflow-hidden bg-[var(--surface-2)]">
          {preview ? (
            // The blob URL has no intrinsic dimensions Next can
            // check, so this is a plain <img> by necessity.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="" className="size-full object-cover" />
          ) : (
            <div className="size-full bg-gradient-to-b from-[var(--surface-3)] to-[var(--surface)]" />
          )}
          <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[var(--bg)] to-transparent" />
          <button
            type="button"
            onClick={onRescan}
            className="absolute left-5 top-[calc(var(--s-4)+var(--safe-t))] rounded-[var(--r-full)] bg-black/45 px-3 py-1.5 text-[12.5px] font-[560] text-white backdrop-blur"
          >
            Rescan
          </button>
        </div>

        <div className="px-5">
          {/* 1 — THE SENTENCE */}
          <p className="t-meta mt-4 text-[var(--text-3)]">{result.title}</p>
          <div className="mt-1.5 flex items-start justify-between gap-4">
            <h1 className="t-h1 flex-1 text-[var(--text)]">{result.headline}</h1>
            <ScoreRing score={result.fitScore} label="How well this meal fits your goals" />
          </div>

          {result.note && (
            <p className="t-meta mt-3 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-2)] p-3 text-[var(--text-3)]">
              {result.note}
            </p>
          )}

          {/* 2 — WHY, FOR YOU */}
          <Card className="mt-5 p-4">
            <Eyebrow>Why, for you</Eyebrow>
            <ul className="mt-3 space-y-2.5">
              {result.flags.slice(0, 4).map((f) => (
                <li key={f.text} className="flex gap-2.5">
                  <span className={cn("mt-[7px] size-1.5 shrink-0 rounded-full", DOT[f.tone])} />
                  <span className="t-body text-[var(--text-2)]">{f.text}</span>
                </li>
              ))}
            </ul>
          </Card>

          {/* 3 — THE NUMBERS, last and small */}
          <div className="mt-3 grid grid-cols-4 gap-2">
            {numbers.map((n) => (
              <div
                key={n.label}
                className={cn(
                  "rounded-[var(--r-md)] border p-2.5",
                  n.accent ? "border-[var(--accent-line)] bg-[var(--accent-soft)]" : "border-[var(--border)] bg-[var(--surface)]",
                )}
              >
                <p className="t-label text-[var(--text-3)]">{n.label}</p>
                <p className={cn("tnum mt-1 text-[17px] font-[620]", n.accent ? "text-[var(--accent-text)]" : "text-[var(--text)]")}>
                  {n.value}
                  <span className="text-[12px] font-[500]">{n.unit}</span>
                </p>
              </div>
            ))}
          </div>

          {/* The one suggested addition. Exactly one — a list of
              five swaps is a menu the user has to evaluate, which
              is the work the app was supposed to do. */}
          {result.swaps[0] && (
            <Card tone="attention" className="mt-3 flex items-center gap-3 p-3.5">
              <span className="grid size-9 shrink-0 place-items-center rounded-[var(--r-sm)] bg-[var(--attention-soft)] text-[var(--attention-text)]">
                <PlusIcon size={16} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="t-body block font-[560] text-[var(--text)]">{result.swaps[0].to}</span>
                <span className="t-meta mt-0.5 block text-[var(--text-2)]">
                  {result.swaps[0].why}
                  {shortBy > 0 && ` · closes today's ${shortBy} g gap`}
                </span>
              </span>
            </Card>
          )}

          {/* What was actually on the plate, for anyone checking
              the recognition rather than the verdict. */}
          <section className="mt-6">
            <Eyebrow>What I saw</Eyebrow>
            <ul className="mt-2 divide-y divide-[var(--border)]">
              {result.items.map((item) => (
                <li key={item.name} className="flex items-baseline justify-between gap-3 py-2.5">
                  <span className="t-body text-[var(--text-2)]">
                    {item.name}
                    {!item.matched && (
                      // The database didn't know this food, so its
                      // macros are a generic estimate. Saying so is
                      // the difference between a number and a claim.
                      <span className="t-meta ml-2 text-[var(--text-3)]">est.</span>
                    )}
                  </span>
                  <span className="tnum t-meta shrink-0 text-[var(--text-3)]">{item.grams} g</span>
                </li>
              ))}
            </ul>
          </section>

          <p className="t-meta mt-6 text-[var(--text-3)]">
            Nutrition figures come from a food database, not from the photo. Portion sizes are an estimate.
          </p>
        </div>
      </main>

      <ScreenFooter style={{ bottom: "calc(var(--tabbar-h) + var(--safe-b))" }} className="flex gap-2">
        <Button variant="primary" full onClick={log} disabled={logged}>
          {logged ? (
            <>
              <CheckIcon size={17} strokeWidth={2.2} /> Logged
            </>
          ) : (
            "Log this"
          )}
        </Button>
        <Button
          variant="secondary"
          className="shrink-0 px-5"
          onClick={() => router.push(`/ask/new?q=${encodeURIComponent(`About the ${result.title} I just scanned — `)}`)}
        >
          Ask
        </Button>
      </ScreenFooter>
    </>
  );
}
