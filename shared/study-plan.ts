import { z } from "zod";

export const BriefSourceId = z.string().regex(/^(pubmed:\d{1,12}|trials:NCT\d{8})$/);

export const SourceSchema = z.object({
  id: z.string().max(80),
  title: z.string().max(2000),
  url: z.string().url().max(2000).refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password && !url.port &&
        ["medlineplus.gov", "ods.od.nih.gov", "pubmed.ncbi.nlm.nih.gov", "clinicaltrials.gov"].includes(url.hostname);
    } catch { return false; }
  }, "Only approved public source URLs are supported."),
  kind: z.enum(["reference", "paper", "trial"]),
  detail: z.string().max(12000),
  metadata: z.object({
    year: z.number().int().min(1000).max(9999).nullable().optional(),
    publicationTypes: z.array(z.string().max(200)).max(30).optional(),
    hasAbstract: z.boolean().optional(),
    studyType: z.string().max(200).optional(),
    status: z.string().max(200).optional(),
  }).strict().optional(),
}).strict();
export type AgentSource = z.infer<typeof SourceSchema>;

export const BIOLOGY_FIELDS = [
  { id: "disease", label: "Disease or biological process" },
  { id: "organism", label: "Organism or model system" },
  { id: "assay", label: "Assay, measurement and units" },
  { id: "cohort", label: "Cohort, population and sample" },
  { id: "objective", label: "Research objective and decision" },
  { id: "limitations", label: "Known limitations and confounders" },
] as const;
export const BiologyContextSchema = z.object({
  disease: z.string().max(600).default(""), organism: z.string().max(600).default(""),
  assay: z.string().max(600).default(""), cohort: z.string().max(600).default(""),
  objective: z.string().max(600).default(""), limitations: z.string().max(600).default(""),
}).strict();

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
  biologyContext: BiologyContextSchema.optional(),
}).strict();
export type StudyProtocol = z.infer<typeof StudyProtocolSchema>;

export const STUDY_TRANSFER_LIMIT = 250_000;
export const StudyTransferSchema = z.object({
  format: z.literal("nutritiscan-study-plan"), version: z.literal(1),
  exportedAt: z.iso.datetime(), origin: z.enum(["web", "mac"]),
  protocol: StudyProtocolSchema,
  bibliography: z.array(SourceSchema).min(1).max(10),
  retrievedAt: z.iso.datetime(),
  sourceTimestampKind: z.enum(["retrieved", "saved"]),
}).strict().superRefine((value, context) => {
  const ids = value.bibliography.map((source) => source.id);
  if (new Set(ids).size !== ids.length || ids.length !== value.protocol.sourceIds.length || ids.some((id) => !value.protocol.sourceIds.includes(id))) {
    context.addIssue({ code: "custom", message: "The bibliography must match the draft's source IDs exactly." });
  }
  for (const source of value.bibliography) {
    const paper = source.id.startsWith("pubmed:");
    const expected = paper ? `https://pubmed.ncbi.nlm.nih.gov/${source.id.slice(7)}/` : `https://clinicaltrials.gov/study/${source.id.slice(7)}`;
    if (!BriefSourceId.safeParse(source.id).success || source.url !== expected || source.kind !== (paper ? "paper" : "trial")) {
      context.addIssue({ code: "custom", message: "Source identifiers, kinds and public URLs must agree." });
    }
  }
});
export type StudyTransfer = z.infer<typeof StudyTransferSchema>;

export function studyTransfer(protocol: StudyProtocol, bibliography: AgentSource[], retrievedAt: string, origin: StudyTransfer["origin"], sourceTimestampKind: StudyTransfer["sourceTimestampKind"] = "retrieved"): StudyTransfer {
  return StudyTransferSchema.parse({
    format: "nutritiscan-study-plan", version: 1, exportedAt: new Date().toISOString(), origin,
    protocol, bibliography: bibliography.filter((source) => protocol.sourceIds.includes(source.id)), retrievedAt, sourceTimestampKind,
  });
}

export function serializeStudyTransfer(document: StudyTransfer) {
  const raw = JSON.stringify(StudyTransferSchema.parse(document), null, 2);
  if (new TextEncoder().encode(raw).length > STUDY_TRANSFER_LIMIT) throw new Error("This study draft exceeds the 250 KB transfer limit.");
  return raw;
}

/** A transfer is user-supplied data, never proof of source validation or approval. */
export function parseStudyTransfer(raw: string): StudyTransfer {
  if (new TextEncoder().encode(raw).length > STUDY_TRANSFER_LIMIT) throw new Error("Choose a NutritiScan study draft smaller than 250 KB.");
  try {
    const value = StudyTransferSchema.parse(JSON.parse(raw));
    return { ...value, protocol: { ...value.protocol, reviewedAt: null } };
  } catch { throw new Error("This is not a supported NutritiScan study draft. No existing work was changed."); }
}

export function studyPlanText(document: StudyTransfer) {
  const { protocol } = StudyTransferSchema.parse(document);
  const missing = PROTOCOL_SECTIONS.filter(({ id }) => !protocol.fields[id].trim());
  return [protocol.title, "NutritiScan study protocol — working draft",
    "Investigator-authored planning document. Not ethics approval, a registered protocol, an executed study or validated methodology.",
    `Originating research question: ${protocol.originQuestion}`,
    ...(protocol.biologyContext ? ["Biology context snapshot — researcher supplied, not independently validated", ...BIOLOGY_FIELDS.map(({ id, label }) => `${label}: ${protocol.biologyContext![id] || "Not specified"}`)] : []),
    `Created: ${protocol.createdAt}\nUpdated: ${protocol.updatedAt}\nReview required. Transfer does not revalidate source content or previous review marks.`,
    `Missing sections: ${missing.map(({ label }) => label).join(", ") || "None blank; completeness does not establish methodological quality."}`,
    ...PROTOCOL_SECTIONS.map(({ id, label }) => `${label}\n${protocol.fields[id].trim() || "NOT PROVIDED — investigator input required"}`),
    "Selected bibliography — relevance decisions, not verified support for the proposed methods",
    `Source snapshot ${document.sourceTimestampKind === "retrieved" ? "retrieved" : "saved (original retrieval time unavailable)"}: ${document.retrievedAt}. Available abstracts and registry metadata only; incomplete coverage. Registry records do not establish efficacy.`,
    ...document.bibliography.map((source) => `[${source.id}] ${source.title}\n${source.url}`),
    "Institutional templates, supervisor/statistician review and applicable ethics processes remain necessary.",
  ].join("\n\n");
}

