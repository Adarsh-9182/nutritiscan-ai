import { z } from "zod";
import { authenticatedAccount, cookieValue, SESSION_COOKIE } from "@/lib/account/session";
import { matchesOrigin } from "@/lib/agent-runtime/origin";
import { checkRateShared, readJsonCapped, tooManyRequests } from "@/lib/http/guard";
import { parseResearchBackup } from "@/lib/research/backup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
const headers = { "cache-control": "private, no-store", "x-content-type-options": "nosniff" };
const Revision = z.object({ revision: z.string().uuid().nullable(), accountId: z.string().uuid() }).strict();
const Save = Revision.extend({ consent: z.literal(true), backup: z.unknown() }).strict();
const Metadata = z.object({ revision: z.string().uuid().nullable(), updatedAt: z.string().datetime({ offset: true }).nullable() });

async function backup(request: Request) {
  if (request.method !== "GET" && (!matchesOrigin(request) || request.headers.get("sec-fetch-site") === "cross-site")) {
    return Response.json({ error: "Open NutritiScan to manage your research backup." }, { status: 403, headers });
  }
  try {
    const account = await authenticatedAccount(request);
    if (!account) return Response.json({ error: "Sign in to save or open account research." }, { status: 401, headers });
    const rate = await checkRateShared(`research-backup:${account.id}`, 30, 60_000);
    if (!rate.ok) return tooManyRequests(rate.retryAfter, "Please wait before updating your research backup again.");
    let body: unknown;
    if (request.method !== "GET") {
      const input = await readJsonCapped(request, request.method === "PUT" ? 1_050_000 : 1024);
      if (!input.ok) return Response.json({ error: input.error }, { status: input.status, headers });
      const value = (request.method === "PUT" ? Save : Revision).safeParse(input.value);
      if (!value.success) return Response.json({ error: "Invalid research backup request." }, { status: 400, headers });
      if (value.data.accountId !== account.id) return Response.json({ error: "Your signed-in account changed. Refresh account details before saving." }, { status: 409, headers });
      if (request.method === "PUT") {
        try { body = { revision: value.data.revision, consent: true, backup: parseResearchBackup(JSON.stringify((value.data as z.infer<typeof Save>).backup)) }; }
        catch { return Response.json({ error: "This research backup is invalid or exceeds 1 MB." }, { status: 400, headers }); }
      } else body = { revision: value.data.revision };
    }
    const base = process.env.HEALTH_API_URL!;
    const upstream = await fetch(`${base.replace(/\/$/, "")}/research/backup`, {
      method: request.method, cache: "no-store", redirect: "error",
      headers: { authorization: `Bearer ${cookieValue(request, SESSION_COOKIE)}`, ...(body ? { "content-type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(20_000)]),
    });
    if (!upstream.ok) {
      await upstream.body?.cancel();
      const status = [401, 409, 413, 429].includes(upstream.status) ? upstream.status : 503;
      const message = status === 401 ? "Sign in again to access account research." : status === 409 ? "Account research changed in another session. Check the backup again; nothing was overwritten." : "Account research is temporarily unavailable. Your device conversations are unchanged.";
      return Response.json({ error: message }, { status, headers });
    }
    const raw = await upstream.json();
    const metadata = Metadata.parse(raw);
    const result = request.method === "PUT" ? metadata : { ...metadata, backup: raw.backup === null ? null : parseResearchBackup(JSON.stringify(raw.backup)) };
    return Response.json({ ...result, accountId: account.id }, { headers });
  } catch { return Response.json({ error: "Account research could not be accessed. Your device conversations are unchanged." }, { status: 503, headers }); }
}
export { backup as GET, backup as PUT, backup as DELETE };
