// ============================================================
import { hasAnyModel } from "../agents/provider";
// REQUEST GUARDS
//
// Both API routes are unauthenticated and call a paid frontier model.
// Without a limiter, a single `while true; do curl; done` drains the
// billing account and takes the product down for everyone.
//
// SCOPE, HONESTLY: this is an in-memory fixed-window counter. It is
// per-instance, so on serverless it bounds one warm lambda rather than
// the fleet, and it resets on cold start. That is materially better
// than nothing and costs no infrastructure, but it is NOT the real
// answer — the real answer is a shared counter (Upstash Redis / Vercel
// KV) keyed the same way. `checkRate` is deliberately shaped so that
// swap is a one-function change.
// ============================================================

type Window = { count: number; resetAt: number };

const buckets = new Map<string, Window>();

/** Bound the map so a spray of unique IPs can't grow it without limit. */
const MAX_TRACKED = 10_000;

function sweep(now: number) {
  if (buckets.size < MAX_TRACKED) return;
  for (const [k, w] of buckets) if (w.resetAt <= now) buckets.delete(k);
  // Still full of live windows? Drop the oldest rather than grow forever.
  if (buckets.size >= MAX_TRACKED) {
    const oldest = [...buckets.entries()].sort((a, b) => a[1].resetAt - b[1].resetAt).slice(0, MAX_TRACKED / 4);
    for (const [k] of oldest) buckets.delete(k);
  }
}

/**
 * Best-effort client identity. `x-forwarded-for` is spoofable in general,
 * but on Vercel the platform overwrites it at the edge, so the leftmost
 * entry is trustworthy there.
 */
export function clientKey(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "anonymous";
}

export type RateVerdict = { ok: true } | { ok: false; retryAfter: number };

export function checkRate(key: string, limit: number, windowMs: number): RateVerdict {
  const now = Date.now();
  sweep(now);

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }
  if (existing.count >= limit) {
    return { ok: false, retryAfter: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)) };
  }
  existing.count++;
  return { ok: true };
}

/** A 429 that tells the client, and any proxy, exactly how long to wait. */
export function tooManyRequests(retryAfter: number, message: string): Response {
  return Response.json(
    { error: message },
    { status: 429, headers: { "retry-after": String(retryAfter), "cache-control": "no-store" } },
  );
}

/**
 * Read a JSON body with a hard byte ceiling.
 *
 * The scan route accepts a base64 image. The browser downscales before
 * upload, but the browser is not a trust boundary — a crafted POST can
 * carry an arbitrarily large string straight into the model.
 */
export async function readJsonCapped(req: Request, maxBytes: number): Promise<{ ok: true; value: unknown } | { ok: false; status: number; error: string }> {
  const declared = Number(req.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > maxBytes) {
    return { ok: false, status: 413, error: "That request is too large." };
  }

  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return { ok: false, status: 400, error: "Could not read the request body." };
  }

  // content-length can lie or be absent under chunked encoding, so measure.
  if (raw.length > maxBytes) {
    return { ok: false, status: 413, error: "That image is too large — try a smaller photo." };
  }

  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false, status: 400, error: "Malformed request body." };
  }
}

/**
 * Whether a usable model credential is present.
 *
 * Both routes MUST agree on this. They previously disagreed — scan
 * accepted the OIDC token, chat required the explicit key — so on Vercel
 * the scanner advertised "vision online" while chat silently served
 * canned demo text from the same deployment.
 */
export function hasModelCredential(): boolean {
  return hasAnyModel();
}
