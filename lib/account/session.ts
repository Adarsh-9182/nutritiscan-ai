import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const ACCOUNT_COOKIE = "nutritiscan-account";
export const SESSION_COOKIE = "nutritiscan-session";
export const LEGACY_HEALTH_COOKIE = "nutritiscan-health-session";
export const AUTH_SESSION_SECONDS = 7 * 24 * 60 * 60;
const Identity = z.object({ id: z.string().uuid(), tokenHash: z.string().regex(/^[a-f0-9]{64}$/), expiresAt: z.number().int().positive() }).strict();
export type AccountIdentity = Pick<z.infer<typeof Identity>, "id" | "expiresAt">;

function signingKey() {
  const secret = process.env.ACCOUNT_SESSION_SECRET;
  if (secret && secret !== "[SENSITIVE]" && secret.length >= 32) return createHash("sha256").update(secret).digest();
  const healthKey = process.env.HEALTH_DATA_KEY;
  if (healthKey && /^[a-f0-9]{64}$/i.test(healthKey)) {
    // Separate signing key and domain; never use the record encryption key directly.
    return createHmac("sha256", Buffer.from(healthKey, "hex")).update("nutritiscan/account-session/v1").digest();
  }
  throw new AccountUnavailable("Account sessions are not configured yet.");
}

export class AccountUnavailable extends Error {
  readonly status = 503;
}

export function accountConfigured() {
  try { signingKey(); return Boolean(process.env.HEALTH_API_URL); } catch { return false; }
}

export function createAccountProof(id: string, upstreamToken: string, lifetime: number) {
  const seconds = Math.min(AUTH_SESSION_SECONDS, Math.max(60, Math.floor(lifetime)));
  const identity = Identity.parse({ id, tokenHash: createHash("sha256").update(upstreamToken).digest("hex"), expiresAt: Math.floor(Date.now() / 1000) + seconds });
  const payload = Buffer.from(JSON.stringify(identity)).toString("base64url");
  return `${payload}.${createHmac("sha256", signingKey()).update(payload).digest("base64url")}`;
}

export function verifyAccountProof(proof: string | undefined, upstreamToken: string | undefined): AccountIdentity | null {
  if (!proof || !upstreamToken || proof.length > 1000 || upstreamToken.length > 256) return null;
  const pieces = proof.split(".");
  if (pieces.length !== 2 || !pieces.every((s) => /^[A-Za-z0-9_-]+$/.test(s))) return null;
  const expected = createHmac("sha256", signingKey()).update(pieces[0]).digest();
  const supplied = Buffer.from(pieces[1], "base64url");
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;
  try {
    const parsed = Identity.safeParse(JSON.parse(Buffer.from(pieces[0], "base64url").toString()));
    if (!parsed.success || parsed.data.expiresAt <= Math.floor(Date.now() / 1000)) return null;
    const actual = createHash("sha256").update(upstreamToken).digest();
    if (!timingSafeEqual(actual, Buffer.from(parsed.data.tokenHash, "hex"))) return null;
    return { id: parsed.data.id, expiresAt: parsed.data.expiresAt };
  } catch { return null; }
}

function cookieValue(request: Request, name: string) {
  const matches = (request.headers.get("cookie") ?? "").split(";").map((s) => s.trim()).filter((s) => s.startsWith(`${name}=`));
  if (matches.length !== 1) return undefined;
  try { return decodeURIComponent(matches[0].slice(name.length + 1)); } catch { return undefined; }
}

/** Reuse the existing health identity. No second password database or PHI copy. */
export async function authenticatedAccount(request: Request): Promise<AccountIdentity | null> {
  const opaque = cookieValue(request, SESSION_COOKIE);
  const identity = verifyAccountProof(cookieValue(request, ACCOUNT_COOKIE), opaque);
  if (!identity) return null;
  const base = process.env.HEALTH_API_URL;
  if (!base) throw new AccountUnavailable("The account service is temporarily unavailable.");
  try {
    const response = await fetch(`${base.replace(/\/$/, "")}/consent`, { headers: { authorization: `Bearer ${opaque}` }, cache: "no-store", redirect: "error", signal: AbortSignal.any([request.signal, AbortSignal.timeout(8_000)]) });
    if (response.status === 401 || response.status === 403) return null;
    if (!response.ok) throw new Error();
    // Check revocation without reading medical records or copying consent data.
    await response.body?.cancel();
    return identity;
  } catch { throw new AccountUnavailable("The account service could not be reached. Please retry."); }
}

export function safeAccountReturn(value?: string | null) {
  return value && ["/chat", "/research", "/pricing", "/account", "/health"].includes(value) ? value : "/chat";
}
