import { premiumModel } from "@/lib/billing/models";
import type { SharedV4ProviderOptions } from "@ai-sdk/provider";
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

export function researchModel(id: string) {
  const premium = premiumModel();
  if (premium?.id === id) return premium.model;
  return createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY })(id);
}

/** Gemini 3 uses levels. Review/planning must not inherit medium thinking. */
export function researchOptions(id: string, stage: "planning" | "draft" | "review"): SharedV4ProviderOptions {
  if (id.startsWith("openai/")) return {};
  return { google: { thinkingConfig: { thinkingLevel: id === "gemini-3.8-flash" || stage === "draft" ? "low" as const : "minimal" as const } } };
}
