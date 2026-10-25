import { describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/agents/run/route";
import { RESEARCH_AGENT } from "./contracts";

vi.mock("./run", () => ({ runAgent: vi.fn() }));

function request(body: unknown, origin = "http://localhost") {
  return new Request("http://localhost/api/agents/run", {
    method: "POST", headers: { "content-type": "application/json", origin, "x-real-ip": "agent-api-tests" }, body: JSON.stringify(body),
  });
}
describe("agent API boundary", () => {
  it("rejects a cross-origin run", async () => {
    expect((await POST(request({ agent: RESEARCH_AGENT, task: "protein" }, "https://another.example"))).status).toBe(403);
  });
  it("checks the public host when Next's internal URL uses a bind hostname", async () => {
    const req = request({ task: "invalid body" }, "https://www.nutritiscan.com");
    req.headers.set("host", "www.nutritiscan.com");
    req.headers.set("x-forwarded-proto", "https");
    // 400 means origin validation passed, then the invalid body was rejected.
    expect((await POST(req)).status).toBe(400);
  });
  it("rejects an unknown plugin supplied by a client", async () => {
    expect((await POST(request({ agent: { ...RESEARCH_AGENT, plugins: ["shell", "artifact"] }, task: "protein" }))).status).toBe(400);
  });
  it("rejects an extra authority field in the request", async () => {
    expect((await POST(request({ agent: RESEARCH_AGENT, task: "protein", approved: true, tools: ["sendEmail"] }))).status).toBe(400);
  });
  it("rejects oversized input before planning", async () => {
    expect((await POST(request({ task: "x".repeat(20000) }))).status).toBe(413);
  });
});
