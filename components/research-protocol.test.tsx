import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import ResearchWorkspace from "./research-workspace";
import { ResearchProtocol } from "./research-protocol";
import { createStudyProtocol, PROTOCOL_SECTIONS } from "@/lib/research/protocol";
import { RESEARCH_STORAGE, readResearch, type ResearchTurn } from "@/lib/research/client";
import { reply, source, streamReply } from "@/lib/research/test-fixtures";
import { parseStudyTransfer, serializeStudyTransfer } from "@/shared/study-plan";
import { syntheticStudyTransfer } from "@/shared/test-fixtures/study-plan.mjs";

const question = "Synthetic study question for protocol planning";
function turn(): ResearchTurn { return { id: "turn", request: { message: question, query: "synthetic public query", mode: "study-plan", sources: ["pubmed"], searchMode: "manual" }, phase: "done", reply, sourceReviews: [{ sourceId: source.id, decision: "include", note: "", updatedAt: reply.retrievedAt }] }; }
function seed(value = turn()) { localStorage.setItem(RESEARCH_STORAGE, JSON.stringify({ version: 1, activeId: "project", threads: [{ id: "project", title: "Synthetic study", query: "synthetic public query", updatedAt: 1, turns: [value] }] })); }
beforeEach(() => { vi.stubGlobal("fetch", vi.fn(async (url: string) => url === "/api/research/chat" ? streamReply() : Response.json({ configured: false, account: null, plans: [] }))); });
const saved = () => readResearch().threads[0].turns[0].protocol!;

