import { matchesOrigin } from "@/lib/agent-runtime/origin";
import { checkRateShared, clientKey, readJsonCapped, tooManyRequests } from "@/lib/http/guard";
import { BriefRequest } from "@/lib/research/brief";
import { runBrief } from "@/lib/research/brief-agent";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  if (!matchesOrigin(request) || request.headers.get("sec-fetch-site") === "cross-site") return Response.json({ error: "Open Research chat on this site to create a brief." }, { status: 403 });
  const rate = await checkRateShared(`research-brief:${clientKey(request)}`, 3, 60_000);
  if (!rate.ok) return tooManyRequests(rate.retryAfter, "Brief request limit reached. Wait before retrying.");
  const body = await readJsonCapped(request, 12_000);
  if (!body.ok) return Response.json({ error: body.error }, { status: body.status });
  const parsed = BriefRequest.safeParse(body.value);
  if (!parsed.success) return Response.json({ error: "Select one to six unique PubMed or trial records for a valid research question." }, { status: 400 });
  try {
    const brief = await runBrief(parsed.data, AbortSignal.any([request.signal, AbortSignal.timeout(55_000)]));
    return Response.json(brief, { headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
  } catch {
    return Response.json({ error: "Brief could not finish. Existing work is unchanged; retry when source or model access returns." }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
