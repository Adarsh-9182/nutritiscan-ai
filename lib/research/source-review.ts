import { z } from "zod";
import type { ResearchReply } from "./contracts";

export const REVIEW_LABELS = { include: "Include", exclude: "Exclude", "needs-review": "Needs review" } as const;
export const SourceReviewSchema = z.object({
  sourceId: z.string().min(1).max(80),
  decision: z.enum(["include", "exclude", "needs-review"]),
  note: z.string().trim().max(1000),
  updatedAt: z.iso.datetime(),
}).strict();
export type SourceReview = z.infer<typeof SourceReviewSchema>;
export const SourceReviewsSchema = z.array(SourceReviewSchema).max(10)
  .refine((reviews) => new Set(reviews.map((r) => r.sourceId)).size === reviews.length, "Review each source once per question.");

export function sourceReviewCounts(reply: ResearchReply, reviews: SourceReview[] = []) {
  const counts = { include: 0, exclude: 0, "needs-review": 0, unreviewed: 0 };
  for (const source of reply.sources) {
    const review = reviews.find((r) => r.sourceId === source.id);
    counts[review?.decision ?? "unreviewed"]++;
  }
  return counts;
}

/** Quote every cell and neutralize spreadsheet formulas in untrusted text. */
function csvCell(value: string) {
  const safe = /^[\s\u0000-\u001f]*[=+\-@]|^[\t\r\n]/u.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function sourceReviewCsv(question: string, reply: ResearchReply, reviews: SourceReview[] = []) {
  const rows = [["Question", "Source ID", "Title", "Source", "Year", "URL", "Retrieved at", "Researcher decision", "Reason / note", "Reviewed at"]];
  for (const source of reply.sources) {
    const review = reviews.find((r) => r.sourceId === source.id);
    rows.push([question, source.id, source.title, source.kind === "trial" ? "ClinicalTrials.gov" : "PubMed",
      source.metadata?.year?.toString() ?? "", source.url, reply.retrievedAt,
      review ? REVIEW_LABELS[review.decision] : "Unreviewed", review?.note ?? "", review?.updatedAt ?? ""]);
  }
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

export function sourceReviewText(reply: ResearchReply, reviews: SourceReview[] = []) {
  return ["Researcher source decisions — relevance to this question only",
    "Manual decisions do not validate the AI draft or grade evidence quality. The draft still contains all retrieved sources.",
    ...reply.sources.map((source) => {
      const review = reviews.find((r) => r.sourceId === source.id);
      return `${source.id}: ${review ? REVIEW_LABELS[review.decision] : "Unreviewed"}${review ? `\nReason / note: ${review.note || "Not provided"}\nReviewed: ${review.updatedAt}` : ""}`;
    })].join("\n\n");
}
