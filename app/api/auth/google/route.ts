import { NextRequest, NextResponse } from "next/server";
import { seal } from "@/lib/workspace/crypto";
import {
  authorizationUrl,
  googleConfigured,
  newState,
  redirectUri,
} from "@/lib/auth/google";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OAUTH_COOKIE = "ns-oauth";

/** Starts "Continue with Google". `?consent=1` means the person ticked the
 * 18+ and terms box, so a new account may be created. */
export async function GET(req: NextRequest) {
  if (!googleConfigured())
    return NextResponse.redirect(new URL("/workspace?google=off", req.url));
  const state = newState(req.nextUrl.searchParams.get("consent") === "1");
  const response = NextResponse.redirect(
    authorizationUrl(state, redirectUri(req.nextUrl.origin)),
  );
  // Sealed so the callback can trust what it reads back.
  response.cookies.set(OAUTH_COOKIE, await seal(state, "oauth:google"), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth/google",
    maxAge: 600,
  });
  return response;
}
