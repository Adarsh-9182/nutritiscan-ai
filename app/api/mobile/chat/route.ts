import { z } from "zod";
import { POST as webChat } from "@/app/api/chat/route";
import { readJsonCapped } from "@/lib/http/guard";

export const maxDuration = 60;
const schema = z.object({ consent: z.literal(true), messages: z.array(z.object({
  id: z.string().min(1).max(120), role: z.enum(["user", "assistant"]),
  parts: z.array(z.object({ type: z.literal("text"), text: z.string().max(12000) }).strict()).min(1).max(1),
}).strict()).min(1).max(40) }).strict();

/** Native transport for the same safety-checked chat; never executes client actions. */
export async function POST(req: Request) {
  const body = await readJsonCapped(req, 128 * 1024);
  if (!body.ok) return Response.json({ error: body.error }, { status: body.status });
  const parsed = schema.safeParse(body.value);
  if (!parsed.success) return Response.json({ error: "Consent and a valid conversation are required." }, { status: 400 });
  const headers = new Headers(req.headers);
  headers.set("Content-Type", "application/json");
  headers.delete("Content-Length");
  const response = await webChat(new Request(req.url, { method: "POST", headers, body: JSON.stringify({ messages: parsed.data.messages, allowActions: false }), signal: req.signal }));
  if (!response.ok) return response;
  const stream = await response.text();
  let text = "";
  let mode = "unavailable";
  let failed = false;
  for (const line of stream.split("\n")) {
    if (!line.startsWith("data: ") || line.includes("[DONE]")) continue;
    try {
      const part = JSON.parse(line.slice(6));
      if (part.type === "text-delta" && typeof part.delta === "string") text += part.delta;
      if (part.type === "data-mode") mode = part.data.mode;
      if (part.type === "error" || part.type === "abort") failed = true;
    } catch { /* Ignore non-JSON framing, never reinterpret it as an answer. */ }
  }
  if (failed || !text.trim()) return Response.json({ error: "No complete answer was received. Please retry." }, { status: 503 });
  return Response.json({ text, mode }, { headers: { "Cache-Control": "no-store" } });
}
