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
      screen.getByRole("heading", { name: /How are you/ }),
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
    fireEvent.click(screen.getByRole("button", { name: "Enable private AI" }));
    fireEvent.click(screen.getByRole("button", { name: /Download & enable/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("WebGPU");
  });
});
