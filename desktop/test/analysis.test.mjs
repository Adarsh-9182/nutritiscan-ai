import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { AnalysisSpec, executeAnalysis } from "../src/analysis.mjs";
import { WorkspaceStore } from "../src/workspace.mjs";

const spec = (operations, missingValues = []) => ({ title: "Synthetic descriptive analysis", question: "Check fictional measurements without a clinical conclusion.", path: "data.csv", missingValues, operations });
const data = "group,x,y\nA,1,2\nA,2,4\nB,3,6\nB,,8\n";
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} != ${expected}`);
test("grouped statistics preserve every row through explicit counted exclusions", async () => {
  const result = await executeAnalysis(spec([{ type: "group-summary", group: "group", value: "x" }, { type: "correlation", x: "x", y: "y" }]), data);
  const grouped = result.results[0]; assert.equal(result.rows, 4);
  assert.deepEqual(grouped.excluded, { missingGroup: 0, missingValue: 1 });
  assert.equal(grouped.groups[0].count, 2); near(grouped.groups[0].mean, 1.5); near(grouped.groups[0].sampleStdDev, Math.sqrt(.5));
  assert.equal(grouped.groups[1].count, 1); assert.equal(grouped.groups[1].missing, 1); assert.equal(grouped.groups[1].sampleStdDev, null);
  assert.equal(result.results[1].count, 3); assert.equal(result.results[1].excludedMissing, 1); near(result.results[1].correlation, 1);
});
test("missing codes are explicit and case sensitive; mixed numeric data is never silently dropped", async () => {
  const input = "g,x,y\nA,1,3\nA,NA,4\nA,3,9\nA,4,12\n";
  await assert.rejects(executeAnalysis(spec([{ type: "correlation", x: "x", y: "y" }]), input), /non-finite/);
  const result = await executeAnalysis(spec([{ type: "correlation", x: "x", y: "y" }], ["NA"]), input);
  assert.equal(result.results[0].count, 3); assert.equal(result.results[0].excludedMissing, 1);
  await assert.rejects(executeAnalysis(spec([{ type: "correlation", x: "x", y: "y" }], ["na"]), input), /non-finite/);
  // A nonnumeric observed value does not disappear because its partner is missing.
  await assert.rejects(executeAnalysis(spec([{ type: "correlation", x: "x", y: "y" }]), "x,y\ntext,\n1,2"), /non-finite/);
});
test("negative, constant and insufficient correlations have distinct correct results", async () => {
  const op = spec([{ type: "correlation", x: "x", y: "y" }]);
  near((await executeAnalysis(op, "x,y\n1,9\n2,6\n3,3")).results[0].correlation, -1);
  const constant = (await executeAnalysis(op, "x,y\n1,2\n1,3\n1,4")).results[0];
  assert.equal(constant.status, "constant-column"); assert.equal(constant.correlation, null);
  const short = (await executeAnalysis(op, "x,y\n1,2\n2,3")).results[0];
  assert.equal(short.status, "insufficient-data"); assert.equal(short.correlation, null);
});
test("normalization avoids intermediate overflow, and unrepresentable variance fails honestly", async () => {
  const group = spec([{ type: "group-summary", value: "x", group: "g" }]);
  const value = (await executeAnalysis(group, "g,x\nA,1e308\nA,-1e308")).results[0].groups[0];
  near(value.mean, 0); assert.ok(Number.isFinite(value.sampleStdDev));
  await assert.rejects(executeAnalysis(group, "g,x\nA,1.7e308\nA,-1.7e308"), /numeric range/);
  const correlation = (await executeAnalysis(spec([{ type: "correlation", x: "x", y: "y" }]), "x,y\n-1e308,-1e308\n0,0\n1e308,1e308")).results[0];
  near(correlation.correlation, 1);
});
test("blank groups, all-missing groups and duplicates are counted without imputation or deduplication", async () => {
  const result = await executeAnalysis(spec([{ type: "group-summary", value: "x", group: "g" }]), "g,x\nA,1\nA,1\nB,\n,2");
  assert.equal(result.duplicateRows, 1); assert.equal(result.results[0].excluded.missingGroup, 1);
  assert.equal(result.results[0].groups[0].count, 2); assert.equal(result.results[0].groups[1].mean, null);
});
test("bounded schema, group limits and cancellation prevent unsupported execution", async () => {
  assert.equal(AnalysisSpec.safeParse({ ...spec([{ type: "profile" }]), command: "untrusted shell" }).success, false);
  await assert.rejects(executeAnalysis(spec([{ type: "correlation", x: "x", y: "x" }]), data), /distinct/);
  await assert.rejects(executeAnalysis(spec([{ type: "group-summary", value: "unknown", group: "group" }]), data), /does not exist/);
  await assert.rejects(executeAnalysis(spec([{ type: "group-summary", value: "x", group: "g" }]), "g,x\n" + Array.from({ length: 41 }, (_, i) => `G${i},1`).join("\n")), /40 categories/);
  const abort = new AbortController(); abort.abort();
  await assert.rejects(executeAnalysis(spec([{ type: "profile" }]), data, abort.signal), /abort/i);
  const between = new AbortController(), pending = executeAnalysis(spec([{ type: "profile" }]), data, between.signal); between.abort();
  await assert.rejects(pending, /abort/i);
});
test("a profile records explicit missing codes without copying individual rows to the receipt", async () => {
  const result = await executeAnalysis(spec([{ type: "profile" }], ["NA"]), "x\n1\nNA\n3");
  assert.equal(result.results[0].columns[0].missing, 1); assert.equal(result.results[0].columns[0].statistics.mean, 2);
  assert.ok(!Object.hasOwn(result.results[0], "preview"));
});

async function fixture(t) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "nutritiscan-analysis-"));
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  const root = path.join(base, "project"); await fs.mkdir(root); await fs.writeFile(path.join(root, "data.csv"), data);
  const store = new WorkspaceStore(path.join(base, "state")); await store.load(); await store.addProject(root, true);
  return { store, root };
}
test("proposal → approval → exact result → immutable receipt → restart roundtrips without changing source", async (t) => {
  const { store, root } = await fixture(t), proposal = await store.proposeAnalysis(spec([{ type: "group-summary", value: "x", group: "group" }]));
  assert.equal(store.analysis(proposal.id).status, "pending"); assert.equal(store.analysis(proposal.id).result, null);
  const record = await store.runAnalysis(proposal.id, proposal.source.sha256);
  assert.equal(record.status, "completed"); near(record.result.results[0].groups[0].mean, 1.5);
  const receipt = JSON.parse(await fs.readFile(path.join(root, record.artifact), "utf8"));
  assert.equal(receipt.source.sha256, proposal.source.sha256); assert.deepEqual(receipt.spec, proposal.spec);
  assert.equal(await fs.readFile(path.join(root, "data.csv"), "utf8"), data);
  const restored = new WorkspaceStore(store.directory); await restored.load(); assert.deepEqual(restored.analysis(record.id), record);
  await assert.rejects(store.runAnalysis(record.id, proposal.source.sha256), /Duplicate execution/);
  assert.equal((await fs.readdir(path.join(root, "artifacts"))).length, 1);
});
test("changed input, stale approval and rejected plans cannot publish a result", async (t) => {
  const { store, root } = await fixture(t);
  const proposal = await store.proposeAnalysis(spec([{ type: "profile" }]));
  await assert.rejects(store.runAnalysis(proposal.id, "0".repeat(64)), /displayed input hash/);
  assert.equal(store.analysis(proposal.id).status, "pending");
  await fs.writeFile(path.join(root, "data.csv"), data + "B,10,20\n");
  await assert.rejects(store.runAnalysis(proposal.id, proposal.source.sha256), /dataset changed/);
  assert.equal(store.analysis(proposal.id).status, "stale"); assert.equal(store.analysis(proposal.id).result, null);
  const rejected = await store.proposeAnalysis(spec([{ type: "profile" }])); await store.rejectAnalysis(rejected.id);
  await assert.rejects(store.runAnalysis(rejected.id, rejected.source.sha256), /no longer pending/);
  await assert.rejects(fs.access(path.join(root, "artifacts")));
});
test("analysis records are investigation-scoped and simultaneous approvals execute only once", async (t) => {
  const { store } = await fixture(t), originalSession = store.session().id;
  const proposal = await store.proposeAnalysis(spec([{ type: "profile" }]));
  store.newSession(); assert.throws(() => store.analysis(proposal.id), /does not belong/);
  await store.selectSession(originalSession);
  const results = await Promise.allSettled([store.runAnalysis(proposal.id, proposal.source.sha256), store.runAnalysis(proposal.id, proposal.source.sha256)]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
});
test("cancelled runs and process interruption never become completed results", async (t) => {
  const { store } = await fixture(t), proposal = await store.proposeAnalysis(spec([{ type: "profile" }]));
  const abort = new AbortController(); abort.abort(); await assert.rejects(store.runAnalysis(proposal.id, proposal.source.sha256, abort.signal));
  assert.equal(store.analysis(proposal.id).status, "interrupted");
  const next = await store.proposeAnalysis(spec([{ type: "profile" }])); store.analysis(next.id).status = "running"; await store.persist();
  const restored = new WorkspaceStore(store.directory); await restored.load();
  assert.equal(restored.analysis(next.id).status, "interrupted"); assert.equal(restored.analysis(next.id).result, null);
});
