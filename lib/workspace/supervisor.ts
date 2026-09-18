// ============================================================
// THE SUPERVISOR, RECONNECTED TO THE WORKSPACE
//
// The multi-agent brain in lib/agents — a Supervisor that routes to five
// specialists (Nutrition, Fitness, Doctor, Lab, Health Coach) — was never
// deleted. It was orphaned: it answers on /api/chat, and /chat became a
// redirect to /workspace when the product moved to the account-based
// companion. So the strong brain kept running behind a door nobody could
// open, while the workspace answered from eight curated notes.
//
// This module is the door. Two jobs:
//
//   1. TRANSLATE. The supervisor speaks `HealthProfile` (biomarkers, arrays
//      of medicines, sleep hours). The workspace speaks `Workspace`
//      (confirmed reports, newline-separated text fields, day logs). The
//      shapes are different because they were built for different products.
//
//   2. RUN AND CHECK. Route to one specialist when the question is clearly
//      single-domain, to the Supervisor when it is not, then put the answer
//      through the deterministic validator in lib/safety/validate.ts before
//      anyone sees it.
//
// WHAT THIS DOES NOT DO: it does not replace the gates in health-agent.ts.
// Emergency escalation, the dose/prescribing boundary, reminder and log
// drafts, and every calculation over saved records still run first and
// without a model. This is only the part that writes the explanation.
// ============================================================

import { buildSoloist, buildSupervisor } from "../agents";
import { routeOf } from "../agents/demo";
import { MODEL_TIERS } from "../agents/provider";
import { assessTurn } from "../safety/triage";
import { validateAnswer, isClinicalTurn } from "../safety/validate";
import { clinicalBrief } from "../clinical/brief";
import { urgentAgentDirective } from "../safety/templates";
import { blankProfile, type Biomarker, type HealthProfile } from "../memory/profile";
import { localDate, recentDays } from "./daily";
import type { Workspace } from "./types";

/** Reports the person has not excluded from the companion. */
function readableReports(workspace: Workspace) {
  return workspace.reports.filter((r) => r.assistantAccess !== false);
}

/** "dust\nnuts" → ["dust", "nuts"]. The workspace stores these as free text. */
function lines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 40);
}

/**
 * Where a confirmed value sits against the range printed on its own report.
 *
 * Deliberately not a clinical judgement: it repeats the laboratory's own
 * printed interval and nothing else. A report with no printed range stays
 * "normal" rather than inventing a verdict, and the note says so.
 */
function statusOf(value: number, low: number | null, high: number | null): Biomarker["status"] {
  if (low !== null && value < low) return "low";
  if (high !== null && value > high) return "high";
  return "normal";
}

/**
 * Workspace → HealthProfile.
 *
 * Only what the person actually recorded crosses over. Height, weight and
 * goal have no workspace field, so they stay empty and the memory renderer
 * prints "not recorded" — a specialist must not be handed a default body.
 */
export function toHealthProfile(workspace: Workspace): HealthProfile {
  const reports = readableReports(workspace);

  // Newest report first, so the most recent value for a marker wins.
  const dated = [...reports].sort((a, b) => b.date.localeCompare(a.date));
  const seen = new Set<string>();
  const biomarkers: Biomarker[] = [];
  for (const report of dated) {
    for (const o of report.observations) {
      const key = o.name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      biomarkers.push({
        name: o.name,
        value: `${o.value} ${o.unit}`,
        status: statusOf(o.value, o.low, o.high),
        note:
          o.low === null && o.high === null
            ? `${report.date}, no reference range printed`
            : `${report.date}, lab range ${o.low ?? "—"}–${o.high ?? "—"}`,
      });
      if (biomarkers.length >= 30) break;
    }
    if (biomarkers.length >= 30) break;
  }

  // Sleep and activity come from the daily log if it has been used, and are
  // left unrecorded if it has not. An average over two nights is not a
  // habit, so a week is the minimum before either is claimed.
  const week = recentDays(workspace.days, localDate(), 7);
  const sleeps = week
    .map((day) => day.sleep)
    .filter((hours): hours is number => typeof hours === "number" && hours > 0);
  const activeDays = week.filter((day) => day.activityMinutes > 0).length;

  return {
    ...blankProfile,
    name: workspace.profile.name || "there",
    // No workspace field for any of these — see the renderer comment.
    heightCm: 0,
    weightKg: 0,
    goal: "",
    sleepHours:
      sleeps.length >= 3
        ? Math.round((sleeps.reduce((a, b) => a + b, 0) / sleeps.length) * 10) / 10
        : 0,
    exerciseDaysPerWeek: activeDays,
    allergies: lines(workspace.profile.allergies),
    medicines: lines(workspace.profile.medicines),
    conditions: lines(workspace.profile.conditions),
    biomarkers,
    journal: [],
    trends: [],
  };
}