describe("study planning workflow", () => {
  it("exports exactly this draft and its selected source snapshots for the Mac app", async () => {
    const onDownload = vi.fn(), protocol = createStudyProtocol(question, [source.id], reply);
    render(<ResearchProtocol turn={{ ...turn(), protocol }} disabled={false} imported={false} onCreate={vi.fn()} onEdit={vi.fn()} onDownload={onDownload} onNotice={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Export draft for Mac" }));
    const exported = parseStudyTransfer(onDownload.mock.calls[0][0]);
    expect(exported.protocol).toEqual(protocol); expect(exported.bibliography).toEqual([source]);
    expect(exported.origin).toBe("web");
  });
  it("imports a Mac draft as separate editable work without searching or sending it to a model", async () => {
    seed(); const original = readResearch().threads[0]; render(<ResearchWorkspace />);
    fireEvent.click(await screen.findByRole("button", { name: "Show or hide research conversations" }));
    const document = syntheticStudyTransfer(), file = new File(["fixture"], "study.json", { type: "application/json" });
    Object.defineProperty(file, "text", { value: async () => serializeStudyTransfer(document) });
    fireEvent.change(screen.getByLabelText("Mac study draft file"), { target: { files: [file] } });
    expect(await screen.findByRole("region", { name: "Study draft import preview" })).toHaveTextContent("Previous review marks will be reset");
    fireEvent.click(screen.getByRole("button", { name: "Open imported study draft" }));
    expect(await screen.findByLabelText("Protocol title")).toHaveValue(document.protocol.title);
    const saved = readResearch(); expect(saved.threads).toHaveLength(2); expect(saved.threads[0]).toEqual(original);
    expect(saved.activeId).toBe(saved.threads[1].id); expect(saved.threads[1].turns[0].protocol?.reviewedAt).toBeNull();
    fireEvent.change(screen.getByLabelText("Comparator"), { target: { value: "Edited after native transfer" } });
    expect(readResearch().threads[1].turns[0].protocol?.fields.comparator).toBe("Edited after native transfer");
    expect(vi.mocked(fetch).mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });
  it("creates from included sources without another model call, persists edits and restores them after reload", async () => {
    seed(); const view = render(<ResearchWorkspace />);
    fireEvent.click(await screen.findByRole("button", { name: "Create protocol draft" }));
    expect(await screen.findByLabelText("Research question")).toHaveValue(question);
    expect(screen.getByLabelText("Sample size rationale")).toHaveValue("");
    fireEvent.change(screen.getByLabelText("Protocol title"), { target: { value: "Synthetic investigator protocol" } });
    fireEvent.change(screen.getByLabelText("Population and setting"), { target: { value: "Synthetic consenting adult cohort" } });
    expect(saved().fields.population).toBe("Synthetic consenting adult cohort");
    expect(vi.mocked(fetch).mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
    view.unmount(); render(<ResearchWorkspace />);
    expect(await screen.findByLabelText("Protocol title")).toHaveValue("Synthetic investigator protocol");
    expect(screen.getByLabelText("Population and setting")).toHaveValue("Synthetic consenting adult cohort");
  });
  it("requires explicit source inclusion and keeps the original bibliography when relevance decisions change", async () => {
    seed({ ...turn(), sourceReviews: [] }); render(<ResearchWorkspace />);
    expect(await screen.findByRole("button", { name: "Create protocol draft" })).toBeDisabled();
    fireEvent.click(screen.getByText("Review sources"));
    fireEvent.click(screen.getByRole("button", { name: "Include" }));
    fireEvent.click(screen.getByRole("button", { name: "Create protocol draft" }));
    fireEvent.click(screen.getByRole("button", { name: "Exclude" }));
    expect(await screen.findByText(/Your Include decisions changed/)).toBeVisible();
    expect(saved().sourceIds).toEqual([source.id]);
    expect(screen.getByRole("button", { name: "Use current included sources" })).toBeDisabled();
  });
  it("marks only a complete draft personally reviewed and resets review on edits and source changes", async () => {
    const protocol = createStudyProtocol(question, [source.id], reply);
    seed({ ...turn(), protocol }); render(<ResearchWorkspace />);
    const review = await screen.findByRole("checkbox", { name: /I personally reviewed this working draft/ });
    expect(review).toBeDisabled();
    for (const section of PROTOCOL_SECTIONS) fireEvent.change(screen.getByLabelText(section.label), { target: { value: `Synthetic ${section.label}` } });
    expect(review).toBeEnabled(); fireEvent.click(review); expect(saved().reviewedAt).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Comparator"), { target: { value: "Updated synthetic comparator" } });
    expect(saved().reviewedAt).toBeNull(); fireEvent.click(review);
    fireEvent.click(screen.getByText("Review sources")); fireEvent.click(screen.getByRole("button", { name: "Exclude" }));
    expect(saved().reviewedAt).toBeNull(); expect(review).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Include" })); expect(saved().reviewedAt).toBeNull();
  });
  it("imports proposed methods only deliberately and never overwrites investigator edits", async () => {
    seed({ ...turn(), protocol: createStudyProtocol(question, [source.id], reply) }); render(<ResearchWorkspace />);
    fireEvent.click(await screen.findByText(/Bring in the research response/));
    const use = screen.getByRole("button", { name: "Use proposed steps as a starting point" });
    fireEvent.click(use);
    expect((screen.getByLabelText("Study design and data collection") as HTMLTextAreaElement).value).toContain("UNVALIDATED MODEL PROPOSAL");
    expect(saved().fields.methods).toContain(reply.answer!.plan[0]); expect(use).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Study design and data collection"), { target: { value: "Investigator-approved draft methods" } });
    expect(use).toBeDisabled(); expect(saved().fields.methods).toBe("Investigator-approved draft methods");
  });
  it("preserves a protocol when repeating a sources-only search and keeps its content out of model history", async () => {
    const protocol = createStudyProtocol(question, [source.id], reply);
    protocol.fields.ethics = "private-local-protocol-marker-917";
    seed({ ...turn(), reply: { ...reply, answer: null, model: null, status: "sources-only" }, protocol }); render(<ResearchWorkspace />);
    fireEvent.click(await screen.findByRole("button", { name: "Repeat search, keep protocol" }));
    await waitFor(() => expect(readResearch().threads[0].turns).toHaveLength(2));
    await waitFor(() => expect(readResearch().threads[0].turns[1].phase).toBe("done"));
    expect(saved()).toEqual(protocol);
    const posted = vi.mocked(fetch).mock.calls.find(([url]) => url === "/api/research/chat")![1]!.body as string;
    expect(posted).not.toContain("private-local-protocol-marker-917");
    expect(JSON.parse(posted)).toMatchObject({ mode: "study-plan", query: "synthetic public query", searchMode: "manual", sources: ["pubmed"] });
  });
  it("exports an incomplete/imported draft with sources, warns on blocked printing and never claims approval", async () => {
    const onDownload = vi.fn(), onNotice = vi.fn();
    render(<ResearchProtocol turn={{ ...turn(), protocol: createStudyProtocol(question, [source.id], reply) }} disabled={false} imported={true} onCreate={vi.fn()} onEdit={vi.fn()} onDownload={onDownload} onNotice={onNotice} />);
    const region = screen.getByRole("region", { name: "Study protocol workspace" });
    fireEvent.click(within(region).getByRole("button", { name: "Preview protocol" }));
    expect(screen.getByRole("region", { name: "Protocol preview" })).toHaveTextContent("NOT PROVIDED");
    fireEvent.click(screen.getByRole("button", { name: "Export protocol TXT" }));
    expect(onDownload.mock.calls[0][0]).toContain(source.url);
    expect(onDownload.mock.calls[0][0]).toContain("not been revalidated");
    expect(onDownload.mock.calls[0][0]).toContain("Review status: Review required");
    vi.spyOn(window, "open").mockReturnValue(null);
    fireEvent.click(screen.getByRole("button", { name: "Print protocol / Save PDF" }));
    expect(onNotice).toHaveBeenCalledWith(expect.stringContaining("blocked"));
  });
  it("retains edits in the tab and keeps export accessible if device storage fails", async () => {
    seed(); render(<ResearchWorkspace />);
    const button = await screen.findByRole("button", { name: "Create protocol draft" });
    const write = vi.spyOn(localStorage, "setItem").mockImplementation(() => { throw new Error("quota"); });
    try {
      fireEvent.click(button);
      expect(await screen.findByText(/could not be saved on this device/)).toBeVisible();
      fireEvent.change(screen.getByLabelText("Research question"), { target: { value: "Preserve this unsaved investigator question" } });
      fireEvent.click(screen.getByRole("button", { name: "Preview protocol" }));
      expect(screen.getByRole("region", { name: "Protocol preview" })).toHaveTextContent("Preserve this unsaved investigator question");
      expect(screen.getByRole("button", { name: "Export protocol TXT" })).toBeEnabled();
    } finally { write.mockRestore(); }
  });
});
