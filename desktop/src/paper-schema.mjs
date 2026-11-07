import { z } from "zod";
export const digest = z.string().regex(/^[a-f\d]{64}$/);
export const PaperSection = z.object({ id: z.string().regex(/^[ps]\d{1,4}$/), label: z.string().min(1).max(200), page: z.number().int().min(1).max(80).nullable(), text: z.string().max(40000), status: z.enum(["readable", "no-text"]) }).strict();
export const PaperDocument = z.object({
  format: z.literal("nutritiscan-paper"), version: z.literal(1), kind: z.enum(["local-pdf", "pmc-fulltext"]),
  title: z.string().min(1).max(1000), author: z.string().max(2000), engine: z.string().max(100),
  source: z.object({ sha256: digest, bytes: z.number().int().min(1).max(20000000), originalName: z.string().max(255).nullable(), pmcid: z.string().regex(/^PMC\d{1,9}$/).nullable(), url: z.url().nullable(), license: z.object({ label: z.string().min(1).max(200), text: z.string().max(12000) }).strict().nullable() }).strict(),
  sections: z.array(PaperSection).min(1).max(500), limitations: z.array(z.string().max(1000)).max(10),
}).strict().refine((doc) => doc.sections.reduce((n, section) => n + section.text.length, 0) <= 400000, "The document exceeds the text limit; no passages were truncated.")
  .refine((doc) => new Set(doc.sections.map((s) => s.id)).size === doc.sections.length, "Document section IDs must be unique.");
export const PaperReference = z.object({
  id: z.string().uuid(), kind: z.enum(["local-pdf", "pmc-fulltext"]), title: z.string().min(1).max(1000), importedAt: z.string().datetime(),
  contentSha256: digest, snapshotSha256: digest, sourceSha256: digest,
  snapshotPath: z.string().regex(/^papers\/[a-f\d-]{36}\.paper\.json$/), originalPath: z.string().regex(/^papers\/[a-f\d-]{36}\.(?:pdf|bioc\.json)$/),
  sectionCount: z.number().int().min(1).max(500), readableCount: z.number().int().min(0).max(500),
  pmcid: z.string().regex(/^PMC\d{1,9}$/).nullable(), url: z.url().nullable(), license: z.string().max(200).nullable(),
}).strict();
export const PaperClaims = z.array(z.object({ paperId: z.string().uuid(), sectionId: z.string().regex(/^[ps]\d{1,4}$/), contentSha256: digest, claim: z.string().trim().min(3).max(1200), quote: z.string().trim().min(12).max(1000) }).strict()).min(1).max(6);
export const PaperCheck = PaperClaims.element.extend({ status: z.enum(["quote-found", "withheld"]), reason: z.string().max(500), checkedAt: z.string().datetime(), citationUrl: z.string().max(200) }).strict();
export function paperCitation(paperId, sectionId) { return `nutritiscan://paper/${encodeURIComponent(paperId)}/${encodeURIComponent(sectionId)}`; }
export function parsePaperCitation(value) {
  if (typeof value !== "string" || value.length > 200) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "nutritiscan:" || url.hostname !== "paper" || url.username || url.password || url.port || url.search || url.hash) return null;
    const parts = url.pathname.slice(1).split("/").map(decodeURIComponent);
    if (parts.length !== 2 || !z.string().uuid().safeParse(parts[0]).success || !/^[ps]\d{1,4}$/.test(parts[1])) return null;
    return { paperId: parts[0], sectionId: parts[1] };
  } catch { return null; }
}
