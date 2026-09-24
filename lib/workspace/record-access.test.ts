import { describe, expect, it } from "vitest";
import { DEMO } from "./demo";
import { recordAnswer } from "./record-tools";
import { runHealthAgent } from "./health-agent";
import { ReportSchema } from "./types";

describe("report access boundary", () => {
  it.each([
    "Summarise my latest report",
    "Compare my reports",
    "Prepare questions for my doctor",
  ])("excludes a revoked report from %s", async (question) => {
    const workspace = structuredClone(DEMO);
    workspace.reports[0].assistantAccess = false;
    workspace.reports[0].title = "Excluded private report";
    workspace.reports[0].observations[0].name = "Excluded private marker";
    const allowedOnly = { ...workspace, reports: workspace.reports.slice(1) };
    expect(recordAnswer(question, workspace)).toEqual(
      recordAnswer(question, allowedOnly),
    );
    expect((await runHealthAgent(question, workspace)).text).not.toContain(
      "Excluded private",
    );
    expect(workspace.reports).toHaveLength(2);
  });
  it("handles all reports disabled without falling back to the latest saved report", () => {
    const workspace = {
      ...DEMO,
      reports: DEMO.reports.map((r) => ({ ...r, assistantAccess: false })),
    };
    expect(recordAnswer("Summarise my report", workspace)?.text).toContain(
      "No confirmed reports are available",
    );
    expect(recordAnswer("Compare my reports", workspace)).toEqual(
      recordAnswer("Compare my reports", { ...DEMO, reports: [] }),
    );
  });
  it("accepts legacy records and validates provenance metadata", () => {
    expect(ReportSchema.parse(DEMO.reports[0]).assistantAccess).toBeUndefined();
    expect(
      ReportSchema.safeParse({
        ...DEMO.reports[0],
        source: {
          method: "pdf",
          label: "report.pdf",
          fingerprint: "not-a-hash",
        },
      }).success,
    ).toBe(false);
    expect(
      ReportSchema.safeParse({
        ...DEMO.reports[0],
        source: { method: "hospital-verified", label: "report.pdf" },
      }).success,
    ).toBe(false);
  });
});
