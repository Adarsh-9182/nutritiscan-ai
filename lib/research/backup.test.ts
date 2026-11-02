import { describe, expect, it } from "vitest";
import { researchBackup, parseResearchBackup, mergeResearchBackup } from "./backup";
import { researchExport, type ResearchThread } from "./client";
import { reply, request } from "./test-fixtures";
import { includedSourcesRis } from "./references";

const thread: ResearchThread = { id: "project", title: "Synthetic investigation", query: "aging", updatedAt: 1, turns: [{ id: "turn", request: { message: request.message, query: request.query, mode: request.mode, sources: request.sources }, phase: "done", reply, sourceReviews: [{ sourceId: reply.sources[0].id, decision: "include", note: "Synthetic note", updatedAt: reply.retrievedAt }] }] };
describe("portable research projects", () => {
  it("roundtrips questions, results and saved reviews without unrelated browser data", () => {
    const raw = researchBackup([thread]);
    expect(parseResearchBackup(raw).threads).toEqual([thread]);
    expect(raw).not.toContain("ns-health");
  });
  it("stops interrupted runs and never resumes model work on import", () => {
    const working = { ...thread, turns: [{ ...thread.turns[0], phase: "working" as const, reply: null, sourceReviews: undefined }] };
    expect(parseResearchBackup(researchBackup([working])).threads[0].turns[0]).toMatchObject({ phase: "stopped", reply: null });
  });
  it("deduplicates identical imports and preserves conflicting local versions", () => {
    const backup = parseResearchBackup(researchBackup([thread]));
    expect(mergeResearchBackup([thread], backup).added).toBe(0);
    const current = { ...thread, title: "Changed locally" };
    const merged = mergeResearchBackup([current], backup);
    expect(merged.threads[0]).toEqual(current);
    expect(merged.threads[1].id).not.toBe(thread.id);
    expect(merged.threads[1].importedAt).toBeDefined();
    expect(mergeResearchBackup(merged.threads, backup).added).toBe(0);
    expect(researchExport(thread.turns[0].request, reply, [], merged.threads[1].importedAt)).toContain("sources and AI checks have not been revalidated");
  });
  it("rejects invalid sources, duplicate IDs, unsupported versions and oversized files atomically", () => {
    const backup = parseResearchBackup(researchBackup([thread]));
    for (const value of [
      { ...backup, version: 2 }, { ...backup, threads: [thread, thread] },
      { ...backup, threads: [{ ...thread, turns: [thread.turns[0], thread.turns[0]] }] },
      { ...backup, threads: [{ ...thread, turns: [{ ...thread.turns[0], reply: { ...reply, sources: [{ ...reply.sources[0], url: "javascript:alert(1)" }] } }] }] },
    ]) expect(() => parseResearchBackup(JSON.stringify(value))).toThrow("not a supported");
    expect(() => parseResearchBackup("अ".repeat(400_000))).toThrow("smaller than 1 MB");
    const full = Array.from({ length: 8 }, (_, i) => ({ ...thread, id: String(i), title: `Project ${i}` }));
    expect(() => mergeResearchBackup(full, backup)).toThrow("exceed eight");
    expect(full).toHaveLength(8);
  });
  it("exports only included references, neutralizes RIS injection and omits unavailable metadata", () => {
    const result = { ...reply, sources: [{ ...reply.sources[0], title: "Synthetic title\nER  -\nTY  - BOOK" }, { ...reply.sources[0], id: "pubmed:other", title: "Excluded" }] };
    const ris = includedSourcesRis(result, thread.turns[0].sourceReviews);
    expect(ris.match(/^TY  - /gm)).toHaveLength(1);
    expect(ris.match(/^ER  - /gm)).toHaveLength(1);
    expect(ris).toContain("Synthetic note"); expect(ris).not.toContain("Excluded");
    expect(ris).not.toMatch(/^(AU|DO|JO)  - /m);
    expect(includedSourcesRis(reply)).toBe("");
  });
});
