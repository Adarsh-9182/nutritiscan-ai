import fs from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { PaperDocument, PaperReference, PaperClaims, paperCitation } from "./paper-schema.mjs";
import { safeProjectFile } from "./workspace.mjs";
import { runPdfReader } from "./pdf-reader.mjs";
import { fetchPmcPaper } from "./pmc.mjs";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const contentHash = (doc) => hash(JSON.stringify(doc.sections));
const normalized = (text) => text.replace(/\s+/g, " ").trim();

// Only called with a path returned by Electron's native picker, never model input.
export async function readPickedPdf(filename) {
  if (path.extname(filename).toLowerCase() !== ".pdf") throw new Error("Choose a PDF file.");
  const handle = await fs.open(filename, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.size > 20_000_000) throw new Error("Choose a regular PDF smaller than 20 MB.");
    const buffer = Buffer.alloc(20_000_001); let length = 0;
    while (length < buffer.length) { const read = await handle.read(buffer, length, buffer.length - length, length); if (!read.bytesRead) break; length += read.bytesRead; }
    const after = await handle.stat();
    if (length > 20_000_000 || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) throw new Error("The PDF changed while being read or exceeds 20 MB. Try a stable copy.");
    return buffer.subarray(0, length);
  } finally { await handle.close(); }
}

