import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import RecordSources from "./record-sources";
import { DEMO } from "@/lib/workspace/demo";

describe("source controls", () => {
  it("labels unknown origins honestly and routes a report-specific access change", () => {
    const changeAccess = vi.fn();
    render(
      <RecordSources
        reports={DEMO.reports}
        pending={false}
        changeAccess={changeAccess}
        addReport={vi.fn()}
        openReport={vi.fn()}
      />,
    );
    expect(screen.getAllByText("Source details not recorded")).toHaveLength(2);
    fireEvent.click(
      screen.getByRole("switch", {
        name: `Use ${DEMO.reports[0].title} in assistant`,
      }),
    );
    expect(changeAccess).toHaveBeenCalledExactlyOnceWith(
      DEMO.reports[0],
      false,
    );
  });
  it("keeps unavailable records visible and disables toggles during a save", () => {
    render(
      <RecordSources
        reports={[
          {
            ...DEMO.reports[0],
            assistantAccess: false,
            source: {
              method: "pdf",
              label: "my-file.pdf",
              fingerprint: "a".repeat(64),
            },
          },
        ]}
        pending={true}
        changeAccess={vi.fn()}
        addReport={vi.fn()}
        openReport={vi.fn()}
      />,
    );
    expect(screen.getByRole("switch")).not.toBeChecked();
    expect(screen.getByRole("switch")).toBeDisabled();
    expect(screen.getByText(/PDF import · my-file.pdf/)).toBeInTheDocument();
    expect(screen.getByText(/0 of 1 reports/)).toBeInTheDocument();
  });
});
