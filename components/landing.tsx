"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { AGENTS } from "@/lib/agents-meta";
import { useProfile } from "@/lib/memory/store";

/*
 * The consult is loaded on demand, not with the page.
 *
 * It pulls in the chat runtime, the transport and the transcript store — a
 * cost worth paying the moment someone types, and worth avoiding for the
 * majority who are still reading. Client-only because the transcript can
 * only be restored in the browser (see components/chat.tsx).
 */
const Chat = dynamic(() => import("@/components/chat"), {
  ssr: false,
  loading: () => (
    <div className="grid min-h-[420px] place-items-center text-[13px] text-[var(--m-dim)]">
      Opening the consult…
    </div>
  ),
});

/* =====================================================================
   NUTRITISCAN — landing

   Light, quiet and wide. The rest of the product is a dark instrument
   panel; this page is the front door, and a front door for a health
   product should feel like daylight rather than a control room.

   The page has one job above all others: get the first sentence typed.
   So the hero is not a picture of a chat, it is the chat — the input
   here is the real one, and what you type is carried into the consult.

   Light tokens are scoped to `.mkt` rather than set globally, because
   /dashboard, /scan and /timeline are designed for the dark palette and
   converting them is a separate job.

   Every number is read off the repository.
   ===================================================================== */

const FACTS = { rules: 38, domains: 11, specialists: 5, tests: 192 };

const PROMPTS = [
  "I've had a fever since yesterday",
  "My B12 came back at 180",
  "Am I getting enough protein?",
  "Trouble sleeping for two weeks",
];

/* ---------- primitives ---------- */

function Reveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--m-dim)]">{children}</p>
  );
}

/* ---------- nav ---------- */

/**
 * The page had none at all, which is why it read as a document rather than a
 * product: nothing named the thing, nothing let you leave the scroll, and
 * the only way back to the top was to scroll there.
 *
 * Borderless until the page moves, so the hero opens on clean ground and the
 * rule only appears once there is content above it to separate from.
 */
