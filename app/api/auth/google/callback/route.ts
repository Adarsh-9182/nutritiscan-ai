import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { database } from "@/lib/workspace/database";
import { unseal } from "@/lib/workspace/crypto";
import {
  ApiError,
  SESSION_SECONDS,
  WorkspaceService,
} from "@/lib/workspace/service";
import {
  exchangeCode,
  googleConfigured,
  redirectUri,
  type OAuthState,
} from "@/lib/auth/google";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OAUTH_COOKIE = "ns-oauth";

/**
 * The session cookie is SameSite=Strict, so it is not sent on the redirect
 * chain that started at Google. A tiny page that navigates onward from our
 * own origin makes the next request same-site, so the person arrives signed in.
 */
function continueTo(path: string, session?: string) {
  const html = `<!doctype html><meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta http-equiv="refresh" content="0;url=${path}"><title>Signing you in…</title><p style="font-family:system-ui;padding:24px">Signing you in… <a href="${path}">Continue</a></p>`;
  const response = new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
  response.cookies.set(OAUTH_COOKIE, "", {
    path: "/api/auth/google",
    maxAge: 0,
  });
  if (session) {
    response.cookies.set("ns-session", session, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: SESSION_SECONDS,
    });
    response.cookies.set("ns-returning", "1", {
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 31_536_000,
    });
  }
  return response;
}

const same = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export async function GET(req: NextRequest) {
  if (!googleConfigured()) return continueTo("/workspace?google=off");
  const params = req.nextUrl.searchParams;
  if (params.get("error")) return continueTo("/workspace?google=cancelled");
  const raw = req.cookies.get(OAUTH_COOKIE)?.value;
  const code = params.get("code");
  const returned = params.get("state") ?? "";
  try {
    if (!raw || !code) throw new Error("missing");
    const state = await unseal<OAuthState>(raw, "oauth:google");
    if (!same(state.state, returned)) throw new Error("state");
    const service = new WorkspaceService(await database());
    const ip = process.env.VERCEL
      ? (req.headers.get("x-vercel-forwarded-for") ?? "unknown")
      : "local";
    await service.rate(`auth:network:${ip}`, 50, 900);
    const identity = await exchangeCode(
      code,
      state,
      redirectUri(req.nextUrl.origin),
    );
    const result = await service.signInWithProvider(
      "google",
      identity.subject,
      identity.givenName,
      state.consent,
    );
    if (!result) return continueTo("/workspace?google=consent");
    return continueTo(
      result.created ? "/workspace?welcome" : "/workspace",
      result.session,
    );
  } catch (error) {
    console.error("[auth] google sign-in failed", {
      code:
        error instanceof ApiError ? `HTTP_${error.status}` : "GOOGLE_FAILED",
    });
    return continueTo("/workspace?google=failed");
  }
}
