import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import ResearchWorkspace from "./research-workspace";
import { reply, streamReply } from "@/lib/research/test-fixtures";
import { researchBackup } from "@/lib/research/backup";
import { readResearch } from "@/lib/research/client";

const question = "Investigate metabolic aging in humans";
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => init?.method === "POST" ? streamReply() : Response.json({ configured: false, models: ["gemini-3.8-flash"] })));
});
async function ask(text = question) {
  await screen.findByLabelText("Research message");
  const previous = screen.queryAllByRole("region", { name: "Evidence findings" }).length;
  fireEvent.change(screen.getByLabelText("Research message"), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Send research message" }));
  await waitFor(() => expect(screen.getAllByRole("region", { name: "Evidence findings" })).toHaveLength(previous + 1));
}

describe("chat-first Research Workspace", () => {
  it("previews a backup before merging it, preserves local work and rejects invalid files", async () => {
    render(<ResearchWorkspace />); await ask();
    const original = readResearch().threads[0];
    const imported = { ...original, id: "another-project", title: "Synthetic imported project" };
    fireEvent.click(screen.getByRole("button", { name: "Show or hide research conversations" }));
    const file = new File(["fixture"], "research.json", { type: "application/json" });
    Object.defineProperty(file, "text", { value: async () => researchBackup([imported]) });
    fireEvent.change(screen.getByLabelText("Research backup file"), { target: { files: [file] } });
    expect(await screen.findByRole("region", { name: "Research backup preview" })).toHaveTextContent("Synthetic imported project");
    expect(readResearch().threads).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Import conversations" }));
    const restored = readResearch();
    expect(restored.threads).toHaveLength(2); expect(restored.threads[0]).toEqual(original);
    expect(restored.threads[1].importedAt).toBeDefined();
    const bad = new File(["fixture"], "bad.json", { type: "application/json" });
    Object.defineProperty(bad, "text", { value: async () => '{"format":"unknown"}' });
    fireEvent.change(screen.getByLabelText("Research backup file"), { target: { files: [bad] } });
    expect(await screen.findByRole("alert")).toHaveTextContent("not a supported");
    expect(readResearch().threads).toHaveLength(2);
  });

  it("renames a research project and persists its name after reload", async () => {
    const view = render(<ResearchWorkspace />); await ask();
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Research conversation name" }), { target: { value: "Synthetic replication project" } });
    fireEvent.click(screen.getByRole("button", { name: "Save name" }));
    expect(readResearch().threads[0].title).toBe("Synthetic replication project");
    view.unmount(); render(<ResearchWorkspace />);
    expect(await screen.findByText("Synthetic replication project")).toBeInTheDocument();
  });
  it("saves manual source decisions and notes, filters them, and restores them without changing the draft", async () => {
    const view = render(<ResearchWorkspace />); await ask();
    fireEvent.click(screen.getByText("Review sources"));
    const panel = screen.getByRole("region", { name: "Researcher source review" });
    expect(within(panel).getByText("Unreviewed · 1")).toBeVisible();
    fireEvent.click(within(panel).getByRole("button", { name: "Exclude" }));
    fireEvent.change(within(panel).getByRole("textbox", { name: "Review note: Synthetic cohort study" }), { target: { value: "Synthetic note: wrong population." } });
    fireEvent.click(within(panel).getByRole("button", { name: "Save note" }));
    expect(readResearch().threads[0].turns[0].sourceReviews?.[0]).toMatchObject({ decision: "exclude", note: "Synthetic note: wrong population." });
    expect(screen.getByRole("region", { name: "Evidence findings" })).toHaveTextContent(reply.answer!.findings[0].text);
    fireEvent.change(within(panel).getByRole("combobox", { name: "Filter source decisions" }), { target: { value: "include" } });
    expect(within(panel).getByText(/No records with this decision/)).toBeVisible();
    view.unmount(); render(<ResearchWorkspace />);
    fireEvent.click(await screen.findByText("Review sources"));
    expect(screen.getByRole("button", { name: "Exclude" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("textbox", { name: "Review note: Synthetic cohort study" })).toHaveValue("Synthetic note: wrong population.");
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(readResearch().threads[0].turns[0].sourceReviews).toEqual([]);
  });
  it("keeps review notes out of model context and binds decisions to their own question", async () => {
    render(<ResearchWorkspace />); await ask();
    fireEvent.click(screen.getByText("Review sources"));
    fireEvent.click(screen.getByRole("button", { name: "Include" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Review note: Synthetic cohort study" }), { target: { value: "local-review-marker-917" } });
    fireEvent.click(screen.getByRole("button", { name: "Save note" }));
    await ask("Compare with another synthetic population");
    const calls = vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === "POST");
    expect(calls[1][1]?.body).not.toContain("local-review-marker-917");
    const turns = readResearch().threads[0].turns;
    expect(turns[0].sourceReviews?.[0].decision).toBe("include");
    expect(turns[1].sourceReviews).toBeUndefined();
  });
  it("clears source decisions on a fresh retry even when source IDs are reused", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => init?.method === "POST" ? streamReply({ ...reply, answer: null, model: null, status: "sources-only" }) : Response.json({ configured: true })));
    render(<ResearchWorkspace />); await screen.findByLabelText("Research message");
    fireEvent.change(screen.getByLabelText("Research message"), { target: { value: question } });
    fireEvent.click(screen.getByRole("button", { name: "Send research message" }));
    fireEvent.click(await screen.findByText("Review sources"));
    fireEvent.click(screen.getByRole("button", { name: "Needs review" }));
    fireEvent.click(screen.getByRole("button", { name: "Retry research" }));
    expect(await screen.findByText("Review sources")).toBeInTheDocument();
    expect(readResearch().threads[0].turns[0].sourceReviews).toBeUndefined();
  });
  it("renders the health-chat style entry and sends a source-grounded research turn", async () => {
    render(<ResearchWorkspace />);
    expect(await screen.findByRole("heading", { name: /What should we investigate together/ })).toBeVisible();
    await ask();
    expect(screen.getByRole("region", { name: "Untested hypotheses" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Proposed study plan" })).toHaveTextContent("not executed");
    fireEvent.click(within(screen.getByRole("region", { name: "Evidence findings" })).getByRole("button", { name: /Inspect citation 1/ }));
    expect(screen.getByRole("dialog", { name: "Research source inspector" })).toHaveTextContent("An association was observed in this synthetic cohort.");
    expect(screen.getByRole("link", { name: "Open original source ↗" })).toHaveAttribute("href", "https://pubmed.ncbi.nlm.nih.gov/123/");
    fireEvent.click(screen.getByRole("button", { name: "Close source inspector" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("keeps research follow-ups in one conversation and excludes health data", async () => {
    localStorage.setItem("ns-health-profile", "private health fixture");
    render(<ResearchWorkspace />); await ask();
    fireEvent.click(screen.getByRole("button", { name: /Plan an independent test/ }));
    fireEvent.click(screen.getByRole("button", { name: "Send research message" }));
    await waitFor(() => expect(screen.getAllByRole("region", { name: "Evidence findings" })).toHaveLength(2));
    const calls = vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === "POST");
    const second = JSON.parse(calls[1][1]?.body as string);
    expect(second.mode).toBe("study-plan"); expect(second.query).toBe(""); expect(second.searchMode).toBe("auto");
    expect(second.history[0]).toEqual({ role: "user", content: question });
    expect(JSON.stringify(second)).not.toContain("private health fixture");
  });
  it("restores research history after refresh and deletes only the selected research thread", async () => {
    const view = render(<ResearchWorkspace />); await ask(); view.unmount();
    render(<ResearchWorkspace />);
    expect(await screen.findByRole("region", { name: "Evidence findings" })).toHaveTextContent("The synthetic study reports an association.");
    fireEvent.click(screen.getByRole("button", { name: "Show or hide research conversations" }));
    fireEvent.click(screen.getByRole("button", { name: `Delete research conversation: ${question}` }));
    expect(screen.queryByText("The synthetic study reports an association.")).not.toBeInTheDocument();
  });
  it("retains sources and accurately labels missing model output", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => init?.method === "POST" ? streamReply({ ...reply, answer: null, model: null, status: "sources-only", notice: "Sources collected. No AI answer was generated." }) : Response.json({ configured: false })));
    render(<ResearchWorkspace />); await screen.findByLabelText("Research message");
    fireEvent.change(screen.getByLabelText("Research message"), { target: { value: question } });
    fireEvent.click(screen.getByRole("button", { name: "Send research message" }));
    expect(await screen.findByText("Source collection")).toBeInTheDocument();
    expect(screen.getByText("Sources collected. No AI answer was generated.")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Evidence findings" })).not.toBeInTheDocument();
  });
  it("sends only enabled source permissions", async () => {
    render(<ResearchWorkspace />); await screen.findByLabelText("Research message");
    fireEvent.click(screen.getByText(/Research settings/)); fireEvent.click(screen.getByLabelText("PubMed"));
    await ask();
    const call = vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === "POST");
    expect(JSON.parse(call?.[1]?.body as string).sources).toEqual(["trials"]);
  });
  it("keeps a custom search override explicit across follow-ups", async () => {
    render(<ResearchWorkspace />); await screen.findByLabelText("Research message");
    fireEvent.click(screen.getByText(/Research settings/));
    fireEvent.change(screen.getByLabelText("Public search terms"), { target: { value: "cellular senescence humans" } });
    await ask();
    await ask("Focus on an independent cohort");
    const calls = vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === "POST");
    expect(JSON.parse(calls[1][1]?.body as string)).toMatchObject({ query: "cellular senescence humans", searchMode: "manual" });
  });
  it("shows evidence comparison, executed queries and actionable model failures", async () => {
    const result = { ...reply, answer: null, model: null, status: "sources-only" as const, searches: [{ source: "pubmed" as const, query: "metabolic aging", strategy: "planned" as const, status: "done" as const, count: 1 }], diagnostics: [{ stage: "review" as const, code: "timeout" as const, model: "gemini-3.6-flash" }] };
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => init?.method === "POST" ? streamReply(result) : Response.json({ configured: true })));
    render(<ResearchWorkspace />); await screen.findByLabelText("Research message");
    fireEvent.change(screen.getByLabelText("Research message"), { target: { value: question } });
    fireEvent.click(screen.getByRole("button", { name: "Send research message" }));
    fireEvent.click(await screen.findByText(/Evidence table · 1 sources/));
    expect(screen.getByRole("table", { name: "Research evidence comparison" })).toHaveTextContent("Observational Study");
    fireEvent.click(screen.getByText(/Search activity & run details/));
    expect(screen.getByText(/Source check: Time limit reached/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Retry research" })).toBeEnabled();
  });
  it("does not turn a broken stream into successful research", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => init?.method === "POST" ? new Response('{"type":"step","text":"Searching…"}\n') : Response.json({ configured: true })));
    render(<ResearchWorkspace />); await screen.findByLabelText("Research message");
    fireEvent.change(screen.getByLabelText("Research message"), { target: { value: question } });
    fireEvent.click(screen.getByRole("button", { name: "Send research message" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("before research completed");
    expect(screen.queryByText("Research draft")).not.toBeInTheDocument();
  });
  it("stops an active request and retains its question for retry", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method !== "POST") return Response.json({ configured: true });
      return new Promise<Response>((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError"))));
    }));
    render(<ResearchWorkspace />); await screen.findByLabelText("Research message");
    fireEvent.change(screen.getByLabelText("Research message"), { target: { value: question } });
    fireEvent.click(screen.getByRole("button", { name: "Send research message" }));
    fireEvent.click(await screen.findByRole("button", { name: "Stop research" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Research stopped");
    expect(screen.getByRole("button", { name: "Retry question" })).toBeEnabled();
    expect(screen.getAllByText(question).length).toBeGreaterThan(0);
  });
});
