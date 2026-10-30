import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import ResearchWorkspace from "./research-workspace";
import { reply, streamReply } from "@/lib/research/test-fixtures";

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
    expect(screen.getByText(question)).toBeInTheDocument();
  });
});
