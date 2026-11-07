import type { ResearchReply } from "./contracts";
import { BIOLOGY_FIELDS, PROTOCOL_SECTIONS, StudyProtocolSchema, type StudyProtocol } from "@/shared/study-plan";
export { PROTOCOL_SECTIONS, StudyProtocolSchema } from "@/shared/study-plan";
export type { ProtocolSectionId, StudyProtocol } from "@/shared/study-plan";

export function protocolGaps(protocol: StudyProtocol) {
  return PROTOCOL_SECTIONS.filter((section) => !protocol.fields[section.id].trim());
}
export function protocolSelectionChanged(protocol: StudyProtocol, selectedIds: string[]) {
  return protocol.sourceIds.length !== selectedIds.length || protocol.sourceIds.some((id) => !selectedIds.includes(id));
}
export function createStudyProtocol(question: string, sourceIds: string[], reply: ResearchReply): StudyProtocol {
  if (sourceIds.some((id) => !reply.sources.some((source) => source.id === id))) throw new Error("Choose sources from this research question.");
  const now = new Date().toISOString();
  return StudyProtocolSchema.parse({
    version: 1, id: crypto.randomUUID(), title: question.slice(0, 160), originQuestion: question,
    sourceIds, fields: Object.fromEntries(PROTOCOL_SECTIONS.map((section) => [section.id, section.id === "question" ? question : ""])),
    createdAt: now, updatedAt: now, reviewedAt: null,
  });
}

/** A draft is investigator-authored. Source selection is a bibliography, not a claim-support check. */
export function protocolText(protocol: StudyProtocol, reply: ResearchReply, selectedIds: string[], imported = false) {
  const gaps = protocolGaps(protocol), stale = protocolSelectionChanged(protocol, selectedIds);
  const reviewed = protocol.reviewedAt && !stale && !imported && !gaps.length;
  return [
    protocol.title, "NutritiScan study protocol — working draft",
    "Investigator-authored planning document. Not ethics approval, a registered protocol, a validated study design or an executed study.",
    `Created: ${protocol.createdAt}\nUpdated: ${protocol.updatedAt}`,
    `Originating research question: ${protocol.originQuestion}`,
    ...(protocol.biologyContext ? ["Biology context snapshot — researcher supplied, not independently validated", ...BIOLOGY_FIELDS.map(({ id, label }) => `${label}: ${protocol.biologyContext![id] || "Not specified"}`)] : []),
    `Review status: ${reviewed ? `Personally marked reviewed at ${protocol.reviewedAt}` : "Review required"}`,
    ...(imported ? ["Imported backup: source content, authorship and previous review marks have not been revalidated."] : []),
    ...(stale ? ["Source selection changed since this draft was created. Review and explicitly update its bibliography before marking it reviewed."] : []),
    `Missing sections: ${gaps.map((section) => section.label).join(", ") || "None blank; completeness does not establish methodological quality."}`,
    ...PROTOCOL_SECTIONS.map((section) => `${section.label}\n${protocol.fields[section.id].trim() || "NOT PROVIDED — investigator input required"}`),
    "Selected bibliography — relevance decisions, not verified support for the proposed methods",
    `${reply.sourceTimestampKind === "saved" ? "Source snapshot saved (original retrieval time unavailable)" : "Search retrieved"}: ${reply.retrievedAt}. Available abstracts and registry metadata; incomplete coverage. Registry records describe studies and do not establish efficacy.`,
    ...protocol.sourceIds.map((id) => { const source = reply.sources.find((item) => item.id === id); return source ? `[${id}] ${source.title}\n${source.url}` : `[${id}] Source unavailable`; }),
    "Institutional protocol templates, supervisor/statistician review and applicable ethics processes remain necessary. No participants are screened or contacted by this document.",
  ].join("\n\n");
}

export function protocolPrintHtml(protocol: StudyProtocol, reply: ResearchReply, selectedIds: string[], imported = false) {
  const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>${escape(protocol.title)}</title><style>body{max-width:800px;margin:36px auto;padding:0 20px;color:#172b24;font:12px/1.7 system-ui}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}@media print{body{margin:0;max-width:none}@page{margin:18mm}}</style><body><pre>${escape(protocolText(protocol, reply, selectedIds, imported))}</pre></body></html>`;
}
