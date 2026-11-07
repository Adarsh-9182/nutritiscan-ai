import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, PUT } from "@/app/api/research/backup/route";
import { authenticatedAccount } from "@/lib/account/session";
import { createStudyProtocol } from "./protocol";
import { reply, request as researchRequest, source } from "./test-fixtures";
vi.mock("@/lib/account/session", () => ({ authenticatedAccount: vi.fn(), cookieValue: () => "synthetic-test-session", SESSION_COOKIE: "nutritiscan-session" }));
vi.mock("@/lib/http/guard", async (original) => ({ ...await original<typeof import("@/lib/http/guard")>(), checkRateShared: async () => ({ ok: true }) }));
const owner = "11111111-1111-4111-8111-111111111111";
const revision = "22222222-2222-4222-8222-222222222222";
const backup = { format: "nutritiscan-research", version: 1, exportedAt: "2026-11-02T10:00:00Z", threads: [] };
function request(method = "GET", body?: unknown, origin = "https://www.nutritiscan.com") {
  return new Request("https://www.nutritiscan.com/api/research/backup", { method, headers: { origin, "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
}
beforeEach(() => {
  vi.stubEnv("HEALTH_API_URL", "https://synthetic-backend.invalid");
  vi.mocked(authenticatedAccount).mockResolvedValue({ id: owner, expiresAt: 9999999999 });
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ revision, updatedAt: "2026-11-02T10:00:00Z", backup })));
});
describe("account research boundary", () => {
  it("roundtrips protocol drafts through the authenticated account snapshot contract", async () => {
    const protocol = createStudyProtocol(researchRequest.message, [source.id], reply);
    const snapshot = { ...backup, threads: [{ id: "project", title: "Synthetic protocol project", query: "", updatedAt: 1, turns: [{ id: "turn", request: { message: researchRequest.message, query: "", mode: "evidence", sources: ["pubmed"] }, phase: "done", reply, protocol }] }] };
    const response = await PUT(request("PUT", { accountId: owner, revision: null, consent: true, backup: snapshot }));
    expect(response.status).toBe(200);
    expect(JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string).backup.threads[0].turns[0].protocol).toEqual(protocol);
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ revision, updatedAt: backup.exportedAt, backup: snapshot })));
    const restored = await GET(request());
    expect(restored.status).toBe(200);
    expect((await restored.json()).backup.threads[0].turns[0].protocol).toEqual(protocol);
  });
  it("requires sign-in and same-origin writes before upstream storage access", async () => {
    expect((await PUT(request("PUT", {}, "https://untrusted.invalid"))).status).toBe(403);
    vi.mocked(authenticatedAccount).mockResolvedValue(null);
    expect((await GET(request())).status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("validates account binding, consent and backup shape before forwarding", async () => {
    for (const body of [
      { accountId: revision, revision: null, consent: true, backup },
      { accountId: owner, revision: null, consent: false, backup },
      { accountId: owner, revision: null, consent: true, backup: { ...backup, version: 9 } },
    ]) expect((await PUT(request("PUT", body))).ok).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("forwards only the verified session and parsed snapshot and never accepts an owner override", async () => {
    const response = await PUT(request("PUT", { accountId: owner, revision: null, consent: true, backup }));
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toContain("no-store");
    const [url, options] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("https://synthetic-backend.invalid/research/backup");
    expect(JSON.parse(options!.body as string)).not.toHaveProperty("accountId");
    expect((await response.json()).accountId).toBe(owner);
  });
  it("preserves conflicts and fails closed on malformed stored backups", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ detail: "private upstream diagnostic" }, { status: 409 })));
    const conflict = await PUT(request("PUT", { accountId: owner, revision, consent: true, backup }));
    expect(conflict.status).toBe(409); expect(await conflict.text()).not.toContain("private upstream");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ revision, updatedAt: "2026-11-02T10:00:00Z", backup: { unexpected: true } })));
    expect((await GET(request())).status).toBe(503);
  });
});
