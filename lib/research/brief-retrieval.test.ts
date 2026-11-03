import { afterEach, describe, expect, it, vi } from "vitest";
import { refetchBriefSources } from "./brief-agent";
import { fetchPapers } from "@/lib/evidence/pubmed";
import { fetchTrial } from "@/lib/evidence/trials";
vi.mock("@/lib/evidence/pubmed", () => ({ fetchPapers: vi.fn() }));
vi.mock("@/lib/evidence/trials", () => ({ fetchTrial: vi.fn() }));
afterEach(() => { vi.clearAllMocks(); vi.restoreAllMocks(); });
describe("independent source retrieval failures", () => {
  it("keeps successful registry records when PubMed reaches the retrieval deadline", async () => {
    const deadline = new AbortController();
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(deadline.signal);
    vi.mocked(fetchPapers).mockImplementation((_ids, options) => new Promise((_resolve, reject) => options?.signal?.addEventListener("abort", () => reject(new DOMException("Timeout", "AbortError")))));
    vi.mocked(fetchTrial).mockResolvedValue({ nctId: "NCT01234567", title: "Synthetic", status: "RECRUITING", studyType: "INTERVENTIONAL", startDate: null, conditions: [], interventions: [], url: "https://clinicaltrials.gov/study/NCT01234567" });
    const result = refetchBriefSources(["pubmed:123", "trials:NCT01234567"], new AbortController().signal);
    deadline.abort(new DOMException("Deadline", "TimeoutError"));
    expect((await result).map((s) => s.id)).toEqual(["trials:NCT01234567"]);
    expect(fetchTrial).toHaveBeenCalledTimes(1);
  });
  it("does not turn user cancellation into a completed partial result", async () => {
    const abort = new AbortController(); abort.abort();
    await expect(refetchBriefSources(["pubmed:123"], abort.signal)).rejects.toThrow();
    expect(fetchPapers).not.toHaveBeenCalled();
  });
});
