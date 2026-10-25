import { describe, expect, it, vi } from "vitest";
import { RESEARCH_AGENT } from "./contracts";
import { MAX_QUERY_LENGTH } from "./query";
import { executeReadPlugin } from "./plugins";

const findPapers = vi.hoisted(() => vi.fn());
vi.mock("@/lib/evidence/pubmed", () => ({ findPapers }));
vi.mock("@/lib/evidence/trials", () => ({ searchTrials: vi.fn().mockResolvedValue([]) }));

const signal = () => new AbortController().signal;

describe("executeReadPlugin query bound", () => {
  it("accepts a planned query up to the audit limit, so a long PubMed query is not rejected", async () => {
    findPapers.mockReset().mockResolvedValue([]);
    const planned = `"${"a".repeat(MAX_QUERY_LENGTH - 2)}"`;
    await expect(executeReadPlugin(RESEARCH_AGENT, "pubmed", planned, signal())).resolves.toEqual([]);
    expect(findPapers).toHaveBeenCalledWith(planned, expect.anything());
  });

  it("rejects a query beyond the limit", async () => {
    await expect(executeReadPlugin(RESEARCH_AGENT, "pubmed", "a".repeat(MAX_QUERY_LENGTH + 1), signal())).rejects.toBeDefined();
  });

  it("still refuses a plugin the agent was not given", async () => {
    await expect(executeReadPlugin({ ...RESEARCH_AGENT, plugins: ["library", "artifact"] }, "pubmed", "metformin", signal())).rejects.toThrow(/permission/);
  });
});
