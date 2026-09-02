// ============================================================
// MODEL PROVIDER
//
// The product shipped pointing at `anthropic/claude-sonnet-5` through
// Vercel's AI Gateway, and production has no credential at all — so
// `hasModelCredential()` was false, the real supervisor never ran, and every
// answer in production came from the keyless demo brain. The comment in
// app/api/chat/route.ts records the other half of it: when the Gateway was
// reachable it answered 403 "requires a valid credit card".
//
// So the model was never the thing that was broken. The way it was reached
// was.
//
// Resolution order, first credential wins:
//
//   1. GOOGLE_GENERATIVE_AI_API_KEY — Gemini. A real free tier, no card,
//      obtained from aistudio.google.com. This is the default for a product
//      that has not earned a bill yet.
//   2. AI_GATEWAY_API_KEY / VERCEL_OIDC_TOKEN — the Gateway, for when there
//      is a card and a better model is wanted.
//   3. Nothing — the demo brain answers, as it does today.
//
// Chosen at call time rather than module load, because a serverless instance
// can outlive an environment change and a stale provider is a silent one.
// ============================================================

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { EmbeddingModel, LanguageModel } from "ai";
import type { SharedV4ProviderOptions } from "@ai-sdk/provider";

/**
 * The model ladder, strongest first.
 *
 * Two problems are solved by one list, because on the free tier they are the
 * same problem.
 *
 * ACCURACY. The single pin used to be `gemini-3.5-flash-lite`, chosen not
 * because it reasons well but because it was the model whose quota had not
 * run out. Measured on the same clinical prompt (low B12, vegetarian,
 * three weeks of fingertip numbness), the lite model returns a correct but
 * thin answer; `gemini-3.5-flash` returns roughly twice the content and is
 * the one that connects the deficiency to the myelin sheath and names the
 * neuropathy. For a product whose whole claim is answering like a
 * clinician, the reasoning model has to be the default and the lite model
 * has to be the fallback, not the other way round.
 *
 * AVAILABILITY. Free-tier quota is metered PER MODEL PER PROJECT —
 * `gemini-3.5-flash` allows 5 requests per minute, verified live against
 * this key from the 429's own QuotaFailure detail
 * (GenerateRequestsPerMinutePerProjectPerModel-FreeTier, quotaValue "5").
 * With one model pinned, the sixth request in a minute got no answer from
 * any model: the route saw the failure, returned "unavailable", and the
 * keyless demo brain answered a health question in production. Because the
 * meter is per model, stepping DOWN the ladder is not a retry against the
 * same exhausted bucket — it is a different bucket, and it works.
 *
 * So the order is: reason well if there is room, reason adequately if there
 * is not, and only tell the user we are degraded once the whole ladder is
 * spent.
 *
 * Every id here was verified live against this key. Anything 2.5-era 404s
 * for new keys ("no longer available to new users"), and `-latest` aliases
 * are excluded on purpose: a floating alias can change the model under a
 * medical product between one deploy and the next, with no diff to review
 * and no eval run against the thing that is actually answering.
 */
const MODEL_LADDER = ["gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-3.5-flash-lite"] as const;

/** How many rungs a caller may step down before giving up. */
export const MODEL_TIERS = MODEL_LADDER.length;

/**
 * Specialists start one rung down.
 *
 * A supervised turn fans out to several of them at once, which is exactly
 * the shape that trips a 5-per-minute limit, and their job is narrow — the
 * prompt already tells each one precisely what to produce. Keeping the top
 * rung for the agent that actually talks to the user means the fan-out
 * cannot starve the synthesis.
 */
function ladderIndex(role: "supervisor" | "specialist", tier: number): number {
  const start = role === "specialist" ? 1 : 0;
  return Math.min(MODEL_LADDER.length - 1, start + Math.max(0, tier));
}

/** Also verified live; text-embedding-004 is not served to new keys. */
const GEMINI_EMBEDDING_MODEL = "gemini-embedding-001";

