// ============================================================
// LONGITUDINAL INSIGHT ENGINE
//
// The hard part of health AI is not sounding intelligent — it is
// being honest. Every insight this file produces must carry:
//
//   claim        what we think is true
//   certainty    known / likely / possible / unknown
//   confidence   a number we can actually justify
//   evidence     the specific data points behind the claim
//   limitations  what would change our mind
//
// Confidence is derived from how much real data exists, never
// asserted. Three logged meals cannot produce a confident claim
// about a diet, and this engine will not pretend otherwise.
// ============================================================

import type { HealthProfile } from "../memory/profile";
import type { JournalEntry } from "../memory/journal";
import { dayTotals, mealsOn, type LoggedMeal } from "../memory/meals";
import { goalPhrase, proteinTarget } from "../nutrition/analyze";

export type Certainty = "known" | "likely" | "possible" | "unknown";

export type Insight = {
  id: string;
  claim: string;
  certainty: Certainty;
  /** 0–100, justified by the evidence list below it */
  confidence: number;
  evidence: string[];
  limitations: string[];
  action?: string;
  /** true when the honest answer is "a clinician should look at this" */
  seeClinician?: boolean;
  tone: "good" | "warn" | "bad" | "neutral";
};

const r1 = (n: number) => Math.round(n * 10) / 10;
const DAY = 86_400_000;

/**
 * Certainty ladder, driven by sample size alone. `known` is reserved for
 * things we measured directly rather than inferred — it is never awarded
 * to a trend.
 */
function certaintyFromSample(n: number, min = 3): { certainty: Certainty; confidence: number } {
  if (n === 0) return { certainty: "unknown", confidence: 0 };
  if (n < min) return { certainty: "possible", confidence: 30 + n * 5 };
  if (n < min * 3) return { certainty: "likely", confidence: 55 + Math.min(20, n * 2) };
  return { certainty: "likely", confidence: Math.min(88, 70 + n) };
}

function daysCovered(meals: LoggedMeal[]): number {
  return new Set(meals.map((m) => new Date(m.at).toDateString())).size;
}

function recentMeals(meals: LoggedMeal[], days: number): LoggedMeal[] {
  const cutoff = Date.now() - days * DAY;
  return meals.filter((m) => new Date(m.at).getTime() >= cutoff);
}

// ------------------------------------------------------------
// Biomarker trends, computed from dated journal metrics
// ------------------------------------------------------------

function metricSeries(journal: JournalEntry[], name: string) {
  return journal
    .filter((e) => e.metric?.name === name)
    .map((e) => ({ at: new Date(e.at).getTime(), value: e.metric!.value, unit: e.metric!.unit }))
    .sort((a, b) => a.at - b.at);
}

function trendInsight(journal: JournalEntry[], name: string, higherIsBetter: boolean, targetNote: string): Insight | null {
  const series = metricSeries(journal, name);
  if (series.length < 2) return null;

  const first = series[0];
  const last = series[series.length - 1];
  const delta = r1(last.value - first.value);
  if (delta === 0) return null;

  const months = Math.max(1, Math.round((last.at - first.at) / (30 * DAY)));
  const improving = higherIsBetter ? delta > 0 : delta < 0;
  const { certainty, confidence } = certaintyFromSample(series.length, 2);

  return {
    id: `trend-${name.toLowerCase().replace(/\s+/g, "-")}`,
    claim: improving
      ? `Your ${name.toLowerCase()} is moving in the right direction — ${delta > 0 ? "+" : ""}${delta} ${last.unit} over ${months} month${months === 1 ? "" : "s"}.`
      : `Your ${name.toLowerCase()} has moved the wrong way — ${delta > 0 ? "+" : ""}${delta} ${last.unit} over ${months} month${months === 1 ? "" : "s"}.`,
    certainty,
    confidence,
    evidence: series.map((s) => `${new Date(s.at).toLocaleDateString(undefined, { month: "short", year: "numeric" })}: ${s.value} ${s.unit}`),
    limitations: [
      `Based on ${series.length} recorded value${series.length === 1 ? "" : "s"}, not a continuous measurement.`,
      "Lab results vary with time of day, fasting state, and the lab itself.",
      targetNote,
    ],
    tone: improving ? "good" : "warn",
    seeClinician: !improving,
  };
}

// ------------------------------------------------------------
// Nutrition, computed from meals the user actually logged
// ------------------------------------------------------------

