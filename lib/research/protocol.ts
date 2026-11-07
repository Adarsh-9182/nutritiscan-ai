import { z } from "zod";
import type { ResearchReply } from "./contracts";
import { BriefSourceId } from "./brief";

export const PROTOCOL_SECTIONS = [
  { id: "question", label: "Research question", group: "Question and rationale", help: "State the population, question and intended scope. Use public research information only." },
  { id: "rationale", label: "Rationale and evidence gap", group: "Question and rationale", help: "Explain the gap and reference the selected source IDs. A search result does not establish novelty." },
  { id: "population", label: "Population and setting", group: "Participants and methods", help: "Describe who or what will be studied, the setting and relevant limitations." },
  { id: "eligibility", label: "Eligibility criteria", group: "Participants and methods", help: "Define inclusion and exclusion criteria. Do not enter identifiable participant information." },
  { id: "intervention", label: "Intervention or exposure", group: "Participants and methods", help: "Describe the proposed exposure or intervention; for a noninterventional study, explain what is observed." },
  { id: "comparator", label: "Comparator", group: "Participants and methods", help: "Specify the comparison, or explain why it is not applicable." },
  { id: "outcomes", label: "Outcomes and measurement timing", group: "Participants and methods", help: "Define the primary outcome, measurement method and time points before analysis." },
  { id: "methods", label: "Study design and data collection", group: "Participants and methods", help: "Describe the design, data sources, collection process, controls and potential confounders." },
  { id: "sampleSize", label: "Sample size rationale", group: "Analysis and oversight", help: "Document assumptions and the calculation or feasibility rationale. Arrange statistical review; no sample size is inferred here." },
  { id: "analysis", label: "Statistical analysis plan", group: "Analysis and oversight", help: "Predefine analyses, missing-data handling, confounders and sensitivity checks. No analysis is executed." },
  { id: "ethics", label: "Ethics, consent and data management", group: "Analysis and oversight", help: "Document required institutional review, consent, permissions, storage and retention. This draft grants no approval." },
] as const;
export type ProtocolSectionId = typeof PROTOCOL_SECTIONS[number]["id"];
const sectionIds = PROTOCOL_SECTIONS.map((section) => section.id) as [ProtocolSectionId, ...ProtocolSectionId[]];

export const StudyProtocolSchema = z.object({
  version: z.literal(1), id: z.string().uuid(), title: z.string().trim().min(1).max(160),
  originQuestion: z.string().min(3).max(2000),
  sourceIds: z.array(BriefSourceId).min(1).max(10).refine((ids) => new Set(ids).size === ids.length),
  fields: z.record(z.enum(sectionIds), z.string().max(2000)),
  createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(), reviewedAt: z.iso.datetime().nullable(),
}).strict();
export type StudyProtocol = z.infer<typeof StudyProtocolSchema>;

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
    `Review status: ${reviewed ? `Personally marked reviewed at ${protocol.reviewedAt}` : "Review required"}`,
    ...(imported ? ["Imported backup: source content, authorship and previous review marks have not been revalidated."] : []),
    ...(stale ? ["Source selection changed since this draft was created. Review and explicitly update its bibliography before marking it reviewed."] : []),
    `Missing sections: ${gaps.map((section) => section.label).join(", ") || "None blank; completeness does not establish methodological quality."}`,
    ...PROTOCOL_SECTIONS.map((section) => `${section.label}\n${protocol.fields[section.id].trim() || "NOT PROVIDED — investigator input required"}`),
    "Selected bibliography — relevance decisions, not verified support for the proposed methods",
    `Search retrieved: ${reply.retrievedAt}. Available abstracts and registry metadata; incomplete coverage. Registry records describe studies and do not establish efficacy.`,
    ...protocol.sourceIds.map((id) => { const source = reply.sources.find((item) => item.id === id); return source ? `[${id}] ${source.title}\n${source.url}` : `[${id}] Source unavailable`; }),
    "Institutional protocol templates, supervisor/statistician review and applicable ethics processes remain necessary. No participants are screened or contacted by this document.",
  ].join("\n\n");
}

export function protocolPrintHtml(protocol: StudyProtocol, reply: ResearchReply, selectedIds: string[], imported = false) {
  const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>${escape(protocol.title)}</title><style>body{max-width:800px;margin:36px auto;padding:0 20px;color:#172b24;font:12px/1.7 system-ui}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}@media print{body{margin:0;max-width:none}@page{margin:18mm}}</style><body><pre>${escape(protocolText(protocol, reply, selectedIds, imported))}</pre></body></html>`;
}
