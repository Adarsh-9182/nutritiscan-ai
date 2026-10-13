import { createHash } from "node:crypto";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AgentStudio from "./agent-studio";

const runId = "8d7983ed-d3d5-4c4c-8c94-14a1b65e97e1";
function completedRun() {
  const content = "# Protein brief\nReview the published nutrition source.\n";
  const at = new Date().toISOString();
  const events = [
    { type: "started", runId, at, plan: ["Read the library", "Draft a brief", "Wait for approval"] },
    { type: "step", runId, at, id: "library", label: "Health library", status: "done", detail: "1 source retrieved" },
    { type: "approval", runId, at, artifact: { filename: "research-brief-test.md", content, bytes: Buffer.byteLength(content), sha256: createHash("sha256").update(content).digest("hex"), sources: [{ id: "library:nutrition", title: "Nutrition", url: "https://medlineplus.gov/nutrition.html", kind: "reference", detail: "Nutrition reference" }], mode: "source-collection", expiresAt: new Date(Date.now() + 60000).toISOString() } },
  ];
  return new Response(events.map((event) => JSON.stringify(event)).join("\n") + "\n");
}
beforeEach(() => vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => completedRun())));

describe("Agent Studio", () => {
  it("creates and saves a reusable agent with selected permissions", async () => {
    render(<AgentStudio />);
    fireEvent.click(screen.getByRole("button", { name: "New" }));
    fireEvent.change(screen.getByLabelText("Agent name", { exact: true }), { target: { value: "My evidence agent" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /PubMed/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save agent on this device" }));
    expect(screen.getByRole("button", { name: /My evidence agent.*plugins/ })).toBeInTheDocument();
    const saved = JSON.parse(localStorage.getItem("ns-agent-definitions-v1")!);
    const agent = saved.find((item: { name: string }) => item.name === "My evidence agent");
    expect(agent.plugins).not.toContain("pubmed");
    expect(agent.plugins).toContain("artifact");
  });

  it("runs a task, shows its tool activity, and requires review before download", async () => {
    render(<AgentStudio />);
    fireEvent.change(screen.getByLabelText("Agent task"), { target: { value: "protein in vegetarian diets" } });
    fireEvent.click(screen.getByRole("button", { name: "Run agent" }));
    expect(await screen.findByRole("button", { name: "Approve & download" })).toBeInTheDocument();
    expect(screen.getByLabelText("Brief preview")).toHaveTextContent("Protein brief");
    expect(screen.getByRole("list", { name: "Agent steps" })).toHaveTextContent("1 source retrieved");
    expect(screen.queryByText(/browser download started/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reject export" }));
    expect(screen.queryByRole("button", { name: "Approve & download" })).not.toBeInTheDocument();
    expect(screen.getByText("Export rejected")).toBeInTheDocument();
  });

  it("stops an in-flight run and allows a new task", async () => {
    vi.mocked(fetch).mockImplementation((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Stopped", "AbortError")), { once: true });
    }));
    render(<AgentStudio />);
    fireEvent.change(screen.getByLabelText("Agent task"), { target: { value: "protein" } });
    fireEvent.click(screen.getByRole("button", { name: "Run agent" }));
    fireEvent.click(await screen.findByRole("button", { name: "Stop run" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Run agent" })).toBeEnabled());
    expect(screen.getByText("Stopped")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve & download" })).not.toBeInTheDocument();
  });
});
