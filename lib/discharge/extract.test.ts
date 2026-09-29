import { describe, expect, it } from "vitest";
import { extractPendingTests, SYNTHETIC_DISCHARGE_NOTE } from "./extract";

describe("synthetic pending-test extraction", () => {
  it("keeps the document, page, line and exact source excerpt with each candidate", () => {
    expect(extractPendingTests(SYNTHETIC_DISCHARGE_NOTE)).toEqual([{
      testName: "Urine culture",
      documentId: "SYN-DOC-2047",
      documentTitle: "Fictional discharge note",
      page: 1,
      line: 4,
      excerpt: "Pending test: Urine culture | collected before discharge.",
    }]);
  });

  it("does not invent a pending test from an ordinary plan or a blank label", () => {
    expect(extractPendingTests({
      id: "SYN-EMPTY",
      title: "Fictional empty note",
      pages: ["Plan: Review results when available.\nPending test:   | none listed."],
    })).toEqual([]);
  });
});
