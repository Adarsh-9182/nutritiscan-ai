"use client";

import Link from "next/link";
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import Chat from "@/components/chat";
import Ring from "@/components/ring";
import Nav from "@/components/nav";
import Onboarding from "@/components/onboarding";
import { AGENTS } from "@/lib/agents-meta";
import { bmi, demoProfile, healthScore, heightImperial, insight } from "@/lib/memory/profile";
import { mergeBiomarkers, parseLabReport } from "@/lib/memory/labs";
import { journalEntry } from "@/lib/memory/journal";
import { dayTotals, mealsOn, mealTime } from "@/lib/memory/meals";
import { useMeals, useProfile } from "@/lib/memory/store";
import { proteinTarget } from "@/lib/nutrition/analyze";

/**
 * Sleep pattern.
 *
 * IMPORTANT: we do not have per-night sleep data. The user records a single
 * average and nothing else. This previously rendered six hard-coded values
 * under the heading "last 7 nights", which presented invented biometrics to
 * the user as their own history — not acceptable in a health product, and
 * exactly the sort of thing a clinician or regulator would object to.
 *
 * Until there is a real per-night source, the six context bars are drawn as
 * dimmed, explicitly-labelled illustration and only the final bar — the
 * user's recorded average — is rendered as data.
 */
const ILLUSTRATIVE_PATTERN = [6.4, 7.1, 6.8, 7.6, 7.2, 7.9];

function SleepBars({ avg }: { avg: number }) {
  const max = 9;
  const bars = [...ILLUSTRATIVE_PATTERN, avg];
  return (
    <div className="flex h-20 items-end gap-1.5" role="img" aria-label={`Your recorded sleep average is ${avg} hours a night. The preceding bars are an illustrative pattern, not recorded nights.`}>
      {bars.map((n, i) => {
        const isRecorded = i === bars.length - 1;
        return (
          <motion.div
            key={i}
            initial={{ height: 0 }}
            animate={{ height: `${(n / max) * 100}%` }}
            transition={{ delay: i * 0.05, duration: 0.6 }}
            className="flex-1 rounded-md"
            style={{
              background: isRecorded ? "var(--violet)" : "color-mix(in oklab, var(--violet) 22%, transparent)",
            }}
            title={isRecorded ? `${n}h — your recorded average` : "illustrative"}
          />
        );
      })}
    </div>
  );
}

