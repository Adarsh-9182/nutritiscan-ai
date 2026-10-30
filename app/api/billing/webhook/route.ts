import { z } from "zod";
import { readJsonCapped } from "@/lib/http/guard";
import { billingProvider, fetchSubscription, verifyWebhook, webhookReference } from "@/lib/billing/provider";
import { billingStore } from "@/lib/billing/store";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  const provider = billingProvider();
  if (!provider) return Response.json({ error: "Billing is not configured." }, { status: 503 });
  // Preserve exact raw bytes while enforcing a strict upper bound.
  const reader = request.body?.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  if (!reader) return new Response(null, { status: 400 });
  for (;;) { const next = await reader.read(); if (next.done) break; size += next.value.length; if (size > 256_000) { await reader.cancel(); return new Response(null, { status: 413 }); } chunks.push(next.value); }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!verifyWebhook(provider, raw, request.headers)) return new Response(null, { status: 400 });
  const body = await readJsonCapped(new Request(request.url, { method: "POST", body: raw }), 256_000);
  if (!body.ok || !body.value || typeof body.value !== "object") return new Response(null, { status: 400 });
  const event = body.value as Record<string, unknown>;
  const id = provider === "stripe" ? event.id : request.headers.get("x-razorpay-event-id");
  if (!z.string().min(1).max(200).safeParse(id).success) return new Response(null, { status: 400 });
  try {
    const checkedAt = new Date().toISOString();
    const ref = await webhookReference(provider, event);
    const store = await billingStore();
    if (ref.hold) await store.holdReferences(provider, ref.holdReferences, "payment_review");
    if (ref.subscription) {
      const snapshot = await fetchSubscription(provider, ref.subscription);
      await store.applyEvent(provider, id as string, snapshot, checkedAt);
      // Holds are deliberately not cleared by later active/reordered events.
      if (ref.hold) await store.hold(provider, ref.subscription, "payment_review");
    }
    return Response.json({ received: true }, { headers: { "cache-control": "no-store" } });
  } catch { return Response.json({ error: "Billing verification will be retried." }, { status: 503 }); }
}
