import { checkRate, clientKey, readJsonCapped, tooManyRequests } from "@/lib/http/guard";
import { RunRequestSchema } from "@/lib/agent-runtime/contracts";
import { runAgent } from "@/lib/agent-runtime/run";

export const runtime = "nodejs";
export const maxDuration = 60;

function matchesOrigin(request: Request): boolean {
  try {
    const origin = new URL(request.headers.get("origin") ?? "");
    const url = new URL(request.url);
    // Next's internal URL can use its bind hostname. The browser's Host
    // and the platform-set forwarded protocol identify the public origin.
    const host = request.headers.get("host") ?? url.host;
    const protocol = request.headers.get("x-forwarded-proto")?.split(",")[0].trim() ?? url.protocol.slice(0, -1);
    return ["http", "https"].includes(protocol) && origin.host === host &&
      origin.protocol === `${protocol}:` && origin.pathname === "/" && !origin.search && !origin.hash;
  } catch { return false; }
}

export async function POST(request: Request): Promise<Response> {
  if (!matchesOrigin(request) || request.headers.get("sec-fetch-site") === "cross-site") {
    return Response.json({ error: "Open Agent Studio on this site to start a run." }, { status: 403 });
  }
  const rate = checkRate(`agent-run:${clientKey(request)}`, 6, 60_000);
  if (!rate.ok) return tooManyRequests(rate.retryAfter, "Agent run limit reached. Please wait before starting another run.");
  const body = await readJsonCapped(request, 8192);
  if (!body.ok) return Response.json({ error: body.error }, { status: body.status });
  const parsed = RunRequestSchema.safeParse(body.value);
  if (!parsed.success) return Response.json({ error: "Check your agent settings and enter a task between 3 and 300 characters." }, { status: 400 });

  const cancellation = new AbortController();
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const signal = AbortSignal.any([request.signal, cancellation.signal]);
      await runAgent(parsed.data, { signal, emit: (event) => {
        if (!signal.aborted) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      } });
      if (!cancellation.signal.aborted) controller.close();
    },
    cancel() { cancellation.abort(); },
  });
  return new Response(stream, { headers: {
    "Content-Type": "application/x-ndjson; charset=utf-8",
    "Cache-Control": "no-store, no-transform", "X-Content-Type-Options": "nosniff",
  } });
}
