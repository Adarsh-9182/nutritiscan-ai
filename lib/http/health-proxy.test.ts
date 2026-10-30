import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const jar = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => jar }));
import { GET, POST } from "@/app/api/health/[...path]/route";
const request = (path: string, method = "GET", headers: Record<string, string> = {}) => new Request(`https://nutritiscan.com/api/health/${path}`, { method, headers });
const context = (path: string) => ({ params: Promise.resolve({ path: path.split("/") }) });

describe("shared health gateway", () => {
  beforeEach(() => { vi.stubEnv("HEALTH_API_URL", "https://health.example"); vi.stubEnv("ACCOUNT_SESSION_SECRET", "synthetic-signing-key-for-account-tests-only"); jar.get.mockReturnValue({ value: "web-token" }); jar.set.mockReset(); });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
  it("rejects cross-origin cookie mutations before calling the backend", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const response = await POST(request("consent", "POST", { origin: "https://other.example" }), context("consent"));
    expect(response.status).toBe(403); expect(fetch).not.toHaveBeenCalled();
  });
  it("never authorizes a native request using a web cookie", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ available: true })); vi.stubGlobal("fetch", fetch);
    await GET(request("status", "GET", { "x-nutritiscan-client": "native" }), context("status"));
    expect(fetch.mock.calls[0][1].headers.has("Authorization")).toBe(false);
  });
  it("keeps the browser token HttpOnly and out of login JSON", async () => {
    const user_id = "e5227f3b-7ed1-4418-a005-f95fd3359c8e";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ access_token: "new-token", expires_in: 604800, user_id })));
    const response = await POST(request("auth/login", "POST", { origin: "https://nutritiscan.com" }), context("auth/login"));
    expect(await response.json()).toEqual({ expires_in: 604800, user_id });
    expect(jar.set).toHaveBeenCalledWith("nutritiscan-session", "new-token", expect.objectContaining({ httpOnly: true, path: "/", sameSite: "strict" }));
    expect(jar.set).toHaveBeenCalledWith("nutritiscan-account", expect.any(String), expect.objectContaining({ httpOnly: true, path: "/", sameSite: "strict" }));
  });
  it("expires the same cookie path when the session is rejected", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: "session expired" }, { status: 401 })));
    await GET(request("records"), context("records"));
    expect(jar.set).toHaveBeenCalledWith("nutritiscan-health-session", "", expect.objectContaining({ path: "/api/health", maxAge: 0 }));
    expect(jar.set).toHaveBeenCalledWith("nutritiscan-session", "", expect.objectContaining({ path: "/", maxAge: 0 }));
    expect(jar.set).toHaveBeenCalledWith("nutritiscan-account", "", expect.objectContaining({ path: "/", maxAge: 0 }));
  });
  it("does not proxy arbitrary paths or pretend an unconfigured service is connected", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    expect((await GET(request("admin"), context("admin"))).status).toBe(404);
    vi.stubEnv("HEALTH_API_URL", "");
    expect((await GET(request("status"), context("status"))).status).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
  });
});
