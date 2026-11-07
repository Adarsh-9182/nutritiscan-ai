import { describe, expect, it, vi } from "vitest";
import { createStudyProtocol, PROTOCOL_SECTIONS, protocolGaps, protocolPrintHtml, protocolSelectionChanged, protocolText, StudyProtocolSchema } from "./protocol";
import { readResearch, researchExport, ResearchThreadSchema, saveResearch } from "./client";
import { mergeResearchBackup, parseResearchBackup, researchBackup } from "./backup";
import { reply, request, source } from "./test-fixtures";

const make = () => createStudyProtocol(request.message, [source.id], reply);
const makeThread = () => ResearchThreadSchema.parse({ id: "project", title: "Synthetic study", query: "", updatedAt: 1, turns: [{ id: "turn", request: { message: request.message, query: request.query, mode: request.mode, sources: request.sources }, phase: "done", reply, protocol: make() }] });

describe("investigator study protocols", () => {
  it("creates only the supplied question and bibliography, leaving clinical and statistical choices empty", () => {
    const protocol = make();
    expect(protocol.fields.question).toBe(request.message);
    expect(protocol.sourceIds).toEqual([source.id]);
    expect(protocol.fields.sampleSize).toBe(""); expect(protocol.fields.ethics).toBe("");
    expect(protocolGaps(protocol)).toHaveLength(PROTOCOL_SECTIONS.length - 1);
    expect(protocol.reviewedAt).toBeNull();
    for (const ids of [[], [source.id, source.id], ["pubmed:456"], ["https://example.test"]]) expect(() => createStudyProtocol(request.message, ids, reply)).toThrow();
  });
  it("rejects missing fields, excessive content, invalid timestamps and detached question/source identities", () => {
    const protocol = make(), thread = makeThread();
    for (const candidate of [{ ...protocol, version: 2 }, { ...protocol, title: " " }, { ...protocol, fields: { question: "Only one field" } }, { ...protocol, updatedAt: "not-a-date" }, { ...protocol, fields: { ...protocol.fields, ethics: "x".repeat(2001) } }]) expect(StudyProtocolSchema.safeParse(candidate).success).toBe(false);
    for (const patch of [{ originQuestion: "Detached question" }, { sourceIds: ["pubmed:456"] }]) expect(ResearchThreadSchema.safeParse({ ...thread, turns: [{ ...thread.turns[0], protocol: { ...protocol, ...patch } }] }).success).toBe(false);
    expect(ResearchThreadSchema.safeParse({ ...thread, turns: [{ ...thread.turns[0], phase: "working" }] }).success).toBe(false);
    // Existing saved conversations do not require a protocol.
    expect(ResearchThreadSchema.safeParse({ ...thread, turns: [{ ...thread.turns[0], protocol: undefined }] }).success).toBe(true);
  });
  it("roundtrips a draft through device storage and account/file backup without silently replacing local work", () => {
    const thread = makeThread(), values = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
    try {
      saveResearch([thread], thread.id);
      expect(readResearch().threads[0].turns[0].protocol).toEqual(thread.turns[0].protocol);
      const backup = parseResearchBackup(researchBackup([thread]));
      expect(backup.threads[0].turns[0].protocol).toEqual(thread.turns[0].protocol);
      expect(mergeResearchBackup([thread], backup).added).toBe(0);
      const local = { ...thread, turns: [{ ...thread.turns[0], protocol: { ...thread.turns[0].protocol!, title: "Local work" } }] };
      const merged = mergeResearchBackup([local], backup);
      expect(merged.threads[0]).toEqual(local); expect(merged.threads[1].importedAt).toBeDefined();
    } finally { vi.unstubAllGlobals(); }
  });
  it("keeps missing information, changed bibliography and imported reviews explicit in exports", () => {
    const protocol = make();
    expect(protocolSelectionChanged(protocol, [source.id])).toBe(false);
    expect(protocolSelectionChanged(protocol, [])).toBe(true);
    const incomplete = protocolText({ ...protocol, reviewedAt: protocol.updatedAt }, reply, [source.id]);
    expect(incomplete).toContain("NOT PROVIDED"); expect(incomplete).toContain("Review status: Review required");
    expect(incomplete).toContain(source.url); expect(incomplete).toContain("not verified support");
    expect(researchExport(request, reply, [], undefined, protocol)).toContain("NutritiScan study protocol — working draft");
    const complete = { ...protocol, fields: Object.fromEntries(PROTOCOL_SECTIONS.map((section) => [section.id, "Synthetic investigator input"])) as typeof protocol.fields, reviewedAt: protocol.updatedAt };
    expect(protocolGaps(complete)).toHaveLength(0);
    expect(protocolText(complete, reply, [source.id])).toContain("Personally marked reviewed");
    expect(protocolText(complete, reply, [])).toContain("Review status: Review required");
    expect(protocolText(complete, reply, [source.id], true)).toContain("not been revalidated");
    expect(protocolText(complete, reply, [source.id], true)).not.toContain("Personally marked reviewed");
  });
  it("prints untrusted imported fields as text, without executable markup", () => {
    const protocol = make();
    const html = protocolPrintHtml({ ...protocol, title: "</title><script>leak()</script>", fields: { ...protocol.fields, ethics: '<img src="https://evil.test" onerror="leak()">' } }, reply, [source.id]);
    expect(html).not.toContain("<script>"); expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;"); expect(html).toContain("&lt;img");
  });
});
