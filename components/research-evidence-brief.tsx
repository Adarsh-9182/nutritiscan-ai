"use client";

import { useState } from "react";
import { FileText, LoaderCircle, Printer, Trash2 } from "lucide-react";
import type { AgentSource } from "@/lib/agent-runtime/contracts";
import type { ResearchTurn } from "@/lib/research/client";
import { BRIEF_FIELDS, BRIEF_LABELS, briefCellText, briefCsv, briefPrintHtml, briefSelectionChanged, briefText, type EvidenceBrief } from "@/lib/research/brief";

export function ResearchBrief({ turn, disabled, generating, imported, onBuild, onEdit, onDelete, onInspect, onDownload, onNotice }: {
  turn: ResearchTurn; disabled: boolean; generating: boolean; imported: boolean;
  onBuild: () => Promise<void>; onEdit: (id: string, patch: Pick<EvidenceBrief, "title" | "notes" | "reviewedAt">) => void;
  onDelete: (id: string) => void; onInspect: (source: AgentSource, quote?: string) => void;
  onDownload: (content: string, filename: string, type: string) => void; onNotice: (text: string) => void;
}) {
  const [selected, setSelected] = useState("");
  const included = turn.reply?.sources.filter((s) => turn.sourceReviews?.some((r) => r.sourceId === s.id && r.decision === "include")).map((s) => s.id) ?? [];
  const briefs = turn.briefs ?? [], brief = briefs.find((b) => b.id === selected) ?? briefs.at(-1);
  const stale = brief ? briefSelectionChanged(brief, included) : false;
  function print() {
    if (!brief) return;
    const target = window.open("", "_blank");
    if (!target) { onNotice("Allow this site's print window, or export the brief as text."); return; }
    target.opener = null;
    target.document.open(); target.document.write(briefPrintHtml(brief, imported, stale)); target.document.close();
    target.focus(); target.print();
  }
  return <section aria-label="Included-source evidence brief" className="mt-5 min-w-0 rounded-2xl border border-[var(--border-strong)] bg-[var(--surface)] p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h3 className="flex items-center gap-2 text-sm font-medium"><FileText size={16} className="text-[var(--emerald)]" /> Evidence brief</h3><p className="mt-2 max-w-lg text-xs leading-6 text-[var(--text-dim)]">Turn included records into a passage-by-passage comparison and an editable researcher interpretation.</p></div>
      <button type="button" disabled={disabled || included.length < 1 || included.length > 6 || briefs.length >= 2} onClick={async () => { await onBuild(); setSelected(""); }} className="flex min-h-10 items-center gap-2 rounded-xl border border-[var(--border-strong)] bg-[var(--said)] px-4 text-xs font-medium text-[var(--emerald)] disabled:opacity-40">{generating ? <LoaderCircle size={14} className="animate-spin motion-reduce:animate-none" /> : <FileText size={14} />}{generating ? "Building brief…" : briefs.length ? "Build new version" : "Build evidence brief"}</button>
    </div>
    <p className="mt-3 text-[11px] leading-6 text-[var(--text-dim)]">{included.length} included · Select 1–6 records in Review sources above. IDs are fetched again from the original public databases. Only the question and retrieved public evidence go to the model; your notes are kept out.</p>
    {briefs.length >= 2 && <p className="mt-2 text-xs leading-6">Two versions saved. Export and remove an older version before building another.</p>}
    {generating && <p role="status" className="mt-3 text-xs leading-6 text-[var(--emerald)]">Retrieving originals, extracting passages and checking source context. Stop research cancels this run; saved versions remain.</p>}
    {brief && <div className="mt-5 space-y-5 border-t border-[var(--border)] pt-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><label className="text-xs">Saved version<select aria-label="Evidence brief version" value={brief.id} onChange={(e) => setSelected(e.target.value)} className="ml-2 max-w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] p-2 text-xs">{briefs.map((b, i) => <option key={b.id} value={b.id}>Version {i + 1} · {new Date(b.createdAt).toLocaleDateString()}</option>)}</select></label><button type="button" disabled={disabled} onClick={() => onDelete(brief.id)} className="flex min-h-9 items-center gap-1.5 text-[11px] text-[var(--text-dim)] disabled:opacity-40"><Trash2 size={12} />Remove this version</button></div>
      {stale && <p role="status" className="rounded-xl border border-[var(--border-strong)] p-3 text-xs leading-6">Your included sources have changed. This version keeps its original selection; build a new version to use the current decisions.</p>}
      {imported && <p className="text-xs leading-6">Imported backup: its sources and model checks have not been revalidated.</p>}
      {brief.missingIds.length > 0 && <p role="status" className="text-xs leading-6">Partial retrieval: {brief.missingIds.join(", ")} could not be retrieved. They are absent from this comparison.</p>}
      <BriefTitleEditor key={brief.id} brief={brief} disabled={disabled} onEdit={onEdit} />
      <div><h4 className="text-xs font-medium">Source comparison</h4><p className="mt-2 text-[11px] leading-6 text-[var(--text-dim)]">Available abstracts and registry metadata only. Quoted cells passed exact-text and model field checks. These checks do not establish study quality. No passage selected means the extractor supplied none, not that the full paper omits it.</p></div>
      <div className="space-y-4">{brief.rows.map((row, index) => { const source = brief.sources.find((s) => s.id === row.sourceId)!; return <article key={row.sourceId} className="min-w-0 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4"><button type="button" onClick={() => onInspect(source)} className="break-words text-left text-xs font-medium leading-6 text-[var(--emerald)]">[{index + 1}] {source.title} ↗</button><p className="mt-1 break-words text-[10px] leading-5 text-[var(--text-dim)]">{source.id} · {source.kind === "trial" ? "Registry description; not efficacy results" : "Available abstract / metadata"}</p><dl className="mt-4 grid gap-3 sm:grid-cols-2">{BRIEF_FIELDS.map((field) => { const cell = row.cells[field]; return <div key={field} className="min-w-0"><dt className="text-[10px] font-medium uppercase tracking-wide text-[var(--text-dim)]">{BRIEF_LABELS[field]}</dt><dd className="mt-1 break-words text-xs leading-6">{cell.status === "quoted" ? <button type="button" onClick={() => onInspect(source, cell.quote)} className="text-left hover:text-[var(--emerald)]">“{cell.quote}” <span className="text-[var(--emerald)]">↗</span></button> : <span className="text-[var(--text-dim)]">{briefCellText(cell)}</span>}</dd></div>; })}</dl></article>; })}</div>
      <div className="space-y-3"><h4 className="text-xs font-medium">Model source-checked findings</h4>{brief.answer ? <>{brief.answer.findings.map((f, i) => <div key={i} className="text-xs leading-7"><p>{f.text}</p><div className="mt-2 flex flex-wrap gap-2">{f.excerpts.map((e, j) => <button type="button" key={j} onClick={() => onInspect(brief.sources.find((s) => s.id === e.sourceId)!, e.quote)} className="rounded-md border border-[var(--border)] px-2 text-[10px] text-[var(--emerald)]">{e.sourceId} ↗</button>)}</div></div>)}<ul className="list-disc space-y-1 pl-4 text-[11px] leading-6 text-[var(--text-dim)]">{brief.answer.limitations.map((l, i) => <li key={i}>{l}</li>)}</ul></> : <p className="text-xs leading-6 text-[var(--text-dim)]">No source-checked narrative was returned. Review the original records and available passages before drawing conclusions.</p>}</div>
      <label className="block text-xs text-[var(--text-dim)]">Your interpretation · editable, not AI verified<textarea aria-label="Researcher interpretation" disabled={disabled} value={brief.notes} maxLength={6000} rows={5} onChange={(e) => onEdit(brief.id, { title: brief.title, notes: e.target.value, reviewedAt: null })} placeholder="Add your interpretation, disagreements, confounders and what to investigate next…" className="mt-2 w-full resize-y rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-3 text-sm leading-6 text-[var(--text)]" /></label>
      <label className="flex items-start gap-2 text-[11px] leading-6"><input type="checkbox" className="mt-1.5" checked={Boolean(brief.reviewedAt)} disabled={disabled} onChange={(e) => onEdit(brief.id, { title: brief.title, notes: brief.notes, reviewedAt: e.target.checked ? new Date().toISOString() : null })} />I have reviewed this version. This is a personal review mark; it does not validate a scientific conclusion.</label>
      <div className="flex flex-wrap gap-2">{[{ label: "Export brief TXT", content: () => briefText(brief, imported, stale), file: "nutritiscan-evidence-brief.txt", type: "text/plain;charset=utf-8" }, { label: "Export comparison CSV", content: () => briefCsv(brief), file: "nutritiscan-evidence-comparison.csv", type: "text/csv;charset=utf-8" }].map((item) => <button type="button" key={item.label} onClick={() => onDownload(item.content(), item.file, item.type)} className="min-h-9 rounded-lg border border-[var(--border)] px-3 text-[11px]">{item.label}</button>)}<button type="button" onClick={print} className="flex min-h-9 items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 text-[11px]"><Printer size={12} />Print / Save PDF</button></div>
      <p className="text-[10px] leading-6 text-[var(--text-dim)]">Created {new Date(brief.createdAt).toLocaleString()} · {brief.models.join(", ") || "No model extraction"}. Versions and edits are included in conversation backups and manual account snapshots. Retrying the original research question clears its decisions and briefs.</p>
      {brief.issues.length > 0 && <details className="text-[11px] leading-6 text-[var(--text-dim)]"><summary className="cursor-pointer">Run limitations ({brief.issues.length})</summary><p className="mt-2">{brief.issues.join(" · ")}</p></details>}
    </div>}
  </section>;
}

function BriefTitleEditor({ brief, disabled, onEdit }: { brief: EvidenceBrief; disabled: boolean; onEdit: (id: string, patch: Pick<EvidenceBrief, "title" | "notes" | "reviewedAt">) => void }) {
  const [value, setValue] = useState(brief.title);
  return <label className="block text-xs text-[var(--text-dim)]">Brief title<input aria-label="Evidence brief title" disabled={disabled} value={value} maxLength={160} onChange={(e) => {
    const title = e.target.value; setValue(title);
    if (title.trim()) onEdit(brief.id, { title, notes: brief.notes, reviewedAt: null });
  }} className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-sm text-[var(--text)]" />{!value.trim() && <span className="mt-2 block text-[11px]">Enter a title to save the change. The previous title is retained.</span>}</label>;
}
