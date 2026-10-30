"use client";
import { useEffect, useState } from "react";
type Provider = "google" | "github";
type Readiness = { available: boolean; google: { enabled: boolean; linked: boolean }; github: { enabled: boolean; linked: boolean } };
function GoogleMark() { return <svg aria-hidden="true" viewBox="0 0 48 48" width="18" height="18"><path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.2v5.1h6.6c3.9-3.6 6.1-8.8 6.1-15z"/><path fill="#34A853" d="M24 44c5.5 0 10.1-1.8 13.5-4.9l-6.6-5.1c-1.8 1.2-4.1 2-6.9 2-5.3 0-9.8-3.6-11.4-8.4H5.8v5.3A20.4 20.4 0 0 0 24 44z"/><path fill="#FBBC05" d="M12.6 27.6a12.1 12.1 0 0 1 0-7.2v-5.3H5.8a20.3 20.3 0 0 0 0 17.8l6.8-5.3z"/><path fill="#EA4335" d="M24 12c3 0 5.7 1 7.8 3.1l5.8-5.8A19.4 19.4 0 0 0 24 4 20.4 20.4 0 0 0 5.8 15.1l6.8 5.3C14.2 15.6 18.7 12 24 12z"/></svg>; }
export default function SocialSignIn({ next, intent = "login" }: { next: string; intent?: "login" | "link" }) {
  const [providers, setProviders] = useState<Readiness | null>(null);
  const [busy, setBusy] = useState<Provider | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    fetch(`/api/account/providers?intent=${intent}`, { cache: "no-store", signal: abort.signal }).then(async (r) => {
      if (!r.ok) throw new Error(); const data = await r.json();
      if (!abort.signal.aborted && typeof data.google?.enabled === "boolean" && typeof data.github?.enabled === "boolean") setProviders(data);
    }).catch(() => { if (!abort.signal.aborted) setProviders({ available: false, google: { enabled: false,linked: false }, github: { enabled: false,linked: false } }); });
    return () => abort.abort();
  }, [intent]);
  async function start(provider: Provider) {
    if (busy) return;
    setBusy(provider); setError("");
    try {
      const response = await fetch(`/api/account/oauth/${provider}/start`, { method: "POST",headers: { "content-type":"application/json" },body: JSON.stringify({ next,intent }) });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Sign-in could not start. Please retry.");
      const url = new URL(data.url);
      if (url.protocol !== "https:" || url.username || url.password || url.hostname !== (provider === "google" ? "accounts.google.com" : "github.com")) throw new Error("The sign-in link could not be verified.");
      window.location.assign(url.href);
    } catch (e) { setError(e instanceof Error ? e.message : "Sign-in could not start. Please retry."); setBusy(null); }
  }
  return <section aria-label={intent === "link" ? "Linked sign-in methods" : "Social sign-in"} className="space-y-3">
    {(["google","github"] as const).map((provider) => {
      const name = provider === "google" ? "Google" : "GitHub";
      const linked = intent === "link" && providers?.[provider].linked;
      return <button key={provider} type="button" disabled={!providers?.[provider].enabled || Boolean(busy) || linked} onClick={() => void start(provider)} title={!providers?.[provider].enabled ? `${name} sign-in is being configured` : undefined} className="flex min-h-12 w-full items-center justify-center gap-3 rounded-xl border border-[var(--border-strong,#354c3d)] bg-[var(--surface,#0e1613)] px-4 py-3 text-sm font-medium text-[var(--text,#e9f2ec)] transition-colors hover:bg-[var(--surface-2,#14201b)] disabled:cursor-default disabled:opacity-55">{provider === "google" ? <GoogleMark /> : <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 .75a11.25 11.25 0 0 0-3.558 21.922c.563.105.77-.244.77-.542 0-.267-.01-.975-.015-1.914-3.13.68-3.79-1.51-3.79-1.51-.512-1.3-1.25-1.647-1.25-1.647-1.022-.7.078-.686.078-.686 1.13.08 1.725 1.16 1.725 1.16 1.005 1.723 2.637 1.225 3.28.937.102-.729.393-1.225.715-1.507-2.5-.284-5.13-1.25-5.13-5.564 0-1.23.44-2.234 1.16-3.022-.117-.284-.503-1.43.11-2.98 0 0 .946-.303 3.095 1.154a10.8 10.8 0 0 1 5.634 0c2.15-1.457 3.094-1.154 3.094-1.154.615 1.55.228 2.696.112 2.98.722.788 1.158 1.792 1.158 3.022 0 4.326-2.635 5.277-5.146 5.557.405.35.766 1.04.766 2.097 0 1.514-.014 2.735-.014 3.107 0 .3.203.652.774.54A11.25 11.25 0 0 0 12 .75Z" /></svg>}{busy === provider ? "Opening sign-in…" : linked ? `${name} linked` : intent === "link" ? `Link ${name}` : `Continue with ${name}`}</button>;
    })}
    {error && <p role="alert" className="text-xs leading-6 text-[var(--text-muted,#a3b5a9)]">{error}</p>}
    {providers && !providers.google.enabled && !providers.github.enabled && <p className="text-[11px] leading-6 text-[var(--text-dim,#869388)]">{providers.available ? "Google and GitHub sign-in are being configured. Email sign-in is available." : "Social sign-in is temporarily unavailable. You can continue with email."}</p>}
  </section>;
}
