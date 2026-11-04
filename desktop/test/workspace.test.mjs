import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { WorkspaceStore, projectFiles, safeProjectFile } from "../src/workspace.mjs";

async function fixture(t) { const base = await fs.mkdtemp(path.join(os.tmpdir(), "nutritiscan-workspace-")); t.after(() => fs.rm(base, { recursive: true, force: true })); const root = path.join(base, "research"); await fs.mkdir(root); const store = new WorkspaceStore(path.join(base, "app-data")); await store.load(); await store.addProject(root); return { base, root, store }; }
test("project reading blocks traversal, hidden/secret files and symlinks while retaining a content digest", async (t) => {
  const { base, root } = await fixture(t); await fs.writeFile(path.join(root, "measurements.csv"), "x\n42\n"); await fs.writeFile(path.join(base, "outside.txt"), "Private outside context");
  await fs.writeFile(path.join(root, ".env"), "SECRET=private"); await fs.writeFile(path.join(root, "credentials.json"), "{}"); await fs.symlink(path.join(base, "outside.txt"), path.join(root, "linked.txt"));
  for (const value of ["../outside.txt", "/etc/passwd", ".env", "credentials.json", "linked.txt", "../research/measurements.csv"]) await assert.rejects(safeProjectFile(root, value));
  const file = await safeProjectFile(root, "measurements.csv"); assert.match(file.sha256, /^[a-f0-9]{64}$/); assert.equal(file.bytes ?? file.size, 5);
  assert.deepEqual((await projectFiles(root)).files.map((f) => f.path), ["measurements.csv"]);
});
test("new artifacts preserve old work and cannot escape through paths or symlinked output folders", async (t) => {
  const { base, root, store } = await fixture(t);
  const a = await store.artifact("brief.md", "First work"), b = await store.artifact("brief.md", "Second work"); assert.notEqual(a.path, b.path); assert.equal(await fs.readFile(path.join(root, a.path), "utf8"), "First work");
  await assert.rejects(store.artifact("../escape.md", "X"));
  await fs.rename(path.join(root, "artifacts"), path.join(root, "preserved")); await fs.symlink(base, path.join(root, "artifacts"));
  await assert.rejects(store.artifact("escape.md", "X"), /symbolic/);
});
test("session state survives reload and interrupted runs never become completed", async (t) => {
  const { store } = await fixture(t); store.project().memory = "Synthetic project handoff"; store.session().status = "working"; await store.persist();
  const restored = new WorkspaceStore(store.directory); await restored.load(); assert.equal(restored.session().status, "interrupted"); assert.equal(restored.project().memory, "Synthetic project handoff");
  assert.equal((await fs.stat(store.file)).mode & 0o777, 0o600);
});
test("invalid saved data is preserved rather than replaced with empty history", async (t) => {
  const { store } = await fixture(t); await fs.writeFile(store.file, "not a workspace"); const restored = new WorkspaceStore(store.directory); await assert.rejects(restored.load(), /preserved/); assert.equal(await fs.readFile(store.file, "utf8"), "not a workspace");
});
test("dataset profiles preserve source identity and original data", async (t) => {
  const { store, root } = await fixture(t); const text = "well_id,signal_au\nA1,1\nA2,3\n"; await fs.writeFile(path.join(root, "plate.csv"), text);
  const p = await store.profile("plate.csv"); assert.equal(p.columns[1].statistics.mean, 2); assert.equal(p.sha256, (await store.read("plate.csv")).sha256); assert.equal(await fs.readFile(path.join(root, "plate.csv"), "utf8"), text);
});
