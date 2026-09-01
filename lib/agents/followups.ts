// ============================================================
// FOLLOW-UP QUESTIONS
//
// The question after the answer is the one people do not think to
// ask. A reader told their B12 is low rarely knows that "how long
// until it comes up?" is the useful next move; offering it is most
// of what makes a research assistant feel like one.
//
// Derived, not generated. Asking a model for follow-ups is a whole
// extra round trip per turn — on a free tier of twenty requests a
// day that is a third of the budget spent on suggestions — and it
// can invent a question the system cannot answer. These come from
// the route the turn actually took and the profile already in hand,
// so they are free, instant, and always answerable.
//
// One rule they must never break: nothing here may imply a clinical
// next step ("should I stop my medicine?"). Suggestions carry the
// authority of the interface, and a question the product puts in
// your mouth reads as a question it thinks is reasonable to act on.
// ============================================================

import type { Route } from "./demo";
import type { HealthProfile } from "@/lib/memory/profile";

/** Fixed pools per specialist, phrased as things the user would type. */
const BY_ROUTE: Record<Route, readonly string[]> = {
  doctor: [
    "How long should this last before I see someone?",
    "What would make this more serious?",
    "What can I do for it at home?",
    "Could this be related to my other symptoms?",
  ],
  nutrition: [
    "What should I eat to fix that?",
    "How does that compare to yesterday?",
    "Is my protein target right for my goal?",
    "What am I most short of this week?",
  ],
  fitness: [
    "How should I train around that?",
    "How many days a week is enough?",
    "What should I do on rest days?",
    "Is my current routine getting me there?",
  ],
  lab: [
    "Which of my markers matters most?",
    "How long until that improves?",
    "What food raises it?",
    "When should I test again?",
  ],
  coach: [
    "What one habit would help most?",
    "How do I make that stick?",
    "What is getting in the way?",
    "How am I trending this month?",
  ],
  supervisor: [
    "What should I focus on first?",
    "What do you know about me so far?",
    "What is my biggest risk right now?",
    "Summarise where I stand.",
  ],
};

/**
 * Questions the profile makes specific — and therefore worth ranking above
 * the generic pool. A suggestion naming your own marker is the difference
 * between a prompt library and an assistant that has read your file.
 */
function personalised(profile: HealthProfile, route: Route): string[] {
  const out: string[] = [];
  const low = (profile.biomarkers ?? []).filter((b) => b.status === "low" || b.status === "high");

  if (low.length && (route === "lab" || route === "supervisor")) {
    out.push(`What should I do about my ${low[0].name.toLowerCase()}?`);
  }
  if (profile.goal && (route === "supervisor" || route === "coach" || route === "fitness")) {
    out.push(`Am I on track for ${profile.goal.toLowerCase()}?`);
  }
  if (typeof profile.sleepHours === "number" && profile.sleepHours < 7 && route !== "doctor") {
    out.push("Is my sleep affecting this?");
  }
  return out;
}

/**
 * Up to three follow-ups for a finished turn.
 *
 * Three because a row of suggestions is an offer, and six is a menu that
 * competes with the answer above it.
 *
 * Anything the user has already asked in this conversation is filtered out —
 * suggesting a question they asked two turns ago is the clearest possible
 * signal that nothing is listening.
 */
export function followUps(
  route: Route,
  profile: HealthProfile,
  asked: readonly string[] = [],
  limit = 3,
): string[] {
  const seen = new Set(asked.map((q) => q.trim().toLowerCase()));
  const out: string[] = [];
  for (const q of [...personalised(profile, route), ...BY_ROUTE[route]]) {
    const key = q.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(q);
    if (out.length === limit) break;
  }
  return out;
}
