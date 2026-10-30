"use client";
import Link from "next/link";
import { ArrowUpRight, Check, Crown } from "lucide-react";
import { PLAN_IDS, PLANS, type PaidPlan } from "@/lib/billing/plans";
import type { PublicPlan } from "@/lib/billing/config";
import type { AccountSnapshot } from "@/lib/account/client";

const fallback: PublicPlan[] = PLAN_IDS.map((id) => ({ id, ...PLANS[id], amountMinor: id === "free" ? 0 : null, currency: "INR", interval: "month", credits: null, available: id === "free" }));
export function PlanCards({ account, busy, onChoose }: { account: AccountSnapshot | null; busy?: PaidPlan | null; onChoose: (id: PaidPlan) => void }) {
  const plans = account?.plans ?? fallback;
  return <div className="grid gap-4 md:grid-cols-3">{plans.map((plan) => {
    const current = account?.account && account.plan === plan.id;
    const paid = plan.id !== "free";
    return <section key={plan.id} className={`relative flex min-w-0 flex-col rounded-2xl border p-5 sm:p-6 ${plan.id === "pro" ? "border-[var(--emerald)] bg-[var(--surface-2)]" : "border-[var(--border)] bg-[var(--surface)]"}`} aria-label={`${plan.name} plan`}>
      <div className="flex items-center justify-between gap-2"><h2 className="text-xl font-semibold">{plan.name}</h2>{current ? <span className="rounded-full border border-[var(--border)] px-2 py-1 text-[10px]">Current plan</span> : plan.id === "pro" ? <Crown size={18} className="text-[var(--emerald)]" /> : null}</div>
      <p className="mt-2 text-xs leading-6 text-[var(--text-muted)]">{plan.tagline}</p>
      <div className="mb-5 mt-6 min-h-12">{plan.amountMinor === null ? <p className="text-lg font-medium">Coming soon</p> : <p className="text-3xl font-semibold tracking-tight">{new Intl.NumberFormat("en", { style: "currency", currency: plan.currency, maximumFractionDigits: plan.amountMinor % 100 ? 2 : 0 }).format(plan.amountMinor / 100)}{paid && <span className="text-xs font-normal text-[var(--text-dim)]"> / month</span>}</p>}{paid && plan.credits ? <p className="mt-2 text-[11px] text-[var(--text-dim)]">{plan.credits.toLocaleString()} premium credits per billing period</p> : <p className="mt-2 text-[11px] text-[var(--text-dim)]">{paid ? "Subscriptions are opening soon" : "No subscription required"}</p>}</div>
      <p className="mb-4 text-xs font-medium text-[var(--emerald)]">{paid ? `${plan.model} access` : `${plan.model} · standard access`}</p>
      <ul className="mb-7 space-y-3 text-xs leading-6 text-[var(--text-muted)]">{plan.features.map((feature) => <li key={feature} className="flex items-start gap-2"><Check size={14} className="mt-1 shrink-0 text-[var(--emerald)]" /><span>{feature}</span></li>)}</ul>
      {!paid ? <Link href="/chat" className="btn-ghost mt-auto flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-xs">Keep exploring<ArrowUpRight size={13} /></Link> : <button type="button" disabled={!plan.available || Boolean(busy) || Boolean(current)} onClick={() => onChoose(plan.id as PaidPlan)} className={`mt-auto rounded-xl border px-4 py-3 text-xs font-semibold disabled:cursor-default disabled:opacity-50 ${plan.id === "pro" ? "border-[var(--emerald)] bg-[var(--emerald)] text-[var(--research-on-accent,#07130c)]" : "border-[var(--border-strong)] bg-[var(--said)] text-[var(--text)]"}`}>{current ? "Current plan" : !plan.available ? "Checkout opens soon" : busy === plan.id ? "Opening checkout…" : account?.account ? `Upgrade to ${plan.name}` : `Sign in to choose ${plan.name}`}</button>}
    </section>;
  })}</div>;
}

export function PlanUpsell() {
  return <section className="mt-4 rounded-xl border border-[var(--border-strong)] bg-[var(--surface-2)] p-3" aria-label="Upgrade your plan"><p className="flex items-center gap-2 text-xs font-semibold"><Crown size={14} className="text-[var(--emerald)]" />Go further with Pro or Max</p><p className="mt-2 text-[11px] leading-6 text-[var(--text-dim)]">Premium models for Health and Research, with a monthly usage allowance.</p><Link href="/pricing" className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-[var(--emerald)]">Explore plans <ArrowUpRight size={12} /></Link></section>;
}
