import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { WorkspaceStore, projectFiles } from "../src/workspace.mjs";
import { PaperLibrary, readPickedPdf } from "../src/papers.mjs";
import { runPdfReader } from "../src/pdf-reader.mjs";
import { fetchPmcPaper, parsePmcResponse } from "../src/pmc.mjs";
import { parsePaperCitation, paperCitation } from "../src/paper-schema.mjs";
import { samplePaperPages, textPdf } from "../scripts/pdf-fixtures.mjs";

const native = process.platform === "darwin", data = () => textPdf(samplePaperPages), sha = (v) => createHash("sha256").update(v).digest("hex");
const fakeBioC = (license = "CC BY", pmcid = "PMC12345") => Buffer.from(JSON.stringify([{ documents: [{ infons: { license }, passages: [
  { infons: { section_type: "TITLE", "article-id_pmc": pmcid, license: "Fictional fixture with a declared licence for software tests.", name_0: "Synthetic author" }, text: "Fictional PMC software-test source" },
  { infons: { section_type: "METHODS" }, text: "These measurements are invented and support no biological conclusion." },
] }] }]));
async function setup(t) { const base = await fs.mkdtemp(path.join(os.tmpdir(), "nutritiscan-paper-test-")); const root = path.join(base, "project"); await fs.mkdir(root); const store = new WorkspaceStore(path.join(base, "state")); await store.load(); await store.addProject(root); t.after(async () => { await store.queue.catch(() => {}); await fs.rm(base, { recursive: true, force: true }); }); return { root, store, library: new PaperLibrary(store) }; }

