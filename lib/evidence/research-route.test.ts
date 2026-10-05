import { beforeEach, describe, expect, it, vi } from "vitest";

const findPapers = vi.hoisted(() => vi.fn());
const searchTrials = vi.hoisted(() => vi.fn());
vi.mock("@/lib/evidence/pubmed", () => ({ findPapers }));
vi.mock("@/lib/evidence/trials", () => ({ searchTrials }));

import { POST } from "../../app/api/research/route";

describe("POST /api/research", () => {
  beforeEach(() => {
    findPapers.mockReset().mockResolvedValue([]);
    searchTrials.mockReset().mockResolvedValue([]);
  });

  it("returns bounded results from both public evidence sources", async () => {
    findPapers.mockResolvedValue([{ pmid: "123", title: "Study", abstract: "Abstract", url: "https://pubmed.ncbi.nlm.nih.gov/123/" }]);
    searchTrials.mockResolvedValue([{ nctId: "NCT01234567", title: "Trial", url: "https://clinicaltrials.gov/study/NCT01234567" }]);
    const response = await POST(new Request("http://localhost/api/research", {
      method: "POST", headers: { "content-type": "application/json", "x-real-ip": "research-test-1" },
      body: JSON.stringify({ question: "Does example treatment help?" }),
    }));
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.sources.pubmed).toHaveLength(1);
    expect(payload.sources.clinicalTrials).toHaveLength(1);
    expect(payload.limitations).toHaveLength(3);
    expect(findPapers).toHaveBeenCalledWith("Does example treatment help?", expect.objectContaining({ limit: 8 }));
    expect(searchTrials).toHaveBeenCalledWith("Does example treatment help?", expect.objectContaining({ limit: 8 }));
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("rejects invalid or extra fields before contacting sources", async () => {
    const response = await POST(new Request("http://localhost/api/research", {
      method: "POST", headers: { "content-type": "application/json", "x-real-ip": "research-test-2" },
      body: JSON.stringify({ question: "ok", patientHistory: "private" }),
    }));
    expect(response.status).toBe(400);
    expect(findPapers).not.toHaveBeenCalled();
    expect(searchTrials).not.toHaveBeenCalled();
  });
});
