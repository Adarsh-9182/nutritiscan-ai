import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import ResearchWorkspace from "./research-workspace";
import { emptyBriefRow, type EvidenceBrief } from "@/lib/research/brief";
import { RESEARCH_STORAGE, readResearch, type ResearchTurn } from "@/lib/research/client";
import { source, reply } from "@/lib/research/test-fixtures";

const question = "Synthetic included-source research question";
const brief: EvidenceBrief = { id: "brief-one", question, selectedIds: [source.id], missingIds: [], sources: [source], rows: [emptyBriefRow(source.id)], createdAt: reply.retrievedAt, models: [], answer: null, issues: ["model:not-configured"], title: "Synthetic evidence brief", notes: "", reviewedAt: null };
function setup(briefs: EvidenceBrief[] = []) {
  const turn: ResearchTurn = { id: "turn", request: { message: question, query: "", mode: "evidence", sources: ["pubmed"] }, phase: "done", reply, sourceReviews: [{ sourceId: source.id, decision: "include", note: "local-review-secret", updatedAt: reply.retrievedAt }], briefs };
  localStorage.setItem(RESEARCH_STORAGE, JSON.stringify({ version: 1, activeId: "project", threads: [{ id: "project", title: "Synthetic project", query: "", updatedAt: 1, turns: [turn] }] }));
}
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => url === "/api/research/brief" ? Response.json(brief) : Response.json({ configured: false, account: null, plans: [] })));
});

describe("evidence brief workflow", () => {
  it("generates from included IDs without sending review notes or saved source text", async () => {
    setup(); render(<ResearchWorkspace />);
    fireEvent.click(await screen.findByRole("button", { name: "Build evidence brief" }));
    expect(await screen.findByLabelText("Evidence brief title")).toHaveValue(brief.title);
    const call = vi.mocked(fetch).mock.calls.find(([url]) => url === "/api/research/brief")!;
    expect(JSON.parse(call[1]!.body as string)).toEqual({ question, sourceIds: [source.id] });
    expect(call[1]!.body).not.toContain("local-review-secret"); expect(call[1]!.body).not.toContain(source.detail);
    expect(readResearch().threads[0].turns[0].briefs?.[0]).toEqual(brief);
  });
  it("saves interpretation and review marks across reload, and resets the mark on edits", async () => {
    setup([brief]); const view = render(<ResearchWorkspace />);
    fireEvent.change(await screen.findByLabelText("Researcher interpretation"), { target: { value: "Synthetic confounding concern" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /I have reviewed this version/ }));
    expect(readResearch().threads[0].turns[0].briefs?.[0].reviewedAt).toBeTruthy();
    view.unmount(); render(<ResearchWorkspace />);
    expect(await screen.findByLabelText("Researcher interpretation")).toHaveValue("Synthetic confounding concern");
    fireEvent.change(screen.getByLabelText("Researcher interpretation"), { target: { value: "Updated interpretation" } });
    expect(readResearch().threads[0].turns[0].briefs?.[0].reviewedAt).toBeNull();
  });
  it("keeps the original selection after relevance decisions change", async () => {
    setup([brief]); render(<ResearchWorkspace />);
    fireEvent.click(await screen.findByText("Review sources"));
    fireEvent.click(screen.getByRole("button", { name: "Exclude" }));
    expect(await screen.findByText(/Your included sources have changed/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Build new version" })).toBeDisabled();
    expect(readResearch().threads[0].turns[0].briefs?.[0]).toEqual(brief);
  });
  it("cancels generation without deleting the previous brief or interpretation", async () => {
    setup([{ ...brief, notes: "Preserve this work" }]);
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url !== "/api/research/brief") return Response.json({ configured: false, plans: [] });
      return new Promise<Response>((_resolve, reject) => init!.signal!.addEventListener("abort", () => reject(new DOMException("Stopped", "AbortError")), { once: true }));
    }));
    render(<ResearchWorkspace />);
    fireEvent.click(await screen.findByRole("button", { name: "Build new version" }));
    fireEvent.click(screen.getByRole("button", { name: "Stop research" }));
    expect(await screen.findByText(/Brief generation stopped/)).toBeVisible();
    expect(readResearch().threads[0].turns[0].briefs?.[0].notes).toBe("Preserve this work");
  });
  it("retains prior work on upstream errors or a mismatched result", async () => {
    setup([brief]);
    vi.stubGlobal("fetch", vi.fn(async (url: string) => url === "/api/research/brief" ? Response.json({ ...brief, question: "A different research question" }) : Response.json({ configured: false, plans: [] })));
    render(<ResearchWorkspace />); fireEvent.click(await screen.findByRole("button", { name: "Build new version" }));
    expect(await screen.findByText(/Brief selection did not match/)).toBeVisible();
    expect(readResearch().threads[0].turns[0].briefs).toHaveLength(1);
  });
  it("limits versions and permits an explicit removal without losing the other version", async () => {
    setup([brief, { ...brief, id: "brief-two", title: "Second version", notes: "Keep second notes" }]);
    render(<ResearchWorkspace />);
    const build = await screen.findByRole("button", { name: "Build new version" }); expect(build).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Evidence brief version"), { target: { value: brief.id } });
    fireEvent.click(screen.getByRole("button", { name: "Remove this version" }));
    await waitFor(() => expect(build).toBeEnabled());
    expect(screen.getByLabelText("Researcher interpretation")).toHaveValue("Keep second notes");
    expect(readResearch().threads[0].turns[0].briefs?.map((b) => b.id)).toEqual(["brief-two"]);
  });
  it("prints a safely escaped brief and reports a blocked print window", async () => {
    setup([{ ...brief, notes: "<script>alert(1)</script>" }]); render(<ResearchWorkspace />);
    vi.spyOn(window, "open").mockReturnValue(null);
    fireEvent.click(await screen.findByRole("button", { name: "Print / Save PDF" }));
    expect(await screen.findByText(/Allow this site's print window/)).toBeVisible();
    expect(within(screen.getByRole("region", { name: "Included-source evidence brief" })).getByLabelText("Researcher interpretation")).toHaveValue("<script>alert(1)</script>");
  });
});
