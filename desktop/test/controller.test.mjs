import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter, once } from "node:events";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { WorkspaceStore } from "../src/workspace.mjs";
import { ResearchController } from "../src/controller.mjs";

class Bridge extends EventEmitter {
  constructor(auth = true) { super(); this.auth = { connected: auth, plan: "synthetic" }; this.models = [{ model: "synthetic-model", isDefault: true }]; this.calls = []; this.replies = []; }
  status() { return { auth: this.auth, connected: true, models: this.models }; }
  async connect() {} async refreshAuth() {} reply(id, result) { this.replies.push({ id, result }); this.emit("replied"); }
  async rpc(method, params) { this.calls.push({ method, params }); if (method === "thread/start" || method === "thread/resume") return { modelProvider: "openai", thread: { id: "synthetic-thread" } }; if (method === "turn/start") { this.emit("started"); return { turn: { id: "synthetic-turn" } }; } return {}; }
}
async function setup(t, authenticated = true) { const base = await fs.mkdtemp(path.join(os.tmpdir(), "nutritiscan-controller-")); const root = path.join(base, "project"); await fs.mkdir(root); const store = new WorkspaceStore(path.join(base, "storage")); await store.load(); await store.addProject(root); const bridge = new Bridge(authenticated); const controller = new ResearchController(store, bridge, async () => ({ sources: [] })); t.after(async () => { controller.finish("interrupted"); clearTimeout(controller.saveTimer); await store.queue.catch(() => {}); await fs.rm(base, { recursive: true, force: true }); }); return { store, bridge, controller, root }; }
async function start(controller, bridge) { const ready = once(bridge, "started"); await controller.run("Inspect the synthetic project", "synthetic-model"); await ready; await new Promise((resolve) => setImmediate(resolve)); }
test("biology context and dynamic tools use managed ChatGPT auth with a read-only native sandbox", async (t) => {
  const { controller, bridge } = await setup(t); await start(controller, bridge);
  const initial = bridge.calls.find((c) => c.method === "thread/start").params;
  assert.equal(initial.modelProvider, "openai"); assert.equal(initial.allowProviderModelFallback, false); assert.equal(initial.sandbox, "read-only"); assert.match(initial.baseInstructions, /human-biology research/); assert.ok(initial.dynamicTools.some((t) => t.name === "search_literature"));
  assert.equal(JSON.parse(bridge.calls.find((c) => c.method === "turn/start").params.input[0].text).task, "Inspect the synthetic project");
  assert.throws(() => controller.idle(), /Stop or finish/);
});
test("project memory is refreshed as lower-priority data, never interpolated into developer policy", async (t) => {
  const { controller, bridge, store } = await setup(t); store.project().memory = "Synthetic untrusted memory marker"; await start(controller, bridge);
  assert.ok(!bridge.calls.find((c) => c.method === "thread/start").params.developerInstructions.includes("Synthetic untrusted memory marker"));
  assert.equal(JSON.parse(bridge.calls.find((c) => c.method === "turn/start").params.input[0].text).project.memory, "Synthetic untrusted memory marker");
});
test("an API-key or missing subscription session never starts an inference turn", async (t) => {
  const { controller, bridge, store } = await setup(t, false); await controller.run("Inspect this synthetic dataset");
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(!bridge.calls.some((c) => c.method === "turn/start")); assert.equal(store.session().status, "failed"); assert.match(controller.issue, /ChatGPT/);
});
test("unknown and cross-thread tool requests cannot read files or mutate project memory", async (t) => {
  const { controller, bridge, store } = await setup(t); await start(controller, bridge);
  await controller.serverRequest({ id: "foreign", method: "item/tool/call", params: { threadId: "other", turnId: "synthetic-turn", callId: "x", tool: "update_project_memory", arguments: { memory: "Untrusted mutation" } } });
  assert.equal(bridge.replies.at(-1).result.success, false); assert.equal(store.project().memory, "");
  await controller.serverRequest({ id: "unknown", method: "item/tool/call", params: { threadId: "synthetic-thread", turnId: "synthetic-turn", callId: "y", tool: "execute_arbitrary_command", arguments: { command: "echo synthetic" } } });
  assert.equal(bridge.replies.at(-1).result.success, false);
});
test("built-in write/permission approvals are declined and app-owned artifacts preserve prior work", async (t) => {
  const { controller, bridge, root } = await setup(t); await start(controller, bridge);
  await controller.serverRequest({ id: "approval", method: "item/fileChange/requestApproval", params: {} }); assert.equal(bridge.replies.at(-1).result.decision, "decline");
  await controller.serverRequest({ id: "permissions", method: "item/permissions/requestApproval", params: {} }); assert.deepEqual(bridge.replies.at(-1).result.permissions, {});
  const params = { threadId: "synthetic-thread", turnId: "synthetic-turn", callId: "artifact", tool: "save_artifact", arguments: { filename: "analysis.md", content: "Synthetic analysis; no scientific conclusion." } };
  await controller.serverRequest({ id: "save", method: "item/tool/call", params }); assert.equal(bridge.replies.at(-1).id, "save"); assert.equal(bridge.replies.at(-1).result.success, true); assert.match(await fs.readFile(path.join(root, "artifacts/analysis.md"), "utf8"), /Synthetic/);
});
test("failed and interrupted turns remain incomplete; stale events cannot complete the next investigation", async (t) => {
  const { controller, bridge, store } = await setup(t); await start(controller, bridge);
  bridge.emit("notification", { method: "item/agentMessage/delta", params: { threadId: "synthetic-thread", turnId: "synthetic-turn", itemId: "answer", delta: "Partial synthetic output" } });
  await controller.stop(); assert.equal(store.session().messages.at(-1).status, "interrupted");
  store.newSession(); await start(controller, bridge);
  controller.current.turnId = "new-turn";
  bridge.emit("notification", { method: "turn/completed", params: { threadId: "synthetic-thread", turn: { id: "synthetic-turn", status: "completed" } } });
  assert.equal(store.session().status, "working");
  bridge.emit("notification", { method: "turn/completed", params: { threadId: "synthetic-thread", turn: { id: "new-turn", status: "failed" } } }); assert.equal(store.session().status, "failed");
});
test("resumed threads restore persisted tool definitions without an unsupported dynamicTools parameter", async (t) => {
  const { controller, bridge, store } = await setup(t); store.session().threadId = "synthetic-thread"; await start(controller, bridge);
  const resumed = bridge.calls.find((c) => c.method === "thread/resume"); assert.ok(resumed); assert.equal(resumed.params.excludeTurns, true); assert.ok(!Object.hasOwn(resumed.params, "dynamicTools"));
});
test("a full source collection preserves earlier evidence rather than silently evicting citations", async (t) => {
  const { controller, bridge, store } = await setup(t); await start(controller, bridge);
  const source = (i) => ({ id: `pubmed:${i}`, title: "Synthetic source", url: `https://pubmed.ncbi.nlm.nih.gov/${i}/`, detail: "Synthetic source passage only.", kind: "paper" });
  store.session().sources = Array.from({ length: 94 }, (_, i) => source(i + 1));
  controller.search = async () => ({ sources: Array.from({ length: 8 }, (_, i) => source(i + 1000)) });
  await controller.serverRequest({ id: "over-capacity", method: "item/tool/call", params: { threadId: "synthetic-thread", turnId: "synthetic-turn", callId: "search-capacity", tool: "search_literature", arguments: { query: "synthetic research", source: "both" } } });
  assert.equal(bridge.replies.at(-1).result.success, false); assert.equal(store.session().sources.length, 94); assert.equal(store.session().sources[0].id, "pubmed:1");
});
test("a changed retrieved record invalidates old passage-check labels", async (t) => {
  const { controller, bridge, store } = await setup(t); await start(controller, bridge);
  const source = { id: "pubmed:123", title: "Synthetic", url: "https://pubmed.ncbi.nlm.nih.gov/123/", detail: "Prior synthetic passage.", kind: "paper" };
  store.session().sources = [source]; store.session().checks = [{ sourceId: source.id, claim: "Synthetic prior claim", quote: source.detail, status: "quote-found", reason: "Prior check" }];
  controller.search = async () => ({ sources: [{ ...source, detail: "Updated synthetic source text." }] });
  await controller.serverRequest({ id: "updated", method: "item/tool/call", params: { threadId: "synthetic-thread", turnId: "synthetic-turn", callId: "search-updated", tool: "search_literature", arguments: { query: "synthetic research", source: "pubmed" } } });
  assert.equal(store.session().checks[0].status, "withheld"); assert.match(store.session().checks[0].reason, /changed/);
});
