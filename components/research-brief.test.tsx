import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ResearchBrief from "./research-brief";
import type { AgentArtifact } from "@/lib/agent-runtime/contracts";

const artifact: AgentArtifact = {
  filename: "brief.md", content: "Exact export", sha256: "a".repeat(64), bytes: 12,
  expiresAt: new Date().toISOString(), mode: "model-assisted",
  sources: [
    { id: "pubmed:123", kind: "paper", title: "Sleep paper", url: "https://pubmed.ncbi.nlm.nih.gov/123/", detail: "Sleep findings", metadata: { year: 2024, publicationTypes: ["Review"], hasAbstract: false } },
    { id: "library:nutrition", kind: "reference", title: "Nutrition", url: "https://medlineplus.gov/nutrition.html", detail: "Food needs vary" },
  ],
  summary: { points: [{ text: "Food needs vary", sourceIds: ["library:nutrition"] }], gaps: [] },
  searches: [
    { plugin: "pubmed", query: "sleep diabetes", status: "done", returned: 1, retry: false },
    { plugin: "trials", query: "sleep diabetes", status: "empty", returned: 0, retry: false },
    { plugin: "trials", query: "sleep diabetes", status: "failed", returned: 0, retry: true },
  ],
};

describe("research evidence explorer", () => {
  it("shows retrieval gaps and actual metadata without assigning an evidence score", () => {
    render(<ResearchBrief artifact={artifact} question="How does sleep relate to health?" />);
    expect(screen.getByText("Partial source coverage")).toBeInTheDocument();
    expect(screen.getByText(/0 of 1 papers have an abstract/)).toBeInTheDocument();
    expect(screen.getByText(/2024 · Review · No abstract returned/)).toBeInTheDocument();
    expect(screen.getByLabelText("Search audit")).toHaveTextContent("Read failed");
    expect(screen.getByLabelText("Search audit")).toHaveTextContent("sleep diabetes");
  });
  it("filters evidence while preserving citation numbers and the export", () => {
    render(<ResearchBrief artifact={artifact} question="Food needs" />);
    const collection = screen.getByLabelText("Collected sources");
    fireEvent.change(screen.getByLabelText("Show sources"), { target: { value: "cited" } });
    expect(within(collection).queryByRole("link", { name: /Sleep paper/ })).not.toBeInTheDocument();
    expect(within(collection).getByText(/\[2\] reference/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Citation 2: Nutrition" })).toHaveAttribute("href", "https://medlineplus.gov/nutrition.html");
    fireEvent.change(screen.getByLabelText("Find in sources"), { target: { value: "unmatched" } });
    expect(screen.getByText(/No sources match these filters/)).toBeInTheDocument();
    expect(artifact.content).toBe("Exact export");
  });
  it("does not report a coverage gap when a retry succeeded", () => {
    render(<ResearchBrief artifact={{ ...artifact, searches: [...artifact.searches!, { plugin: "trials", query: "sleep diabetes", status: "done", returned: 1, retry: true }] }} question="Sleep" />);
    expect(screen.queryByText("Partial source coverage")).not.toBeInTheDocument();
  });
});
