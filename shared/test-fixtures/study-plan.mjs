import { PROTOCOL_SECTIONS, studyTransfer } from "../study-plan.ts";

// Fictional content for software checks. This does not describe the linked paper.
export function syntheticStudyTransfer() {
  const at = "2026-11-07T00:00:00.000Z";
  const protocol = {
    version: 1, id: "1b1973e2-dbc2-4ffd-9034-fefc227bd4dd", title: "Fictional transfer study",
    originQuestion: "Can a fictional study draft round-trip without losing its bibliography?", sourceIds: ["pubmed:123"],
    fields: Object.fromEntries(PROTOCOL_SECTIONS.map(({ id }) => [id, id === "question" ? "Synthetic software question" : ""])),
    createdAt: at, updatedAt: at, reviewedAt: at,
    biologyContext: { disease: "Fictional software-test process", organism: "Synthetic cell model", objective: "Test software transfer only" },
  };
  return studyTransfer(protocol, [{ id: "pubmed:123", kind: "paper", title: "Fictional test source; not real paper content", url: "https://pubmed.ncbi.nlm.nih.gov/123/", detail: "This fictional source tests software data transfer, not biological evidence.", metadata: { year: 2026, hasAbstract: true } }], at, "web");
}
