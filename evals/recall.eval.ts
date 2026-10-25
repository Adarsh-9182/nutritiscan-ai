// ============================================================
// RETRIEVAL RECALL EVAL — advisory, needs the network.
//
// Question: of the randomized trials a Cochrane review cited, how many does
// our PubMed search bring back for the review's own topic? Reports numbers,
// never fails the build: NCBI is a live service and the gold list is a proxy
// (a review's references include trials it excluded). Its job is to show
// whether a change to query building moves recall up or down.
//
//   RECALL_EVAL=1 npm run eval -- recall
//   RECALL_EVAL=1 GOOGLE_GENERATIVE_AI_API_KEY=... npm run eval -- recall   (adds the model-planned arm)
//
// Gold data: evals/data/recall-gold.json, rebuilt by scripts/build-recall-gold.mjs.
// ============================================================

import { describe, it } from "vitest";
import gold from "./data/recall-gold.json";
import { searchPubMed } from "../lib/evidence/pubmed";
import { composeQueries, planQueries, searchLadder, type Pico } from "../lib/agent-runtime/query";
import { picoFromTitle, recallAt, summarizeRecall, type RecallRow } from "../lib/evidence/recall";

const enabled = process.env.RECALL_EVAL === "1";
const signal = () => new AbortController().signal;
const POOL = 50;

type Arm = { name: string; retrieve: (title: string, pico: Pico | null) => Promise<string[]> };
const ladder = (withTrialFilter: boolean): Arm["retrieve"] => async (title, pico) => {
  if (!pico) return [];
  const queries = composeQueries({ ...pico, designs: withTrialFilter ? ["rct"] : [] });
  return (await searchLadder(queries, title, { limit: POOL, enough: 20, signal: signal() })).ids;
};

const arms: Arm[] = [
  { name: "raw title as typed", retrieve: (title) => searchPubMed(title, { limit: POOL }) },
  { name: "title concepts, query ladder", retrieve: ladder(false) },
  { name: "title concepts, ladder + trial filter", retrieve: ladder(true) },
];
if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
  arms.push({ name: "model-planned query (production path)", retrieve: async (title) => {
    const planned = await planQueries(title, signal());
    return searchPubMed(planned?.pubmed ?? title, { limit: POOL });
  } });
}

describe.skipIf(!enabled)("retrieval recall against Cochrane reviews", () => {
  it("reports recall for each way of building the query", async () => {
    const lines: string[] = [];
    for (const arm of arms) {
      const rows: RecallRow[] = [];
      for (const review of gold.reviews) {
        const ids = (await arm.retrieve(review.title, picoFromTitle(review.title))).filter((id) => id !== review.pmid);
        rows.push({ recall10: recallAt(review.trials, ids, 10), recall50: recallAt(review.trials, ids, POOL), retrieved: ids.length });
      }
      const s = summarizeRecall(rows);
      lines.push(`${arm.name.padEnd(42)} recall@10 ${(s.recall10 * 100).toFixed(1).padStart(5)}%  recall@${POOL} ${(s.recall50 * 100).toFixed(1).padStart(5)}%  found-any ${(s.hitRate * 100).toFixed(0).padStart(3)}%  avg retrieved ${s.retrieved.toFixed(0)}`);
    }
    console.log(`\nRecall over ${gold.reviews.length} Cochrane reviews (gold built ${gold.builtAt})\n${lines.join("\n")}\n`);
  }, 900_000);
});
