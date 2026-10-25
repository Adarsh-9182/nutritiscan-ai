import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateText } from "ai";
import { hasAnyModel, resolveModel } from "@/lib/agents/provider";
import { summarize } from "./brief";
import { RESEARCH_AGENT, type AgentSource } from "./contracts";

vi.mock("ai", async (importOriginal) => ({ ...await importOriginal<typeof import("ai")>(), generateText: vi.fn() }));
vi.mock("@/lib/agents/provider", () => ({ hasAnyModel: vi.fn(() => true), MODEL_TIERS: 3, resolveModel: vi.fn((_role, tier) => ({ id: `fixture-${tier}`, model: `fixture-${tier}`, providerOptions: {} })) }));
const sources: AgentSource[] = [{ id: "library:nutrition", title: "Nutrition", url: "https://medlineplus.gov/nutrition.html", kind: "reference", detail: "Individual food needs vary." }];
const request = { agent: RESEARCH_AGENT, task: "protein in vegetarian diets" };
const summary = { points: [{ text: "Individual food needs vary.", sourceIds: [sources[0].id] }], gaps: [] };

beforeEach(() => {
  vi.clearAllMocks(); vi.mocked(generateText).mockReset(); vi.mocked(hasAnyModel).mockReturnValue(true);
});
describe("bounded model recovery", () => {
  it("tries another configured model after a provider failure", async () => {
    vi.mocked(generateText).mockRejectedValueOnce(new Error("quota")).mockResolvedValueOnce({ output: summary } as never);
    const progress = vi.fn();
    expect(await summarize(request, sources, new AbortController().signal, { onAttempt: progress })).toEqual(summary);
    expect(vi.mocked(resolveModel).mock.calls.map((call) => call[1])).toEqual([0, 1]);
    expect(progress.mock.calls.flat()).toEqual([1, 2]);
  });
  it("keeps retries bounded and shares one deadline across attempts", async () => {
    vi.mocked(generateText).mockRejectedValue(new Error("unavailable"));
    expect(await summarize(request, sources, new AbortController().signal)).toBeNull();
    expect(generateText).toHaveBeenCalledTimes(3);
    const signals = vi.mocked(generateText).mock.calls.map(([options]) => options.abortSignal);
    expect(new Set(signals).size).toBe(1);
    for (const [options] of vi.mocked(generateText).mock.calls) expect(options.maxRetries).toBe(0);
  });
  it("retries an invalid citation instead of publishing it", async () => {
    vi.mocked(generateText).mockResolvedValueOnce({ output: { ...summary, points: [{ text: "Invented finding", sourceIds: ["fake:123"] }] } } as never).mockResolvedValueOnce({ output: summary } as never);
    expect(await summarize(request, sources, new AbortController().signal)).toEqual(summary);
    expect(generateText).toHaveBeenCalledTimes(2);
  });
  it("skips inference without credentials and preserves intentional cancellation", async () => {
    vi.mocked(hasAnyModel).mockReturnValue(false);
    expect(await summarize(request, sources, new AbortController().signal)).toBeNull();
    expect(generateText).not.toHaveBeenCalled();
    vi.mocked(hasAnyModel).mockReturnValue(true);
    const stopped = new AbortController(); stopped.abort();
    await expect(summarize(request, sources, stopped.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(generateText).not.toHaveBeenCalled();
  });
});
