import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ResearchCloud } from "./research-cloud";
import { useAccount } from "@/lib/account/client";
import { parseResearchBackup, researchBackup } from "@/lib/research/backup";
import { request, reply } from "@/lib/research/test-fixtures";
import type { ResearchThread } from "@/lib/research/client";
vi.mock("@/lib/account/client", () => ({ useAccount: vi.fn() }));
const owner = "11111111-1111-4111-8111-111111111111", revision = "22222222-2222-4222-8222-222222222222";
const thread: ResearchThread = { id: "project", title: "Synthetic research", query: "", updatedAt: 1, turns: [{ id: "turn", phase: "done", request: { message: request.message, query: request.query, mode: request.mode, sources: request.sources }, reply }] };
const backup = parseResearchBackup(researchBackup([thread]));
const metadata = { accountId: owner, revision, updatedAt: "2026-11-02T10:00:00Z" };
beforeEach(() => {
  vi.mocked(useAccount).mockReturnValue({ data: { configured: true, account: { id: owner, expiresAt: 9999999999 }, plan: "free", subscription: null, plans: [], checkoutAvailable: false, premiumModelsEnabled: false, billingAvailable: true }, error: "", refresh: vi.fn(), setData: vi.fn() });
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ...metadata, backup: null })));
});
function show(onRestore = vi.fn()) {
  render(<ResearchCloud threads={[thread]} disabled={false} onRestore={onRestore} />);
  fireEvent.click(screen.getByText("Account research backup")); return onRestore;
}
describe("explicit account research snapshots", () => {
  it("requires checking the account and explicit consent before uploading device research", async () => {
    show(); expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Check account backup" }));
    const save = await screen.findByRole("button", { name: "Save device research to account" });
    expect(save).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(save);
    expect(await screen.findByText("Research snapshot saved to this account.")).toBeVisible();
    const body = JSON.parse(vi.mocked(fetch).mock.calls[1][1]!.body as string);
    expect(body).toMatchObject({ accountId: owner, revision, consent: true, backup: { threads: [{ title: "Synthetic research" }] } });
    expect(screen.getByRole("checkbox")).not.toBeChecked();
  });
  it("previews account content and restores only after a separate user action", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ...metadata, backup })));
    const restore = show(); fireEvent.click(screen.getByRole("button", { name: "Check account backup" }));
    expect(await screen.findByText("Synthetic research")).toBeVisible(); expect(restore).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Restore account conversations" }));
    expect(restore).toHaveBeenCalledWith(backup);
  });
  it("clears stale state after a conflict and never automatically retries an overwrite", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url, options) => options?.method === "PUT" ? Response.json({ error: "Account backup changed." }, { status: 409 }) : Response.json({ ...metadata, backup })));
    show(); fireEvent.click(screen.getByRole("button", { name: "Check account backup" }));
    await screen.findByText("Synthetic research"); fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Save device research to account" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Account backup changed.");
    expect(screen.queryByRole("button", { name: "Save device research to account" })).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("requires confirmation to delete a cloud snapshot and leaves device data alone", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url, options) => Response.json({ ...metadata, backup: options?.method === "DELETE" ? null : backup })));
    const restore = show(); fireEvent.click(screen.getByRole("button", { name: "Check account backup" }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete account backup" }));
    expect(fetch).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Confirm delete account backup" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Account backup deleted"));
    expect(restore).not.toHaveBeenCalled();
  });
});
