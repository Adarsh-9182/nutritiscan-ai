import { afterEach, describe, expect, it, vi } from "vitest";
import type { UIMessage } from "ai";
import { ChatRequestError, chatRequestMessages, fetchChat } from "./transport";

afterEach(() => vi.unstubAllGlobals());

describe("chat request context", () => {
  it("sends recent turns from a long conversation without changing the stored transcript", () => {
    const messages: UIMessage[] = Array.from({ length: 61 }, (_, index) => ({
      id: String(index),
      role: index % 2 === 0 ? "user" : "assistant",
      parts: [{ type: "text", text: `Turn ${index}` }],
    }));
    const submitted = chatRequestMessages(messages);
    expect(submitted.length).toBeLessThanOrEqual(40);
    expect(submitted[0].role).toBe("user");
    expect(submitted.at(-1)?.id).toBe("60");
    expect(messages).toHaveLength(61);
  });

  it("keeps tool results and text while leaving display-only data in local history", () => {
    const messages = [{ id: "q", role: "user", parts: [{ type: "text", text: "Explain protein" }] }, {
      id: "a", role: "assistant", parts: [
        { type: "text", text: "A general answer" },
        { type: "data-sources", data: { ids: ["nutrition"] } },
        { type: "tool-logMeal", toolCallId: "meal-1", state: "output-available", input: {}, output: {} },
      ],
    }] as UIMessage[];
    expect(chatRequestMessages(messages)[1].parts.map((part) => part.type)).toEqual(["text", "tool-logMeal"]);
    expect(messages[1].parts).toHaveLength(3);
  });
});

describe("chat HTTP failures", () => {
  it("honors the server's retry-after header", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("private error detail", { status: 429, headers: { "retry-after": "45" } })));
    const before = Date.now();
    const error = await fetchChat("/api/chat").catch((cause) => cause) as ChatRequestError;
    expect(error).toBeInstanceOf(ChatRequestError);
    expect(error.kind).toBe("rate-limit");
    expect(error.retryAt).toBeGreaterThanOrEqual(before + 45_000);
    expect(error.message).not.toContain("private error detail");
  });

  it.each([[400, "invalid"], [413, "too-large"], [503, "unavailable"]])("classifies status %s", async (status, kind) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: status as number })));
    await expect(fetchChat("/api/chat")).rejects.toMatchObject({ kind });
  });

  it("distinguishes a lost connection from an intentional Stop", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(fetchChat("/api/chat")).rejects.toMatchObject({ kind: "connection" });
    const stopped = new DOMException("Stopped", "AbortError");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(stopped));
    await expect(fetchChat("/api/chat")).rejects.toBe(stopped);
  });

  it("passes through successful response streams unchanged", async () => {
    const response = new Response("stream content");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    expect(await fetchChat("/api/chat")).toBe(response);
    expect(await response.text()).toBe("stream content");
  });
});
