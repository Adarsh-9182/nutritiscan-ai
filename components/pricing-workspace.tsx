"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, FlaskConical } from "lucide-react";
import { startCheckout, useAccount } from "@/lib/account/client";
import type { PaidPlan } from "@/lib/billing/plans";
import { PlanCards } from "./plan-cards";

export default function PricingWorkspace() {
  const router = useRouter();
  const { data, error } = useAccount();
  const [busy, setBusy] = useState<PaidPlan | null>(null);
  const [checkoutError, setCheckoutError] = useState("");
  async function choose(plan: PaidPlan) {
    setBusy(plan); setCheckoutError("");
    try { const next = await startCheckout(plan, data); if (next) router.push(next); }
    catch (e) { setCheckoutError(e instanceof Error ? e.message : "Checkout could not open. Please retry."); }
    finally { setBusy(null); }
  }
  return <div className="mx-auto min-h-[100svh] max-w-6xl px-5 py-7 sm:px-9 sm:py-10">
    <header className="flex flex-wrap items-center justify-between gap-4"><Link href="/" className="flex items-center gap-2 text-sm font-semibold"><FlaskConical size={21} className="text-[var(--emerald)]" />NutritiScan</Link><nav className="flex gap-5 text-xs text-[var(--text-muted)]"><Link href="/chat">Health chat</Link><Link href="/research">Research</Link><Link href={data?.account ? "/account" : "/login?next=%2Fpricing"}>{data?.account ? "Account & billing" : "Sign in"}</Link></nav></header>
    <main className="py-12 sm:py-20"><div className="mx-auto mb-10 max-w-2xl text-center"><p className="mb-4 text-xs font-medium tracking-widest text-[var(--emerald)]">HEALTH + RESEARCH</p><h1 className="text-4xl font-medium tracking-tight sm:text-5xl">Choose how far you go.</h1><p className="mt-5 text-sm leading-7 text-[var(--text-muted)]">Start with Free. Choose Pro or Max for premium reasoning and a monthly usage allowance across both workspaces.</p></div>
      {(checkoutError || error) && <p role="alert" className="mb-5 rounded-xl border border-[var(--border)] p-4 text-sm">{checkoutError || error}</p>}
      <PlanCards account={data} busy={busy} onChoose={(plan) => void choose(plan)} />
      <section className="mx-auto mt-12 max-w-2xl space-y-5 text-xs leading-7 text-[var(--text-muted)]" aria-label="Plan details"><h2 className="text-lg font-medium text-[var(--text)]">One account. Both workspaces.</h2><p>Your subscription applies to public Health chat and Research chat. Signing in does not automatically upload your local conversations or health profile. Your private health-record consent remains separate.</p><p>Premium usage varies with model and context size. Each premium credit represents $0.01 of the configured AI usage budget, with input and output charged at the selected model’s rates. Credits reset each billing period and do not roll over. Unconfirmed provider usage may retain a conservative reservation. Credits are a plan allowance, not a refundable balance or a guarantee of unlimited messages. If premium access is unavailable or the allowance is exhausted, the chats can continue with basic access. The final recurring price and billing terms are shown before payment at secure checkout.</p><p>All models can make mistakes. Premium access does not establish medical accuracy, validated cures or scientific novelty. Research hypotheses and study plans still require independent review.</p></section>
    </main>
    <footer className="flex flex-wrap justify-between gap-4 border-t border-[var(--border)] pt-6 text-[11px] text-[var(--text-dim)]"><Link href="/research" className="flex items-center gap-2"><ArrowLeft size={12} />Back to Research</Link><div className="flex gap-5"><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></div></footer>
  </div>;
}
