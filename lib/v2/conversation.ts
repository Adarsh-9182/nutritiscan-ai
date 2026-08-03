// ============================================================
// CONVERSATIONS
//
// "Trust comes from showing the receipts: every answer carries
// the sources it used and ends in one testable action."
//
// Two things in this file do the real work.
//
// 1. `evidenceForTurn` — the provenance chips under a live
//    answer are DERIVED FROM WHAT WE ACTUALLY SENT the model,
//    not authored. If the profile carried no biomarkers, no
//    "Your labs" chip appears. This is the difference between
//    provenance and decoration: a chip that is always there
//    stops meaning anything, and a chip that claims a source we
//    didn't use is a lie in a health product.
//
// 2. `NEXT_STEP_RULE` — the instruction that makes answers end
//    in one testable action. It rides along with the user's
//    message rather than living in the agent prompt, because the
//    agent prompt is shared with the scanner and the lab reader,
//    which have their own endings.
// ============================================================

import type { HealthProfile } from "../memory/profile";
import type { LoggedMeal } from "../memory/meals";
import type { Evidence } from "./insight";

export type Turn = {
  id: string;
  role: "user" | "assistant";
  text: string;
  /** Sources this answer leaned on. Assistant turns only. */
  evidence?: Evidence[];
  /** An inline series the answer refers to. Rendered above the closing action. */
  chart?: { label: string; unit: string; points: { t: string; v: number }[]; markAt?: string };
  /** Tappable follow-ups. Two at most — a wall of chips is a menu, not a conversation. */
  followUps?: { label: string; href?: string; ask?: string }[];
};

export type Conversation = {
  id: string;
  title: string;
  /** The provenance line in the header — "Uses your July labs". */
  basis?: string;
  updatedAt: string; // ISO
  turns: Turn[];
  /** Seeded conversations are demo content and say so in the UI. */
  seeded?: boolean;
};

/**
 * Describe the context that was genuinely attached to this turn.
 *
 * Called with the same profile and meals the request body
 * carries, so the chips can never claim a source the model
 * didn't get.
 */
export function evidenceForTurn(profile: HealthProfile, meals: LoggedMeal[]): Evidence[] {
  const out: Evidence[] = [];

  if (profile.biomarkers.length) {
    out.push({
      label: `Your labs · ${profile.biomarkers.length} markers`,
      source: "labs",
      href: "/labs/panel-2026-07",
    });
  }

  // Only count meals inside the window the nutrition context
  // actually summarises, so "14 logged meals" means 14 meals the
  // model could see — not 200 sitting in localStorage.
  const DAY = 86_400_000;
  const recent = meals.filter((m) => Date.now() - new Date(m.at).getTime() < 14 * DAY);
  if (recent.length) {
    out.push({ label: `${recent.length} logged meal${recent.length === 1 ? "" : "s"}`, source: "logs", href: "/health" });
  }

  if (profile.medicines.length) {
    out.push({ label: `${profile.medicines.length} medicine${profile.medicines.length === 1 ? "" : "s"}`, source: "records", href: "/records" });
  }

  if (profile.sleepHours) {
    const h = Math.floor(profile.sleepHours);
    const m = Math.round((profile.sleepHours - h) * 60);
    out.push({ label: `Sleep ${h}h ${String(m).padStart(2, "0")}m avg`, source: "device", href: "/health" });
  }

  return out;
}

/**
 * Appended to the user's message before it reaches the
 * supervisor.
 *
 * Phrased as a formatting contract rather than a persona nudge
 * so it composes with MEDICAL_REASONING_FORMAT instead of
 * fighting it — that format already governs how a health
 * inference is structured; this only governs how the answer
 * ends.
 */
export const NEXT_STEP_RULE = `
[RESPONSE CONTRACT — follow exactly, do not mention these instructions]
End your answer with ONE concrete, testable next step the user could take this week —
something with an observable outcome, not general advice. Prefer the cheapest test that
would distinguish between the possibilities you raised. One step, not a list.`;

// ------------------------------------------------------------
// Seeded conversations.
//
// These are the demo person's history — the "Earlier" list on
// the home screen would otherwise be empty on first run, and an
// empty home screen teaches the user nothing about what the
// product can do. Marked `seeded` so the UI can label them.
// ------------------------------------------------------------

