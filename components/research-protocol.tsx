"use client";

import { useId, useState } from "react";
import { Check, ClipboardList, Download, Printer, RefreshCw } from "lucide-react";
import type { ResearchTurn } from "@/lib/research/client";
import { PROTOCOL_SECTIONS, protocolGaps, protocolPrintHtml, protocolSelectionChanged, protocolText, type StudyProtocol } from "@/lib/research/protocol";
import { BIOLOGY_FIELDS, serializeStudyTransfer, studyTransfer } from "@/shared/study-plan";

type Props = {
  turn: ResearchTurn; disabled: boolean; imported: boolean;
  onCreate: () => void; onEdit: (patch: Partial<Pick<StudyProtocol, "title" | "fields" | "sourceIds" | "reviewedAt">>) => void;
  onDownload: (content: string, filename: string, type: string) => void; onNotice: (notice: string) => void;
};
const groups = [...new Set(PROTOCOL_SECTIONS.map((section) => section.group))];
const fieldClass = "mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-3 text-sm leading-6 text-[var(--text)] placeholder:text-[var(--text-dim)] disabled:opacity-50";

export function ResearchProtocol({ turn, disabled, imported, onCreate, onEdit, onDownload, onNotice }: Props) {
  const [expanded, setExpanded] = useState(Boolean(turn.protocol));
  const [preview, setPreview] = useState(false);
  const prefix = useId();
  const reply = turn.reply;
  if (!reply) return null;
  const included = reply.sources.filter((source) => turn.sourceReviews?.some((review) => review.sourceId === source.id && review.decision === "include")).map((source) => source.id);
  const protocol = turn.protocol;
  const gaps = protocol ? protocolGaps(protocol) : [];
  const stale = protocol ? protocolSelectionChanged(protocol, included) : false;
  const reviewed = Boolean(protocol?.reviewedAt && !stale && !imported && !gaps.length);
  const proposedMethods = reply.answer?.plan.length ? `UNVALIDATED MODEL PROPOSAL — investigator adaptation required\n\n${reply.answer.plan.map((step, index) => `${index + 1}. ${step}`).join("\n")}` : "";
  function print() {
    if (!protocol || !reply) return;
    const target = window.open("", "_blank");
    if (!target) { onNotice("The print window was blocked. Export protocol TXT instead."); return; }
    target.opener = null;
    target.document.write(protocolPrintHtml(protocol, reply, included, imported));
    target.document.close(); target.focus(); target.print();
  }
  function exportForMac() {
    if (!protocol || !reply) return;
    try { onDownload(serializeStudyTransfer(studyTransfer(protocol, reply.sources, reply.retrievedAt, "web", reply.sourceTimestampKind ?? "retrieved")), "nutritiscan-study-plan.json", "application/json;charset=utf-8"); }
    catch (e) { onNotice(e instanceof Error ? e.message : "This draft could not be exported."); }
  }
  return <section aria-label="Study protocol workspace" className="mt-6 overflow-hidden rounded-2xl border border-[var(--border-strong)] bg-[var(--surface)]">
    <div className="flex flex-wrap items-start justify-between gap-3 p-4 sm:p-5">
      <div className="flex min-w-0 items-start gap-3"><span className="mt-0.5 rounded-lg bg-[var(--said)] p-2 text-[var(--emerald)]"><ClipboardList size={18} /></span><div><p className="text-[10px] uppercase tracking-widest text-[var(--text-dim)]">FROM EVIDENCE TO A STUDY</p><h3 className="mt-1 text-sm font-medium">Your working protocol</h3><p className="mt-2 max-w-md text-xs leading-6 text-[var(--text-muted)]">Organize your question, methods and review requirements alongside the sources you selected. You write the proposed study; unknown details stay blank.</p></div></div>
      {protocol ? <button type="button" disabled={disabled} aria-expanded={expanded} onClick={() => setExpanded(!expanded)} className="min-h-10 rounded-xl border border-[var(--border)] px-3 text-xs disabled:opacity-40">{expanded ? "Collapse protocol" : "Open protocol"}</button> : <button type="button" disabled={disabled || !included.length} onClick={() => { onCreate(); setExpanded(true); }} className="min-h-10 rounded-xl bg-[var(--emerald)] px-4 text-xs font-medium text-[var(--research-on-accent)] disabled:opacity-40">Create protocol draft</button>}
      {!protocol && <p className="w-full text-[11px] leading-6 text-[var(--text-dim)]">{included.length ? `${included.length} included source${included.length === 1 ? "" : "s"} will form the bibliography. No AI call is needed to create or edit this draft.` : "Mark at least one source Include in Review sources above to start your protocol."}</p>}
    </div>
    {protocol && expanded && <div className="space-y-5 border-t border-[var(--border)] p-4 sm:p-5">
      <div className="flex flex-wrap gap-2 text-[10px]"><span className="rounded-full border border-[var(--border)] px-3 py-1.5">{reviewed ? "Personally reviewed" : "Draft · review required"}</span><span className="rounded-full border border-[var(--border)] px-3 py-1.5">{PROTOCOL_SECTIONS.length - gaps.length}/{PROTOCOL_SECTIONS.length} sections filled</span><span className="rounded-full border border-[var(--border)] px-3 py-1.5">{protocol.sourceIds.length} bibliography sources</span></div>
      <p className="text-[11px] leading-6 text-[var(--text-dim)]">Working draft for investigator and supervisor review. This is not institutional approval or a registered protocol. Use public or appropriately de-identified research information.</p>
      {imported && <p className="rounded-xl border border-[var(--border-strong)] p-3 text-xs leading-6">Imported draft: source content, authorship and previous review marks have not been revalidated. Export is labelled accordingly.</p>}
      {stale && <div role="status" className="rounded-xl border border-[var(--border-strong)] p-3 text-xs leading-6"><p>Your Include decisions changed. The draft keeps its original bibliography until you explicitly update it. Review is required again.</p><button type="button" disabled={disabled || !included.length} onClick={() => onEdit({ sourceIds: included, reviewedAt: null })} className="mt-2 flex min-h-9 items-center gap-2 text-[var(--emerald)] disabled:opacity-40"><RefreshCw size={13} />Use current included sources</button></div>}
      <ProtocolTitle key={protocol.id} protocol={protocol} disabled={disabled} onEdit={onEdit} />
      {protocol.biologyContext && <details className="rounded-xl border border-[var(--border)] p-4"><summary className="cursor-pointer text-xs font-medium">Biology context snapshot</summary><p className="mt-3 text-[11px] leading-6 text-[var(--text-dim)]">Researcher-supplied scope from the original draft, not independently validated. Project context may have changed since this snapshot.</p><dl className="mt-3 space-y-3 text-xs leading-6">{BIOLOGY_FIELDS.map(({ id, label }) => <div key={id}><dt className="font-medium">{label}</dt><dd className="whitespace-pre-wrap break-words text-[var(--text-muted)]">{protocol.biologyContext![id] || "Not specified"}</dd></div>)}</dl></details>}
      {Boolean(proposedMethods) && <details className="rounded-xl border border-[var(--border)] p-4"><summary className="cursor-pointer text-xs font-medium">Bring in the research response’s proposed steps</summary><p className="mt-3 text-[11px] leading-6 text-[var(--text-dim)]">These are unvalidated model suggestions, not an approved methodology. Review them before adapting. Existing methods are preserved.</p><ol className="my-3 list-decimal space-y-2 pl-5 text-xs leading-6">{reply.answer!.plan.map((step, index) => <li key={index}>{step}</li>)}</ol>{proposedMethods.length > 2000 && <p className="mb-3 text-[11px] leading-6 text-[var(--text-dim)]">The proposal exceeds the methods field’s 2,000-character limit. Write an adapted version below; no steps will be silently dropped.</p>}<button type="button" disabled={disabled || Boolean(protocol.fields.methods.trim()) || proposedMethods.length > 2000} onClick={() => onEdit({ fields: { ...protocol.fields, methods: proposedMethods }, reviewedAt: null })} className="min-h-9 text-xs text-[var(--emerald)] disabled:opacity-40">Use proposed steps as a starting point</button></details>}
      <div role="group" aria-label="Protocol view" className="flex gap-2">{[{ id: false, label: "Edit draft" }, { id: true, label: "Preview protocol" }].map((item) => <button key={item.label} type="button" aria-pressed={preview === item.id} onClick={() => setPreview(item.id)} className={`min-h-10 rounded-xl border border-[var(--border)] px-4 text-xs ${preview === item.id ? "bg-[var(--said)] text-[var(--emerald)]" : "text-[var(--text-dim)]"}`}>{item.label}</button>)}</div>
      {preview ? <div aria-label="Protocol preview" role="region" className="max-h-[60svh] overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4"><pre className="whitespace-pre-wrap break-words font-sans text-xs leading-7">{protocolText(protocol, reply, included, imported)}</pre></div> : groups.map((group, index) => <details key={group} open className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4"><summary className="cursor-pointer text-sm font-medium"><span className="mr-2 text-[var(--emerald)]">0{index + 1}</span>{group}</summary><div className="mt-5 space-y-5">{PROTOCOL_SECTIONS.filter((section) => section.group === group).map((section) => <label key={section.id} className="block text-xs font-medium" htmlFor={`${prefix}-${section.id}`}>{section.label}<textarea id={`${prefix}-${section.id}`} aria-label={section.label} aria-describedby={`${prefix}-${section.id}-help`} value={protocol.fields[section.id]} disabled={disabled} maxLength={2000} rows={section.id === "question" ? 2 : 3} onChange={(event) => onEdit({ fields: { ...protocol.fields, [section.id]: event.target.value }, reviewedAt: null })} className={fieldClass} /><span id={`${prefix}-${section.id}-help`} className="mt-1 block text-[11px] font-normal leading-6 text-[var(--text-dim)]">{section.help}</span></label>)}</div></details>)}
      <details className="rounded-xl border border-[var(--border)] p-4"><summary className="cursor-pointer text-xs font-medium">Selected bibliography · {protocol.sourceIds.length}</summary><p className="mt-3 text-[11px] leading-6 text-[var(--text-dim)]">These sources informed your planning. Inclusion does not verify the proposed methods or establish a complete literature review.</p><ol className="mt-3 space-y-3">{protocol.sourceIds.map((id) => { const source = reply.sources.find((item) => item.id === id); return <li key={id} className="text-xs leading-6">{source && <a href={source.url} target="_blank" rel="noopener noreferrer" className="text-[var(--emerald)]">{source.title} ↗</a>}<span className="block text-[10px] text-[var(--text-dim)]">{id}</span></li>; })}</ol></details>
      {gaps.length > 0 && <p className="text-[11px] leading-6 text-[var(--text-dim)]">Still to specify: {gaps.map((section) => section.label).join(" · ")}. You can export an incomplete draft; missing sections remain labelled.</p>}
      <label className="flex items-start gap-2 text-[11px] leading-6"><input type="checkbox" checked={reviewed} disabled={disabled || Boolean(gaps.length) || stale || imported} onChange={(event) => onEdit({ reviewedAt: event.target.checked ? new Date().toISOString() : null })} className="mt-1.5" />I personally reviewed this working draft. This does not record supervisor sign-off or ethics approval.</label>
      <div className="flex flex-wrap gap-2"><button type="button" onClick={() => onDownload(protocolText(protocol, reply, included, imported), "nutritiscan-study-protocol.txt", "text/plain;charset=utf-8")} className="flex min-h-10 items-center gap-2 rounded-xl border border-[var(--border)] px-3 text-xs"><Download size={13} />Export protocol TXT</button><button type="button" onClick={print} className="flex min-h-10 items-center gap-2 rounded-xl border border-[var(--border)] px-3 text-xs"><Printer size={13} />Print protocol / Save PDF</button></div>
      <div className="space-y-2"><button type="button" disabled={disabled} onClick={exportForMac} className="flex min-h-10 items-center gap-2 rounded-xl border border-[var(--border)] px-3 text-xs disabled:opacity-40"><Download size={13} />Export draft for Mac</button><p className="text-[10px] leading-6 text-[var(--text-dim)]">Open the JSON in the Mac app’s Study tab to continue editing. It includes this draft and its bibliography, with source snapshots. No other conversations are included. Imports require fresh review.</p></div>
      <p className="flex items-start gap-2 text-[10px] leading-6 text-[var(--text-dim)]"><Check size={12} className="mt-1 shrink-0" />Draft edits use the conversation’s device storage and are included in backups and explicit account snapshots. A storage error appears below; export before closing if saving fails.</p>
    </div>}
  </section>;
}

function ProtocolTitle({ protocol, disabled, onEdit }: Pick<Props, "disabled" | "onEdit"> & { protocol: StudyProtocol }) {
  const [value, setValue] = useState(protocol.title);
  return <label className="block text-xs font-medium">Protocol title<input value={value} maxLength={160} disabled={disabled} className={fieldClass} onChange={(event) => { const title = event.target.value; setValue(title); if (title.trim()) onEdit({ title, reviewedAt: null }); }} />{!value.trim() && <span className="mt-2 block text-[11px] text-[var(--text-dim)]">Enter a title to save this change. The previous title is retained.</span>}</label>;
}
