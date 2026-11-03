import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { useAccount } from "@/lib/account/client";
import { parseResearchBackup, researchBackup, type ResearchBackup } from "@/lib/research/backup";
import type { ResearchThread } from "@/lib/research/client";

const Metadata = z.object({ accountId: z.string().uuid(), revision: z.string().uuid().nullable(), updatedAt: z.string().datetime({ offset: true }).nullable() });
type CloudSnapshot = z.infer<typeof Metadata> & { backup: ResearchBackup | null };
type Props = { threads: ResearchThread[]; disabled: boolean; onRestore: (backup: ResearchBackup) => void };

export function ResearchCloud(props: Props) {
  const { data, error, refresh } = useAccount();
  return <details className="mb-4 shrink-0 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
    <summary className="cursor-pointer text-[11px] font-medium">Account research backup</summary>
    <div className="mt-3 space-y-3 text-[11px] leading-6">
      {error ? <p role="alert">{error}<button type="button" onClick={() => void refresh()} className="ml-2 text-[var(--emerald)]">Retry account</button></p> : !data ? <p>Checking sign-in…</p> : !data.account ? <p><Link href="/login?next=%2Fresearch" className="text-[var(--emerald)]">Sign in</Link> to save and reopen research on another device. File backups work without sign-in.</p> : <CloudActions key={data.account.id} {...props} accountId={data.account.id} onAccountChanged={() => void refresh()} />}
    </div>
  </details>;
}

function CloudActions({ accountId, threads, disabled, onRestore, onAccountChanged }: Props & { accountId: string; onAccountChanged: () => void }) {
  const [remote, setRemote] = useState<CloudSnapshot | null>(null);
  const [working, setWorking] = useState(false);
  const [consent, setConsent] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  const locked = useRef(false);
  useEffect(() => () => controller.current?.abort(), []);
  const blocked = disabled || working;

  async function run(method: "GET" | "PUT" | "DELETE") {
    if (disabled || locked.current || (method !== "GET" && !remote)) return;
    if (method === "PUT" && (!consent || !threads.length)) return;
    locked.current = true; setWorking(true); setError(""); setMessage("");
    const abort = new AbortController(); controller.current = abort;
    try {
      const saved = method === "PUT" ? parseResearchBackup(researchBackup(threads)) : null;
      const response = await fetch("/api/research/backup", {
        method, cache: "no-store", signal: abort.signal,
        ...(method !== "GET" ? { headers: { "content-type": "application/json" }, body: JSON.stringify({ accountId, revision: remote!.revision, ...(saved ? { consent: true, backup: saved } : {}) }) } : {}),
      });
      const value = await response.json();
      abort.signal.throwIfAborted();
      if (!response.ok) {
        if ([401, 409].includes(response.status)) { setRemote(null); setConsent(false); setDeleting(false); onAccountChanged(); }
        throw new Error(typeof value.error === "string" ? value.error : "Account research could not be accessed.");
      }
      const metadata = Metadata.parse(value);
      if (metadata.accountId !== accountId) { setRemote(null); onAccountChanged(); throw new Error("Your account changed. Check the backup again after sign-in refreshes."); }
      const backup = method === "PUT" ? saved : value.backup === null ? null : parseResearchBackup(JSON.stringify(value.backup));
      setRemote({ ...metadata, backup }); setConsent(false); setDeleting(false);
      setMessage(method === "GET" ? "Account backup checked. Device conversations are unchanged." : method === "PUT" ? "Research snapshot saved to this account." : "Account backup deleted. Device conversations are unchanged.");
    } catch (e) { if (!abort.signal.aborted) setError(e instanceof Error ? e.message : "Account research is unavailable. Device conversations are unchanged."); }
    finally { locked.current = false; if (!abort.signal.aborted) setWorking(false); controller.current = null; }
  }
  function restore() {
    if (!remote?.backup || blocked) return;
    try { onRestore(remote.backup); setError(""); setMessage("Account conversations merged into this device. Existing work was preserved."); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not restore. Device conversations are unchanged."); }
  }

  return <div className="space-y-3">
    <p>Save a snapshot of this device’s research messages, sources and saved notes to your signed-in account. Updates are manual; health records and health chat are separate.</p>
    <button type="button" disabled={blocked} onClick={() => void run("GET")} className="min-h-9 rounded-lg border border-[var(--border)] px-3 text-[var(--emerald)] disabled:opacity-40">{working ? "Working…" : "Check account backup"}</button>
    {remote && <div className="space-y-3">
      {remote.backup ? <><p>{remote.backup.threads.length} conversations · saved {remote.updatedAt ? new Date(remote.updatedAt).toLocaleString() : "previously"}</p><ul className="max-h-24 overflow-y-auto">{remote.backup.threads.map((t) => <li key={t.id} className="break-words">{t.title}</li>)}</ul><button type="button" disabled={blocked} onClick={restore} className="min-h-9 rounded-lg border border-[var(--border)] px-3 text-[var(--emerald)] disabled:opacity-40">Restore account conversations</button><p className="text-[10px] text-[var(--text-dim)]">Restore merges into this device. Identical copies are skipped; conflicting versions stay separate. Sources are not revalidated.</p></> : <p>No research backup in this account.</p>}
      <label className="flex items-start gap-2"><input type="checkbox" disabled={blocked} checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1.5 shrink-0" /><span>Save this device’s research to this account{remote.backup ? ", replacing the account snapshot shown above" : ""}.</span></label>
      <button type="button" disabled={blocked || !consent || !threads.length} onClick={() => void run("PUT")} className="min-h-9 rounded-lg border border-[var(--border-strong)] px-3 text-[var(--emerald)] disabled:opacity-40">Save device research to account</button>
      {remote.backup && (deleting ? <div className="space-y-2"><p>Delete the account snapshot? File backups and device conversations remain.</p><div className="flex flex-wrap gap-3"><button type="button" disabled={blocked} onClick={() => void run("DELETE")} className="min-h-9 text-[var(--emerald)] disabled:opacity-40">Confirm delete account backup</button><button type="button" disabled={blocked} onClick={() => setDeleting(false)}>Cancel deletion</button></div></div> : <button type="button" disabled={blocked} onClick={() => setDeleting(true)} className="block min-h-9 text-[var(--text-dim)] disabled:opacity-40">Delete account backup</button>)}
    </div>}
    {message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}
    <p className="text-[10px] text-[var(--text-dim)]">Stored encrypted on the account service. A changed revision blocks overwrites from another session. Deleting your account also removes its research backup.</p>
  </div>;
}
