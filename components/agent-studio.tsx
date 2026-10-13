"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Check, FileDown, Play, Plus, Square, Sparkles } from "lucide-react";
import { AgentDefinitionSchema, PLUGINS, RESEARCH_AGENT, RunRequestSchema, type AgentArtifact, type AgentDefinition, type PluginId, type RunEvent } from "@/lib/agent-runtime/contracts";
import { consumeRun, verifiedArtifactBlob } from "@/lib/agent-runtime/client";
import { removeAgentDefinition, saveAgentDefinition, useAgentDefinitions } from "@/lib/agent-runtime/store";
import { useHydrated } from "@/lib/memory/store";

type Status = "idle" | "running" | "approval" | "completed" | "rejected" | "cancelled" | "failed";
const STATUS_LABEL: Record<Status, string> = { idle: "Ready to run", running: "Working", approval: "Needs your approval", completed: "Download started", rejected: "Export rejected", cancelled: "Stopped", failed: "Needs attention" };
const EXAMPLES = ["sleep duration and type 2 diabetes", "vitamin B12 in vegetarian diets", "exercise and cardiovascular health"];
type Step = Extract<RunEvent, { type: "step" }>;
type Receipt = { filename: string; sha256: string; bytes: number; at: string };

export default function AgentStudio() {
  const definitions = useAgentDefinitions();
  const hydrated = useHydrated();
  if (!hydrated) return <div className="p-8 text-sm text-[var(--text-dim)]">Loading your agents…</div>;
  return <Studio definitions={definitions} />;
}

