import { afterEach, describe, expect, it, vi } from "vitest";
import { searchTrials } from "./trials";

afterEach(() => vi.unstubAllGlobals());

describe("searchTrials", () => {
  it("maps registry records to bounded, linkable source cards", async () => {
    const fetchMock = vi.fn(async (input: URL | RequestInfo) => {
      requested.push(String(input));
      return {
        ok: true,
        json: async () => ({ studies: [{ protocolSection: {
          identificationModule: { nctId: "NCT01234567", briefTitle: "A study of example" },
          statusModule: { overallStatus: "RECRUITING", startDateStruct: { date: "2024-01" } },
          designModule: { studyType: "INTERVENTIONAL" },
          conditionsModule: { conditions: ["Example condition"] },
          armsInterventionsModule: { interventions: [{ name: "Example intervention" }] },
        } }] }),
      };
    });
    const requested: string[] = [];
    vi.stubGlobal("fetch", fetchMock);
    const trials = await searchTrials("example condition");
    expect(trials[0]).toMatchObject({
      nctId: "NCT01234567", status: "RECRUITING", studyType: "INTERVENTIONAL",
      url: "https://clinicaltrials.gov/study/NCT01234567", conditions: ["Example condition"],
    });
    expect(new URL(requested[0]).searchParams.get("query.term")).toBe("example condition");
  });

  it("skips empty queries and invalid registry records", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ studies: [{ protocolSection: { identificationModule: { nctId: "bad", briefTitle: "invalid" } } }] }) }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await searchTrials("  ")).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await searchTrials("example")).toEqual([]);
  });

  it("degrades to no registry records on service errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));
    expect(await searchTrials("example")).toEqual([]);
  });
});
