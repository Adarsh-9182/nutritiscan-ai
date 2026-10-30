import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateText } from "ai";
import { draftScience, runScience, validateScientistDraft, validateMode } from "./scientist";
import { newTrace } from "./diagnostics";
import { EvidenceReadError } from "@/lib/evidence/errors";
import { researchProviderStatus, RESEARCH_MODELS } from "./provider";
import { draft, request, source } from "./test-fixtures";

vi.mock("ai", async (original) => ({ ...await original<typeof import("ai")>(), generateText: vi.fn() }));
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", ""); });
afterEach(() => vi.unstubAllEnvs());
const signal = () => new AbortController().signal;

describe("research provenance", () => {
  it("accepts exact excerpts and rejects invented references and quotes", () => {
    expect(validateScientistDraft(draft, [source])).toEqual(draft);
    expect(validateScientistDraft({ ...draft, findings: [{ ...draft.findings[0], sourceIds: ["pubmed:999"] }] }, [source])).toBeNull();
    expect(validateScientistDraft({ ...draft, findings: [{ ...draft.findings[0], excerpts: [{ sourceId: source.id, quote: "The intervention reversed human aging completely." }] }] }, [source])).toBeNull();
    expect(validateScientistDraft(draft, [{ ...source, metadata: { hasAbstract: false } }])).toBeNull();
  });
  it("requires an excerpt for every cited source", () => {
    const other = { ...source, id: "pubmed:456" };
    expect(validateScientistDraft({ ...draft, findings: [{ ...draft.findings[0], sourceIds: [source.id, other.id] }] }, [source, other])).toBeNull();
  });
  it("retains supported findings when another finding has fabricated passages", () => {
    const bad = { ...draft.findings[0], text: "Unsupported second finding", excerpts: [{ sourceId: source.id, quote: "This passage does not exist in the retrieved source." }] };
    const result = validateScientistDraft({ ...draft, findings: [draft.findings[0], bad] }, [source]);
    expect(result?.findings).toEqual(draft.findings);
    expect(result?.limitations.join(" ")).toContain("1 draft finding(s) omitted");
  });
  it("rejects findings based on a retracted publication", () => {
    expect(validateScientistDraft(draft, [{ ...source, metadata: { hasAbstract: true, publicationTypes: ["Retracted Publication"] } }])).toBeNull();
  });
  it("requires the requested artifact and discards hypotheses without reviewed starting observations", () => {
    expect(validateMode({ ...draft, hypotheses: [] }, "hypotheses")).toBeNull();
    expect(validateMode(draft, "study-plan")).toBeNull();
    expect(validateMode({ ...draft, plan: ["Define eligibility", "Control confounders", "Validate independently"] }, "study-plan")?.plan).toHaveLength(3);
    expect(validateMode(draft, "evidence")).toMatchObject({ hypotheses: [], plan: [] });
    expect(validateMode({ ...draft, hypotheses: [{ ...draft.hypotheses[0], sourceIds: ["pubmed:unknown"] }] }, "hypotheses")).toBeNull();
  });
});