function Stepper({ label, value, unit, onDec, onInc, color }: { label: string; value: string; unit: string; onDec: () => void; onInc: () => void; color: string }) {
  return (
    <div className="rounded-xl bg-[var(--surface-2)] px-3 py-2.5">
      <p className="text-[11px] text-[var(--text-dim)]">{label}</p>
      <div className="mt-1 flex items-center justify-between">
        <p className="font-medium" style={{ color }}>{value}<span className="ml-1 text-xs text-[var(--text-dim)]">{unit}</span></p>
        <div className="flex items-center gap-1">
          {/*
            Icon-only controls need their own name — a screen reader
            otherwise announces five identical "minus" buttons with no
            indication of which value each one changes.
          */}
          <button type="button" onClick={onDec} aria-label={`Decrease ${label}`} className="grid h-6 w-6 place-items-center rounded-md bg-[var(--surface)] text-sm hover:bg-[var(--border)]">
            <span aria-hidden="true">−</span>
          </button>
          <button type="button" onClick={onInc} aria-label={`Increase ${label}`} className="grid h-6 w-6 place-items-center rounded-md bg-[var(--surface)] text-sm hover:bg-[var(--border)]">
            <span aria-hidden="true">+</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  // Memory is read from the shared store, so edits here show up on the
  // scanner and the timeline immediately — and survive a refresh.
  const [profile, setProfile, patch] = useProfile();
  const [meals] = useMeals();
  const [showReport, setShowReport] = useState(false);
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

  const resetMemory = () => {
    setProfile(demoProfile);
    setReportMsg("Memory reset to demo profile.");
  };

  const score = healthScore(profile);
  const b = bmi(profile);
  // Intake now comes from meals the user actually scanned and logged.
  const target = proteinTarget(profile);
  const today = dayTotals(meals);
  const todayMeals = mealsOn(meals).slice().reverse();

  return (
    <div className="min-h-[100svh] px-4 py-4 sm:px-6">
      <Onboarding />
      <Nav status={{ tone: "good", label: "memory synced" }} />

      <main className="mx-auto grid max-w-7xl gap-4 lg:grid-cols-12">
        {/* LEFT — score + memory */}
        <div className="space-y-4 lg:col-span-3">
          <div className="rounded-[var(--radius)] glass p-5">
            <p className="text-sm font-semibold">Health Score</p>
            <p className="text-[11px] text-[var(--text-dim)]">a calm daily read — not a diagnosis</p>
            <div className="mt-4 grid place-items-center">
              <Ring value={score} label={String(score)} sub="/ 100" />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-center text-xs">
              <div className="rounded-lg bg-[var(--surface-2)] py-2">
                <p className="text-[var(--text-dim)]">BMI</p>
                <p className="font-medium text-[var(--cyan)]">{b}</p>
              </div>
              <div className="rounded-lg bg-[var(--surface-2)] py-2">
                <p className="text-[var(--text-dim)]">Goal</p>
                <p className="font-medium text-[var(--emerald)]">{profile.goal}</p>
              </div>
            </div>
          </div>

          <div className="rounded-[var(--radius)] glass p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Health Memory</p>
              <div className="flex items-center gap-2">
                <button onClick={() => { setShowReport((s) => !s); setReportMsg(null); }} className="rounded-full border border-[var(--border-strong)] px-2.5 py-1 text-[11px] text-[var(--text-muted)] transition hover:text-white">+ Report</button>
                <button type="button" onClick={resetMemory} title="Reset to demo memory" aria-label="Reset Health Memory to the demo profile" className="grid h-6 w-6 place-items-center rounded-full border border-[var(--border-strong)] text-[11px] text-[var(--text-dim)] transition hover:text-white">
                  <span aria-hidden="true">↺</span>
                </button>
              </div>
            </div>
            <p className="mt-2 rounded-lg bg-[color-mix(in_oklab,var(--emerald)_12%,transparent)] px-2.5 py-1.5 text-[11px] leading-snug text-[var(--text-muted)]">💡 {insight(profile)}</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Stepper label="Weight" value={String(profile.weightKg)} unit="kg" color="var(--cyan)" onDec={() => patch({ weightKg: Math.max(35, profile.weightKg - 1) })} onInc={() => patch({ weightKg: profile.weightKg + 1 })} />
              <Stepper label="Sleep" value={String(profile.sleepHours)} unit="h" color="var(--violet)" onDec={() => patch({ sleepHours: Math.max(3, +(profile.sleepHours - 0.5).toFixed(1)) })} onInc={() => patch({ sleepHours: +(profile.sleepHours + 0.5).toFixed(1) })} />
              <div className="rounded-xl bg-[var(--surface-2)] px-3 py-2.5">
                <p className="text-[11px] text-[var(--text-dim)]">Height</p>
                <p className="mt-1 font-medium text-[var(--cyan)]">{heightImperial(profile.heightCm)}</p>
              </div>
              <div className="rounded-xl bg-[var(--surface-2)] px-3 py-2.5">
                <p className="text-[11px] text-[var(--text-dim)]">Exercise</p>
                <p className="mt-1 font-medium text-[var(--emerald)]">{profile.exerciseDaysPerWeek} d/wk</p>
              </div>
            </div>
            <div className="mt-3 space-y-1.5">
              {profile.trends?.map((t) => (
                <div key={t.label} className="flex items-center justify-between rounded-lg bg-[var(--surface-2)] px-3 py-2 text-xs">
                  <span className="text-[var(--text-muted)]">{t.label}</span>
                  <span className="font-medium" style={{ color: t.good ? "var(--emerald)" : "var(--amber)" }}>
                    {t.direction === "up" ? "↑" : t.direction === "down" ? "↓" : "→"} {t.delta}
                  </span>
                </div>
              ))}
            </div>

            <AnimatePresence>
              {showReport && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                  <div className="mt-3 rounded-xl border border-[var(--border-strong)] bg-[var(--surface-2)] p-3">
                    <p className="text-[11px] text-[var(--text-dim)]">Paste a lab report — I&apos;ll extract the markers.</p>
                    <textarea
                      value={reportText}
                      onChange={(e) => setReportText(e.target.value)}
                      rows={4}
                      placeholder={"e.g.\nVitamin B12: 180 pg/mL\nVitamin D: 34\nTSH 5.2  Hemoglobin 14.6"}
                      className="scroll-thin mt-2 w-full resize-none rounded-lg bg-[var(--surface)] px-2.5 py-2 text-xs text-white outline-none placeholder:text-[var(--text-dim)]"
                    />
                    <div className="mt-2 flex justify-end gap-2">
                      <button onClick={() => setShowReport(false)} className="rounded-lg px-3 py-1.5 text-xs text-[var(--text-muted)] hover:text-white">Cancel</button>
                      <button onClick={addReport} disabled={!reportText.trim()} className="btn-primary rounded-lg px-3 py-1.5 text-xs disabled:opacity-40">Extract markers</button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            {reportMsg && <p className="mt-2 text-[11px] text-[var(--emerald)]">{reportMsg}</p>}
          </div>
        </div>

        {/* CENTER — chat */}
        <div className="lg:col-span-6">
          <div className="h-[78vh] min-h-[560px] overflow-hidden rounded-[var(--radius)] glass-strong">
            <Chat profile={profile} />
          </div>
        </div>

        {/* RIGHT — metrics + agents */}
        <div className="space-y-4 lg:col-span-3">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-1">
            <div className="rounded-[var(--radius)] glass p-5">
              <p className="text-sm font-semibold">Sleep</p>
              <p className="text-[11px] text-[var(--text-dim)]">
                your average {profile.sleepHours}h · earlier bars illustrative
              </p>
              <div className="mt-4"><SleepBars avg={profile.sleepHours} /></div>
            </div>

            <div className="rounded-[var(--radius)] glass p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-semibold">Nutrition</p>
                  <p className="text-[11px] text-[var(--text-dim)]">protein today · from scanned meals</p>
                </div>
                <Link href="/scan" className="rounded-full border border-[var(--border-strong)] px-2.5 py-1 text-[11px] text-[var(--text-muted)] transition hover:text-white">+ Scan</Link>
              </div>
              <div className="mt-3 grid place-items-center">
                <Ring value={today.protein} max={target} size={104} stroke={9} color="var(--cyan)" label={`${today.protein}g`} sub={`/ ${target}g`} />
              </div>
              {todayMeals.length > 0 ? (
                <div className="mt-3 space-y-1.5">
                  {todayMeals.slice(0, 4).map((m) => (
                    <div key={m.id} className="flex items-center justify-between rounded-lg bg-[var(--surface-2)] px-3 py-2 text-xs">
                      <span className="min-w-0 flex-1 truncate text-[var(--text-muted)]">{m.title}</span>
                      <span className="ml-2 shrink-0 text-[10px] text-[var(--text-dim)]">{mealTime(m.at)} · {m.kcal} kcal</span>
                    </div>
                  ))}
                  <p className="pt-0.5 text-center text-[10px] text-[var(--text-dim)]">{today.kcal} kcal · {today.fiber} g fibre today</p>
                </div>
              ) : (
                <Link href="/scan" className="mt-3 block rounded-lg bg-[var(--surface-2)] px-3 py-2.5 text-center text-[11px] text-[var(--text-dim)] transition hover:text-white">
                  No meals logged today — scan one →
                </Link>
              )}
            </div>
          </div>

          <div className="rounded-[var(--radius)] glass p-5">
            <p className="text-sm font-semibold">Latest labs</p>
            <div className="mt-3 space-y-2">
              {profile.biomarkers.map((bm) => {
                const tint = bm.status === "normal" ? "var(--emerald)" : bm.status === "borderline" ? "var(--amber)" : "var(--rose)";
                return (
                  <div key={bm.name} className="flex items-center justify-between rounded-lg bg-[var(--surface-2)] px-3 py-2 text-xs">
                    <span className="text-[var(--text-muted)]">{bm.name}</span>
                    <span className="flex items-center gap-1.5 font-medium" style={{ color: tint }}>
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: tint }} />{bm.value}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-[var(--radius)] glass p-5">
            <p className="text-sm font-semibold">Agents online</p>
            <div className="mt-3 grid grid-cols-1 gap-2">
              {AGENTS.map((a) => (
                <div key={a.id} className="flex items-center gap-2.5 rounded-lg bg-[var(--surface-2)] px-3 py-2">
                  <span className="grid h-7 w-7 place-items-center rounded-md text-sm" style={{ background: `${a.color}22` }}>{a.glyph}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">{a.name}</p>
                    <p className="truncate text-[10px] text-[var(--text-dim)]">{a.tagline}</p>
                  </div>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: a.color }} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
