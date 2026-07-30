"use client";

import Link from "next/link";
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import Chat from "@/components/chat";
import Ring from "@/components/ring";
import Nav from "@/components/nav";
import Onboarding from "@/components/onboarding";
import MealList from "@/components/meal-list";
import { Card, CardTitle, Empty, Stat } from "@/components/ui";
import { AGENTS } from "@/lib/agents-meta";
import { bmi, blankProfile, healthScore, heightImperial, insight, isDemoMemory } from "@/lib/memory/profile";
import { mergeBiomarkers, parseLabReport } from "@/lib/memory/labs";
import { journalEntry } from "@/lib/memory/journal";
import { dayTotals, mealsOn } from "@/lib/memory/meals";
import { useMeals, useProfile } from "@/lib/memory/store";
import { proteinTarget } from "@/lib/nutrition/analyze";

function Stepper({ label, value, unit, onDec, onInc, color }: { label: string; value: string; unit: string; onDec: () => void; onInc: () => void; color: string }) {
  return (
    <div className="rounded-xl bg-[var(--surface-2)] px-3 py-2.5">
      <p className="t-label text-[var(--text-dim)]">{label}</p>
      <div className="mt-1 flex items-center justify-between">
        <p className="t-title tnum" style={{ color }}>
          {value}
          <span className="ml-1 t-label font-normal text-[var(--text-dim)]">{unit}</span>
        </p>
        <div className="flex items-center gap-1">
          {/*
            Icon-only controls need their own name — a screen reader
            otherwise announces five identical "minus" buttons with no
            indication of which value each one changes.
          */}
          <button type="button" onClick={onDec} aria-label={`Decrease ${label}`} className="grid h-7 w-7 place-items-center rounded-md bg-[var(--surface)] text-sm hover:bg-[var(--border)] focus-ring">
            <span aria-hidden="true">−</span>
          </button>
          <button type="button" onClick={onInc} aria-label={`Increase ${label}`} className="grid h-7 w-7 place-items-center rounded-md bg-[var(--surface)] text-sm hover:bg-[var(--border)] focus-ring">
            <span aria-hidden="true">+</span>
          </button>
        </div>
      </div>
    </div>
  );
}

/** A macro against no target — the number and its share of the day's energy. */
function MacroChip({ label, grams, color }: { label: string; grams: number; color: string }) {
  return (
    <div className="rounded-lg bg-[var(--surface-2)] px-2.5 py-2 text-center">
      <p className="t-label text-[var(--text-dim)]">{label}</p>
      <p className="mt-0.5 t-meta font-medium tnum" style={{ color }}>
        {grams} g
      </p>
    </div>
  );
}

