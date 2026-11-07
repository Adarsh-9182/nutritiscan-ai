import { parseStudyTransfer } from "@/shared/study-plan";
import { parseResearchBackup, type ResearchBackup } from "./backup";

/** Open an imported draft as a separate source-only conversation, without inference or retrieval. */
export function studyTransferBackup(raw: string): ResearchBackup {
  const document = parseStudyTransfer(raw), now = new Date().toISOString();
  const sources = [...new Set(document.bibliography.map((source) => source.kind === "paper" ? "pubmed" : "trials"))];
  return parseResearchBackup(JSON.stringify({ format: "nutritiscan-research", version: 1, exportedAt: document.exportedAt,
    threads: [{ id: crypto.randomUUID(), title: document.protocol.title, query: "", updatedAt: Date.now(), importedAt: now,
      turns: [{ id: crypto.randomUUID(), request: { message: document.protocol.originQuestion, query: "", searchMode: "auto", mode: "study-plan", sources }, phase: "done",
        protocol: document.protocol,
        sourceReviews: document.bibliography.map((source) => ({ sourceId: source.id, decision: "needs-review", note: "Bibliography carried from an imported study draft. Review the original before choosing Include.", updatedAt: now })),
        reply: { sources: document.bibliography, answer: null, model: null, status: "sources-only", coverage: [],
          notice: `Imported study draft. No new search or AI answer was generated. Source content and authorship have not been revalidated.${document.sourceTimestampKind === "saved" ? " The recorded source time is when the snapshot was saved; original retrieval time is unavailable." : ""}`,
          retrievedAt: document.retrievedAt, sourceTimestampKind: document.sourceTimestampKind,
        },
      }],
    }],
  }));
}
