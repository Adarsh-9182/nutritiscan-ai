"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowRight, CreditCard, LogOut, ShieldCheck } from "lucide-react";
import { useAccount } from "@/lib/account/client";
import SocialSignIn from "./social-sign-in";

export default function AccountWorkspace({ statusMessage }: { statusMessage?: string }) {
  const { data, setData, error, refresh } = useAccount();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  async function cancel() {
    setBusy(true); setNotice("");
    try { const response = await fetch("/api/billing/cancel", { method: "POST" }); const value = await response.json(); if (!response.ok) throw new Error(value.error ?? "Cancellation could not be verified."); setNotice(value.message); setConfirmCancel(false); await refresh(); }
    catch (e) { setNotice(e instanceof Error ? e.message : "Please retry."); }
    finally { setBusy(false); }
  }
  async function logout() {
    setBusy(true); setNotice("");
    try {
      const response = await fetch("/api/health/auth/logout", { method: "POST" });
      if (!response.ok && response.status !== 401) throw new Error("Sign-out could not complete. Please retry.");
      if (data) setData({ ...data, account: null, plan: "free", subscription: null });
      setNotice("You’re signed out. Your device-local conversations remain on this device.");
    } catch (e) { setNotice(e instanceof Error ? e.message : "Please retry."); }
    finally { setBusy(false); }
  }
  async function manage() {
    setBusy(true); setNotice("");
    try {
      const response = await fetch("/api/billing/portal", { method: "POST" }); const value = await response.json();
      if (!response.ok) throw new Error(value.error ?? "Billing management is temporarily unavailable.");
      const url = new URL(value.url);
      if (url.protocol !== "https:" || !["billing.stripe.com", "razorpay.com", "pay.razorpay.com", "rzp.io"].includes(url.hostname)) throw new Error("The billing link could not be verified.");
      window.location.assign(url.href);
    } catch (e) { setNotice(e instanceof Error ? e.message : "Please retry."); }
    finally { setBusy(false); }
  }
  return <main className="mx-auto min-h-[100svh] max-w-3xl px-5 py-10 sm:px-8 sm:py-16"><Link href="/research" className="text-xs text-[var(--emerald)]">← Back to Research</Link><h1 className="mt-8 text-3xl font-medium tracking-tight">Your account</h1><p className="mt-3 text-sm leading-7 text-[var(--text-muted)]">One sign-in for your Health and Research workspaces.</p>
    {statusMessage && <p role="status" className="mt-6 rounded-xl border border-[var(--border)] p-4 text-sm leading-6">{statusMessage}</p>}
    {(error || notice) && <p role="status" className="mt-6 rounded-xl border border-[var(--border)] p-4 text-sm leading-6">{notice || error}<button type="button" onClick={() => void refresh()} className="ml-3 text-xs text-[var(--emerald)]">Refresh</button></p>}
    {!data ? <p className="mt-8 text-sm text-[var(--text-dim)]">Checking your account…</p> : !data.account ? <section className="mt-8 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6"><h2 className="text-lg font-medium">Sign in to manage your plan</h2><p className="mt-3 text-sm leading-7 text-[var(--text-muted)]">Your existing NutritiScan account works here. Free public chat is available without a subscription.</p><Link href="/login?next=%2Faccount" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[var(--emerald)] px-5 py-3 text-xs font-semibold text-[#07130c]">Sign in<ArrowRight size={14} /></Link></section> : <>
      <section className="mt-8 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6"><div className="flex items-center gap-3"><CreditCard size={19} className="text-[var(--emerald)]" /><h2 className="text-xl font-medium">{data.plan ? `${data.plan === "free" ? "Free" : data.plan === "pro" ? "Pro" : "Max"} plan` : "Plan temporarily unavailable"}</h2></div>
        {data.subscription ? <><p className="mt-4 text-sm text-[var(--text-muted)]">{data.subscription.cancelAtPeriodEnd ? "Access ends" : "Current billing period ends"} {new Date(data.subscription.periodEnd).toLocaleDateString()}.</p><p className="mt-3 text-sm text-[var(--text-muted)]">{Math.max(0, (data.subscription.budgetMicrousd - data.subscription.usedMicrousd) / 10_000).toLocaleString(undefined, { maximumFractionDigits: 1 })} of {(data.subscription.budgetMicrousd / 10_000).toLocaleString()} premium credits remaining.</p></> : <><p className="mt-4 text-sm leading-7 text-[var(--text-muted)]">{data.billingAvailable ? "Explore Pro and Max for premium model access in both chats." : "Your sign-in is active. Billing details are temporarily unavailable; premium access will be checked again when the service returns."}</p><Link href="/pricing" className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-[var(--emerald)]">Compare Pro and Max<ArrowRight size={14} /></Link></>}
      </section>
      {data.management && <section className="mt-5 rounded-2xl border border-[var(--border)] p-6"><h2 className="text-sm font-medium">Subscription renewal</h2>{data.management.provider === "stripe" && <button type="button" disabled={busy} onClick={() => void manage()} className="btn-ghost mt-4 rounded-xl px-4 py-3 text-xs">Open billing portal</button>}{data.management.cancelAtPeriodEnd ? <p className="mt-3 text-xs leading-6 text-[var(--text-muted)]">Renewal is canceled. You can delete your account once the recurring subscription has ended.</p> : confirmCancel ? <div className="mt-4"><p className="text-xs leading-6 text-[var(--text-muted)]">Cancel renewal? Access continues until the current paid period ends, subject to your usage allowance.</p><div className="mt-4 flex gap-4"><button type="button" disabled={busy} onClick={() => void cancel()} className="btn-ghost rounded-xl px-4 py-3 text-xs">Confirm cancellation</button><button type="button" onClick={() => setConfirmCancel(false)} className="text-xs text-[var(--emerald)]">Keep subscription</button></div></div> : <button type="button" disabled={busy} onClick={() => setConfirmCancel(true)} className="btn-ghost mt-4 rounded-xl px-4 py-3 text-xs">Cancel renewal</button>}</section>}
      <section className="mt-5 rounded-2xl border border-[var(--border)] p-6"><h2 className="flex items-center gap-2 text-sm font-medium"><ShieldCheck size={16} />Your data stays in your control</h2><p className="mt-3 text-xs leading-7 text-[var(--text-muted)]">Signing in does not sync local chats or health profiles. Manage private health-record storage and AI consent in your health space.</p><Link href="/health" className="mt-4 inline-block text-xs text-[var(--emerald)]">Open private health space →</Link></section>
      <section className="mt-5 rounded-2xl border border-[var(--border)] p-6"><h2 className="text-sm font-medium">Sign-in methods</h2><p className="mb-5 mt-3 text-xs leading-6 text-[var(--text-muted)]">Link Google or GitHub to this account to keep the same subscription and records. Sign in again before linking if your last sign-in was more than 15 minutes ago.</p><SocialSignIn next="/account" intent="link" /></section>
      <div className="mt-7 flex flex-wrap items-center gap-5"><Link href="/chat" className="text-xs text-[var(--text-muted)]">Health chat</Link><Link href="/research" className="text-xs text-[var(--text-muted)]">Research</Link><button type="button" disabled={busy} onClick={() => void logout()} className="btn-ghost ml-auto flex items-center gap-2 rounded-full px-4 py-2 text-xs"><LogOut size={13} />Sign out</button></div>
    </>}
  </main>;
}
