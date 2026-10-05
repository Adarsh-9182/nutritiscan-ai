import { z } from "zod";
import { checkRate, clientKey, readJsonCapped, tooManyRequests } from "@/lib/http/guard";
import { findPapers } from "@/lib/evidence/pubmed";
import { searchTrials } from "@/lib/evidence/trials";

export const maxDuration = 20;

const RequestSchema = z.object({
  question: z.string().trim().min(3).max(300),
}).strict();

export async function POST(request: Request): Promise<Response> {
  const rate = checkRate(`research:${clientKey(request)}`, 8, 60_000);
  if (!rate.ok) return tooManyRequests(rate.retryAfter, "Research search limit reached. Try again shortly.");

  const body = await readJsonCapped(request, 4_096);
  if (!body.ok) return Response.json({ error: body.error }, { status: body.status, headers: { "cache-control": "no-store" } });
  const parsed = RequestSchema.safeParse(body.value);
  if (!parsed.success) return Response.json({ error: "Enter a research question between 3 and 300 characters." }, { status: 400, headers: { "cache-control": "no-store" } });

  const question = parsed.data.question;
  const [papers, trials] = await Promise.all([
    findPapers(question, { limit: 8, signal: request.signal }),
    searchTrials(question, { limit: 8, signal: request.signal }),
  ]);
  const response = {
    question,
    retrievedAt: new Date().toISOString(),
    sources: { pubmed: papers, clinicalTrials: trials },
    limitations: [
      "This is a search of indexed metadata and available abstracts, not a systematic review.",
      "Search rank does not measure study quality; registry entries do not show that an intervention works.",
      "Some abstracts are incomplete and full-text papers may not be available here.",
    ],
  };
  return Response.json(response, { headers: { "cache-control": "no-store" } });
}
