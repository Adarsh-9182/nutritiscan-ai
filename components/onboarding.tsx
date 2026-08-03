"use client";

// ============================================================
// FIRST RUN
//
// The old version was one card with three fields (name, weight,
// goal) and a skip link. It got someone to a working screen fast,
// but it left the AI blind on everything that changes an answer:
// no diet, no allergies, no conditions, no activity level. A vegan
// with a peanut allergy and a desk job was, to every agent, the
// same person as a meat-eating athlete.
//
// So this asks more — but it earns the right to first. The story
// steps say what the product will do for you before requesting
// anything, and every question after that is one decision on one
// screen, with a visible way out.
//
// Two invariants carried over from the old flow, both load-bearing:
//   1. `finish()` spreads `blankProfile`, never `patch()`. Patching
//      merges onto the demo memory, which used to leave a new user
//      owning Adarsh's B12 deficiency.
//   2. Skipping keeps the demo memory *and* marks onboarded, so the
//      sample-data banners elsewhere stay truthful.
// ============================================================

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useHydrated, useProfile } from "@/lib/memory/store";
import {
  ACTIVITY_DAYS,
  ACTIVITY_LABELS,
  DIET_LABELS,
  GOAL_OPTIONS,
  blankProfile,
  type ActivityLevel,
  type Diet,
} from "@/lib/memory/profile";
import { journalEntry } from "@/lib/memory/journal";
import { proteinTarget } from "@/lib/nutrition/analyze";

/**
 * The promise, in four lines.
 *
 * Deliberately not a feature list. Someone who has just installed a
 * health app does not want to know about multi-agent supervision; they
 * want to know what changes for them.
 */
const STORY = [
  { glyph: "🍽️", line: "We'll help you eat smarter.", sub: "Photograph a meal. Get a straight answer about it." },
  { glyph: "🔍", line: "We'll explain every ingredient.", sub: "In plain language — no numbers you have to decode." },
  { glyph: "📈", line: "We'll help you build healthier habits.", sub: "Small, specific changes that fit the life you have." },
  { glyph: "🧭", line: "We'll be your AI nutrition coach.", sub: "Five specialists that remember everything about you." },
];

/** The allergens common enough to be worth a tap instead of typing. */
const COMMON_ALLERGENS = ["Peanuts", "Tree nuts", "Dairy", "Gluten", "Eggs", "Soy", "Shellfish", "Sesame"];

const inputClass =
  "mt-1.5 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-3.5 py-3 t-body text-white outline-none transition placeholder:text-[var(--text-dim)] focus:border-[color-mix(in_oklab,var(--emerald)_55%,transparent)]";

const chipClass = (active: boolean) =>
  `rounded-xl border px-3 py-2.5 t-meta transition focus-ring ${
    active
      ? "border-[color-mix(in_oklab,var(--emerald)_55%,transparent)] bg-[color-mix(in_oklab,var(--emerald)_14%,transparent)] text-white"
      : "border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text-muted)] hover:text-white"
  }`;

/** Story slides, then five questions, then the close. */
const LAST_STEP = 6;

