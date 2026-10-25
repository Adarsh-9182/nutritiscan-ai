import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { RESEARCH_AGENT, RunEventSchema, RunRequestSchema, type AgentSource, type RunEvent } from "./contracts";
import { runAgent } from "./run";
import { executeReadPlugin } from "./plugins";
import { validateSummary } from "./brief";
import { planResearch } from "./plan";

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

  it("sends a planned query to PubMed only, records it in the audit, and keeps the plain question elsewhere", async () => {
    const events: RunEvent[] = [];
    const read = vi.fn().mockResolvedValue([source]);
    const planQuery = vi.fn().mockResolvedValue('"vegetarian diet"[MeSH Terms] AND "protein"[tiab]');
    await runAgent({ ...input(), agent: { ...RESEARCH_AGENT, plugins: ["library", "pubmed", "artifact"] } }, { signal: new AbortController().signal, emit: (event) => events.push(event), read, synthesize: async () => null, planQuery });
    const queries = Object.fromEntries(read.mock.calls.map((call) => [call[1], call[2]]));
    expect(queries).toEqual({ library: request.task, pubmed: '"vegetarian diet"[MeSH Terms] AND "protein"[tiab]' });
  });

  it("never replaces the user's own search terms with a planned query", async () => {
    const read = vi.fn().mockResolvedValue([source]);
    const planQuery = vi.fn();
    await runAgent({ ...input(), searchTerms: "vegetarian protein", agent: { ...RESEARCH_AGENT, plugins: ["library", "pubmed", "artifact"] } }, { signal: new AbortController().signal, emit: () => undefined, read, synthesize: async () => null, planQuery });
    expect(planQuery).not.toHaveBeenCalled();
    expect(read.mock.calls.map((call) => call[2])).toEqual(["vegetarian protein", "vegetarian protein"]);
  });

  it("uses explicit public search terms while retaining the original question and an audit", async () => {
    const events: RunEvent[] = [];
    const read = vi.fn().mockResolvedValue([source]);
    const synthesize = vi.fn(async (received: unknown) => { expect(received).toMatchObject({ task: request.task }); return null; });
    await runAgent({ ...input(), searchTerms: "vegetarian protein" }, { signal: new AbortController().signal, emit: (event) => events.push(event), read, synthesize });
    expect(read.mock.calls[0][2]).toBe("vegetarian protein");
    expect(synthesize.mock.calls[0][0]).toMatchObject({ task: request.task, searchTerms: "vegetarian protein" });
    const final = events.at(-1);
    if (final?.type !== "approval") throw new Error("Missing approval");
    expect(final.artifact.searches).toEqual([{ plugin: "library", query: "vegetarian protein", status: "done", returned: 1, retry: false }]);
    expect(final.artifact.content).toContain("Question: protein in vegetarian diets");
    expect(final.artifact.content).toContain("Query: vegetarian protein");
  });

  it("lets other permitted sources finish when a read stalls", async () => {
    vi.useFakeTimers();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockImplementation((milliseconds) => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(new DOMException("Timed out", "TimeoutError")), milliseconds);
      return controller.signal;
    });
    try {
      const events: RunEvent[] = [];
      const running = runAgent({ ...input(), agent: { ...input().agent, plugins: ["library", "pubmed", "artifact"] } }, {
        signal: new AbortController().signal, emit: (event) => events.push(event),
        read: async (_agent, id) => id === "library" ? new Promise(() => {}) : [
          { id: "pubmed:123", title: "Nutrition paper", url: "https://pubmed.ncbi.nlm.nih.gov/123/", kind: "paper", detail: "Public abstract" },
        ], synthesize: async () => null,
      });
      await vi.advanceTimersByTimeAsync(8001);
      await running;
      expect(events.at(-1)?.type).toBe("approval");
      const final = events.at(-1);
      if (final?.type === "approval") expect(final.artifact.searches).toMatchObject([
        { plugin: "library", status: "failed" }, { plugin: "pubmed", status: "done" },
      ]);
    } finally { timeout.mockRestore(); vi.useRealTimers(); }
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
  it("recovers a failed public source without discarding successful reads", async () => {
    const events: RunEvent[] = [];
    const paper = { ...source, id: "pubmed:123", kind: "paper" as const, url: "https://pubmed.ncbi.nlm.nih.gov/123/" };
    let attempts = 0;
    const read = vi.fn(async (_agent, id) => {
      if (id === "library") return [source];
      if (++attempts === 1) throw new Error("temporary provider failure");
      return [paper];
    });
    await runAgent({ ...input(), agent: { ...input().agent, plugins: ["library", "pubmed", "artifact"] } }, { signal: new AbortController().signal, emit: (event) => events.push(event), read, synthesize: async () => null });
    const final = events.at(-1);
    expect(final?.type).toBe("approval");
    if (final?.type !== "approval") throw new Error("Missing approval");
    expect(final.artifact.sources.map((item) => item.id)).toEqual([source.id, paper.id]);
    expect(attempts).toBe(2);
    expect(events).toContainEqual(expect.objectContaining({ id: "pubmed-retry", status: "done" }));
  });
  it("prioritizes the requested source while keeping tool permissions intact", () => {
    expect(planResearch({ agent: RESEARCH_AGENT, task: "registered clinical trials about sleep" }).readers[0]).toBe("trials");
    expect(planResearch({ ...input(), task: "registered clinical trials about sleep" }).readers).toEqual(["library"]);
  });
});
