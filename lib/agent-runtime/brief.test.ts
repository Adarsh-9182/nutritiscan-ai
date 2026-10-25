import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateText } from "ai";
import { hasAnyModel, resolveModel } from "@/lib/agents/provider";
import { applyJudgement, quoteFound, renderBrief, summarize, verifyQuotes } from "./brief";
import { RESEARCH_AGENT, type AgentSource } from "./contracts";

vi.mock("ai", async (importOriginal) => ({ ...await importOriginal<typeof import("ai")>(), generateText: vi.fn() }));
vi.mock("@/lib/agents/provider", () => ({ hasAnyModel: vi.fn(() => true), MODEL_TIERS: 3, resolveModel: vi.fn((_role, tier) => ({ id: `fixture-${tier}`, model: `fixture-${tier}`, providerOptions: {} })) }));
const sources: AgentSource[] = [{ id: "library:nutrition", title: "Nutrition", url: "https://medlineplus.gov/nutrition.html", kind: "reference", detail: "Individual food needs vary." }];
const request = { agent: RESEARCH_AGENT, task: "protein in vegetarian diets" };
const summary = { points: [{ text: "Individual food needs vary.", sourceIds: [sources[0].id], quote: "Individual food needs vary." }], gaps: [] };
const checked = { ...summary, points: [{ ...summary.points[0], check: "quote" as const }] };

beforeEach(() => {
  vi.clearAllMocks(); vi.mocked(generateText).mockReset(); vi.mocked(hasAnyModel).mockReturnValue(true);
});
describe("bounded model recovery", () => {
  it("tries another configured model after a provider failure", async () => {
    vi.mocked(generateText).mockRejectedValueOnce(new Error("quota")).mockResolvedValueOnce({ output: summary } as never);
    const progress = vi.fn();
    expect(await summarize(request, sources, new AbortController().signal, { onAttempt: progress })).toEqual(checked);
    expect(vi.mocked(resolveModel).mock.calls.slice(0, 2).map((call) => call[1])).toEqual([0, 1]);
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
    expect(await summarize(request, sources, new AbortController().signal)).toEqual(checked);
    expect(vi.mocked(generateText).mock.calls.length).toBeGreaterThanOrEqual(2);
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

const longSource: AgentSource = { id: "pubmed:1", title: "Trial", url: "https://pubmed.ncbi.nlm.nih.gov/1/", kind: "paper", detail: "RESULTS: Sputum conversion was higher in the vitamin D group (p=0.02).\nCONCLUSIONS: Benefit was limited to adults." };
const otherSource: AgentSource = { id: "pubmed:2", title: "Other", url: "https://pubmed.ncbi.nlm.nih.gov/2/", kind: "paper", detail: "Hypercalcemia was reported in children." };
const point = (over: Partial<{ text: string; sourceIds: string[]; quote: string }> = {}) => ({ text: "Vitamin D raised sputum conversion.", sourceIds: ["pubmed:1"], quote: "Sputum conversion was higher in the vitamin D group", ...over });

describe("quote verification", () => {
  it("finds a quote word for word, ignoring case and spacing", () => {
    expect(quoteFound("sputum  CONVERSION was higher in the vitamin D group", ["pubmed:1"], [longSource])).toBe(true);
  });
  it("checks each side of an omission separately", () => {
    expect(quoteFound("Sputum conversion was higher ... Benefit was limited to adults", ["pubmed:1"], [longSource])).toBe(true);
    expect(quoteFound("Sputum conversion was higher ... Benefit extended to children", ["pubmed:1"], [longSource])).toBe(false);
  });
  it("rejects a paraphrase, a very short fragment, and a quote found only in an uncited source", () => {
    expect(quoteFound("Vitamin D clearly improved sputum conversion", ["pubmed:1"], [longSource])).toBe(false);
    expect(quoteFound("Sputum", ["pubmed:1"], [longSource])).toBe(false);
    expect(quoteFound("Hypercalcemia was reported in children", ["pubmed:1"], [longSource, otherSource])).toBe(false);
  });
  it("removes unverifiable claims, says so, and refuses a summary with nothing left", () => {
    const result = verifyQuotes({ points: [point(), point({ quote: "Vitamin D cured everyone in the trial" })], gaps: [] }, [longSource]);
    expect(result?.points).toHaveLength(1);
    expect(result?.points[0].check).toBe("quote");
    expect(result?.gaps.at(-1)).toMatch(/1 claim was removed/);
    expect(verifyQuotes({ points: [point({ quote: "Entirely invented sentence here" })], gaps: [] }, [longSource])).toBeNull();
  });
});

describe("support judgement", () => {
  const two = { points: [point({ check: "quote" } as never), point({ text: "Benefit extended to children.", quote: "Benefit was limited to adults" })], gaps: [] };
  it("keeps claims when the judge is unavailable", () => expect(applyJudgement(two, null)).toBe(two));
  it("removes claims the judge rejects and marks the rest as checked", () => {
    const result = applyJudgement(two, [true, false]);
    expect(result?.points.map((p) => p.check)).toEqual(["supported"]);
    expect(result?.gaps.at(-1)).toMatch(/did not clearly support/);
  });
  it("returns null when nothing is supported", () => expect(applyJudgement(two, [false, false])).toBeNull());

  it("runs the judge after synthesis and drops what it rejects", async () => {
    const draft = { points: [point(), point({ text: "Benefit extended to children.", quote: "Benefit was limited to adults" })], gaps: [] };
    vi.mocked(generateText).mockResolvedValueOnce({ output: draft } as never).mockResolvedValueOnce({ output: { verdicts: [{ index: 0, supported: true }, { index: 1, supported: false }] } } as never);
    const result = await summarize(request, [longSource], new AbortController().signal);
    expect(result?.points.map((p) => [p.text, p.check])).toEqual([["Vitamin D raised sputum conversion.", "supported"]]);
    expect(result?.gaps.at(-1)).toMatch(/did not clearly support/);
  });
  it("falls back to the next model when the judge's answer is incomplete", async () => {
    vi.mocked(generateText).mockResolvedValueOnce({ output: { points: [point()], gaps: [] } } as never)
      .mockResolvedValueOnce({ output: { verdicts: [] } } as never).mockResolvedValueOnce({ output: { verdicts: [{ index: 0, supported: true }] } } as never);
    const result = await summarize(request, [longSource], new AbortController().signal);
    expect(result?.points[0].check).toBe("supported");
  });
});

describe("brief rendering", () => {
  it("prints each quote with how it was checked, escaped", () => {
    const text = renderBrief(request, [longSource], { points: [{ ...point(), quote: "Sputum conversion *was* higher", check: "quote" }], gaps: [] }, "2026-10-25T00:00:00.000Z");
    expect(text).toContain("> Quote: Sputum conversion \\*was\\* higher");
    expect(text).toContain("support not independently judged");
  });
});
