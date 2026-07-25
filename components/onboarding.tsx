"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useHydrated, useProfile } from "@/lib/memory/store";
import { journalEntry } from "@/lib/memory/journal";

/**
 * First run, in one screen. Everything is prefilled with a sensible default,
 * so the fastest path to a working Health Memory is a single click — but the
 * three fields that actually change the AI's answers (name, weight, goal) are
 * right there if you want them.
 */

const GOALS = [
  { label: "Build muscle", glyph: "🏋️" },
  { label: "Lose fat", glyph: "🔥" },
  { label: "Stay healthy", glyph: "🌿" },
];

export default function Onboarding() {
  const [profile, , patch] = useProfile();
  const hydrated = useHydrated();
  const [dismissed, setDismissed] = useState(false);
  const [name, setName] = useState("");
  const [weight, setWeight] = useState(profile.weightKg);
  const [heightCm, setHeightCm] = useState(profile.heightCm);
  const [goal, setGoal] = useState(profile.goal);
  const inputRef = useRef<HTMLInputElement>(null);

  // Derived, never stored: ask once, and never render into static HTML.
  // `onboarded` lives in the same memory the AI reads.
  const open = hydrated && !profile.onboarded && !dismissed;

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const finish = () => {
    patch({
      name: name.trim() || profile.name,
      weightKg: weight,
      heightCm,
      goal,
      onboarded: true,
      // A real person's story starts today — not with the demo's borrowed past.
      journal: [
        journalEntry({ kind: "milestone", title: "Started tracking with NutritiScan", tone: "neutral" }),
        journalEntry({ kind: "goal", title: `Goal set: ${goal.toLowerCase()}`, tone: "neutral" }),
        journalEntry({ kind: "body", title: `Weight ${weight} kg`, tone: "neutral", metric: { name: "Weight", value: weight, unit: "kg" } }),
      ],
    });
    setDismissed(true);
  };

  const skip = () => {
    patch({ onboarded: true });
    setDismissed(true);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 grid place-items-center bg-[rgba(3,5,8,.72)] px-4 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
          aria-labelledby="onboarding-title"
          onKeyDown={(e) => {
            if (e.key === "Escape") skip();
          }}
        >
          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-md rounded-[var(--radius)] glass-strong p-6"
          >
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-[linear-gradient(135deg,var(--emerald),var(--cyan))] text-lg font-bold text-[#04120c]">N</div>
            <h2 id="onboarding-title" className="mt-4 text-xl font-semibold">
              Your health has a memory.
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-[var(--text-muted)]">
              Three things and every answer becomes yours. You can change any of it later.
            </p>

            <form
              className="mt-5 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                finish();
              }}
            >
              <div>
                <label htmlFor="ob-name" className="text-[11px] text-[var(--text-dim)]">
                  What should I call you?
                </label>
                <input
                  id="ob-name"
                  ref={inputRef}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={profile.name}
                  autoComplete="given-name"
                  className="mt-1.5 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-white outline-none transition placeholder:text-[var(--text-dim)] focus:border-[color-mix(in_oklab,var(--emerald)_55%,transparent)]"
                />
              </div>

              <fieldset>
                <legend className="text-[11px] text-[var(--text-dim)]">What are you working toward?</legend>
                <div className="mt-1.5 grid grid-cols-3 gap-2">
                  {GOALS.map((g) => (
                    <button
                      key={g.label}
                      type="button"
                      onClick={() => setGoal(g.label)}
                      aria-pressed={goal === g.label}
                      className={`rounded-xl border px-2 py-2.5 text-[11px] transition focus-ring ${
                        goal === g.label
                          ? "border-[color-mix(in_oklab,var(--emerald)_55%,transparent)] bg-[color-mix(in_oklab,var(--emerald)_14%,transparent)] text-white"
                          : "border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text-muted)] hover:text-white"
                      }`}
                    >
                      <span className="block text-base">{g.glyph}</span>
                      {g.label}
                    </button>
                  ))}
                </div>
              </fieldset>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="ob-weight" className="text-[11px] text-[var(--text-dim)]">
                    Weight (kg)
                  </label>
                  <input
                    id="ob-weight"
                    type="number"
                    inputMode="numeric"
                    min={30}
                    max={250}
                    value={weight}
                    onChange={(e) => setWeight(Math.max(30, Math.min(250, Number(e.target.value) || profile.weightKg)))}
                    className="mt-1.5 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-[color-mix(in_oklab,var(--emerald)_55%,transparent)]"
                  />
                </div>
                <div>
                  <label htmlFor="ob-height" className="text-[11px] text-[var(--text-dim)]">
                    Height (cm)
                  </label>
                  <input
                    id="ob-height"
                    type="number"
                    inputMode="numeric"
                    min={120}
                    max={230}
                    value={heightCm}
                    onChange={(e) => setHeightCm(Math.max(120, Math.min(230, Number(e.target.value) || profile.heightCm)))}
                    className="mt-1.5 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-[color-mix(in_oklab,var(--emerald)_55%,transparent)]"
                  />
                </div>
              </div>

              <button type="submit" className="btn-primary w-full rounded-xl px-4 py-3 text-sm">
                Start — my protein target is {Math.round(weight * (/muscle|gain/i.test(goal) ? 1.8 : /lose|fat/i.test(goal) ? 1.6 : 1.2))} g/day
              </button>
            </form>

            <button onClick={skip} className="mt-3 w-full rounded-lg py-1.5 text-[11px] text-[var(--text-dim)] transition hover:text-white focus-ring">
              Skip — explore with the demo profile
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