function Studio({ definitions }: { definitions: AgentDefinition[] }) {
  const [agent, setAgent] = useState<AgentDefinition>(() => definitions[0] ?? RESEARCH_AGENT);
  const [task, setTask] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<string[]>([]);
  const [steps, setSteps] = useState<Step[]>([]);
  const [artifact, setArtifact] = useState<AgentArtifact | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [exporting, setExporting] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const exportLock = useRef(false);
  useEffect(() => () => controllerRef.current?.abort(), []);

  const selectAgent = (next: AgentDefinition) => {
    if (controllerRef.current || exportLock.current) return;
    setAgent(next); setStatus("idle"); setArtifact(null); setReceipt(null);
    setPlan([]); setSteps([]); setError(""); setNotice("");
  };

  const togglePlugin = (id: PluginId) => {
    setAgent((current) => ({ ...current, plugins: current.plugins.includes(id)
      ? current.plugins.filter((plugin) => plugin !== id)
      : [...current.plugins, id] }));
  };

  const saveAgent = () => {
    setError("");
    const parsed = AgentDefinitionSchema.safeParse(agent);
    if (!parsed.success) { setError("Add a name, clear instructions, and at least one source plugin."); return; }
    try { saveAgentDefinition(parsed.data); setNotice(`${parsed.data.name} saved on this device.`); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Agent could not be saved."); }
  };

  const receive = (event: RunEvent) => {
    if (event.type === "started") setPlan(event.plan);
    if (event.type === "step") setSteps((current) => {
      const index = current.findIndex((step) => step.id === event.id);
      return index < 0 ? [...current, event] : current.map((step, i) => i === index ? event : step);
    });
    if (event.type === "approval") { setArtifact(event.artifact); setStatus("approval"); }
    if (event.type === "failed") { setError(event.message); setStatus("failed"); }
    if (event.type === "cancelled") setStatus("cancelled");
  };

  const run = async () => {
    if (controllerRef.current || exportLock.current) return;
    const parsed = RunRequestSchema.safeParse({ agent, task });
    if (!parsed.success) { setError("Add valid agent settings and a question between 3 and 300 characters."); return; }
    const controller = new AbortController();
    controllerRef.current = controller;
    setBusy(true); setStatus("running"); setPlan([]); setSteps([]);
    setArtifact(null); setReceipt(null); setError(""); setNotice("");
    try {
      const response = await fetch("/api/agents/run", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data), signal: controller.signal,
      });
      await consumeRun(response, (event) => { if (!controller.signal.aborted) receive(event); });
    } catch (cause) {
      if (controller.signal.aborted) setStatus("cancelled");
      else {
        setStatus("failed"); setArtifact(null);
        setError(cause instanceof Error ? cause.message : "The run could not finish. Please try again.");
      }
    } finally { controllerRef.current = null; setBusy(false); }
  };

  const download = async () => {
    if (!artifact || status !== "approval" || exportLock.current) return;
    exportLock.current = true; setExporting(true); setError("");
    try {
      const blob = await verifiedArtifactBlob(artifact);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url; anchor.download = artifact.filename;
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 15_000);
      setReceipt({ filename: artifact.filename, sha256: artifact.sha256, bytes: blob.size, at: new Date().toISOString() });
      setStatus("completed");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The export could not be prepared."); }
    finally { exportLock.current = false; setExporting(false); }
  };

  const locked = busy || exporting;
  return (
    <div className="relative mx-auto max-w-7xl px-4 pb-14 pt-6 sm:px-8">
      <header className="mb-10 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] pb-5">
        <Link href="/" className="flex items-center gap-2 font-semibold"><span className="grid h-8 w-8 place-items-center rounded-xl bg-[var(--emerald)] text-[#07130c]"><Sparkles size={17} /></span>NutritiScan <span className="hidden text-[var(--text-dim)] sm:inline">/ Agent Studio</span></Link>
        <nav className="flex gap-2" aria-label="Studio navigation"><Link href="/research" className="btn-ghost rounded-full px-3 py-2 text-sm">Research</Link><Link href="/chat" className="btn-ghost rounded-full px-3 py-2 text-sm">Health chat →</Link></nav>
      </header>

      <div className="mb-8 max-w-3xl">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--emerald)]">Agent Studio · Research workflow</p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-5xl">Build an agent. Give it a job.</h1>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-[var(--text-muted)] sm:text-base">Choose the sources it can use. Watch it gather evidence and prepare a brief. Review the result before it exports anything.</p>
        <p className="mt-4 font-mono text-xs text-[var(--emerald)]">Plan → Tools → Draft → Review → Approved download</p>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <div className="mb-4 flex items-center justify-between"><h2 className="font-semibold">Your agents</h2><button type="button" onClick={() => selectAgent({ ...RESEARCH_AGENT, id: crypto.randomUUID(), name: "New research agent" })} disabled={locked} className="btn-ghost flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs disabled:opacity-40"><Plus size={13} />New</button></div>
          <div className="mb-6 flex flex-col gap-2">{definitions.map((definition) => <button key={definition.id} type="button" onClick={() => selectAgent(definition)} disabled={locked} aria-pressed={definition.id === agent.id} className={`rounded-xl border px-3 py-2.5 text-left text-sm transition disabled:opacity-50 ${definition.id === agent.id ? "border-[var(--emerald)] bg-[color-mix(in_oklab,var(--emerald)_8%,transparent)]" : "border-[var(--border)] hover:border-[var(--border-strong)]"}`}>{definition.name}<span className="mt-1 block text-[11px] text-[var(--text-dim)]">{definition.plugins.length} plugins · Research brief</span></button>)}</div>
          <fieldset disabled={locked} className="space-y-4 disabled:opacity-60">
            <label className="block text-xs font-medium">Agent name<input value={agent.name} onChange={(event) => setAgent({ ...agent, name: event.target.value })} maxLength={60} className="mt-2 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--bg)] px-3 py-2 text-sm focus-ring" /></label>
            <label className="block text-xs font-medium">Instructions<textarea value={agent.instructions} onChange={(event) => setAgent({ ...agent, instructions: event.target.value })} maxLength={1200} rows={5} className="mt-2 w-full resize-y rounded-lg border border-[var(--border-strong)] bg-[var(--bg)] px-3 py-2 text-sm leading-5 focus-ring" /></label>
            <div><h3 className="mb-2 text-xs font-semibold">Plugin permissions</h3><div className="space-y-2">{PLUGINS.map((plugin) => <label key={plugin.id} className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-[var(--border)] p-2.5"><input type="checkbox" checked={agent.plugins.includes(plugin.id)} onChange={() => togglePlugin(plugin.id)} disabled={plugin.id === "artifact"} className="mt-0.5 accent-[var(--emerald)]" /><span className="min-w-0"><span className="text-xs font-medium">{plugin.name}</span><span className="mt-1 block text-[11px] leading-4 text-[var(--text-dim)]">{plugin.description}</span><span className="mt-1 block text-[10px] text-[var(--emerald)]">{plugin.approval ? "Your approval required" : plugin.scope}</span></span></label>)}</div></div>
            <button type="button" onClick={saveAgent} className="btn-primary w-full rounded-lg px-3 py-2.5 text-sm">Save agent on this device</button>
            {agent.id !== RESEARCH_AGENT.id && definitions.some((definition) => definition.id === agent.id) && <button type="button" onClick={() => {
              try { removeAgentDefinition(agent.id); selectAgent(RESEARCH_AGENT); }
              catch (cause) { setError(cause instanceof Error ? cause.message : "Agent could not be removed."); }
            }} className="btn-ghost w-full rounded-lg px-3 py-2 text-xs text-[var(--text-dim)]">Delete saved agent</button>}
          </fieldset>
          <p className="mt-3 text-[11px] leading-5 text-[var(--text-dim)]">Definitions stay in this browser. Keep instructions general; each run is separate from your chat history.</p>
          {notice && <p role="status" className="mt-3 text-xs text-[var(--emerald)]">{notice}</p>}
        </aside>

        <div className="min-w-0 space-y-5">
          <section className="rounded-2xl border border-[var(--border-strong)] bg-[var(--surface)] p-5 sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-3"><h2 className="font-semibold">Give {agent.name || "your agent"} a task</h2><span role="status" className="shrink-0 rounded-full border border-[var(--border)] px-2.5 py-1 text-[11px] text-[var(--emerald)]">{STATUS_LABEL[status]}</span></div>
            <form onSubmit={(event) => { event.preventDefault(); void run(); }}>
              <label htmlFor="agent-task" className="sr-only">Agent task</label>
              <textarea id="agent-task" placeholder="What should your agent research?" value={task} onChange={(event) => setTask(event.target.value)} disabled={locked} maxLength={300} rows={3} className="w-full resize-y rounded-xl border border-[var(--border-strong)] bg-[var(--bg)] px-4 py-3 text-[15px] leading-6 focus-ring" />
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3"><span className="text-[11px] text-[var(--text-dim)]">Up to 5 steps · 45-second run budget</span>{busy ? <button type="button" onClick={() => controllerRef.current?.abort()} className="btn-ghost flex items-center gap-2 rounded-lg border border-[var(--border-strong)] px-4 py-2 text-sm"><Square size={13} />Stop run</button> : <button type="submit" disabled={locked || task.trim().length < 3} className="btn-primary flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm disabled:opacity-40"><Play size={14} />Run agent</button>}</div>
            </form>
            <div className="mt-4 flex flex-wrap gap-2">{EXAMPLES.map((example) => <button key={example} type="button" onClick={() => setTask(example)} disabled={locked} className="rounded-full border border-[var(--border)] px-2.5 py-1.5 text-[11px] text-[var(--text-muted)] transition hover:border-[var(--emerald)] disabled:opacity-40">{example}</button>)}</div>
            <p className="mt-4 text-[11px] leading-5 text-[var(--text-dim)]">Your question goes to NutritiScan and the enabled public search services. A configured AI provider may process the question, instructions and retrieved text. Use general research questions. <Link href="/privacy" className="underline underline-offset-2">Privacy</Link></p>
          </section>

          {error && <p role="alert" className="whitespace-pre-wrap rounded-xl border border-[color-mix(in_oklab,var(--rose)_40%,transparent)] bg-[color-mix(in_oklab,var(--rose)_8%,transparent)] p-4 text-sm leading-6">{error}</p>}

          {(plan.length > 0 || busy) && <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5"><h2 className="mb-4 font-semibold">Run activity</h2>{plan.length > 0 && <details className="mb-4 text-xs text-[var(--text-muted)]"><summary className="cursor-pointer">View plan · {plan.length} stages</summary><ol className="mt-2 list-decimal space-y-1 pl-5">{plan.map((item) => <li key={item}>{item}</li>)}</ol></details>}<ol aria-label="Agent steps" className="space-y-3">{steps.map((step) => <li key={step.id} className="flex gap-3"><span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border border-[var(--border)] ${step.status === "running" ? "animate-pulse text-[var(--cyan)]" : "text-[var(--emerald)]"}`}>{step.status === "done" ? <Check size={13} /> : step.status === "empty" ? "—" : "·"}</span><div><p className="text-sm font-medium">{step.label}<span className="ml-2 text-[10px] font-normal uppercase tracking-wide text-[var(--text-dim)]">{step.status}</span></p>{step.detail && <p className="mt-0.5 text-xs leading-5 text-[var(--text-muted)]">{step.detail}</p>}</div></li>)}</ol>{busy && !steps.length && <p className="text-sm text-[var(--text-dim)]">Starting the run…</p>}</section>}

          {artifact && <section className="overflow-hidden rounded-2xl border border-[color-mix(in_oklab,var(--emerald)_35%,transparent)] bg-[var(--surface)]">
            <div className="border-b border-[var(--border)] p-5"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Review the brief</h2><span className="rounded-full bg-[var(--bg)] px-2.5 py-1 text-[10px] uppercase tracking-wide text-[var(--emerald)]">{artifact.mode === "model-assisted" ? "Model-assisted" : "Source collection"}</span></div><p className="mt-2 break-all font-mono text-[11px] text-[var(--text-muted)]">{artifact.filename} · {(artifact.bytes / 1024).toFixed(1)} KB · {artifact.sources.length} sources</p></div>
            <pre aria-label="Brief preview" className="max-h-[440px] overflow-auto whitespace-pre-wrap break-words p-5 font-sans text-[13px] leading-6 text-[var(--text-muted)]">{artifact.content}</pre>
            <div className="border-t border-[var(--border)] p-5"><div className="flex flex-wrap gap-2">{artifact.sources.map((source) => <a key={source.id} href={source.url} target="_blank" rel="noreferrer" className="max-w-full truncate rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-[11px] text-[var(--emerald)]">{source.id} ↗</a>)}</div>
              {status === "approval" && <div className="mt-5 rounded-xl bg-[var(--bg)] p-4"><p className="text-sm font-medium">Approve this exact file for download?</p><p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">This saves a Markdown file to your device. Review the sources and summary above. The approval preview expires in 30 minutes.</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => void download()} disabled={exporting} className="btn-primary flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm disabled:opacity-50"><FileDown size={14} />{exporting ? "Verifying file…" : "Approve & download"}</button><button type="button" onClick={() => { setStatus("rejected"); setNotice("Export rejected. No download was started."); }} disabled={exporting} className="btn-ghost rounded-lg border border-[var(--border)] px-4 py-2 text-sm">Reject export</button></div></div>}
              {receipt && <div role="status" className="mt-5 rounded-xl bg-[var(--bg)] p-4"><p className="flex items-center gap-2 text-sm font-medium text-[var(--emerald)]"><Check size={15} />File verified; browser download started.</p><p className="mt-2 break-all font-mono text-[10px] leading-5 text-[var(--text-dim)]">SHA-256: {receipt.sha256}</p><p className="mt-1 text-xs text-[var(--text-muted)]">{receipt.bytes.toLocaleString()} bytes · Check your browser downloads to confirm it saved.</p></div>}
            </div>
          </section>}
          {!plan.length && !artifact && !busy && <section className="rounded-2xl border border-dashed border-[var(--border-strong)] p-8 text-center"><Sparkles className="mx-auto mb-3 text-[var(--emerald)]" size={25} /><h2 className="text-sm font-semibold">One question, a complete workflow.</h2><p className="mx-auto mt-2 max-w-md text-xs leading-6 text-[var(--text-dim)]">Your agent gathers sources, prepares a draft and pauses for review. Its activity and the exported file’s fingerprint stay visible here.</p></section>}
        </div>
      </div>
    </div>
  );
}
