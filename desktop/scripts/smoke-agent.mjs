// Explicit live check: consumes a small amount of the user's existing ChatGPT plan.
// No API-key path, private data, paid fallback or physical experiment.
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import { WorkspaceStore } from "../src/workspace.mjs";
import { CodexBridge } from "../src/codex.mjs";
import { ResearchController } from "../src/controller.mjs";
import { searchLiterature } from "../src/literature.mjs";

const base = await fs.mkdtemp(path.join(os.tmpdir(), "nutritiscan-agent-qa-"));
const project = path.join(base, "synthetic-project"); await fs.mkdir(project);
await fs.copyFile("resources/instrument-readings.csv", path.join(project, "instrument-readings.csv"));
const store = new WorkspaceStore(path.join(base, "app-state")); await store.load(); await store.addProject(project, true);
const bridge = new CodexBridge(), controller = new ResearchController(store, bridge, searchLiterature);
const literature = process.argv.includes("--literature");
let stage = "connect"; const started = Date.now();
try {
  const state = await bridge.connect(); assert.equal(state.auth.connected, true);
  const model = state.models.find((m) => m.isDefault)?.model ?? state.models[0]?.model; assert.ok(model);
  stage = "synthetic-agent-task";
  const prompt = literature ? "Search PubMed for human studies on exercise and blood pressure in older adults. Read the available abstracts. State one narrow study-description finding, with the exact retrieved source ID and an exact supporting passage. Call verify_evidence for that claim. Save qa-analysis.md with that finding, quote, original source URL and limitations, then update_project_memory. This is a functional literature test, not medical advice or scientific validation. Avoid treatment recommendations. Keep the response concise." : "This is a synthetic software QA task, not a real biological experiment. Use project_context to inspect the project, then profile_dataset on instrument-readings.csv. Report its row count, signal_au mean, missingness and limits. Use save_artifact to save qa-analysis.md with those descriptive results and a clear synthetic-data disclaimer. Use update_project_memory to save a short handoff. Do not search literature for this task and do not claim any disease or treatment effect.";
  await controller.run(prompt, model);
  const deadline = Date.now() + 180_000;
  while (controller.current && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 500));
  if (controller.current) await controller.stop();
  const session = store.session(); assert.equal(session.status, "completed", controller.issue || "Provider did not complete the task.");
  for (const tool of (literature ? ["search_literature", "verify_evidence", "save_artifact", "update_project_memory"] : ["project_context", "profile_dataset", "save_artifact", "update_project_memory"])) assert.ok(session.activities.some((a) => a.name === tool && a.status === "completed"), `${tool} did not complete`);
  const report = await fs.readFile(path.join(project, "artifacts/qa-analysis.md"), "utf8"); if (literature) { assert.ok(session.sources.length > 0); assert.ok(session.checks.some((c) => c.status === "quote-found")); } else { assert.match(report, /107\.83/); assert.match(report, /synthetic|fictional/i); } assert.ok(store.project().memory.length > 0);
  const output = path.resolve(literature ? "test-results/live-literature" : "test-results/live-agent"); await fs.mkdir(output, { recursive: true }); await fs.copyFile(path.join(project, "artifacts/qa-analysis.md"), path.join(output, literature ? "literature-analysis.md" : "synthetic-analysis.md"));
  console.log(JSON.stringify({ passed: true, authenticatedWith: "managed-chatgpt", model, completedTools: session.activities.filter((a) => a.status === "completed").map((a) => a.name), durationMs: Date.now() - started, sources: session.sources.length, exactPassagesFound: session.checks.filter((c) => c.status === "quote-found").length, artifact: path.relative(process.cwd(), output), paidApiFallback: false }));
} catch (error) { console.error(JSON.stringify({ passed: false, stage, error: error.message })); process.exitCode = 1; }
finally { controller.finish("interrupted"); clearTimeout(controller.saveTimer); bridge.close(); await store.queue.catch(() => {}); await fs.rm(base, { recursive: true, force: true }); }
