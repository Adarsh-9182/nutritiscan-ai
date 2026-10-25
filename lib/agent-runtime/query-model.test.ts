import { afterEach, describe, expect, it, vi } from "vitest";
import { extractPico } from "./query";

const generateText = vi.hoisted(() => vi.fn());
const resolveModel = vi.hoisted(() => vi.fn());
vi.mock("ai", () => ({ generateText, Output: { object: (config: unknown) => config } }));
vi.mock("@/lib/agents/provider", () => ({ hasAnyModel: () => true, resolveModel }));
vi.mock("@/lib/evidence/pubmed", () => ({ searchPubMed: vi.fn() }));

const plan = { population: ["tuberculosis"], intervention: ["vitamin D"], comparison: [], outcome: [], designs: ["rct"] };
const signal = () => new AbortController().signal;

afterEach(() => { vi.restoreAllMocks(); generateText.mockReset(); resolveModel.mockReset(); });

describe("extractPico with a model", () => {
  it("steps down to the next model when one fails, and logs only the error name", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    resolveModel.mockImplementation((_role: string, tier: number) => ({ model: `m${tier}`, providerOptions: {} }));
    generateText.mockRejectedValueOnce(Object.assign(new Error("quota exceeded for key SECRET and question text"), { name: "RateLimitError", statusCode: 429 })).mockResolvedValueOnce({ output: plan });
    const pico = await extractPico("does vitamin D help TB patients", signal());
    expect(pico?.intervention).toEqual(["vitamin D"]);
    expect(resolveModel.mock.calls.map((call) => call[1])).toEqual([2, 0]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toBe("[agent-runtime] search planning failed on tier 2: RateLimitError (429)");
  });

  it("returns null after every model fails, so the question is searched as typed", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    resolveModel.mockReturnValue({ model: "m", providerOptions: {} });
    generateText.mockRejectedValue(new Error("down"));
    expect(await extractPico("anything", signal())).toBeNull();
    expect(generateText).toHaveBeenCalledTimes(2);
  });

  it("accepts a plan with too many terms by trimming it", async () => {
    resolveModel.mockReturnValue({ model: "m", providerOptions: {} });
    generateText.mockResolvedValue({ output: { ...plan, population: ["a1", "b2", "c3", "d4"] } });
    expect((await extractPico("q", signal()))?.population).toHaveLength(3);
  });

  it("does not swallow a caller's abort", async () => {
    const controller = new AbortController();
    resolveModel.mockReturnValue({ model: "m", providerOptions: {} });
    generateText.mockImplementation(async () => { controller.abort(); throw new Error("aborted"); });
    await expect(extractPico("q", controller.signal)).rejects.toBeDefined();
  });
});