test("native PDF extraction preserves actual physical pages and labels missing text without OCR", { skip: !native }, async () => {
  const extracted = await runPdfReader(data());
  assert.equal(extracted.sections.length, 3); assert.match(extracted.sections[1].text, /mean signal was 5 in model_A and 12 in model_B/);
  assert.equal(extracted.sections[1].page, 2); assert.equal(extracted.sections[2].status, "no-text"); assert.equal(extracted.sections[2].text, "");
  const blank = await runPdfReader(textPdf([[]])); assert.equal(blank.sections[0].status, "no-text");
  const preview = await runPdfReader(data(), "preview", 2); assert.ok(Buffer.from(preview.image, "base64").subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])));
});
test("invalid, oversized, interrupted and slow PDF jobs cannot return successful partial text", { skip: !native }, async (t) => {
  assert.throws(() => runPdfReader(Buffer.from("not a PDF")), /Choose a PDF/);
  await assert.rejects(runPdfReader(Buffer.from("%PDF-broken")), /damaged|unsupported/);
  await assert.rejects(runPdfReader(textPdf(Array.from({ length: 81 }, () => []))), /1–80/);
  const abort = new AbortController(); abort.abort(); assert.throws(() => runPdfReader(data(), "extract", null, abort.signal));
  const { root } = await setup(t), executable = path.join(root, "slow-reader"); await fs.writeFile(executable, "#!/bin/sh\nexec /bin/sleep 10\n", { mode: 0o700 });
  await assert.rejects(runPdfReader(data(), "extract", null, new AbortController().signal, { executable, timeoutMs: 30 }), /time limit/);
});
test("PDF import → original and extraction fingerprints → right-page quote → reopen preserves provenance", { skip: !native }, async (t) => {
  const { root, store, library } = await setup(t); await fs.writeFile(path.join(root, "paper.pdf"), data());
  const imported = await library.importPdf({ path: "paper.pdf" }); const ref = imported.paper;
  assert.equal(ref.sourceSha256, sha(data())); assert.equal(ref.sectionCount, 3); assert.equal(ref.readableCount, 2);
  assert.ok((await projectFiles(root)).files.some((f) => f.path === "paper.pdf"));
  assert.deepEqual(await fs.readFile(path.join(root, ref.originalPath)), data());
  const inspected = await library.inspect(ref.id); assert.equal(inspected.sections[2].status, "no-text"); assert.equal(inspected.sections[1].characters > 0, true); assert.equal(inspected.sections[1].text, undefined);
  const passage = await library.read(ref.id, "p2"), quote = "The mean signal was 5 in model_A and 12 in model_B.";
  const claim = { paperId: ref.id, sectionId: "p2", contentSha256: ref.contentSha256, quote, claim: "Fictional grouped means were recorded." };
  assert.equal((await library.verify([claim])).checks[0].status, "quote-found");
  assert.equal((await library.verify([{ ...claim, sectionId: "p1" }])).checks[0].status, "withheld");
  assert.equal((await library.verify([{ ...claim, contentSha256: "0".repeat(64) }])).checks[0].status, "withheld");
  assert.equal((await library.verify([{ ...claim, quote: "A fabricated result that is absent from this paper." }])).checks[0].status, "withheld");
  const search = await library.search(ref.id, "MEAN signal"); assert.equal(search.matchingSections, 1); assert.equal(search.matches[0].sectionId, "p2");
  assert.equal(passage.citationUrl, paperCitation(ref.id, "p2"));
  const again = await library.importPdf({ path: "paper.pdf" }); assert.equal(again.reused, true); assert.equal(store.project().papers.length, 1);
  const restored = new WorkspaceStore(store.directory); await restored.load(); assert.equal((await new PaperLibrary(restored).read(ref.id, "p2")).text, passage.text);
});
test("changed originals and changed extracted snapshots invalidate passage verification", { skip: !native }, async (t) => {
  const { root, library } = await setup(t); const { paper } = await library.importPdf({ data: data(), name: "fixture.pdf" });
  const claim = { paperId: paper.id, sectionId: "p2", contentSha256: paper.contentSha256, quote: "The mean signal was 5 in model_A and 12 in model_B.", claim: "Synthetic means." };
  await fs.appendFile(path.join(root, paper.originalPath), "changed"); assert.equal((await library.verify([claim])).checks[0].status, "withheld");
  await fs.writeFile(path.join(root, paper.originalPath), data());
  await fs.appendFile(path.join(root, paper.snapshotPath), " "); await assert.rejects(library.read(paper.id, "p2"), /snapshot changed/);
});
test("paper access is project scoped and import refuses path traversal, symlinks and library redirects", { skip: !native }, async (t) => {
  const { root, store, library } = await setup(t); await fs.writeFile(path.join(root, "source.pdf"), data());
  await assert.rejects(library.importPdf({ path: "../source.pdf" }), /excluded/);
  await fs.symlink(path.join(root, "source.pdf"), path.join(root, "link.pdf")); await assert.rejects(library.importPdf({ path: "link.pdf" }), /Symbolic/);
  await assert.rejects(readPickedPdf(path.join(root, "link.pdf")));
  const { paper } = await library.importPdf({ path: "source.pdf" });
  const other = path.join(root, "other"); await fs.mkdir(other); await store.addProject(other); await assert.rejects(library.read(paper.id, "p1"), /active project/);
  await fs.symlink(path.join(root, "papers"), path.join(other, "papers")); await assert.rejects(library.importPdf({ data: data(), name: "test.pdf" }), /symbolic links/);
});
test("interrupted or failed imports leave no paper index or successful-looking extraction", async (t) => {
  const { root, store } = await setup(t), abort = new AbortController();
  const library = new PaperLibrary(store, { reader: async () => { abort.abort(); return { title: "Synthetic", author: "", engine: "synthetic", sections: [] }; } });
  await assert.rejects(library.importPdf({ data: data(), name: "test.pdf" }, abort.signal));
  assert.equal(store.project().papers?.length ?? 0, 0); assert.ok(!(await fs.readdir(root)).includes("papers"));
});
test("PMC records require matching IDs and supported recorded licences; passage IDs are never PDF pages", () => {
  const doc = parsePmcResponse(fakeBioC(), "PMC12345"); assert.equal(doc.source.license.label, "CC BY"); assert.equal(doc.sections[1].page, null); assert.equal(doc.sections[1].id, "s2");
  assert.equal(doc.source.sha256, sha(fakeBioC())); assert.equal(doc.author, "Synthetic author");
  for (const license of ["CC BY-NC", "CC BY-ND", "unknown", ""]) assert.throws(() => parsePmcResponse(fakeBioC(license), "PMC12345"), /licence/);
  assert.throws(() => parsePmcResponse(fakeBioC(), "PMC98765"), /identifier/);
  assert.throws(() => parsePmcResponse(Buffer.from("<error>Unavailable</error>"), "PMC12345"), /unavailable/);
});
test("PMC retrieval uses a fixed official endpoint, bounds responses and preserves the original BioC", async (t) => {
  let requested;
  const fetcher = async (url, options) => { requested = { url, options }; return new Response(fakeBioC()); };
  const fetched = await fetchPmcPaper("pmc12345", undefined, fetcher);
  assert.equal(requested.url, "https://www.ncbi.nlm.nih.gov/research/bionlp/RESTful/pmcoa.cgi/BioC_json/PMC12345/unicode"); assert.equal(requested.options.redirect, "error");
  assert.deepEqual(fetched.raw, fakeBioC());
  await assert.rejects(fetchPmcPaper("https://example.com", undefined, fetcher));
  await assert.rejects(fetchPmcPaper("PMC12345", undefined, async () => new Response("unavailable", { status: 404 })), /unavailable/);
  await assert.rejects(fetchPmcPaper("PMC12345", undefined, async () => new Response(Buffer.alloc(2_000_001))), /2 MB/);
  const { root, store } = await setup(t), library = new PaperLibrary(store, { fetchPmc: async () => fetched });
  const { paper } = await library.importPmc("PMC12345"); assert.equal(paper.license, "CC BY"); assert.equal(paper.kind, "pmc-fulltext");
  assert.deepEqual(await fs.readFile(path.join(root, paper.originalPath)), fakeBioC());
  assert.equal((await library.read(paper.id, "s2")).page, null);
});
test("internal paper links accept only project UUIDs and exact passage locators", () => {
  const id = "2a43b9c0-a313-4d68-ad45-015007454e0e";
  assert.deepEqual(parsePaperCitation(paperCitation(id, "p2")), { paperId: id, sectionId: "p2" });
  for (const link of [`nutritiscan://paper/${id}/../p2`, `nutritiscan://paper/${id}/p2?url=https://example.com`, "javascript:alert(1)", "file:///etc/passwd", "nutritiscan://other/path"]) assert.equal(parsePaperCitation(link), null);
});
test("PMC rate limits preserve prior papers and enforce Retry-After without automatic retry loops", async (t) => {
  const { store } = await setup(t); let calls = 0;
  const library = new PaperLibrary(store, { fetchPmc: (id, signal) => fetchPmcPaper(id, signal, async () => { calls++; return new Response("rate limit", { status: 429, headers: { "Retry-After": "120" } }); }) });
  await assert.rejects(library.importPmc("PMC12345"), /Retry after 120 seconds/);
  await assert.rejects(library.importPmc("PMC12345"), /Wait \d+ seconds/);
  assert.equal(calls, 1); assert.equal(store.project().papers?.length ?? 0, 0);
});
