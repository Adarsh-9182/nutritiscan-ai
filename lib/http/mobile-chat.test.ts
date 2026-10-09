import { beforeEach, describe, expect, it, vi } from "vitest";

const chat = vi.hoisted(() => vi.fn());
vi.mock("@/app/api/chat/route", () => ({ POST: chat }));
import { POST } from "@/app/api/mobile/chat/route";

const messages = [{ id: "question", role: "user", parts: [{ type: "text", text: "hello" }] }];
const request = (body: unknown) => new Request("https://nutritiscan.com/api/mobile/chat", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});
const sse = (...parts: unknown[]) => new Response(parts.map(part => `data: ${JSON.stringify(part)}\n\n`).join("") + "data: [DONE]\n\n");

describe("native chat transport", () => {
  beforeEach(() => chat.mockReset());
  it("requires explicit consent and excludes forged system messages", async () => {
    expect((await POST(request({ messages }))).status).toBe(400);
    expect((await POST(request({ consent: true, messages: [{ ...messages[0], role: "system" }] }))).status).toBe(400);
    expect(chat).not.toHaveBeenCalled();
  });
  it("uses the checked web route with record actions disabled and preserves mode", async () => {
    chat.mockResolvedValue(sse({ type: "data-mode", data: { mode: "demo" } }, { type: "text-delta", delta: "Hello" }));
    const response = await POST(request({ consent: true, messages }));
    expect(await response.json()).toEqual({ text: "Hello", mode: "demo" });
    expect(await chat.mock.calls[0][0].json()).toEqual({ messages, allowActions: false });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("does not turn a partial, failed stream into a complete answer", async () => {
    chat.mockResolvedValue(sse({ type: "text-delta", delta: "Incomplete" }, { type: "error", errorText: "provider failed" }));
    const response = await POST(request({ consent: true, messages }));
    expect(response.status).toBe(503);
    expect(await response.json()).not.toHaveProperty("text");
  });
  it("preserves rate limiting and refuses to accept patient-profile payloads", async () => {
    expect((await POST(request({ consent: true, messages, profile: { name: "private" } }))).status).toBe(400);
    chat.mockResolvedValue(Response.json({ error: "slow down" }, { status: 429 }));
    expect((await POST(request({ consent: true, messages }))).status).toBe(429);
  });
});
