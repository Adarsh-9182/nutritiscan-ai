"use client";

// ============================================================
// HOME
//
// The old dashboard put six cards, a full chat column, a lab
// table and an agent roster on one screen. It answered "what do
// you know about me?" — a question you ask once.
//
// This screen answers the question you actually have several
// times a day: "where am I, and what should I do next?" So it
// is one number, three supporting ones, one action, and then
// history. Everything that was on the dashboard still exists;
// it moved to Progress and Profile, where it is what you came
// for rather than what you have to scroll past.
// ============================================================

import Link from "next/link";
import { motion } from "motion/react";
import MealList from "@/components/meal-list";
import Ring from "@/components/ring";
import { Card, CardTitle } from "@/components/ui";
import { ChevronRightIcon, DropletIcon, FlameIcon, ScanIcon } from "@/components/icons";
import { dayKey, insight, isDemoMemory, waterToday } from "@/lib/memory/profile";
import { dayTotals, mealsOn } from "@/lib/memory/meals";
import { useHydrated, useMeals, useProfile } from "@/lib/memory/store";
import { proteinTarget } from "@/lib/nutrition/analyze";

/** Eight glasses is the folk target, and it is the one people are counting against. */
const WATER_TARGET = 8;

function greeting(d: Date): string {
  const h = d.getHours();
  if (h < 5) return "Still up";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

/** A small supporting readout. Deliberately quiet — the ring is the headline. */
function Tile({
  label,
  value,
  unit,
  color,
  icon,
  children,
}: {
  label: string;
  value: string;
  unit?: string;
  color: string;
  icon?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-[var(--surface-2)] p-3.5">
      <div className="flex items-center gap-1.5 text-[var(--text-dim)]">
        {icon}
        <p className="t-label">{label}</p>
      </div>
      <p className="mt-1.5 a-h3 tnum" style={{ color }}>
        {value}
        {unit && <span className="ml-1 t-label font-normal text-[var(--text-dim)]">{unit}</span>}
      </p>
      {children}
    </div>
  );
}

export default function Home() {
  const [profile, , patch] = useProfile();
  const [meals, setMeals] = useMeals();
  const hydrated = useHydrated();

  const target = proteinTarget(profile);
  const today = dayTotals(meals);
  const todayMeals = mealsOn(meals).slice().reverse();
  const glasses = waterToday(profile);
  const demo = isDemoMemory(profile);

  const setWater = (n: number) => patch({ water: { date: dayKey(), glasses: Math.max(0, Math.min(20, n)) } });

  const shortBy = Math.max(0, target - today.protein);

  return (
    <div className="app-page mx-auto w-full max-w-lg px-4 pt-6 sm:px-6">
      {/*
        Time-of-day and the date are computed from the client clock, so they
        are gated on hydration — rendering "Good morning" into static HTML
        and swapping it to "Good evening" on load is a visible flash and a
        React hydration mismatch.
      */}
      <header>
        <p className="t-label text-[var(--text-dim)]">
          {hydrated ? new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" }) : " "}
        </p>
        <h1 className="mt-1 a-h1">
          {hydrated ? greeting(new Date()) : "Hello"},{" "}
          <span className="gradient-text-emerald">{profile.name === "there" ? "there" : profile.name}</span>
        </h1>
      </header>

      {demo && (
        <p className="mt-4 rounded-xl bg-[color-mix(in_oklab,var(--amber)_12%,transparent)] px-3 py-2 t-label leading-snug text-[var(--text-muted)]">
          You&apos;re exploring with <strong className="text-white">sample data</strong>. Nothing here is measured from you yet.
        </p>
      )}

      {/* ---- TODAY ---- the one focal surface on the screen ---- */}
      <Card strong className="mt-5">
        <CardTitle level={2} hint="protein is the number your goal actually moves on">
          Today
        </CardTitle>

        <div className="mt-5 grid place-items-center">
          <Ring
            value={today.protein}
            max={target}
            size={148}
            stroke={12}
            color="var(--emerald)"
            label={`${today.protein}`}
            sub={`of ${target}g protein`}
            ariaLabel={`${today.protein} grams of protein logged today out of a ${target} gram target.`}
          />
        </div>

        {/*
          A number with no verdict makes the user do the arithmetic. This is
          the whole "under five seconds" promise in one line — and it stays
          factual: what's logged, what's left. No praise, no scolding.
        */}
        <p className="mt-4 text-center a-body text-[var(--text-muted)]">
          {today.count === 0
            ? "Nothing logged yet today."
            : shortBy > 0
              ? <>You&apos;re <strong className="text-white">{shortBy}g</strong> short with {today.count} meal{today.count > 1 ? "s" : ""} logged.</>
              : <>Target met — <strong className="text-[var(--emerald)]">{today.protein}g</strong> across {today.count} meal{today.count > 1 ? "s" : ""}.</>}
        </p>

        <div className="mt-4 grid grid-cols-3 gap-2.5">
          <Tile label="Calories" value={String(today.kcal)} unit="kcal" color="var(--text)" icon={<FlameIcon size={13} />} />

          <Tile label="Water" value={String(glasses)} unit={`/ ${WATER_TARGET}`} color="var(--cyan)" icon={<DropletIcon size={13} />}>
            <div className="mt-2 flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setWater(glasses - 1)}
                disabled={glasses === 0}
                aria-label="Remove a glass of water"
                className="grid h-7 w-7 place-items-center rounded-lg bg-[var(--surface)] text-sm transition hover:bg-[var(--border)] disabled:opacity-30 focus-ring"
              >
                <span aria-hidden="true">−</span>
              </button>
              <button
                type="button"
                onClick={() => setWater(glasses + 1)}
                aria-label="Add a glass of water"
                className="grid h-7 w-7 place-items-center rounded-lg bg-[var(--surface)] text-sm transition hover:bg-[var(--border)] focus-ring"
              >
                <span aria-hidden="true">+</span>
              </button>
            </div>
          </Tile>

          {/*
            Steps has no source. The brief asks for it on this screen, but
            inventing a step count in a health product is the exact failure
            `blankProfile` exists to prevent — so the tile says what's true
            and what would make it real.
          */}
          <Tile label="Steps" value="—" color="var(--text-dim)">
            <p className="mt-2 t-label leading-snug text-[var(--text-dim)]">Needs a phone or watch connection.</p>
          </Tile>
        </div>
      </Card>

      {/* ---- THE ACTION ---- */}
      <motion.div whileTap={{ scale: 0.985 }} className="mt-5">
        <Link
          href="/scan"
          className="btn-primary flex w-full items-center justify-center gap-2.5 rounded-2xl px-5 py-4 a-h3 focus-ring"
        >
          <ScanIcon size={22} strokeWidth={2} />
          Scan food
        </Link>
      </motion.div>

      {/* ---- WHAT YOU ATE ---- */}
      <section className="mt-6">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="a-h3">Recent</h2>
          {todayMeals.length > 0 && (
            <Link href="/progress" className="flex items-center gap-0.5 t-label text-[var(--text-dim)] transition hover:text-white focus-ring">
              All history <ChevronRightIcon size={13} />
            </Link>
          )}
        </div>

        <div className="mt-3">
          {todayMeals.length > 0 ? (
            <MealList meals={todayMeals} limit={4} onRemove={(id) => setMeals(meals.filter((x) => x.id !== id))} />
          ) : (
            <Link
              href="/scan"
              className="flex items-center justify-between gap-3 rounded-2xl bg-[var(--surface-2)] px-4 py-4 transition hover:bg-[var(--surface)] focus-ring"
            >
              <span>
                <span className="block a-body text-[var(--text)]">No meals yet today</span>
                <span className="mt-0.5 block t-label text-[var(--text-dim)]">Scan one and this screen becomes yours.</span>
              </span>
              <ChevronRightIcon size={17} />
            </Link>
          )}
        </div>
      </section>

      {/* ---- THE DAILY READ ---- */}
      <Card className="mt-5">
        <CardTitle level={2}>What I notice</CardTitle>
        <p className="mt-2.5 a-body leading-relaxed text-[var(--text-muted)]">{insight(profile)}</p>
        <Link
          href="/coach"
          className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-strong)] px-3.5 py-2 t-body text-[var(--text)] transition hover:bg-[var(--surface-2)] focus-ring"
        >
          Ask your coach <ChevronRightIcon size={14} />
        </Link>
      </Card>
    </div>
  );
}
