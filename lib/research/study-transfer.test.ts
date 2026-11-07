import { describe, expect, it } from "vitest";
import { parseStudyTransfer, serializeStudyTransfer, STUDY_TRANSFER_LIMIT } from "@/shared/study-plan";
import { syntheticStudyTransfer } from "@/shared/test-fixtures/study-plan.mjs";
import { studyTransferBackup } from "./study-transfer";
import { mergeResearchBackup } from "./backup";

describe("portable study drafts", () => {
  it("preserves the bibliography and all fields, but resets imported review marks", () => {
    const original = syntheticStudyTransfer(), parsed = parseStudyTransfer(serializeStudyTransfer(original));
    expect(parsed.protocol.fields).toEqual(original.protocol.fields);
    expect(parsed.bibliography).toEqual(original.bibliography);
    expect(parsed.protocol.reviewedAt).toBeNull();
  });
  it("rejects unbound citations, duplicates, unexpected fields and unsupported versions", () => {
    const original = syntheticStudyTransfer();
    for (const invalid of [
      { ...original, version: 2 },
      { ...original, command: "untrusted instruction" },
      { ...original, bibliography: [...original.bibliography, ...original.bibliography] },
      { ...original, bibliography: [{ ...original.bibliography[0], url: "https://pubmed.ncbi.nlm.nih.gov/456/" }] },
      { ...original, bibliography: [{ ...original.bibliography[0], url: "https://example.com/" }] },
    ]) expect(() => parseStudyTransfer(JSON.stringify(invalid))).toThrow();
    expect(() => parseStudyTransfer(" ".repeat(STUDY_TRANSFER_LIMIT + 1))).toThrow("250 KB");
  });
  it("opens as source-only work requiring fresh decisions, preserving existing browser conversations", () => {
    const document = { ...syntheticStudyTransfer(), origin: "mac" as const, sourceTimestampKind: "saved" as const };
    const backup = studyTransferBackup(serializeStudyTransfer(document)), turn = backup.threads[0].turns[0];
    expect(turn.protocol?.reviewedAt).toBeNull(); expect(turn.protocol?.fields).toEqual(document.protocol.fields);
    expect(turn.reply).toMatchObject({ status: "sources-only", model: null, answer: null, coverage: [], sourceTimestampKind: "saved" });
    expect(turn.sourceReviews?.[0].decision).toBe("needs-review");
    const existing = { ...backup.threads[0], id: "existing-work", title: "Existing local work" };
    const merged = mergeResearchBackup([existing], backup);
    expect(merged.threads[0]).toEqual(existing); expect(merged.added).toBe(1);
  });
});
