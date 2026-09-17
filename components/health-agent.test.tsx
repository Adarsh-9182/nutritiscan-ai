import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeAll } from "vitest";
import HealthAgent from "./health-agent";
import { DEMO } from "@/lib/workspace/demo";
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
  Element.prototype.scrollIntoView = vi.fn();
});
const props = () => ({
  workspace: DEMO,
  demo: true,
  seed: null,
  addReport: vi.fn(),
  navigate: vi.fn(),
  saveTask: vi.fn().mockResolvedValue(undefined),
});
describe("companion interactions", () => {
  it("offers broad health topics on the home screen", () => {
    render(<HealthAgent {...props()} />);
    expect(
      screen.getByRole("heading", { name: /What’s on your mind, Aarav/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Medicines" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Food & nutrition" }),
    ).toBeInTheDocument();
  });
  it("requires an edited, confirmed follow-up before saving and prevents repeat saves", async () => {
    const p = props();
    render(<HealthAgent {...p} />);
    fireEvent.click(screen.getByRole("button", { name: "Sleep & energy" }));
    await screen.findByRole("button", { name: /Draft a follow-up/ });
    expect(p.saveTask).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Draft a follow-up/ }));
    fireEvent.change(screen.getByLabelText("What would you like to do?"), {
      target: { value: "Ask about snoring" },
    });
    fireEvent.change(screen.getByLabelText("Your chosen date"), {
      target: { value: "2026-10-01" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm & save" }));
    await waitFor(() =>
      expect(p.saveTask).toHaveBeenCalledExactlyOnceWith({
        title: "Ask about snoring",
        date: "2026-10-01",
        done: false,
      }),
    );
    expect(
      await screen.findByRole("button", { name: /Follow-up saved/ }),
    ).toBeDisabled();
  });
  it("shows a useful fallback when WebGPU is absent", async () => {
    render(<HealthAgent {...props()} />);
    fireEvent.click(screen.getByRole("button", { name: "Choose model" }));
    fireEvent.click(screen.getByRole("button", { name: /Enable private AI/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("WebGPU");
  });
  it("saves each exchange without drafts and continues a saved chat", async () => {
    const persist = vi.fn().mockResolvedValue({
      id: "chat-1",
      version: 1,
      title: "Had 2 roti",
      createdAt: "2026-09-17T00:00:00Z",
    });
    const p = { ...props(), persist, saveLog: vi.fn() };
    const { unmount } = render(<HealthAgent {...p} />);
    fireEvent.change(screen.getByLabelText("Message your health assistant"), {
      target: { value: "had 2 roti and dal for lunch" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await screen.findByRole("button", { name: /Confirm and add to log/ });
    await waitFor(() => expect(persist).toHaveBeenCalledTimes(1));
    const [meta, stored] = persist.mock.calls[0];
    expect(meta).toBeNull();
    expect(stored.map((m: { role: string }) => m.role)).toEqual([
      "user",
      "assistant",
    ]);
    expect(JSON.stringify(stored)).not.toContain("draftLog");
    unmount();

    render(
      <HealthAgent
        {...p}
        conversation={{
          id: "chat-1",
          version: 1,
          title: "Had 2 roti",
          createdAt: "2026-09-17T00:00:00Z",
          messages: stored,
        }}
      />,
    );
    expect(
      screen.getByText("had 2 roti and dal for lunch"),
    ).toBeInTheDocument();
    // A reopened chat does not offer to save the old draft again.
    expect(
      screen.queryByRole("button", { name: /Confirm and add to log/ }),
    ).toBeNull();
    fireEvent.change(screen.getByLabelText("Message your health assistant"), {
      target: { value: "What should I do next?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await waitFor(() => expect(persist).toHaveBeenCalledTimes(2));
    expect(persist.mock.calls[1][0]).toMatchObject({
      id: "chat-1",
      version: 1,
    });
    expect(persist.mock.calls[1][1]).toHaveLength(4);
  });
  it("streams an AI answer for open questions and renders it as text", async () => {
    const encoder = new TextEncoder();
    const lines = [
      { t: "delta", v: "## Kidney stones\n" },
      { t: "delta", v: "- Drink **water**\n" },
      { t: "done" },
    ];
    const fetchMock = vi.fn<
      (url: string, init?: RequestInit) => Promise<Response>
    >((url) =>
      Promise.resolve(
        url.includes("status")
          ? new Response(JSON.stringify({ model: true }))
          : new Response(
              new ReadableStream({
                start(c) {
                  for (const l of lines)
                    c.enqueue(encoder.encode(`${JSON.stringify(l)}\n`));
                  c.close();
                },
              }),
            ),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    try {
      const persist = vi.fn().mockResolvedValue({
        id: "c",
        version: 1,
        title: "t",
        createdAt: "2026-09-17T00:00:00Z",
      });
      render(<HealthAgent {...props()} persist={persist} />);
      await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith(
          "/api/workspace/status",
          expect.anything(),
        ),
      );
      await new Promise((r) => setTimeout(r, 0));
      fireEvent.change(screen.getByLabelText("Message your health assistant"), {
        target: { value: "What are kidney stones?" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Send message" }));
      expect(
        await screen.findByRole("heading", { name: "Kidney stones" }),
      ).toBeInTheDocument();
      expect(screen.getByText("water").tagName).toBe("STRONG");
      expect(screen.getByText("NutritiScan AI")).toBeInTheDocument();
      await waitFor(() => expect(persist).toHaveBeenCalled());
      const stored = persist.mock.calls[0][1];
      expect(stored[1]).toMatchObject({ role: "assistant", mode: "ai" });
      const body = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
      expect(body.messages.at(-1)).toEqual({
        role: "user",
        text: "What are kidney stones?",
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
