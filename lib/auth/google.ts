import { createHash, randomBytes } from "node:crypto";

/**
 * "Continue with Google" using the OpenID Connect authorization code flow
 * with PKCE. Configuration: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and
 * APP_ORIGIN (the redirect URI is `${APP_ORIGIN}/api/auth/google/callback`).
 *
 * Only the stable Google subject id is used, hashed before storage. Email
 * addresses are not requested beyond the `openid profile` scopes.
 */
export const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

export function googleConfigured() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    (process.env.APP_ORIGIN || process.env.NODE_ENV !== "production"),
  );
}

export function redirectUri(requestOrigin: string) {
  return `${process.env.APP_ORIGIN || requestOrigin}/api/auth/google/callback`;
}

const b64url = (buf: Buffer) => buf.toString("base64url");

/** Values kept in a short-lived, HttpOnly cookie between redirect and callback. */
export type OAuthState = {
  state: string;
  verifier: string;
  nonce: string;
  /** The person ticked "18+ and agree" before continuing (sign-up allowed). */
  consent: boolean;
};

export function newState(consent: boolean): OAuthState {
  return {
    state: b64url(randomBytes(24)),
    verifier: b64url(randomBytes(48)),
    nonce: b64url(randomBytes(24)),
    consent,
  };
}

export function authorizationUrl(s: OAuthState, redirect: string) {
  const url = new URL(GOOGLE_AUTH);
  url.search = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: redirect,
    response_type: "code",
    scope: "openid profile",
    state: s.state,
    nonce: s.nonce,
    code_challenge: b64url(createHash("sha256").update(s.verifier).digest()),
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  return url.toString();
}

export type GoogleIdentity = { subject: string; givenName: string };

/**
 * Validates ID token claims. The token comes straight from Google's token
 * endpoint over TLS in exchange for our own code, so per OpenID Connect
 * Core §3.1.3.7 its signature does not need separate verification; the
 * issuer, audience, expiry and nonce still must match.
 */
export function readIdToken(
  idToken: string,
  expected: { nonce: string; clientId: string; now?: number },
): GoogleIdentity {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("Malformed ID token");
  const claims = JSON.parse(
    Buffer.from(parts[1], "base64url").toString("utf8"),
  );
  const now = Math.floor((expected.now ?? Date.now()) / 1000);
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!ISSUERS.includes(claims.iss)) throw new Error("Wrong issuer");
  if (!aud.includes(expected.clientId)) throw new Error("Wrong audience");
  if (typeof claims.exp !== "number" || claims.exp < now - 60)
    throw new Error("Expired ID token");
  if (claims.nonce !== expected.nonce) throw new Error("Nonce mismatch");
  if (typeof claims.sub !== "string" || !claims.sub)
    throw new Error("No subject");
  const givenName = String(claims.given_name ?? claims.name ?? "")
    .trim()
    .slice(0, 70);
  return { subject: claims.sub, givenName };
}

export async function exchangeCode(
  code: string,
  s: OAuthState,
  redirect: string,
  fetcher: typeof fetch = fetch,
): Promise<GoogleIdentity> {
  const response = await fetcher(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      redirect_uri: redirect,
      grant_type: "authorization_code",
      code_verifier: s.verifier,
    }).toString(),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Token exchange failed ${response.status}`);
  const body = await response.json();
  if (typeof body.id_token !== "string") throw new Error("No ID token");
  return readIdToken(body.id_token, {
    nonce: s.nonce,
    clientId: process.env.GOOGLE_CLIENT_ID ?? "",
  });
}
