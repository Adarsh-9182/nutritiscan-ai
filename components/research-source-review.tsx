import { useState } from "react";
import { Check, CircleHelp, Download, RotateCcw, X } from "lucide-react";
import type { AgentSource } from "@/lib/agent-runtime/contracts";
import type { ResearchReply } from "@/lib/research/contracts";
import { REVIEW_LABELS, sourceReviewCounts, type SourceReview } from "@/lib/research/source-review";

const CHOICES = [{ decision: "include", icon: Check }, { decision: "exclude", icon: X }, { decision: "needs-review", icon: CircleHelp }] as const;
type Filter = "all" | "unreviewed" | SourceReview["decision"];

export function ResearchSourceReview({ reply, reviews = [], disabled, onReview, onInspect, onExport, onExportReferences }: {
  reply: ResearchReply; reviews?: SourceReview[]; disabled: boolean;
  onReview: (sourceId: string, value: { decision: SourceReview["decision"]; note: string } | null) => void;
  onInspect: (source: AgentSource) => void; onExport: () => void; onExportReferences: () => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  if (!reply.sources.length) return null;
  const counts = sourceReviewCounts(reply, reviews);
  const visible = reply.sources.filter((s) => filter === "all" || (reviews.find((r) => r.sourceId === s.id)?.decision ?? "unreviewed") === filter);
  return <details className="rounded-2xl border border-[var(--border-strong)] bg-[var(--surface)] p-4">
    <summary className="cursor-pointer text-xs font-medium">Review sources <span className="font-normal text-[var(--text-dim)]">· {reply.sources.length - counts.unreviewed}/{reply.sources.length} marked</span></summary>
    <div className="mt-4 space-y-4" role="region" aria-label="Researcher source review">
      <p className="text-xs leading-6 text-[var(--text-muted)]">Which records belong in this investigation? Mark relevance to this question and leave a reason for your future self.</p>
      <div className="flex flex-wrap gap-2 text-[11px]" aria-label="Source review counts">
        {([...Object.keys(REVIEW_LABELS), "unreviewed"] as Exclude<Filter, "all">[]).map((key) => <span key={key} className="rounded-full border border-[var(--border)] px-2.5 py-1.5">{key === "unreviewed" ? "Unreviewed" : REVIEW_LABELS[key]} · {counts[key]}</span>)}
      </div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="text-[11px] text-[var(--text-dim)]">Show records<select aria-label="Filter source decisions" value={filter} onChange={(e) => setFilter(e.target.value as Filter)} className="ml-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 py-2 text-xs text-[var(--text)]"><option value="all">All ({reply.sources.length})</option><option value="unreviewed">Unreviewed ({counts.unreviewed})</option>{Object.entries(REVIEW_LABELS).map(([key, label]) => <option key={key} value={key}>{label} ({counts[key as SourceReview["decision"]]})</option>)}</select></label>
        <button type="button" onClick={onExport} className="flex min-h-9 items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 text-[11px] text-[var(--emerald)]"><Download size={13} />Export all sources · CSV</button>
        <button type="button" disabled={!counts.include} onClick={onExportReferences} className="flex min-h-9 items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 text-[11px] text-[var(--emerald)] disabled:opacity-40"><Download size={13} />Export included · RIS</button>
      </div>
      <div className="space-y-3">{visible.map((source) => <SourceReviewRow key={source.id} source={source} review={reviews.find((r) => r.sourceId === source.id)} disabled={disabled} onReview={(value) => onReview(source.id, value)} onInspect={() => onInspect(source)} />)}{!visible.length && <p className="rounded-xl border border-dashed border-[var(--border)] px-4 py-6 text-center text-xs text-[var(--text-dim)]">No records with this decision. Choose another filter to continue.</p>}</div>
      <p className="text-[11px] leading-6 text-[var(--text-dim)]">RIS exports included records for reference managers such as Zotero, using available metadata only. Saved in this browser with this question. A fresh retry clears these decisions. Your marks do not change the AI draft, grade study quality or validate a result. Review notes are not sent to the AI. Account snapshots include saved notes only when you choose to save them.</p>
    </div>
  </details>;
}

function SourceReviewRow({ source, review, disabled, onReview, onInspect }: {
  source: AgentSource; review?: SourceReview; disabled: boolean;
  onReview: (value: { decision: SourceReview["decision"]; note: string } | null) => void; onInspect: () => void;
}) {
  const [note, setNote] = useState(review?.note ?? "");
  return <article aria-label={`Source decision: ${source.title}`} className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4">
    <p className="mb-2 text-[10px] text-[var(--text-dim)]">{source.kind === "trial" ? "ClinicalTrials.gov" : "PubMed"} · {source.metadata?.year ?? "Year not reported"} · {source.id}</p>
    <button type="button" onClick={onInspect} className="text-left text-xs font-medium leading-6 text-[var(--emerald)]">{source.title} ↗</button>
    <div role="group" aria-label="Relevance decision" className="mt-3 flex flex-wrap gap-2">{CHOICES.map(({ decision, icon: Icon }) => <button key={decision} type="button" disabled={disabled} aria-pressed={review?.decision === decision} onClick={() => onReview({ decision, note: note.trim() })} className={`flex min-h-9 items-center gap-1.5 rounded-lg border px-3 text-[11px] disabled:opacity-40 ${review?.decision === decision ? "border-[var(--emerald)] bg-[var(--said)] text-[var(--emerald)]" : "border-[var(--border)] text-[var(--text-muted)]"}`}><Icon size={12} />{REVIEW_LABELS[decision]}</button>)}</div>
    {review ? <div className="mt-3 space-y-2">
      <label className="block text-[11px] text-[var(--text-dim)]">Reason / note · optional<textarea aria-label={`Review note: ${source.title}`} maxLength={1000} rows={2} disabled={disabled} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why is this relevant, excluded or still uncertain?" className="mt-2 block w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm leading-6 text-[var(--text)]" /></label>
      <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-[10px] text-[var(--text-dim)]">{note.length}/1000 · {note.trim() === review.note ? "Saved on this device" : "Unsaved note"}</span><div className="flex gap-3"><button type="button" disabled={disabled} onClick={() => { setNote(""); onReview(null); }} className="flex min-h-8 items-center gap-1 text-[11px] text-[var(--text-dim)]"><RotateCcw size={11} />Reset</button><button type="button" disabled={disabled || note.trim() === review.note} onClick={() => onReview({ decision: review.decision, note: note.trim() })} className="min-h-8 rounded-lg border border-[var(--border)] px-3 text-[11px] text-[var(--emerald)] disabled:opacity-40">Save note</button></div></div>
    </div> : <p className="mt-3 text-[10px] text-[var(--text-dim)]">Unreviewed · no researcher decision yet</p>}
  </article>;
}
