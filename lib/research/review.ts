import { z } from "zod";
import type { AgentSource } from "@/lib/agent-runtime/contracts";
import type { ScientistOutput } from "./contracts";

/** Select already provenance-checked passages; do not ask a model to retype them. */
export const PassageReviewSchema = z.object({
  items: z.array(z.object({
    index: z.number().int().min(0).max(5),
    verdict: z.enum(["supported", "partial", "unsupported"]),
    reason: z.string().min(1).max(400),
    evidenceIndexes: z.array(z.number().int().min(0).max(2)).max(3),
  }).strict()).min(1).max(6),
}).strict();

export function resolvePassageReview(value: unknown, findings: ScientistOutput["findings"]) {
  const parsed = PassageReviewSchema.safeParse(value);
  if (!parsed.success) return null;
  const items = [];
  for (const item of parsed.data.items) {
    const finding = findings[item.index];
    if (!finding || new Set(item.evidenceIndexes).size !== item.evidenceIndexes.length) return null;
    const evidence = item.evidenceIndexes.map((index) => finding.excerpts[index]);
    if (evidence.some((e) => !e)) return null;
    if (item.verdict === "supported" && finding.sourceIds.some((id) => !evidence.some((e) => e.sourceId === id))) return null;
    items.push({ index: item.index, verdict: item.verdict, reason: item.reason, evidence });
  }
  return { items };
}

// Research chat owns its review contract so a release does not depend on
// unrelated, in-progress Agent Studio changes in another working tree.
export const ClaimReviewSchema = z.object({
  items: z.array(z.object({
    index: z.number().int().min(0).max(5),
    verdict: z.enum(["supported", "partial", "unsupported"]),
    reason: z.string().min(1).max(400),
    evidence: z.array(z.object({ sourceId: z.string().max(80), quote: z.string().min(15).max(500) }).strict()).max(3),
  }).strict()).min(1).max(6),
}).strict();

export function validateReview(value: unknown, summary: { points: { text: string; sourceIds: string[] }[] }, sources: AgentSource[]) {
  const parsed = ClaimReviewSchema.safeParse(value);
  if (!parsed.success || parsed.data.items.length !== summary.points.length) return null;
  const normalize = (text: string) => text.replace(/\s+/g, " ").trim();
  const seen = new Set<number>();
  for (const item of parsed.data.items) {
    const point = summary.points[item.index];
    if (!point || seen.has(item.index) || (item.verdict === "supported" && !item.evidence.length)) return null;
    seen.add(item.index);
    for (const evidence of item.evidence) {
      const source = sources.find((source) => source.id === evidence.sourceId);
      if (!source || !point.sourceIds.includes(source.id) || !normalize(source.detail).includes(normalize(evidence.quote))) return null;
      if (item.verdict === "supported" && source.kind === "paper" && source.metadata?.hasAbstract === false) return null;
    }
  }
  return parsed.data;
}
