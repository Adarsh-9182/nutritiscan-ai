"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { AGENTS } from "@/lib/agents-meta";

/* =====================================================================
   NUTRITISCAN — landing

   The competitive claim every AI health product makes is "trained on
   medical research, built by doctors". We cannot say that and will not
   imply it: there is no clinician on staff and no review has happened
   yet. What we can do is show the mechanism — a rule engine that runs
   before the model and can stop it — because a mechanism is checkable
   and a credential on a marketing page is not.

   Every number on this page is read off the repository. If a count
   changes there, change it here.
   ===================================================================== */

const FACTS = {
  rules: 38,
  domains: 11,
  emergency: 27,
  urgent: 11,
  specialists: 5,
  tests: 156,
};

const DOMAINS = [
  "neurological", "abdominal", "obstetric", "infection", "haemorrhage",
  "respiratory", "dehydration", "cardiac", "anaphylaxis", "poisoning",
  "mental-health",
];

/* ---------- primitives ---------- */

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
      <span className="h-1.5 w-1.5 rounded-full bg-[var(--emerald)] pulse-dot" />
      {children}
    </div>
  );
}

function SectionHead({ eyebrow, title, lede }: { eyebrow: string; title: React.ReactNode; lede?: string }) {
  return (
    <Reveal>
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="mt-5 text-balance text-3xl font-semibold tracking-tight sm:text-5xl">{title}</h2>
      {lede && <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-[var(--text-muted)] sm:text-base">{lede}</p>}
    </Reveal>
  );
}

/* ---------- hero consult demo ---------- */

const CONSULT = [
  { role: "user", text: "Chest pain since this morning, and my left arm aches." },
  { role: "sys", text: "extracting clinical state…" },
  { role: "halt", text: "cardiac.chest-pain-with-features — EMERGENCY" },
  { role: "out", text: "Stop here and seek emergency care now. Chest pain with arm radiation can be cardiac and is not something to assess at home." },
];

function ConsultDemo() {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce ? CONSULT.length : 0);

  useEffect(() => {
    if (reduce) return;
    if (shown >= CONSULT.length) {
      const r = setTimeout(() => setShown(0), 4200);
      return () => clearTimeout(r);
    }
    const t = setTimeout(() => setShown((s) => s + 1), shown === 0 ? 600 : 1150);
    return () => clearTimeout(t);
  }, [shown, reduce]);

  return (
    <div className="glass-strong glow-emerald w-full rounded-[var(--radius)] p-5 sm:p-6">
      <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-[color-mix(in_oklab,var(--blue)_18%,transparent)] text-sm">🩺</span>
          <div>
            <p className="text-sm font-semibold">Consult</p>
            <p className="text-[11px] text-[var(--text-dim)]">triage runs before the model answers</p>
          </div>
        </div>
        <span className="flex items-center gap-1.5 font-mono text-[11px] text-[var(--text-muted)]">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--emerald)]" />live
        </span>
      </div>

      <div className="mt-4 min-h-[248px] space-y-2.5">
        {CONSULT.slice(0, shown).map((s, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className={
              s.role === "user"
                ? "ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-[color-mix(in_oklab,var(--emerald)_20%,transparent)] px-3.5 py-2 text-sm text-white"
                : s.role === "sys"
                ? "w-fit font-mono text-[11px] tracking-wide text-[var(--text-dim)]"
                : s.role === "halt"
                ? "w-fit max-w-[92%] rounded-xl border border-[color-mix(in_oklab,var(--rose)_45%,transparent)] bg-[color-mix(in_oklab,var(--rose)_12%,transparent)] px-3.5 py-2 font-mono text-[11.5px] tracking-wide text-[#ffd7dd]"
                : "w-fit max-w-[92%] rounded-2xl rounded-bl-sm border border-[var(--border-strong)] bg-[var(--surface-2)] px-3.5 py-2.5 text-sm leading-relaxed"
            }
          >
            {s.text}
          </motion.div>
        ))}
        {shown < CONSULT.length && (
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

      <p className="mt-3 border-t border-[var(--border)] pt-3 text-[11px] leading-relaxed text-[var(--text-dim)]">
        A real transcript shape. The red line is code, not the model deciding to be careful.
      </p>
    </div>
  );
}

