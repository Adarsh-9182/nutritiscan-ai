"use client";

// ============================================================
// HEALTH · TRENDS
//
// "The written summary sits above the charts, because a sentence
// beats a sparkline. Only four metrics — anything else is
// available by asking."
//
// Both halves of that matter.
//
// THE SENTENCE FIRST. A sparkline shows a shape; it does not
// tell you what the shape means or which of four shapes to care
// about. Putting the summary above the charts means the user has
// already been told the answer before they start doing pattern
// recognition on their own body — which is work they are not
// equipped for and should not be doing at 7am.
//
// FOUR METRICS, NOT FOURTEEN. Every additional tile costs
// attention and adds a judgement the user has to make about
// themselves. The other ten metrics still exist — they are one
// question away. That is the whole bet of this product: an
// index is worse than an answer.
//
// This screen is also the only place a dashboard-shaped thing is
// allowed to exist at all, and it is deliberately behind a tab
// rather than on the home screen.
// ============================================================

import Link from "next/link";
import { useMemo } from "react";
import { Card, Eyebrow } from "@/components/ds/primitives";
import { LineChart, Sparkline } from "@/components/ds/charts";
import { ArrowRight, CalendarIcon } from "@/components/ds/icons";
import { useHydrated } from "@/lib/v2/store";
import { useMeals } from "@/lib/memory/store";
import { dayTotals } from "@/lib/memory/meals";
import { ENERGY_CURVE, IRON_INTAKE, SLEEP, WEIGHT } from "@/lib/v2/persona";
import { JULY_PANEL, delta, markerById } from "@/lib/v2/labs";
import { cn } from "@/lib/cn";

/** Formats 6.2 hours as "6h 12m". */
function hoursLabel(h: number): string {
  const whole = Math.floor(h);
  return `${whole}h ${String(Math.round((h - whole) * 60)).padStart(2, "0")}m`;
}