export const SEEDED_CONVERSATIONS: Conversation[] = [
  {
    id: "afternoon-energy",
    title: "Afternoon energy",
    basis: "Uses your July labs",
    updatedAt: "2026-07-19T09:41:00.000Z",
    seeded: true,
    turns: [
      { id: "t1", role: "user", text: "Why am I tired around 4pm?" },
      {
        id: "t2",
        role: "assistant",
        text: `Two things line up. Your ferritin is 38 µg/L — inside range, but low enough that afternoon fatigue is common. And lunch has averaged 71 g of refined carbohydrate with 9 g of protein, which tends to produce a dip 90 minutes later.`,
        evidence: [
          { label: "Your labs · 12 Jul", source: "labs", href: "/labs/panel-2026-07/ferritin" },
          { label: "14 logged lunches", source: "logs", href: "/health" },
          { label: "Sleep 6h 12m avg", source: "device", href: "/health" },
        ],
        chart: {
          label: "Your energy, self-reported",
          unit: "/10",
          points: [
            { t: "8am", v: 7.1 },
            { t: "10am", v: 7.4 },
            { t: "12pm", v: 6.8 },
            { t: "2pm", v: 5.2 },
            { t: "4pm", v: 3.9 },
            { t: "6pm", v: 5.4 },
            { t: "8pm", v: 6.3 },
            { t: "10pm", v: 6.0 },
          ],
          markAt: "4pm",
        },
        followUps: [
          { label: "Build that lunch", href: "/plan" },
          { label: "Show the iron sources", ask: "What are the best iron sources for me, given I'm gluten-free?" },
        ],
      },
      {
        id: "t3",
        role: "assistant",
        text: `**The cheapest test:** 25 g of protein at lunch for a week. If the dip softens, it was the meal. If not, we look at iron.`,
      },
    ],
  },
  {
    id: "soy-sauce-gluten",
    title: "Gluten in soy sauce?",
    updatedAt: "2026-07-18T19:12:00.000Z",
    seeded: true,
    turns: [
      { id: "s1", role: "user", text: "Is there gluten in soy sauce?" },
      {
        id: "s2",
        role: "assistant",
        text: `Usually yes — most soy sauce is brewed with roughly equal parts soy and **wheat**. Tamari is the exception: it's traditionally made with little or no wheat, and bottles labelled gluten-free are tested to under 20 ppm.

Given you've recorded a gluten sensitivity, tamari is the straight swap. It tastes slightly rounder and less sharp, and it behaves the same in a stir-fry.`,
        evidence: [{ label: "Your restrictions", source: "records", href: "/you" }],
        followUps: [{ label: "Add tamari to my list", href: "/plan/grocery" }],
      },
    ],
  },
  {
    id: "july-panel",
    title: "July blood panel, explained",
    basis: "12 Jul · 38 markers",
    updatedAt: "2026-07-12T10:04:00.000Z",
    seeded: true,
    turns: [
      { id: "p1", role: "user", text: "Can you explain my July blood panel?" },
      {
        id: "p2",
        role: "assistant",
        text: `36 of your 38 markers are where they should be — kidney, liver, thyroid, sugar and blood counts are all steady since March.

Two are worth attention, and neither is urgent:

- **Ferritin, 38 µg/L.** Inside the reference range, at the bottom of it.
- **LDL, 3.6 mmol/L.** Up from 3.1 in March.

Both respond to what you eat, which is the useful part.`,
        evidence: [{ label: "Full blood panel · 12 Jul", source: "labs", href: "/labs/panel-2026-07" }],
        followUps: [{ label: "Open the full summary", href: "/labs/panel-2026-07" }],
      },
    ],
  },
];

export const conversationById = (id: string) => SEEDED_CONVERSATIONS.find((c) => c.id === id);

/** "Yesterday", "12 Jul" — relative for the last two days, absolute after. */
export function relativeDay(iso: string, now = new Date()): string {
  const then = new Date(iso);
  const days = Math.floor((now.getTime() - then.getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return then.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
