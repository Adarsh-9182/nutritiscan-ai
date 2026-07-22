"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import Chat from "@/components/chat";
import { AGENTS } from "@/lib/agents-meta";
import { bmi, demoProfile, healthScore, heightImperial, insight, type HealthProfile } from "@/lib/memory/profile";
import { mergeBiomarkers, parseLabReport } from "@/lib/memory/labs";

const STORAGE_KEY = "ns-profile-v1";

/* ---- progress ring ---- */
function Ring({ value, max = 100, size = 132, stroke = 10, color = "var(--emerald)", label, sub }: { value: number; max?: number; size?: number; stroke?: number; color?: string; label: string; sub?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value / max));
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.07)" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - pct) }}
          transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
          style={{ filter: `drop-shadow(0 0 10px ${color}80)` }}
        />
      </svg>
      <div className="absolute text-center">
        <p className="text-3xl font-semibold" style={{ color }}>{label}</p>
        {sub && <p className="text-[11px] text-[var(--text-dim)]">{sub}</p>}
      </div>
    </div>
  );
}

/* ---- 7-night sleep bars ---- */
function SleepBars({ avg }: { avg: number }) {
  const nights = [6.4, 7.1, 6.8, 7.6, 7.2, 7.9, avg];
  const max = 9;
  return (
    <div className="flex h-20 items-end gap-1.5">
      {nights.map((n, i) => (
        <motion.div
          key={i}
          initial={{ height: 0 }}
          animate={{ height: `${(n / max) * 100}%` }}
          transition={{ delay: i * 0.05, duration: 0.6 }}
          className="flex-1 rounded-md"
          style={{ background: i === nights.length - 1 ? "var(--violet)" : "color-mix(in oklab, var(--violet) 40%, transparent)" }}
          title={`${n}h`}
        />
      ))}
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
          <button onClick={onDec} className="grid h-6 w-6 place-items-center rounded-md bg-[var(--surface)] text-sm hover:bg-[var(--border)]">−</button>
          <button onClick={onInc} className="grid h-6 w-6 place-items-center rounded-md bg-[var(--surface)] text-sm hover:bg-[var(--border)]">+</button>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [profile, setProfile] = useState<HealthProfile>(demoProfile);
  const [hydrated, setHydrated] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [reportText, setReportText] = useState("");
  const [reportMsg, setReportMsg] = useState<string | null>(null);
  const patch = (p: Partial<HealthProfile>) => setProfile((prev) => ({ ...prev, ...p }));

  // Hydrate from localStorage (real, keyless persistence — the AI's memory survives refreshes).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setProfile(JSON.parse(raw));
    } catch {}
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    } catch {}
  }, [profile, hydrated]);

  const addReport = () => {
    const found = parseLabReport(reportText);
    if (!found.length) {
      setReportMsg('No known markers found. Try lines like "B12 180" or "Vitamin D 34".');
      return;
    }
    patch({ biomarkers: mergeBiomarkers(profile.biomarkers, found) });
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
  const proteinTarget = Math.round(profile.weightKg * 1.8);
  const proteinToday = 112;

  return (
    <div className="min-h-[100svh] px-4 py-4 sm:px-6">
      {/* top bar */}
      <div className="mx-auto mb-5 flex max-w-7xl items-center justify-between rounded-full glass px-4 py-2.5 sm:px-5">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-[linear-gradient(135deg,var(--emerald),var(--cyan))] text-sm font-bold text-[#04120c]">N</span>
          <span className="text-sm font-semibold">NutritiScan <span className="text-[var(--text-dim)]">Health OS</span></span>
        </Link>
        <div className="flex items-center gap-3">
          <span className="hidden items-center gap-1.5 text-xs text-[var(--text-muted)] sm:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--emerald)]" /> memory synced
          </span>
          <Link href="/" className="btn-ghost rounded-full px-3.5 py-1.5 text-xs">← Home</Link>
        </div>
      </div>

      <div className="mx-auto grid max-w-7xl gap-4 lg:grid-cols-12">
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
                <button onClick={resetMemory} title="Reset to demo memory" className="grid h-6 w-6 place-items-center rounded-full border border-[var(--border-strong)] text-[11px] text-[var(--text-dim)] transition hover:text-white">↺</button>
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
              <p className="text-[11px] text-[var(--text-dim)]">last 7 nights · avg {profile.sleepHours}h</p>
              <div className="mt-4"><SleepBars avg={profile.sleepHours} /></div>
            </div>

            <div className="rounded-[var(--radius)] glass p-5">
              <p className="text-sm font-semibold">Nutrition</p>
              <p className="text-[11px] text-[var(--text-dim)]">protein today</p>
              <div className="mt-3 grid place-items-center">
                <Ring value={proteinToday} max={proteinTarget} size={104} stroke={9} color="var(--cyan)" label={`${proteinToday}g`} sub={`/ ${proteinTarget}g`} />
              </div>
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
      </div>
    </div>
  );
}