export class PaperLibrary {
  constructor(store, { reader = runPdfReader, fetchPmc = fetchPmcPaper } = {}) { this.store = store; this.reader = reader; this.fetchPmc = fetchPmc; this.busy = false; this.nextPmcAt = 0; }
  project() { const p = this.store.project(); if (!p) throw new Error("Open a research project first."); return p; }
  reference(id) { const ref = this.project().papers?.find((paper) => paper.id === id); if (!ref) throw new Error("This paper does not belong to the active project."); return ref; }
  async importing(operation) {
    if (this.busy) throw new Error("Another paper import is still running. Wait or stop it before importing again.");
    this.busy = true; try { return await operation(); } finally { this.busy = false; }
  }
  async importPdf({ path: relative, data, name }, signal = new AbortController().signal) {
    return this.importing(async () => {
      const project = this.project();
      if (relative) { const source = await safeProjectFile(project.path, relative, { pdf: true }); data = source.data; name = path.basename(relative); }
      signal.throwIfAborted();
      if (!Buffer.isBuffer(data)) throw new Error("Choose an existing PDF.");
      const existing = project.papers?.find((p) => p.kind === "local-pdf" && p.sourceSha256 === hash(data));
      if (existing) { await this.document(existing.id); return { paper: existing, reused: true }; }
      const extracted = await this.reader(data, "extract", null, signal);
      signal.throwIfAborted();
      const fileName = (name || "Untitled PDF").replace(/[\x00-\x1f\x7f]/g, "").slice(0, 255);
      const document = PaperDocument.parse({ format: "nutritiscan-paper", version: 1, kind: "local-pdf", title: extracted.title.trim() || fileName, author: extracted.author, engine: extracted.engine,
        source: { sha256: hash(data), bytes: data.length, originalName: fileName, pmcid: null, url: null, license: null }, sections: extracted.sections,
        limitations: ["Local PDF text extracted with Apple's PDFKit. Reading order, tables, equations, figures and text-layer accuracy require comparison with the original page.", "Pages with no text layer are retained and labelled. OCR and image interpretation are not available; no missing text is invented.", "PDF page numbers are physical page positions, not printed journal page labels. Authorship, authenticity, rights and retraction status have not been independently checked.", "Requested passages go to the model provider during an agent turn; importing and previewing alone use local processing."] });
      return this.save(project, document, data, signal);
    });
  }
  async importPmc(id, signal = new AbortController().signal) {
    return this.importing(async () => {
      const project = this.project();
      if (Date.now() < this.nextPmcAt) throw new Error(`Wait ${Math.ceil((this.nextPmcAt - Date.now()) / 1000)} seconds before another PMC request. Existing papers are preserved.`);
      this.nextPmcAt = Date.now() + 1500;
      let fetched;
      try { fetched = await this.fetchPmc(id, signal); }
      catch (error) { if (Number.isFinite(error.retryAfterMs)) this.nextPmcAt = Date.now() + Math.max(30_000, error.retryAfterMs); throw error; }
      const { document, raw } = fetched; signal.throwIfAborted();
      return this.save(project, PaperDocument.parse(document), raw, signal);
    });
  }
  async save(project, document, original, signal) {
    signal.throwIfAborted();
    if (this.store.project() !== project || this.store.pendingChange) throw new Error("The active project changed. Import the paper again.");
    project.papers ??= [];
    const duplicate = project.papers.find((p) => p.kind === document.kind && p.sourceSha256 === document.source.sha256);
    if (duplicate) { await this.document(duplicate.id); return { paper: duplicate, reused: true }; }
    if (project.papers.length >= 30) throw new Error("This project has thirty papers. Open another dedicated project; existing papers were preserved.");
    const id = randomUUID(), snapshot = JSON.stringify(document), originalPath = `papers/${id}.${document.kind === "local-pdf" ? "pdf" : "bioc.json"}`, snapshotPath = `papers/${id}.paper.json`;
    if (Buffer.byteLength(snapshot) > 2_000_000 || hash(original) !== document.source.sha256) throw new Error("The paper snapshot exceeds its limit or does not match its original source. Nothing was imported.");
    const root = await fs.realpath(project.path); if ((await fs.lstat(project.path)).isSymbolicLink()) throw new Error("Project folders cannot be symbolic links.");
    const folder = path.join(root, "papers"); await fs.mkdir(folder, { recursive: true, mode: 0o700 });
    if ((await fs.lstat(folder)).isSymbolicLink()) throw new Error("Paper folders cannot be symbolic links.");
    const created = []; let ref;
    try {
      for (const [relative, bytes] of [[originalPath, original], [snapshotPath, snapshot]]) { signal.throwIfAborted(); await fs.writeFile(path.join(root, relative), bytes, { flag: "wx", mode: 0o600 }); created.push(relative); }
      signal.throwIfAborted();
      if (this.store.project() !== project || this.store.pendingChange) throw new Error("The active project changed. Nothing was added to its library.");
      ref = PaperReference.parse({ id, kind: document.kind, title: document.title, importedAt: new Date().toISOString(), contentSha256: contentHash(document), snapshotSha256: hash(snapshot), sourceSha256: document.source.sha256, snapshotPath, originalPath,
        sectionCount: document.sections.length, readableCount: document.sections.filter((s) => s.status === "readable").length, pmcid: document.source.pmcid, url: document.source.url, license: document.source.license?.label ?? null });
      project.papers.push(ref); await this.store.persist();
      return { paper: ref, reused: false, notice: ref.readableCount ? "Paper imported. Inspect its sections before making claims." : "PDF retained, but no readable text layer was found. OCR is not available." };
    } catch (error) { if (ref) project.papers = project.papers.filter((p) => p.id !== ref.id); for (const relative of created) await fs.unlink(path.join(root, relative)).catch(() => {}); throw error; }
  }
  async document(id, signal = new AbortController().signal) {
    const p = this.project(), ref = this.reference(id), snapshot = await safeProjectFile(p.path, ref.snapshotPath); signal.throwIfAborted();
    if (snapshot.sha256 !== ref.snapshotSha256) throw new Error("The saved paper snapshot changed. Restore the original snapshot or import a fresh copy; its passages cannot be verified.");
    const doc = PaperDocument.parse(JSON.parse(snapshot.text));
    const source = await safeProjectFile(p.path, ref.originalPath, { pdf: ref.kind === "local-pdf" }); signal.throwIfAborted();
    if (this.store.project() !== p || contentHash(doc) !== ref.contentSha256 || source.sha256 !== ref.sourceSha256 || doc.source.sha256 !== ref.sourceSha256) throw new Error("The paper's source or extracted content changed. Import a new version before verifying passages.");
    return { paper: ref, document: doc, ...(ref.kind === "local-pdf" ? { pdf: source.data } : {}) };
  }
  async inspect(id, signal) {
    const { paper, document: doc } = await this.document(id, signal);
    return { paper, author: doc.author, engine: doc.engine, source: doc.source, sections: doc.sections.map(({ text, ...section }) => ({ ...section, characters: text.length })), limitations: doc.limitations };
  }
  async read(id, sectionId, signal) {
    const { paper, document: doc } = await this.document(id, signal), section = doc.sections.find((s) => s.id === sectionId);
    if (!section) throw new Error("This section does not exist in the paper. Inspect its section index first.");
    return { paperId: id, title: paper.title, contentSha256: paper.contentSha256, sourceSha256: paper.sourceSha256, source: doc.source, ...section, citationUrl: paperCitation(id, sectionId), limitations: doc.limitations };
  }
  async search(id, query, signal) {
    if (typeof query !== "string" || query.trim().length < 3 || query.length > 200) throw new Error("Use 3–200 characters to search this paper.");
    const { paper, document: doc } = await this.document(id, signal), target = normalized(query).toLowerCase();
    const matches = [];
    for (const section of doc.sections) { const text = normalized(section.text), position = text.toLowerCase().indexOf(target); if (position !== -1) matches.push({ sectionId: section.id, label: section.label, page: section.page, excerpt: text.slice(Math.max(0, position - 120), position + target.length + 350), citationUrl: paperCitation(id, section.id) }); }
    return { paperId: id, contentSha256: paper.contentSha256, query, matchingSections: matches.length, matches: matches.slice(0, 12), limited: matches.length > 12, notice: "Literal text search over the extracted snapshot, not an exhaustive semantic review." };
  }
  async preview(id, page, signal) {
    const { pdf, paper } = await this.document(id, signal);
    if (!pdf) throw new Error("PMC text uses passage identifiers; a PDF preview is not available for this source.");
    if (!Number.isInteger(page) || page < 1 || page > paper.sectionCount) throw new Error("Choose an existing PDF page.");
    const result = await this.reader(pdf, "preview", page, signal);
    return { image: `data:image/png;base64,${result.image}`, width: result.width, height: result.height, page: result.page };
  }
  async verify(value, signal = new AbortController().signal) {
    const claims = PaperClaims.parse(value), checks = [];
    for (const claim of claims) {
      signal.throwIfAborted(); let status = "withheld", reason;
      try {
        const passage = await this.read(claim.paperId, claim.sectionId, signal);
        if (passage.contentSha256 !== claim.contentSha256) reason = "The cited snapshot fingerprint does not match this paper version.";
        else if (!normalized(passage.text).includes(normalized(claim.quote))) reason = "The exact quotation was not found in this section. A passage from another page or section cannot support this locator.";
        else { status = "quote-found"; reason = "Exact passage found in the recorded section. This checks text membership only; interpretation, authenticity, corrections and scientific quality still need review."; }
      } catch (error) { signal.throwIfAborted(); reason = error.message.slice(0, 500); }
      checks.push({ ...claim, status, reason, checkedAt: new Date().toISOString(), citationUrl: paperCitation(claim.paperId, claim.sectionId) });
    }
    return { checks, limitation: "Quote checks do not establish claim entailment, scientific validity, novelty or clinical benefit." };
  }
}
