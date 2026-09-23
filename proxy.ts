import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * The split root.
 *
 * Returning visitors enter the account workspace from `/`; new visitors see
 * the marketing page. The workspace verifies the session before reading data.
 *
 * The decision is made from a cookie rather than in the page so that `/`
 * stays statically generated. A first-time visitor — and every crawler,
 * which never carries the cookie — still gets the prerendered marketing
 * page with no server round trip.
 *
 * `?home` remains a way to view the marketing page.
 */
export const RETURNING_COOKIE = "ns-returning";

export function proxy(request: NextRequest) {
  if (request.nextUrl.searchParams.has("home")) return NextResponse.next();
  if (
    !request.cookies.get("ns-session")?.value &&
    request.cookies.get(RETURNING_COOKIE)?.value !== "1"
  )
    return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = "/workspace";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = { matcher: "/" };
