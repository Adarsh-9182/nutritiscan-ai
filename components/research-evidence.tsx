import type { AgentSource } from "@/lib/agent-runtime/contracts";
import type { ResearchDiagnostic, ResearchReply } from "@/lib/research/contracts";

const ISSUE: Record<ResearchDiagnostic["code"], string> = {
  quota: "Provider quota reached", access: "Model access unavailable", timeout: "Time limit reached",
  unavailable: "Service unavailable", "invalid-response": "Response could not be validated",
  unsupported: "Source support not established", "mode-incomplete": "Requested research artifact incomplete",
  "not-configured": "Research AI not configured",
};
const STAGE = { planning: "Search planning", search: "Source retrieval", draft: "AI draft", review: "Source check" };

export function ResearchEvidence({ reply, onInspect }: { reply: ResearchReply; onInspect: (source: AgentSource, quote?: string) => void }) {
  return <div className="space-y-3">
    {reply.sources.length > 0 && <details className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <summary className="cursor-pointer text-xs font-medium">Evidence table · {reply.sources.length} sources</summary>
      <p className="mt-3 text-[11px] leading-6 text-[var(--text-dim)]">Compare retrieved records and reviewed findings. Study labels come from source metadata; they are not ratings of evidence certainty. Population, sample size and effect estimates are not systematically extracted.</p>
      <div className="mt-4 overflow-x-auto rounded-lg border border-[var(--border)]" tabIndex={0} role="region" aria-label="Scrollable evidence table">
        <table className="w-full min-w-[560px] text-left text-xs" aria-label="Research evidence comparison">
          <thead className="bg-[var(--said)] text-[var(--text-muted)]"><tr>{["Study / record", "Design & evidence available", "Reviewed findings"].map((h) => <th scope="col" key={h} className="px-3 py-3 font-medium">{h}</th>)}</tr></thead>
          <tbody>{reply.sources.map((source, i) => {
            const findings = reply.answer?.findings.filter((f) => f.sourceIds.includes(source.id)) ?? [];
            const types = source.metadata?.publicationTypes ?? [];
            const retracted = types.some((t) => /retract/i.test(t));
            return <tr key={source.id} className="align-top border-t border-[var(--border)]">
              <th scope="row" className="w-[35%] px-3 py-3 font-normal"><button type="button" onClick={() => onInspect(source)} className="text-left leading-6 text-[var(--emerald)]">[{i + 1}] {source.title} ↗</button><p className="mt-2 text-[10px] text-[var(--text-dim)]">{source.metadata?.year ?? "Year not reported"} · {source.kind === "trial" ? "ClinicalTrials.gov" : "PubMed"}</p>{retracted && <p className="mt-2 text-[11px] text-[var(--text-muted)]">Retraction flagged in source metadata. Do not rely on this as supporting evidence.</p>}</th>
              <td className="w-[27%] px-3 py-3 leading-6 text-[var(--text-muted)]">{source.kind === "trial" ? <>{source.metadata?.studyType ?? "Study type not reported"}<br />{source.metadata?.status ?? "Status not reported"}<p className="mt-2 text-[10px] text-[var(--text-dim)]">Registry metadata · does not establish efficacy</p></> : <>{types.join(", ") || "Study design not reported"}<p className="mt-2 text-[10px] text-[var(--text-dim)]">{source.metadata?.hasAbstract ? "Available abstract" : "Metadata only"} · full text not read</p></>}</td>
              <td className="px-3 py-3 leading-6 text-[var(--text-muted)]">{findings.length ? findings.map((f, index) => <div key={index} className={index ? "mt-3" : ""}><p>{f.text}</p><button type="button" onClick={() => onInspect(source, f.excerpts.find((e) => e.sourceId === source.id)?.quote)} className="mt-1 text-[11px] text-[var(--emerald)]">Inspect supporting passage ↗</button></div>) : <span className="text-[var(--text-dim)]">No source-checked finding returned for this record. This is not evidence of no effect.</span>}</td>
            </tr>;
          })}</tbody>
        </table>
      </div>
    </details>}
    {(reply.searches?.length || reply.diagnostics?.length || reply.metrics) ? <details className="rounded-xl border border-[var(--border)] p-4 text-xs">
      <summary className="cursor-pointer font-medium">Search activity & run details{reply.metrics ? ` · ${(reply.metrics.durationMs / 1000).toFixed(1)}s` : ""}</summary>
      <div className="mt-4 space-y-4">{reply.searches?.map((s, i) => <div key={i} className="rounded-lg bg-[var(--surface)] p-3"><p className="text-[11px] text-[var(--text-dim)]">{s.source === "pubmed" ? "PubMed" : "ClinicalTrials.gov"} · {s.strategy === "manual" ? "Custom terms" : s.strategy === "planned" ? "English concept search" : "Keyword fallback"} · {s.status === "done" ? `${s.count} records` : s.status === "empty" ? "No matches" : `Read failed${s.error ? `: ${ISSUE[s.error]}` : ""}`}</p><p className="mt-2 break-words font-mono text-[11px] leading-6 text-[var(--text-muted)]">{s.query}</p></div>)}
        {reply.reviewModel && <p className="text-[11px] text-[var(--text-dim)]">Source-review model: {reply.reviewModel}</p>}
        {reply.diagnostics?.map((d, i) => <p key={i} className="text-[11px] leading-6 text-[var(--text-dim)]">{STAGE[d.stage]}: {ISSUE[d.code]}{d.model ? ` (${d.model})` : ""}</p>)}
        {reply.metrics && <p className="text-[11px] leading-6 text-[var(--text-dim)]">{reply.metrics.modelCalls} model requests · {reply.metrics.inputTokens.toLocaleString()} reported input tokens · {reply.metrics.outputTokens.toLocaleString()} reported output tokens. Failed responses may not report token usage. Account quota and billing are not available here.</p>}
      </div>
    </details> : null}
  </div>;
}
