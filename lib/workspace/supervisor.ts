// ============================================================
// THE SUPERVISOR, INSIDE THE ACCOUNT WORKSPACE
//
// lib/agents holds a Supervisor and five specialists (Nutrition, Fitness,
// Doctor, Lab, Coach) that were only ever reachable through POST /api/chat —
// an endpoint with no session, which took the health profile straight from the
// request body and has been disabled behind LEGACY_CLINICAL_ENABLED ever since
// the account workspace became the product. The agents were not the problem;
// the door they were behind was. Anyone could post any profile to it.
//
// This is the same pipeline reached the other way: the profile comes from the
// caller's own encrypted workspace row, the session has already been checked by
// the route, and nothing crosses the workspace boundary.
//
// Two things are deliberately NOT carried over from the old endpoint:
//
//   Streaming. /api/chat returned a UI message stream; the workspace assistant
//   is request/response JSON that the client renders whole. Reproducing the
//   stream would mean rewriting health-agent.tsx, so the supervisor is run to
//   completion with generate() instead. Clinical turns were buffered for
//   validation on the old path anyway — that is the majority of the wait.
//
//   The whole turn. This does not replace runHealthAgent. Its deterministic
//   work — urgent-sign escalation, the dose/prescribing refusal, drafting a
//   reminder or a day-log entry, record arithmetic — is not something a model
//   should be doing, and all of it still runs first. Only the final answering
//   step is handed over. See the `consult` hook in health-agent.ts.
// ============================================================

import { buildSoloist, buildSupervisor } from "../agents";
import { routeOf } from "../agents/demo";
import { MODEL_TIERS, hasAnyModel } from "../agents/provider";
import {
  type Biomarker,
  type HealthProfile,
  type MemorySection,
} from "../memory/profile";
import { assessTurn, halts } from "../safety/triage";
import {
  emergencyResponse,
  mentalHealthResponse,
  urgentAgentDirective,
} from "../safety/templates";
import { isClinicalTurn, validateAnswer, withheldResponse } from "../safety/validate";
import { clinicalBrief } from "../clinical/brief";
import { parseEducation, type AgentReply } from "./health-agent";
import { rangeStatus, type Workspace } from "./types";
import type { HealthReference } from "./health-library";
import { safeProfile } from "../memory/schema";

/** Leave headroom under the route's maxDuration so a slow ladder degrades. */
const BUDGET_MS = 45_000;

/** How many lab values reach the prompt. Newest reports first. */
const MAX_BIOMARKERS = 24;

/**
 * Sections the account workspace can actually vouch for.
 *
 * Deliberately missing: vitals, goal, sleep and activity. The workspace never
 * asks for height, weight, a primary goal or nightly sleep hours, and
 * HealthProfile makes all four non-optional — so a bridge has to invent them,
 * and the prompt renderer states them flatly ("Height/Weight: 170 cm / 70 kg")
 * with no hedge. A protein target computed from a weight nobody gave is
 * indistinguishable, in the answer, from one the person reported. Leaving the
 * section out makes the agent ask.
 *
 * What is here is either recorded or honestly empty: the renderers say "none
 * recorded" for a blank list, which is true when someone left the field blank.
 */
export const WORKSPACE_SECTIONS: MemorySection[] = [
  "identity",
  "allergies",
  "medicines",
  "conditions",
  "biomarkers",
];

/** Free-text profile fields are one-per-line or comma separated in the UI. */
function listOf(value: string): string[] {
  return value
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 40);
}

function biomarkersFrom(workspace: Workspace): Biomarker[] {
  const out: Biomarker[] = [];
  // Newest first, so the cap drops the stalest values rather than the freshest.
  const reports = [...workspace.reports]
    // The person chooses, per report, whether the companion may read it. This
    // is the same predicate record-tools.ts uses; `undefined` means allowed.
    .filter((r) => r.assistantAccess !== false)
    .sort((a, b) => b.date.localeCompare(a.date));

  for (const report of reports) {
    for (const o of report.observations) {
      if (out.length >= MAX_BIOMARKERS) return out;
      const range = rangeStatus(o);
      // No report range means no defensible status. Keep that result in the
      // record, but never tell the model it is "normal" by default.
      if (range === "unknown") continue;
      out.push({
        name: o.name,
        value: `${o.value} ${o.unit}`,
        status: range === "below" ? "low" : range === "above" ? "high" : "normal",
        note: `${report.date}${o.low !== null && o.high !== null ? `, reference ${o.low}–${o.high} ${o.unit}` : ""}`,
      });
    }
  }
  return out;
}

/**
 * The workspace rendered as the memory shape the agents read.
 *
 * The four fields the workspace does not hold are filled with neutral
 * placeholders only because the type demands a number; WORKSPACE_SECTIONS keeps
 * every one of them out of the prompt, so no agent ever sees these values.
 */
export function workspaceMemory(workspace: Workspace): HealthProfile {
  const p = workspace.profile;
  return safeProfile({
    name: p.name,
    heightCm: 0,
    weightKg: 0,
    goal: "",
    sleepHours: 0,
    exerciseDaysPerWeek: 0,
    allergies: listOf(p.allergies),
    medicines: listOf(p.medicines),
    conditions: listOf(p.conditions),
    biomarkers: biomarkersFrom(workspace),
  });
}