export default function Onboarding() {
  const [profile, setProfile, patch] = useProfile();
  const hydrated = useHydrated();
  const [dismissed, setDismissed] = useState(false);
  const [step, setStep] = useState(0);

  const [name, setName] = useState("");
  const [goal, setGoal] = useState<string>(blankProfile.goal);
  const [age, setAge] = useState<string>("");
  const [sex, setSex] = useState<"male" | "female" | "other" | undefined>(undefined);
  const [heightCm, setHeightCm] = useState(blankProfile.heightCm);
  const [weightKg, setWeightKg] = useState(blankProfile.weightKg);
  const [diet, setDiet] = useState<Diet | undefined>(undefined);
  const [allergies, setAllergies] = useState<string[]>([]);
  const [activityLevel, setActivityLevel] = useState<ActivityLevel | undefined>(undefined);
  const [sleepHours, setSleepHours] = useState(blankProfile.sleepHours);

  const headingRef = useRef<HTMLHeadingElement>(null);
  const open = hydrated && !profile.onboarded && !dismissed;

  /*
   * Move focus to the new step's heading on every advance.
   *
   * Without this, focus stays on the "Continue" button that just
   * unmounted, so it falls back to <body> — a screen reader announces
   * nothing at all and a keyboard user is dropped to the top of the
   * document. The heading is `tabIndex={-1}` so it can receive focus
   * programmatically without joining the tab order.
   */
  useEffect(() => {
    if (open) headingRef.current?.focus();
  }, [open, step]);

  const draft = { ...blankProfile, goal, weightKg, sleepHours };
  const target = proteinTarget(draft);

  const finish = () => {
    setProfile({
      ...blankProfile,
      name: name.trim() || blankProfile.name,
      age: age === "" ? undefined : Math.max(1, Math.min(120, Number(age))),
      sex,
      heightCm,
      weightKg,
      goal,
      diet,
      allergies,
      activityLevel,
      exerciseDaysPerWeek: activityLevel ? ACTIVITY_DAYS[activityLevel] : blankProfile.exerciseDaysPerWeek,
      sleepHours,
      onboarded: true,
      journal: [
        journalEntry({ kind: "milestone", title: "Started tracking with NutritiScan", tone: "neutral" }),
        journalEntry({ kind: "goal", title: `Goal set: ${goal.toLowerCase()}`, tone: "neutral" }),
        journalEntry({ kind: "body", title: `Weight ${weightKg} kg`, tone: "neutral", metric: { name: "Weight", value: weightKg, unit: "kg" } }),
      ],
    });
    setDismissed(true);
  };

  const skip = () => {
    patch({ onboarded: true });
    setDismissed(true);
  };

  const next = () => setStep((s) => Math.min(LAST_STEP, s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ob-heading"
        onKeyDown={(e) => {
          if (e.key === "Escape") skip();
        }}
        className="fixed inset-0 z-50 overflow-y-auto bg-[rgba(3,5,8,.88)] backdrop-blur-xl"
      >
        <div className="mx-auto flex min-h-[100svh] w-full max-w-md flex-col px-5 py-6">
          {/* ---- progress + escape hatch ---- */}
          <div className="flex shrink-0 items-center gap-3">
            <div className="flex flex-1 gap-1" aria-hidden="true">
              {Array.from({ length: LAST_STEP + 1 }, (_, i) => (
                <span
                  key={i}
                  className="h-1 flex-1 rounded-full transition-colors duration-300"
                  style={{ background: i <= step ? "var(--emerald)" : "var(--border-strong)" }}
                />
              ))}
            </div>
            <button onClick={skip} className="shrink-0 rounded-lg px-2 py-1 t-label text-[var(--text-dim)] transition hover:text-white focus-ring">
              Skip
            </button>
          </div>
          {/* The bar is decorative; this is the same information for a screen reader. */}
          <p className="sr-only" aria-live="polite">
            Step {step + 1} of {LAST_STEP + 1}
          </p>

          <div className="flex flex-1 flex-col justify-center py-8">
            <AnimatePresence mode="wait">
              <motion.div
                key={step}
                initial={{ opacity: 0, x: 18 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -18 }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              >
                {/* ---- 0: the story ---- */}
                {step === 0 && (
                  <div>
                    <span aria-hidden="true" className="grid h-14 w-14 place-items-center rounded-2xl bg-[linear-gradient(135deg,var(--emerald),var(--cyan))] a-h2 font-bold text-[#04120c]">
                      N
                    </span>
                    <h2 id="ob-heading" ref={headingRef} tabIndex={-1} className="mt-6 a-h1 outline-none">
                      Your health has a memory.
                    </h2>
                    <ul className="mt-7 space-y-4">
                      {STORY.map((s, i) => (
                        <motion.li
                          key={s.line}
                          initial={{ opacity: 0, y: 12 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.15 + i * 0.12, duration: 0.4 }}
                          className="flex gap-3"
                        >
                          <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--surface-2)] text-base">
                            {s.glyph}
                          </span>
                          <span className="min-w-0">
                            <span className="block a-body font-medium text-[var(--text)]">{s.line}</span>
                            <span className="mt-0.5 block a-caption text-[var(--text-dim)]">{s.sub}</span>
                          </span>
                        </motion.li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* ---- 1: goal ---- */}
                {step === 1 && (
                  <div>
                    <h2 id="ob-heading" ref={headingRef} tabIndex={-1} className="a-h1 outline-none">
                      What are you working toward?
                    </h2>
                    <p className="mt-2 a-body text-[var(--text-muted)]">This sets your targets and how carefully the AI reasons.</p>
                    <div className="mt-6 grid grid-cols-2 gap-2.5">
                      {GOAL_OPTIONS.map((g) => (
                        <button key={g.label} type="button" onClick={() => setGoal(g.label)} aria-pressed={goal === g.label} className={chipClass(goal === g.label)}>
                          <span aria-hidden="true" className="block text-xl">
                            {g.glyph}
                          </span>
                          <span className="mt-1 block">{g.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* ---- 2: identity + body ---- */}
                {step === 2 && (
                  <div>
                    <h2 id="ob-heading" ref={headingRef} tabIndex={-1} className="a-h1 outline-none">
                      Tell me about you.
                    </h2>
                    <p className="mt-2 a-body text-[var(--text-muted)]">Anything you leave blank stays &ldquo;not recorded&rdquo; — never guessed.</p>

                    <div className="mt-6 space-y-4">
                      <div>
                        <label htmlFor="ob-name" className="t-label text-[var(--text-dim)]">
                          What should I call you?
                        </label>
                        <input id="ob-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your first name" autoComplete="given-name" className={inputClass} />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label htmlFor="ob-age" className="t-label text-[var(--text-dim)]">
                            Age
                          </label>
                          <input id="ob-age" type="number" inputMode="numeric" min={1} max={120} value={age} onChange={(e) => setAge(e.target.value)} placeholder="Optional" className={inputClass} />
                        </div>
                        <div>
                          <label htmlFor="ob-weight" className="t-label text-[var(--text-dim)]">
                            Weight (kg)
                          </label>
                          <input
                            id="ob-weight"
                            type="number"
                            inputMode="decimal"
                            min={20}
                            max={400}
                            value={weightKg}
                            onChange={(e) => setWeightKg(Math.max(20, Math.min(400, Number(e.target.value) || weightKg)))}
                            className={inputClass}
                          />
                        </div>
                      </div>

                      <div>
                        <label htmlFor="ob-height" className="t-label text-[var(--text-dim)]">
                          Height (cm)
                        </label>
                        <input
                          id="ob-height"
                          type="number"
                          inputMode="numeric"
                          min={60}
                          max={250}
                          value={heightCm}
                          onChange={(e) => setHeightCm(Math.max(60, Math.min(250, Number(e.target.value) || heightCm)))}
                          className={inputClass}
                        />
                      </div>

                      <fieldset>
                        <legend className="t-label text-[var(--text-dim)]">Sex</legend>
                        <div className="mt-1.5 grid grid-cols-3 gap-2">
                          {(["male", "female", "other"] as const).map((s) => (
                            <button key={s} type="button" onClick={() => setSex(s)} aria-pressed={sex === s} className={chipClass(sex === s)}>
                              {s[0].toUpperCase() + s.slice(1)}
                            </button>
                          ))}
                        </div>
                      </fieldset>
                    </div>
                  </div>
                )}

                {/* ---- 3: diet ---- */}
                {step === 3 && (
                  <div>
                    <h2 id="ob-heading" ref={headingRef} tabIndex={-1} className="a-h1 outline-none">
                      How do you eat?
                    </h2>
                    <p className="mt-2 a-body text-[var(--text-muted)]">Nothing outside this will ever be suggested to you.</p>
                    <div className="mt-6 grid grid-cols-2 gap-2.5">
                      {(Object.keys(DIET_LABELS) as Diet[]).map((d) => (
                        <button key={d} type="button" onClick={() => setDiet(d)} aria-pressed={diet === d} className={chipClass(diet === d)}>
                          {DIET_LABELS[d]}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* ---- 4: allergies ---- */}
                {step === 4 && (
                  <div>
                    <h2 id="ob-heading" ref={headingRef} tabIndex={-1} className="a-h1 outline-none">
                      Anything you can&apos;t eat?
                    </h2>
                    <p className="mt-2 a-body text-[var(--text-muted)]">
                      Every meal and alternative gets checked against this. You can add more later.
                    </p>
                    <div className="mt-6 flex flex-wrap gap-2">
                      {COMMON_ALLERGENS.map((a) => {
                        const active = allergies.includes(a);
                        return (
                          <button
                            key={a}
                            type="button"
                            onClick={() => setAllergies((prev) => (active ? prev.filter((x) => x !== a) : [...prev, a]))}
                            aria-pressed={active}
                            className={`${chipClass(active)} rounded-full`}
                          >
                            {a}
                          </button>
                        );
                      })}
                    </div>
                    {allergies.length === 0 && <p className="mt-5 a-caption text-[var(--text-dim)]">Nothing selected — that&apos;s fine, just continue.</p>}
                  </div>
                )}

                {/* ---- 5: activity ---- */}
                {step === 5 && (
                  <div>
                    <h2 id="ob-heading" ref={headingRef} tabIndex={-1} className="a-h1 outline-none">
                      How active are you?
                    </h2>
                    <p className="mt-2 a-body text-[var(--text-muted)]">Be honest rather than aspirational — the targets work better.</p>
                    <div className="mt-6 space-y-2">
                      {(Object.keys(ACTIVITY_LABELS) as ActivityLevel[]).map((lvl) => (
                        <button
                          key={lvl}
                          type="button"
                          onClick={() => setActivityLevel(lvl)}
                          aria-pressed={activityLevel === lvl}
                          className={`${chipClass(activityLevel === lvl)} block w-full text-left`}
                        >
                          {ACTIVITY_LABELS[lvl]}
                        </button>
                      ))}
                    </div>

                    <div className="mt-5">
                      <label htmlFor="ob-sleep" className="t-label text-[var(--text-dim)]">
                        Sleep (hours a night)
                      </label>
                      <input
                        id="ob-sleep"
                        type="number"
                        inputMode="decimal"
                        step="0.5"
                        min={0}
                        max={24}
                        value={sleepHours}
                        onChange={(e) => setSleepHours(Math.max(0, Math.min(24, Number(e.target.value) || 0)))}
                        className={inputClass}
                      />
                    </div>
                  </div>
                )}

                {/* ---- 6: ready ---- */}
                {step === 6 && (
                  <div className="text-center">
                    <motion.span
                      aria-hidden="true"
                      initial={{ scale: 0.7, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: "spring", stiffness: 260, damping: 18 }}
                      className="mx-auto grid h-20 w-20 place-items-center rounded-3xl bg-[linear-gradient(135deg,var(--emerald),var(--cyan))] text-3xl font-bold text-[#04120c] glow-emerald"
                    >
                      N
                    </motion.span>
                    <h2 id="ob-heading" ref={headingRef} tabIndex={-1} className="mt-6 a-h1 outline-none">
                      Your AI coach is ready.
                    </h2>
                    <p className="mt-3 a-body text-[var(--text-muted)]">
                      Starting target: <strong className="text-[var(--emerald)]">{target}g protein</strong> a day
                      {diet ? <> · {DIET_LABELS[diet]}</> : null}
                      {allergies.length > 0 ? <> · avoiding {allergies.length} allergen{allergies.length > 1 ? "s" : ""}</> : null}
                    </p>
                    <p className="mt-4 a-caption leading-relaxed text-[var(--text-dim)]">
                      Everything stays on this device. Nothing here is a diagnosis — it&apos;s a tool for understanding yourself.
                    </p>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* ---- controls ---- */}
          <div className="flex shrink-0 items-center gap-3">
            {step > 0 && (
              <button onClick={back} className="rounded-xl border border-[var(--border-strong)] px-4 py-3 t-body text-[var(--text-muted)] transition hover:text-white focus-ring">
                Back
              </button>
            )}
            <button onClick={step === LAST_STEP ? finish : next} className="btn-primary flex-1 rounded-xl px-4 py-3.5 a-body">
              {step === 0 ? "Get started" : step === LAST_STEP ? "Open my Health OS" : "Continue"}
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
