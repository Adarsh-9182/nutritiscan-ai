// Explicit functional check using the owner's existing managed ChatGPT access.
// All input data are fictional; approval is simulated by this test harness.
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import { WorkspaceStore } from "../src/workspace.mjs";
import { CodexBridge } from "../src/codex.mjs";
import { ResearchController } from "../src/controller.mjs";
import { searchLiterature } from "../src/literature.mjs";

const base = await fs.mkdtemp(path.join(os.tmpdir(), "nutritiscan-analysis-agent-"));
const project = path.join(base, "synthetic-project"); await fs.mkdir(project);
await fs.copyFile("resources/synthetic-cohort.csv", path.join(project, "synthetic-cohort.csv"));
const store = new WorkspaceStore(path.join(base, "state")); await store.load(); await store.addProject(project, true);
const bridge = new CodexBridge(), controller = new ResearchController(store, bridge, searchLiterature);
const started = Date.now(); let stage = "connect";
async function completeTask(task, model) {
  await controller.run(task, model);
  const deadline = Date.now() + 180000;
  while (controller.current && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 350));
  if (controller.current) await controller.stop();
  assert.equal(store.session().status, "completed", controller.issue || "The provider did not complete this functional check.");
}
try {
  const state = await bridge.connect(); assert.equal(state.auth.connected, true);
  const model = state.models.find((entry) => entry.isDefault)?.model ?? state.models[0]?.model;
  stage = "agent-proposal";
  await completeTask("Synthetic software test, not real biological evidence. Inspect project_context and profile_dataset on synthetic-cohort.csv. Then use propose_analysis with exactly two operations: group-summary of signal_au by cohort, and correlation of signal_au with readout_au. Missing codes are [] (blanks only). Tell me approval is required in Analysis. Do not execute, save files or infer treatment effects. Keep your response concise.", model);
  const proposal = store.session().analyses?.at(-1); assert.ok(proposal, "The agent did not propose an analysis.");
  assert.equal(proposal.status, "pending"); assert.equal(proposal.result, null);
  assert.deepEqual(proposal.spec.operations, [{ type: "group-summary", value: "signal_au", group: "cohort" }, { type: "correlation", x: "signal_au", y: "readout_au" }]);
  stage = "simulated-researcher-approval";
  await controller.runAnalysis(proposal.id, proposal.source.sha256);
  assert.equal(proposal.status, "completed");
  assert.equal(proposal.result.results[0].groups[0].mean, 5);
  assert.ok(Math.abs(proposal.result.results[0].groups[1].mean - 12) < 1e-12);
  assert.ok(Math.abs(proposal.result.results[1].correlation - 1) < 1e-12);
  assert.equal(proposal.result.results[1].excludedMissing, 1);
  stage = "agent-result-inspection";
  await completeTask(`The synthetic test harness approved analysis ${proposal.id}. Use inspect_analysis for that ID. Report only its actual computed group means, Pearson coefficient, complete-pair count and missingness. Save qa-reproducibility.md describing the source hash, plan, exact recorded results and limitations; update_project_memory. Explicitly say these are synthetic test data and no disease/causal conclusion follows. Do not calculate or claim p-values or clinical efficacy.`, model);
  assert.ok(store.session().activities.some((entry) => entry.name === "inspect_analysis" && entry.status === "completed"));
  const report = await fs.readFile(path.join(project, "artifacts/qa-reproducibility.md"), "utf8");
  assert.match(report, /synthetic|fictional/i); assert.ok(report.includes(proposal.source.sha256));
  const output = path.resolve("test-results/live-analysis-agent"); await fs.mkdir(output, { recursive: true });
  await fs.copyFile(path.join(project, proposal.artifact), path.join(output, "analysis-receipt.json"));
  await fs.copyFile(path.join(project, "artifacts/qa-reproducibility.md"), path.join(output, "qa-reproducibility.md"));
  console.log(JSON.stringify({ passed: true, model, durationMs: Date.now() - started, approval: "simulated by synthetic test harness", calls: store.session().activities.filter((entry) => entry.status === "completed").map((entry) => entry.name), groupMeans: proposal.result.results[0].groups.map((group) => group.mean), correlation: proposal.result.results[1].correlation, completePairs: proposal.result.results[1].count, artifact: path.relative(process.cwd(), output), paidApiFallback: false }));
} catch (error) { console.error(JSON.stringify({ passed: false, stage, error: error.message })); process.exitCode = 1; }
finally { controller.finish("interrupted"); clearTimeout(controller.saveTimer); bridge.close(); await store.queue.catch(() => {}); await fs.rm(base, { recursive: true, force: true }); }
