import { z } from "zod";
import { SourceSchema, type AgentSource } from "@/lib/agent-runtime/contracts";
import { ScientistDraft } from "./contracts";

export const BRIEF_FIELDS = ["design", "population", "sample", "intervention", "comparator", "endpoint", "limitations"] as const;
export const BRIEF_LABELS: Record<typeof BRIEF_FIELDS[number], string> = { design: "Study design", population: "Population", sample: "Sample size", intervention: "Intervention / exposure", comparator: "Comparator", endpoint: "Outcome / planned endpoint", limitations: "Stated limitations" };
export const BriefSourceId = z.string().regex(/^(pubmed:\d{1,12}|trials:NCT\d{8})$/);
export const BriefRequest = z.object({ question: z.string().trim().min(3).max(2000), sourceIds: z.array(BriefSourceId).min(1).max(6).refine((ids) => new Set(ids).size === ids.length) }).strict();
export const BriefCell = z.discriminatedUnion("status", [
  z.object({ status: z.literal("quoted"), quote: z.string().min(8).max(600) }).strict(),
  z.object({ status: z.enum(["not-found", "withheld", "unavailable"]) }).strict(),
]);
export const BriefRow = z.object({ sourceId: BriefSourceId, cells: z.record(z.enum(BRIEF_FIELDS), BriefCell) }).strict();
const normalize = (s: string) => s.replace(/\s+/g, " ").trim();
export const usableBriefSource = (s: AgentSource) => s.kind === "trial" || (s.kind === "paper" && s.metadata?.hasAbstract === true && !s.metadata.publicationTypes?.some((t) => /retract/i.test(t)));

export const EvidenceBriefSchema = z.object({
  id: z.string().min(1).max(80), question: z.string().min(3).max(2000),
  selectedIds: z.array(BriefSourceId).min(1).max(6), missingIds: z.array(BriefSourceId).max(6),
  sources: z.array(SourceSchema).min(1).max(6), rows: z.array(BriefRow).min(1).max(6),
  createdAt: z.iso.datetime(), models: z.array(z.string().max(120)).max(8),
  answer: ScientistDraft.nullable(), issues: z.array(z.string().max(100)).max(16),
  title: z.string().min(1).max(160), notes: z.string().max(6000), reviewedAt: z.iso.datetime().nullable(),
}).strict().superRefine((brief, ctx) => {
  const ids = brief.sources.map((s) => s.id);
  if (new Set(brief.selectedIds).size !== brief.selectedIds.length || ids.length + brief.missingIds.length !== brief.selectedIds.length || new Set([...ids, ...brief.missingIds]).size !== brief.selectedIds.length || [...ids, ...brief.missingIds].some((id) => !brief.selectedIds.includes(id)) || new Set(brief.rows.map((r) => r.sourceId)).size !== ids.length || brief.rows.length !== ids.length) ctx.addIssue({ code: "custom", message: "Brief sources must match its selection and rows." });
  for (const source of brief.sources) {
    const expected = source.id.startsWith("pubmed:") ? `https://pubmed.ncbi.nlm.nih.gov/${source.id.slice(7)}/` : `https://clinicaltrials.gov/study/${source.id.slice(7)}`;
    if (source.url !== expected || source.kind !== (source.id.startsWith("pubmed:") ? "paper" : "trial")) ctx.addIssue({ code: "custom", message: "Brief source identity is inconsistent." });
  }
  for (const row of brief.rows) {
    const source = brief.sources.find((s) => s.id === row.sourceId);
    if (!source || Object.values(row.cells).some((cell) => cell.status === "quoted" && (!usableBriefSource(source) || !normalize(source.detail).includes(normalize(cell.quote))))) ctx.addIssue({ code: "custom", message: "Brief passages must belong to their source." });
  }
  for (const finding of brief.answer?.findings ?? []) {
    if (finding.sourceIds.some((id) => !ids.includes(id) || !finding.excerpts.some((e) => e.sourceId === id)) || finding.excerpts.some((e) => {
      const s = brief.sources.find((s) => s.id === e.sourceId);
      return !s || !usableBriefSource(s) || !finding.sourceIds.includes(e.sourceId) || !normalize(s.detail).includes(normalize(e.quote));
    })) ctx.addIssue({ code: "custom", message: "Brief findings must cite their source passages." });
  }
});
export type EvidenceBrief = z.infer<typeof EvidenceBriefSchema>;
export type EvidenceBriefRow = z.infer<typeof BriefRow>;
export function emptyBriefRow(sourceId: string, status: "unavailable" | "not-found" = "unavailable"): EvidenceBriefRow {
  return { sourceId, cells: Object.fromEntries(BRIEF_FIELDS.map((field) => [field, { status }])) as EvidenceBriefRow["cells"] };
}
export function briefSelectionChanged(brief: EvidenceBrief, ids: string[]) { return ids.length !== brief.selectedIds.length || ids.some((id) => !brief.selectedIds.includes(id)); }
export function briefCellText(cell: z.infer<typeof BriefCell>) { return cell.status === "quoted" ? cell.quote : ({ "not-found": "No passage selected in available text", withheld: "Withheld: source check did not pass", unavailable: "Extraction unavailable" })[cell.status]; }

