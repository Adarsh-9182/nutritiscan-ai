import { cookies } from "next/headers";

export const maxDuration = 60;
const SESSION = "nutritiscan-health-session";
const MAX_BODY = 11 * 1024 * 1024;
const allowed = /^(status|consent|records(?:\/[^/]+)?|observations|timeline|trends|documents(?:\/[^/]+(?:\/(?:original|confirm))?)?|chat|conversations|doctor-summary|voice|export|account|auth\/(?:login|register|logout))$/;

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
  const token = native ? req.headers.get("authorization") : jar.get(SESSION)?.value ? `Bearer ${jar.get(SESSION)!.value}` : null;
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
    if ((joined === "auth/login" || joined === "auth/register") && upstream.ok) {
      const result = await upstream.json();
      if (!native) {
        jar.set(SESSION, result.access_token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/api/health", maxAge: result.expires_in });
        delete result.access_token;
      }
      return Response.json(result, { status: upstream.status, headers: { "Cache-Control": "no-store" } });
    }
    if (!native && (upstream.status === 401 || ((joined === "auth/logout" || joined === "account") && upstream.ok))) {
      jar.set(SESSION, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/api/health", maxAge: 0 });
    }
    const outgoing = new Headers({ "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
    for (const name of ["content-type", "content-disposition", "retry-after"]) { const value = upstream.headers.get(name); if (value) outgoing.set(name, value); }
    return new Response(upstream.body, { status: upstream.status, headers: outgoing });
  } catch {
    return Response.json({ error: "The health service could not be reached. Please try again." }, { status: 503 });
  }
}
export { proxy as GET, proxy as POST, proxy as PUT, proxy as DELETE };
