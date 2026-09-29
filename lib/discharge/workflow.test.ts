import { describe, expect, it } from "vitest";
import { applyWorkflowEvent, INITIAL_CASE, workflowStatus } from "./workflow";

const at = "2026-09-29T10:00:00.000Z";

describe("pending-result workflow", () => {
  it("requires an owner before a result can move to clinical review", () => {
    expect(() => applyWorkflowEvent(INITIAL_CASE, { type: "result-arrived" }, at)).toThrow(/Assign an owner/);
    expect(() => applyWorkflowEvent(INITIAL_CASE, { type: "assign", owner: "Dr Meera Shah", deadline: "2026-99-99" }, at)).toThrow(/review deadline/);

    const assigned = applyWorkflowEvent(INITIAL_CASE, { type: "assign", owner: "Dr Meera Shah", deadline: "2026-10-01" }, at);
    expect(workflowStatus(assigned)).toBe("awaiting-result");
    expect(workflowStatus(applyWorkflowEvent(assigned, { type: "result-arrived" }, at))).toBe("needs-review");
  });

  it("does not close a patient-contact case until review, message approval and delivery are recorded", () => {
    const assigned = applyWorkflowEvent(INITIAL_CASE, { type: "assign", owner: "Dr Meera Shah", deadline: "2026-10-01" }, at);
    const arrived = applyWorkflowEvent(assigned, { type: "result-arrived" }, at);
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
    expect(closed.history).toHaveLength(5);
    expect(() => applyWorkflowEvent(closed, { type: "record-delivery" }, at)).toThrow(/already closed/);
  });

  it("allows a documented no-contact decision to close without inventing a patient message", () => {
    const assigned = applyWorkflowEvent(INITIAL_CASE, { type: "assign", owner: "Dr Arun Rao", deadline: "2026-10-01" }, at);
    const arrived = applyWorkflowEvent(assigned, { type: "result-arrived" }, at);
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