export function briefText(brief: EvidenceBrief, imported = false, stale = false): string {
  return [brief.title, "NutritiScan evidence brief — researcher review required", ...(imported ? ["Imported backup: source and model checks have not been revalidated."] : []), ...(stale ? ["Current relevance decisions differ from the selection used for this brief."] : []),
    `Question: ${brief.question}`, `Retrieved: ${brief.createdAt}`, `Selected sources: ${brief.selectedIds.join(", ")}`, `Missing records: ${brief.missingIds.join(", ") || "None"}`,
    "Scope: available abstracts and registry metadata only. Selected records are not an exhaustive review. Exact passages and model field checks do not grade study quality. Registry endpoints are study descriptions, not efficacy results.",
    ...brief.rows.map((row) => { const s = brief.sources.find((s) => s.id === row.sourceId)!; return `${s.title}\n${s.id}\n${s.url}\n${BRIEF_FIELDS.map((f) => `${BRIEF_LABELS[f]}: ${briefCellText(row.cells[f])}`).join("\n")}`; }),
    ...(brief.answer ? ["Model source-checked findings", ...brief.answer.findings.map((f) => `${f.text}\n${f.excerpts.map((e) => `[${e.sourceId}] ${e.quote}`).join("\n")}`), "Limitations", ...brief.answer.limitations] : ["Narrative unavailable: no source-checked model summary was returned."]),
    "Researcher interpretation — editable; not AI verified", brief.notes || "No interpretation added.", `Researcher marked reviewed: ${brief.reviewedAt ?? "Not yet"}`, `Models: ${brief.models.join(", ") || "None"}`, `Run issues: ${brief.issues.join(", ") || "None recorded"}`,
  ].join("\n\n");
}
const csvCell = (s: string) => `"${(/^[\s\u0000-\u001f]*[=+\-@]|^[\t\r\n]/u.test(s) ? `'${s}` : s).replaceAll('"', '""')}"`;
export function briefCsv(brief: EvidenceBrief) {
  const rows = [["Question", "Source ID", "Title", "URL", "Retrieved", ...BRIEF_FIELDS.flatMap((f) => [BRIEF_LABELS[f], `${BRIEF_LABELS[f]} status`])], ...brief.rows.map((row) => {
    const source = brief.sources.find((s) => s.id === row.sourceId)!;
    return [brief.question, source.id, source.title, source.url, brief.createdAt, ...BRIEF_FIELDS.flatMap((f) => [briefCellText(row.cells[f]), row.cells[f].status])];
  })];
  return `\uFEFF${rows.map((r) => r.map(csvCell).join(",")).join("\r\n")}\r\n`;
}
/** All content is text, including imported researcher notes. No remote assets or scripts. */
export function briefPrintHtml(brief: EvidenceBrief, imported = false, stale = false) {
  const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>${escape(brief.title)}</title><style>body{max-width:800px;margin:36px auto;padding:0 20px;color:#172b24;font:12px/1.7 system-ui}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}@media print{body{margin:0;max-width:none}@page{margin:18mm}}</style><body><pre>${escape(briefText(brief, imported, stale))}</pre></body></html>`;
}
