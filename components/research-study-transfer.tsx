"use client";

import { useRef, useState } from "react";
import { STUDY_TRANSFER_LIMIT, parseStudyTransfer, type StudyTransfer } from "@/shared/study-plan";
import { studyTransferBackup } from "@/lib/research/study-transfer";
import type { ResearchBackup } from "@/lib/research/backup";

export function ResearchStudyTransfer({ disabled, onImport }: { disabled: boolean; onImport: (backup: ResearchBackup) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<{ raw: string; document: StudyTransfer } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function read(file?: File) {
    setPreview(null); setError(""); if (!file) return;
    if (file.size > STUDY_TRANSFER_LIMIT) { setError("Choose a study draft smaller than 250 KB."); return; }
    setLoading(true);
    try { const raw = await file.text(); setPreview({ raw, document: parseStudyTransfer(raw) }); }
    catch (e) { setError(e instanceof Error ? e.message : "This study draft could not be read."); }
    finally { setLoading(false); }
  }
  return <section aria-label="Mac study draft transfer" className="mb-4 shrink-0 space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-[11px] leading-6">
    <p className="font-medium">Continue a Mac study draft</p>
    <p className="text-[var(--text-dim)]">Import the JSON exported from Study in the Mac app. It opens as a separate conversation on this device.</p>
    <button type="button" disabled={disabled || loading} onClick={() => input.current?.click()} className="min-h-9 rounded-lg border border-[var(--border)] px-3 disabled:opacity-40">Import Mac draft</button>
    <input ref={input} type="file" accept=".json,application/json" aria-label="Mac study draft file" className="sr-only" disabled={disabled || loading} onChange={(e) => { void read(e.target.files?.[0]); e.target.value = ""; }} />
    {loading && <p role="status">Reading study draft…</p>}
    {error && <p role="alert">{error}</p>}
    {preview && <div aria-label="Study draft import preview" role="region" className="space-y-3">
      <p className="break-words font-medium">{preview.document.protocol.title}</p>
      <p>{preview.document.bibliography.length} bibliography sources. Previous review marks will be reset. Sources and authorship have not been revalidated. No AI call or new search is made.</p>
      <div className="flex flex-wrap gap-3"><button type="button" disabled={disabled} onClick={() => { try { onImport(studyTransferBackup(preview.raw)); setPreview(null); } catch (e) { setError(e instanceof Error ? e.message : "Import failed. Existing work was preserved."); } }} className="min-h-9 rounded-lg border border-[var(--border-strong)] px-3 text-[var(--emerald)] disabled:opacity-40">Open imported study draft</button><button type="button" onClick={() => setPreview(null)}>Cancel draft import</button></div>
    </div>}
  </section>;
}
