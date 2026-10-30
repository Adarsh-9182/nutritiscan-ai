import { describe, expect, it, vi } from "vitest";
import { consumeResearch, readResearch, saveResearch, RESEARCH_STORAGE } from "./client";
import { reply, request, streamReply } from "./test-fixtures";

describe("research transport and storage", () => {
  it("accepts a complete stream and rejects a truncated or inconsistent stream", async () => {
    const emit = vi.fn(); await consumeResearch(streamReply(), emit);
    expect(emit.mock.calls.at(-1)?.[0]).toEqual({ type: "result", result: reply });
    await expect(consumeResearch(new Response('{"type":"step","text":"Searching"}\n'), vi.fn())).rejects.toThrow("before research completed");
    await expect(consumeResearch(new Response(`${JSON.stringify({ type: "result", result: reply })}\n{"type":"step","text":"late"}\n`), vi.fn())).rejects.toThrow("inconsistent");
  });
  it("handles JSON records split across network chunks", async () => {
    const data = new TextEncoder().encode(`${JSON.stringify({ type: "result", result: reply })}\n`);
    const response = new Response(new ReadableStream({ start(c) { c.enqueue(data.slice(0, 25)); c.enqueue(data.slice(25)); c.close(); } }));
    const emit = vi.fn(); await consumeResearch(response, emit); expect(emit).toHaveBeenCalledTimes(1);
  });
  it("isolates research history and restores interrupted work as stopped", () => {
    const values = new Map([["ns-health", "private health fixture"]]);
    vi.stubGlobal("localStorage", { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => values.set(k, v) });
    const turnRequest = { message: request.message, query: request.query, mode: request.mode, sources: request.sources };
    saveResearch([{ id: "project", title: "Metabolic aging", query: "metabolic aging", updatedAt: 1, turns: [{ id: "turn", request: turnRequest, phase: "working", reply: null }] }], "project");
    const restored = readResearch(); expect(restored.threads[0].turns[0].phase).toBe("stopped");
    expect(values.get("ns-health")).toBe("private health fixture");
    expect(values.get(RESEARCH_STORAGE)).not.toContain("private health fixture");
    vi.unstubAllGlobals();
  });
});
