import { describe, expect, it } from "vitest";
import { extractPendingTests, SYNTHETIC_DISCHARGE_NOTE, SYNTHETIC_LAB_RESULT } from "./extract";
import { applyWorkflowEvent, INITIAL_CASE, workflowStatus } from "./workflow";

const at = "2026-09-29T10:00:00.000Z";
const candidate = extractPendingTests(SYNTHETIC_DISCHARGE_NOTE)[0];
const confirmed = applyWorkflowEvent(INITIAL_CASE, {
  type: "confirm-source", source: candidate, testName: candidate.testName, reviewedBy: "Anika, discharge coordinator",
}, at);

describe("pending-result workflow", () => {
  it("requires a reviewed source and owner before a result can move to clinical review", () => {
    expect(workflowStatus(INITIAL_CASE)).toBe("needs-source-review");
    expect(() => applyWorkflowEvent(INITIAL_CASE, { type: "assign", owner: "Dr Meera Shah", deadline: "2026-10-01" }, at)).toThrow(/Review the document source/);
    expect(workflowStatus(confirmed)).toBe("needs-owner");
    expect(() => applyWorkflowEvent(INITIAL_CASE, { type: "result-arrived", testName: SYNTHETIC_LAB_RESULT.testName }, at)).toThrow(/Assign an owner/);
    expect(() => applyWorkflowEvent(confirmed, { type: "assign", owner: "Dr Meera Shah", deadline: "2026-99-99" }, at)).toThrow(/review deadline/);

    const assigned = applyWorkflowEvent(confirmed, { type: "assign", owner: "Dr Meera Shah", deadline: "2026-10-01" }, at);
    expect(workflowStatus(assigned)).toBe("awaiting-result");
    expect(() => applyWorkflowEvent(assigned, { type: "result-arrived", testName: "Different test" }, at)).toThrow(/does not match/);
    expect(workflowStatus(applyWorkflowEvent(assigned, { type: "result-arrived", testName: SYNTHETIC_LAB_RESULT.testName }, at))).toBe("needs-review");
  });

  it("preserves the original extraction when a reviewer corrects the test name", () => {
    const corrected = applyWorkflowEvent(INITIAL_CASE, {
      type: "confirm-source", source: candidate, testName: "Corrected test", reviewedBy: "Anika",
    }, at);
    expect(corrected.source?.extractedTestName).toBe("Urine culture");
    expect(corrected.source?.testName).toBe("Corrected test");
    expect(corrected.history[0].description).toContain("corrected Urine culture to Corrected test");
    const assigned = applyWorkflowEvent(corrected, { type: "assign", owner: "Dr Meera Shah", deadline: "2026-10-01" }, at);
    expect(() => applyWorkflowEvent(assigned, { type: "result-arrived", testName: "Urine culture" }, at)).toThrow(/does not match/);
  });

  it("does not close a patient-contact case until review, message approval and delivery are recorded", () => {
    const assigned = applyWorkflowEvent(confirmed, { type: "assign", owner: "Dr Meera Shah", deadline: "2026-10-01" }, at);
    const arrived = applyWorkflowEvent(assigned, { type: "result-arrived", testName: SYNTHETIC_LAB_RESULT.testName }, at);
    expect(() => applyWorkflowEvent(arrived, { type: "record-delivery" }, at)).toThrow(/Approve the patient message/);
    expect(() => applyWorkflowEvent(arrived, {
      type: "review", clinician: "Dr Arun Rao", decision: "contact-patient", note: "Reviewed.",
    }, at)).toThrow(/assigned clinician/);

    const reviewed = applyWorkflowEvent(arrived, {
      type: "review", clinician: "Dr Meera Shah", decision: "contact-patient", note: "Contact required in this fictional case.",
    }, at);
    expect(workflowStatus(reviewed)).toBe("needs-message");
    const approved = applyWorkflowEvent(reviewed, { type: "approve-message", approvedBy: "Dr Meera Shah", message: "Please contact the care team." }, at);
    expect(workflowStatus(approved)).toBe("needs-delivery");
    const closed = applyWorkflowEvent(approved, { type: "record-delivery" }, at);
    expect(workflowStatus(closed)).toBe("closed");
    expect(closed.history).toHaveLength(6);
    expect(() => applyWorkflowEvent(closed, { type: "record-delivery" }, at)).toThrow(/already closed/);
  });

  it("allows a documented no-contact decision to close without inventing a patient message", () => {
    const assigned = applyWorkflowEvent(confirmed, { type: "assign", owner: "Dr Arun Rao", deadline: "2026-10-01" }, at);
    const arrived = applyWorkflowEvent(assigned, { type: "result-arrived", testName: SYNTHETIC_LAB_RESULT.testName }, at);
    expect(() => applyWorkflowEvent(arrived, {
      type: "review", clinician: "Dr Arun Rao", decision: "no-contact-needed", note: "   ",
    }, at)).toThrow(/decision note/);

    const closed = applyWorkflowEvent(arrived, {
      type: "review", clinician: "Dr Arun Rao", decision: "no-contact-needed", note: "No further action in this fictional case.",
    }, at);
    expect(workflowStatus(closed)).toBe("closed");
    expect(closed.approvedMessage).toBeNull();
    expect(closed.delivered).toBe(false);
  });
});
