import { PLANS, planCredits, type PlanId } from "./plans";

export function premiumModelsEnabled() {
  return process.env.PREMIUM_AI_ENABLED === "true" && usable(process.env.AI_GATEWAY_API_KEY);
}
function usable(value?: string) { return Boolean(value && value.length >= 16 && !value.includes("[SENSITIVE]")); }
export function liveBilling() { return process.env.NODE_ENV === "production" && process.env.VERCEL_ENV !== "preview"; }
export function billingProvider(): "stripe" | "razorpay" | null {
  return process.env.BILLING_PROVIDER === "stripe" ? "stripe" : process.env.BILLING_PROVIDER === "razorpay" ? "razorpay" : null;
}
export function checkoutConfigured() {
  const provider = billingProvider();
  return process.env.BILLING_ENABLED === "true" && premiumModelsEnabled() && Boolean(provider && (
    provider === "stripe" ? process.env.STRIPE_SECRET_KEY?.startsWith(liveBilling() ? "sk_live_" : "sk_test_") && usable(process.env.STRIPE_WEBHOOK_SECRET) && process.env.STRIPE_PRO_PRICE_ID && process.env.STRIPE_MAX_PRICE_ID
      : process.env.RAZORPAY_KEY_ID?.startsWith(liveBilling() ? "rzp_live_" : "rzp_test_") && usable(process.env.RAZORPAY_KEY_SECRET) && usable(process.env.RAZORPAY_WEBHOOK_SECRET) && process.env.RAZORPAY_PRO_PLAN_ID && process.env.RAZORPAY_MAX_PLAN_ID && /^\d+$/.test(process.env.RAZORPAY_TOTAL_COUNT ?? "")
  ));
}
export function publicPlans() {
  return (["free", "pro", "max"] as const).map((id) => {
    const raw = id === "free" ? "0" : process.env[id === "pro" ? "PRO_MONTHLY_PRICE_MINOR" : "MAX_MONTHLY_PRICE_MINOR"];
    const amount = raw !== undefined && /^\d+$/.test(raw) && Number(raw) <= 10_000_000 ? Number(raw) : null;
    return { id: id as PlanId, ...PLANS[id], amountMinor: amount, currency: process.env.BILLING_CURRENCY === "USD" ? "USD" : "INR", interval: "month" as const, credits: id === "free" ? null : planCredits(id), available: id === "free" || Boolean(amount && checkoutConfigured()) };
  });
}
export type PublicPlan = ReturnType<typeof publicPlans>[number];
