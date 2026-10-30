import { afterEach, describe, expect, it, vi } from "vitest";
import { generateText } from "ai";
import { keywordQuery, planSearch } from "./search";
import { newTrace } from "./diagnostics";
import { request } from "./test-fixtures";

vi.mock("ai", async (original) => ({ ...await original<typeof import("ai")>(), generateText: vi.fn() }));
afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });
const signal = () => new AbortController().signal;

describe("research search planning", () => {
  it("recovers biomedical English words from the observed Hinglish failure", async () => {
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "");
    const message = "Insulin resistance aur cellular senescence ke beech humans mein kya evidence hai?";
    expect(keywordQuery(message)).toBe("insulin resistance cellular senescence humans");
    const plan = await planSearch({ ...request, query: "stale unrelated topic", searchMode: "auto", message }, signal(), vi.fn(), newTrace());
    expect(plan).toEqual({ strategy: "keywords", pubmed: ["insulin resistance cellular senescence humans"], trials: ["insulin resistance cellular senescence humans"] });
    expect(generateText).not.toHaveBeenCalled();
  });
  it("preserves a manual Boolean query without spending a model request", async () => {
    const plan = await planSearch({ ...request, query: "(senescence OR senescent) AND humans" }, signal(), vi.fn(), newTrace());
    expect(plan.pubmed).toEqual(["(senescence OR senescent) AND humans"]);
    expect(plan.strategy).toBe("manual"); expect(generateText).not.toHaveBeenCalled();
  });
  it("resolves follow-up context but does not reuse a stale query for a new topic", async () => {
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "synthetic-test-key");
    vi.mocked(generateText).mockResolvedValue({ output: { population: ["women"], intervention: ["time restricted eating"], comparison: [], outcome: [], designs: ["rct"] } } as never);
    const plan = await planSearch({ ...request, query: "old query", searchMode: "auto", message: "Now focus on women", history: [{ role: "user", content: "Time restricted eating trials" }, { role: "assistant", content: "Unverified old prose" }] }, signal(), vi.fn(), newTrace());
    expect(plan.pubmed[0]).toContain("women"); expect(plan.pubmed[0]).toContain("time restricted eating");
    const options = vi.mocked(generateText).mock.calls[0][0];
    expect(JSON.parse(options.prompt as string).previousQuestions).toEqual(["Time restricted eating trials"]);
    expect(options.prompt).not.toContain("Unverified old prose");
    expect(keywordQuery("What is the evidence on migraine?", [{ role: "user", content: "time restricted eating" }])).not.toContain("eating");
  });
  it("reports quota failures safely and falls back to keywords", async () => {
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "synthetic-test-key");
    vi.mocked(generateText).mockRejectedValue(Object.assign(new Error("SECRET upstream body"), { statusCode: 429 }));
    const trace = newTrace();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const plan = await planSearch({ ...request, searchMode: "auto" }, signal(), vi.fn(), trace);
    expect(plan.strategy).toBe("keywords"); expect(trace.diagnostics).toEqual([{ stage: "planning", code: "quota", model: "gemini-3.5-flash-lite" }]);
    expect(JSON.stringify(warn.mock.calls)).not.toContain("SECRET"); warn.mockRestore();
  });
  it("does not add an implicit RCT filter to a mechanism question", async () => {
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "synthetic-test-key");
    vi.mocked(generateText).mockResolvedValue({ output: { population: ["humans"], intervention: ["cellular senescence"], comparison: [], outcome: ["insulin resistance"], designs: [] } } as never);
    const plan = await planSearch({ ...request, searchMode: "auto" }, signal(), vi.fn(), newTrace());
    expect(plan.pubmed[0]).toBe("(humans) AND (cellular senescence) AND (insulin resistance)");
    expect(plan.pubmed[0]).not.toContain("randomized controlled trial");
    expect(keywordQuery("Now focus on women", [{ role: "user", content: "time restricted eating trials" }])).toBe("time restricted eating trials women");
  });
});
