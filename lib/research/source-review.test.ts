import { afterEach, describe, expect, it, vi } from "vitest";
import { readResearch, ResearchTurnSchema, researchExport, saveResearch } from "./client";
import { sourceReviewCounts, sourceReviewCsv, type SourceReview } from "./source-review";
import { reply, request, source } from "./test-fixtures";

const review: SourceReview = { sourceId: source.id, decision: "exclude", note: "Wrong population for this question.", updatedAt: "2026-11-02T10:00:00.000Z" };
const turnRequest = { message: request.message, query: request.query, searchMode: request.searchMode, mode: request.mode, sources: request.sources };
const turn = { id: "turn", request: turnRequest, phase: "done" as const, reply };
afterEach(() => vi.unstubAllGlobals());

describe("researcher source decisions", () => {
  it("roundtrips decisions alongside a question and keeps older histories readable", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => values.set(k, v) });
    const thread = { id: "thread", title: "Synthetic investigation", query: "metabolic aging", updatedAt: 1, turns: [turn] };
    saveResearch([thread], "thread");
    expect(readResearch().threads[0].turns[0].sourceReviews).toBeUndefined();
    saveResearch([{ ...thread, turns: [{ ...turn, sourceReviews: [review] }] }], "thread");
    expect(readResearch().threads[0].turns[0].sourceReviews).toEqual([review]);
  });
  it("rejects cross-result references, duplicate decisions, invalid timestamps and oversized notes", () => {
    for (const sourceReviews of [
      [{ ...review, sourceId: "pubmed:other-question" }], [review, review],
      [{ ...review, updatedAt: "yesterday" }], [{ ...review, note: "x".repeat(1001) }],
      [{ ...review, decision: "scientifically-proven" }],
    ]) expect(ResearchTurnSchema.safeParse({ ...turn, sourceReviews }).success).toBe(false);
    expect(ResearchTurnSchema.safeParse({ ...turn, reply: null, phase: "working", sourceReviews: [review] }).success).toBe(false);
  });
  it("separates unreviewed records from an explicit needs-review decision", () => {
    const result = { ...reply, sources: [source, { ...source, id: "pubmed:456" }] };
    expect(sourceReviewCounts(result, [{ ...review, decision: "needs-review" }])).toEqual({ include: 0, exclude: 0, "needs-review": 1, unreviewed: 1 });
  });
  it("exports all records, provenance and decisions even when no source has been reviewed", () => {
    const csv = sourceReviewCsv(request.message, reply);
    expect(csv).toContain('"Unreviewed","",""');
    expect(csv).toContain(source.url);
    expect(csv).toContain(reply.retrievedAt);
    const reviewed = sourceReviewCsv(request.message, reply, [review]);
    expect(reviewed).toContain('"Exclude","Wrong population for this question.","2026-11-02T10:00:00.000Z"');
    const text = researchExport(turnRequest, reply, [review]);
    expect(text).toContain("pubmed:123: Exclude");
    expect(text).toContain("do not validate the AI draft");
    expect(text).toContain(reply.answer!.findings[0].text);
  });
  it("quotes commas, quotes and line breaks and neutralizes spreadsheet formulas", () => {
    for (const attack of ['=HYPERLINK("https://example.com")', '+SUM(1,2)', '-1+2', '@SUM(1,2)', '  =1+1', '\ttext', '\rtext', '\ntext', '\u0000=1+1']) {
      const csv = sourceReviewCsv(attack, { ...reply, sources: [{ ...source, title: attack }] }, [{ ...review, note: attack }]);
      const escaped = attack.replaceAll('"', '""');
      expect(csv.split(`"'${escaped}"`)).toHaveLength(4);
    }
    expect(sourceReviewCsv('Question, with "quotes"\nand newline', reply)).toContain('"Question, with ""quotes""\nand newline"');
  });
});
