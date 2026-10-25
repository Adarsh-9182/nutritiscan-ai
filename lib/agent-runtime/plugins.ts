import { findReferences } from "@/lib/workspace/health-library";
import { findPapers } from "@/lib/evidence/pubmed";
import { searchTrials } from "@/lib/evidence/trials";
import { z } from "zod";
import { MAX_QUERY_LENGTH } from "./query";
import { type AgentDefinition, type AgentSource, type PluginId } from "./contracts";

type ReadPlugin = Exclude<PluginId, "artifact">;
type Plugin = (question: string, signal: AbortSignal, quick: boolean) => Promise<AgentSource[]>;

// Executable code is registered by the application, never by a model or browser.
const registry: Record<ReadPlugin, Plugin> = {
  library: async (question) => findReferences(question).map((note) => ({
    id: `library:${note.id}`, title: note.title, url: note.url, kind: "reference", detail: note.text,
  })),
  pubmed: async (question, signal, quick) => (await findPapers(question, { limit: quick ? 3 : 6, signal })).map((paper) => ({
    id: `pubmed:${paper.pmid}`, title: paper.title.slice(0, 2000), url: paper.url, kind: "paper",
    metadata: { year: paper.year, publicationTypes: paper.publicationTypes.slice(0, 30).map((type) => type.slice(0, 200)), hasAbstract: Boolean(paper.abstract.trim()) },
    detail: `${paper.journal} · ${paper.year ?? "year not reported"} · ${paper.publicationTypes.join(", ")}\n${paper.abstract || "No abstract returned."}`.slice(0, 12000),
  })),
  trials: async (question, signal, quick) => (await searchTrials(question, { limit: quick ? 2 : 4, signal })).map((trial) => ({
    id: `trials:${trial.nctId}`, title: trial.title.slice(0, 2000), url: trial.url, kind: "trial",
    metadata: { studyType: trial.studyType.slice(0, 200), status: trial.status.slice(0, 200) },
    detail: `${trial.studyType} · ${trial.status}\nConditions: ${trial.conditions.join(", ")}\nInterventions: ${trial.interventions.join(", ")}`.slice(0, 12000),
  })),
};

export async function executeReadPlugin(agent: AgentDefinition, id: string, question: string, signal: AbortSignal): Promise<AgentSource[]> {
  // Authorization is host-enforced even if a planner requests another tool.
  if (!agent.plugins.includes(id as PluginId) || !Object.hasOwn(registry, id)) {
    throw new Error("This agent does not have permission to use that read plugin.");
  }
  // A planned PubMed query is longer than a typed question, so it has its own bound.
  const task = z.string().trim().min(3).max(MAX_QUERY_LENGTH).parse(question);
  signal.throwIfAborted();
  return registry[id as ReadPlugin](task, signal, agent.depth === "quick");
}
