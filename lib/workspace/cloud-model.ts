// ============================================================
// HOSTED MODEL — the engine the product shipped with, reconnected.
//
// The companion's agent (lib/workspace/health-agent.ts) takes a `Completion`
// and orchestrates everything else itself: escalation rules run first, the
// reference notes are retrieved deterministically, record arithmetic never
// touches a model. The only thing missing on the live site was something to
// pass as that `Completion` — the on-device path needs WebGPU and a ~1 GB
// download, and the OpenAI-compatible path in `assistant.ts` stays off until
// an operator sets HEALTH_MODEL_* explicitly. So every visitor got reference
// notes and nothing else.
//
// This is that missing argument, built on the provider ladder that was
// already in the repository (lib/agents/provider.ts): Gemini on a free tier
// first, the AI Gateway when a Gateway credential exists, and — when neither
// is configured — nothing at all, which leaves the agent on its reference
// fallback exactly as before.
//
// SERVER ONLY. It reads process.env and must never be imported into a client
// component; the browser reaches it through POST /api/workspace/assistant.
//
// WHAT REACHES THE PROVIDER: the two prompts health-agent.ts builds — a tool
// plan and an explanation grounded in published reference notes — plus the
// question and up to two earlier user messages. Stored profile values,
// reports and log entries are not in either prompt; record summaries are
// computed after the model call and appended to its text.
// ============================================================

import { generateText } from "ai";
import { MODEL_TIERS, hasAnyModel, resolveModel } from "../agents/provider";
import { modelConfigured } from "./assistant";
import type { Completion } from "./health-agent";

/** Whether a hosted model can be reached at all. */
export function cloudModelAvailable(): boolean {
  return hasAnyModel();
}

/** Labels shown against an answer so a reader knows what produced it. */
export const CLOUD_ENGINE_LABEL =
  "NutritiScan AI · experimental, not clinically validated";
export const ENDPOINT_ENGINE_LABEL =
  "Operator-configured model · experimental, not clinically validated";

/**
 * A single call's ceiling.
 *
 * A turn is two calls (plan, then synthesis) and the route allows 60s, so
 * two attempts plus a ladder step still finish inside the budget instead of
 * being hard-cut with nothing to show.
 */
const CALL_TIMEOUT_MS = 20_000;

/** Short answers by design — two or three sentences is what the prompt asks for. */
const MAX_OUTPUT_TOKENS = 700;

function aborted(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

/**
 * The hosted `Completion`.
 *
 * Steps down the model ladder on failure. That is not a retry against the
 * same exhausted bucket: free-tier quota is metered per model, so the next
 * rung is a different meter and genuinely answers when the first one is
 * spent. A caller's own cancellation is never retried — it is re-thrown so
 * the agent can stop.
 */
export const cloudComplete: Completion = async (system, question, signal) => {
  let failure: unknown = new Error("No hosted model is configured.");
  for (let tier = 0; tier < MODEL_TIERS; tier++) {
    if (signal.aborted) throw new DOMException("Stopped", "AbortError");
    const choice = resolveModel("supervisor", tier);
    try {
      const { text } = await generateText({
        model: choice.model,
        providerOptions: choice.providerOptions,
        system,
        prompt: question,
        temperature: 0,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        abortSignal: AbortSignal.any([
          signal,
          AbortSignal.timeout(CALL_TIMEOUT_MS),
        ]),
      });
      const answer = text.trim();
      if (!answer) throw new Error("Empty model response");
      return answer;
    } catch (error) {
      // The caller stopped the turn; a lower rung would answer a question
      // nobody is waiting for.
      if (signal.aborted) throw new DOMException("Stopped", "AbortError");
      if (aborted(error) && tier === MODEL_TIERS - 1) throw error;
      failure = error;
    }
  }
  throw failure instanceof Error ? failure : new Error("Model unavailable");
};

/**
 * The operator's own OpenAI-compatible endpoint (HEALTH_MODEL_*).
 *
 * Same transport `assistant.ts` already used and the same refusal to send
 * anything over plain HTTP off localhost — but driving the full agent rather
 * than a single ungrounded completion, so a self-hosted model gets the
 * reference retrieval and the safety rails too.
 */
const endpointComplete: Completion = async (system, question, signal) => {
  const base = new URL(process.env.HEALTH_MODEL_BASE_URL!);
  if (
    base.protocol !== "https:" &&
    !["127.0.0.1", "localhost", "[::1]"].includes(base.hostname)
  )
    throw new Error("HTTPS required");
  const response = await fetch(
    `${base.toString().replace(/\/$/, "")}/chat/completions`,
    {
      method: "POST",
      signal: AbortSignal.any([signal, AbortSignal.timeout(CALL_TIMEOUT_MS)]),
      headers: {
        "Content-Type": "application/json",
        ...(process.env.HEALTH_MODEL_API_KEY
          ? { Authorization: `Bearer ${process.env.HEALTH_MODEL_API_KEY}` }
          : {}),
      },
      body: JSON.stringify({
        model: process.env.HEALTH_MODEL_NAME,
        temperature: 0,
        max_tokens: MAX_OUTPUT_TOKENS,
        messages: [
          { role: "system", content: system },
          { role: "user", content: question },
        ],
      }),
    },
  );
  if (!response.ok) throw new Error("Provider unavailable");
  const result = await response.json();
  const text = String(result.choices?.[0]?.message?.content ?? "").trim();
  if (!text) throw new Error("Empty model response");
  return text;
};

export type HostedEngine = { complete: Completion; label: string };

/**
 * The engine this deployment can reach, or undefined.
 *
 * Undefined is a supported state, not a failure: the agent then answers from
 * the reference notes and says so, which is what the live site has been
 * doing. Resolved per call so a credential added to the environment takes
 * effect without a redeploy.
 */
export function hostedEngine(): HostedEngine | undefined {
  if (cloudModelAvailable())
    return { complete: cloudComplete, label: CLOUD_ENGINE_LABEL };
  if (modelConfigured())
    return { complete: endpointComplete, label: ENDPOINT_ENGINE_LABEL };
  return undefined;
}

/** Whether any hosted engine is reachable — reported by /api/workspace/status. */
export function hostedModelReady(): boolean {
  return Boolean(hostedEngine());
}
