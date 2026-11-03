import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateText } from "ai";
import { BriefRequest, EvidenceBriefSchema, briefCsv, briefPrintHtml, briefSelectionChanged, briefText, emptyBriefRow } from "./brief";
import { resolveBriefExtraction, runBrief } from "./brief-agent";
import { ResearchThreadSchema } from "./client";
import { researchBackup, parseResearchBackup, mergeResearchBackup } from "./backup";
import { source, request, reply } from "./test-fixtures";

vi.mock("ai", async (original) => ({ ...await original<typeof import("ai")>(), generateText: vi.fn() }));
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", ""); });
afterEach(() => vi.unstubAllEnvs());
const signal = () => new AbortController().signal;
const input = { question: request.message, sourceIds: [source.id] };
const extraction = { cells: [{ sourceId: source.id, field: "population", quote: "this synthetic cohort" }] };
const approved = { items: [{ index: 0, supported: true }] };
const read = async () => [source];
async function fixture() { return runBrief(input, signal(), { read }); }

describe("included-source research agent", () => {
  it("accepts only bounded canonical IDs, never client evidence or arbitrary URLs", () => {
    expect(BriefRequest.safeParse(input).success).toBe(true);
    for (const value of [{ ...input, sources: [source] }, { ...input, sourceIds: [source.url] }, { ...input, sourceIds: [source.id, source.id] }, { ...input, sourceIds: Array.from({ length: 7 }, (_, i) => `pubmed:${i}`) }, { ...input, sourceIds: ["trials:NCT1/../../admin"] }]) expect(BriefRequest.safeParse(value).success).toBe(false);
  });
  it("requires both an exact source passage and a positive contextual field verdict", () => {
    expect(resolveBriefExtraction(extraction, approved, [source])?.[0].cells.population).toEqual({ status: "quoted", quote: extraction.cells[0].quote });
    expect(resolveBriefExtraction(extraction, { items: [{ index: 0, supported: false }] }, [source])?.[0].cells.population.status).toBe("withheld");
    expect(resolveBriefExtraction({ cells: [{ ...extraction.cells[0], quote: "Fabricated sample size of 4000 adults" }] }, approved, [source])?.[0].cells.population.status).toBe("withheld");
    expect(resolveBriefExtraction(extraction, { items: [] }, [source])).toBeNull();
    expect(resolveBriefExtraction(extraction, { items: [{ index: 1, supported: true }] }, [source])).toBeNull();
  });
  it("does not assign one source's quote to another source or pick an ambiguous duplicate", () => {
    const other = { ...source, id: "pubmed:456", detail: "A different cohort was observed." };
    const moved = { cells: [{ ...extraction.cells[0], sourceId: other.id }] };
    expect(resolveBriefExtraction(moved, approved, [source, other])?.[1].cells.population.status).toBe("withheld");
    const duplicate = { cells: [...extraction.cells, ...extraction.cells] };
    expect(resolveBriefExtraction(duplicate, { items: [{ index: 0, supported: true }, { index: 1, supported: true }] }, [source])?.[0].cells.population.status).toBe("withheld");
  });
  it("withholds substantive extraction for retracted or abstract-less papers", () => {
    for (const metadata of [{ hasAbstract: false }, { hasAbstract: true, publicationTypes: ["Retracted Publication"] }]) expect(resolveBriefExtraction(extraction, approved, [{ ...source, metadata }])?.[0].cells.population.status).toBe("unavailable");
  });
  it("returns usable saved sources without calling an unconfigured provider", async () => {
    const brief = await fixture();
    expect(brief.sources).toEqual([source]); expect(brief.rows[0].cells.sample.status).toBe("unavailable");
    expect(brief.answer).toBeNull(); expect(generateText).not.toHaveBeenCalled();
    expect(briefText(brief)).toContain("Extraction unavailable");
  });
  it("refetches only selected IDs, preserves partial retrieval and fails when all records are missing", async () => {
    const reader = vi.fn().mockResolvedValue([source]);
    const brief = await runBrief({ ...input, sourceIds: [source.id, "trials:NCT01234567"] }, signal(), { read: reader });
    expect(reader.mock.calls[0][0]).toEqual([source.id, "trials:NCT01234567"]);
    expect(brief.missingIds).toEqual(["trials:NCT01234567"]);
    await expect(runBrief(input, signal(), { read: async () => [] })).rejects.toThrow("could not be retrieved");
    const aborted = new AbortController(); aborted.abort(); reader.mockClear();
    await expect(runBrief(input, aborted.signal, { read: reader })).rejects.toThrow(); expect(reader).not.toHaveBeenCalled();
  });
  it("retains sources and marks extraction unavailable on quota exhaustion, without inventing missing data", async () => {
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "synthetic");
    vi.mocked(generateText).mockRejectedValue({ statusCode: 429 });
    const brief = await fixture();
    expect(brief.rows).toEqual([emptyBriefRow(source.id)]); expect(brief.issues).toContain("extraction:quota");
    expect(generateText).toHaveBeenCalledTimes(2);
  });
  it("does not release unchecked cells when the independent field check fails", async () => {
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "synthetic");
    vi.mocked(generateText).mockResolvedValueOnce({ output: extraction } as never).mockRejectedValueOnce({ statusCode: 429 });
    const brief = await fixture();
    expect(brief.rows[0].cells.population.status).toBe("unavailable"); expect(brief.issues).toContain("field-check:quota");
  });
  it("preserves checked extraction when narrative generation fails", async () => {
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "synthetic");
    vi.mocked(generateText).mockResolvedValueOnce({ output: extraction } as never).mockResolvedValueOnce({ output: approved } as never);
    const brief = await runBrief(input, signal(), { read, narrative: async () => { throw new Error("timeout"); } });
    expect(brief.rows[0].cells.population.status).toBe("quoted"); expect(brief.answer).toBeNull();
  });
  it("roundtrips researcher edits through file/account backup schema and rejects detached evidence", async () => {
    const brief = { ...await fixture(), notes: "Synthetic interpretation", reviewedAt: reply.retrievedAt };
    const thread = ResearchThreadSchema.parse({ id: "project", title: "Synthetic", query: "", updatedAt: 1, turns: [{ id: "turn", request: { message: request.message, query: request.query, searchMode: request.searchMode, mode: request.mode, sources: request.sources }, phase: "done", reply, briefs: [brief] }] });
    const backup = parseResearchBackup(researchBackup([thread]));
    expect(backup.threads[0].turns[0].briefs?.[0]).toEqual(brief);
    expect(mergeResearchBackup([], backup).threads[0].importedAt).toBeDefined();
    expect(EvidenceBriefSchema.safeParse({ ...brief, missingIds: [source.id] }).success).toBe(false);
    expect(EvidenceBriefSchema.safeParse({ ...brief, sources: [{ ...source, url: "https://pubmed.ncbi.nlm.nih.gov/456/" }] }).success).toBe(false);
    expect(ResearchThreadSchema.safeParse({ ...thread, turns: [{ ...thread.turns[0], request: { ...thread.turns[0].request, message: "Other question" } }] }).success).toBe(false);
    const corrupted = { ...brief, rows: [{ ...brief.rows[0], cells: { ...brief.rows[0].cells, sample: { status: "quoted", quote: "9000 invented participants" } } }] };
    expect(EvidenceBriefSchema.safeParse(corrupted).success).toBe(false);
  });
  it("labels changed selections, imported checks and researcher notes, and escapes exports", async () => {
    const brief = { ...await fixture(), title: "=malicious()", notes: "<img src=x onerror=alert(1)>" };
    expect(briefSelectionChanged(brief, [])).toBe(true); expect(briefSelectionChanged(brief, [source.id])).toBe(false);
    expect(briefText(brief, true, true)).toContain("not been revalidated");
    expect(briefPrintHtml(brief)).not.toContain("<img"); expect(briefPrintHtml(brief)).toContain("&lt;img");
    expect(briefCsv({ ...brief, question: "=HYPERLINK(1)" })).toContain('"\'=HYPERLINK(1)"');
  });
});