export function HealthScreen() {
  const hydrated = useHydrated();
  const [meals] = useMeals();

  const today = useMemo(() => dayTotals(meals), [meals]);

  const sleepNow = SLEEP.points[SLEEP.points.length - 1].v;
  const sleepFirst = SLEEP.points[0].v;
  const sleepDelta = Math.round((sleepNow - sleepFirst) * 60);
  const ironNow = IRON_INTAKE.points[IRON_INTAKE.points.length - 1].v;
  const weightNow = WEIGHT.points[WEIGHT.points.length - 1].v;

  const labRows = ["ferritin", "ldl", "hba1c"]
    .map((id) => markerById(JULY_PANEL, id))
    .filter((m): m is NonNullable<typeof m> => !!m);

  return (
    <main id="main" className="app-scroll px-5">
      <header className="pb-5 pt-[calc(var(--s-6)+var(--safe-t))]">
        <h1 className="t-h1 text-[var(--text)]">Health</h1>
      </header>

      {/* ---- The sentence, above the charts. ---- */}
      <Card tone="accent" className="p-4">
        <Eyebrow tone="accent">Four weeks, in one line</Eyebrow>
        <p className="t-body mt-2 text-[var(--text)]">
          Protein and iron are both up. Sleep is the weak link — {hoursLabel(sleepNow)} average, and the fatigue days
          cluster after the short nights.
        </p>
        <Link
          href={`/ask/new?q=${encodeURIComponent("Why does my fatigue cluster after short nights? What should I change first?")}`}
          className="mt-3 inline-flex items-center gap-1.5 text-[13.5px] font-[590] text-[var(--accent-text)] transition-opacity hover:opacity-80"
        >
          Ask what to change first
          <ArrowRight size={15} />
        </Link>
      </Card>

      {/* ---- Four metrics. Not five. ---- */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <StatTile
          label="Iron intake"
          value={ironNow}
          unit="mg avg"
          delta="+3.7 vs week 1"
          good
          points={IRON_INTAKE.points}
        />
        <StatTile
          label="Sleep"
          value={hoursLabel(sleepNow)}
          delta={`${sleepDelta > 0 ? "+" : ""}${sleepDelta}m vs week 1`}
          good={sleepDelta >= 0}
          points={SLEEP.points}
        />
        <StatTile
          label="Weight"
          value={weightNow}
          unit="kg"
          delta="Steady"
          good
          points={WEIGHT.points}
        />
        <StatTile
          label="Protein today"
          value={hydrated ? today.protein : 0}
          unit="g logged"
          delta={hydrated ? `${today.count} meal${today.count === 1 ? "" : "s"}` : "—"}
          good={today.protein > 0}
        />
      </div>

      {/* ---- The energy curve — self-reported, and labelled so. ---- */}
      <Card className="mt-3 p-4">
        <LineChart
          label={ENERGY_CURVE.label}
          unit={ENERGY_CURVE.unit}
          points={ENERGY_CURVE.points}
          markAt="4pm"
          height={130}
        />
        <p className="t-meta mt-2 text-[var(--text-3)]">
          Self-reported, so treat it as a pattern rather than a measurement.
        </p>
      </Card>

      {/* ---- Lab trends ---- */}
      <section className="mt-7">
        <header className="mb-2 flex items-baseline justify-between">
          <Eyebrow>Lab trends</Eyebrow>
          <Link href={`/labs/${JULY_PANEL.id}`} className="t-meta font-[560] text-[var(--accent-text)]">
            Full panel
          </Link>
        </header>

        <Card className="divide-y divide-[var(--border)]">
          {labRows.map((m) => {
            const move = delta(m);
            const prev = m.history?.[m.history.length - 1];
            return (
              <Link
                key={m.id}
                href={`/labs/${JULY_PANEL.id}/${m.id}`}
                className="flex items-center justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-[var(--surface-2)]"
              >
                <span className="t-body text-[var(--text-2)]">{m.name}</span>
                <span
                  className={cn(
                    "tnum t-meta shrink-0 font-[560]",
                    m.tone === "attention" ? "text-[var(--attention-text)]" : "text-[var(--steady-text)]",
                  )}
                >
                  {prev && move && move.direction !== "flat" ? `${prev.value} → ${m.value}` : `${m.value}`} {m.unit}
                </span>
              </Link>
            );
          })}
        </Card>
      </section>

      {/* ---- The plan lives here, not in a tab. ---- */}
      <Link href="/plan" className="mt-4 block">
        <Card className="flex items-center gap-3 p-4 transition-colors hover:bg-[var(--surface-2)]">
          <span className="grid size-9 shrink-0 place-items-center rounded-[var(--r-sm)] bg-[var(--accent-soft)] text-[var(--accent-text)]">
            <CalendarIcon size={17} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="t-body block font-[560] text-[var(--text)]">This week&apos;s meals</span>
            <span className="t-meta mt-0.5 block text-[var(--text-3)]">Built around your ferritin and LDL</span>
          </span>
          <ArrowRight size={17} className="shrink-0 text-[var(--text-3)]" />
        </Card>
      </Link>

      <p className="t-meta mt-6 text-[var(--text-3)]">
        Anything not shown here is one question away — this page holds the four things worth watching, not everything
        that could be measured.
      </p>
    </main>
  );
}

/**
 * A stat tile: label, value, delta, sparkline.
 *
 * The delta wears a text token rather than the series colour —
 * green/amber text on a small tile is the fastest way to make a
 * calm screen read as a scoreboard. Direction is carried by the
 * words ("+3.7 vs week 1"), which also survives colourblindness.
 */
function StatTile({
  label,
  value,
  unit,
  delta,
  good,
  points,
}: {
  label: string;
  value: number | string;
  unit?: string;
  delta: string;
  good: boolean;
  points?: { t: string; v: number }[];
}) {
  return (
    <Card className="p-3.5">
      <p className="t-label text-[var(--text-3)]">{label}</p>
      <p className="mt-1.5 text-[22px] font-[640] leading-none text-[var(--text)]">
        {value}
        {unit && <span className="t-meta ml-1 font-[500] text-[var(--text-3)]">{unit}</span>}
      </p>
      <p className={cn("t-meta mt-1", good ? "text-[var(--text-2)]" : "text-[var(--attention-text)]")}>{delta}</p>
      {points && (
        <div className="mt-2">
          <Sparkline points={points} height={26} />
        </div>
      )}
    </Card>
  );
}
