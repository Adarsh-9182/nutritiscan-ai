"use client";

import { FormEvent, useState } from "react";
import type { Paper } from "@/lib/evidence/pubmed";
import type { Trial } from "@/lib/evidence/trials";

type Result = {
  question: string;
  retrievedAt: string;
  sources: { pubmed: Paper[]; clinicalTrials: Trial[] };
  limitations: string[];
};

const EXAMPLES = [
  "What evidence exists for GLP-1 medicines and cardiovascular outcomes?",
  "What trials are studying iron deficiency and fatigue in adults?",
  "Does sleep duration affect blood glucose in people with type 2 diabetes?",
];

export default function ResearchWorkspace() {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch("/api/research", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Search could not be completed.");
      setResult(payload as Result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Search could not be completed. Try again.");
    } finally {
      setLoading(false);
    }
  }

  const total = (result?.sources.pubmed.length ?? 0) + (result?.sources.clinicalTrials.length ?? 0);

  return (
    <section>
      <div className="mb-7 max-w-3xl">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--emerald)]">Research workspace · early preview</p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-5xl">Start with the evidence.</h1>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-[var(--text-muted)] sm:text-base">
          Search medical literature and registered studies in one place. NutritiScan brings the sources to you; you inspect the evidence and decide what it means.
        </p>
      </div>

      <form onSubmit={search} className="rounded-2xl border border-[var(--border-strong)] bg-[var(--surface)] p-3 shadow-xl sm:p-4">
        <label htmlFor="research-question" className="sr-only">Research question</label>
        <textarea
          id="research-question"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          maxLength={300}
          minLength={3}
          rows={3}
          placeholder="Ask a focused health research question…"
          className="w-full resize-y bg-transparent px-3 py-3 text-base leading-6 text-[var(--text)] outline-none placeholder:text-[var(--text-dim)]"
          required
        />
        <div className="flex items-center justify-between border-t border-[var(--border)] px-2 pt-3">
          <span className="max-w-[65%] text-xs leading-5 text-[var(--text-dim)]">Sent to PubMed + ClinicalTrials.gov. Don’t include names or identifiable private health information.</span>
          <button type="submit" disabled={loading || question.trim().length < 3} className="rounded-xl bg-[var(--emerald)] px-4 py-2 text-sm font-semibold text-[#07130c] disabled:cursor-wait disabled:opacity-50">
            {loading ? "Searching…" : "Search sources"}
          </button>
        </div>
      </form>

      {!result && !loading && !error && (
        <div className="mt-5 flex flex-wrap gap-2">
          {EXAMPLES.map((example) => (
            <button key={example} type="button" onClick={() => setQuestion(example)} className="rounded-full border border-[var(--border)] px-3 py-2 text-left text-xs leading-5 text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text)]">
              {example}
            </button>
          ))}
        </div>
      )}

      {error && <p role="alert" className="mt-5 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--rose)]">{error}</p>}

      {loading && <div role="status" className="mt-8 animate-pulse rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 text-sm text-[var(--text-muted)]">Searching public sources. This can take a few seconds…</div>}

      {result && (
        <div className="mt-10 space-y-8">
          <section aria-labelledby="brief-title" className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--emerald)]">Evidence brief · source index</p>
                <h2 id="brief-title" className="mt-2 text-xl font-semibold">{result.question}</h2>
              </div>
              <span className="rounded-full border border-[var(--border)] px-3 py-1 text-xs text-[var(--text-muted)]">{total} sources found</span>
            </div>
            <p className="mt-4 text-sm leading-6 text-[var(--text-muted)]">
              We found <strong className="text-[var(--text)]">{result.sources.pubmed.length} PubMed records</strong> and <strong className="text-[var(--text)]">{result.sources.clinicalTrials.length} registered studies</strong>. The entries below are retrieved source material, not a synthesized conclusion. Review the linked records before drawing conclusions.
            </p>
            <ul className="mt-4 space-y-1.5 text-xs leading-5 text-[var(--text-dim)]">
              {result.limitations.map((limitation) => <li key={limitation}>• {limitation}</li>)}
            </ul>
            <p className="mt-4 text-[11px] text-[var(--text-dim)]">Retrieved {new Date(result.retrievedAt).toLocaleString()}</p>
          </section>

          {total === 0 && <p className="rounded-2xl border border-[var(--border)] p-6 text-sm text-[var(--text-muted)]">No matching records came back from either source. Try a shorter question with the condition, intervention, or population named explicitly.</p>}

          {result.sources.pubmed.length > 0 && (
            <section aria-labelledby="pubmed-title">
              <div className="mb-3 flex items-baseline justify-between"><h2 id="pubmed-title" className="text-lg font-semibold">PubMed literature</h2><span className="text-xs text-[var(--text-dim)]">{result.sources.pubmed.length} records</span></div>
              <div className="space-y-3">{result.sources.pubmed.map((paper) => <PaperCard key={paper.pmid} paper={paper} />)}</div>
            </section>
          )}

          {result.sources.clinicalTrials.length > 0 && (
            <section aria-labelledby="trials-title">
              <div className="mb-3 flex items-baseline justify-between"><h2 id="trials-title" className="text-lg font-semibold">Registered studies</h2><span className="text-xs text-[var(--text-dim)]">{result.sources.clinicalTrials.length} records</span></div>
              <div className="space-y-3">{result.sources.clinicalTrials.map((trial) => <TrialCard key={trial.nctId} trial={trial} />)}</div>
            </section>
          )}
        </div>
      )}
    </section>
  );
}

function PaperCard({ paper }: { paper: Paper }) {
  return (
    <article className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-dim)]">PubMed · PMID {paper.pmid}{paper.year ? ` · ${paper.year}` : ""}</p>
      <h3 className="mt-2 text-base font-semibold leading-6"><a href={paper.url} target="_blank" rel="noreferrer" className="hover:underline">{paper.title || "Untitled record"} ↗</a></h3>
      <p className="mt-1 text-xs text-[var(--text-dim)]">{[paper.journal, paper.publicationTypes.join(", ")].filter(Boolean).join(" · ") || "Publication details unavailable"}</p>
      {paper.abstract ? <details className="mt-3"><summary className="cursor-pointer text-xs font-medium text-[var(--emerald)]">Read available abstract</summary><p className="mt-3 whitespace-pre-line text-sm leading-6 text-[var(--text-muted)]">{paper.abstract}</p></details> : <p className="mt-3 text-xs text-[var(--text-dim)]">No abstract available in this record.</p>}
    </article>
  );
}

function TrialCard({ trial }: { trial: Trial }) {
  return (
    <article className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-dim)]">ClinicalTrials.gov · {trial.nctId}</p>
      <h3 className="mt-2 text-base font-semibold leading-6"><a href={trial.url} target="_blank" rel="noreferrer" className="hover:underline">{trial.title} ↗</a></h3>
      <p className="mt-2 text-xs text-[var(--text-muted)]">{trial.status} · {trial.studyType}{trial.startDate ? ` · started ${trial.startDate}` : ""}</p>
      {trial.conditions.length > 0 && <p className="mt-2 text-xs leading-5 text-[var(--text-dim)]">Conditions: {trial.conditions.join(", ")}</p>}
      {trial.interventions.length > 0 && <p className="mt-1 text-xs leading-5 text-[var(--text-dim)]">Interventions: {trial.interventions.join(", ")}</p>}
    </article>
  );
}
