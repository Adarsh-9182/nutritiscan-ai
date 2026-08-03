"use client";

// ============================================================
// MEAL PLAN
//
// "Constraint chips double as controls: tap one to loosen it and
// the week regenerates."
//
// This is the screen where most meal-planner UIs quietly cheat.
// They show the constraints as decorative badges, because making
// them real means the plan has to be a function of them — and
// once it is, you have to handle the case where the constraints
// contradict each other.
//
// Here the chips are real (see lib/v2/plan.ts): the week is
// computed from the active set on every render, deterministically.
// Turning off "Gluten-free" genuinely widens the pool and
// genuinely changes Tuesday.
//
// Two details that follow from that being real:
//
// - EVERY CONSTRAINT STATES WHY IT EXISTS, traced to a marker or
//   a stated goal. A constraint you can turn off but can't
//   interrogate is still an instruction from the app.
//
// - AN ALLERGY CONSTRAINT IS LOCKED. Gluten-free is not a
//   preference to be optimised away. The chip renders, explains
//   itself, and refuses.
//
// Each meal carries the marker it serves, so the plan and the
// labs stay visibly connected — that link is the entire reason
// to trust a plan over a recipe blog.
// ============================================================

import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge, Button, Card, Eyebrow } from "@/components/ds/primitives";
import { Meter } from "@/components/ds/charts";
import { ScreenHeader } from "@/components/ds/screen";
import { Sheet } from "@/components/ds/interactive";
import { ArrowRight, ClockIcon, LockIcon } from "@/components/ds/icons";
import { useConstraints, useHydrated } from "@/lib/v2/store";
import { CONSTRAINTS, buildWeek, buildGrocery, dayIron, dayProtein, mealMarker, type Constraint } from "@/lib/v2/plan";
import { PROTEIN_TARGET } from "@/lib/v2/persona";
import { cn } from "@/lib/cn";

