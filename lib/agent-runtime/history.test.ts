import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RESEARCH_AGENT } from "./contracts";
import { readSavedRuns, removeSavedRun, saveRun, updateSavedRun, type SavedRun } from "./history";

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
});
afterEach(() => vi.unstubAllGlobals());
const saved = (id = "8d7983ed-d3d5-4c4c-8c94-14a1b65e97e1"): SavedRun => {
  const content = "# Reviewed result\n";
  return { id, createdAt: new Date().toISOString(), request: { agent: RESEARCH_AGENT, task: "protein" }, plan: ["Read sources"], steps: [], status: "approval", artifact: {
    filename: "research-brief-test.md", content, sha256: createHash("sha256").update(content).digest("hex"), bytes: Buffer.byteLength(content), sources: [], mode: "source-collection", expiresAt: new Date(Date.now() + 60000).toISOString(),
  } };
};
describe("explicit run retention", () => {
  it("does not retain an unconsented run when recording completion", () => {
    updateSavedRun(saved().id, "rejected");
    expect(readSavedRuns()).toEqual([]);
  });
  it("restores the original task, preview and matching export receipt", () => {
    const run = saved(); saveRun(run);
    const receipt = { filename: run.artifact.filename, sha256: run.artifact.sha256, bytes: run.artifact.bytes, at: new Date().toISOString() };
    updateSavedRun(run.id, "completed", receipt);
    expect(readSavedRuns()[0]).toMatchObject({ request: run.request, artifact: run.artifact, status: "completed", receipt });
    removeSavedRun(run.id);
    expect(readSavedRuns()).toEqual([]);
  });
  it("rejects a completion with an unrelated receipt", () => {
    const run = saved();
    expect(() => saveRun({ ...run, status: "completed", receipt: { filename: run.artifact.filename, sha256: "0".repeat(64), bytes: 1, at: new Date().toISOString() } })).toThrow();
  });
  it("does not silently erase older results when history is full", () => {
    for (let n = 1; n <= 8; n++) saveRun(saved(`8d7983ed-d3d5-4c4c-8c94-14a1b65e97e${n}`));
    expect(() => saveRun(saved("8d7983ed-d3d5-4c4c-8c94-14a1b65e97e9"))).toThrow("full");
    expect(readSavedRuns()).toHaveLength(8);
  });
});
