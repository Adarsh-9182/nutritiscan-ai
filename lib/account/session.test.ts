import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ACCOUNT_COOKIE, SESSION_COOKIE, authenticatedAccount, createAccountProof, safeAccountReturn, verifyAccountProof } from "./session";
const id = "e5227f3b-7ed1-4418-a005-f95fd3359c8e";
beforeEach(() => { vi.stubEnv("ACCOUNT_SESSION_SECRET", "synthetic-signing-key-for-account-tests-only"); vi.stubEnv("HEALTH_API_URL", "https://health.example"); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); });
describe("shared account identity", () => {
  it("binds the authenticated account to its server-issued health session", () => {
    const proof = createAccountProof(id, "opaque-session-A", 600);
    expect(verifyAccountProof(proof, "opaque-session-A")?.id).toBe(id);
    expect(verifyAccountProof(proof, "opaque-session-B")).toBeNull();
    expect(verifyAccountProof(proof.slice(0, -2) + "xx", "opaque-session-A")).toBeNull();
    expect(verifyAccountProof("free.pro.max", "opaque-session-A")).toBeNull();
  });
  it("rejects expired sessions and cross-site redirect destinations", () => {
    vi.useFakeTimers(); const proof = createAccountProof(id, "opaque", 60); vi.advanceTimersByTime(61_000);
    expect(verifyAccountProof(proof, "opaque")).toBeNull();
    expect(safeAccountReturn("https://other.example")).toBe("/chat");
    expect(safeAccountReturn("//other.example")).toBe("/chat");
    expect(safeAccountReturn("/research")).toBe("/research");
  });
  it("checks revocation without reading or copying medical records", async () => {
    const proof = createAccountProof(id, "opaque", 600);
    const request = new Request("https://www.nutritiscan.com/api/account", { headers: { cookie: `${ACCOUNT_COOKIE}=${proof}; ${SESSION_COOKIE}=opaque` } });
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({ storage: true, cloud_ai: false })).mockResolvedValueOnce(new Response(null, { status: 401 })); vi.stubGlobal("fetch", fetch);
    expect(await authenticatedAccount(request)).toMatchObject({ id });
    expect(fetch.mock.calls[0][0]).toBe("https://health.example/consent");
    expect(await authenticatedAccount(request)).toBeNull();
  });
  it("fails closed on account-service outages and rejects duplicate cookies", async () => {
    const proof = createAccountProof(id, "opaque", 600);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("private upstream message")));
    const request = new Request("https://www.nutritiscan.com/api/account", { headers: { cookie: `${ACCOUNT_COOKIE}=${proof}; ${SESSION_COOKIE}=opaque` } });
    await expect(authenticatedAccount(request)).rejects.toThrow("The account service could not be reached");
    const duplicate = new Request(request.url, { headers: { cookie: `${ACCOUNT_COOKIE}=${proof}; ${SESSION_COOKIE}=opaque; ${SESSION_COOKIE}=other` } });
    expect(await authenticatedAccount(duplicate)).toBeNull();
  });
});
