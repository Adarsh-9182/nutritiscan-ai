import { z } from "zod";
import { ResearchStored, ResearchThreadSchema, type ResearchThread } from "./client";

export const BACKUP_LIMIT = 1_000_000;
const Backup = z.object({
  format: z.literal("nutritiscan-research"), version: z.literal(1), exportedAt: z.iso.datetime(),
  threads: z.array(ResearchThreadSchema).max(8),
}).strict().refine((value) => new Set(value.threads.map((t) => t.id)).size === value.threads.length, "Duplicate conversation IDs.")
  .refine((value) => value.threads.every((t) => new Set(t.turns.map((turn) => turn.id)).size === t.turns.length &&
    t.turns.every((turn) => !turn.reply || new Set(turn.reply.sources.map((s) => s.id)).size === turn.reply.sources.length)), "Duplicate turn or source IDs.");
export type ResearchBackup = z.infer<typeof Backup>;

function stopped(threads: ResearchThread[]) {
  return threads.map((t) => ({ ...t, turns: t.turns.map((turn) => turn.phase === "working" ? {
    ...turn, phase: "stopped" as const, reply: null, sourceReviews: undefined,
    error: "This run was interrupted. Retry the question to perform a fresh search.",
  } : turn) }));
}
export function researchBackup(threads: ResearchThread[]) {
  const value = Backup.parse({ format: "nutritiscan-research", version: 1, exportedAt: new Date().toISOString(), threads: stopped(threads) });
  const raw = JSON.stringify(value);
  if (new TextEncoder().encode(raw).length > BACKUP_LIMIT) throw new Error("Export fewer conversations to stay within the 1 MB backup limit.");
  return raw;
}
export function parseResearchBackup(raw: string): ResearchBackup {
  if (new TextEncoder().encode(raw).length > BACKUP_LIMIT) throw new Error("Choose a NutritiScan research backup smaller than 1 MB.");
  try {
    const parsed = Backup.parse(JSON.parse(raw));
    return { ...parsed, threads: stopped(parsed.threads) };
  } catch { throw new Error("This file is not a supported NutritiScan research backup. Nothing has been changed."); }
}
const contents = (t: ResearchThread) => {
  const checked = ResearchThreadSchema.parse(t);
  return JSON.stringify({ title: checked.title, query: checked.query, updatedAt: checked.updatedAt, turns: checked.turns });
};

/** Merge without replacing or evicting local work. Conflicts become separate conversations. */
export function mergeResearchBackup(current: ResearchThread[], backup: ResearchBackup) {
  const checked = parseResearchBackup(JSON.stringify(backup));
  const threads = [...current]; let added = 0;
  for (const candidate of checked.threads) {
    if (threads.some((t) => contents(t) === contents(candidate))) continue;
    threads.push({ ...candidate, id: threads.some((t) => t.id === candidate.id) ? crypto.randomUUID() : candidate.id, importedAt: new Date().toISOString() });
    added++;
  }
  if (threads.length > 8) throw new Error("Import would exceed eight conversations. Back up and delete an older conversation first. Nothing has been changed.");
  const raw = JSON.stringify(ResearchStored.parse({ version: 1, activeId: null, threads }));
  if (new TextEncoder().encode(raw).length > BACKUP_LIMIT) throw new Error("Combined research exceeds device storage limits. Nothing has been changed.");
  return { threads, added };
}