function SiteNav({ onStart }: { onStart: () => void }) {
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const onScroll = () => setStuck(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 backdrop-blur-md transition-colors duration-300 ${
        stuck ? "border-b border-[var(--m-rule)] bg-[color-mix(in_srgb,var(--m-bg)_82%,transparent)]" : "border-b border-transparent"
      }`}
    >
      <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3.5">
        <a href="#top" className="flex items-center gap-2.5">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-[var(--m-accent)] text-[13px] font-semibold text-white">
            N
          </span>
          <span className="text-[15px] font-semibold tracking-[-0.01em]">NutritiScan</span>
        </a>

        <nav className="hidden items-center gap-7 md:flex">
          {[
            ["How it works", "#how"],
            ["Safety layer", "#safety"],
            ["Specialists", "#panel"],
            ["Founder", "#founder"],
          ].map(([label, href]) => (
            <a
              key={href}
              href={href}
              className="text-[13.5px] text-[var(--m-muted)] transition-colors hover:text-[var(--m-ink)]"
            >
              {label}
            </a>
          ))}
        </nav>

        <button
          onClick={onStart}
          className="rounded-full bg-[var(--m-ink)] px-4 py-2 text-[13px] font-medium text-white transition hover:opacity-90"
        >
          Start consult
        </button>
      </div>
    </header>
  );
}

/* ---------- the hero input: the actual front door ---------- */

function Ask({ onStart }: { onStart: (text: string) => void }) {
  const [value, setValue] = useState("");

  const fieldRef = useRef<HTMLInputElement>(null);

  function start(text: string) {
    const q = text.trim();
    // Nothing typed yet: put the cursor where it needs to go rather than
    // doing nothing, which is what a disabled button felt like.
    if (!q) {
      fieldRef.current?.focus();
      return;
    }
    onStart(q);
  }

  return (
    <div className="w-full">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          start(value);
        }}
        className="group relative rounded-2xl border border-[var(--m-rule-2)] bg-white shadow-[0_1px_2px_rgba(16,22,28,.04),0_12px_32px_-16px_rgba(16,22,28,.12)] transition focus-within:border-[var(--m-accent)] focus-within:shadow-[0_1px_2px_rgba(16,22,28,.04),0_16px_44px_-18px_rgba(11,122,85,.28)]"
      >
        <label htmlFor="ask" className="sr-only">
          Describe your symptom or question
        </label>
        <input
          ref={fieldRef}
          id="ask"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Describe what's going on…"
          autoComplete="off"
          className="w-full bg-transparent px-5 py-5 text-[16.5px] text-[var(--m-ink)] outline-none placeholder:text-[var(--m-dim)] sm:px-6 sm:py-6 sm:text-[17.5px]"
        />
        <div className="flex items-center justify-between gap-3 border-t border-[var(--m-rule)] px-4 py-3 sm:px-5">
          <span className="text-[12px] text-[var(--m-dim)]">
            Free · no account · stays in your browser
          </span>
          <button
            type="submit"
            className="rounded-full bg-[var(--m-accent)] px-5 py-2.5 text-[13.5px] font-medium text-white shadow-[0_1px_2px_rgba(11,122,85,.2)] transition hover:bg-[var(--m-accent-deep)]"
          >
            Start consult
          </button>
        </div>
      </form>

      <div className="mt-4 flex flex-wrap gap-2">
        {PROMPTS.map((p) => (
          <button
            key={p}
            onClick={() => start(p)}
            className="rounded-full border border-[var(--m-rule-2)] bg-white px-3.5 py-2 text-[13px] text-[var(--m-muted)] transition hover:border-[var(--m-accent)] hover:text-[var(--m-accent)]"
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}

/* =====================================================================
   LANDING
   ===================================================================== */

export default function Landing() {
  const [profile] = useProfile();
  const [consulting, setConsulting] = useState(false);

  /*
   * Typing starts the consult here rather than routing to /dashboard.
   *
   * A page change between "I typed my symptom" and "something is reading it"
   * reads as a form submission — you fill a thing in and get taken elsewhere.
   * The product is the conversation, so the conversation opens where it was
   * started. The question is handed over the same way as before, through
   * sessionStorage, which chat.tsx reads once and clears on mount.
   */
  function startConsult(text: string) {
    try {
      // The nav button opens an empty consult; only a real question is parked.
      if (text.trim()) sessionStorage.setItem("nutritiscan:pending", text);
    } catch {
      /* private mode — the consult opens empty and the person retypes */
    }
    // Swapping the page's contents does not move the viewport, so starting a
    // consult from the second Ask — halfway down a long page — left people
    // scrolled past the conversation they had just opened, looking at
    // nothing. Reset before the swap so the consult begins where it should.
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    setConsulting(true);
  }

  if (consulting) {
    return (
      <div className="flex min-h-screen flex-col bg-[var(--bg)]">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3">
          <span className="text-[14px] font-semibold text-[var(--text)]">NutritiScan</span>
          <button
            onClick={() => setConsulting(false)}
            className="text-[13px] text-[var(--text-muted)] transition hover:text-[var(--text)]"
          >
            Close
          </button>
        </div>
        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-4">
          <Chat profile={profile} />
        </div>
      </div>
    );
  }

  return (
    <div
      className="mkt min-h-screen"
      style={
        {
          // Scoped light palette. A green-biased neutral rather than pure
          // white, so the page reads as chosen and sits with the accent.
          "--m-bg": "#fafbfa",
          "--m-panel": "#f3f5f3",
          "--m-ink": "#10161c",
          "--m-muted": "#5b6672",
          "--m-dim": "#8b949d",
          "--m-rule": "#e8ebe8",
          "--m-rule-2": "#d9ded9",
          "--m-accent": "#0b7a55",
          "--m-accent-deep": "#095f43",
          "--m-accent-soft": "#eaf4ef",
          "--m-alert": "#b3341f",
          "--m-alert-soft": "#fdf0ed",
          background: "var(--m-bg)",
          color: "var(--m-ink)",
        } as React.CSSProperties
      }
    >
      {/*
        globals.css paints the body dark for the product surfaces. This page
        is light, and without this the dark ground shows through on overscroll
        bounce and behind the browser's own chrome on mobile.
      */}
      <style>{`body{background:#fafbfa}`}</style>

      <SiteNav onStart={() => startConsult("")} />

      {/* ── Hero ───────────────────────────────────────────────── */}
      <section id="top" className="relative mx-auto max-w-3xl px-5 pt-20 pb-24 text-center sm:pt-28">
        {/*
          A single soft bloom behind the input, sized so it reads as depth
          rather than decoration. The page is otherwise flat by choice — one
          light source, and it sits where the eye is meant to go.
        */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-[38%] z-0 h-[420px] w-[720px] max-w-[120vw] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-[0.55] blur-3xl"
          style={{
            background:
              "radial-gradient(closest-side, color-mix(in oklab, var(--m-accent) 16%, transparent), transparent)",
          }}
        />

        <div className="relative z-10">
        <Reveal>
          <span className="inline-flex items-center gap-2 rounded-full border border-[var(--m-rule-2)] bg-white px-3 py-1 text-[12px] text-[var(--m-muted)] shadow-[0_1px_2px_rgba(16,22,28,.04)]">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--m-accent)] opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--m-accent)]" />
            </span>
            AI health agent · free
          </span>

          <h1 className="mt-7 text-balance text-[42px] font-semibold leading-[1.02] tracking-[-0.035em] sm:text-[68px]">
            Tell it what&rsquo;s wrong.
          </h1>
          <p className="mx-auto mt-6 max-w-[34rem] text-balance text-[17px] leading-[1.6] text-[var(--m-muted)] sm:text-[19px]">
            Five specialists read your answer — and a rule engine reads it first, so if this
            should be a doctor, you are told before anything else is said.
          </p>
        </Reveal>

        <Reveal delay={0.08}>
          <div className="mt-10 text-left">
            <Ask onStart={startConsult} />
          </div>
        </Reveal>

        <Reveal delay={0.14}>
          <p className="mt-8 text-[12.5px] leading-relaxed text-[var(--m-dim)]">
            Educational triage and health reasoning. Not a diagnosis, and not a substitute for a
            doctor.
          </p>
        </Reveal>
        </div>
      </section>

      {/* ── How it works ───────────────────────────────────────── */}
      <section id="how" className="border-t border-[var(--m-rule)] px-5 py-24">
        <div className="mx-auto max-w-5xl">
          <Reveal>
            <Label>How a consult runs</Label>
            <h2 className="mt-4 max-w-2xl text-balance text-[28px] font-semibold leading-tight tracking-[-0.025em] sm:text-[40px]">
              Checked before it answers, not after.
            </h2>
          </Reveal>

          <div className="mt-14 grid gap-10 sm:grid-cols-3">
            {[
              {
                n: "01",
                h: "Your words become structure",
                p: "What you type is turned into clinical state — findings, what you denied, your risk factors — so the rest of the system has something it can actually check.",
              },
              {
                n: "02",
                h: "Rules run first",
                p: `${FACTS.rules} clinical rules read that state before any specialist reasons. If one fires, the consult stops there and sends you to real care.`,
              },
              {
                n: "03",
                h: "Then the panel answers",
                p: "A supervisor routes the question to whichever specialist owns it, and each one sees only the part of your record it needs.",
              },
            ].map((s, i) => (
              <Reveal key={s.n} delay={i * 0.07}>
                <div>
                  <span className="text-[12px] font-medium tracking-widest text-[var(--m-accent)]">{s.n}</span>
                  <h3 className="mt-3 text-[18px] font-semibold tracking-[-0.015em]">{s.h}</h3>
                  <p className="mt-2.5 text-[15px] leading-relaxed text-[var(--m-muted)]">{s.p}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── The halt, shown ────────────────────────────────────── */}
      <section id="safety" className="border-t border-[var(--m-rule)] px-5 py-24">
        <div className="mx-auto grid max-w-5xl items-center gap-14 lg:grid-cols-2">
          <Reveal>
            <div>
              <Label>The safety layer</Label>
              <h2 className="mt-4 text-balance text-[28px] font-semibold leading-tight tracking-[-0.025em] sm:text-[40px]">
                A prompt is a request. A rule is a guarantee.
              </h2>
              <p className="mt-5 max-w-lg text-[15.5px] leading-relaxed text-[var(--m-muted)]">
                Most AI health tools handle emergencies by asking the model nicely inside a system
                prompt. That instruction can be diluted by a long conversation or outvoted by a
                fluent answer, and usually nothing in the code can stop the model mid-sentence.
              </p>

              <dl className="mt-8 space-y-5">
                {[
                  ["It runs first", "Before retrieval, before reasoning. Triage is the only component allowed to end a turn."],
                  ["It fails closed", "If anything breaks, the verdict floors at urgent — never routine. A check that did not run has not passed."],
                  ["It only escalates", "A model may raise suspicion. Nothing can lower a rule-derived verdict; the code has no way to express it."],
                ].map(([h, p]) => (
                  <div key={h} className="border-l-2 border-[var(--m-accent)] pl-4">
                    <dt className="text-[15px] font-semibold">{h}</dt>
                    <dd className="mt-1 text-[14.5px] leading-relaxed text-[var(--m-muted)]">{p}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </Reveal>

          <Reveal delay={0.1}>
            <div className="rounded-2xl border border-[var(--m-rule-2)] bg-white p-6 shadow-[0_1px_2px_rgba(16,22,28,.04),0_20px_50px_-30px_rgba(16,22,28,.25)]">
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--m-dim)]">
                A consult that does not get answered
              </p>

              <div className="mt-5 space-y-3">
                <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-[var(--m-panel)] px-4 py-2.5 text-[14.5px]">
                  Chest pain since this morning, and my left arm aches.
                </div>

                <div className="rounded-xl border border-[color-mix(in_oklab,var(--m-alert)_28%,transparent)] bg-[var(--m-alert-soft)] px-4 py-3">
                  <p className="font-mono text-[11.5px] tracking-wide text-[var(--m-alert)]">
                    cardiac.chest-pain-with-features → EMERGENCY
                  </p>
                  <p className="mt-2 text-[14px] leading-relaxed text-[var(--m-ink)]">
                    Stop here and seek emergency care now. Chest pain with arm radiation can be
                    cardiac and is not something to assess at home.
                  </p>
                </div>
              </div>

              <p className="mt-5 border-t border-[var(--m-rule)] pt-4 text-[12.5px] leading-relaxed text-[var(--m-dim)]">
                The red block is code, not the model choosing to be careful. Chest pain is covered
                three ways, because it presents atypically in diabetic and older patients and the
                obvious rule would miss the people most at risk.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── The panel ──────────────────────────────────────────── */}
      <section id="panel" className="border-t border-[var(--m-rule)] px-5 py-24">
        <div className="mx-auto max-w-5xl">
          <Reveal>
            <Label>The panel</Label>
            <h2 className="mt-4 max-w-2xl text-balance text-[28px] font-semibold leading-tight tracking-[-0.025em] sm:text-[40px]">
              Five specialists, one supervisor.
            </h2>
            <p className="mt-5 max-w-xl text-[15.5px] leading-relaxed text-[var(--m-muted)]">
              A router hands the question to whichever specialist should own it. The fitness agent
              has no reason to read your lab panel, so it does not get it.
            </p>
          </Reveal>

          <div className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-[var(--m-rule-2)] bg-[var(--m-rule-2)] sm:grid-cols-2 lg:grid-cols-3">
            {AGENTS.map((a, i) => (
              <Reveal key={a.id} delay={i * 0.05}>
                <div className="h-full bg-white p-6">
                  <span className="text-[22px]">{a.glyph}</span>
                  <h3 className="mt-3 text-[16px] font-semibold">{a.name}</h3>
                  <p className="mt-1 text-[13px] text-[var(--m-accent)]">{a.tagline}</p>
                  <ul className="mt-4 space-y-1.5">
                    {a.knows.map((k) => (
                      <li key={k} className="text-[13.5px] text-[var(--m-muted)]">
                        {k}
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            ))}
            <Reveal delay={0.3}>
              <div className="flex h-full flex-col justify-center bg-[var(--m-accent-soft)] p-6">
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--m-accent)]">
                  Supervisor
                </p>
                <p className="mt-3 text-[14px] leading-relaxed text-[var(--m-muted)]">
                  Routes the question and assembles the answer — but never gets to overrule triage.
                </p>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── What you can bring ─────────────────────────────────── */}
      <section className="border-t border-[var(--m-rule)] px-5 py-24">
        <div className="mx-auto max-w-5xl">
          <Reveal>
            <Label>One consult</Label>
            <h2 className="mt-4 max-w-2xl text-balance text-[28px] font-semibold leading-tight tracking-[-0.025em] sm:text-[40px]">
              Bring it anything, once.
            </h2>
          </Reveal>

          <div className="mt-12 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
            {[
              ["Symptoms", "Describe it in your own words. It asks the follow-ups a clinician would."],
              ["Lab reports", "Read against the range printed on your report, not a universal cutoff."],
              ["Meals", "Macros computed by tested code. An unrecognised food contributes nothing."],
              ["Medicines", "Taken into account throughout. It will never recommend one or a dose."],
              ["Fitness", "Training and recovery, informed by what your labs actually say."],
              ["Habits", "Sleep and goals, and the follow-ups that make the rest matter."],
            ].map(([h, p], i) => (
              <Reveal key={h} delay={i * 0.04}>
                <div className="border-t border-[var(--m-rule)] pt-5">
                  <h3 className="text-[15.5px] font-semibold">{h}</h3>
                  <p className="mt-2 text-[14.5px] leading-relaxed text-[var(--m-muted)]">{p}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Privacy + limits ───────────────────────────────────── */}
      <section className="border-t border-[var(--m-rule)] px-5 py-24">
        <div className="mx-auto grid max-w-5xl gap-12 lg:grid-cols-2">
          <Reveal>
            <div>
              <Label>Privacy</Label>
              <h2 className="mt-4 text-balance text-[24px] font-semibold leading-tight tracking-[-0.02em] sm:text-[32px]">
                Your record stays in your browser.
              </h2>
              <p className="mt-4 text-[15px] leading-relaxed text-[var(--m-muted)]">
                No account, no server-side profile, no analytics on your health data. Clearing your
                browser clears it — and being straight about the trade-off, local storage is not
                encrypted and does not follow you to another device.
              </p>
            </div>
          </Reveal>

          <Reveal delay={0.08}>
            <div>
              <Label>Limits</Label>
              <h2 className="mt-4 text-balance text-[24px] font-semibold leading-tight tracking-[-0.02em] sm:text-[32px]">
                What this is not.
              </h2>
              <ul className="mt-4 space-y-3">
                {[
                  "Not a diagnosis. It cannot examine you or order a test.",
                  "No clinician has reviewed the rules yet. The field exists in the code and is still empty.",
                  "Not for emergencies — call your local emergency number.",
                  "Not a prescriber. It will never recommend a prescription medicine or a dose.",
                ].map((l) => (
                  <li key={l} className="flex gap-3 text-[14.5px] leading-relaxed text-[var(--m-muted)]">
                    <span className="mt-[9px] h-1 w-1 flex-none rounded-full bg-[var(--m-alert)]" />
                    {l}
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Founder ────────────────────────────────────────────── */}
      <section id="founder" className="border-t border-[var(--m-rule)] px-5 py-24">
        <div className="mx-auto max-w-5xl">
          <Reveal>
            <Label>Founder</Label>
            <h2 className="mt-4 max-w-2xl text-balance text-[28px] font-semibold leading-tight tracking-[-0.025em] sm:text-[40px]">
              Built by one person, in the open.
            </h2>
          </Reveal>

          <Reveal delay={0.08}>
            <div className="mt-12 grid gap-10 border-t border-[var(--m-rule)] pt-8 lg:grid-cols-[auto_1fr]">
              <div className="flex items-center gap-4">
                <span className="grid h-14 w-14 flex-none place-items-center rounded-2xl bg-[var(--m-accent)] text-[17px] font-semibold text-white">
                  AB
                </span>
                <div>
                  <p className="text-[16px] font-semibold">Adarsh Bhardwaj</p>
                  <p className="mt-1 text-[13.5px] text-[var(--m-muted)]">Founder &amp; AI engineer</p>
                </div>
              </div>

              <div className="max-w-2xl">
                <p className="text-[15px] leading-relaxed text-[var(--m-muted)]">
                  NutritiScan is designed and built by Adarsh Bhardwaj, an AI engineer working on
                  agent systems and LLM infrastructure — the specialist roster, the supervisor that
                  routes between them, the deterministic triage engine underneath, and the tested
                  code that computes every number this product quotes.
                </p>
                <p className="mt-4 text-[15px] leading-relaxed text-[var(--m-muted)]">
                  The repository is public on purpose. Every claim on this page — the rule count,
                  the fail-closed behaviour, the arithmetic — can be read in the source rather than
                  taken on trust.
                </p>
                <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2">
                  {[
                    ["adarshbhardwaj.space", "https://adarshbhardwaj.space"],
                    ["github.com/Adarsh-9182", "https://github.com/Adarsh-9182"],
                  ].map(([label, href]) => (
                    <a
                      key={href}
                      href={href}
                      target="_blank"
                      rel="noopener"
                      className="text-[13.5px] text-[var(--m-muted)] underline decoration-[var(--m-rule)] underline-offset-4 transition hover:text-[var(--m-ink)]"
                    >
                      {label}
                    </a>
                  ))}
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Close ──────────────────────────────────────────────── */}
      <section className="border-t border-[var(--m-rule)] px-5 py-28">
        <div className="mx-auto max-w-2xl text-center">
          <Reveal>
            <h2 className="text-balance text-[30px] font-semibold leading-tight tracking-[-0.025em] sm:text-[44px]">
              Ask it something you&rsquo;d otherwise google at 2am.
            </h2>
            <p className="mx-auto mt-5 max-w-lg text-[16px] leading-relaxed text-[var(--m-muted)]">
              No sign-up, no card, nothing stored on a server. If it should be a real doctor, it
              says so first.
            </p>
            <div className="mt-9 text-left">
              <Ask onStart={startConsult} />
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <footer className="border-t border-[var(--m-rule)] px-5 pb-16 pt-14">
        <div className="mx-auto max-w-5xl">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-[15px] font-semibold">NutritiScan</p>
              <p className="mt-2 max-w-[28ch] text-[13.5px] leading-relaxed text-[var(--m-muted)]">
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
                ],
              },
              {
                h: "Engineering",
                links: [
                  ["Source", "https://github.com/Adarsh-9182/nutritiscan-ai"],
                  ["Architecture", "https://github.com/Adarsh-9182/nutritiscan-ai/blob/main/docs/ARCHITECTURE.md"],
                  ["Safety layers", "https://github.com/Adarsh-9182/nutritiscan-ai/blob/main/docs/SAFETY.md"],
                ],
              },
              {
                h: "Help",
                links: [["Report an issue", "https://github.com/Adarsh-9182/nutritiscan-ai/issues"]],
              },
            ].map((col) => (
              <div key={col.h}>
                <Label>{col.h}</Label>
                <ul className="mt-4 space-y-2.5">
                  {col.links.map(([label, href]) => (
                    <li key={label}>
                      {href.startsWith("http") ? (
                        <a href={href} target="_blank" rel="noopener" className="text-[13.5px] text-[var(--m-muted)] transition hover:text-[var(--m-ink)]">
                          {label}
                        </a>
                      ) : (
                        <Link href={href} className="text-[13.5px] text-[var(--m-muted)] transition hover:text-[var(--m-ink)]">
                          {label}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="mt-12 rounded-xl border border-[color-mix(in_oklab,var(--m-alert)_22%,transparent)] bg-[var(--m-alert-soft)] p-5">
            <p className="text-[12.5px] font-semibold text-[var(--m-alert)]">Medical disclaimer</p>
            <p className="mt-2 max-w-4xl text-[13px] leading-relaxed text-[var(--m-muted)]">
              NutritiScan is an AI system, not a licensed doctor, and does not provide medical
              advice, diagnosis or treatment. Its clinical rules have not been reviewed by a
              clinician. Nothing here replaces professional care, and you should not delay seeking
              it because of something this product said.{" "}
              <strong className="text-[var(--m-ink)]">
                In an emergency, contact your local emergency services immediately — in India, dial
                112.
              </strong>
            </p>
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--m-rule)] pt-6">
            <p className="text-[12px] text-[var(--m-dim)]">
              © {new Date().getFullYear()} NutritiScan · built in India
            </p>
            <p className="text-[12px] text-[var(--m-dim)]">
              {FACTS.rules} rules · {FACTS.domains} domains · {FACTS.tests} tests
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
