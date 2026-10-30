import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { database, type Database } from "@/lib/workspace/database";
import { accountPurposeKey, safeAccountReturn } from "./session";

export const OAuthProvider = z.enum(["google", "github"]);
export type OAuthProvider = z.infer<typeof OAuthProvider>;
const Pending = z.object({ verifier: z.string().regex(/^[A-Za-z0-9_-]{43}$/), nonce: z.string().regex(/^[A-Za-z0-9_-]{43}$/), next: z.string(), linkTicket: z.string().regex(/^[A-Za-z0-9_-]{43}$/).optional(), owner: z.string().uuid().optional() }).strict();
export type OAuthPending = z.infer<typeof Pending>;
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
export const oauthCookie = (provider: OAuthProvider) => `nutritiscan-oauth-${provider}`;
export const oauthCookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/api/account/oauth", maxAge: 600 };
export function oauthWebOrigin() {
  const origin = new URL(process.env.OAUTH_WEB_ORIGIN ?? (process.env.NODE_ENV === "production" ? "https://www.nutritiscan.com" : "http://localhost:3000"));
  if (origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash || (origin.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && origin.hostname === "localhost"))) throw new Error("OAuth origin is invalid");
  return origin.origin;
}
export function oauthCallback(provider: OAuthProvider) { return `${oauthWebOrigin()}/api/account/oauth/${provider}/callback`; }
function seal(pending: OAuthPending) {
  const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", accountPurposeKey("oauth-state"), iv);
  cipher.setAAD(Buffer.from("nutritiscan/oauth-state/v1"));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(pending), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
}
function open(value: string) {
  const bytes = Buffer.from(value,"base64url");
  const decipher = createDecipheriv("aes-256-gcm", accountPurposeKey("oauth-state"), bytes.subarray(0,12));
  decipher.setAAD(Buffer.from("nutritiscan/oauth-state/v1")); decipher.setAuthTag(bytes.subarray(12,28));
  return Pending.parse(JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]).toString("utf8")));
}
export class OAuthStateStore {
  constructor(private db: Database) {}
  async create(provider: OAuthProvider, next: string, link?: { ticket: string; owner: string }) {
    const state = randomBytes(32).toString("base64url"); const browser = randomBytes(32).toString("base64url");
    const pending: OAuthPending = { verifier: randomBytes(32).toString("base64url"), nonce: randomBytes(32).toString("base64url"), next: safeAccountReturn(next), ...(link ? { linkTicket: link.ticket,owner: link.owner } : {}) };
    await this.db.query("DELETE FROM ns_account_oauth_states WHERE expires_at<=now()");
    await this.db.query("INSERT INTO ns_account_oauth_states(state_hash,browser_hash,provider,payload,expires_at) VALUES($1,$2,$3,$4,now()+interval '10 minutes')",[digest(state),digest(browser),provider,seal(pending)]);
    return { state,browser,nonce: pending.nonce,challenge: createHash("sha256").update(pending.verifier).digest("base64url") };
  }
  async consume(provider: OAuthProvider, state: string | undefined, browser: string | undefined): Promise<OAuthPending | null> {
    if (!state || !browser || !/^[A-Za-z0-9_-]{43}$/.test(state) || !/^[A-Za-z0-9_-]{43}$/.test(browser)) return null;
    const rows = await this.db.query<{ payload: string }>("DELETE FROM ns_account_oauth_states WHERE state_hash=$1 AND browser_hash=$2 AND provider=$3 AND expires_at>now() RETURNING payload",[digest(state),digest(browser),provider]);
    if (!rows[0]) return null;
    try { return open(rows[0].payload); } catch { return null; }
  }
}
export async function oauthStateStore() { return new OAuthStateStore(await database()); }
export function authorizationUrl(provider: OAuthProvider, clientId: string, state: { state: string; nonce: string; challenge: string }) {
  const url = new URL(provider === "google" ? "https://accounts.google.com/o/oauth2/v2/auth" : "https://github.com/login/oauth/authorize");
  url.search = new URLSearchParams({ client_id: clientId, redirect_uri: oauthCallback(provider), response_type: "code", scope: provider === "google" ? "openid email" : "user:email", state: state.state, code_challenge: state.challenge, code_challenge_method: "S256", ...(provider === "google" ? { nonce: state.nonce, prompt: "select_account" } : {}) }).toString();
  return url.href;
}
