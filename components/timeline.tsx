"use client";

import Link from "next/link";
import { useState } from "react";
import { motion } from "motion/react";
import Nav from "@/components/nav";
import Onboarding from "@/components/onboarding";
import { useHydrated, useMeals, useProfile } from "@/lib/memory/store";
import { buildTimeline, groupTimeline, KIND_META, timeAgo, type TimelineKind } from "@/lib/health/timeline";
import { buildInsights, CERTAINTY_COLOR, type Insight } from "@/lib/health/insights";

const TONE_COLOR = { good: "var(--emerald)", warn: "var(--amber)", bad: "var(--rose)", neutral: "var(--text-dim)" } as const;

const FILTERS: { id: TimelineKind | "all"; label: string }[] = [
  { id: "all", label: "Everything" },
  { id: "lab", label: "Labs" },
  { id: "meal", label: "Meals" },
  { id: "body", label: "Body" },
  { id: "milestone", label: "Milestones" },
];

/* ---------- an insight, with its reasoning exposed ---------- */

function InsightCard({ insight, index }: { insight: Insight; index: number }) {
  const [open, setOpen] = useState(false);
  const color = TONE_COLOR[insight.tone];
  const certColor = CERTAINTY_COLOR[insight.certainty];

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.06 }} className="rounded-2xl bg-[var(--surface-2)] p-4">
      <div className="flex items-start gap-3">
        <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
        <div className="min-w-0 flex-1">
          <p className="text-sm leading-relaxed">{insight.claim}</p>

          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <span className="rounded-full px-2 py-0.5 t-label font-medium capitalize" style={{ background: `color-mix(in oklab, ${certColor} 18%, transparent)`, color: certColor }}>
              {insight.certainty}
            </span>
            <span className="rounded-full border border-[var(--border)] px-2 py-0.5 t-label text-[var(--text-dim)]">{insight.confidence}% confidence</span>
            {insight.seeClinician && (
              <span className="rounded-full px-2 py-0.5 t-label" style={{ background: "color-mix(in oklab, var(--rose) 16%, transparent)", color: "var(--rose)" }}>
                worth asking a clinician
              </span>
            )}
          </div>

          {insight.action && <p className="mt-2.5 rounded-lg bg-[var(--surface)] px-3 py-2 text-xs text-[var(--text-muted)]">→ {insight.action}</p>}

          <button
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="mt-2.5 t-label text-[var(--text-dim)] underline-offset-2 transition hover:text-white hover:underline focus-ring"
          >
            {open ? "Hide the reasoning" : `Why I think this (${insight.evidence.length} data point${insight.evidence.length === 1 ? "" : "s"})`}
          </button>

          {open && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="overflow-hidden">
              <div className="mt-2.5 space-y-2.5 rounded-xl bg-[var(--surface)] p-3">
                <div>
                  <p className="t-label font-medium uppercase tracking-wide text-[var(--text-dim)]">Evidence</p>
                  <ul className="mt-1 space-y-1">
                    {insight.evidence.map((e, i) => (
                      <li key={i} className="flex gap-2 t-label leading-relaxed text-[var(--text-muted)]">
                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[var(--emerald)]" />
                        {e}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="t-label font-medium uppercase tracking-wide text-[var(--text-dim)]">What would change my mind</p>
                  <ul className="mt-1 space-y-1">
                    {insight.limitations.map((l, i) => (
                      <li key={i} className="flex gap-2 t-label leading-relaxed text-[var(--text-muted)]">
                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[var(--amber)]" />
                        {l}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

/* ---------- the page ---------- */

export default function Timeline() {
  const [profile] = useProfile();
  const [meals] = useMeals();
  const hydrated = useHydrated();
  const [filter, setFilter] = useState<TimelineKind | "all">("all");

  const all = buildTimeline(profile, meals);
  const events = filter === "all" ? all : all.filter((e) => e.kind === filter);
  const groups = groupTimeline(events);
  const insights = buildInsights(profile, meals);

  // aurora lives on <body>; see the note in scan.tsx
  return (
    <div className="min-h-[100svh] px-4 py-4 sm:px-6">
      <Onboarding />
      <Nav width="max-w-6xl" status={{ tone: "good", label: `${all.length} events remembered` }} />

      <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-12">
        {/* LEFT — the story */}
        <div className="lg:col-span-7">
          <div className="rounded-[var(--radius)] glass p-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-lg font-semibold">Your health story</h1>
                <p className="t-label text-[var(--text-dim)]">everything the AI remembers, in order</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {FILTERS.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setFilter(f.id)}
                    aria-pressed={filter === f.id}
                    className={`rounded-full border px-2.5 py-1 t-label transition focus-ring ${
                      filter === f.id ? "border-[color-mix(in_oklab,var(--emerald)_55%,transparent)] bg-[color-mix(in_oklab,var(--emerald)_14%,transparent)] text-white" : "border-[var(--border-strong)] text-[var(--text-dim)] hover:text-white"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {!hydrated ? (
              <div className="mt-5 space-y-2" aria-hidden>
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="shimmer h-14 rounded-xl" />
                ))}
              </div>
            ) : events.length === 0 ? (
              <div className="mt-6 grid place-items-center rounded-2xl bg-[var(--surface-2)] px-6 py-12 text-center">
                <div className="max-w-xs">
                  <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[color-mix(in_oklab,var(--emerald)_16%,transparent)] text-xl">✦</div>
                  <p className="mt-3 text-sm font-medium">{filter === "all" ? "Your story starts here." : "Nothing of that kind yet."}</p>
                  <p className="mt-1.5 t-label leading-relaxed text-[var(--text-muted)]">
                    {filter === "all" ? "Scan a meal or add a lab report and it lands here — permanently, and in order." : "Try another filter, or add this kind of record."}
                  </p>
                  {filter === "all" && (
                    <Link href="/scan" className="btn-primary mt-4 inline-block rounded-xl px-4 py-2 text-xs">
                      Scan your first meal
                    </Link>
                  )}
                </div>
              </div>
            ) : (
              <div className="mt-5">
                {groups.map((g, gi) => (
                  <div key={g.label} className="mb-5 last:mb-0">
                    <p className="mb-2 t-label font-medium uppercase tracking-wide text-[var(--text-dim)]">{g.label}</p>
                    <div className="relative space-y-2 border-l border-[var(--border)] pl-4">
                      {g.events.map((e, i) => {
                        const meta = KIND_META[e.kind];
                        const tone = TONE_COLOR[e.tone];
                        return (
                          <motion.div
                            key={e.id}
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: Math.min(0.4, (gi * 4 + i) * 0.035) }}
                            className="relative rounded-xl bg-[var(--surface-2)] px-3.5 py-2.5"
                          >
                            <span className="absolute -left-[21px] top-4 h-2.5 w-2.5 rounded-full border-2 border-[var(--bg)]" style={{ background: tone }} />
                            <div className="flex items-start gap-2.5">
                              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-sm" style={{ background: `${meta.color}22` }}>
                                {meta.glyph}
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-baseline justify-between gap-2">
                                  <p className="truncate text-sm">{e.title}</p>
                                  <span className="shrink-0 t-label text-[var(--text-dim)]">{timeAgo(e.at)}</span>
                                </div>
                                {e.detail && <p className="mt-0.5 t-label leading-relaxed text-[var(--text-muted)]">{e.detail}</p>}
                              </div>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT — what it means */}
        <div className="lg:col-span-5">
          <div className="rounded-[var(--radius)] glass-strong p-5">
            <h2 className="text-lg font-semibold">What your history says</h2>
            <p className="t-label leading-relaxed text-[var(--text-dim)]">
              Every claim carries its confidence and the data behind it. Where there isn&apos;t enough evidence, it says so instead of guessing.
            </p>

            <div className="mt-4 space-y-2.5">
              {!hydrated ? (
                [0, 1, 2].map((i) => <div key={i} className="shimmer h-24 rounded-2xl" aria-hidden />)
              ) : (
                insights.map((ins, i) => <InsightCard key={ins.id} insight={ins} index={i} />)
              )}
            </div>

            <p className="mt-4 text-center t-label leading-relaxed text-[var(--text-dim)]">
              Educational analysis of your own records · not a diagnosis · discuss anything flagged with a clinician
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
