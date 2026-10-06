"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Mode = "login" | "register" | "recover";
export default function AuthPanel() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [recovery, setRecovery] = useState("");

  async function submit(form: FormData) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          username: form.get("username"),
          password: form.get("password"),
          name: form.get("name"),
          recovery: form.get("recovery"),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not sign in.");
      if (data.recovery) setRecovery(data.recovery);
      else router.push("/chat");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not sign in.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-3xl border border-white/10 bg-white/[.04] p-7 shadow-2xl shadow-black/20 sm:p-9">
      <p className="text-xs font-semibold uppercase tracking-[.18em] text-emerald-300">NutritiScan account</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">{mode === "login" ? "Welcome back" : mode === "register" ? "Create your account" : "Reset your password"}</h1>
      <p className="mt-2 text-sm leading-6 text-white/60">Save your profile securely and continue your health conversations.</p>
      {recovery ? (
        <div className="mt-7 rounded-2xl border border-amber-300/30 bg-amber-300/10 p-5">
          <h2 className="font-semibold text-amber-100">Save your new recovery key now</h2>
          <p className="mt-2 text-sm leading-5 text-white/70">It is shown once. Your previous key has been used and will no longer work.</p>
          <code className="mt-4 block break-all rounded-lg bg-black/30 p-3 text-sm text-amber-100">{recovery}</code>
          <button onClick={() => router.push("/chat")} className="mt-5 w-full rounded-xl bg-emerald-300 px-4 py-3 font-semibold text-[#07130c]">I saved it — continue</button>
        </div>
      ) : (
        <form action={submit} className="mt-7 space-y-4">
          {mode === "register" && <label className="block text-sm text-white/75">Name<input name="name" autoComplete="name" required maxLength={70} className={fieldStyle} /></label>}
          <label className="block text-sm text-white/75">Username<input name="username" autoComplete="username" required minLength={3} maxLength={32} pattern="[A-Za-z0-9_.-]+" className={fieldStyle} /></label>
          {mode === "recover" && <label className="block text-sm text-white/75">Recovery key<input name="recovery" autoComplete="off" required className={fieldStyle} /></label>}
          <label className="block text-sm text-white/75">{mode === "recover" ? "New password" : "Password"}<input name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={12} maxLength={128} className={fieldStyle} /></label>
          {mode === "register" && <p className="text-xs text-white/45">Use at least 12 characters. Keep your password and recovery key somewhere private.</p>}
          {error && <p role="alert" className="rounded-lg bg-rose-400/10 p-3 text-sm text-rose-200">{error}</p>}
          <button disabled={busy} className="w-full rounded-xl bg-emerald-300 px-4 py-3 font-semibold text-[#07130c] disabled:opacity-60">{busy ? "Please wait…" : mode === "login" ? "Sign in" : mode === "recover" ? "Reset password" : "Create account"}</button>
        </form>
      )}
      {!recovery && <div className="mt-5 flex flex-col items-center gap-3 text-sm text-white/60">
        <button type="button" onClick={() => { setError(""); setMode(mode === "login" ? "register" : "login"); }} className="hover:text-white">{mode === "login" ? "New to NutritiScan? Create an account" : "Back to sign in"}</button>
        {mode === "login" && <button type="button" onClick={() => { setError(""); setMode("recover"); }} className="hover:text-white">Forgot password? Use recovery key</button>}
      </div>}
    </section>
  );
}

const fieldStyle = "mt-2 block w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-white outline-none focus:border-emerald-300/60";
