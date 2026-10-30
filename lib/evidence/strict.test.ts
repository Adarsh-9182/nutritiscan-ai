import { afterEach, describe, expect, it, vi } from "vitest";
import { searchPubMed, fetchPapers } from "./pubmed";
import { searchTrials } from "./trials";

afterEach(() => vi.unstubAllGlobals());
describe("research source failure reporting", () => {
  it("separates an empty PubMed search from an upstream quota failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response('{"esearchresult":{"idlist":[]}}')).mockResolvedValueOnce(new Response("private upstream body", { status: 429 })));
    expect(await searchPubMed("senescence", { strict: true })).toEqual([]);
    await expect(searchPubMed("senescence", { strict: true })).rejects.toMatchObject({ code: "quota", message: "Evidence service: quota" });
  });
  it("reports malformed PubMed responses instead of claiming no evidence", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response("not json")).mockResolvedValueOnce(new Response("not article XML")));
    await expect(searchPubMed("senescence", { strict: true })).rejects.toMatchObject({ code: "invalid-response" });
    await expect(fetchPapers(["32986097"], { strict: true })).rejects.toMatchObject({ code: "invalid-response" });
  });
  it("preserves legacy non-throwing reads but reports research trial outages", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("upstream unavailable", { status: 503 })));
    expect(await searchTrials("aging")).toEqual([]);
    await expect(searchTrials("aging", { strict: true })).rejects.toMatchObject({ code: "unavailable" });
  });
  it("does not confuse an empty trial search with invalid payloads", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response('{"studies":[]}')).mockResolvedValueOnce(new Response('{"error":"bad"}')));
    expect(await searchTrials("aging", { strict: true })).toEqual([]);
    await expect(searchTrials("aging", { strict: true })).rejects.toMatchObject({ code: "invalid-response" });
  });
});
