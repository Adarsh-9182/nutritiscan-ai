// ============================================================
// MEDICAL EVIDENCE — PUBMED SOURCE
//
// ARCHITECTURE.md §3.3 is blunt about the gap this closes: the agents
// "reason from pretrained knowledge and cite nothing", and the "RAG" on the
// landing page is lib/memory/recall.ts, which retrieves the *patient's own*
// history. Patient memory is not medical evidence. A confident answer with
// no source behind it looks exactly like one with a source behind it — and
// in a health product that gap is the whole risk.
//
// This file is the first half of closing it: a way to actually read the
// literature. It fetches real papers from PubMed — 38M citations, NIH-run,
// free, no key, no card. That last part is why PubMed and not a commercial
// corpus: the product has no budget (see provider.ts), and an evidence layer
// that needs a credit card would ship as another aspiration.
//
// WHAT THIS FILE IS NOT. It retrieves; it does not decide. Nothing here
// judges whether a paper is good, whether it answers the question, or
// whether an agent may cite it — that is retrieve.ts and the citation
// validator, and keeping the seam here means a bad ranking never becomes a
// bad *claim*. ARCHITECTURE.md §5 rule 4 already reserves that call for
// lib/evidence/**; this is the file that hands it something to rule on.
//
// HONEST LIMITS:
//   - Abstracts only. PubMed serves metadata + abstract; full text lives in
//     PMC for the open-access subset. An abstract is enough to cite and to
//     rank on, not always enough to reason from.
//   - The XML is parsed with regex, not a parser. NCBI's schema is stable
//     and the fields taken are shallow, but this is a real tradeoff made to
//     avoid a dependency; every extractor below fails to a null/empty rather
//     than throwing, so a schema surprise degrades the result instead of the
//     request.
//   - No cache. Every call is a live round trip. Caching belongs with the
//     embeddings in Postgres (DATA.md), not in a module-level Map that dies
//     with the lambda.
// ============================================================

const EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";

/**
 * NCBI asks that automated clients identify themselves, and rate-limits by
 * identity: 3 requests/second keyless, 10/second with a key. `tool` is the
 * app name; `email` is a contact NCBI can reach if this client misbehaves.
 *
 * The email comes from the environment and is the *operator's*, never the
 * end user's — nothing about a patient or their question is disclosed to
 * NCBI beyond the search terms themselves.
 */
const TOOL = "nutritiscan";

/** Keyless is the supported path. A key only raises the rate ceiling. */
function credentials(): Record<string, string> {
  const out: Record<string, string> = { tool: TOOL };
  const email = process.env.NCBI_CONTACT_EMAIL;
  const key = process.env.NCBI_API_KEY;
  if (email) out.email = email;
  if (key) out.api_key = key;
  return out;
}

/**
 * NCBI's keyless ceiling is 3 requests/second, and exceeding it earns a 429
 * and eventually a block — so the ceiling is enforced here rather than hoped
 * for. Serialised through one promise chain: concurrent callers queue instead
 * of racing, which matters because a single findPapers() is already two
 * requests and a chat turn may fan out several.
 */
const MIN_INTERVAL_MS = 350;
let chain: Promise<unknown> = Promise.resolve();
let lastAt = 0;

function throttled<T>(run: () => Promise<T>): Promise<T> {
  const next = chain.then(async () => {
    const wait = MIN_INTERVAL_MS - (Date.now() - lastAt);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastAt = Date.now();
    return run();
  });
  // The queue must survive a failed link, or one network error stalls every
  // later caller behind it forever.
  chain = next.catch(() => undefined);
  return next;
}

/** A paper, reduced to what a citation and a ranking actually need. */
export type Paper = {
  pmid: string;
  title: string;
  /** Section labels are kept inline ("RESULTS: ..."), because a finding read
   *  without knowing it came from the methods section is a misreading. */
  abstract: string;
  journal: string;
  year: number | null;
  doi: string | null;
  /** Canonical, resolvable, and the thing a doctor will click. */
  url: string;
  /** "Meta-Analysis", "Randomized Controlled Trial", "Review", ... — the raw
   *  material for evidence-quality ranking, which happens elsewhere. */
  publicationTypes: string[];
};

export type SearchOptions = {
  /** How many PMIDs to bring back. Bounded because efetch takes them all. */
  limit?: number;
  signal?: AbortSignal;
};

const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 50;
/** A slow NCBI must not hold a chat turn open. Failing fast beats hanging. */
const TIMEOUT_MS = 8_000;

function url(path: string, params: Record<string, string>): string {
  const q = new URLSearchParams({ ...credentials(), ...params });
  return `${EUTILS}/${path}?${q}`;
}

/**
 * One fetch, with a timeout, that never throws. The whole evidence path is
 * an enhancement to an answer the product can already give — recall.ts makes
 * the same call and says so — so a PubMed outage must degrade the answer,
 * not fail the request.
 */
