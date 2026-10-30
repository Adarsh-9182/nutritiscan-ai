import { accountConfigured, authenticatedAccount, cookieValue, SESSION_COOKIE } from "@/lib/account/session";
import { configuredProviders, healthAuth } from "@/lib/account/providers";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "cache-control": "private, no-store", "x-content-type-options": "nosniff" };
export async function GET(request: Request) {
  try {
    const providers = await configuredProviders();
    let linked: Record<string,boolean> = {};
    if (new URL(request.url).searchParams.get("intent") === "link" && await authenticatedAccount(request)) {
      const response = await healthAuth("oauth/links",{ headers: { authorization: `Bearer ${cookieValue(request, SESSION_COOKIE)}` } });
      if (!response.ok) throw new Error();
      const value = await response.json(); linked = { google: value.google === true, github: value.github === true };
    }
    return Response.json({ available: true, google: { enabled: accountConfigured() && providers.google.configured,linked: linked.google === true }, github: { enabled: accountConfigured() && providers.github.configured,linked: linked.github === true } }, { headers });
  } catch { return Response.json({ available: false, google: { enabled: false,linked: false }, github: { enabled: false,linked: false } }, { headers }); }
}