describe("research orchestration", () => {
  it("calls only enabled sources and preserves successful reads when another fails", async () => {
    const read = vi.fn().mockResolvedValueOnce([source]).mockRejectedValueOnce(new Error("Unavailable"));
    const draftFn = vi.fn().mockResolvedValue(null);
    const result = await runScience(request, signal(), vi.fn(), { read, draft: draftFn });
    expect(result.sources).toEqual([source]);
    expect(result.coverage.map((v) => v.status)).toEqual(["done", "failed"]);
    expect(result.status).toBe("sources-only");
    read.mockClear().mockResolvedValue([source]);
    await runScience({ ...request, sources: ["pubmed"] }, signal(), vi.fn(), { read, draft: draftFn });
    expect(read).toHaveBeenCalledTimes(1);
    expect(read.mock.calls[0][1]).toBe("pubmed");
  });
  it("keeps search terms separate from conversation history", async () => {
    const read = vi.fn().mockResolvedValue([source]);
    await runScience({ ...request, message: "Compare with the previous answer", history: [{ role: "user", content: "Prior project note" }], sources: ["pubmed"] }, signal(), vi.fn(), { read, draft: vi.fn().mockResolvedValue(null) });
    expect(read.mock.calls[0][2]).toBe("metabolic aging");
  });
  it("does not call a provider without a key, even if paid gateway credentials exist", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "synthetic-gateway-key");
    expect(researchProviderStatus().configured).toBe(false);
    expect(await draftScience(request, [source], signal(), vi.fn())).toBeNull();
    expect(generateText).not.toHaveBeenCalled();
  });
  it("honors cancellation before reading", async () => {
    const controller = new AbortController(); controller.abort(); const read = vi.fn();
    await expect(runScience(request, controller.signal, vi.fn(), { read })).rejects.toThrow();
    expect(read).not.toHaveBeenCalled();
  });
  it("labels source outages as failures, not empty evidence, while retaining other reads", async () => {
    const read = vi.fn().mockRejectedValueOnce(new EvidenceReadError("quota")).mockResolvedValueOnce([source]);
    const result = await runScience(request, signal(), vi.fn(), { read, draft: vi.fn().mockResolvedValue(null) });
    expect(result.coverage).toEqual([{ source: "pubmed", status: "failed", count: 0 }, { source: "trials", status: "done", count: 1 }]);
    expect(result.searches?.find((s) => s.source === "pubmed")).toMatchObject({ status: "failed", error: "quota" });
    expect(result.sources).toEqual([source]);
  });
  it("uses the eligible model fallback and a separate source-support check", async () => {
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "synthetic-test-key");
    vi.mocked(generateText).mockRejectedValueOnce(new Error("quota"));
    vi.mocked(generateText).mockResolvedValueOnce({ output: draft } as never);
    vi.mocked(generateText).mockResolvedValueOnce({ output: { items: [{ index: 0, verdict: "supported", reason: "The passage supports the association statement.", evidenceIndexes: [0] }] } } as never);
    const result = await draftScience(request, [source], signal(), vi.fn());
    expect(result?.model).toBe(RESEARCH_MODELS[1]);
    expect(result?.answer.findings).toHaveLength(1);
    expect(generateText).toHaveBeenCalledTimes(3);
  });
  it("withholds unsupported findings instead of returning them as successful research", async () => {
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "synthetic-test-key");
    vi.mocked(generateText).mockResolvedValue({ output: { ...draft, findings: [{ ...draft.findings[0], excerpts: [{ sourceId: source.id, quote: "Fabricated evidence that is absent from the source." }] }] } } as never);
    expect(await draftScience(request, [source], signal(), vi.fn())).toBeNull();
  });
  it("withholds a draft when the separate source-support review rejects its claim", async () => {
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "synthetic-test-key");
    let calls = 0;
    vi.mocked(generateText).mockImplementation(async () => ({ output: ++calls % 2 ? draft : { items: [{ index: 0, verdict: "unsupported", reason: "The finding overstates the source.", evidenceIndexes: [] }] } }) as never);
    expect(await draftScience(request, [source], signal(), vi.fn())).toBeNull();
    expect(generateText).toHaveBeenCalledTimes(RESEARCH_MODELS.length * 2);
  });
  it("distinguishes review timeouts from unsupported evidence without exposing upstream text", async () => {
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "synthetic-test-key");
    let calls = 0;
    vi.mocked(generateText).mockImplementation(async () => {
      if (++calls % 2) return { output: draft } as never;
      throw new DOMException("private provider payload", "TimeoutError");
    });
    const trace = newTrace();
    expect(await draftScience(request, [source], signal(), vi.fn(), trace)).toBeNull();
    expect(trace.diagnostics.every((d) => d.stage === "review" && d.code === "timeout")).toBe(true);
    expect(JSON.stringify(trace)).not.toContain("private provider payload");
  });
});