async function get(target: string, signal?: AbortSignal): Promise<string | null> {
  try {
    const timeout = AbortSignal.timeout(TIMEOUT_MS);
    const res = await fetch(target, {
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      headers: { accept: "application/json, text/xml" },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/**
 * Term → PMIDs, most relevant first.
 *
 * Sorted by relevance rather than date: the newest paper on a question is
 * routinely a case report, and the answer usually wants the trial or the
 * meta-analysis. Date-weighting is a ranking decision, and ranking is
 * retrieve.ts's job, not this file's.
 */
export async function searchPubMed(query: string, opts: SearchOptions = {}): Promise<string[]> {
  const term = query.trim();
  if (!term) return [];
  const retmax = Math.min(Math.max(opts.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);

  const body = await throttled(() =>
    get(url("esearch.fcgi", { db: "pubmed", term, retmode: "json", retmax: String(retmax), sort: "relevance" }), opts.signal),
  );
  if (!body) return [];

  try {
    const json = JSON.parse(body) as { esearchresult?: { idlist?: unknown } };
    const ids = json.esearchresult?.idlist;
    if (!Array.isArray(ids)) return [];
    // NCBI has been known to return the string "0" in an empty idlist.
    return ids.filter((id): id is string => typeof id === "string" && /^\d+$/.test(id) && id !== "0");
  } catch {
    return [];
  }
}

/** PMIDs → papers, in the order asked for. One request for the whole batch. */
export async function fetchPapers(pmids: string[], opts: { signal?: AbortSignal } = {}): Promise<Paper[]> {
  const ids = pmids.filter((id) => /^\d+$/.test(id)).slice(0, MAX_LIMIT);
  if (!ids.length) return [];

  const xml = await throttled(() =>
    get(url("efetch.fcgi", { db: "pubmed", id: ids.join(","), retmode: "xml" }), opts.signal),
  );
  if (!xml) return [];

  const byId = new Map(parseArticles(xml).map((p) => [p.pmid, p]));
  // efetch does not guarantee request order, and relevance order is the only
  // ranking signal this file has. Restore it explicitly.
  return ids.map((id) => byId.get(id)).filter((p): p is Paper => p !== undefined);
}

/** The convenience path: a question in, cited papers out. */
export async function findPapers(query: string, opts: SearchOptions = {}): Promise<Paper[]> {
  const ids = await searchPubMed(query, opts);
  if (!ids.length) return [];
  return fetchPapers(ids, { signal: opts.signal });
}

// ------------------------------------------------------------
// XML extraction
//
// Each helper is scoped to one <PubmedArticle> block and returns a null or an
// empty rather than throwing, so a missing or restructured field costs that
// field and nothing else.
// ------------------------------------------------------------

function parseArticles(xml: string): Paper[] {
  const blocks = xml.split("<PubmedArticle>").slice(1);
  const out: Paper[] = [];
  for (const block of blocks) {
    const pmid = first(block, /<PMID[^>]*>(\d+)<\/PMID>/);
    // Without an identifier there is no citation, so there is no paper.
    if (!pmid) continue;
    out.push({
      pmid,
      title: text(first(block, /<ArticleTitle[^>]*>([\s\S]*?)<\/ArticleTitle>/) ?? ""),
      abstract: abstractOf(block),
      journal: text(first(block, /<Title>([\s\S]*?)<\/Title>/) ?? ""),
      year: yearOf(block),
      doi: first(block, /<ArticleId IdType="doi">([\s\S]*?)<\/ArticleId>/)?.trim() ?? null,
      url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
      publicationTypes: all(block, /<PublicationType[^>]*>([\s\S]*?)<\/PublicationType>/g).map(text),
    });
  }
  return out;
}

function first(source: string, re: RegExp): string | null {
  return source.match(re)?.[1] ?? null;
}

function all(source: string, re: RegExp): string[] {
  return [...source.matchAll(re)].map((m) => m[1]);
}

/**
 * Structured abstracts arrive as several labelled <AbstractText> elements.
 * Flattening them loses which section a sentence came from — "no effect" in
 * CONCLUSIONS and "no effect" in METHODS mean different things — so the label
 * is kept as a prefix.
 */
function abstractOf(block: string): string {
  const parts = [...block.matchAll(/<AbstractText([^>]*)>([\s\S]*?)<\/AbstractText>/g)].map((m) => {
    const label = m[1].match(/Label="([^"]*)"/)?.[1];
    const body = text(m[2]);
    if (!body) return "";
    return label ? `${label}: ${body}` : body;
  });
  return parts.filter(Boolean).join("\n\n");
}

/**
 * <PubDate> is <Year> for most records and <MedlineDate>2019 Nov-Dec</> for
 * the rest. Both reduce to the four-digit year, which is all a citation and a
 * recency filter need.
 */
function yearOf(block: string): number | null {
  const pub = first(block, /<PubDate>([\s\S]*?)<\/PubDate>/);
  const year = pub?.match(/\b(1[89]\d{2}|20\d{2})\b/)?.[1];
  return year ? Number(year) : null;
}

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
};

/**
 * Titles and abstracts carry inline markup (<i>, <sup>, <b>) and XML
 * entities. Both are stripped: the consumer is a prompt and a citation line,
 * neither of which renders HTML, and a stray tag in a prompt is one more
 * thing a model can misread.
 */
function text(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, "")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => safeCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, name: string) => ENTITIES[name.toLowerCase()] ?? m)
    .replace(/\s+/g, " ")
    .trim();
}

/** A malformed entity must not take the parse down with a RangeError. */
function safeCodePoint(n: number): string {
  try {
    return String.fromCodePoint(n);
  } catch {
    return "";
  }
}