/* ---------- stat ---------- */
function Stat({ value, label, tint }: { value: string; label: string; tint: string }) {
  return (
    <div className="glass rounded-2xl px-4 py-4">
      <p className="font-mono text-2xl font-semibold tabular-nums sm:text-3xl" style={{ color: tint }}>{value}</p>
      <p className="mt-1 text-[12px] leading-snug text-[var(--text-muted)]">{label}</p>
    </div>
  );
}

/* =====================================================================
   LANDING
   ===================================================================== */

export default function Landing() {
  return (
    <main className="relative overflow-hidden">

      {/* ── Hero ───────────────────────────────────────────────── */}
      <section className="relative mx-auto grid max-w-6xl gap-12 px-5 pt-32 pb-20 lg:grid-cols-[1.05fr_.95fr] lg:items-center lg:pt-40">
        <div>
          <Eyebrow>Free · no account · nothing leaves your browser</Eyebrow>

          <h1 className="mt-6 text-balance text-4xl font-semibold leading-[1.04] tracking-tight sm:text-6xl">
            Describe what&rsquo;s wrong.
            <span className="block text-[var(--text-muted)]">Five specialists read it —</span>
            <span className="block">and a rule engine that can stop them.</span>
          </h1>

          <p className="mt-6 max-w-xl text-[15px] leading-relaxed text-[var(--text-muted)] sm:text-lg">
            Most AI health tools ask you to trust the model. NutritiScan runs {FACTS.rules} clinical
            rules <em className="not-italic text-[var(--text)]">before</em> the model reasons. If one
            fires, the consult ends and you are told to get real care — no matter how confident the
            model was about to sound.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/dashboard"
              className="rounded-full bg-[var(--emerald)] px-6 py-3 text-sm font-semibold text-[#03150e] transition hover:brightness-110"
            >
              Start a consult
            </Link>
            <Link
              href="#safety"
              className="rounded-full border border-[var(--border-strong)] px-6 py-3 text-sm font-medium text-[var(--text)] transition hover:bg-[var(--surface)]"
            >
              See the safety layer
            </Link>
          </div>

          <p className="mt-5 text-[12px] leading-relaxed text-[var(--text-dim)]">
            Educational triage and health reasoning. Not a diagnosis, and not a substitute for a
            doctor.
          </p>
        </div>

        <div className="relative">
          <ConsultDemo />
        </div>
      </section>

      {/* ── Numbers ────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 pb-24">
        <Reveal>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat value={String(FACTS.rules)} label={`clinical rules across ${FACTS.domains} domains`} tint="var(--rose)" />
            <Stat value={String(FACTS.specialists)} label="specialists behind one supervisor" tint="var(--blue)" />
            <Stat value={String(FACTS.tests)} label="tests, run on every change" tint="var(--emerald)" />
            <Stat value="0" label="health records on our servers" tint="var(--cyan)" />
          </div>
        </Reveal>
      </section>

      {/* ── The safety layer — the whole argument ──────────────── */}
      <section id="safety" className="mx-auto max-w-6xl px-5 py-24">
        <SectionHead
          eyebrow="The safety layer"
          title={<>A prompt is a request. <span className="text-[var(--rose)]">A rule is a guarantee.</span></>}
          lede="Nearly every AI health product handles emergencies by asking the model nicely, inside a system prompt. That instruction can be diluted by a long conversation, outvoted by a fluent answer, or simply not followed. There is usually no code path that can stop the model mid-sentence."
        />

        <div className="mt-12 grid gap-4 lg:grid-cols-3">
          {[
            {
              n: "01",
              h: "It runs first",
              p: `Your words become structured clinical state, then ${FACTS.rules} rules evaluate it — before retrieval, before any specialist reasons. Triage is the only component allowed to end a turn.`,
              c: "var(--rose)",
            },
            {
              n: "02",
              h: "It fails closed",
              p: "If a rule throws, the extractor crashes, or anything else breaks, the verdict floors at urgent — never routine. A safety check that did not run has not passed.",
              c: "var(--amber)",
            },
            {
              n: "03",
              h: "It only escalates",
              p: "A model may raise suspicion. Nothing — no specialist, no prompt, no amount of confidence — can lower a rule-derived verdict. The function that folds in model input has no way to express de-escalation.",
              c: "var(--blue)",
            },
          ].map((k, i) => (
            <Reveal key={k.n} delay={i * 0.08}>
              <div className="glass h-full rounded-[var(--radius)] p-6">
                <span className="font-mono text-[11px] tracking-widest" style={{ color: k.c }}>{k.n}</span>
                <h3 className="mt-3 text-lg font-semibold">{k.h}</h3>
                <p className="mt-2 text-[14.5px] leading-relaxed text-[var(--text-muted)]">{k.p}</p>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={0.1}>
          <div className="glass mt-4 rounded-[var(--radius)] p-6">
            <p className="font-mono text-[11px] tracking-widest text-[var(--text-dim)]">COVERED DOMAINS</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {DOMAINS.map((d) => (
                <span key={d} className="rounded-full border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-1 font-mono text-[11.5px] text-[var(--text-muted)]">
                  {d}
                </span>
              ))}
            </div>
            <p className="mt-4 text-[13px] leading-relaxed text-[var(--text-dim)]">
              {FACTS.emergency} rules halt the consult outright; {FACTS.urgent} mark it urgent and
              change how the answer is framed. Chest pain is covered three ways, because it presents
              atypically in diabetic and older patients and the obvious rule would miss exactly the
              people most at risk.
            </p>
          </div>
        </Reveal>
      </section>

      {/* ── Specialists ────────────────────────────────────────── */}
      <section id="agents" className="mx-auto max-w-6xl px-5 py-24">
        <SectionHead
          eyebrow="The panel"
          title="Five specialists, one supervisor"
          lede="A router reads the question and hands it to whichever specialist should own it. Each one sees only the slice of your record it needs — the fitness agent has no reason to read your lab panel, so it does not get it."
        />

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {AGENTS.map((a, i) => (
            <Reveal key={a.id} delay={i * 0.06}>
              <div className="glass h-full rounded-[var(--radius)] p-6" style={{ boxShadow: `0 20px 60px -40px ${a.color}` }}>
                <div className="flex items-center gap-3">
                  <span className="grid h-11 w-11 place-items-center rounded-xl text-xl" style={{ background: `${a.color}22` }}>{a.glyph}</span>
                  <div>
                    <h3 className="text-base font-semibold">{a.name}</h3>
                    <p className="text-[12px]" style={{ color: a.color }}>{a.tagline}</p>
                  </div>
                </div>
                <ul className="mt-4 space-y-1.5">
                  {a.knows.map((k) => (
                    <li key={k} className="flex items-start gap-2 text-[13.5px] text-[var(--text-muted)]">
                      <span className="mt-[7px] h-1 w-1 flex-none rounded-full" style={{ background: a.color }} />
                      {k}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          ))}

          <Reveal delay={0.3}>
            <div className="glass flex h-full flex-col justify-center rounded-[var(--radius)] border-dashed p-6">
              <p className="font-mono text-[11px] tracking-widest text-[var(--text-dim)]">SUPERVISOR</p>
              <p className="mt-3 text-[14.5px] leading-relaxed text-[var(--text-muted)]">
                Routes the question, holds the full record, and assembles the answer — but it never
                gets to overrule triage.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Honesty in the output ──────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 py-24">
        <SectionHead
          eyebrow="How it answers"
          title="Confidence you can audit"
          lede="Every clinical answer is forced into the same shape — facts, inference, recommendation, warning, confidence — so nothing important can be quietly dropped."
        />

        <Reveal delay={0.08}>
          <div className="mt-10 grid gap-4 lg:grid-cols-2">
            <div className="glass rounded-[var(--radius)] p-6">
              <h3 className="text-lg font-semibold">Confidence is derived, not asserted</h3>
              <p className="mt-2 text-[14.5px] leading-relaxed text-[var(--text-muted)]">
                Insights carry a calibrated category — known, likely, possible, unknown — computed
                from how much data actually supports them. The product will tell you it does not
                know. It will not invent an &ldquo;87% chance&rdquo;.
              </p>
            </div>
            <div className="glass rounded-[var(--radius)] p-6">
              <h3 className="text-lg font-semibold">Numbers come from code, not the model</h3>
              <p className="mt-2 text-[14.5px] leading-relaxed text-[var(--text-muted)]">
                Macros and micronutrients are computed by a tested engine, Indian staples first. A
                food it cannot resolve contributes nothing at all — no silent guess folded into your
                B12 or iron totals.
              </p>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ── Privacy ────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 py-24">
        <div className="glass-strong rounded-[var(--radius)] p-8 sm:p-12">
          <SectionHead
            eyebrow="Privacy"
            title="Your health record stays in your browser"
            lede="There is no account, no server-side profile and no analytics on your health data. What you type is used for the consult and stored locally on your device — which also means clearing your browser clears it, and it does not follow you to another one."
          />
          <Reveal delay={0.1}>
            <p className="mt-6 max-w-3xl text-[13px] leading-relaxed text-[var(--text-dim)]">
              Being straight about the trade-off: local storage is readable by scripts on this
              origin and is not encrypted at rest. Server-side records with real provenance and an
              audit trail are the next thing being built, and consent and export come with them.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── Honest limits ──────────────────────────────────────── */}
      <section id="limits" className="mx-auto max-w-6xl px-5 py-24">
        <SectionHead
          eyebrow="Limits"
          title="What this is not"
          lede="Most health products bury this in a footer. It belongs here, because knowing where a tool stops is part of using it safely."
        />

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {[
            ["Not a diagnosis", "It reasons about symptoms and flags risk. It cannot examine you, order a test, or be right about the thing it never saw."],
            ["No clinician has signed off yet", "The rules were written against published emergency-medicine criteria, but no licensed doctor has reviewed them. The review field exists in the code and is still empty."],
            ["Not for emergencies", "If something is severe or sudden, do not open a chat. Call your local emergency number."],
            ["Not a prescriber", "It will never recommend a prescription medicine or a dose."],
          ].map(([h, p], i) => (
            <Reveal key={h} delay={i * 0.06}>
              <div className="glass h-full rounded-[var(--radius)] border-[color-mix(in_oklab,var(--amber)_25%,transparent)] p-6">
                <h3 className="text-base font-semibold text-[var(--amber)]">{h}</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-[var(--text-muted)]">{p}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Capability breadth ─────────────────────────────────── */}
      <section id="capabilities" className="mx-auto max-w-6xl px-5 py-24">
        <SectionHead
          eyebrow="What you can bring it"
          title="One consult that does it all"
          lede="Symptoms, a lab report, last night's dinner, the medicine you were told to take — it is one conversation, and the specialists share the same record rather than making you repeat yourself."
        />

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { g: "🩺", h: "Symptoms", p: "Describe what you feel in your own words. It asks the follow-ups a clinician would, and triage watches every turn.", c: "var(--blue)" },
            { g: "🧪", h: "Lab reports", p: "CBC, thyroid, vitamin panels. It reads the values back in plain language and tracks them over time instead of judging one number in isolation.", c: "var(--violet)" },
            { g: "🥗", h: "Meals", p: "Photograph a plate or a label. Macros and micros are computed by tested code — an unrecognised food contributes nothing rather than a guess.", c: "var(--emerald)" },
            { g: "💊", h: "Medicines", p: "Tell it what you take so the rest of the reasoning knows. It will never recommend a prescription medicine or a dose.", c: "var(--rose)" },
            { g: "🏋️", h: "Fitness", p: "Training, progression, recovery and body composition, informed by what your labs and nutrition actually say.", c: "var(--cyan)" },
            { g: "🧭", h: "Habits", p: "Sleep, goals and the follow-ups that make any of the above matter more than a single good week.", c: "var(--amber)" },
          ].map((k, i) => (
            <Reveal key={k.h} delay={i * 0.05}>
              <div className="glass h-full rounded-[var(--radius)] p-6">
                <span className="grid h-11 w-11 place-items-center rounded-xl text-xl" style={{ background: `${k.c}22` }}>{k.g}</span>
                <h3 className="mt-4 text-base font-semibold">{k.h}</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-[var(--text-muted)]">{k.p}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Worked examples ────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 py-24">
        <SectionHead
          eyebrow="Worked examples"
          title="What a consult actually looks like"
          lede="Illustrative cases, not user reviews — these are the paths the system is built to take."
        />

        <div className="mt-12 grid gap-4 lg:grid-cols-3">
          {[
            {
              q: "“Sudden worst headache of my life.”",
              verdict: "HALTED",
              tone: "var(--rose)",
              a: "A neurological rule fires before any specialist reasons. The consult ends with an instruction to seek emergency care — no differential, no reassurance, no discussion.",
            },
            {
              q: "“My B12 came back at 180.”",
              verdict: "ROUTINE",
              tone: "var(--violet)",
              a: "The Lab agent reads it against the range printed on your report rather than a universal cutoff, explains what low B12 tends to mean, and says plainly when a doctor should confirm it.",
            },
            {
              q: "“Am I getting enough protein?”",
              verdict: "ROUTINE",
              tone: "var(--emerald)",
              a: "The Nutrition agent answers from computed totals, not an estimate, and marks its confidence by how many days of real meals it actually has to work from.",
            },
          ].map((k, i) => (
            <Reveal key={k.q} delay={i * 0.07}>
              <div className="glass h-full rounded-[var(--radius)] p-6">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-[15px] font-medium leading-snug">{k.q}</p>
                  <span className="flex-none rounded-full border px-2 py-0.5 font-mono text-[10px] tracking-widest" style={{ color: k.tone, borderColor: `${k.tone}55` }}>{k.verdict}</span>
                </div>
                <p className="mt-3 text-[14px] leading-relaxed text-[var(--text-muted)]">{k.a}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Engineering ────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 py-24">
        <SectionHead
          eyebrow="Read the engineering"
          title="Nothing here is a black box"
          lede="The architecture, the data model, the safety layers and the evaluation plan are written down and public — including an honest list of what is still missing."
        />

        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ["ARCHITECTURE.md", "The system, and a gap analysis ordered by risk"],
            ["SAFETY.md", "The seven layers and the red-flag rules"],
            ["ORCHESTRATION.md", "ClinicalState, the reasoning loop, the agents"],
            ["DATA.md", "Schema, provenance, retention, privacy"],
            ["API.md", "HTTP contracts, auth, audit, error envelope"],
            ["EVALUATION.md", "Golden dataset, suites and CI gates"],
          ].map(([f, d], i) => (
            <Reveal key={f} delay={i * 0.04}>
              <a
                href={`https://github.com/Adarsh-9182/nutritiscan-ai/blob/main/docs/${f}`}
                target="_blank"
                rel="noopener"
                className="glass block h-full rounded-2xl p-5 transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)]"
              >
                <p className="font-mono text-[12.5px] text-[var(--emerald)]">{f}</p>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-[var(--text-muted)]">{d}</p>
              </a>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── FAQ ────────────────────────────────────────────────── */}
      <section id="faq" className="mx-auto max-w-4xl px-5 py-24">
        <SectionHead eyebrow="Questions" title="Before you start" />

        <div className="mt-10 divide-y divide-[var(--border)]">
          {[
            ["Is this a real doctor?", "No. It is an AI system. It reasons about symptoms, reads reports and flags risk, and it is built to tell you when something needs a person instead. No licensed clinician has reviewed its rules yet, and it says so."],
            ["What happens in an emergency?", "Do not use it — call your local emergency number. If you describe something the rules recognise as an emergency anyway, the consult stops immediately and tells you to get care. That behaviour is code, so it does not depend on the model cooperating."],
            ["Where does my data go?", "Into your browser's local storage and nowhere else. There is no account and no server-side health record. Clearing your browser clears it, and it will not follow you to another device."],
            ["Can it prescribe or change my medication?", "No, and it is built not to. It can explain what you are taking and take it into account, but it will not recommend a prescription medicine or a dose."],
            ["Why is it free?", "Because it has not earned a price. There is no clinician review and no human doctor to hand you to. When those exist, this answer changes."],
            ["Can I see how it works?", "Yes — the whole thing is public, including the triage rules, the tests and a written list of what is still missing."],
          ].map(([q, a], i) => (
            <Reveal key={q} delay={i * 0.04}>
              <details className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[15.5px] font-medium">
                  {q}
                  <span className="flex-none text-[var(--text-dim)] transition group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 max-w-2xl text-[14.5px] leading-relaxed text-[var(--text-muted)]">{a}</p>
              </details>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Price ──────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 py-24">
        <SectionHead eyebrow="Price" title="Free, and honest about why" />
        <Reveal delay={0.08}>
          <div className="glass mt-10 rounded-[var(--radius)] p-8">
            <p className="font-mono text-5xl font-semibold tabular-nums text-[var(--emerald)]">₹0</p>
            <p className="mt-4 max-w-2xl text-[14.5px] leading-relaxed text-[var(--text-muted)]">
              Unlimited consults, every specialist, the full safety layer. There is no paid tier and
              no card field, because the product has not earned one yet — it has no clinician review
              and no human care to hand you off to. Both are on the roadmap, and the price will
              change when they land.
            </p>
          </div>
        </Reveal>
      </section>

      {/* ── Close ──────────────────────────────────────────────── */}
      <section className="mx-auto max-w-4xl px-5 py-28 text-center">
        <Reveal>
          <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-5xl">
            Ask it something you&rsquo;d otherwise google at 2am.
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-[var(--text-muted)]">
            No sign-up, no card, nothing stored on a server. If it should be a real doctor, it will
            say so first.
          </p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <Link
              href="/dashboard"
              className="rounded-full bg-[var(--emerald)] px-7 py-3.5 text-sm font-semibold text-[#03150e] transition hover:brightness-110"
            >
              Start a consult
            </Link>
            <a
              href="https://github.com/Adarsh-9182/nutritiscan-ai"
              target="_blank"
              rel="noopener"
              className="rounded-full border border-[var(--border-strong)] px-7 py-3.5 text-sm font-medium transition hover:bg-[var(--surface)]"
            >
              Read the source
            </a>
          </div>
        </Reveal>
      </section>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <footer className="border-t border-[var(--border)] px-5 pb-16 pt-14">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-[color-mix(in_oklab,var(--emerald)_18%,transparent)] text-sm">🩺</span>
                <span className="font-semibold">NutritiScan</span>
              </div>
              <p className="mt-3 max-w-[30ch] text-[13px] leading-relaxed text-[var(--text-muted)]">
                An AI health agent with a deterministic safety layer underneath it.
              </p>
            </div>

            {[
              {
                h: "Product",
                links: [
                  ["Start a consult", "/dashboard"],
                  ["Scan a meal", "/scan"],
                  ["Timeline", "/timeline"],
                  ["The safety layer", "#safety"],
                  ["Specialists", "#agents"],
                ],
              },
              {
                h: "Engineering",
                links: [
                  ["Source", "https://github.com/Adarsh-9182/nutritiscan-ai"],
                  ["Architecture", "https://github.com/Adarsh-9182/nutritiscan-ai/blob/main/docs/ARCHITECTURE.md"],
                  ["Safety layers", "https://github.com/Adarsh-9182/nutritiscan-ai/blob/main/docs/SAFETY.md"],
                  ["Evaluation", "https://github.com/Adarsh-9182/nutritiscan-ai/blob/main/docs/EVALUATION.md"],
                ],
              },
              {
                h: "Help",
                links: [
                  ["Questions", "#faq"],
                  ["What this is not", "#limits"],
                  ["Report an issue", "https://github.com/Adarsh-9182/nutritiscan-ai/issues"],
                ],
              },
            ].map((col) => (
              <div key={col.h}>
                <p className="font-mono text-[11px] tracking-widest text-[var(--text-dim)]">{col.h.toUpperCase()}</p>
                <ul className="mt-4 space-y-2.5">
                  {col.links.map(([label, href]) => (
                    <li key={label}>
                      {href.startsWith("http") ? (
                        <a href={href} target="_blank" rel="noopener" className="text-[13.5px] text-[var(--text-muted)] transition hover:text-[var(--text)]">
                          {label}
                        </a>
                      ) : (
                        <Link href={href} className="text-[13.5px] text-[var(--text-muted)] transition hover:text-[var(--text)]">
                          {label}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* The disclaimer is the loudest thing down here on purpose. */}
          <div className="mt-12 rounded-2xl border border-[color-mix(in_oklab,var(--amber)_28%,transparent)] bg-[color-mix(in_oklab,var(--amber)_7%,transparent)] p-5">
            <p className="text-[13px] font-semibold text-[var(--amber)]">Medical disclaimer</p>
            <p className="mt-2 max-w-4xl text-[13px] leading-relaxed text-[var(--text-muted)]">
              NutritiScan is an AI system, not a licensed doctor, and does not provide medical
              advice, diagnosis or treatment. Its clinical rules have not been reviewed by a
              clinician. Nothing here replaces professional care, and you should not delay seeking
              it because of something this product said.{" "}
              <strong className="text-[var(--text)]">
                In an emergency, contact your local emergency services immediately — in India, dial
                112.
              </strong>
            </p>
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-[var(--border)] pt-6">
            <p className="font-mono text-[11.5px] text-[var(--text-dim)]">
              © {new Date().getFullYear()} NutritiScan · built in India
            </p>
            <p className="font-mono text-[11.5px] text-[var(--text-dim)]">
              {FACTS.rules} rules · {FACTS.tests} tests · no health data on our servers
            </p>
          </div>
        </div>
      </footer>
    </main>
  );
}
