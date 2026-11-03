import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchTrial, searchTrials } from "./trials";
import { trialSource } from "./records";

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

describe("canonical trial retrieval", () => {
  it("uses a fixed registry URL and preserves enrollment and planned endpoints without claiming efficacy", async () => {
    const mocked = vi.fn<typeof fetch>(async () => Response.json({ protocolSection: {
      identificationModule: { nctId: "NCT01234567", briefTitle: "Synthetic registry record" },
      designModule: { studyType: "INTERVENTIONAL", enrollmentInfo: { count: 42, type: "ESTIMATED" } },
      eligibilityModule: { minimumAge: "18 Years", eligibilityCriteria: "Synthetic eligibility criteria" },
      outcomesModule: { primaryOutcomes: [{ measure: "Synthetic biomarker change", timeFrame: "12 weeks" }] },
    } }));
    vi.stubGlobal("fetch", mocked);
    const trial = await fetchTrial("NCT01234567", new AbortController().signal);
    expect(mocked.mock.calls[0][0]).toBe("https://clinicaltrials.gov/api/v2/studies/NCT01234567?format=json");
    expect(trialSource(trial!).detail).toContain("42 (ESTIMATED)");
    expect(trialSource(trial!).detail).toContain("Planned primary endpoints (not results)");
    expect(trialSource(trial!).detail).toContain("Synthetic biomarker change");
  });
  it("rejects invalid/mismatched IDs and distinguishes missing records from quota errors", async () => {
    const mocked = vi.fn(); vi.stubGlobal("fetch", mocked);
    await expect(fetchTrial("https://localhost/private", new AbortController().signal)).rejects.toMatchObject({ code: "invalid-response" });
    expect(mocked).not.toHaveBeenCalled();
    mocked.mockResolvedValueOnce(new Response(null, { status: 404 }));
    expect(await fetchTrial("NCT01234567", new AbortController().signal)).toBeNull();
    mocked.mockResolvedValueOnce(new Response(null, { status: 429 }));
    await expect(fetchTrial("NCT01234567", new AbortController().signal)).rejects.toMatchObject({ code: "quota" });
    mocked.mockResolvedValueOnce(Response.json({ protocolSection: { identificationModule: { nctId: "NCT11111111", briefTitle: "Wrong record" } } }));
    await expect(fetchTrial("NCT01234567", new AbortController().signal)).rejects.toMatchObject({ code: "invalid-response" });
  });
});
