import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HealthTrends, VisitPreparation } from "./health-story";
import { DEMO } from "@/lib/workspace/demo";

describe("health story journeys", () => {
  it("changes the selected marker and opens the original source report", () => {
    const openReport = vi.fn();
    render(<HealthTrends workspace={DEMO} openReport={openReport} addReport={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Vitamin B12/ }));
    expect(screen.getByText("+27 pg/mL")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Summer health check/ }));
    expect(openReport).toHaveBeenCalledWith("demo-june");
  });
  it("downloads exactly the selected questions and typed notes", () => {
    const download = vi.fn();
    render(<VisitPreparation workspace={DEMO} download={download} demo />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "I want to discuss my sleep." } });
    fireEvent.click(screen.getByRole("checkbox", { name: /What does my Vitamin D result mean/ }));
    fireEvent.click(screen.getByRole("button", { name: "Download visit brief" }));
    const text = download.mock.calls[0][1];
    expect(text).toContain("I want to discuss my sleep.");
    expect(text).not.toContain("What does my Vitamin D result mean");
    expect(text).toContain("Vitamin D: 24");
    expect(text).toContain("What follow-up do you recommend");
  });
});
