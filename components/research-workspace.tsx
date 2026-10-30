"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { ArrowUp, BookOpen, ChevronRight, Copy, Download, FlaskConical, History, Lightbulb, LoaderCircle, PanelLeft, Plus, Search, SlidersHorizontal, Square, Trash2, X } from "lucide-react";
import type { AgentSource } from "@/lib/agent-runtime/contracts";
import type { ResearchReply, ResearchRequest } from "@/lib/research/contracts";
import { consumeResearch, readResearch, replyText, researchExport, researchTimestamp, saveResearch, type ResearchThread, type ResearchTurn } from "@/lib/research/client";
import { ResearchEvidence } from "./research-evidence";

const MODES = [{ id: "evidence", label: "Evidence review", icon: BookOpen }, { id: "hypotheses", label: "Develop hypotheses", icon: Lightbulb }, { id: "study-plan", label: "Plan a study", icon: FlaskConical }] as const;
const EXAMPLES = [
  { title: "Investigate disease biology", text: "What human evidence links insulin resistance with cellular senescence?", mode: "evidence" },
  { title: "Develop a testable hypothesis", text: "Develop testable hypotheses about metabolic dysfunction and age-related inflammation.", mode: "hypotheses" },
  { title: "Plan reproducible research", text: "Plan an independent replication study of DNA methylation aging biomarkers.", mode: "study-plan" },
] as const;
const messageOf = (e: unknown) => e instanceof Error ? e.message : "Research could not be completed. Please retry.";
const subscribeHydration = () => () => {};
function initialResearch() {
  const empty = { threads: [] as ResearchThread[], activeId: null as string | null, notice: "" };
  if (typeof window === "undefined") return empty;
  try { return { ...readResearch(), notice: "" }; }
  catch { return { ...empty, notice: "Saved research could not be loaded. New work can continue in this tab." }; }
}

