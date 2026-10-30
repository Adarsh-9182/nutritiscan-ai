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
  fireEvent.change(screen.getByLabelText("Research message"), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Send research message" }));
  await screen.findByText("The synthetic study reports an association.");
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
    await waitFor(() => expect(screen.getAllByText("The synthetic study reports an association.")).toHaveLength(2));
    const calls = vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === "POST");
    const second = JSON.parse(calls[1][1]?.body as string);
    expect(second.mode).toBe("study-plan"); expect(second.query).toBe(question);
    expect(second.history[0]).toEqual({ role: "user", content: question });
    expect(JSON.stringify(second)).not.toContain("private health fixture");
  });
  it("restores research history after refresh and deletes only the selected research thread", async () => {
    const view = render(<ResearchWorkspace />); await ask(); view.unmount();
    render(<ResearchWorkspace />);
    expect(await screen.findByText("The synthetic study reports an association.")).toBeInTheDocument();
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
