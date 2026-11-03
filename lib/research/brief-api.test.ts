import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/research/brief/route";
import { runBrief } from "./brief-agent";
vi.mock("./brief-agent", () => ({ runBrief: vi.fn() }));
const input = { question: "Synthetic research question", sourceIds: ["pubmed:123"] };
const req = (body: unknown, origin = "http://localhost", ip = crypto.randomUUID()) => new Request("http://localhost/api/research/brief", { method: "POST", headers: { origin, "content-type": "application/json", "x-real-ip": ip }, body: JSON.stringify(body) });
beforeEach(() => vi.clearAllMocks());
describe("brief endpoint boundary", () => {
  it("rejects cross-origin, oversized, injected and invalid inputs before research", async () => {
    expect((await POST(req(input, "https://untrusted.example"))).status).toBe(403);
    expect((await POST(req({ ...input, question: "x".repeat(13000) }))).status).toBe(413);
    expect((await POST(req({ ...input, sourceIds: ["https://localhost/internal"] }))).status).toBe(400);
    expect((await POST(req({ ...input, approved: true }))).status).toBe(400);
    expect(runBrief).not.toHaveBeenCalled();
  });
  it("returns no-store results, bounds request volume and safely handles outages", async () => {
    vi.mocked(runBrief).mockResolvedValue({ id: "synthetic" } as never);
    const ip = crypto.randomUUID();
    const result = await POST(req(input, undefined, ip));
    expect(result.status).toBe(200); expect(result.headers.get("cache-control")).toBe("no-store");
    await POST(req(input, undefined, ip)); await POST(req(input, undefined, ip));
    expect((await POST(req(input, undefined, ip))).status).toBe(429);
    vi.mocked(runBrief).mockRejectedValue(new Error("private provider failure"));
    const failed = await POST(req(input)); expect(failed.status).toBe(503); expect(await failed.text()).not.toContain("private provider");
  });
});