/** Which specialists the supervisor actually consulted, for the UI trace. */
function consultedIn(result: unknown): string[] {
  const steps = (result as { steps?: { toolCalls?: { toolName?: string }[] }[] }).steps ?? [];
  const names = new Set<string>();
  for (const step of steps) {
    for (const call of step.toolCalls ?? []) {
      if (!call.toolName) continue;
      // askNutritionAgent -> Nutrition Agent
      const label = call.toolName.replace(/^ask/, "").replace(/([a-z])([A-Z])/g, "$1 $2");
      names.add(label);
    }
  }
  return [...names];
}

export type ConsultOptions = {
  history?: string[];
  signal?: AbortSignal;
  references?: HealthReference[];
  /** Shown under the answer, so a reader can weigh what produced it. */
  engineLabel?: string;
};

/**
 * Answer one turn with the supervisor, or return null to let the caller fall
 * back to its reference-notes path.
 *
 * Null rather than throw: "the model ladder is spent" is an ordinary outcome on
 * a free tier, and the reference notes are a genuinely useful answer. A thrown
 * error here would turn a degraded turn into a failed one.
 */
export async function consultSupervisor(
  question: string,
  workspace: Workspace,
  options: ConsultOptions = {},
): Promise<AgentReply | null> {
  if (!hasAnyModel()) return null;

  const profile = workspaceMemory(workspace);

  // ----------------------------------------------------------------
  // The deterministic safety layer, before any reasoning. Same order
  // as the old endpoint: this must work with no model configured, and
  // a model may raise its verdict but never lower it.
  // ----------------------------------------------------------------
  const state = assessTurn({
    text: question,
    profile,
    // No consultation row is persisted for a workspace turn yet; a per-request
    // id keeps the audit shape correct for when one is.
    consultationId: `ws-${Date.now().toString(36)}`,
    turn: (options.history?.length ?? 0) + 1,
  });

  if (state.triage.channel === "mental_health")
    return { mode: "escalation", text: mentalHealthResponse(), sources: [], steps: ["Checked urgent signs"] };

  if (halts(state.triage))
    return { mode: "escalation", text: emergencyResponse(state), sources: [], steps: ["Checked urgent signs"] };

  const directive = state.triage.verdict === "urgent" ? urgentAgentDirective(state) : null;
  const brief = clinicalBrief(state);
  const route = routeOf(question);
  const clinical = isClinicalTurn(state);
  const references = options.references ?? [];
  const evidence = references.length
    ? `Published reference notes for this turn (use only facts supported here; if they do not answer the question, say so):\n${references.map((r) => `${r.title}: ${r.text}`).join("\n")}`
    : "";

  const signal = options.signal
    ? AbortSignal.any([options.signal, AbortSignal.timeout(BUDGET_MS)])
    : AbortSignal.timeout(BUDGET_MS);

  const prompt = [
    ...(options.history ?? []).slice(-2).map((t) => `Earlier user message: ${t.slice(0, 500)}`),
    `Current question: ${question}`,
  ].join("\n");

  // Step down the model ladder before giving up. Free-tier quota is metered per
  // model per minute, so the next rung is a different bucket rather than a
  // retry against the exhausted one.
  for (let tier = 0; tier < MODEL_TIERS; tier++) {
    if (signal.aborted) break;
    try {
      const agent =
        route === "supervisor"
          ? buildSupervisor(profile, "", evidence, directive, brief, tier, WORKSPACE_SECTIONS, false)
          : buildSoloist(route, profile, "", evidence, directive, brief, tier, WORKSPACE_SECTIONS, false);

      const result = await agent.generate({ prompt, abortSignal: signal });
      const text = result.text?.trim();
      if (!text) continue;

      // The model may write fluent unsupported claims even when it was given
      // notes. Use the same fail-closed prose check as the reference writer.
      if (!clinical && references.length) {
        try {
          parseEducation(
            JSON.stringify({ explanation: text, sourceIds: references.map((r) => r.id) }),
            references.map((r) => r.id),
          );
        } catch {
          return null;
        }
      }

      if (clinical) {
        const verdict = validateAnswer(text, state);
        if (verdict.blocked) {
          console.error("[validate] answer withheld", {
            consultationId: state.consultationId,
            violations: verdict.violations.map((v) => v.id),
            failedClosed: verdict.failedClosed,
          });
          return { mode: "escalation", text: withheldResponse(state), sources: [], steps: ["Checked urgent signs", "Held back an unsupported answer"] };
        }
        if (!verdict.ok)
          console.warn("[validate] answer shown with violations", {
            consultationId: state.consultationId,
            violations: verdict.violations.map((v) => v.id),
          });
      }

      const consulted = consultedIn(result);
      return {
        mode: "ai",
        text,
        sources: references.map((r) => ({ title: r.title, url: r.url })),
        steps: [
          "Checked urgent signs",
          ...(consulted.length
            ? [`Consulted ${consulted.join(", ")}`]
            : [`Answered as the ${route === "supervisor" ? "Supervisor" : route} specialist`]),
          ...(clinical ? ["Checked the answer against the clinical format"] : []),
        ],
        detail: options.engineLabel,
      };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return null;
      if (tier + 1 < MODEL_TIERS)
        console.warn("[provider] tier unavailable, stepping down", { tier, next: tier + 1 });
    }
  }

  return null;
}
