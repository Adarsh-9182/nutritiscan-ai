"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, FlaskConical, LockKeyhole } from "lucide-react";

export default function AccountLogin({ next }: { next: string }) {
  const [register, setRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/health/auth/${register ? "register" : "login"}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: email.trim(), password }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : typeof data.error === "string" ? data.error : "Sign-in could not be completed. Please retry.");
      setPassword("");
      const check = await fetch("/api/account", { cache: "no-store" });
      if (!check.ok || !(await check.json()).account) throw new Error("Your session could not be confirmed. Please retry.");
      window.location.assign(next);
    } catch (e) { setError(e instanceof Error ? e.message : "Please retry."); }
    finally { setBusy(false); }
  }
  return <main className="grid min-h-[100svh] place-items-center px-5 py-12">
    <section className="w-full max-w-md rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-7 sm:p-9">
      <Link href="/" className="mb-9 inline-flex items-center gap-2 text-sm font-semibold"><FlaskConical size={20} className="text-[var(--emerald)]" /> NutritiScan</Link>
      <h1 className="text-3xl font-medium tracking-tight">{register ? "Create your account" : "Welcome back"}</h1>
      <p className="mt-3 text-sm leading-7 text-[var(--text-muted)]">One sign-in for Health chat, Research and your subscription.</p>
      <form onSubmit={submit} className="mt-7 space-y-5">
        <label className="block text-xs font-medium">Email<input type="email" autoComplete="email" required maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} className="mt-2 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg)] px-4 py-3 text-base outline-none focus:border-[var(--emerald)]" /></label>
        <label className="block text-xs font-medium">Password<input type="password" autoComplete={register ? "new-password" : "current-password"} required minLength={12} maxLength={128} value={password} onChange={(e) => setPassword(e.target.value)} className="mt-2 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg)] px-4 py-3 text-base outline-none focus:border-[var(--emerald)]" /></label>
        {register && <p className="text-xs leading-6 text-[var(--text-dim)]">Use at least 12 characters. Existing NutritiScan accounts can sign in with their current credentials.</p>}
        {error && <p role="alert" className="rounded-xl border border-[var(--border-strong)] p-3 text-sm leading-6">{error}</p>}
        <button disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--emerald)] px-4 py-3 text-sm font-semibold text-[#07130c] disabled:opacity-50">{busy ? "Please wait…" : register ? "Create account" : "Sign in"}<ArrowRight size={16} /></button>
      </form>
      <button type="button" disabled={busy} onClick={() => { setRegister(!register); setPassword(""); setError(""); }} className="mt-6 text-xs text-[var(--emerald)]">{register ? "Already have an account? Sign in" : "New here? Create an account"}</button>
      <p className="mt-7 flex items-start gap-2 text-[11px] leading-6 text-[var(--text-dim)]"><LockKeyhole size={14} className="mt-1 shrink-0" />Signing in does not upload your device-local chats or health profile. Health-record storage has its own consent controls.</p>
      <div className="mt-6 flex gap-5 text-[11px] text-[var(--text-dim)]"><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href={next}>Continue with free chat</Link></div>
    </section>
  </main>;
}
