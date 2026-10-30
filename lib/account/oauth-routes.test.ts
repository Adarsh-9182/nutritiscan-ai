import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ set: vi.fn(),consume: vi.fn(),healthAuth: vi.fn() }));
vi.mock("next/headers",() => ({ cookies: async () => ({ set: mocks.set }) }));
vi.mock("@/lib/account/oauth",async (original) => ({ ...await original<typeof import("@/lib/account/oauth")>(),oauthStateStore: async () => ({ consume: mocks.consume }) }));
vi.mock("@/lib/account/providers",() => ({ healthAuth: mocks.healthAuth }));
import { GET } from "@/app/api/account/oauth/[provider]/callback/route";
const owner = "e5227f3b-7ed1-4418-a005-f95fd3359c8e";
const context = { params: Promise.resolve({ provider: "github" }) };
const request = (query = "code=synthetic&state=synthetic") => new Request(`https://www.nutritiscan.com/api/account/oauth/github/callback?${query}`,{ headers: { cookie: "nutritiscan-oauth-github=synthetic-browser" } });
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("OAUTH_WEB_ORIGIN","https://www.nutritiscan.com"); vi.stubEnv("ACCOUNT_SESSION_SECRET","synthetic-oauth-session-key-for-tests-only"); mocks.consume.mockResolvedValue({ next: "/research",verifier: "v".repeat(43),nonce: "n".repeat(43) }); });
afterEach(() => vi.unstubAllEnvs());
describe("OAuth callback boundary", () => {
  it("never exchanges a code when browser state is invalid", async () => {
    mocks.consume.mockResolvedValue(null);
    const result = await GET(request(),context);
    expect(result.headers.get("location")).toContain("oauth-invalid");
    expect(mocks.healthAuth).not.toHaveBeenCalled();
    expect(mocks.set).toHaveBeenCalledWith("nutritiscan-oauth-github","",expect.objectContaining({ maxAge: 0,sameSite: "lax",httpOnly: true }));
  });
  it("sets server cookies and returns to the allowlisted workspace without token leakage", async () => {
    mocks.healthAuth.mockResolvedValue(Response.json({ access_token: "synthetic-upstream-token",user_id: owner,expires_in: 604800 }));
    const result = await GET(request(),context);
    expect(result.status).toBe(303); expect(result.headers.get("location")).toBe("https://www.nutritiscan.com/research");
    expect(result.headers.get("referrer-policy")).toBe("no-referrer");
    expect(await result.text()).not.toContain("synthetic-upstream-token");
    expect(mocks.set).toHaveBeenCalledWith("nutritiscan-session","synthetic-upstream-token",expect.objectContaining({ httpOnly: true,sameSite: "strict",path: "/" }));
  });
  it("never swaps the account during an explicit provider link", async () => {
    mocks.consume.mockResolvedValue({ next: "/account",verifier: "v".repeat(43),nonce: "n".repeat(43),linkTicket: "t".repeat(43),owner });
    mocks.healthAuth.mockResolvedValue(Response.json({ access_token: "synthetic-other-token",user_id: "11111111-1111-4111-8111-111111111111",expires_in: 604800 }));
    const result = await GET(request(),context);
    expect(result.headers.get("location")).toContain("/account?auth=oauth-invalid");
    expect(mocks.set.mock.calls.some(([name]) => name === "nutritiscan-session")).toBe(false);
  });
  it("handles user cancellation and duplicate code parameters without provider calls", async () => {
    expect((await GET(request("state=synthetic&error=access_denied"),context)).headers.get("location")).toContain("oauth-canceled");
    expect((await GET(request("state=synthetic&code=one&code=two"),context)).headers.get("location")).toContain("oauth-invalid");
    expect(mocks.healthAuth).not.toHaveBeenCalled();
  });
});