/** Used only when a Gateway credential is present. */
const GATEWAY_MODEL = "anthropic/claude-sonnet-5";

/** Anthropic serves no embeddings endpoint; the Gateway routes this elsewhere. */
const GATEWAY_EMBEDDING_MODEL = "openai/text-embedding-3-small";

export type ProviderChoice = {
  model: LanguageModel;
  /** Recorded on the assessment row, so an answer can be traced to what produced it. */
  id: string;
  /** Passed to the agent; empty for providers with nothing to configure. */
  providerOptions: SharedV4ProviderOptions;
};

/**
 * Thinking budgets.
 *
 * Measured, not guessed: the same prompt against gemini-3.6-flash took 9.45s
 * with the default extended thinking and 0.87s with the budget at zero. A
 * turn runs three of those sequentially — supervisor routes, specialist
 * answers, supervisor synthesises — which is the whole of the 35–50s a
 * clinical consult was taking, and why turns were hitting the 50s ceiling
 * and returning nothing at all.
 *
 * Spending it where it helps and not where it doesn't:
 *
 *   Specialists get none. Their job is narrow and their prompt already tells
 *   them exactly what to produce.
 *
 *   The supervisor gets a small budget, because routing and synthesis are
 *   the parts where a moment's deliberation shows.
 *
 * Worth being explicit, since this is a health product: the clinical
 * decisions are not the model's to make. Rules decide urgency before it
 * runs and validators check the answer after, so what is being traded here
 * is fluency, not safety.
 */
const SPECIALIST_THINKING = 0;
const SUPERVISOR_THINKING = 512;

function geminiOptions(thinkingBudget: number): SharedV4ProviderOptions {
  return { google: { thinkingConfig: { thinkingBudget } } };
}

export function hasGemini(): boolean {
  return Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY);
}

export function hasGateway(): boolean {
  return Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN);
}

/** Whether any real model can be reached. The demo brain answers when false. */
export function hasAnyModel(): boolean {
  return hasGemini() || hasGateway();
}

/**
 * The model to use for this call.
 *
 * Always returns something. A model reference is just a handle — whether a
 * call with it succeeds depends on the credential, and `hasAnyModel()`
 * already decides whether the real supervisor is attempted at all. Making
 * this nullable pushed a branch into every construction site that could not
 * do anything useful with it, and broke agent tests that only ever inspect
 * the assembled prompt.
 */
export function resolveModel(
  role: "supervisor" | "specialist" = "supervisor",
  /** Rungs to step down the ladder. Raised by the caller after a failed attempt. */
  tier = 0,
): ProviderChoice {
  if (hasGemini()) {
    const google = createGoogleGenerativeAI({
      apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    });
    const name = MODEL_LADDER[ladderIndex(role, tier)];
    return {
      model: google(name),
      id: `google/${name}`,
      providerOptions: geminiOptions(
        role === "supervisor" ? SUPERVISOR_THINKING : SPECIALIST_THINKING,
      ),
    };
  }
  // The Gateway resolves a bare string itself; no client to construct. Also
  // the fallback when nothing is configured, which keeps construction total.
  return { model: GATEWAY_MODEL as unknown as LanguageModel, id: GATEWAY_MODEL, providerOptions: {} };
}

/**
 * Embeddings for semantic recall (lib/memory/recall.ts).
 *
 * Gemini serves embeddings on the same free key, which removes the awkward
 * arrangement the old comment described — routing to OpenAI through the
 * Gateway purely because Anthropic has no embeddings endpoint.
 */
export function resolveEmbeddingModel() {
  if (hasGemini()) {
    const google = createGoogleGenerativeAI({
      apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    });
    return google.textEmbeddingModel(GEMINI_EMBEDDING_MODEL);
  }
  // Same reasoning as resolveModel: total rather than nullable. Recall
  // already degrades to null on a failed call, which covers the no-credential
  // case without a second branch.
  return GATEWAY_EMBEDDING_MODEL as unknown as EmbeddingModel;
}
