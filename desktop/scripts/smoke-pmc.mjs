// Explicit live public-source check. No model or clinical inference is used.
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import { WorkspaceStore } from "../src/workspace.mjs";
import { PaperLibrary } from "../src/papers.mjs";
const pmcid = process.argv.find((arg) => arg.startsWith("--pmc="))?.slice(6) || "PMC1790863";
const base = await fs.mkdtemp(path.join(os.tmpdir(), "nutritiscan-pmc-live-")), project = path.join(base, "project"); await fs.mkdir(project);
const store = new WorkspaceStore(path.join(base, "state")); await store.load(); await store.addProject(project);
try {
  const library = new PaperLibrary(store), { paper } = await library.importPmc(pmcid), inspected = await library.inspect(paper.id);
  assert.equal(paper.kind, "pmc-fulltext"); assert.equal(paper.pmcid, pmcid);
  const section = inspected.sections.find((s) => s.characters >= 120 && /METHODS|INTRO|ABSTRACT/.test(s.label)) ?? inspected.sections.find((s) => s.characters >= 120);
  assert.ok(section); const passage = await library.read(paper.id, section.id);
  assert.equal(passage.page, null);
  const checked = await library.verify([{ paperId: paper.id, sectionId: section.id, contentSha256: paper.contentSha256, quote: passage.text.slice(0, 120), claim: "Public-source connector functional check: this exact passage belongs to its recorded section." }]);
  assert.equal(checked.checks[0].status, "quote-found");
  const restored = new WorkspaceStore(store.directory); await restored.load(); assert.equal((await new PaperLibrary(restored).read(paper.id, section.id)).text, passage.text);
  const receipt = { passed: true, pmcid, title: paper.title, sourceUrl: paper.url, license: inspected.source.license, sections: paper.sectionCount, readableSections: paper.readableCount, sourceSha256: paper.sourceSha256, contentSha256: paper.contentSha256, checkedSection: section.id, quotationMembership: "passed", restart: "passed", modelCalls: 0, scientificValidation: false };
  const output = path.resolve("test-results/live-pmc"); await fs.mkdir(output, { recursive: true }); await fs.writeFile(path.join(output, "receipt.json"), JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify(receipt));
} finally { await store.queue.catch(() => {}); await fs.rm(base, { recursive: true, force: true }); }
