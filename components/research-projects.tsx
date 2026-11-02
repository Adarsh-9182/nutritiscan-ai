import { useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import { BACKUP_LIMIT, parseResearchBackup, type ResearchBackup } from "@/lib/research/backup";
import type { ResearchThread } from "@/lib/research/client";

export function ResearchProjects({ threads, disabled, onExport, onImport }: {
  threads: ResearchThread[]; disabled: boolean; onExport: () => void;
  onImport: (backup: ResearchBackup) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<ResearchBackup | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function read(file: File | undefined) {
    setError(""); setPreview(null);
    if (!file) return;
    if (file.size > BACKUP_LIMIT) { setError("Choose a research backup smaller than 1 MB."); return; }
    setLoading(true);
    try { setPreview(parseResearchBackup(await file.text())); }
    catch (e) { setError(e instanceof Error ? e.message : "This backup could not be read."); }
    finally { setLoading(false); }
  }
  return <div className="mb-4 shrink-0 space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
    <p className="text-[11px] font-medium">Research backups</p>
    <div className="flex flex-wrap gap-2"><button type="button" disabled={disabled || !threads.length} onClick={onExport} className="flex min-h-9 items-center gap-1.5 rounded-lg border border-[var(--border)] px-2 text-[11px] disabled:opacity-40"><Download size={12} />Back up all</button><button type="button" disabled={disabled || loading} onClick={() => input.current?.click()} className="flex min-h-9 items-center gap-1.5 rounded-lg border border-[var(--border)] px-2 text-[11px] disabled:opacity-40"><Upload size={12} />Restore backup</button></div>
    <input ref={input} type="file" accept=".json,application/json" aria-label="Research backup file" className="sr-only" disabled={disabled || loading} onChange={(e) => { void read(e.target.files?.[0]); e.target.value = ""; }} />
    {loading && <p role="status" className="text-xs">Reading backup…</p>}
    {error && <p role="alert" className="text-xs leading-6">{error}</p>}
    {preview && <div role="region" aria-label="Research backup preview" className="space-y-3 text-xs leading-6"><p>{preview.threads.length} conversations · exported {new Date(preview.exportedAt).toLocaleDateString()}</p><ul className="max-h-32 space-y-1 overflow-y-auto">{preview.threads.map((t) => <li key={t.id} className="break-words">{t.title} · {t.turns.length} questions</li>)}</ul><p className="text-[11px] text-[var(--text-dim)]">Existing conversations stay. Identical copies are skipped; conflicting versions are kept separately. Imported content is not revalidated against the original sources.</p><div className="flex gap-3"><button type="button" disabled={disabled} onClick={() => { try { onImport(preview); setPreview(null); setError(""); } catch (e) { setError(e instanceof Error ? e.message : "Import failed. Nothing has been changed."); } }} className="rounded-lg border border-[var(--border-strong)] px-3 py-2 text-[var(--emerald)] disabled:opacity-40">Import conversations</button><button type="button" onClick={() => setPreview(null)}>Cancel import</button></div></div>}
    <p className="text-[10px] leading-5 text-[var(--text-dim)]">Files include research messages, sources and saved notes. Store them privately. Backups stay on your device; they are not cloud sync.</p>
  </div>;
}

export function ResearchProjectTitle({ thread, disabled, onRename }: { thread: ResearchThread; disabled: boolean; onRename: (title: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(thread.title);
  return <div className="mb-7 rounded-xl border border-[var(--border)] px-4 py-3">
    {editing ? <form onSubmit={(e) => { e.preventDefault(); if (!disabled && title.trim()) { onRename(title.trim()); setEditing(false); } }} className="space-y-3"><label className="block text-xs">Conversation name<input aria-label="Research conversation name" autoFocus maxLength={160} value={title} onChange={(e) => setTitle(e.target.value)} className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-base" /></label><div className="flex gap-3 text-xs"><button type="submit" disabled={disabled || !title.trim()} className="text-[var(--emerald)] disabled:opacity-40">Save name</button><button type="button" onClick={() => { setTitle(thread.title); setEditing(false); }}>Cancel rename</button></div></form> : <div className="flex items-start justify-between gap-3"><p className="min-w-0 break-words text-xs font-medium leading-6">{thread.title}</p><button type="button" disabled={disabled} onClick={() => { setTitle(thread.title); setEditing(true); }} className="shrink-0 py-1 text-[11px] text-[var(--emerald)] disabled:opacity-40">Rename</button></div>}
    {thread.importedAt && <p className="mt-2 text-[11px] leading-6 text-[var(--text-dim)]">Imported backup · source content and previous AI checks have not been revalidated. Verify originals before relying on these results.</p>}
  </div>;
}
