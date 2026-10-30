import { matchesOrigin } from "@/lib/agent-runtime/origin";
import { checkRateShared, clientKey, readJsonCapped, tooManyRequests } from "@/lib/http/guard";
import { ResearchChatRequest, type ResearchStreamEvent } from "@/lib/research/contracts";
import { researchProviderStatus } from "@/lib/research/provider";
import { runScience } from "@/lib/research/scientist";

export const runtime = "nodejs";
export const maxDuration = 60;

export function GET() {
  return Response.json(researchProviderStatus(), { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  if (!matchesOrigin(request) || request.headers.get("sec-fetch-site") === "cross-site") {
    return Response.json({ error: "Open Research chat on this site to start a run." }, { status: 403 });
  }
  const rate = await checkRateShared(`research-chat:${clientKey(request)}`, 5, 60_000);
  if (!rate.ok) return tooManyRequests(rate.retryAfter, "Research request limit reached. Please wait before retrying.");
  const body = await readJsonCapped(request, 40_000);
  if (!body.ok) return Response.json({ error: body.error }, { status: body.status });
  const parsed = ResearchChatRequest.safeParse(body.value);
  if (!parsed.success) return Response.json({ error: "Enter a research question, valid search terms and at least one public source." }, { status: 400 });

  const cancel = new AbortController();
  const signal = AbortSignal.any([request.signal, cancel.signal, AbortSignal.timeout(50_000)]);
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: ResearchStreamEvent) => { if (!signal.aborted) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`)); };
      try { emit({ type: "step", text: "Preparing your research question…" }); emit({ type: "result", result: await runScience(parsed.data, signal, emit) }); }
      catch { if (!cancel.signal.aborted && !request.signal.aborted) controller.enqueue(encoder.encode(`${JSON.stringify({ type: "error", error: "Research stopped before completion. Your question is retained; retry when source or model access returns." })}\n`)); }
      finally { if (!cancel.signal.aborted) controller.close(); }
    },
    cancel() { cancel.abort(); },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store, no-transform", "x-content-type-options": "nosniff" } });
}