export default function ResearchWorkspace() {
  const [initial] = useState(initialResearch);
  const [threads, setThreads] = useState<ResearchThread[]>(initial.threads);
  const [activeId, setActiveId] = useState<string | null>(initial.activeId);
  const hydrated = useSyncExternalStore(subscribeHydration, () => true, () => false);
  const [rail, setRail] = useState(false);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<ResearchRequest["mode"]>("evidence");
  const [query, setQuery] = useState(() => { const t = initial.threads.find((t) => t.id === initial.activeId); return t?.turns.at(-1)?.request.searchMode === "manual" ? t.query : ""; });
  const [enabled, setEnabled] = useState<ResearchRequest["sources"]>(["pubmed", "trials"]);
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<string[]>([]);
  const [notice, setNotice] = useState(initial.notice);
  const [provider, setProvider] = useState<boolean | null>(null);
  const [inspected, setInspected] = useState<{ source: AgentSource; quote?: string } | null>(null);
  const controller = useRef<AbortController | null>(null);
  const locked = useRef(false);
  const snapshot = useRef<ResearchThread[]>(initial.threads);
  const end = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const thread = threads.find((t) => t.id === activeId);

  useEffect(() => {
    const abort = new AbortController();
    fetch("/api/research/chat", { cache: "no-store", signal: abort.signal }).then(async (r) => {
      if (r.ok) { const s = await r.json(); if (!abort.signal.aborted) setProvider(s.configured === true); }
    }).catch(() => {});
    return () => { abort.abort(); controller.current?.abort(); };
  }, []);
  useEffect(() => { end.current?.scrollIntoView?.({ block: "end", behavior: "auto" }); }, [activeId, thread?.turns.length, busy]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setRail(false); setInspected(null); } };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, []);

  function persist(next: ResearchThread[], selected: string | null) {
    snapshot.current = next; setThreads(next);
    try { saveResearch(next, selected); }
    catch { setNotice("Your work is open in this tab but could not be saved on this device. Export it or delete an older research conversation before closing."); }
  }
  function update(id: string, change: (value: ResearchThread) => ResearchThread) { persist(snapshot.current.map((t) => t.id === id ? change(t) : t), id); }
  function open(t: ResearchThread) { if (locked.current) return; setActiveId(t.id); setQuery(t.turns.at(-1)?.request.searchMode === "manual" ? t.query : ""); setInput(""); setInspected(null); setRail(false); setSteps([]); persist(snapshot.current, t.id); }
  function newConversation() {
    if (locked.current) return;
    setActiveId(null); setQuery(""); setInput(""); setInspected(null); setRail(false); setSteps([]); persist(snapshot.current, null); composer.current?.focus();
  }
  async function send(text: string, retry?: ResearchTurn) {
    if (locked.current || text.trim().length < 3) return;
    if (!retry && !enabled.length) { setNotice("Choose at least one public source in Research settings."); return; }
    let current = snapshot.current.find((t) => t.id === activeId);
    if (retry && current?.turns.at(-1)?.id !== retry.id) return;
    if (!current && snapshot.current.length >= 8) { setNotice("You have eight saved research conversations. Export and delete an older one before starting another."); return; }
    if (current && !retry && current.turns.length >= 12) { setNotice("This conversation has reached twelve questions. Start a new research conversation to keep context focused."); return; }
    locked.current = true; setBusy(true); setNotice(""); setSteps([]); setInput(""); setInspected(null);
    const abort = new AbortController(); controller.current = abort;
    const requestedAt = researchTimestamp();
    if (!current) current = { id: crypto.randomUUID(), title: text.slice(0, 160), query: query.trim(), updatedAt: requestedAt, turns: [] };
    const id = current.id;
    const request = retry?.request ?? { message: text.trim(), query: query.trim(), searchMode: query.trim() ? "manual" as const : "auto" as const, mode, sources: enabled };
    const turn: ResearchTurn = { id: retry?.id ?? crypto.randomUUID(), request, phase: "working", reply: null };
    const previous = retry ? current.turns.slice(0, -1) : current.turns;
    const history: ResearchRequest["history"] = previous.flatMap((t) => [
      { role: "user" as const, content: t.request.message },
      ...(t.reply ? [{ role: "assistant" as const, content: replyText(t.reply).slice(0, 4000) }] : []),
    ]).slice(-8);
    current = { ...current, query: request.query, updatedAt: requestedAt, turns: retry ? [...previous, turn] : [...current.turns, turn] };
    setActiveId(id); setQuery(request.query);
    persist(snapshot.current.some((t) => t.id === id) ? snapshot.current.map((t) => t.id === id ? current! : t) : [current, ...snapshot.current], id);
    const finish = (patch: Partial<ResearchTurn>) => { const finishedAt = researchTimestamp(); update(id, (t) => ({ ...t, updatedAt: finishedAt, turns: t.turns.map((v) => v.id === turn.id ? { ...v, ...patch } : v) })); };
    let result: ResearchReply | null = null;
    try {
      const response = await fetch("/api/research/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...request, history }), signal: abort.signal });
      await consumeResearch(response, (event) => {
        if (event.type === "step") setSteps((s) => [...s, event.text]);
        if (event.type === "error") throw new Error(event.error);
        if (event.type === "result") result = event.result;
      });
      abort.signal.throwIfAborted();
      if (!result) throw new Error("The research run ended without a result.");
      finish({ phase: "done", reply: result, error: undefined });
    } catch (e) { finish({ phase: abort.signal.aborted ? "stopped" : "failed", error: abort.signal.aborted ? "Research stopped. Retry to perform a fresh search." : messageOf(e), reply: null }); }
    finally { locked.current = false; setBusy(false); controller.current = null; }
  }
  function submit(e: FormEvent) { e.preventDefault(); void send(input); }
  function remove(id: string) { if (locked.current) return; const next = snapshot.current.filter((t) => t.id !== id); const selected = activeId === id ? null : activeId; persist(next, selected); if (!selected) { setActiveId(null); setQuery(""); setInspected(null); } }
  async function copy(request: ResearchTurn["request"], reply: ResearchReply) { try { await navigator.clipboard.writeText(researchExport(request, reply)); setNotice("Research draft copied with sources and limitations."); } catch { setNotice("Copy is unavailable in this browser. Use Export research instead."); } }
  function download(request: ResearchTurn["request"], reply: ResearchReply) {
    try {
      const url = URL.createObjectURL(new Blob([researchExport(request, reply)], { type: "text/plain;charset=utf-8" }));
      const a = document.createElement("a"); a.href = url; a.download = "nutritiscan-research.txt"; a.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice("Research export prepared; browser download requested.");
    } catch { setNotice("The browser could not prepare the research export."); }
  }

  if (!hydrated) return <div className="grid h-[100svh] place-items-center text-sm text-[var(--text-dim)]">Loading research conversations…</div>;
  return <div className="flex h-[100svh] flex-col overflow-hidden">
    <header className="flex shrink-0 items-center gap-2 border-b border-[var(--border)] px-3 py-2.5 sm:gap-3">
      <button type="button" className="btn-ghost grid h-9 w-9 shrink-0 place-items-center rounded-lg" aria-label="Show or hide research conversations" aria-expanded={rail} onClick={() => setRail(!rail)}><PanelLeft size={17} /></button>
      <Link href="/" className="flex min-w-0 items-center gap-2 rounded-lg focus-ring"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[linear-gradient(135deg,var(--emerald),var(--cyan))] text-[#07130c]"><FlaskConical size={16} /></span><span className="text-[13px] font-semibold">NutritiScan <span className="hidden font-normal text-[var(--text-dim)] sm:inline">/ Research</span></span></Link>
      <span className="ml-auto hidden rounded-full border border-[var(--border)] px-2.5 py-1 text-[10px] text-[var(--text-muted)] md:inline">{provider === false ? "Sources ready · AI not configured" : provider ? "Gemini · free-tier eligible" : "Public research"}</span>
      <Link href="/chat" className="btn-ghost ml-auto rounded-full px-3 py-2 text-xs md:ml-0">Health chat</Link>
      <button type="button" aria-label="New research conversation" onClick={newConversation} disabled={busy} className="btn-ghost grid h-9 w-9 shrink-0 place-items-center rounded-lg disabled:opacity-40"><Plus size={18} /></button>
    </header>
    <div className="relative flex min-h-0 flex-1">
      {rail && <><button type="button" aria-label="Close research conversations" onClick={() => setRail(false)} className="absolute inset-0 z-20 bg-black/60 lg:hidden" /><aside aria-label="Research conversations" className="ns-float ns-float-solid absolute bottom-3 left-3 top-3 z-30 flex w-[264px] max-w-[calc(100vw-24px)] shrink-0 flex-col p-4 lg:relative lg:inset-auto lg:m-3">
        <div className="mb-4 flex items-center justify-between"><p className="t-label text-[var(--text-dim)]">RESEARCH CONVERSATIONS</p><button type="button" aria-label="Close conversation history" onClick={() => setRail(false)} className="btn-ghost rounded p-1"><X size={15} /></button></div>
        <button type="button" onClick={newConversation} disabled={busy} className="mb-5 flex items-center justify-center gap-2 rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2.5 text-xs font-medium disabled:opacity-40"><Plus size={14} /> New research</button>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">{threads.map((t) => <div key={t.id} className={`group flex items-center rounded-xl border ${t.id === activeId ? "border-[var(--border-strong)] bg-[var(--surface)]" : "border-transparent"}`}><button type="button" disabled={busy} onClick={() => open(t)} className="min-w-0 flex-1 px-3 py-3 text-left"><span className="block truncate text-xs">{t.title}</span><span className="mt-1 block text-[10px] text-[var(--text-dim)]">{t.turns.length} questions · on this device</span></button><button type="button" disabled={busy} onClick={() => remove(t.id)} aria-label={`Delete research conversation: ${t.title}`} className="btn-ghost mr-1 rounded-lg p-2"><Trash2 size={13} /></button></div>)}{!threads.length && <p className="text-xs leading-6 text-[var(--text-dim)]">Your research conversations appear here. Health chats are kept separately.</p>}</div>
        <p className="mt-4 border-t border-[var(--border)] pt-4 text-[11px] leading-5 text-[var(--text-dim)]">Saved on this device, up to eight conversations. Selected research history goes to the model on follow-up. Your health profile is not included.</p>
      </aside></>}
      <main className="flex min-w-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-8 sm:py-9">
            {!thread?.turns.length ? <section className="pb-6 pt-7 sm:pt-14">
              <div className="mb-6 grid h-14 w-14 place-items-center rounded-2xl border border-[var(--border-strong)] bg-[var(--surface)] text-[var(--emerald)]"><FlaskConical size={25} strokeWidth={1.5} /></div>
              <p className="t-label mb-3 text-[var(--emerald)]">YOUR HUMAN-BIOLOGY RESEARCH PARTNER</p>
              <h1 className="ns-hero-title max-w-lg text-3xl font-medium leading-tight tracking-tight sm:text-5xl">What should we<br /> investigate together?</h1>
              <p className="mt-5 max-w-lg text-sm leading-7 text-[var(--text-muted)]">Explore disease mechanisms, examine aging research, and develop testable hypotheses—with the evidence beside every finding.</p>
              <div className="mt-8 grid gap-3 sm:grid-cols-3">{EXAMPLES.map((ex) => <button key={ex.title} type="button" onClick={() => { setInput(ex.text); setMode(ex.mode); composer.current?.focus(); }} className="group rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-left transition-colors hover:border-[var(--border-strong)]"><span className="mb-3 flex items-start justify-between gap-2 text-xs font-medium">{ex.title}<ChevronRight size={14} className="shrink-0 text-[var(--emerald)]" /></span><span className="block text-xs leading-6 text-[var(--text-dim)]">{ex.text}</span></button>)}</div>
              <div className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-[11px] text-[var(--text-dim)]"><span className="flex items-center gap-1.5"><Search size={12} /> PubMed + ClinicalTrials.gov</span><span className="flex items-center gap-1.5"><History size={12} /> Research context stays together</span></div>
            </section> : <div className="space-y-9" aria-label="Research conversation">{thread.turns.map((turn, index) => <section key={turn.id} className="space-y-5">
              <div className="ml-8 rounded-2xl rounded-br-md border border-[var(--border)] bg-[var(--said)] px-5 py-4"><p className="mb-2 text-[10px] font-medium uppercase tracking-widest text-[var(--text-dim)]">You · {MODES.find((m) => m.id === turn.request.mode)?.label}</p><p className="whitespace-pre-wrap break-words text-sm leading-7">{turn.request.message}</p></div>
              <div><div className="mb-4 flex items-center gap-2.5 text-xs font-medium"><span className="grid h-7 w-7 place-items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--emerald)]"><FlaskConical size={14} /></span>NutritiScan Research<span className="ml-auto text-[10px] font-normal text-[var(--text-dim)]">{turn.reply?.model ?? (turn.phase === "working" ? "Researching" : "Public evidence")}</span></div>
                {turn.phase === "working" && <div role="status" className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4"><p className="flex items-center gap-2 text-xs text-[var(--emerald)]"><LoaderCircle size={14} className="animate-spin motion-reduce:animate-none" />{steps.at(-1) ?? "Preparing your research question…"}</p>{steps.length > 1 && <details className="mt-3 text-xs text-[var(--text-dim)]"><summary className="cursor-pointer">View tool activity</summary><ol className="mt-2 space-y-2">{steps.slice(0, -1).map((s, i) => <li key={i}>{s}</li>)}</ol></details>}</div>}
                {turn.error && <div role="alert" className="rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] p-4 text-sm leading-6"><p>{turn.error}</p>{index === thread.turns.length - 1 && <button type="button" disabled={busy} onClick={() => void send(turn.request.message, turn)} className="mt-3 text-xs font-medium text-[var(--emerald)]">Retry question</button>}</div>}
                {turn.reply && <ResearchAnswer reply={turn.reply} onInspect={(source, quote) => setInspected({ source, quote })} onCopy={() => void copy(turn.request, turn.reply!)} onExport={() => download(turn.request, turn.reply!)} />}
                {turn.reply?.status === "sources-only" && index === thread.turns.length - 1 && <button type="button" disabled={busy} onClick={() => void send(turn.request.message, turn)} className="mt-4 rounded-lg border border-[var(--border)] px-3 py-2 text-xs text-[var(--emerald)] disabled:opacity-40">Retry research</button>}
                {turn.reply && index === thread.turns.length - 1 && <div className="mt-5 flex flex-wrap gap-2">{[{ label: "Challenge the hypothesis", mode: "hypotheses" as const, text: "Challenge the current explanation. Propose competing hypotheses and what evidence would falsify them." }, { label: "Plan an independent test", mode: "study-plan" as const, text: "Plan an independent replication test for the findings above, including confounders, controls and appropriate endpoints." }].map((f) => <button key={f.label} disabled={busy} type="button" onClick={() => { setMode(f.mode); setInput(f.text); composer.current?.focus(); }} className="rounded-full border border-[var(--border)] px-3 py-2 text-[11px] text-[var(--text-muted)] hover:text-[var(--text)]">{f.label} →</button>)}</div>}
              </div>
            </section>)}</div>}
            <div ref={end} />
          </div>
        </div>
        <div className="mx-auto w-full max-w-3xl shrink-0 px-3 pb-[max(12px,env(safe-area-inset-bottom))] sm:px-7">
          {notice && <p role="status" className="mb-2 rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-xs leading-5">{notice}</p>}
          <form onSubmit={submit} className="rounded-2xl border border-[var(--border-strong)] bg-[var(--surface)] p-3 shadow-lg">
            <div className="mb-2 flex flex-wrap gap-1" aria-label="Research objective">{MODES.map(({ id, label, icon: Icon }) => <button type="button" key={id} disabled={busy} aria-pressed={mode === id} onClick={() => setMode(id)} className={`flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[11px] ${mode === id ? "bg-[var(--said)] text-[var(--emerald)]" : "text-[var(--text-dim)]"}`}><Icon size={12} />{label}</button>)}</div>
            <label htmlFor="research-message" className="sr-only">Research message</label><textarea ref={composer} id="research-message" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); if (!busy) void send(input); } }} disabled={busy} maxLength={2000} rows={2} placeholder={thread ? "Continue the investigation…" : "Ask a biology or disease-research question…"} className="max-h-36 min-h-16 w-full resize-y bg-transparent px-2 py-2 text-base leading-6 text-[var(--text)] outline-none placeholder:text-[var(--text-dim)]" />
            <div className="flex items-end justify-between gap-2 border-t border-[var(--border)] pt-2"><details className="min-w-0 flex-1"><summary className="flex cursor-pointer list-none items-center gap-1.5 px-2 py-1.5 text-[11px] text-[var(--text-dim)]"><SlidersHorizontal size={13} /> Research settings · {enabled.length} sources</summary><div className="space-y-3 px-2 pb-2 pt-3 text-xs"><label className="block">Public search terms · optional override<input aria-label="Public search terms" disabled={busy} value={query} onChange={(e) => setQuery(e.target.value)} maxLength={700} placeholder="Automatic: English concepts adapted to each question" className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-base" /></label><div className="flex flex-wrap gap-4">{(["pubmed", "trials"] as const).map((s) => <label key={s} className="flex items-center gap-2"><input type="checkbox" checked={enabled.includes(s)} disabled={busy} onChange={(e) => setEnabled((v) => e.target.checked ? [...v, s] : v.filter((x) => x !== s))} />{s === "pubmed" ? "PubMed" : "ClinicalTrials.gov"}</label>)}</div><p className="text-[11px] leading-5 text-[var(--text-dim)]">Leave the override empty for automatic English scientific searches that adapt to follow-ups. A custom override stays fixed until you clear it. Executed terms appear in Search activity and go to the enabled public sources. Research messages, selected conversation history and evidence go to Google when AI is configured. Free-tier content may be used for product improvement. Use public research data.</p></div></details>
              {busy ? <button type="button" aria-label="Stop research" onClick={() => controller.current?.abort()} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[var(--border-strong)]"><Square size={14} fill="currentColor" /></button> : <button type="submit" disabled={input.trim().length < 3 || !enabled.length} aria-label="Send research message" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--emerald)] text-[#07130c] disabled:opacity-30"><ArrowUp size={19} /></button>}
            </div>
          </form>
          <p className="px-2 pt-2 text-center text-[10px] leading-4 text-[var(--text-dim)]">Research assistance · Hypotheses and study plans are proposals · No experiments or code are executed</p>
        </div>
      </main>
      {inspected && <aside role="dialog" aria-label="Research source inspector" className="absolute inset-0 z-40 flex min-h-0 flex-col break-words border-l border-[var(--border)] bg-[var(--bg)] p-5 shadow-xl lg:static lg:w-80 lg:shrink-0"><div className="mb-5 flex items-center justify-between"><p className="t-label text-[var(--emerald)]">SOURCE INSPECTOR</p><button type="button" aria-label="Close source inspector" onClick={() => setInspected(null)} className="btn-ghost rounded-lg p-2"><X size={17} /></button></div><div className="min-h-0 flex-1 overflow-y-auto"><p className="mb-3 text-[10px] uppercase tracking-widest text-[var(--text-dim)]">{inspected.source.kind === "trial" ? "Registry record · not efficacy evidence" : "Metadata and available abstract"}</p><h2 className="text-base font-medium leading-7">{inspected.source.title}</h2>{inspected.quote && <blockquote className="mt-5 border-l-2 border-[var(--emerald)] pl-4 text-sm leading-7 text-[var(--text-muted)]">{inspected.quote}</blockquote>}<a href={inspected.source.url} target="_blank" rel="noreferrer" className="mt-4 inline-block text-xs text-[var(--emerald)]">Open original source ↗</a><p className="mt-6 whitespace-pre-wrap break-words text-xs leading-7 text-[var(--text-muted)]">{inspected.source.detail}</p><p className="mt-5 text-[10px] text-[var(--text-dim)]">Source ID: {inspected.source.id}</p></div></aside>}
    </div>
  </div>;
}