export function MealPlanScreen() {
  const hydrated = useHydrated();
  const [active, toggle] = useConstraints();
  const [dayIndex, setDayIndex] = useState(0);
  const [explaining, setExplaining] = useState<Constraint | null>(null);

  // Recomputed from the constraint set, never stored. This is what
  // makes the chips controls rather than labels.
  const week = useMemo(() => buildWeek(active), [active]);
  const grocery = useMemo(() => buildGrocery(week), [week]);
  const day = week[Math.min(dayIndex, week.length - 1)];

  const protein = dayProtein(day);
  const iron = dayIron(day);

  return (
    <>
      <ScreenHeader
        backHref="/health"
        title="This week"
        trailing={
          <span className="t-meta shrink-0 text-[var(--text-3)]">
            {hydrated ? `${active.size} constraint${active.size === 1 ? "" : "s"}` : ""}
          </span>
        }
      />

      <main id="main" className="app-scroll px-5">
        {/* ---- Constraints. Tap to loosen, long-press… no —
             tap the (i) to understand. Both affordances are
             separate so an accidental tap can't silently drop a
             health constraint. ---- */}
        <Card className="p-4">
          <Eyebrow>Built around</Eyebrow>
          <div className="mt-3 flex flex-wrap gap-2">
            {CONSTRAINTS.map((c) => {
              const on = active.has(c.id);
              return (
                <span key={c.id} className="inline-flex">
                  <button
                    type="button"
                    onClick={() => {
                      if (c.locked) {
                        setExplaining(c);
                        return;
                      }
                      toggle(c.id);
                    }}
                    aria-pressed={on}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-l-[var(--r-full)] border py-2 pl-3 pr-2 text-[13px] leading-none transition-colors",
                      on
                        ? "border-[var(--accent-line)] bg-[var(--accent-soft)] font-[590] text-[var(--accent-text)]"
                        : "border-[var(--border)] text-[var(--text-3)] line-through",
                    )}
                  >
                    {c.locked && <LockIcon size={12} />}
                    {c.label}
                  </button>
                  <button
                    type="button"
                    onClick={() => setExplaining(c)}
                    aria-label={`Why ${c.label}?`}
                    className={cn(
                      "grid w-7 place-items-center rounded-r-[var(--r-full)] border border-l-0 text-[12px] transition-colors",
                      on ? "border-[var(--accent-line)] bg-[var(--accent-soft)] text-[var(--accent-text)]" : "border-[var(--border)] text-[var(--text-3)]",
                    )}
                  >
                    ?
                  </button>
                </span>
              );
            })}
          </div>

          {active.size === 0 && (
            <p className="t-meta mt-3 text-[var(--text-3)]">
              Nothing is guiding this plan right now — it&apos;s just food. Switch a constraint back on and it becomes
              yours again.
            </p>
          )}
        </Card>

        {/* ---- Day strip ---- */}
        <div className="rail mt-4 py-1">
          {week.map((d, i) => (
            <button
              key={d.date}
              type="button"
              onClick={() => setDayIndex(i)}
              aria-pressed={i === dayIndex}
              className={cn(
                "flex w-[52px] flex-col items-center gap-0.5 rounded-[var(--r-md)] border py-2 transition-colors",
                i === dayIndex
                  ? "border-transparent bg-[var(--accent)] text-[var(--accent-ink)]"
                  : "border-[var(--border)] text-[var(--text-3)] hover:bg-[var(--surface-2)]",
              )}
            >
              <span className="text-[11px] leading-none">{d.weekday}</span>
              <span className="tnum text-[15px] font-[620] leading-none">{d.date}</span>
            </button>
          ))}
        </div>

        {/* ---- The day's meals ---- */}
        <div className="mt-4 space-y-2.5">
          {day.meals.map((meal) => {
            const tag = mealMarker(meal, active);
            return (
              <Card key={`${day.date}-${meal.id}`} className="flex gap-3 p-3.5">
                <span className="tnum t-meta w-11 shrink-0 pt-0.5 text-[var(--text-3)]">{meal.time}</span>
                <span className="min-w-0 flex-1">
                  <span className="t-h3 block text-[var(--text)]">{meal.name}</span>
                  <span className="t-meta mt-1 block text-[var(--text-2)]">
                    <span className="tnum">{meal.protein} g</span> protein ·{" "}
                    <span className="tnum">{meal.iron} mg</span> iron ·{" "}
                    <span className="tnum">{meal.minutes} min</span>
                  </span>
                  <span className="t-meta mt-1 block text-[var(--text-3)]">{meal.note}</span>
                </span>
                {tag && (
                  <Link href={`/labs/panel-2026-07/${tag.marker}`} className="shrink-0 self-start">
                    <Badge tone="attention">{tag.label}</Badge>
                  </Link>
                )}
              </Card>
            );
          })}
        </div>

        {/* ---- The day's totals against the target ---- */}
        <Card className="mt-3 p-4">
          <Meter value={protein} target={PROTEIN_TARGET} label="Protein today" />
          <p className="t-meta mt-3 text-[var(--text-2)]">
            <span className="tnum">{iron} mg</span> of iron across the day — the useful target is{" "}
            <span className="tnum">14 mg</span> while your ferritin sits low.
          </p>
        </Card>

        <Link href="/plan/grocery" className="mt-4 block">
          <Card className="flex items-center gap-3 p-4 transition-colors hover:bg-[var(--surface-2)]">
            <span className="min-w-0 flex-1">
              <span className="t-h3 block text-[var(--text)]">Turn the week into a list</span>
              <span className="t-meta mt-0.5 block text-[var(--text-3)]">
                {grocery.items.length} items · {grocery.days} days
              </span>
            </span>
            <ArrowRight size={18} className="shrink-0 text-[var(--accent-text)]" />
          </Card>
        </Link>

        <p className="t-meta mt-6 text-[var(--text-3)]">
          Plans are built from general nutrition guidance and the goals you set. They are not a therapeutic diet — if a
          clinician has given you one, theirs wins.
        </p>
      </main>

      {/* ---- Why this constraint exists ---- */}
      <Sheet open={!!explaining} onClose={() => setExplaining(null)} title={explaining?.label ?? ""}>
        {explaining && (
          <>
            <p className="t-body text-[var(--text-2)]">{explaining.because}</p>

            {explaining.marker && (
              <Link
                href={`/labs/panel-2026-07/${explaining.marker}`}
                className="mt-4 inline-flex items-center gap-1.5 text-[13.5px] font-[590] text-[var(--accent-text)]"
              >
                See the marker
                <ArrowRight size={15} />
              </Link>
            )}

            {explaining.locked ? (
              <p className="t-meta mt-5 flex gap-2 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-2)] p-3.5 text-[var(--text-3)]">
                <LockIcon size={14} className="mt-0.5 shrink-0" />
                <span>
                  This one is locked. It came from a restriction you recorded, not from a goal — so the planner treats
                  it as a fact about you rather than a preference to optimise. Change it in your profile if it&apos;s
                  wrong.
                </span>
              </p>
            ) : (
              <Button
                variant="secondary"
                full
                className="mt-5"
                onClick={() => {
                  toggle(explaining.id);
                  setExplaining(null);
                }}
              >
                {active.has(explaining.id) ? "Loosen this and rebuild the week" : "Apply this and rebuild the week"}
              </Button>
            )}

            <p className="t-meta mt-4 flex items-center gap-1.5 text-[var(--text-3)]">
              <ClockIcon size={13} />
              Rebuilding is instant — nothing else about the week is lost.
            </p>
          </>
        )}
      </Sheet>
    </>
  );
}
