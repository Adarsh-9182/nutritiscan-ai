import type { ResearchReply } from "./contracts";
import type { SourceReview } from "./source-review";

/** Export available metadata only, with control characters removed to prevent tag injection. */
export function includedSourcesRis(reply: ResearchReply, reviews: SourceReview[] = []) {
  const line = (tag: string, value: string) => `${tag}  - ${value.replace(/[\u0000-\u001f\u007f]/g, " ").trim()}\r\n`;
  return reply.sources.filter((s) => reviews.some((r) => r.sourceId === s.id && r.decision === "include")).map((source) => {
    const review = reviews.find((r) => r.sourceId === source.id)!;
    return line("TY", source.kind === "paper" ? "JOUR" : "GEN") + line("ID", source.id) + line("TI", source.title) +
      line("UR", source.url) + (source.metadata?.year ? line("PY", String(source.metadata.year)) : "") +
      line("DB", source.kind === "trial" ? "ClinicalTrials.gov" : "PubMed") + line("Y2", reply.retrievedAt.slice(0, 10).replaceAll("-", "/")) +
      line("N1", `Included for relevance only; not a quality rating. ${source.kind === "trial" ? "Registry record; not efficacy evidence. " : ""}${review.note}`) + "ER  - \r\n\r\n";
  }).join("");
}