function ResearchAnswer({ reply, onInspect, onCopy, onExport }: { reply: ResearchReply; onInspect: (source: AgentSource, quote?: string) => void; onCopy: () => void; onExport: () => void }) {
  const answer = reply.answer;
  const citations = (ids: string[], excerpts?: { sourceId: string; quote: string }[]) => <div className="mt-2 flex flex-wrap gap-2">{ids.map((id) => { const index = reply.sources.findIndex((s) => s.id === id); const source = reply.sources[index]; return source ? <button key={id} type="button" onClick={() => onInspect(source, excerpts?.find((e) => e.sourceId === id)?.quote)} aria-label={`Inspect citation ${index + 1}: ${source.title}`} className="rounded-md border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--emerald)]">[{index + 1}] {source.kind === "trial" ? "Registry" : "PubMed"} ↗</button> : null; })}</div>;
  return <div className="space-y-5 break-words">
    <div className="flex flex-wrap items-center gap-2"><span className="rounded-full border border-[var(--border)] px-2 py-1 text-[10px] text-[var(--text-muted)]">{reply.status === "model-assisted" ? "Research draft" : "Source collection"}</span><span className="text-[10px] text-[var(--text-dim)]">{reply.sources.length} sources · {new Date(reply.retrievedAt).toLocaleDateString()}</span></div>
    {answer?.findings.length ? <section aria-label="Evidence findings" className="space-y-4">{answer.findings.map((finding, i) => <div key={i}><p className="whitespace-pre-wrap text-sm leading-7 text-[var(--text-muted)]">{finding.text}</p>{citations(finding.sourceIds, finding.excerpts)}</div>)}</section> : null}
    {answer?.hypotheses.length ? <section aria-label="Untested hypotheses" className="space-y-3"><h3 className="flex items-center gap-2 text-xs font-medium"><Lightbulb size={14} className="text-[var(--emerald)]" /> Untested hypotheses</h3>{answer.hypotheses.map((h, i) => <details key={i} open className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4"><summary className="cursor-pointer text-sm font-medium leading-6">{h.title}</summary><p className="mt-3 text-xs leading-6 text-[var(--text-muted)]">{h.rationale}</p><dl className="mt-4 space-y-3 text-xs leading-6">{[["Prediction", h.prediction], ["Competing explanation", h.alternative], ["What would falsify it?", h.falsification]].map(([label, text]) => <div key={label}><dt className="font-medium text-[var(--text)]">{label}</dt><dd className="text-[var(--text-muted)]">{text}</dd></div>)}</dl>{citations(h.sourceIds)}</details>)}</section> : null}
    {answer?.plan.length ? <section aria-label="Proposed study plan" className="rounded-xl border border-[var(--border)] p-4"><h3 className="mb-3 text-xs font-medium">Proposed study plan · not executed</h3><ol className="list-decimal space-y-3 pl-5 text-sm leading-7 text-[var(--text-muted)]">{answer.plan.map((step, i) => <li key={i}>{step}</li>)}</ol></section> : null}
    <ResearchEvidence reply={reply} onInspect={onInspect} />
    {answer && <details className="text-xs leading-6"><summary className="cursor-pointer font-medium text-[var(--text-muted)]">Uncertainty and limitations</summary><ul className="mt-3 list-disc space-y-2 pl-4 text-[var(--text-dim)]">{answer.limitations.map((item, i) => <li key={i}>{item}</li>)}</ul></details>}
    <p className="rounded-xl bg-[var(--surface)] p-3 text-[11px] leading-6 text-[var(--text-dim)]">{reply.notice}</p>
    <details className="text-xs"><summary className="cursor-pointer font-medium text-[var(--text-muted)]">Sources & search coverage</summary><div className="mt-3 space-y-3">{reply.coverage.map((c) => <p key={c.source} className="text-[11px] text-[var(--text-dim)]">{c.source === "pubmed" ? "PubMed" : "ClinicalTrials.gov"}: {c.status === "done" ? `${c.count} records returned` : c.status === "failed" ? "Read failed — coverage incomplete" : "No records returned — coverage uncertain"}</p>)}{reply.sources.map((source) => <button type="button" key={source.id} onClick={() => onInspect(source)} className="block w-full rounded-lg border border-[var(--border)] p-3 text-left leading-6 text-[var(--emerald)]">{source.title} ↗</button>)}</div><p className="mt-3 leading-6 text-[var(--text-dim)]">Available abstracts and registry metadata only. Search ranking is not evidence quality. Registered studies do not prove efficacy.</p></details>
    <div className="flex flex-wrap gap-4 border-t border-[var(--border)] pt-3"><button type="button" onClick={onCopy} className="flex items-center gap-1.5 text-[11px] text-[var(--text-dim)]"><Copy size={12} /> Copy with sources</button><button type="button" onClick={onExport} className="flex items-center gap-1.5 text-[11px] text-[var(--text-dim)]"><Download size={12} /> Export research</button></div>
  </div>;
}
