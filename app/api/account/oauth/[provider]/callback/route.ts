import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { cookieValue, browserSessionCookies, AccountAuthResult, safeAccountReturn } from "@/lib/account/session";
import { healthAuth } from "@/lib/account/providers";
import { oauthCallback, oauthCookie, oauthCookieOptions, OAuthProvider, oauthStateStore, oauthWebOrigin } from "@/lib/account/oauth";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(request: Request, context: { params: Promise<{ provider: string }> }) {
  const provider = OAuthProvider.safeParse((await context.params).provider);
  const redirect = (path: string) => { const response = NextResponse.redirect(new URL(path,oauthWebOrigin()),303); response.headers.set("cache-control","private, no-store"); response.headers.set("referrer-policy","no-referrer"); return response; };
  if (!provider.success) return redirect("/login?auth=oauth-invalid");
  const jar = await cookies();
  const browser = cookieValue(request,oauthCookie(provider.data));
  jar.set(oauthCookie(provider.data),"",{ ...oauthCookieOptions,maxAge: 0 });
  const params = new URL(request.url).searchParams;
  const one = (key: string) => params.getAll(key).length === 1 ? params.get(key)! : undefined;
  try {
    const pending = await (await oauthStateStore()).consume(provider.data,one("state"),browser);
    if (!pending) return redirect("/login?auth=oauth-invalid");
    const fail = (reason: string) => redirect(pending.owner ? `/account?auth=${reason}` : `/login?auth=${reason}&next=${encodeURIComponent(safeAccountReturn(pending.next))}`);
    if (params.has("error")) return fail("oauth-canceled");
    const code = one("code");
    if (!code || code.length > 2048) return fail("oauth-invalid");
    const response = await healthAuth(`oauth/${provider.data}`,{ method: "POST",headers: { "content-type":"application/json" },body: JSON.stringify({ code,code_verifier: pending.verifier,nonce: pending.nonce,redirect_uri: oauthCallback(provider.data),...(pending.linkTicket ? { link_ticket: pending.linkTicket } : {}) }),signal: request.signal });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      return fail(error.detail?.code === "verified-email-required" ? "oauth-email" : response.status === 409 ? "oauth-conflict" : response.status === 401 ? pending.owner ? "oauth-reauth" : "oauth-invalid" : "oauth-unavailable");
    }
    const result = AccountAuthResult.parse(await response.json());
    if (pending.owner && result.user_id !== pending.owner) return fail("oauth-invalid");
    for (const cookie of browserSessionCookies(result)) jar.set(cookie.name,cookie.value,cookie.options);
    return redirect(pending.owner ? "/account?auth=oauth-linked" : safeAccountReturn(pending.next));
  } catch { return redirect("/login?auth=oauth-unavailable"); }
}
