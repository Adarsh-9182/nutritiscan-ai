import { createHash } from "node:crypto";
import { z } from "zod";
import { PaperDocument } from "./paper-schema.mjs";
import packageInfo from "../package.json" with { type: "json" };

const infons = z.record(z.string(), z.string());
const BioC = z.array(z.object({ documents: z.array(z.object({ infons: infons.default({}), passages: z.array(z.object({ infons: infons.default({}), text: z.string().max(40000) })).min(1).max(500) })).length(1) })).length(1);
export const PmcId = z.string().trim().toUpperCase().regex(/^PMC[1-9]\d{0,8}$/, "Enter a PMC ID such as PMC1790863.");

export function parsePmcResponse(raw, requestedId) {
  const pmcid = PmcId.parse(requestedId);
  let result;
  try { result = BioC.parse(JSON.parse(raw.toString("utf8")))[0].documents[0]; }
  catch { throw new Error("PMC did not return a supported full-text BioC record. The article may be unavailable through the open-access service."); }
  const front = result.passages.find((p) => p.infons.section_type === "TITLE" || p.infons.type === "front");
  if (!front || front.infons["article-id_pmc"] !== pmcid) throw new Error("The returned PMC identifier did not match the requested article. Nothing was imported.");
  const license = result.infons.license?.trim();
  if (!license || !/^(?:CC[ -]?BY(?:[ -]?\d(?:\.\d)?)?|CC0(?:[ -]?\d(?:\.\d)?)?)$/i.test(license)) throw new Error("Automatic PMC import supports clearly labelled CC BY or CC0 articles. This article has another or unknown licence; use an authorised local copy where permitted.");
  const authors = Object.entries(front.infons).filter(([key]) => /^name_\d+$/.test(key)).map(([, name]) => name).join("; ");
  const document = PaperDocument.parse({
    format: "nutritiscan-paper", version: 1, kind: "pmc-fulltext", title: front.text.trim(), author: authors.slice(0, 2000), engine: "pmc-bioc-v1",
    source: { sha256: createHash("sha256").update(raw).digest("hex"), bytes: raw.length, originalName: null, pmcid, url: `https://pmc.ncbi.nlm.nih.gov/articles/${pmcid}/`, license: { label: license, text: front.infons.license ?? "" } },
    sections: result.passages.map((passage, index) => ({ id: `s${index + 1}`, label: `Passage ${index + 1} · ${(passage.infons.section_type ?? passage.infons.type ?? "TEXT").slice(0, 160)}`, page: null, text: passage.text, status: passage.text.trim() ? "readable" : "no-text" })),
    limitations: ["Full text from the official PMC BioC open-access service; completeness, corrections and retraction status require researcher review.", "BioC passages have section identifiers, not PDF or journal page numbers. Figures, table layout, supplements and image-only content are not interpreted.", "A matching quotation establishes text membership, not support for an interpretation, study quality, a mechanism or treatment benefit.", "The recorded article licence and attribution must be preserved. Other sources and non-open full text have not been retrieved."],
  });
  return document;
}

export async function fetchPmcPaper(id, signal = new AbortController().signal, fetcher = fetch) {
  const pmcid = PmcId.parse(id), budget = AbortSignal.any([signal, AbortSignal.timeout(25_000)]);
  const url = `https://www.ncbi.nlm.nih.gov/research/bionlp/RESTful/pmcoa.cgi/BioC_json/${pmcid}/unicode`;
  const response = await fetcher(url, { signal: budget, redirect: "error", headers: { Accept: "application/json", "User-Agent": `NutritiScan/${packageInfo.version} (local research workspace; https://www.nutritiscan.com)` } });
  if (!response.ok || !response.body) {
    await response.body?.cancel().catch(() => {});
    if (response.status === 429 || response.status === 503) {
      const header = response.headers.get("retry-after"), seconds = header && /^\d+$/.test(header) ? Number(header) : header ? Math.ceil((Date.parse(header) - Date.now()) / 1000) : 30;
      const retryAfterMs = Math.max(30_000, Math.min(86_400_000, (Number.isFinite(seconds) ? seconds : 30) * 1000));
      const error = new Error(`PMC is temporarily ${response.status === 429 ? "rate-limiting requests" : "unavailable"}. Retry after ${Math.ceil(retryAfterMs / 1000)} seconds. Existing papers were preserved; no article was imported.`);
      error.retryAfterMs = retryAfterMs; throw error;
    }
    throw new Error(`PMC full text is unavailable (${response.status}). No article was imported.`);
  }
  const chunks = []; let bytes = 0;
  try {
    for await (const chunk of response.body) { budget.throwIfAborted(); bytes += chunk.length; if (bytes > 2_000_000) throw new Error("PMC response exceeds 2 MB. No text was silently truncated or imported."); chunks.push(chunk); }
  } catch (error) { await response.body.cancel?.().catch(() => {}); throw error; }
  budget.throwIfAborted();
  const raw = Buffer.concat(chunks);
  return { document: parsePmcResponse(raw, pmcid), raw };
}
