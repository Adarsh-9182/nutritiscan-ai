"use client";

// ============================================================
// PROFILE
//
// Everything the AI knows about you, in one place you can edit.
//
// This did not exist. The memory controls were scattered down
// the left rail of the dashboard — two steppers, a lab-paste
// box behind a "+ Report" toggle, and a memory-wipe button
// drawn as a 24px ↺ glyph. Half the profile (age, sex, diet,
// allergies, conditions, medicines) had no editor at all: the
// data model carried the fields, onboarding never asked, and
// nothing in the product could set them.
//
// The order is deliberate — identity, then the goal that drives
// every target, then the constraints that gate every suggestion,
// then labs, then the destructive action, last and gated.
// ============================================================

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Card, CardTitle, Empty } from "@/components/ui";
import {
  ACTIVITY_DAYS,
  ACTIVITY_LABELS,
  DIET_LABELS,
  GOAL_OPTIONS,
  bmi,
  blankProfile,
  heightImperial,
  isDemoMemory,
  type ActivityLevel,
  type Diet,
} from "@/lib/memory/profile";
import { mergeBiomarkers, parseLabReport } from "@/lib/memory/labs";
import { journalEntry } from "@/lib/memory/journal";
import { useMeals, useProfile } from "@/lib/memory/store";
import { proteinTarget } from "@/lib/nutrition/analyze";

/** A labelled field. Keeps every input in the screen on one rhythm. */
function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="t-label text-[var(--text-dim)]">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 t-label text-[var(--text-dim)]">{hint}</p>}
    </div>
  );
}

const inputClass =
  "mt-1.5 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-3.5 py-2.5 t-body text-white outline-none transition placeholder:text-[var(--text-dim)] focus:border-[color-mix(in_oklab,var(--emerald)_55%,transparent)]";

/**
 * A free-text list — allergies, conditions, medicines.
 *
 * These gate real advice (an allergy is the difference between a safe
 * suggestion and a dangerous one), so removal is one click and never
 * hidden behind an edit mode.
 */
