"use client";
import { useCallback, useEffect, useState } from "react";
import type { PublicPlan } from "@/lib/billing/config";
import type { PlanId, PaidPlan } from "@/lib/billing/plans";

export type AccountSnapshot = {
  configured: boolean;
  account: { id: string; expiresAt: number } | null;
  plan: PlanId | null;
  subscription: { plan: PlanId; periodEnd: string; cancelAtPeriodEnd: boolean; budgetMicrousd: number; usedMicrousd: number } | null;
  plans: PublicPlan[];
  checkoutAvailable: boolean;
  premiumModelsEnabled: boolean;
  billingAvailable: boolean;
  management?: { provider: "stripe" | "razorpay"; cancelAtPeriodEnd: boolean } | null;
};
export function useAccount() {
  const [data, setData] = useState<AccountSnapshot | null>(null);
  const [error, setError] = useState("");
  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch("/api/account", { cache: "no-store", signal });
      const value = await response.json();
      if (!response.ok || !Array.isArray(value.plans) || !("account" in value)) throw new Error();
      if (!signal?.aborted) { setData(value); setError(""); }
    } catch { if (!signal?.aborted) setError("Account details could not be loaded. Please retry."); }
  }, []);
  useEffect(() => { const abort = new AbortController(); void Promise.resolve().then(() => { if (!abort.signal.aborted) return refresh(abort.signal); }); return () => abort.abort(); }, [refresh]);
  return { data, setData, error, refresh };
}

export async function startCheckout(plan: PaidPlan, account: AccountSnapshot | null) {
  if (!account?.account) return "/login?next=%2Fpricing";
  if (account.plan === "pro" || account.plan === "max") return "/account";
  const response = await fetch("/api/billing/checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ plan }) });
  const result = await response.json();
  if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "Checkout is temporarily unavailable.");
  const url = new URL(result.url);
  if (url.protocol !== "https:" || !["checkout.stripe.com", "rzp.io", "pay.razorpay.com"].includes(url.hostname)) throw new Error("The checkout link could not be verified.");
  window.location.assign(url.href);
}
