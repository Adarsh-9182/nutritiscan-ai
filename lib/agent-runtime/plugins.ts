import { findReferences } from "@/lib/workspace/health-library";
import { findPapers } from "@/lib/evidence/pubmed";
import { searchTrials } from "@/lib/evidence/trials";
import { paperSource, trialSource } from "@/lib/evidence/records";
import { z } from "zod";
import { MAX_QUERY_LENGTH } from "./query";
import { type AgentDefinition, type AgentSource, type PluginId } from "./contracts";

type ReadPlugin = Exclude<PluginId, "artifact">;
type Plugin = (question: string, signal: AbortSignal, quick: boolean, strict: boolean) => Promise<AgentSource[]>;

// Executable code is registered by the application, never by a model or browser.
const registry: Record<ReadPlugin, Plugin> = {
  library: async (question) => findReferences(question).map((note) => ({
    id: `library:${note.id}`, title: note.title, url: note.url, kind: "reference", detail: note.text,
  })),
  pubmed: async (question, signal, quick, strict) => (await findPapers(question, { limit: quick ? 3 : 6, signal, ...(strict ? { strict: true } : {}) })).map(paperSource),
  trials: async (question, signal, quick, strict) => (await searchTrials(question, { limit: quick ? 2 : 4, signal, ...(strict ? { strict: true } : {}) })).map(trialSource),
};

export async function executeReadPlugin(agent: AgentDefinition, id: string, question: string, signal: AbortSignal, options: { strict?: boolean } = {}): Promise<AgentSource[]> {
  // Authorization is host-enforced even if a planner requests another tool.
  if (!agent.plugins.includes(id as PluginId) || !Object.hasOwn(registry, id)) {
    throw new Error("This agent does not have permission to use that read plugin.");
  }
  // A planned PubMed query is longer than a typed question, so it has its own bound.
  const task = z.string().trim().min(3).max(MAX_QUERY_LENGTH).parse(question);
  signal.throwIfAborted();
  return registry[id as ReadPlugin](task, signal, agent.depth === "quick", options.strict === true);
}
