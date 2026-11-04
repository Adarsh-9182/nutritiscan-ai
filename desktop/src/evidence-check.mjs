import { z } from "zod";
export const EvidenceClaims = z.array(z.object({ claim: z.string().trim().min(3).max(1200), sourceId: z.string().min(1).max(80), quote: z.string().trim().min(12).max(1000) }).strict()).min(1).max(6);
const normalized = (s) => s.replace(/\s+/g, " ").trim();
/** Quote membership only: this does not establish claim entailment or study quality. */
export function verifyEvidence(value, sources) {
  const claims = EvidenceClaims.parse(value);
  return claims.map((claim) => {
    const source = sources.find((s) => s.id === claim.sourceId);
    const unusable = source?.kind === "paper" && (source.metadata?.hasAbstract === false || source.metadata?.publicationTypes?.some((t) => /retract/i.test(t)) || /Retraction-related|No abstract returned/.test(source.notice ?? ""));
    const found = source && !unusable && normalized(source.detail).includes(normalized(claim.quote));
    return { ...claim, status: found ? "quote-found" : "withheld", reason: !source ? "Source was not retrieved in this investigation." : unusable ? "Paper is retraction-related or has no available abstract." : !found ? "Exact passage was not found in this source snapshot." : source.kind === "trial" ? "Exact passage found in registry metadata; no efficacy result is established." : "Exact passage found in available source text; the claim still requires contextual and scientific review." };
  });
}
