import { useSyncExternalStore } from "react";
import { z } from "zod";
import { ArtifactSchema, RunRequestSchema, StepEventSchema } from "./contracts";

export const DownloadReceiptSchema = z.object({
  filename: ArtifactSchema.shape.filename,
  sha256: ArtifactSchema.shape.sha256,
  bytes: ArtifactSchema.shape.bytes,
  at: z.string().datetime(),
}).strict();
export type DownloadReceipt = z.infer<typeof DownloadReceiptSchema>;

export const SavedRunSchema = z.object({
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
  request: RunRequestSchema,
  plan: z.array(z.string().max(200)).max(8),
  steps: z.array(StepEventSchema).max(6),
  artifact: ArtifactSchema,
  status: z.enum(["approval", "completed", "rejected"]),
  receipt: DownloadReceiptSchema.optional(),
}).strict().refine((run) => run.steps.every((step) => step.runId === run.id), "Step history must belong to this run.")
  .refine((run) => run.status !== "completed" || (run.receipt?.sha256 === run.artifact.sha256 && run.receipt.bytes === run.artifact.bytes), "A completed export needs a matching receipt.");
export type SavedRun = z.infer<typeof SavedRunSchema>;

const KEY = "ns-agent-run-history-v1";
const MAX_RUNS = 8;
const MAX_BYTES = 1_000_000;
const empty: SavedRun[] = [];
let rawCache: string | null = null;
let cache = empty;
const listeners = new Set<() => void>();

export function readSavedRuns(): SavedRun[] {
  let raw: string | null;
  try { raw = localStorage.getItem(KEY); } catch { return empty; }
  if (raw === rawCache) return cache;
  rawCache = raw;
  try {
    const parsed = SavedRunSchema.array().max(MAX_RUNS).parse(raw ? JSON.parse(raw) : []);
    if (new Set(parsed.map((run) => run.id)).size !== parsed.length) throw new Error("Duplicate runs");
    cache = parsed;
  } catch { cache = empty; }
  return cache;
}

function write(runs: SavedRun[]) {
  const json = JSON.stringify(runs);
  if (runs.length > MAX_RUNS || new TextEncoder().encode(json).byteLength > MAX_BYTES) {
    throw new Error("Saved run history is full. Remove an older result before saving another.");
  }
  try { localStorage.setItem(KEY, json); }
  catch { throw new Error("This browser could not save run history. Your current result is still on this page."); }
  for (const listener of listeners) listener();
}

export function saveRun(input: SavedRun): void {
  const run = SavedRunSchema.parse(input);
  write([run, ...readSavedRuns().filter((existing) => existing.id !== run.id)]);
}

/** Only update a run the user already chose to retain. */
export function updateSavedRun(id: string, status: SavedRun["status"], receipt?: DownloadReceipt): void {
  const saved = readSavedRuns().find((run) => run.id === id);
  if (saved) saveRun({ ...saved, status, receipt });
}

export function removeSavedRun(id: string): void {
  write(readSavedRuns().filter((run) => run.id !== id));
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => { if (event.key === KEY || event.key === null) listener(); };
  window.addEventListener("storage", onStorage);
  return () => { listeners.delete(listener); window.removeEventListener("storage", onStorage); };
}

export function useSavedRuns(): SavedRun[] {
  return useSyncExternalStore(subscribe, readSavedRuns, () => empty);
}
