import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ResearchWorkspace from "./research-workspace";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
    question: "Does example treatment help?",
    retrievedAt: "2026-10-05T10:00:00.000Z",
    sources: {
      pubmed: [{ pmid: "123", title: "Example paper", abstract: "A study abstract.", journal: "Example Journal", year: 2025, doi: null, url: "https://pubmed.ncbi.nlm.nih.gov/123/", publicationTypes: ["Clinical Trial"] }],
      clinicalTrials: [{ nctId: "NCT01234567", title: "Example registry study", status: "RECRUITING", studyType: "INTERVENTIONAL", startDate: "2025-01", conditions: ["Example condition"], interventions: ["Example treatment"], url: "https://clinicaltrials.gov/study/NCT01234567" }],
    },
    limitations: ["Search is incomplete.", "Rank is not quality.", "Abstracts may omit details."],
  }), { status: 200, headers: { "content-type": "application/json" } })));
});

describe("ResearchWorkspace", () => {
  it("submits a focused question and renders source-linked evidence", async () => {
    render(<ResearchWorkspace />);
    fireEvent.change(screen.getByLabelText("Research question"), { target: { value: "Does example treatment help?" } });
    fireEvent.click(screen.getByRole("button", { name: "Search sources" }));

    expect(await screen.findByRole("heading", { name: /Example paper/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Example registry study/ })).toBeInTheDocument();
    expect(screen.getByText(/not a synthesized conclusion/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Example paper/ })).toHaveAttribute("href", "https://pubmed.ncbi.nlm.nih.gov/123/");
    expect(fetch).toHaveBeenCalledWith("/api/research", expect.objectContaining({ method: "POST" }));
  });

  it("shows a safe error when the search API is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "Search unavailable" }), { status: 503 })));
    render(<ResearchWorkspace />);
    fireEvent.change(screen.getByLabelText("Research question"), { target: { value: "A valid research question" } });
    fireEvent.click(screen.getByRole("button", { name: "Search sources" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Search unavailable"));
  });
});
