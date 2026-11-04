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

test("older workspaces gain archive defaults while keeping their transcript and selected investigation", async (t) => {
  const { store } = await fixture(t), id = store.session().id;
  store.session().messages.push({ id: crypto.randomUUID(), role: "user", text: "Synthetic retained question", status: "completed", createdAt: new Date().toISOString() });
  const old = structuredClone(store.state);
  for (const p of old.projects) { delete p.archivedAt; for (const s of p.sessions) delete s.archivedAt; }
  await fs.writeFile(store.file, JSON.stringify(old));
  const restored = new WorkspaceStore(store.directory); await restored.load();
  assert.equal(restored.session().id, id); assert.equal(restored.session().messages[0].text, "Synthetic retained question"); assert.equal(restored.project().archivedAt, null); assert.equal(restored.session().archivedAt, null);
});

test("archiving selects available work; the last investigation can be restored after restart", async (t) => {
  const { store } = await fixture(t), first = store.session().id;
  const second = store.newSession().id; await store.rename("session", second, "  Replication question  ");
  await store.archive("session", second); assert.equal(store.session().id, first);
  await assert.rejects(store.selectSession(second), /Restore archived/);
  await store.archive("session", first); assert.equal(store.session(), null);
  const restored = new WorkspaceStore(store.directory); await restored.load(); assert.equal(restored.session(), null);
  await restored.archive("session", second, true); assert.equal(restored.session().title, "Replication question");
  assert.equal(restored.project().sessions.length, 2);
});

test("project archive and removal retain all project files; reopening a folder restores its history", async (t) => {
  const { store, root } = await fixture(t), id = store.project().id, session = store.session().id;
  await store.artifact("retained-report.md", "Synthetic retained report");
  await store.rename("project", id, "Synthetic study"); await store.archive("project", id);
  assert.equal(store.project(), null); await assert.rejects(store.selectProject(id), /Restore archived/);
  await store.addProject(root); assert.equal(store.project().name, "Synthetic study"); assert.equal(store.session().id, session);
  await assert.rejects(store.removeArchived("project", id), /Only archived/);
  await store.archive("project", id); await store.removeArchived("project", id);
  assert.equal(store.state.projects.length, 0); assert.equal(await fs.readFile(path.join(root, "artifacts/retained-report.md"), "utf8"), "Synthetic retained report");
});

test("removing only an archived investigation frees its slot and cannot erase another project's work", async (t) => {
  const { store, base, root } = await fixture(t), first = store.session().id;
  while (store.project().sessions.length < 20) store.newSession();
  await store.archive("session", first); assert.throws(() => store.newSession(), /including archived/);
  const other = path.join(base, "other-project"); await fs.mkdir(other); await store.addProject(other);
  await assert.rejects(store.removeArchived("session", first), /Only archived/);
  await store.addProject(root); await store.removeArchived("session", first);
  store.newSession(); await store.persist(); assert.equal(store.project().sessions.length, 20);
});

test("a failed durable change leaves the visible and stored history intact", async (t) => {
  const { store } = await fixture(t), original = store.project().name, id = store.project().id;
  const persist = store.persist.bind(store); store.persist = async () => { throw new Error("Synthetic disk failure"); };
  await assert.rejects(store.rename("project", id, "Should not appear"), /disk failure/);
  assert.equal(store.project().name, original); assert.equal(store.pendingChange, null);
  store.persist = persist;
  await assert.rejects(store.rename("project", id, " \n "), /./); await assert.rejects(store.rename("project", id, "Two\nlines"), /one line/);
  const restored = new WorkspaceStore(store.directory); await restored.load(); assert.equal(restored.project().name, original);
});
