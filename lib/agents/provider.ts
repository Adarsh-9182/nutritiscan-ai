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

/**
 * Gemini Flash rather than Pro.
 *
 * The free tier's limits are per-minute and per-day, and the supervisor fans
 * out to five specialists in a single turn — Pro's quota is spent in a few
 * consults. Flash reasons well enough for triage-adjacent explanation, which
 * is what this product asks of it: the clinical decisions are made by rules
 * before the model runs and checked by validators after it.
 */
const GEMINI_MODEL = "gemini-2.0-flash";

/** Used only when a Gateway credential is present. */
const GATEWAY_MODEL = "anthropic/claude-sonnet-5";

/** Anthropic serves no embeddings endpoint; the Gateway routes this elsewhere. */
const GATEWAY_EMBEDDING_MODEL = "openai/text-embedding-3-small";

export type ProviderChoice = {
  model: LanguageModel;
  /** Recorded on the assessment row, so an answer can be traced to what produced it. */
  id: string;
};

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
export function resolveModel(): ProviderChoice {
  if (hasGemini()) {
    const google = createGoogleGenerativeAI({
      apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    });
    return { model: google(GEMINI_MODEL), id: `google/${GEMINI_MODEL}` };
  }
  // The Gateway resolves a bare string itself; no client to construct. Also
  // the fallback when nothing is configured, which keeps construction total.
  return { model: GATEWAY_MODEL as unknown as LanguageModel, id: GATEWAY_MODEL };
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
    return google.textEmbeddingModel("text-embedding-004");
  }
  // Same reasoning as resolveModel: total rather than nullable. Recall
  // already degrades to null on a failed call, which covers the no-credential
  // case without a second branch.
  return GATEWAY_EMBEDDING_MODEL as unknown as EmbeddingModel;
}
