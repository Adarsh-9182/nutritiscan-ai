import { describe, expect, it } from "vitest";
import { resolvePassageReview, validateReview } from "./review";
import { draft, source } from "./test-fixtures";

const item = { index: 0, verdict: "supported", reason: "The whole association claim follows from the selected passage.", evidenceIndexes: [0] };
describe("reviewed passage selection", () => {
  it("resolves only existing exact passages and still runs provenance validation", () => {
    const review = resolvePassageReview({ items: [item] }, draft.findings);
    expect(review?.items[0].evidence).toEqual(draft.findings[0].excerpts);
    expect(validateReview(review, { points: draft.findings }, [source])).not.toBeNull();
    expect(validateReview(review, { points: draft.findings }, [{ ...source, detail: "A different document." }])).toBeNull();
  });
  it("rejects invented or duplicate passage indexes", () => {
    expect(resolvePassageReview({ items: [{ ...item, evidenceIndexes: [2] }] }, draft.findings)).toBeNull();
    expect(resolvePassageReview({ items: [{ ...item, evidenceIndexes: [0, 0] }] }, draft.findings)).toBeNull();
    expect(resolvePassageReview({ items: [{ ...item, evidenceIndexes: [] }] }, draft.findings)).toBeNull();
  });
  it("requires passages covering every source in a supported finding", () => {
    const other = { sourceId: "pubmed:456", quote: "A second exact source passage is available." };
    const findings = [{ ...draft.findings[0], sourceIds: [source.id, other.sourceId], excerpts: [...draft.findings[0].excerpts, other] }];
    expect(resolvePassageReview({ items: [item] }, findings)).toBeNull();
    expect(resolvePassageReview({ items: [{ ...item, evidenceIndexes: [0, 1] }] }, findings)).not.toBeNull();
  });
});
