"use client";

import { useState } from "react";
import { PLUGINS, type AgentArtifact } from "@/lib/agent-runtime/contracts";

type Filter = "all" | "cited" | "reference" | "paper" | "trial";
const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All sources" }, { value: "cited", label: "Cited in answer" },
  { value: "reference", label: "Reference notes" }, { value: "paper", label: "Papers" },
  { value: "trial", label: "Registered studies" },
];

export default function ResearchBrief({ artifact, question }: { artifact: AgentArtifact; question: string }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [find, setFind] = useState("");
  const sources = new Map(artifact.sources.map((source, index) => [source.id, { ...source, number: index + 1 }]));
  const cited = new Set(artifact.summary?.points.flatMap((point) => point.sourceIds) ?? []);
  const visible = Array.from(sources.values()).filter((source) =>
    (filter === "all" || (filter === "cited" ? cited.has(source.id) : source.kind === filter)) &&
    `${source.title} ${source.detail}`.toLowerCase().includes(find.trim().toLowerCase()));
  const searches = artifact.searches ?? [];
  const incomplete = [...new Set(searches.map((search) => search.plugin))].filter((plugin) =>
    !searches.some((search) => search.plugin === plugin && search.status === "done"));
  const abstracts = artifact.sources.filter((source) => source.kind === "paper" && source.metadata?.hasAbstract !== undefined);

  return <div className="space-y-6 p-5 sm:p-6">
    <p className="break-words text-lg font-medium leading-7">{question}</p>
    <div aria-label="Source coverage" className="grid grid-cols-3 gap-2">
      {FILTERS.slice(2).map(({ value, label }) => <div key={value} className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3">
        <p className="text-2xl font-semibold text-[var(--emerald)]">{artifact.sources.filter((source) => source.kind === value).length}</p>
        <p className="mt-1 text-[11px] text-[var(--text-muted)]">{label}</p>
      </div>)}
    </div>
    <p className="text-xs leading-5 text-[var(--text-dim)]">These counts describe retrieved sources, not evidence strength or completeness. Registered studies do not establish efficacy. Available abstracts and metadata are used; this is not a full-text or systematic review.</p>
    {abstracts.length > 0 && <p className="text-xs text-[var(--text-muted)]">{abstracts.filter((source) => source.metadata?.hasAbstract).length} of {abstracts.length} papers have an abstract. Papers without abstracts provide metadata only.</p>}
    {incomplete.length > 0 && <div role="status" className="rounded-xl border border-[var(--border-strong)] bg-[var(--bg)] p-4 text-xs leading-6">
      <p className="font-semibold">Partial source coverage</p>
      <p className="text-[var(--text-muted)]">{incomplete.map((id) => PLUGINS.find((plugin) => plugin.id === id)!.name).join(", ")} returned no records or could not be read. The brief uses the sources that were retrieved; it does not establish that missing evidence does not exist.</p>
    </div>}
    {searches.length > 0 && <details className="rounded-xl border border-[var(--border)] p-4 text-xs">
      <summary className="cursor-pointer font-medium">Search audit · {searches.length} attempts</summary>
      <ol aria-label="Search audit" className="mt-4 space-y-3">{searches.map((search, index) => <li key={index} className="rounded-lg bg-[var(--bg)] p-3">
        <p className="font-medium">{PLUGINS.find((plugin) => plugin.id === search.plugin)!.name}{search.retry ? " · Retry" : ""} · {search.status === "done" ? `${search.returned} records returned` : search.status === "empty" ? "No records returned" : "Read failed"}</p>
        <p className="mt-1 break-words font-mono leading-5 text-[var(--text-muted)]">Query: {search.query}</p>
      </li>)}</ol>
      <p className="mt-3 leading-5 text-[var(--text-dim)]">An empty response can mean no matches or a service limitation. Retry counts may overlap; sources are deduplicated below.</p>
    </details>}
    {artifact.summary ? <section aria-label="Source-linked answer">
      <h3 className="mb-3 text-sm font-semibold">What the sources say</h3>
      <ul className="space-y-4">{artifact.summary.points.map((point, index) => <li key={index} className="text-sm leading-6 text-[var(--text-muted)]">
        <p>{point.text}</p>
        <div className="mt-2 flex flex-wrap gap-2">{point.sourceIds.map((id) => {
          const source = sources.get(id);
          return source ? <a key={id} href={source.url} target="_blank" rel="noreferrer" aria-label={`Citation ${source.number}: ${source.title}`} className="rounded-md border border-[var(--border)] px-2 py-1 text-xs text-[var(--emerald)]">[{source.number}] {source.kind} ↗</a> : null;
        })}</div>
      </li>)}</ul>
      {artifact.summary.gaps.length > 0 && <div className="mt-5 rounded-xl bg-[var(--bg)] p-4">
        <h3 className="text-sm font-semibold">What remains uncertain</h3>
        <ul className="mt-2 list-disc space-y-2 pl-4 text-xs leading-5 text-[var(--text-muted)]">{artifact.summary.gaps.map((gap, index) => <li key={index}>{gap}</li>)}</ul>
      </div>}
      <p className="mt-4 text-[11px] text-[var(--text-dim)]">{cited.size} of {artifact.sources.length} retrieved sources cited in the summary. Citation IDs were checked; verify each claim against the original source.</p>
    </section> : <p className="rounded-xl bg-[var(--bg)] p-4 text-sm leading-6 text-[var(--text-muted)]">{artifact.mode === "source-collection" ? "No model-assisted answer was produced. Browse the collected sources below to assess the question." : "This saved brief predates the readable answer view. Open the exact Markdown file to review its summary."}</p>}
    <section aria-label="Collected sources">
      <h3 className="mb-3 text-sm font-semibold">Explore the sources</h3>
      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <label className="text-xs">Show sources<select aria-label="Show sources" value={filter} onChange={(event) => setFilter(event.target.value as Filter)} className="mt-2 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--bg)] px-3 py-2 text-sm focus-ring">{FILTERS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        <label className="text-xs">Find in sources<input type="search" value={find} onChange={(event) => setFind(event.target.value)} maxLength={200} placeholder="Search titles and excerpts" className="mt-2 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--bg)] px-3 py-2 text-sm focus-ring" /></label>
      </div>
      <p role="status" className="mb-3 text-[11px] text-[var(--text-dim)]">Showing {visible.length} of {artifact.sources.length} sources. Filters affect this view only; the export contains all retrieved sources.</p>
      <ol className="space-y-3">{visible.map((source) => <li key={source.id} className="rounded-xl border border-[var(--border)] p-4">
        <p className="mb-2 text-[10px] uppercase tracking-wide text-[var(--text-dim)]">[{source.number}] {source.kind === "trial" ? "Registered study" : source.kind} {cited.has(source.id) ? "· Cited in answer" : ""}</p>
        <a href={source.url} target="_blank" rel="noreferrer" className="break-words text-sm font-medium leading-6 text-[var(--emerald)]">{source.title} ↗</a>
        {source.metadata && <p className="mt-2 break-words text-[11px] leading-5 text-[var(--text-dim)]">{source.kind === "paper" ? [source.metadata.year ?? "Year not reported", ...(source.metadata.publicationTypes ?? []), source.metadata.hasAbstract === false ? "No abstract returned" : source.metadata.hasAbstract === true ? "Abstract available" : ""].filter(Boolean).join(" · ") : [source.metadata.studyType, source.metadata.status].filter(Boolean).join(" · ")}</p>}
        <details className="mt-3 text-xs text-[var(--text-muted)]"><summary className="cursor-pointer">Read retrieved excerpt</summary><p className="mt-2 whitespace-pre-wrap break-words leading-6">{source.detail.slice(0, 1800)}</p></details>
      </li>)}</ol>
      {!visible.length && <p className="rounded-xl bg-[var(--bg)] p-4 text-xs leading-5 text-[var(--text-muted)]">No sources match these filters. Choose All sources or clear the search to see the retrieved evidence.</p>}
    </section>
  </div>;
}