function ChipList({
  legend,
  hint,
  items,
  onChange,
  placeholder,
}: {
  legend: string;
  hint: string;
  items: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
}) {
  const [draft, setDraft] = useState("");
  const id = `chips-${legend.toLowerCase().replace(/\s+/g, "-")}`;

  const add = () => {
    const v = draft.trim();
    // Case-insensitive dedupe: "Peanuts" and "peanuts" are one allergy, and
    // two of them in the prompt is just noise in the agent's context.
    if (!v || items.some((i) => i.toLowerCase() === v.toLowerCase())) {
      setDraft("");
      return;
    }
    onChange([...items, v]);
    setDraft("");
  };

  return (
    <fieldset>
      <legend className="t-label text-[var(--text-dim)]">{legend}</legend>
      <p className="mt-0.5 t-label text-[var(--text-dim)]">{hint}</p>

      {items.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {items.map((item) => (
            <li key={item}>
              <span className="flex items-center gap-1.5 rounded-full border border-[var(--border-strong)] bg-[var(--surface-2)] py-1 pl-3 pr-1 t-meta">
                {item}
                <button
                  type="button"
                  onClick={() => onChange(items.filter((i) => i !== item))}
                  aria-label={`Remove ${item} from ${legend.toLowerCase()}`}
                  className="grid h-5 w-5 place-items-center rounded-full text-[var(--text-dim)] transition hover:bg-[var(--border)] hover:text-white focus-ring"
                >
                  <span aria-hidden="true">×</span>
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2 flex gap-2">
        <input
          id={id}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Enter must not submit anything — this sits inside a page of
            // other fields and a stray submit would be a surprise.
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          aria-label={`Add to ${legend.toLowerCase()}`}
          className={`${inputClass} mt-0 flex-1`}
        />
        <button
          type="button"
          onClick={add}
          disabled={!draft.trim()}
          className="shrink-0 rounded-xl border border-[var(--border-strong)] px-4 t-body text-[var(--text)] transition hover:bg-[var(--surface-2)] disabled:opacity-30 focus-ring"
        >
          Add
        </button>
      </div>
    </fieldset>
  );
}

/** A row of mutually exclusive options rendered as real radio semantics. */
function ChoiceRow<T extends string>({
  legend,
  hint,
  value,
  options,
  onChange,
  columns = 3,
}: {
  legend: string;
  hint?: string;
  value: T | undefined;
  options: { value: T; label: string; glyph?: string }[];
  onChange: (v: T) => void;
  columns?: number;
}) {
  return (
    <fieldset>
      <legend className="t-label text-[var(--text-dim)]">{legend}</legend>
      {hint && <p className="mt-0.5 t-label text-[var(--text-dim)]">{hint}</p>}
      <div className="mt-2 grid gap-2" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {options.map((o) => {
          const active = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(o.value)}
              aria-pressed={active}
              className={`rounded-xl border px-2 py-2.5 t-meta transition focus-ring ${
                active
                  ? "border-[color-mix(in_oklab,var(--emerald)_55%,transparent)] bg-[color-mix(in_oklab,var(--emerald)_14%,transparent)] text-white"
                  : "border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text-muted)] hover:text-white"
              }`}
            >
              {o.glyph && (
                <span aria-hidden="true" className="block text-base">
                  {o.glyph}
                </span>
              )}
              {o.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export default function ProfileScreen() {
  const [profile, setProfile, patch] = useProfile();
  const [, setMeals] = useMeals();
  const [confirmReset, setConfirmReset] = useState(false);
  const [reportText, setReportText] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const demo = isDemoMemory(profile);
  const target = proteinTarget(profile);

  const addReport = () => {
    const found = parseLabReport(reportText);
    if (!found.length) {
      setMsg('No known markers found. Try lines like "B12 180" or "Vitamin D 34".');
      return;
    }
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
    setMsg(`Added ${found.length} marker${found.length > 1 ? "s" : ""} to your memory ✓`);
    setReportText("");
  };

  const resetMemory = () => {
    setProfile({ ...blankProfile, name: profile.name, onboarded: true });
    setMeals([]);
    setConfirmReset(false);
    setMsg("Memory cleared. Nothing is recorded.");
  };

  return (
    <div className="app-page mx-auto w-full max-w-lg px-4 pt-6 sm:px-6">
      <header className="flex items-center gap-3.5">
        <span
          aria-hidden="true"
          className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-[linear-gradient(135deg,var(--emerald),var(--cyan))] a-h2 font-bold text-[#04120c]"
        >
          {(profile.name?.[0] ?? "?").toUpperCase()}
        </span>
        <div className="min-w-0">
          <h1 className="a-h1 truncate">{profile.name === "there" ? "Your profile" : profile.name}</h1>
          <p className="mt-0.5 a-caption text-[var(--text-dim)]">Everything your AI remembers about you.</p>
        </div>
      </header>

      {demo && (
        <p className="mt-4 rounded-xl bg-[color-mix(in_oklab,var(--amber)_12%,transparent)] px-3 py-2 t-label leading-snug text-[var(--text-muted)]">
          These values belong to a <strong className="text-white">demo profile</strong>. Edit any of them, or clear the memory at the bottom, to make this yours.
        </p>
      )}

      {/* ---- IDENTITY & BODY ---- */}
      <Card className="mt-5">
        <CardTitle level={2} hint="drives your targets and how the agents talk to you">
          About you
        </CardTitle>

        <div className="mt-4 space-y-4">
          <Field label="Name" htmlFor="pf-name">
            <input
              id="pf-name"
              value={profile.name === "there" ? "" : profile.name}
              onChange={(e) => patch({ name: e.target.value || "there" })}
              placeholder="Your first name"
              autoComplete="given-name"
              className={inputClass}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Age" htmlFor="pf-age">
              <input
                id="pf-age"
                type="number"
                inputMode="numeric"
                min={1}
                max={120}
                value={profile.age ?? ""}
                onChange={(e) => patch({ age: e.target.value === "" ? undefined : Math.max(1, Math.min(120, Number(e.target.value))) })}
                placeholder="Not recorded"
                className={inputClass}
              />
            </Field>
            <Field label="Weight (kg)" htmlFor="pf-weight">
              <input
                id="pf-weight"
                type="number"
                inputMode="decimal"
                min={20}
                max={400}
                value={profile.weightKg}
                onChange={(e) => patch({ weightKg: Math.max(20, Math.min(400, Number(e.target.value) || profile.weightKg)) })}
                className={inputClass}
              />
            </Field>
          </div>

          <Field label="Height (cm)" htmlFor="pf-height" hint={`${heightImperial(profile.heightCm)} · BMI ${bmi(profile)}`}>
            <input
              id="pf-height"
              type="number"
              inputMode="numeric"
              min={60}
              max={250}
              value={profile.heightCm}
              onChange={(e) => patch({ heightCm: Math.max(60, Math.min(250, Number(e.target.value) || profile.heightCm)) })}
              className={inputClass}
            />
          </Field>

          <ChoiceRow
            legend="Sex"
            hint="Used for nutrient reference ranges. Leave it unset if you'd rather not say."
            value={profile.sex}
            onChange={(sex) => patch({ sex })}
            options={[
              { value: "male", label: "Male" },
              { value: "female", label: "Female" },
              { value: "other", label: "Other" },
            ]}
          />
        </div>
      </Card>

      {/* ---- GOAL, DIET, TARGETS ---- */}
      <Card className="mt-4">
        <CardTitle level={2} hint="what every suggestion gets measured against">
          Goal &amp; diet
        </CardTitle>

        <div className="mt-4 space-y-4">
          <ChoiceRow
            legend="Primary goal"
            value={profile.goal}
            onChange={(goal) => patch({ goal })}
            columns={2}
            options={GOAL_OPTIONS.map((g) => ({ value: g.label, label: g.label, glyph: g.glyph }))}
          />

          <ChoiceRow
            legend="Diet"
            hint="A hard constraint — nothing outside it will ever be suggested."
            value={profile.diet}
            onChange={(diet: Diet) => patch({ diet })}
            columns={3}
            options={(Object.keys(DIET_LABELS) as Diet[]).map((d) => ({ value: d, label: DIET_LABELS[d] }))}
          />

          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Protein goal (g/day)"
              htmlFor="pf-protein"
              hint={profile.proteinGoal ? "Your figure, not ours." : `We calculate ${target} g from your weight and goal.`}
            >
              <input
                id="pf-protein"
                type="number"
                inputMode="numeric"
                min={0}
                max={500}
                value={profile.proteinGoal ?? ""}
                onChange={(e) => patch({ proteinGoal: e.target.value === "" ? undefined : Math.max(0, Math.min(500, Number(e.target.value))) })}
                placeholder={String(target)}
                className={inputClass}
              />
            </Field>
            <Field label="Food budget (₹/day)" htmlFor="pf-budget" hint="Used for meal and grocery planning.">
              <input
                id="pf-budget"
                type="number"
                inputMode="numeric"
                min={0}
                max={100000}
                value={profile.budgetPerDay ?? ""}
                onChange={(e) => patch({ budgetPerDay: e.target.value === "" ? undefined : Math.max(0, Math.min(100000, Number(e.target.value))) })}
                placeholder="Not set"
                className={inputClass}
              />
            </Field>
          </div>
        </div>
      </Card>

      {/* ---- ACTIVITY & SLEEP ---- */}
      <Card className="mt-4">
        <CardTitle level={2}>Activity &amp; sleep</CardTitle>

        <div className="mt-4 space-y-4">
          <fieldset>
            <legend className="t-label text-[var(--text-dim)]">Activity level</legend>
            <div className="mt-2 space-y-1.5">
              {(Object.keys(ACTIVITY_LABELS) as ActivityLevel[]).map((lvl) => {
                const active = profile.activityLevel === lvl;
                return (
                  <button
                    key={lvl}
                    type="button"
                    // Activity level and exercise-days are two views of one
                    // fact. Setting the level updates the days the agents
                    // already read, so the two can never disagree.
                    onClick={() => patch({ activityLevel: lvl, exerciseDaysPerWeek: ACTIVITY_DAYS[lvl] })}
                    aria-pressed={active}
                    className={`flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left t-meta transition focus-ring ${
                      active
                        ? "border-[color-mix(in_oklab,var(--emerald)_55%,transparent)] bg-[color-mix(in_oklab,var(--emerald)_14%,transparent)] text-white"
                        : "border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text-muted)] hover:text-white"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: active ? "var(--emerald)" : "var(--border-strong)" }}
                    />
                    {ACTIVITY_LABELS[lvl]}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <Field label="Sleep (hours a night)" htmlFor="pf-sleep">
            <input
              id="pf-sleep"
              type="number"
              inputMode="decimal"
              step="0.5"
              min={0}
              max={24}
              value={profile.sleepHours}
              onChange={(e) => patch({ sleepHours: Math.max(0, Math.min(24, Number(e.target.value) || 0)) })}
              className={inputClass}
            />
          </Field>
        </div>
      </Card>

      {/* ---- SAFETY-CRITICAL CONTEXT ---- */}
      <Card className="mt-4">
        <CardTitle level={2} hint="the agents check these before every suggestion">
          Health context
        </CardTitle>

        <div className="mt-4 space-y-5">
          <ChipList
            legend="Allergies"
            hint="Anything here is excluded from every meal and alternative suggested."
            items={profile.allergies}
            onChange={(allergies) => patch({ allergies })}
            placeholder="e.g. peanuts"
          />
          <ChipList
            legend="Conditions"
            hint="Diagnosed conditions the AI should reason around."
            items={profile.conditions}
            onChange={(conditions) => patch({ conditions })}
            placeholder="e.g. hypothyroidism"
          />
          <ChipList
            legend="Medicines"
            hint="Helps flag food interactions. Not medical advice."
            items={profile.medicines}
            onChange={(medicines) => patch({ medicines })}
            placeholder="e.g. metformin"
          />
        </div>
      </Card>

      {/* ---- LABS ---- */}
      <Card className="mt-4">
        <CardTitle level={2} hint={profile.biomarkers.length ? `${profile.biomarkers.length} recorded` : "nothing recorded yet"}>
          Lab reports
        </CardTitle>

        <div className="mt-4">
          <label htmlFor="pf-labs" className="t-label text-[var(--text-dim)]">
            Paste a report and I&apos;ll extract the markers.
          </label>
          <textarea
            id="pf-labs"
            value={reportText}
            onChange={(e) => setReportText(e.target.value)}
            rows={4}
            placeholder={"e.g.\nVitamin B12: 180 pg/mL\nVitamin D: 34\nTSH 5.2  Hemoglobin 14.6"}
            className="scroll-thin mt-2 w-full resize-none rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-3.5 py-2.5 t-body text-white outline-none placeholder:text-[var(--text-dim)] focus:border-[color-mix(in_oklab,var(--emerald)_55%,transparent)]"
          />
          <button
            type="button"
            onClick={addReport}
            disabled={!reportText.trim()}
            className="btn-primary mt-2 w-full rounded-xl px-4 py-2.5 t-body disabled:opacity-40"
          >
            Extract markers
          </button>
          {/* PDF and photo upload are not built yet. Saying so is better than
              a disabled button that looks like it might work. */}
          <p className="mt-2 t-label text-[var(--text-dim)]">
            PDF and photo upload are coming — for now, paste the text.
          </p>
        </div>

        <div className="mt-4">
          {profile.biomarkers.length ? (
            <ul className="space-y-2">
              {profile.biomarkers.map((bm) => {
                const tint = bm.status === "normal" ? "var(--emerald)" : bm.status === "borderline" ? "var(--amber)" : "var(--rose)";
                return (
                  <li key={bm.name} className="flex items-center justify-between gap-3 rounded-xl bg-[var(--surface-2)] px-3 py-2.5 t-meta">
                    <span className="min-w-0 truncate text-[var(--text-muted)]">{bm.name}</span>
                    <span className="flex shrink-0 items-center gap-1.5 font-medium tnum" style={{ color: tint }}>
                      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full" style={{ background: tint }} />
                      {bm.value}
                      <span className="sr-only"> — {bm.status}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <Empty glyph="🧪" title="No lab values yet" body="Paste a report above and each marker gets dated, explained, and tracked over time." />
          )}
        </div>
      </Card>

      {/* ---- DESTRUCTIVE, LAST ---- */}
      <Card className="mt-4">
        <CardTitle level={2}>Clear health memory</CardTitle>
        <p className="mt-2 a-caption leading-relaxed text-[var(--text-muted)]">
          Deletes every lab value, journal entry and logged meal from this device. Your name is kept.
        </p>

        <button
          type="button"
          onClick={() => setConfirmReset((c) => !c)}
          aria-expanded={confirmReset}
          className="mt-3 w-full rounded-xl border border-[color-mix(in_oklab,var(--rose)_45%,transparent)] px-4 py-2.5 t-body text-[#ffd7dd] transition hover:bg-[color-mix(in_oklab,var(--rose)_12%,transparent)] focus-ring"
        >
          Clear everything
        </button>

        <AnimatePresence>
          {confirmReset && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <div className="mt-2 rounded-xl border border-[color-mix(in_oklab,var(--rose)_40%,transparent)] bg-[color-mix(in_oklab,var(--rose)_10%,transparent)] p-3">
                <p className="t-label leading-relaxed text-[#ffd7dd]">This cannot be undone.</p>
                <div className="mt-2 flex justify-end gap-2">
                  <button onClick={() => setConfirmReset(false)} className="rounded-lg px-3 py-1.5 t-meta text-[var(--text-muted)] hover:text-white focus-ring">
                    Keep it
                  </button>
                  <button
                    onClick={resetMemory}
                    className="rounded-lg border border-[color-mix(in_oklab,var(--rose)_50%,transparent)] px-3 py-1.5 t-meta font-medium text-[#ffd7dd] transition hover:bg-[color-mix(in_oklab,var(--rose)_18%,transparent)] focus-ring"
                  >
                    Delete everything
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>

      {/* One live region for the whole screen, so a change is announced
          wherever on the page it was triggered from. */}
      {msg && (
        <p role="status" className="mt-4 text-center t-body text-[var(--emerald)]">
          {msg}
        </p>
      )}
    </div>
  );
}
