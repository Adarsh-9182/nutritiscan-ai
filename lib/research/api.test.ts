import { describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/research/chat/route";
import { request, reply } from "./test-fixtures";
import { runScience } from "./scientist";
vi.mock("./scientist", () => ({ runScience: vi.fn() }));
const req = (body: unknown, origin = "http://localhost") => new Request("http://localhost/api/research/chat", { method: "POST", headers: { origin, "content-type": "application/json", "x-real-ip": crypto.randomUUID() }, body: JSON.stringify(body) });
describe("research chat boundary", () => {
  it("rejects cross-origin requests, oversized input and client-supplied authority", async () => {
    expect((await POST(req(request, "https://untrusted.example"))).status).toBe(403);
    expect((await POST(req({ ...request, approved: true }))).status).toBe(400);
    expect((await POST(req({ ...request, message: "x".repeat(41000) }))).status).toBe(413);
    expect((await POST(req({ ...request, sources: [] }))).status).toBe(400);
  });
  it("streams a bounded real result contract", async () => {
    vi.mocked(runScience).mockResolvedValue(reply);
    const result = await POST(req(request));
    expect(result.headers.get("content-type")).toContain("application/x-ndjson");
    expect(await result.text()).toContain('"type":"result"');
  });
  it("exposes configuration status without credentials", async () => {
    expect(Object.keys(await GET().json())).toEqual(["configured", "models"]);
  });
});
