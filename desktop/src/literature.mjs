import { findPapers, searchTrials, paperSource, trialSource } from "../dist/evidence.mjs";

export async function searchLiterature(query, selected, signal) {
  if (typeof query !== "string" || query.trim().length < 3 || query.length > 500 || !["pubmed", "trials", "both"].includes(selected)) throw new Error("Use public search terms and a supported literature database.");
  const budget = AbortSignal.any([signal, AbortSignal.timeout(25_000)]);
  const tasks = [];
  if (selected !== "trials") tasks.push({ name: "pubmed", run: findPapers(query, { limit: 5, strict: true, signal: budget }).then((items) => items.map(paperSource)) });
  if (selected !== "pubmed") tasks.push({ name: "trials", run: searchTrials(query, { limit: 3, strict: true, signal: budget }).then((items) => items.map(trialSource)) });
  const outcomes = await Promise.allSettled(tasks.map((t) => t.run)); signal.throwIfAborted();
  const coverage = outcomes.map((result, i) => ({ source: tasks[i].name, status: result.status === "fulfilled" ? "done" : "unavailable", count: result.status === "fulfilled" ? result.value.length : 0 }));
  if (outcomes.every((r) => r.status === "rejected")) throw new Error("Selected literature databases are unavailable. No conclusion about the evidence can be drawn; retry later.");
  const sources = outcomes.flatMap((r) => r.status === "fulfilled" ? r.value : []).map((s) => ({ ...s, ...(s.kind === "trial" ? { notice: "Registry metadata describes a study; it does not establish treatment efficacy." } : s.metadata?.publicationTypes?.some((t) => /retract/i.test(t)) ? { notice: "Retraction-related publication: do not use for substantive findings." } : s.metadata?.hasAbstract === false ? { notice: "No abstract returned: do not use for substantive findings." } : {}) }));
  return { sources, coverage, retrievedAt: new Date().toISOString(), limitations: ["Public metadata and available abstracts only; no full text or exhaustive coverage.", "Model interpretation requires researcher review. Missing records or failed sources do not establish absence of evidence."] };
}
