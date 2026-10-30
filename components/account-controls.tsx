"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Crown, UserRound, X } from "lucide-react";
import { startCheckout, useAccount } from "@/lib/account/client";
import type { PaidPlan } from "@/lib/billing/plans";
import { PlanCards } from "./plan-cards";

export default function AccountControls({ returnTo }: { returnTo: "/chat" | "/research" }) {
  const router = useRouter();
  const { data, error, refresh } = useAccount();
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState<PaidPlan | null>(null);
  const [checkoutError, setCheckoutError] = useState("");
  function open() { if (typeof dialog.current?.showModal === "function") dialog.current.showModal(); else router.push("/pricing"); }
  async function choose(plan: PaidPlan) {
    setBusy(plan); setCheckoutError("");
    try {
      const next = await startCheckout(plan, data); if (next) router.push(next);
    } catch (e) { setCheckoutError(e instanceof Error ? e.message : "Please retry."); }
    finally { setBusy(null); }
  }
  return <div className="flex w-full items-center justify-end gap-2 border-t border-[var(--border)] pt-2 sm:ml-auto sm:w-auto sm:border-0 sm:pt-0">
    <Link href={data?.account ? "/account" : `/login?next=${encodeURIComponent(returnTo)}`} className="btn-ghost flex items-center gap-1.5 rounded-full px-3 py-2 text-[11px]"><UserRound size={13} />{data?.account ? data.plan ? `${data.plan === "free" ? "Free" : data.plan === "pro" ? "Pro" : "Max"} plan` : "Your account" : "Sign in"}</Link>
    <button type="button" onClick={open} className="flex items-center gap-1.5 rounded-full border border-[var(--border-strong)] bg-[var(--surface-2)] px-3 py-2 text-[11px] font-medium text-[var(--emerald)]"><Crown size={13} />Upgrade</button>
    <dialog ref={dialog} aria-labelledby="upgrade-dialog-title" className="m-auto max-h-[90svh] w-[min(1080px,calc(100vw-24px))] overflow-y-auto rounded-3xl border border-[var(--border-strong)] bg-[var(--bg)] p-5 text-[var(--text)] shadow-2xl backdrop:bg-black/65 sm:p-8">
      <div className="mb-6 flex items-start justify-between gap-5"><div><p className="mb-2 text-[11px] font-medium text-[var(--emerald)]">HEALTH + RESEARCH</p><h1 id="upgrade-dialog-title" className="text-2xl font-medium tracking-tight sm:text-3xl">Upgrade your workspace</h1><p className="mt-3 max-w-xl text-xs leading-6 text-[var(--text-muted)]">Choose premium reasoning and a usage allowance that fits your work. One subscription covers both chats.</p></div><button type="button" aria-label="Close upgrade plans" onClick={() => dialog.current?.close()} className="btn-ghost grid h-9 w-9 shrink-0 place-items-center rounded-full"><X size={16} /></button></div>
      {(error || checkoutError) && <p role="alert" className="mb-4 rounded-xl border border-[var(--border)] p-3 text-xs leading-6">{checkoutError || error}<button type="button" onClick={() => void refresh()} className="ml-2 text-[var(--emerald)]">Retry</button></p>}
      <PlanCards account={data} busy={busy} onChoose={(plan) => void choose(plan)} />
      <p className="mt-5 text-[11px] leading-6 text-[var(--text-dim)]">Premium credits vary with model and context size; they do not represent an unlimited number of messages. Final recurring price and billing terms appear at secure checkout. A stronger model does not establish medical accuracy or validate a research hypothesis.</p>
      <div className="mt-4 flex flex-wrap gap-5 text-[11px] text-[var(--text-dim)]"><Link href="/pricing">Compare all plans</Link><Link href="/account">Account & billing</Link><Link href="/terms">Terms</Link><Link href="/privacy">Privacy</Link></div>
    </dialog>
  </div>;
}
