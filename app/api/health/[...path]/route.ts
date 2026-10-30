import { cookies } from "next/headers";
import { z } from "zod";
import { ACCOUNT_COOKIE, SESSION_COOKIE, LEGACY_HEALTH_COOKIE, AUTH_SESSION_SECONDS, createAccountProof } from "@/lib/account/session";
import { authenticatedAccount } from "@/lib/account/session";
import { billingStore } from "@/lib/billing/store";

export const maxDuration = 60;
const AuthResult = z.object({ access_token: z.string().min(1).max(256), expires_in: z.number().int().positive().max(AUTH_SESSION_SECONDS), user_id: z.string().uuid() });
const MAX_BODY = 11 * 1024 * 1024;
const allowed = /^(status|consent|records(?:\/[^/]+)?|observations|timeline|trends|documents(?:\/[^/]+(?:\/(?:original|confirm))?)?|chat|conversations|doctor-summary|voice|export|account|auth\/(?:login|register|google|logout))$/;

async function proxy(req: Request, context: { params: Promise<{ path: string[] }> }) {
  const base = process.env.HEALTH_API_URL;
  if (!base) return Response.json({ error: "The shared health service is not connected yet. Local journal and public chat remain available." }, { status: 503 });
  const { path } = await context.params;
  const joined = path.join("/");
  if (!allowed.test(joined) || path.some((p) => p === "." || p === ".." || p.includes("%"))) return Response.json({ error: "Unknown health endpoint." }, { status: 404 });
  const jar = await cookies();
  const native = req.headers.get("x-nutritiscan-client") === "native";
  // Cookie-based mutations must come from this origin. Native clients carry an
  // explicit bearer; they never inherit web-cookie authorization.
  if (!native && !["GET", "HEAD"].includes(req.method)) {
    const origin = req.headers.get("origin");
    if (!origin || origin !== new URL(req.url).origin) return Response.json({ error: "This request must come from NutritiScan." }, { status: 403 });
  }
  const webToken = jar.get(SESSION_COOKIE)?.value ?? jar.get(LEGACY_HEALTH_COOKIE)?.value;
  if (joined === "account" && req.method === "DELETE" && process.env.BILLING_ENABLED === "true") {
    try {
      const account = native ? null : await authenticatedAccount(req);
      if (!account) return Response.json({ error: "Open Account & billing in the browser to check subscriptions before deleting this account." }, { status: 409 });
      if (await (await billingStore()).management(account.id)) return Response.json({ error: "Cancel renewal in Account & billing, then wait for the subscription to end before deleting this account." }, { status: 409 });
    } catch { return Response.json({ error: "Subscription status could not be checked. Retry account deletion later." }, { status: 503 }); }
  }
  const token = native ? req.headers.get("authorization") : webToken ? `Bearer ${webToken}` : null;
  const headers = new Headers();
  if (token) headers.set("Authorization", token);
  const contentType = req.headers.get("content-type");
  if (contentType) headers.set("Content-Type", contentType);
  let body: Uint8Array | undefined;
  if (!["GET", "HEAD"].includes(req.method)) {
    if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) return Response.json({ error: "Report exceeds the upload limit." }, { status: 413 });
    const reader = req.body?.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    if (reader) for (;;) {
      const next = await reader.read();
      if (next.done) break;
      length += next.value.length;
      if (length > MAX_BODY) { await reader.cancel(); return Response.json({ error: "Report exceeds the upload limit." }, { status: 413 }); }
      chunks.push(next.value);
    }
    body = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
  }
  try {
    const target = `${base.replace(/\/$/, "")}/${joined}${new URL(req.url).search}`;
    const upstream = await fetch(target, { method: req.method, headers, body: body as BodyInit | undefined, signal: AbortSignal.any([req.signal, AbortSignal.timeout(55000)]), cache: "no-store", redirect: "error" });
    if (["auth/login", "auth/register", "auth/google"].includes(joined) && upstream.ok) {
      const result = await upstream.json();
      if (!native) {
        const checked = AuthResult.safeParse(result);
        if (!checked.success) return Response.json({ error: "The sign-in response could not be validated. Please retry." }, { status: 502 });
        const proof = createAccountProof(checked.data.user_id, checked.data.access_token, checked.data.expires_in);
        const options = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict" as const, path: "/", maxAge: checked.data.expires_in };
        jar.set(SESSION_COOKIE, checked.data.access_token, options);
        jar.set(ACCOUNT_COOKIE, proof, options);
        jar.set(LEGACY_HEALTH_COOKIE, "", { ...options, path: "/api/health", maxAge: 0 });
        delete result.access_token;
      }
      return Response.json(result, { status: upstream.status, headers: { "Cache-Control": "no-store" } });
    }
    if (!native && (upstream.status === 401 || ((joined === "auth/logout" || joined === "account") && upstream.ok))) {
      const options = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict" as const, path: "/", maxAge: 0 };
      jar.set(SESSION_COOKIE, "", options);
      jar.set(ACCOUNT_COOKIE, "", options);
      jar.set(LEGACY_HEALTH_COOKIE, "", { ...options, path: "/api/health" });
    }
    const outgoing = new Headers({ "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
    for (const name of ["content-type", "content-disposition", "retry-after"]) { const value = upstream.headers.get(name); if (value) outgoing.set(name, value); }
    return new Response(upstream.body, { status: upstream.status, headers: outgoing });
  } catch {
    return Response.json({ error: "The health service could not be reached. Please try again." }, { status: 503 });
  }
}
export { proxy as GET, proxy as POST, proxy as PUT, proxy as DELETE };
