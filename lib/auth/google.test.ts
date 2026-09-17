import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  authorizationUrl,
  exchangeCode,
  newState,
  readIdToken,
} from "./google";
import { createLocalDatabase, type Database } from "@/lib/workspace/database";
import { WorkspaceService } from "@/lib/workspace/service";

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
const token = (claims: object) => `${b64({ alg: "RS256" })}.${b64(claims)}.sig`;
const NOW = Date.parse("2026-09-17T12:00:00Z");
const good = {
  iss: "https://accounts.google.com",
  aud: "client-1",
  sub: "1234567890",
  nonce: "n-1",
  exp: NOW / 1000 + 600,
  given_name: "Asha",
};
const expected = { nonce: "n-1", clientId: "client-1", now: NOW };

describe("Google ID token", () => {
  it("accepts a matching token and returns only subject and first name", () => {
    expect(readIdToken(token(good), expected)).toEqual({
      subject: "1234567890",
      givenName: "Asha",
    });
  });
  it.each([
    ["issuer", { iss: "https://evil.example" }],
    ["audience", { aud: "other-client" }],
    ["expiry", { exp: NOW / 1000 - 3600 }],
    ["nonce", { nonce: "replayed" }],
    ["subject", { sub: "" }],
  ])("rejects a wrong %s", (_label, change) => {
    expect(() =>
      readIdToken(token({ ...good, ...change }), expected),
    ).toThrow();
  });
  it("rejects malformed tokens", () => {
    expect(() => readIdToken("not-a-jwt", expected)).toThrow();
  });
});

describe("authorization request", () => {
  it("uses PKCE, a nonce and minimal scopes", () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "client-1");
    const s = newState(true);
    const url = new URL(authorizationUrl(s, "https://x.test/cb"));
    expect(url.searchParams.get("scope")).toBe("openid profile");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).not.toBe(s.verifier);
    expect(url.searchParams.get("state")).toBe(s.state);
    expect(url.searchParams.get("nonce")).toBe(s.nonce);
    vi.unstubAllEnvs();
  });
  it("exchanges the code with the verifier and validates the result", async () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "client-1");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "secret");
    const s = { ...newState(false), nonce: "n-1" };
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id_token: token({ ...good, exp: Date.now() / 1000 + 600 }),
        }),
      ),
    );
    const id = await exchangeCode("code-1", s, "https://x.test/cb", fetcher);
    expect(id.subject).toBe("1234567890");
    const body = new URLSearchParams(fetcher.mock.calls[0][1].body);
    expect(body.get("code_verifier")).toBe(s.verifier);
    expect(body.get("client_secret")).toBe("secret");
    fetcher.mockResolvedValueOnce(new Response("{}", { status: 400 }));
    await expect(
      exchangeCode("bad", s, "https://x.test/cb", fetcher),
    ).rejects.toThrow();
    vi.unstubAllEnvs();
  });
});

describe("provider accounts", () => {
  let db: Database;
  let service: WorkspaceService;
  beforeAll(async () => {
    vi.stubEnv("HEALTH_DATA_KEY", "55".repeat(32));
    db = await createLocalDatabase();
    service = new WorkspaceService(db);
  });
  afterAll(async () => {
    await db.close();
    vi.unstubAllEnvs();
  });
  it("needs consent to create, then signs the same person in", async () => {
    expect(
      await service.signInWithProvider("google", "sub-1", "Asha", false),
    ).toBeNull();
    const first = await service.signInWithProvider(
      "google",
      "sub-1",
      "Asha",
      true,
    );
    expect(first?.created).toBe(true);
    const again = await service.signInWithProvider(
      "google",
      "sub-1",
      "Asha",
      false,
    );
    expect(again).toMatchObject({ id: first!.id, created: false });
    expect(await service.authenticate(again!.session)).toBe(first!.id);
    expect((await service.workspace(first!.id)).profile.name).toBe("Asha");
    const stored = await db.query<{ subject_hash: string }>(
      "SELECT subject_hash FROM ns_identities",
    );
    expect(stored[0].subject_hash).not.toContain("sub-1");
    // Password sign-in cannot reach a Google account.
    const users = await db.query<{ username: string }>(
      "SELECT username FROM ns_users WHERE id=$1",
      [first!.id],
    );
    await expect(
      service.login(users[0].username, "password-123456"),
    ).rejects.toThrow();
  });
  it("keeps different Google accounts separate and survives races", async () => {
    const [a, b] = await Promise.all([
      service.signInWithProvider("google", "sub-2", "", true),
      service.signInWithProvider("google", "sub-2", "", true),
    ]);
    expect(a!.id).toBe(b!.id);
    const other = await service.signInWithProvider("google", "sub-3", "", true);
    expect(other!.id).not.toBe(a!.id);
    expect((await service.workspace(other!.id)).profile.name).toBe("Friend");
  });
});
