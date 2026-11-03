import type { AgentSource } from "@/lib/agent-runtime/contracts";
import type { Paper } from "./pubmed";
import type { Trial } from "./trials";

export function paperSource(paper: Paper): AgentSource {
  return {
    id: `pubmed:${paper.pmid}`, title: paper.title.slice(0, 2000), url: paper.url, kind: "paper",
    metadata: { year: paper.year, publicationTypes: paper.publicationTypes.slice(0, 30).map((type) => type.slice(0, 200)), hasAbstract: Boolean(paper.abstract.trim()) },
    detail: `${paper.journal} · ${paper.year ?? "year not reported"} · ${paper.publicationTypes.join(", ")}\n${paper.abstract || "No abstract returned."}`.slice(0, 12000),
  };
}

export function trialSource(trial: Trial): AgentSource {
  return {
    id: `trials:${trial.nctId}`, title: trial.title.slice(0, 2000), url: trial.url, kind: "trial",
    metadata: { studyType: trial.studyType.slice(0, 200), status: trial.status.slice(0, 200) },
    detail: [`${trial.studyType} · ${trial.status}`, `Conditions: ${trial.conditions.join(", ")}`, `Interventions: ${trial.interventions.join(", ")}`,
      ...(trial.enrollment ? [`Registry enrollment: ${trial.enrollment}`] : []), ...(trial.eligibility ? [`Eligibility: ${trial.eligibility}`] : []),
      ...(trial.endpoints ? [`Planned primary endpoints (not results): ${trial.endpoints}`] : []), ...(trial.arms ? [`Study arms: ${trial.arms}`] : []),
    ].join("\n").slice(0, 12000),
  };
}
