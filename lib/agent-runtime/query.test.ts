import { describe, expect, it, vi } from "vitest";
import { MAX_QUERY_LENGTH, PicoSchema, composeQueries, extractPico, planPubmedQuery, searchLadder, type Pico } from "./query";

const searchPubMed = vi.hoisted(() => vi.fn());
vi.mock("@/lib/evidence/pubmed", () => ({ searchPubMed }));

const pico = (over: Partial<Pico> = {}): Pico => ({
  population: ["tuberculosis"], intervention: ["vitamin D", "cholecalciferol"], comparison: ["placebo"], outcome: ["sputum conversion"], designs: ["rct"], ...over,
});
const signal = () => new AbortController().signal;

describe("composeQueries", () => {
  it("ANDs concepts, ORs synonyms, and starts with the strictest query", () => {
    const [strict] = composeQueries(pico());
    expect(strict).toContain(`"vitamin d"[MeSH Terms] OR "vitamin d"[tiab] OR "cholecalciferol"[MeSH Terms]`);
    expect(strict).toContain(`"randomized controlled trial"[pt]`);
    expect(strict.split(" AND ")).toHaveLength(5);
  });

  it("loosens one part at a time and ends at the intervention alone", () => {
    const ladder = composeQueries(pico());
    expect(ladder.map((query) => query.split(" AND ").length)).toEqual([5, 3, 2, 1]);
    expect(ladder.at(-1)).not.toContain("tuberculosis");
  });

  it("falls back to the population when no intervention is stated", () => {
    expect(composeQueries(pico({ intervention: [], comparison: [], outcome: [], designs: [] }))).toEqual([expect.stringContaining("tuberculosis")]);
  });

  it("strips PubMed syntax so a hostile term cannot change the query", () => {
    const [query] = composeQueries(pico({ intervention: [`x"[All Fields] OR (aspirin) NOT *`], designs: [] }));
    expect(query).not.toMatch(/\(aspirin\)|\*|\bNOT\b/);
    expect(query).toContain(`"x all fields aspirin"`);
  });

  it("drops duplicate terms and never exceeds the audit length limit", () => {
    const wide = pico({ population: ["a long population phrase one", "a long population phrase two", "a long population phrase three"], intervention: ["intervention phrase number one", "intervention phrase number two", "intervention phrase number three"] });
    for (const query of composeQueries(wide)) expect(query.length).toBeLessThanOrEqual(MAX_QUERY_LENGTH);
    expect(composeQueries(pico({ intervention: ["Aspirin", "aspirin"], designs: [] }))[0].match(/"aspirin"\[tiab\]/g)).toHaveLength(1);
  });

  it("returns nothing for empty concepts", () => {
    expect(composeQueries(pico({ population: [], intervention: [], comparison: [], outcome: [], designs: [] }))).toEqual([]);
  });
});

describe("PicoSchema", () => {
  it("rejects unknown designs and extra fields", () => {
    expect(PicoSchema.safeParse({ ...pico(), designs: ["anything"] }).success).toBe(false);
    expect(PicoSchema.safeParse({ ...pico(), extra: 1 }).success).toBe(false);
  });
});

describe("searchLadder", () => {
  it("stops at the first rung with enough records", async () => {
    searchPubMed.mockReset().mockResolvedValueOnce(["1"]).mockResolvedValueOnce(["1", "2", "3"]);
    const found = await searchLadder(["strict", "looser", "loosest"], "raw question", { limit: 6, signal: signal() });
    expect(found).toEqual({ query: "looser", ids: ["1", "2", "3"], rung: 1 });
    expect(searchPubMed).toHaveBeenCalledTimes(2);
  });

  it("keeps the best partial result and tries the raw question last", async () => {
    searchPubMed.mockReset().mockResolvedValueOnce([]).mockResolvedValueOnce(["9", "8"]).mockResolvedValueOnce([]);
    const found = await searchLadder(["strict", "looser"], "raw question", { limit: 6, signal: signal() });
    expect(found).toMatchObject({ query: "looser", ids: ["9", "8"] });
    expect(searchPubMed).toHaveBeenLastCalledWith("raw question", expect.anything());
  });

  it("stops when aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(searchLadder(["a"], "raw", { limit: 6, signal: controller.signal })).rejects.toBeDefined();
  });
});

describe("planning without a model", () => {
  it("keeps the question as typed and makes no PubMed call", async () => {
    searchPubMed.mockReset();
    expect(await extractPico("does vitamin D help in TB", signal())).toBeNull();
    expect(await planPubmedQuery("does vitamin D help in TB", signal())).toBeNull();
    expect(searchPubMed).not.toHaveBeenCalled();
  });
});
