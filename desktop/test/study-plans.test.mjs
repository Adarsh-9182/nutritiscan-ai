import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { WorkspaceStore } from "../src/workspace.mjs";
import { StudyPlans, readPickedStudyDraft } from "../src/study-plans.mjs";
import { STUDY_TRANSFER_LIMIT, parseStudyTransfer, serializeStudyTransfer } from "../../shared/study-plan.ts";
import { syntheticStudyTransfer } from "../../shared/test-fixtures/study-plan.mjs";

async function fixture(t) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "nutritiscan-study-"));
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  const root = path.join(base, "project"); await fs.mkdir(root);
  const store = new WorkspaceStore(path.join(base, "state")); await store.load(); await store.addProject(root, true);
  return { base, root, store, plans: new StudyPlans(store) };
}
test("import, edit, export and restart retain every section, source snapshot and original import fingerprint", async (t) => {
  const { store, plans } = await fixture(t), original = syntheticStudyTransfer(), raw = serializeStudyTransfer(original);
  const { id } = await plans.import(raw), record = plans.read(id);
  assert.equal(record.document.protocol.reviewedAt, null);
  assert.equal(record.importSha256, createHash("sha256").update(raw).digest("hex"));
  assert.deepEqual(record.document.bibliography, original.bibliography);
  assert.equal((await plans.import(raw)).id, id); assert.equal(plans.list().length, 1);
  const edit = { title: "Edited on this Mac", fields: { ...record.document.protocol.fields, analysis: "Predefined synthetic analysis plan" } };
  await plans.save(id, 1, edit);
  assert.equal(plans.read(id).revision, 2);
  await assert.rejects(plans.save(id, 1, { ...edit, title: "Stale overwrite" }), /changed/);
  const exported = parseStudyTransfer(plans.export(id));
  assert.equal(exported.origin, "mac"); assert.equal(exported.protocol.fields.analysis, edit.fields.analysis);
  assert.equal(exported.protocol.title, edit.title); assert.deepEqual(exported.bibliography, original.bibliography);
  const second = await plans.import(raw); assert.notEqual(second.id, id); assert.equal(plans.list().length, 2);
  assert.equal(plans.read(id).document.protocol.title, edit.title);
  const reopened = new WorkspaceStore(store.directory); await reopened.load();
  assert.deepEqual(new StudyPlans(reopened).read(id), plans.read(id));
});
test("invalid transfers and cross-project access cannot change saved work", async (t) => {
  const { store, plans, base } = await fixture(t), raw = serializeStudyTransfer(syntheticStudyTransfer()), { id } = await plans.import(raw);
  const before = JSON.stringify(store.state);
  const altered = JSON.parse(raw); altered.bibliography[0].url = "https://pubmed.ncbi.nlm.nih.gov/456/";
  await assert.rejects(plans.import(JSON.stringify(altered)), /supported/);
  assert.equal(JSON.stringify(store.state), before);
  const other = path.join(base, "other"); await fs.mkdir(other); await store.addProject(other, false);
  assert.throws(() => plans.read(id), /active project/); assert.equal(plans.list().length, 0);
});
test("new drafts use only selected current sources and label saved snapshots honestly", async (t) => {
  const { store, plans } = await fixture(t), source = syntheticStudyTransfer().bibliography[0];
  store.session().sources.push({ ...source, notice: "Synthetic source" });
  const { id } = await plans.create("A fictional research planning question", [source.id]);
  const document = plans.read(id).document;
  assert.equal(document.sourceTimestampKind, "saved"); assert.equal(document.protocol.reviewedAt, null);
  assert.equal(document.protocol.fields.question, "A fictional research planning question");
  assert.equal(document.protocol.fields.methods, "");
  await assert.rejects(plans.create("Unknown source", ["pubmed:456"]), /current investigation/);
});
test("the native file reader rejects oversized files, symlinks and invalid UTF-8", async (t) => {
  const { base } = await fixture(t), filename = path.join(base, "study.json"), raw = serializeStudyTransfer(syntheticStudyTransfer());
  await fs.writeFile(filename, raw); assert.equal(await readPickedStudyDraft(filename), raw);
  const link = path.join(base, "link.json"); await fs.symlink(filename, link); await assert.rejects(readPickedStudyDraft(link));
  await fs.writeFile(filename, Buffer.alloc(STUDY_TRANSFER_LIMIT + 1)); await assert.rejects(readPickedStudyDraft(filename), /250 KB/);
  await fs.writeFile(filename, Buffer.from([0xc3, 0x28])); await assert.rejects(readPickedStudyDraft(filename));
});
test("a failed save preserves both the displayed revision and the durable copy", async (t) => {
  const { store, plans } = await fixture(t), { id } = await plans.import(serializeStudyTransfer(syntheticStudyTransfer()));
  const original = JSON.stringify(store.state), durable = await fs.readFile(store.file, "utf8"), persist = store.persist;
  store.persist = async () => { throw new Error("Synthetic disk full"); };
  await assert.rejects(plans.save(id, 1, { title: "Cannot save", fields: plans.read(id).document.protocol.fields }), /disk full/);
  assert.equal(JSON.stringify(store.state), original); assert.equal(await fs.readFile(store.file, "utf8"), durable);
  store.persist = persist;
});
test("upgrading a v1 workspace preserves an exact private backup and writes v2 to protect new fields from older apps", async (t) => {
  const { store } = await fixture(t);
  const legacy = { ...store.state, version: 1, projects: store.state.projects.map(({ plans, biology, ...project }) => project) };
  const raw = JSON.stringify(legacy); await fs.writeFile(store.file, raw);
  const upgraded = new WorkspaceStore(store.directory); await upgraded.load();
  assert.equal(upgraded.state.version, 2); assert.equal(upgraded.project().id, store.project().id);
  assert.deepEqual(upgraded.project().plans, []); assert.equal(upgraded.project().biology.organism, "");
  const backup = path.join(upgraded.directory, upgraded.migrationBackup);
  assert.equal(await fs.readFile(backup, "utf8"), raw); assert.equal((await fs.stat(backup)).mode & 0o077, 0);
  await upgraded.persist(); assert.equal(JSON.parse(await fs.readFile(upgraded.file, "utf8")).version, 2);
  assert.equal(await fs.readFile(backup, "utf8"), raw);
});
