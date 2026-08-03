// ============================================================
// THE AMBIENT INSIGHT — "TODAY'S READ"
//
// This is the only thing in the entire product that is PUSHED at
// the user. Everything else is asked for. That scarcity is the
// whole design: one insight that earns the top of the screen is
// worth more than a six-metric grid, because the user reads it.
//
// So it has to clear a real bar. An insight is only allowed to
// exist when:
//
//   1. Something CHANGED or something is OFF — not just "here is
//      a number you already know".
//   2. We can name the EVIDENCE behind it.
//   3. There is ONE thing to do about it.
//
// `pickInsight` returns null when nothing clears that bar, and
// the home screen is built to render gracefully with no insight
// at all. A product that must always have something to say ends
// up saying "Your weight is 71.2 kg" forever, and people stop
// reading the slot.
// ============================================================

import { JULY_PANEL, markerById, delta } from "./labs";
import { IRON_3DAY_AVG, IRON_TARGET, FATIGUE_DAYS_LOGGED, SLEEP } from "./persona";

/** Where a claim came from. Rendered as tappable provenance chips. */
export type Evidence = {
  label: string;
  /** How we know: a lab, the user's own logs, or a connected device. */
  source: "labs" | "logs" | "device" | "records";
  href?: string;
};

export type Insight = {
  id: string;
  /** The insight itself. Two sentences maximum — this is a glance, not a read. */
  text: string;
  evidence: Evidence[];
  /** The single next step. Always exactly one. */
  action: { label: string; href: string };
  /** Higher wins when several insights qualify. */
  weight: number;
};

/**
 * Everything currently worth saying, most important first.
 *
 * Each candidate is a function of live data rather than a
 * string: if ferritin recovers, the first insight stops
 * qualifying and disappears on its own.
 */
export function candidateInsights(): Insight[] {
  const out: Insight[] = [];

  const ferritin = markerById(JULY_PANEL, "ferritin");
  if (ferritin && IRON_3DAY_AVG < IRON_TARGET) {
    out.push({
      id: "iron-gap",
      text: `Your iron intake has averaged ${IRON_3DAY_AVG} mg for three days. With ferritin at ${ferritin.value} ${ferritin.unit}, ${IRON_TARGET} mg is the useful target.`,
      evidence: [
        { label: "Your labs · 12 Jul", source: "labs", href: "/labs/panel-2026-07/ferritin" },
        { label: "3 days of logged meals", source: "logs", href: "/health" },
      ],
      action: { label: "See how we got here", href: "/ask/afternoon-energy" },
      weight: 90,
    });
  }

  const ldl = markerById(JULY_PANEL, "ldl");
  const ldlMove = ldl ? delta(ldl) : null;
  if (ldl && ldlMove && ldlMove.direction === "up") {
    out.push({
      id: "ldl-rise",
      text: `LDL is up ${ldlMove.diff.toFixed(1)} ${ldl.unit} since March. It's the one marker on your panel that diet moves most reliably.`,
      evidence: [{ label: "Your labs · 12 Jul", source: "labs", href: "/labs/panel-2026-07/ldl" }],
      action: { label: "Build a week around it", href: "/plan" },
      weight: 70,
    });
  }

  const sleepNow = SLEEP.points[SLEEP.points.length - 1]?.v ?? 0;
  if (sleepNow > 0 && sleepNow < 7) {
    const h = Math.floor(sleepNow);
    const m = Math.round((sleepNow - h) * 60);
    out.push({
      id: "sleep-short",
      text: `You're averaging ${h}h ${m}m. Your fatigue days cluster after the short nights — it's worth a week of watching.`,
      evidence: [{ label: "Connected sources", source: "device", href: "/health" }],
      action: { label: "Look at the pattern", href: "/health" },
      weight: 55,
    });
  }

  return out.sort((a, b) => b.weight - a.weight);
}

/** The one insight that earns the top of the home screen, or null. */
export function pickInsight(): Insight | null {
  return candidateInsights()[0] ?? null;
}

/**
 * The greeting. Time-aware, and deliberately boring.
 *
 * It was tempting to make this clever ("Big day ahead, Dev!").
 * A health product that performs enthusiasm at 7am reads as a
 * brand talking at you. Plain is warmer.
 */
export function greeting(name: string, now = new Date()): string {
  const h = now.getHours();
  const part = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  return `${part}, ${name}.`;
}

/**
 * The line under the greeting. Says how much is worth the user's
 * attention, and nothing else.
 */
export function greetingSubtitle(count: number): string {
  if (count === 0) return "Nothing needs you right now. Ask me anything.";
  if (count === 1) return "Everything's steady. One thing is worth two minutes.";
  return `Everything else is steady. ${count} things are worth a look.`;
}

/**
 * Starter questions on the home screen.
 *
 * Chosen to demonstrate the three capabilities that make this
 * product different from a calorie counter — reasoning across
 * labs and logs, reading a document, and planning — rather than
 * to show off breadth.
 */
export const SUGGESTED_QUESTIONS = [
  { label: "Why am I tired at 4pm?", href: "/ask/afternoon-energy" },
  { label: "Read my blood report", href: "/scan?mode=report" },
  { label: "Dinner, 20 minutes", href: "/plan" },
] as const;

/** Facts the fatigue answer is built from. Exported so the UI and the answer cannot drift apart. */
export const FATIGUE_EVIDENCE = {
  loggedDips: FATIGUE_DAYS_LOGGED,
  lunchCarbs: 71,
  lunchProtein: 9,
  loggedLunches: 14,
} as const;
