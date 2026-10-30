import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { authorizationUrl, OAuthStateStore } from "./oauth";
let db: PGlite; let store: OAuthStateStore;
beforeAll(async () => { db = new PGlite(); await db.exec(await readFile("migrations/account/0001_oauth.sql","utf8")); store = new OAuthStateStore({ query: async <T>(sql: string,params: unknown[] = []) => (await db.query<T>(sql,params)).rows,close: async () => {} }); },15_000);
beforeEach(async () => { vi.stubEnv("ACCOUNT_SESSION_SECRET","synthetic-oauth-session-key-for-tests-only"); vi.stubEnv("OAUTH_WEB_ORIGIN","https://www.nutritiscan.com"); await db.exec("TRUNCATE ns_account_oauth_states"); });
afterEach(() => vi.unstubAllEnvs()); afterAll(async () => db.close());
describe("browser-bound OAuth transactions", () => {
  it("requires the correct browser, provider and state, and consumes once", async () => {
    const t = await store.create("github","/research");
    expect(await store.consume("google",t.state,t.browser)).toBeNull();
    expect(await store.consume("github",t.state,"x".repeat(43))).toBeNull();
    expect(await store.consume("github",undefined,t.browser)).toBeNull();
    const attempts = await Promise.all([store.consume("github",t.state,t.browser),store.consume("github",t.state,t.browser)]);
    expect(attempts.filter(Boolean)).toHaveLength(1); expect(attempts.find(Boolean)?.next).toBe("/research");
    expect(await store.consume("github",t.state,t.browser)).toBeNull();
  });
  it("expires pending requests and refuses authentication after key rotation", async () => {
    const expired = await store.create("google","/chat"); await db.exec("UPDATE ns_account_oauth_states SET expires_at=now()-interval '1 second'");
    expect(await store.consume("google",expired.state,expired.browser)).toBeNull();
    const rotated = await store.create("google","/chat"); vi.stubEnv("ACCOUNT_SESSION_SECRET","different-synthetic-oauth-key-for-tests");
    expect(await store.consume("google",rotated.state,rotated.browser)).toBeNull();
  });
  it("encrypts PKCE and link tickets at rest and prevents external return URLs", async () => {
    const ticket = "a".repeat(43);
    const t = await store.create("github","https://evil.example",{ ticket,owner: "e5227f3b-7ed1-4418-a005-f95fd3359c8e" });
    const rows = await db.query<{ payload: string; state_hash: string; browser_hash: string }>("SELECT * FROM ns_account_oauth_states");
    expect(JSON.stringify(rows.rows)).not.toContain(ticket); expect(JSON.stringify(rows.rows)).not.toContain(t.state); expect(JSON.stringify(rows.rows)).not.toContain(t.browser);
    expect(await store.consume("github",t.state,t.browser)).toMatchObject({ next: "/chat",linkTicket: ticket });
  });
  it("uses authorization code, S256 PKCE, Google nonce and minimal scopes", async () => {
    const t = await store.create("google","/chat"); const google = new URL(authorizationUrl("google","synthetic-client",t));
    expect(google.hostname).toBe("accounts.google.com"); expect(google.searchParams.get("nonce")).toBe(t.nonce);
    for (const provider of ["google","github"] as const) {
      const url = new URL(authorizationUrl(provider,"synthetic-client",t));
      expect(url.searchParams.get("code_challenge_method")).toBe("S256"); expect(url.searchParams.get("code_challenge")).toHaveLength(43);
      expect(url.searchParams.get("redirect_uri")).toBe(`https://www.nutritiscan.com/api/account/oauth/${provider}/callback`);
      expect(url.searchParams.get("scope")).not.toMatch(/repo|drive|gmail|offline/);
    }
  });
});
