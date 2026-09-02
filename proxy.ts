import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * The split root.
 *
 * `/` used to serve the marketing page to everyone, so opening the app as
 * someone who already had conversations meant landing on a pitch and having
 * to find the product underneath it. Every assistant people compare this to
 * does the opposite: the front door is the conversation, and the marketing
 * page is what you get only if you have never been here.
 *
 * The decision is made from a cookie rather than in the page so that `/`
 * stays statically generated. A first-time visitor — and every crawler,
 * which never carries the cookie — still gets the prerendered marketing
 * page with no server round trip.
 *
 * `?home` is the way back: the footer and the chat's logo use it so someone
 * who wants the marketing page can always reach it.
 */
export const RETURNING_COOKIE = "ns-returning";

export function proxy(request: NextRequest) {
  if (request.nextUrl.searchParams.has("home")) return NextResponse.next();
  if (request.cookies.get(RETURNING_COOKIE)?.value !== "1") return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = "/chat";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = { matcher: "/" };
