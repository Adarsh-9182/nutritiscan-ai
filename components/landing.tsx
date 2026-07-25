"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { AGENTS } from "@/lib/agents-meta";

/* ---------- small primitives ---------- */

function Reveal({ children, delay = 0, y = 24 }: { children: React.ReactNode; delay?: number; y?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-1 text-xs font-medium tracking-wide text-[var(--text-muted)]">
      <span className="h-1.5 w-1.5 rounded-full bg-[var(--emerald)] pulse-dot text-[var(--emerald)]" />
      {children}
    </div>
  );
}

/* ---------- hero live triage typewriter ---------- */

const TRIAGE_STEPS = [
  { role: "user", text: "I have a fever." },
  { role: "ai", text: "Since when — and what's your temperature?" },
  { role: "ai", text: "This may relate to a viral infection or flu." },
  { role: "flag", text: "🚩 Seek care if breathing is hard or a severe headache appears." },
  { role: "rec", text: "For now: rest, fluids, monitor temperature. Confidence ~65%." },
];

function LiveTriage() {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce ? TRIAGE_STEPS.length : 0);
  useEffect(() => {
    if (reduce) return;
    if (shown >= TRIAGE_STEPS.length) {
      const r = setTimeout(() => setShown(0), 3200);
      return () => clearTimeout(r);
    }
    const t = setTimeout(() => setShown((s) => s + 1), shown === 0 ? 500 : 1100);
    return () => clearTimeout(t);
  }, [shown, reduce]);

  return (
    <div className="glass-strong glow-emerald rounded-[var(--radius)] p-5 sm:p-6 w-full">
      <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-[color-mix(in_oklab,var(--emerald)_18%,transparent)] text-sm">🩺</span>
          <div>
            <p className="text-sm font-semibold">Doctor Agent</p>
            <p className="text-[11px] text-[var(--text-dim)]">supervised · educational</p>
          </div>
        </div>
        <span className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--emerald)]" /> reasoning
        </span>
      </div>
      <div className="mt-4 space-y-2.5 min-h-[200px]">
        {TRIAGE_STEPS.slice(0, shown).map((s, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className={
              s.role === "user"
                ? "ml-auto w-fit max-w-[80%] rounded-2xl rounded-br-sm bg-[color-mix(in_oklab,var(--emerald)_20%,transparent)] px-3.5 py-2 text-sm text-white"
                : s.role === "flag"
                ? "w-fit max-w-[92%] rounded-2xl border border-[color-mix(in_oklab,var(--rose)_40%,transparent)] bg-[color-mix(in_oklab,var(--rose)_10%,transparent)] px-3.5 py-2 text-sm text-[#ffd7dd]"
                : s.role === "rec"
                ? "w-fit max-w-[92%] rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-2)] px-3.5 py-2 text-sm"
                : "w-fit max-w-[85%] rounded-2xl rounded-bl-sm bg-[var(--surface-2)] px-3.5 py-2 text-sm text-[var(--text)]"
            }
          >
            {s.text}
          </motion.div>
        ))}
        {shown < TRIAGE_STEPS.length && (
          <div className="flex gap-1 pl-1">
            {[0, 1, 2].map((d) => (
              <motion.span
                key={d}
                className="h-1.5 w-1.5 rounded-full bg-[var(--text-dim)]"
                animate={{ opacity: [0.2, 1, 0.2] }}
                transition={{ duration: 1, repeat: Infinity, delay: d * 0.15 }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- floating metric chip ---------- */
function FloatChip({ label, value, tint, className, delay }: { label: string; value: string; tint: string; className: string; delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay, duration: 0.6 }}
      className={`absolute hidden lg:block ${className}`}
    >
      <div className="glass animate-float rounded-2xl px-4 py-3" style={{ animationDelay: `${delay}s` }}>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: tint }} />
          <span className="text-[11px] text-[var(--text-muted)]">{label}</span>
        </div>
        <p className="mt-1 text-lg font-semibold" style={{ color: tint }}>{value}</p>
      </div>
    </motion.div>
  );
}

/* ---------- architecture node ---------- */
function Node({ glyph, label, sub, color }: { glyph: string; label: string; sub?: string; color: string }) {
  return (
    <div className="glass rounded-2xl px-4 py-3 text-center" style={{ boxShadow: `0 12px 40px -18px ${color}55` }}>
      <div className="mx-auto grid h-10 w-10 place-items-center rounded-xl text-lg" style={{ background: `${color}22` }}>{glyph}</div>
      <p className="mt-2 text-sm font-semibold">{label}</p>
      {sub && <p className="text-[11px] text-[var(--text-dim)]">{sub}</p>}
    </div>
  );
}

/* =====================================================================
   LANDING
   ===================================================================== */

export default function Landing() {
  const heroRef = useRef<HTMLDivElement>(null);

  return (
    <main className="relative">
      {/* NAV */}
      <header className="fixed inset-x-0 top-0 z-50">
        <div className="mx-auto mt-4 flex max-w-6xl items-center justify-between rounded-full glass px-4 py-2.5 sm:px-5">
          <Link href="/" className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-[linear-gradient(135deg,var(--emerald),var(--cyan))] text-sm font-bold text-[#04120c]">N</span>
            <span className="text-sm font-semibold tracking-tight">NutritiScan <span className="text-[var(--text-dim)]">AI</span></span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-[var(--text-muted)] md:flex">
            <a href="#architecture" className="hover:text-white transition">Architecture</a>
            <a href="#agents" className="hover:text-white transition">Agents</a>
            <a href="#reasoning" className="hover:text-white transition">How it thinks</a>
            <Link href="/scan" className="hover:text-white transition">Scan</Link>
            <Link href="/timeline" className="hover:text-white transition">Timeline</Link>
            <a href="#memory" className="hover:text-white transition">Memory</a>
          </nav>
          <Link href="/dashboard" className="btn-primary rounded-full px-4 py-2 text-sm">Open App</Link>
        </div>
      </header>

      {/* HERO */}
      <section ref={heroRef} className="relative mx-auto flex min-h-[100svh] max-w-6xl flex-col items-center px-5 pt-36 pb-20 text-center">
        <FloatChip label="Sleep" value="7h 12m" tint="var(--violet)" className="left-2 top-52" delay={0.6} />
        <FloatChip label="Health Score" value="84" tint="var(--emerald)" className="right-2 top-44" delay={0.9} />
        <FloatChip label="Protein today" value="112g" tint="var(--cyan)" className="left-6 bottom-40" delay={1.2} />
        <FloatChip label="Vitamin B12" value="Low" tint="var(--amber)" className="right-6 bottom-36" delay={1.5} />

        <Reveal>
          <Eyebrow>Understand Your Body. Transform Your Health.</Eyebrow>
        </Reveal>

        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          className="mt-6 max-w-4xl text-5xl font-semibold leading-[1.03] tracking-tight sm:text-7xl"
        >
          <span className="gradient-text">Your Health</span>
          <br />
          <span className="gradient-text-emerald">Has A Memory.</span>
        </motion.h1>

        <Reveal delay={0.15}>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-[var(--text-muted)] sm:text-lg">
            NutritiScan AI is your intelligent health companion that understands your body,
            tracks your progress, analyzes your health data, and helps you make better
            decisions every day.
          </p>
        </Reveal>

        <Reveal delay={0.25}>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/dashboard" className="btn-primary rounded-full px-6 py-3 text-sm sm:text-base">
              Meet your AI Health OS →
            </Link>
            <Link href="/scan" className="btn-ghost rounded-full px-6 py-3 text-sm sm:text-base">Scan a meal</Link>
          </div>
        </Reveal>

        <Reveal delay={0.4}>
          <div className="mt-14 w-full max-w-md">
            <LiveTriage />
          </div>
        </Reveal>
      </section>

      {/* STAT STRIP */}
      <section className="mx-auto max-w-6xl px-5 pb-10">
        <Reveal>
          <div className="grid grid-cols-2 gap-3 rounded-[var(--radius)] glass p-6 sm:grid-cols-4">
            {[
              ["6", "specialist agents"],
              ["1", "living memory"],
              ["24/7", "personal companion"],
              ["100%", "safety-first"],
            ].map(([n, l]) => (
              <div key={l} className="text-center">
                <p className="text-3xl font-semibold gradient-text-emerald">{n}</p>
                <p className="mt-1 text-xs text-[var(--text-dim)]">{l}</p>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      {/* ARCHITECTURE */}
      <section id="architecture" className="mx-auto max-w-6xl px-5 py-24">
        <Reveal>
          <div className="text-center">
            <Eyebrow>Multi-agent architecture</Eyebrow>
            <h2 className="mt-5 text-3xl font-semibold tracking-tight sm:text-5xl">One brain. Many specialists.</h2>
            <p className="mx-auto mt-4 max-w-xl text-[var(--text-muted)]">
              A supervisor routes your question to the right expert, then synthesizes a single,
              personalized answer — grounded in your health memory.
            </p>
          </div>
        </Reveal>

        <Reveal delay={0.1}>
          <div className="mt-14 rounded-[var(--radius)] glass p-6 sm:p-10">
            {/* supervisor */}
            <div className="flex justify-center">
              <Node glyph="✦" label="Supervisor" sub="routes & synthesizes" color="var(--emerald)" />
            </div>
            <div className="mx-auto my-4 h-8 w-px bg-[linear-gradient(var(--border-strong),transparent)]" />
            {/* agents */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {AGENTS.map((a, i) => (
                <motion.div key={a.id} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.06 }}>
                  <Node glyph={a.glyph} label={a.name.replace(" Agent", "")} sub={a.tagline} color={a.color} />
                </motion.div>
              ))}
            </div>
            <div className="mx-auto my-5 h-8 w-px bg-[linear-gradient(var(--border-strong),transparent)]" />
            {/* brain + memory */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Node glyph="🧠" label="LLM Brain" sub="Claude · GPT · Gemini" color="var(--violet)" />
              <Node glyph="♾️" label="Health Memory" sub="RAG + longitudinal store" color="var(--cyan)" />
              <Node glyph="🛡️" label="Safety Layer" sub="never diagnoses · flags risk" color="var(--amber)" />
            </div>
          </div>
        </Reveal>
      </section>

      {/* AGENTS GRID */}
      <section id="agents" className="mx-auto max-w-6xl px-5 py-24">
        <Reveal>
          <div className="text-center">
            <Eyebrow>The team inside</Eyebrow>
            <h2 className="mt-5 text-3xl font-semibold tracking-tight sm:text-5xl">Five specialists, one companion</h2>
          </div>
        </Reveal>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {AGENTS.map((a, i) => (
            <Reveal key={a.id} delay={i * 0.06}>
              <div className="group h-full rounded-[var(--radius)] glass p-6 transition-transform hover:-translate-y-1" style={{ boxShadow: `0 24px 60px -30px ${a.color}44` }}>
                <div className="flex items-center gap-3">
                  <span className="grid h-11 w-11 place-items-center rounded-xl text-xl" style={{ background: `${a.color}1f` }}>{a.glyph}</span>
                  <div>
                    <p className="font-semibold">{a.name}</p>
                    <p className="text-xs" style={{ color: a.color }}>{a.tagline}</p>
                  </div>
                </div>
                <ul className="mt-5 space-y-2">
                  {a.knows.map((k) => (
                    <li key={k} className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
                      <span className="h-1 w-1 rounded-full" style={{ background: a.color }} />
                      {k}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          ))}
          <Reveal delay={0.36}>
            <Link href="/dashboard" className="flex h-full flex-col justify-between rounded-[var(--radius)] p-6 glass-strong glow-emerald">
              <div>
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-[color-mix(in_oklab,var(--emerald)_20%,transparent)] text-xl">✦</span>
                <p className="mt-4 font-semibold">Supervisor</p>
                <p className="mt-1 text-sm text-[var(--text-muted)]">Coordinates every specialist and remembers your whole story.</p>
              </div>
              <span className="mt-6 text-sm font-medium text-[var(--emerald)]">Open the app →</span>
            </Link>
          </Reveal>
        </div>
      </section>

      {/* REASONING */}
      <section id="reasoning" className="mx-auto max-w-6xl px-5 py-24">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <Reveal>
            <div>
              <Eyebrow>How it thinks</Eyebrow>
              <h2 className="mt-5 text-3xl font-semibold tracking-tight sm:text-5xl">Careful reasoning, not confident guesses</h2>
              <p className="mt-4 text-[var(--text-muted)]">
                When you describe a symptom, NutritiScan doesn&apos;t jump to conclusions. It asks,
                reasons transparently, shows its confidence, surfaces red flags, and always points
                you to professional care when it matters.
              </p>
              <div className="mt-6 space-y-3">
                {[
                  ["It asks", "Temperature, timeline, cough, breathing, meds, allergies, travel."],
                  ["It reasons", "Weighs possibilities like viral infection, flu, or heat exhaustion."],
                  ["It's honest", "Shows confidence (~65%) and what would raise it."],
                  ["It protects", "Names red flags and urges care when needed."],
                ].map(([h, b]) => (
                  <div key={h} className="flex gap-3 rounded-2xl glass p-4">
                    <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-[var(--emerald)]" />
                    <p className="text-sm"><span className="font-semibold">{h}. </span><span className="text-[var(--text-muted)]">{b}</span></p>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
          <Reveal delay={0.15}>
            <div className="rounded-[var(--radius)] glass-strong p-6">
              <p className="text-xs text-[var(--text-dim)]">User</p>
              <p className="mt-1 rounded-2xl bg-[color-mix(in_oklab,var(--emerald)_16%,transparent)] px-4 py-2 text-sm">I have a fever.</p>
              <p className="mt-5 text-xs text-[var(--text-dim)]">NutritiScan reasons</p>
              <div className="mt-2 space-y-2 text-sm">
                <p className="rounded-2xl bg-[var(--surface-2)] px-4 py-2">Possible: viral infection · flu · heat exhaustion</p>
                <div className="flex items-center gap-3 rounded-2xl bg-[var(--surface-2)] px-4 py-3">
                  <div className="relative h-12 w-12 shrink-0">
                    <svg viewBox="0 0 36 36" className="h-12 w-12 -rotate-90">
                      <circle cx="18" cy="18" r="15.5" fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="4" />
                      <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--emerald)" strokeWidth="4" strokeLinecap="round" strokeDasharray="97.4" strokeDashoffset="34" />
                    </svg>
                    <span className="absolute inset-0 grid place-items-center text-xs font-semibold">65%</span>
                  </div>
                  <p className="text-[var(--text-muted)]">Confidence — sharpened by your temperature & timeline.</p>
                </div>
                <p className="rounded-2xl border border-[color-mix(in_oklab,var(--rose)_40%,transparent)] bg-[color-mix(in_oklab,var(--rose)_10%,transparent)] px-4 py-2 text-[#ffd7dd]">🚩 Trouble breathing · severe headache · chest pain → seek care now</p>
                <p className="rounded-2xl bg-[var(--surface-2)] px-4 py-2 text-[var(--text-muted)]">Rest · fluids · monitor temperature · review with a clinician if it worsens.</p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* MEMORY */}
      <section id="memory" className="mx-auto max-w-6xl px-5 py-24">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <Reveal>
            <div className="rounded-[var(--radius)] glass p-6">
              <div className="flex items-center justify-between">
                <p className="font-semibold">Adarsh</p>
                <span className="text-xs text-[var(--text-dim)]">living profile</span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                {[
                  ["Weight", "65 kg", "var(--cyan)"],
                  ["Height", `5'8"`, "var(--cyan)"],
                  ["Goal", "Build muscle", "var(--emerald)"],
                  ["Sleep", "7 hours", "var(--violet)"],
                  ["Exercise", "5 days/wk", "var(--emerald)"],
                  ["Vitamin B12", "Low", "var(--amber)"],
                ].map(([k, v, c]) => (
                  <div key={k} className="rounded-xl bg-[var(--surface-2)] px-3 py-2.5">
                    <p className="text-[11px] text-[var(--text-dim)]">{k}</p>
                    <p className="font-medium" style={{ color: c }}>{v}</p>
                  </div>
                ))}
              </div>
              <p className="mt-4 rounded-xl bg-[color-mix(in_oklab,var(--emerald)_12%,transparent)] px-3 py-2.5 text-sm text-[var(--text-muted)]">
                “Your average sleep has increased by <span className="text-white">48 minutes</span> this month and workout consistency is up significantly.”
              </p>
            </div>
          </Reveal>
          <Reveal delay={0.15}>
            <div>
              <Eyebrow>The Health Memory Engine</Eyebrow>
              <h2 className="mt-5 text-3xl font-semibold tracking-tight sm:text-5xl">The AI remembers everything</h2>
              <p className="mt-4 text-[var(--text-muted)]">
                Height, weight, allergies, reports, medicines, sleep, goals — held in one living
                memory and woven into every answer. NutritiScan gets more helpful the longer you
                use it, spotting trends across weeks and months.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                {["Longitudinal trends", "Deficiency tracking", "Goal-aware advice", "Predictive insights"].map((t) => (
                  <span key={t} className="rounded-full border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-1.5 text-xs text-[var(--text-muted)]">{t}</span>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* VISION */}
      <section className="mx-auto max-w-5xl px-5 py-28 text-center">
        <Reveal>
          <Eyebrow>The vision</Eyebrow>
          <p className="mt-8 text-2xl font-medium leading-relaxed tracking-tight sm:text-4xl">
            NutritiScan AI is not another chatbot wrapped in a health theme. It is a{" "}
            <span className="gradient-text-emerald">living AI Health Operating System</span>{" "}
            that evolves with you — combining nutrition, fitness, sleep, and lab intelligence with
            long-term memory and personalized coaching.
          </p>
          <p className="mx-auto mt-8 max-w-2xl text-[var(--text-muted)]">
            The goal is not to replace healthcare professionals, but to help people understand
            themselves better and build healthier lives — one decision at a time.
          </p>
          <div className="mt-10">
            <Link href="/dashboard" className="btn-primary rounded-full px-7 py-3.5">Start with your Health OS →</Link>
          </div>
        </Reveal>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-[var(--border)] px-5 py-12">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <div className="flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-[linear-gradient(135deg,var(--emerald),var(--cyan))] text-sm font-bold text-[#04120c]">N</span>
              <span className="text-sm font-semibold">NutritiScan AI</span>
            </div>
            <p className="text-xs text-[var(--text-dim)]">Understand Your Body. Transform Your Health.</p>
          </div>
          <p className="mx-auto mt-8 max-w-3xl text-center text-xs leading-relaxed text-[var(--text-dim)]">
            NutritiScan AI provides educational health information only and is not a medical device.
            It does not diagnose, treat, or prescribe. Always consult a qualified healthcare
            professional for medical concerns. In an emergency, contact your local emergency services.
          </p>
        </div>
      </footer>
    </main>
  );
}
