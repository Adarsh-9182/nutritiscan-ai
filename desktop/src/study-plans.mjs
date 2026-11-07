import fs from "node:fs/promises";
import { constants } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { PROTOCOL_SECTIONS, StudyProtocolSchema, StudyTransferSchema, STUDY_TRANSFER_LIMIT, parseStudyTransfer, serializeStudyTransfer, studyTransfer } from "../../shared/study-plan.ts";

export const StudyPlanRecord = z.object({
  id: z.string().uuid(), revision: z.number().int().min(1),
  importedAt: z.iso.datetime().nullable(), importSha256: z.string().regex(/^[a-f\d]{64}$/).nullable(),
  document: StudyTransferSchema,
}).strict();
export const StudyPlanEdit = z.object({ title: StudyProtocolSchema.shape.title, fields: StudyProtocolSchema.shape.fields }).strict();

export async function readPickedStudyDraft(filename) {
  const handle = await fs.open(filename, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.size > STUDY_TRANSFER_LIMIT) throw new Error("Choose a regular study draft smaller than 250 KB.");
    const buffer = Buffer.alloc(STUDY_TRANSFER_LIMIT + 1); let offset = 0;
    while (offset < buffer.length) { const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset); if (!bytesRead) break; offset += bytesRead; }
    const after = await handle.stat();
    if (offset > STUDY_TRANSFER_LIMIT || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) throw new Error("The draft changed while being read. Choose a stable file smaller than 250 KB.");
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(buffer.subarray(0, offset));
  } finally { await handle.close(); }
}

export class StudyPlans {
  constructor(store) { this.store = store; }
  project() { const project = this.store.project(); if (!project) throw new Error("Open a research project first."); return project; }
  list() { return (this.project().plans ?? []).map(({ id, revision, document }) => ({ id, revision, title: document.protocol.title, missingSections: PROTOCOL_SECTIONS.filter(({ id }) => !document.protocol.fields[id].trim()).map(({ label }) => label), sourceCount: document.bibliography.length })); }
  read(id) { const record = this.project().plans?.find((record) => record.id === id); if (!record) throw new Error("This study draft does not belong to the active project."); return record; }
  async add(document, raw = null) {
    const project = this.project();
    const digest = raw === null ? null : createHash("sha256").update(raw).digest("hex");
    const records = project.plans ?? [];
    const existing = digest && records.find((record) => record.importSha256 === digest && record.revision === 1);
    if (existing) return { id: existing.id, duplicate: true };
    if (records.length >= 12) throw new Error("This project has twelve study drafts. Open a separate research folder; existing drafts are preserved.");
    const record = StudyPlanRecord.parse({ id: randomUUID(), revision: 1, importedAt: raw === null ? null : new Date().toISOString(), importSha256: digest, document });
    await this.store.manage((state) => {
      const current = state.projects.find((item) => item.id === project.id && !item.archivedAt);
      if (!current) throw new Error("The active project changed. Import the draft again.");
      current.plans ??= []; current.plans.push(record);
    });
    return { id: record.id, duplicate: false };
  }
  async import(raw) { return this.add(parseStudyTransfer(raw), raw); }
  async create(question, sourceIds) {
    question = z.string().trim().min(3).max(2000).parse(question);
    const available = this.store.session()?.sources ?? [];
    if (!sourceIds.length || sourceIds.some((id) => !available.some((source) => source.id === id))) throw new Error("Choose public sources from the current investigation.");
    const bibliography = available.filter((source) => sourceIds.includes(source.id)).map(({ id, title, url, kind, detail, metadata }) => ({ id, title, url, kind, detail, ...(metadata ? { metadata } : {}) }));
    const now = new Date().toISOString();
    const protocol = StudyProtocolSchema.parse({ version: 1, id: randomUUID(), title: question.slice(0, 160), originQuestion: question, sourceIds,
      fields: Object.fromEntries(PROTOCOL_SECTIONS.map(({ id }) => [id, id === "question" ? question : ""])), createdAt: now, updatedAt: now, reviewedAt: null, biologyContext: this.project().biology ?? {} });
    // Desktop search records do not retain their exact retrieval time.
    // Use this snapshot time and disclose that distinction in the UI.
    return this.add(studyTransfer(protocol, bibliography, now, "mac", "saved"));
  }
  async save(id, revision, input) {
    const record = this.read(id), patch = StudyPlanEdit.parse(input);
    if (record.revision !== revision) throw new Error("This draft changed after you opened it. Keep your edits and reload the saved draft before retrying.");
    const document = StudyTransferSchema.parse({ ...record.document, protocol: { ...record.document.protocol, ...patch, updatedAt: new Date().toISOString(), reviewedAt: null } });
    const projectId = this.project().id;
    await this.store.manage((state) => {
      const current = state.projects.find((item) => item.id === projectId && !item.archivedAt)?.plans?.find((item) => item.id === id);
      if (!current || current.revision !== revision) throw new Error("This draft changed. Keep your edits and reload the saved draft.");
      current.document = document; current.revision++;
    });
    return { saved: true, revision: revision + 1 };
  }
  export(id) {
    const { document } = this.read(id);
    return serializeStudyTransfer({ ...document, origin: "mac", exportedAt: new Date().toISOString() });
  }
}
