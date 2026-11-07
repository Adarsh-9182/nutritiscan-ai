// Explicit live agent functional check; the document is fictional test data.
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import { WorkspaceStore } from "../src/workspace.mjs";
import { CodexBridge } from "../src/codex.mjs";
import { ResearchController } from "../src/controller.mjs";
import { searchLiterature } from "../src/literature.mjs";
const base = await fs.mkdtemp(path.join(os.tmpdir(), "nutritiscan-paper-agent-")), project = path.join(base, "fictional-project"); await fs.mkdir(project);
await fs.copyFile("resources/sample-paper.pdf", path.join(project, "sample-paper.pdf"));
const store = new WorkspaceStore(path.join(base, "state")); await store.load(); await store.addProject(project, true);
const bridge = new CodexBridge(), controller = new ResearchController(store, bridge, searchLiterature); let stage = "connect"; const started = Date.now();
try {
  const connection = await bridge.connect(); assert.equal(connection.auth.connected, true); const model = connection.models.find((m) => m.isDefault)?.model ?? connection.models[0]?.model;
  stage = "read-and-verify";
  await controller.run("This is a fictional software test. Inspect this project and import sample-paper.pdf with import_project_pdf. Inspect its section index and read page p2. Verify the exact quotation about the group means with verify_paper_passages, using the actual returned content fingerprint. Save paper-review.md with that recorded quotation, its returned clickable citationUrl, the original PDF SHA-256, and the explicit limits: fictional values, blank third page, no biological or treatment conclusion, quote matching is not scientific validation. Update the project handoff. Do not search outside the project or fetch public literature. Keep the final response concise and include the clickable passage citation.", model);
  const deadline = Date.now() + 210000;
  while (controller.current && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 350));
  if (controller.current) await controller.stop();
  assert.equal(store.session().status, "completed", controller.issue);
  const names = store.session().activities.filter((a) => a.status === "completed").map((a) => a.name);
  for (const name of ["import_project_pdf", "inspect_paper", "read_paper_section", "verify_paper_passages", "save_artifact", "update_project_memory"]) assert.ok(names.includes(name), `Missing completed ${name}`);
  const checks = store.session().paperChecks; assert.ok(checks.some((check) => check.sectionId === "p2" && check.status === "quote-found"));
  const paper = store.project().papers[0], report = await fs.readFile(path.join(project, "artifacts/paper-review.md"), "utf8");
  assert.ok(report.includes(paper.sourceSha256)); assert.ok(report.includes(`nutritiscan://paper/${paper.id}/p2`)); assert.match(report, /fictional|synthetic/i);
  assert.ok(store.session().messages.at(-1).text.includes(`nutritiscan://paper/${paper.id}/p2`));
  const output = path.resolve("test-results/live-paper-agent"); await fs.mkdir(output, { recursive: true });
  await fs.writeFile(path.join(output, "paper-review.md"), report); await fs.writeFile(path.join(output, "paper-checks.json"), JSON.stringify({ paper, checks, model, modelCalls: 1, data: "fictional software-test PDF" }, null, 2));
  console.log(JSON.stringify({ passed: true, model, durationMs: Date.now() - started, calls: names, sections: paper.sectionCount, readable: paper.readableCount, quoteChecks: checks.length, paidApiFallback: false, output }));
} catch (error) { console.error(JSON.stringify({ passed: false, stage, error: error.message })); process.exitCode = 1; }
finally { controller.finish("interrupted"); clearTimeout(controller.saveTimer); bridge.close(); await store.queue.catch(() => {}); await fs.rm(base, { recursive: true, force: true }); }