export default function Dashboard() {
  // Memory is read from the shared store, so edits here show up on the
  // scanner and the timeline immediately — and survive a refresh.
  const [profile, setProfile, patch] = useProfile();
  const [meals, setMeals] = useMeals();
  const [showReport, setShowReport] = useState(false);
  const [showWorking, setShowWorking] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [reportText, setReportText] = useState("");
  const [reportMsg, setReportMsg] = useState<string | null>(null);

  const addReport = () => {
    const found = parseLabReport(reportText);
    if (!found.length) {
      setReportMsg('No known markers found. Try lines like "B12 180" or "Vitamin D 34".');
      return;
    }
    // Each marker becomes a dated event as well as a current value, so the
    // timeline can show how it moved rather than only where it landed.
    const entries = found.map((b) =>
      journalEntry({
        kind: "lab",
        title: `${b.name} recorded at ${b.value}`,
        detail: b.note,
        tone: b.status === "normal" ? "good" : b.status === "borderline" ? "warn" : "bad",
        metric: { name: b.name, value: parseFloat(b.value), unit: b.value.replace(/^[\d.]+\s*/, "") },
      }),
    );
    patch({
      biomarkers: mergeBiomarkers(profile.biomarkers, found),
      journal: [...(profile.journal ?? []), ...entries],
    });
    setReportMsg(`Added ${found.length} marker${found.length > 1 ? "s" : ""} to your memory ✓`);
    setReportText("");
    setShowReport(false);
  };

  /**
   * Clearing the memory wipes every lab value, every journal entry and the
   * whole meal history — irreversibly, from a 24px icon button. It now takes
   * two deliberate clicks, and it clears to an *empty* memory rather than
   * re-seeding somebody else's demo labs.
   */
  const resetMemory = () => {
    setProfile({ ...blankProfile, name: profile.name, onboarded: true });
    setMeals([]);
    setConfirmReset(false);
    setReportMsg("Memory cleared. Nothing is recorded.");
  };

  const { score, factors } = healthScore(profile);
  const b = bmi(profile);
  const target = proteinTarget(profile);
  const today = dayTotals(meals);
  const todayMeals = mealsOn(meals).slice().reverse();
  const demo = isDemoMemory(profile);
  const trends = profile.trends ?? [];

  return (
    <div className="min-h-[100svh] px-4 py-4 sm:px-6">
      <a href="#dashboard-chat" className="sr-only skip-link">
        Skip to your health companion
      </a>
      <Onboarding />
      <Nav status={{ tone: "good", label: "memory synced" }} />

      {/* The page needs a name of its own. Promoting the first card to <h1>
          would tell a screen reader this page is "Health Score", which is one
          card of six. The design has no title bar, so the heading is real but
          not drawn. */}
      <h1 className="sr-only">Your health dashboard</h1>

      <main className="mx-auto grid max-w-7xl gap-4 lg:grid-cols-12">
        {/* LEFT — score + memory */}
        <div className="space-y-4 lg:col-span-3">
          <Card>
            <CardTitle level={2} hint="a calm daily read — not a diagnosis">
              Health Score
            </CardTitle>
            <div className="mt-4 grid place-items-center">
              <Ring
                value={score}
                label={String(score)}
                sub="/ 100"
                ariaLabel={`Health score ${score} out of 100, a composite of your sleep, training, BMI and recorded labs.`}
              />
            </div>

            {/*
              The score is the largest type on the page and used to arrive with
              no stated basis — in a product whose differentiator is refusing to
              assert more than the evidence supports. If we show a number, we
              show our working.
            */}
            <button
              type="button"
              onClick={() => setShowWorking((s) => !s)}
              aria-expanded={showWorking}
              className="mt-3 w-full rounded-lg py-1 t-label text-[var(--text-dim)] underline-offset-2 transition hover:text-white hover:underline focus-ring"
            >
              {showWorking ? "Hide how this is calculated" : "How is this calculated?"}
            </button>
            <AnimatePresence>
              {showWorking && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                  <ul className="mt-1 space-y-1 rounded-xl bg-[var(--surface-2)] p-3">
                    {factors.map((f) => (
                      <li key={f.label} className="flex items-baseline justify-between gap-2 t-label">
                        <span className="min-w-0 text-[var(--text-muted)]">
                          {f.label}
                          {f.detail && <span className="text-[var(--text-dim)]"> · {f.detail}</span>}
                        </span>
                        <span className="shrink-0 tnum font-medium" style={{ color: f.delta > 0 ? "var(--emerald)" : "var(--rose)" }}>
                          {f.delta > 0 ? "+" : ""}
                          {f.delta}
                        </span>
                      </li>
                    ))}
                    <li className="border-t border-[var(--border)] pt-1.5 t-label text-[var(--text-dim)]">
                      An illustrative composite, not a clinical assessment. It knows only what you&apos;ve recorded.
                    </li>
                  </ul>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <Stat label="BMI" value={b} color="var(--cyan)" />
              <Stat label="Goal" value={<span className="t-meta">{profile.goal}</span>} color="var(--emerald)" />
            </div>
          </Card>

          <Card>
            <CardTitle
              level={2}
              action={
                <div className="flex items-center gap-2">
                  <button onClick={() => { setShowReport((s) => !s); setReportMsg(null); }} className="rounded-full border border-[var(--border-strong)] px-2.5 py-1 t-label text-[var(--text-muted)] transition hover:text-white focus-ring">
                    + Report
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmReset((c) => !c)}
                    title="Clear Health Memory"
                    aria-label="Clear Health Memory"
                    aria-expanded={confirmReset}
                    className="grid h-6 w-6 place-items-center rounded-full border border-[var(--border-strong)] t-label text-[var(--text-dim)] transition hover:text-white focus-ring"
                  >
                    <span aria-hidden="true">↺</span>
                  </button>
                </div>
              }
            >
              Health Memory
            </CardTitle>

            {demo && (
              <p className="mt-2 rounded-lg bg-[color-mix(in_oklab,var(--amber)_12%,transparent)] px-2.5 py-1.5 t-label leading-snug text-[var(--text-muted)]">
                You&apos;re exploring with <strong className="text-white">sample data</strong> — these labs and trends belong to a demo profile, not to you.
              </p>
            )}

            <AnimatePresence>
              {confirmReset && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                  <div className="mt-2 rounded-xl border border-[color-mix(in_oklab,var(--rose)_40%,transparent)] bg-[color-mix(in_oklab,var(--rose)_10%,transparent)] p-3">
                    <p className="t-label leading-relaxed text-[#ffd7dd]">
                      This permanently deletes every lab value, journal entry and logged meal. It cannot be undone.
                    </p>
                    <div className="mt-2 flex justify-end gap-2">
                      <button onClick={() => setConfirmReset(false)} className="rounded-lg px-2.5 py-1 t-label text-[var(--text-muted)] hover:text-white focus-ring">
                        Keep it
                      </button>
                      <button onClick={resetMemory} className="rounded-lg border border-[color-mix(in_oklab,var(--rose)_50%,transparent)] px-2.5 py-1 t-label font-medium text-[#ffd7dd] transition hover:bg-[color-mix(in_oklab,var(--rose)_18%,transparent)] focus-ring">
                        Delete everything
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <p className="mt-2 rounded-lg bg-[color-mix(in_oklab,var(--emerald)_12%,transparent)] px-2.5 py-1.5 t-label leading-snug text-[var(--text-muted)]">💡 {insight(profile)}</p>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <Stepper label="Weight" value={String(profile.weightKg)} unit="kg" color="var(--cyan)" onDec={() => patch({ weightKg: Math.max(35, profile.weightKg - 1) })} onInc={() => patch({ weightKg: profile.weightKg + 1 })} />
              <Stepper label="Sleep" value={String(profile.sleepHours)} unit="h" color="var(--violet)" onDec={() => patch({ sleepHours: Math.max(3, +(profile.sleepHours - 0.5).toFixed(1)) })} onInc={() => patch({ sleepHours: +(profile.sleepHours + 0.5).toFixed(1) })} />
              <Stat label="Height" value={heightImperial(profile.heightCm)} color="var(--cyan)" />
              <Stat label="Exercise" value={profile.exerciseDaysPerWeek} unit="d/wk" color="var(--emerald)" />
            </div>

            {trends.length > 0 && (
              <div className="mt-3 space-y-1.5">
                {trends.map((t) => (
                  <div key={t.label} className="flex items-center justify-between rounded-lg bg-[var(--surface-2)] px-3 py-2 t-meta">
                    <span className="text-[var(--text-muted)]">{t.label}</span>
                    <span className="font-medium tnum" style={{ color: t.good ? "var(--emerald)" : "var(--amber)" }}>
                      {t.direction === "up" ? "↑" : t.direction === "down" ? "↓" : "→"} {t.delta}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <AnimatePresence>
              {showReport && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                  <div className="mt-3 rounded-xl border border-[var(--border-strong)] bg-[var(--surface-2)] p-3">
                    <label htmlFor="lab-paste" className="t-label text-[var(--text-dim)]">
                      Paste a lab report — I&apos;ll extract the markers.
                    </label>
                    <textarea
                      id="lab-paste"
                      value={reportText}
                      onChange={(e) => setReportText(e.target.value)}
                      rows={4}
                      placeholder={"e.g.\nVitamin B12: 180 pg/mL\nVitamin D: 34\nTSH 5.2  Hemoglobin 14.6"}
                      className="scroll-thin mt-2 w-full resize-none rounded-lg bg-[var(--surface)] px-2.5 py-2 t-meta text-white outline-none placeholder:text-[var(--text-dim)]"
                    />
                    <div className="mt-2 flex justify-end gap-2">
                      <button onClick={() => setShowReport(false)} className="rounded-lg px-3 py-1.5 t-meta text-[var(--text-muted)] hover:text-white focus-ring">Cancel</button>
                      <button onClick={addReport} disabled={!reportText.trim()} className="btn-primary rounded-lg px-3 py-1.5 t-meta disabled:opacity-40">Extract markers</button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            {reportMsg && (
              <p role="status" className="mt-2 t-label text-[var(--emerald)]">
                {reportMsg}
              </p>
            )}
          </Card>
        </div>

        {/* CENTER — chat */}
        <div className="lg:col-span-6">
          {/*
            svh, not vh: on mobile Safari `vh` is measured against the *largest*
            viewport, so a 78vh panel sat partly under the URL bar and the
            composer — the one control that matters — was the part cut off.
          */}
          <div id="dashboard-chat" className="h-[78svh] min-h-[560px] overflow-hidden rounded-[var(--radius)] glass-strong">
            <Chat profile={profile} />
          </div>
        </div>

        {/* RIGHT — metrics + agents */}
        <div className="space-y-4 lg:col-span-3">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-1">
            <Card>
              <CardTitle level={2} hint="protein against your target" action={<Link href="/scan" className="rounded-full border border-[var(--border-strong)] px-2.5 py-1 t-label text-[var(--text-muted)] transition hover:text-white focus-ring">+ Scan</Link>}>
                Today&apos;s nutrition
              </CardTitle>

              <div className="mt-3 grid place-items-center">
                <Ring
                  value={today.protein}
                  max={target}
                  size={104}
                  stroke={9}
                  color="var(--cyan)"
                  label={`${today.protein}g`}
                  sub={`/ ${target}g`}
                  ariaLabel={`${today.protein} grams of protein logged today, against a target of ${target} grams.`}
                />
              </div>

              {/*
                The brief asks for carbs, fat and fibre on the dashboard and the
                data was already being computed — only protein was ever shown,
                with kcal and fibre relegated to a footnote in 10px grey.
              */}
              <div className="mt-3 grid grid-cols-4 gap-1.5">
                <MacroChip label="kcal" grams={today.kcal} color="var(--text)" />
                <MacroChip label="Carbs" grams={today.carbs} color="var(--cyan)" />
                <MacroChip label="Fat" grams={today.fat} color="var(--amber)" />
                <MacroChip label="Fibre" grams={today.fiber} color="var(--violet)" />
              </div>

              <div className="mt-3">
                {todayMeals.length > 0 ? (
                  <MealList meals={todayMeals} limit={4} onRemove={(id) => setMeals(meals.filter((x) => x.id !== id))} />
                ) : (
                  <Link href="/scan" className="block rounded-lg bg-[var(--surface-2)] px-3 py-2.5 text-center t-label text-[var(--text-muted)] transition hover:text-white focus-ring">
                    No meals logged today — scan one →
                  </Link>
                )}
              </div>
            </Card>

            <Card>
              <CardTitle level={2} hint={`your recorded average is ${profile.sleepHours} h a night`}>
                Sleep
              </CardTitle>
              {/*
                There were seven bars here labelled as a sleep pattern, six of
                which were a hard-coded array. Dimming them and captioning them
                "illustrative" made the product honest but not correct: they
                existed only to make one real number look like a chart. One
                number, stated plainly, is the whole of what we know.
              */}
              <div className="mt-4 flex items-baseline gap-2">
                <span className="t-display tnum text-[var(--violet)]">{profile.sleepHours}</span>
                <span className="t-meta text-[var(--text-dim)]">hours a night</span>
              </div>
              <p className="mt-2 t-label leading-relaxed text-[var(--text-muted)]">
                A single self-reported average. Per-night history needs a wearable or a nightly log — until then there is no trend here to draw.
              </p>
            </Card>
          </div>

          <Card>
            <CardTitle level={2} hint={profile.biomarkers.length ? undefined : "nothing recorded yet"}>
              Latest labs
            </CardTitle>
            <div className="mt-3">
              {profile.biomarkers.length ? (
                <ul className="space-y-2">
                  {profile.biomarkers.map((bm) => {
                    const tint = bm.status === "normal" ? "var(--emerald)" : bm.status === "borderline" ? "var(--amber)" : "var(--rose)";
                    return (
                      <li key={bm.name} className="flex items-center justify-between rounded-lg bg-[var(--surface-2)] px-3 py-2 t-meta">
                        <span className="text-[var(--text-muted)]">{bm.name}</span>
                        <span className="flex items-center gap-1.5 font-medium tnum" style={{ color: tint }}>
                          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full" style={{ background: tint }} />
                          {bm.value}
                          <span className="sr-only"> — {bm.status}</span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <Empty
                  glyph="🧪"
                  title="No lab values yet"
                  body="Paste a report with + Report above and I'll extract each marker, date it, and explain what it means."
                />
              )}
            </div>
          </Card>

          <Card>
            <CardTitle level={2}>Agents online</CardTitle>
            <ul className="mt-3 grid grid-cols-1 gap-2">
              {AGENTS.map((a) => (
                <li key={a.id} className="flex items-center gap-2.5 rounded-lg bg-[var(--surface-2)] px-3 py-2">
                  <span aria-hidden="true" className="grid h-7 w-7 place-items-center rounded-md text-sm" style={{ background: `${a.color}22` }}>
                    {a.glyph}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate t-meta font-medium">{a.name}</p>
                    <p className="truncate t-label text-[var(--text-dim)]">{a.tagline}</p>
                  </div>
                  <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full" style={{ background: a.color }} />
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </main>
    </div>
  );
}
