// Builds evals/data/recall-gold.json: recent Cochrane intervention reviews and
// the randomized trials each one cites. A review's reference list is a proxy
// for "the studies a careful reviewer found", not a complete or perfect truth:
// it also holds trials the review excluded. Run with `node scripts/build-recall-gold.mjs`.
import { writeFile } from "node:fs/promises";

const EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/";
const MIN_TRIALS = 8;
const MAX_TRIALS = 80;
const TARGET_REVIEWS = 25;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function call(path, params) {
  const query = new URLSearchParams({ tool: "nutritiscan-eval", retmode: "json", ...params });
  for (let attempt = 1; ; attempt++) {
    await sleep(400 * attempt);
    // POST: a term listing hundreds of ids is longer than a URL may be.
    const res = await fetch(`${EUTILS}${path}`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: query });
    if (res.ok) return res.json();
    if (attempt === 4 || (res.status < 500 && res.status !== 429)) throw new Error(`${path} ${res.status}`);
  }
}

const search = await call("esearch.fcgi", {
  db: "pubmed", retmax: "200", sort: "relevance",
  term: '"Cochrane Database Syst Rev"[journal] AND 2021:2025[dp] AND hasabstract',
});
const candidates = search.esearchresult.idlist;
const summaries = await call("esummary.fcgi", { db: "pubmed", id: candidates.join(",") });

const reviews = [];
for (const pmid of candidates) {
  if (reviews.length >= TARGET_REVIEWS) break;
  const title = summaries.result[pmid]?.title?.replace(/\.$/, "") ?? "";
  // Intervention reviews are titled "X for Y" or "X in Y"; the rest are not a retrieval question.
  if (!/^(.+?) (?:for|in) (.+)$/i.test(title) || /diagnostic|prognos|accuracy|overview/i.test(title)) continue;
  const links = await call("elink.fcgi", { dbfrom: "pubmed", db: "pubmed", id: pmid, linkname: "pubmed_pubmed_refs" });
  const refs = links.linksets?.[0]?.linksetdbs?.[0]?.links ?? [];
  if (refs.length < MIN_TRIALS) continue;
  const term = `(${refs.slice(0, 300).map((id) => `${id}[uid]`).join(" OR ")}) AND randomized controlled trial[pt]`;
  const trials = (await call("esearch.fcgi", { db: "pubmed", term, retmax: "300" })).esearchresult.idlist;
  if (trials.length < MIN_TRIALS || trials.length > MAX_TRIALS) continue;
  reviews.push({ pmid, title, trials });
  console.log(`${reviews.length}. ${title.slice(0, 80)} (${trials.length} trials)`);
}
await writeFile(new URL("../evals/data/recall-gold.json", import.meta.url), `${JSON.stringify({ builtAt: new Date().toISOString().slice(0, 10), note: "Trials cited by each Cochrane review that PubMed types as randomized controlled trials.", reviews }, null, 1)}\n`);
console.log(`wrote ${reviews.length} reviews`);
