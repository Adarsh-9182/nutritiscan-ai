export type SyntheticDocument = {
  id: string;
  title: string;
  pages: string[];
};

export type PendingTestCandidate = {
  testName: string;
  documentId: string;
  documentTitle: string;
  page: number;
  line: number;
  excerpt: string;
};

export const SYNTHETIC_DISCHARGE_NOTE: SyntheticDocument = {
  id: "SYN-DOC-2047",
  title: "Fictional discharge note",
  pages: [
    [
      "DISCHARGE NOTE · SYN-2047",
      "Adult patient discharged 28 Sep 2026.",
      "Reason for visit: fictional example for workflow review.",
      "Pending test: Urine culture | collected before discharge.",
      "Plan: Treating team to review the result when available.",
      "Follow-up: Clinic appointment to be arranged by the care team.",
    ].join("\n"),
  ],
};

export const SYNTHETIC_LAB_RESULT = {
  documentId: "SYN-LAB-102",
  title: "Fictional lab result",
  testName: "Urine culture",
  text: "No growth at 48 hours. This fictional value is for workflow demonstration only.",
} as const;

/** Strict rule extraction: a candidate is never treated as confirmed until reviewed. */
export function extractPendingTests(document: SyntheticDocument): PendingTestCandidate[] {
  return document.pages.flatMap((pageText, pageIndex) =>
    pageText.split(/\r?\n/).flatMap((lineText, lineIndex) => {
      const match = /^\s*Pending test:\s*([^|\n]+?)(?:\s*\||\s*$)/i.exec(lineText);
      const testName = match?.[1]?.trim();
      if (!testName) return [];
      return [{
        testName,
        documentId: document.id,
        documentTitle: document.title,
        page: pageIndex + 1,
        line: lineIndex + 1,
        excerpt: lineText.trim(),
      }];
    }),
  );
}
