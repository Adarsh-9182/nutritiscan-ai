import { cookies } from "next/headers";
import { z } from "zod";
import { matchesOrigin } from "@/lib/agent-runtime/origin";
import { checkRateShared, clientKey, readJsonCapped, tooManyRequests } from "@/lib/http/guard";
import { authenticatedAccount, cookieValue, SESSION_COOKIE } from "@/lib/account/session";
import { configuredProviders, healthAuth } from "@/lib/account/providers";
import { authorizationUrl, oauthCookie, oauthCookieOptions, OAuthProvider, oauthStateStore, oauthWebOrigin } from "@/lib/account/oauth";
export const runtime = "nodejs";
const headers = { "cache-control": "private, no-store" };
export async function POST(request: Request, context: { params: Promise<{ provider: string }> }) {
  if (!matchesOrigin(request) || request.headers.get("sec-fetch-site") === "cross-site") return Response.json({ error: "Start sign-in from NutritiScan." }, { status: 403,headers });
  const provider = OAuthProvider.safeParse((await context.params).provider);
  if (!provider.success) return Response.json({ error: "Unknown sign-in provider." },{ status: 404,headers });
  const rate = await checkRateShared(`social-start:${clientKey(request)}`,10,60_000);
  if (!rate.ok) return tooManyRequests(rate.retryAfter,"Please wait before trying sign-in again.");
  const body = await readJsonCapped(request,1024);
  const parsed = body.ok && z.object({ next: z.string().max(100).default("/chat"),intent: z.enum(["login","link"]).default("login") }).strict().safeParse(body.value);
  if (!parsed || !parsed.success) return Response.json({ error: "Invalid sign-in request." },{ status: 400,headers });
  try {
    if (new URL(request.headers.get("origin")!).origin !== oauthWebOrigin()) return Response.json({ error: "Open sign-in at www.nutritiscan.com to use social login." },{ status: 409,headers });
    const config = (await configuredProviders())[provider.data];
    if (!config.configured || !config.client_id) return Response.json({ error: "This sign-in option is still being configured. Email sign-in is available." },{ status: 503,headers });
    let link: { ticket: string; owner: string } | undefined;
    if (parsed.data.intent === "link") {
      const account = await authenticatedAccount(request);
      if (!account) return Response.json({ error: "Sign in again before linking another method." },{ status: 401,headers });
      const response = await healthAuth("oauth/link-intent",{ method: "POST",headers: { "content-type": "application/json",authorization: `Bearer ${cookieValue(request,SESSION_COOKIE)}` },body: JSON.stringify({ provider: provider.data }) });
      if (!response.ok) { await response.body?.cancel(); return Response.json({ error: response.status === 401 ? "Sign in again, then link this method within 15 minutes." : "Account linking is temporarily unavailable." },{ status: response.status === 401 ? 401 : 503,headers }); }
      const ticket = z.object({ ticket: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).parse(await response.json()).ticket;
      link = { ticket,owner: account.id };
    }
    const transaction = await (await oauthStateStore()).create(provider.data,parsed.data.next,link);
    const jar = await cookies(); jar.set(oauthCookie(provider.data),transaction.browser,oauthCookieOptions);
    return Response.json({ url: authorizationUrl(provider.data,config.client_id,transaction) },{ headers });
  } catch { return Response.json({ error: "Social sign-in could not start. Please retry or use email." },{ status: 503,headers }); }
}
