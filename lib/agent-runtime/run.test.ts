import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { RESEARCH_AGENT, RunEventSchema, RunRequestSchema, type AgentSource, type RunEvent } from "./contracts";
import { runAgent } from "./run";
import { executeReadPlugin } from "./plugins";
import { validateSummary } from "./brief";

const source: AgentSource = { id: "library:nutrition", title: "Nutrition", url: "https://medlineplus.gov/nutrition.html", kind: "reference", detail: "Individual food needs vary." };
const request = { agent: { ...RESEARCH_AGENT, plugins: ["library", "artifact"] as const }, task: "protein in vegetarian diets" };
const input = () => RunRequestSchema.parse(request);

describe("bounded research agent", () => {
  it("executes permitted reads, validates a file, and pauses for approval without exporting", async () => {
    const events: RunEvent[] = [];
    const read = vi.fn().mockResolvedValue([source]);
    await runAgent(input(), { signal: new AbortController().signal, emit: (event) => events.push(event), read, synthesize: async () => null });
    expect(read.mock.calls.map((call) => call[1])).toEqual(["library"]);
    for (const event of events) expect(RunEventSchema.safeParse(event).success).toBe(true);
    expect(events.filter((event) => event.type === "step" && event.status === "running")).toHaveLength(3);
    const final = events.at(-1);
    expect(final?.type).toBe("approval");
    if (final?.type !== "approval") throw new Error("Missing approval");
    expect(final.artifact.mode).toBe("source-collection");
    expect(final.artifact.sha256).toBe(createHash("sha256").update(final.artifact.content).digest("hex"));
    expect(final.artifact.bytes).toBe(Buffer.byteLength(final.artifact.content));
    expect(final.artifact.content).toContain(source.url);
  });

  it("does not claim success when every source is empty", async () => {
    const events: RunEvent[] = [];
    const synthesize = vi.fn();
    await runAgent(input(), { signal: new AbortController().signal, emit: (event) => events.push(event), read: async () => [], synthesize });
    expect(events.at(-1)?.type).toBe("failed");
    expect(events.some((event) => event.type === "approval")).toBe(false);
    expect(synthesize).not.toHaveBeenCalled();
  });

  it("stops without retrieval when the existing triage detects an emergency", async () => {
    const read = vi.fn();
    const events: RunEvent[] = [];
    await runAgent({ ...input(), task: "I have severe chest pain and cannot breathe" }, { signal: new AbortController().signal, emit: (event) => events.push(event), read });
    expect(read).not.toHaveBeenCalled();
    expect(events.at(-1)).toMatchObject({ type: "failed", message: expect.stringContaining("emergency help") });
  });

  it("cancels a stalled plugin rather than waiting for it to resolve", async () => {
    const controller = new AbortController();
    const events: RunEvent[] = [];
    const promise = runAgent(input(), { signal: controller.signal, emit: (event) => events.push(event), read: () => new Promise(() => {}) });
    controller.abort();
    await promise;
    expect(events.at(-1)?.type).toBe("cancelled");
    expect(events.some((event) => event.type === "approval")).toBe(false);
  });

  it("rejects unexpected source origins rather than exporting them", async () => {
    const events: RunEvent[] = [];
    await runAgent(input(), { signal: new AbortController().signal, emit: (event) => events.push(event), read: async () => [{ ...source, url: "https://attacker.example/" }] });
    expect(events.at(-1)?.type).toBe("failed");
  });

  it("checks plugin permission before any provider call", async () => {
    await expect(executeReadPlugin(input().agent, "pubmed", request.task, new AbortController().signal)).rejects.toThrow("permission");
    await expect(executeReadPlugin(RESEARCH_AGENT, "__proto__", request.task, new AbortController().signal)).rejects.toThrow("permission");
  });

  it("rejects duplicate or unknown plugins in browser-authored definitions", () => {
    expect(RunRequestSchema.safeParse({ ...request, agent: { ...request.agent, plugins: ["library", "library", "artifact"] } }).success).toBe(false);
    expect(RunRequestSchema.safeParse({ ...request, agent: { ...request.agent, plugins: ["shell", "artifact"] } }).success).toBe(false);
  });

  it("rejects hallucinated citation IDs and accepts known ones", () => {
    expect(validateSummary({ points: [{ text: "A claim", sourceIds: ["fake:123"] }], gaps: [] }, [source])).toBeNull();
    expect(validateSummary({ points: [{ text: "A claim", sourceIds: [source.id] }], gaps: [] }, [source])?.points).toHaveLength(1);
  });
  it("withholds an unsafe summary even when its citation ID is valid", async () => {
    const events: RunEvent[] = [];
    await runAgent(input(), {
      signal: new AbortController().signal, emit: (event) => events.push(event), read: async () => [source],
      synthesize: async () => ({ points: [{ text: "You definitely have diabetes. Start taking metformin.", sourceIds: [source.id] }], gaps: [] }),
    });
    const final = events.at(-1);
    expect(final?.type).toBe("approval");
    if (final?.type !== "approval") throw new Error("Missing source collection");
    expect(final.artifact.mode).toBe("source-collection");
    expect(final.artifact.content).not.toContain("definitely have diabetes");
  });
});
