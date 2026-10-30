export const PLAN_IDS = ["free", "pro", "max"] as const;
export type PlanId = typeof PLAN_IDS[number];
export type PaidPlan = Exclude<PlanId, "free">;
export const PLANS = {
  free: { name: "Free", tagline: "Start exploring", model: "Gemini", features: ["Public Health chat", "Source-linked Research chat", "Device-local conversation history", "Standard provider and app limits"] },
  pro: { name: "Pro", tagline: "Go further with your questions", model: "GPT-6.1 Sol", features: ["Balanced premium reasoning", "Premium access in both chats", "A monthly premium usage allowance", "Account and billing controls"] },
  max: { name: "Max", tagline: "More depth for demanding work", model: "GPT-6 Astra", features: ["Flagship premium reasoning", "A larger monthly premium allowance", "Premium access in both chats", "Account and billing controls"] },
} as const;

export function isPaidPlan(value: unknown): value is PaidPlan { return value === "pro" || value === "max"; }

/** One credit represents $0.01 of the app's configured model-usage budget,
 * not money, a token guarantee, or a refundable stored balance. */
export function planCredits(plan: PaidPlan): number {
  const raw = process.env[plan === "pro" ? "PRO_MONTHLY_AI_CREDITS" : "MAX_MONTHLY_AI_CREDITS"];
  const fallback = plan === "pro" ? 500 : 2000;
  const n = raw === undefined ? fallback : Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= 100_000 ? n : 0;
}
