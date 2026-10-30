import { createGoogleGenerativeAI } from "@ai-sdk/google";

// Pinned models listed with free-tier token access in Google's pricing docs.
// Eligibility and quota belong to the caller's Google project; a paid Google
// project can still be billed. Never fall back to the paid AI Gateway here.
// Prefer the model that completed the live chat benchmark within the turn budget.
// 3.8 remains available as a fallback; it repeatedly exceeded 12s in production.
export const RESEARCH_MODELS = ["gemini-3.6-flash", "gemini-3.5-flash-lite", "gemini-3.8-flash"] as const;

export function researchProviderStatus() {
  return { configured: Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY), models: [...RESEARCH_MODELS] };
}

export function researchModel(id: typeof RESEARCH_MODELS[number]) {
  return createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY })(id);
}

/** Gemini 3 uses levels. Review/planning must not inherit medium thinking. */
export function researchOptions(id: typeof RESEARCH_MODELS[number], stage: "planning" | "draft" | "review") {
  return { google: { thinkingConfig: { thinkingLevel: id === "gemini-3.8-flash" || stage === "draft" ? "low" as const : "minimal" as const } } };
}