function proteinInsight(meals: LoggedMeal[], p: HealthProfile): Insight {
  const window = recentMeals(meals, 14);
  const days = daysCovered(window);
  const target = proteinTarget(p);

  if (days === 0) {
    return {
      id: "protein",
      claim: `I can't say anything about your protein intake yet.`,
      certainty: "unknown",
      confidence: 0,
      evidence: ["No meals logged in the last 14 days."],
      limitations: ["Scan or describe a few meals and this becomes a real measurement rather than a guess."],
      action: "Log three meals to unlock this.",
      tone: "neutral",
    };
  }

  // Average across days that actually have data, not across the whole window —
  // dividing by 14 would quietly punish someone for not logging every day.
  const byDay = new Map<string, number>();
  for (const m of window) {
    const k = new Date(m.at).toDateString();
    byDay.set(k, (byDay.get(k) ?? 0) + m.protein);
  }
  const perDay = [...byDay.values()];
  const avg = r1(perDay.reduce((a, b) => a + b, 0) / perDay.length);
  const pct = Math.round((avg / target) * 100);
  const { certainty, confidence } = certaintyFromSample(days);

  const short = avg < target;
  return {
    id: "protein",
    claim: short
      ? `On the days you logged, you averaged ${avg} g of protein — about ${pct}% of the ${target} g your goal of ${goalPhrase(p)} asks for.`
      : `On the days you logged, you averaged ${avg} g of protein, clearing your ${target} g target.`,
    certainty,
    confidence,
    evidence: [
      `${window.length} meal${window.length === 1 ? "" : "s"} logged across ${days} day${days === 1 ? "" : "s"}.`,
      `Daily protein: ${perDay.map((v) => `${r1(v)} g`).join(", ")}.`,
      `Target ${target} g/day = ${p.weightKg} kg × ${r1(target / p.weightKg)} g/kg for ${goalPhrase(p)}.`,
    ],
    limitations: [
      "Only counts meals you logged — anything unlogged is invisible to this.",
      "Portion sizes are estimates; real weights would tighten the number.",
      days < 7 ? "Fewer than seven days of data, so this is indicative rather than settled." : "Covers a short window; habits shift.",
    ],
    action: short ? `Add roughly ${Math.round(target - avg)} g a day — a bowl of curd and two eggs covers it.` : undefined,
    tone: short ? "warn" : "good",
  };
}

function deficiencyInsight(meals: LoggedMeal[], p: HealthProfile): Insight | null {
  const low = p.biomarkers.find((b) => /b12/i.test(b.name) && b.status !== "normal");
  if (!low) return null;

  const window = recentMeals(meals, 14);
  const days = daysCovered(window);
  const { certainty, confidence } = certaintyFromSample(days);

  if (days === 0) {
    return {
      id: "b12",
      claim: `Your B12 is ${low.status} (${low.value}), and I have no food data to tell you whether your diet is helping.`,
      certainty: "unknown",
      confidence: 0,
      evidence: [`Recorded biomarker: ${low.name} ${low.value} (${low.status}).`],
      limitations: ["No logged meals, so dietary B12 intake is unknown."],
      action: "Log a few meals and I can tell you whether you're closing the gap.",
      tone: "warn",
      seeClinician: true,
    };
  }

  return {
    id: "b12",
    claim: `Your B12 is ${low.status} at ${low.value}, so the B12 content of what you eat matters more than usual right now.`,
    certainty,
    confidence: Math.min(confidence, 75),
    evidence: [
      `Recorded biomarker: ${low.name} ${low.value} (${low.status}).`,
      `${window.length} meal${window.length === 1 ? "" : "s"} logged in the last 14 days.`,
      "B12 is found almost exclusively in animal foods — eggs, dairy, fish, meat.",
    ],
    limitations: [
      "Food B12 estimates come from a reference database, not from your actual plate.",
      "Absorption varies a lot between people; intake and blood level are not the same thing.",
      "A low B12 reading has causes beyond diet that food cannot fix.",
    ],
    action: "Two eggs or a bowl of curd daily is a reasonable dietary step to discuss with your doctor.",
    tone: "warn",
    seeClinician: true,
  };
}

function consistencyInsight(meals: LoggedMeal[]): Insight | null {
  const window = recentMeals(meals, 14);
  const days = daysCovered(window);
  if (days < 2) return null;

  const { certainty, confidence } = certaintyFromSample(days);
  const good = days >= 7;
  return {
    id: "consistency",
    claim: good
      ? `You've logged on ${days} of the last 14 days — enough for the trends above to mean something.`
      : `You've logged on ${days} of the last 14 days, which is enough to start but not enough to be sure.`,
    certainty,
    confidence,
    evidence: [`${window.length} meals across ${days} distinct days.`, `Most recent: ${new Date(window[window.length - 1].at).toLocaleDateString()}.`],
    limitations: ["Logging frequency is not health — it only decides how much I can honestly claim."],
    tone: good ? "good" : "neutral",
  };
}

// ------------------------------------------------------------

export function buildInsights(p: HealthProfile, meals: LoggedMeal[]): Insight[] {
  const journal = p.journal ?? [];
  const out: (Insight | null)[] = [
    proteinInsight(meals, p),
    deficiencyInsight(meals, p),
    trendInsight(journal, "Vitamin B12", true, "Reference range 200–900 pg/mL."),
    trendInsight(journal, "Vitamin D", true, "Optimal is generally quoted as 40–60 ng/mL."),
    trendInsight(journal, "Weight", /muscle|gain|bulk/i.test(p.goal), "Weight alone doesn't distinguish muscle from fat."),
    consistencyInsight(meals),
  ];

  // Most confident first, but never bury something a clinician should see.
  return out
    .filter((i): i is Insight => !!i)
    .sort((a, b) => Number(!!b.seeClinician) - Number(!!a.seeClinician) || b.confidence - a.confidence);
}

/** Today's headline number, used by the dashboard. */
export function todaySummary(p: HealthProfile, meals: LoggedMeal[]) {
  const t = dayTotals(meals);
  const target = proteinTarget(p);
  return { ...t, target, logged: mealsOn(meals).length };
}

export const CERTAINTY_COLOR: Record<Certainty, string> = {
  known: "var(--emerald)",
  likely: "var(--cyan)",
  possible: "var(--amber)",
  unknown: "var(--text-dim)",
};