export type ExpertAnswer = {
  text: string;
  /** Shown in the UI trace, so a reader can see which brain answered. */
  steps: string[];
};

const SPECIALIST_STEP: Record<string, string> = {
  doctor: "Consulted the Doctor Agent (educational)",
  nutrition: "Consulted the Nutrition Agent",
  fitness: "Consulted the Fitness Agent",
  lab: "Consulted the Lab Agent",
  coach: "Consulted the Health Coach",
  supervisor: "Coordinated the specialist team",
};

/**
 * One expert turn.
 *
 * `routeOf` is the same deterministic router the product already used: a
 * clearly single-domain question goes to one specialist, everything else to
 * the Supervisor, which consults the specialists it needs through tools.
 * That choice is about cost as much as quality — a supervised turn is three
 * model calls and a free tier is a small budget.
 *
 * The answer is validated before it is returned. A blocked answer is not
 * shown; the caller falls back to the reference notes, which is the same
 * behaviour the workspace had before this module existed.
 */
export async function runExpertTurn(
  question: string,
  workspace: Workspace,
  options: { history?: string[]; signal?: AbortSignal; language?: string } = {},
): Promise<ExpertAnswer> {
  const signal = options.signal ?? new AbortController().signal;
  const profile = toHealthProfile(workspace);
  const state = assessTurn({
    text: [...(options.history ?? []).slice(-3), question].join("\n"),
    profile,
    consultationId: "workspace",
    turn: 1,
  });

  // Emergencies never reach this module — health-agent.ts answers them from a
  // fixed template with no model call. `urgent` does reach it, and carries a
  // directive the model is not allowed to argue with.
  const triage =
    state.triage.verdict === "urgent" ? urgentAgentDirective(state) : null;
  const brief = clinicalBrief(state);

  const route = routeOf(question);
  const history = (options.history ?? [])
    .slice(-2)
    .map((text) => `Earlier message from the user: ${text.slice(0, 500)}`)
    .join("\n");
  const language = options.language ?? workspace.profile.language;
  const prompt = [
    history,
    `Current question: ${question.slice(0, 2000)}`,
    `Answer in ${language}.`,
  ]
    .filter(Boolean)
    .join("\n");

  let lastError: unknown = new Error("No answer was produced.");
  for (let tier = 0; tier < MODEL_TIERS; tier++) {
    if (signal.aborted) throw new DOMException("Stopped", "AbortError");
    try {
      const agent =
        route === "supervisor"
          ? buildSupervisor(profile, "", null, triage, brief, tier)
          : buildSoloist(route, profile, "", null, triage, brief, tier);
      const result = await agent.generate({ prompt, abortSignal: signal });
      const text = (result.text ?? "").trim();
      const verdict = validateAnswer(text, state);
      if (verdict.blocked) throw new Error("Answer withheld by the validator");
      return {
        text,
        steps: [
          "Checked urgent signs",
          SPECIALIST_STEP[route] ?? SPECIALIST_STEP.supervisor,
          isClinicalTurn(state)
            ? "Checked the answer against the clinical contract"
            : "Checked the answer before showing it",
        ],
      };
    } catch (error) {
      if (signal.aborted) throw new DOMException("Stopped", "AbortError");
      if (error instanceof Error && error.name === "AbortError") throw error;
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Expert turn failed");
}
