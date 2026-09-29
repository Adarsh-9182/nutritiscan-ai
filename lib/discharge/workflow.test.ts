import { describe, expect, it } from "vitest";
import { extractPendingTests, SYNTHETIC_DISCHARGE_NOTE, SYNTHETIC_LAB_RESULT } from "./extract";
import { applyWorkflowEvent, INITIAL_CASE, workflowStatus, type PendingResultCase, type WorkflowActor, type WorkflowEvent } from "./workflow";

const at = "2026-09-29T10:00:00.000Z";
const coordinator: WorkflowActor = { id: "anika", name: "Anika", role: "coordinator" };
const meera: WorkflowActor = { id: "Dr Meera Shah", name: "Dr Meera Shah", role: "clinician" };
const arun: WorkflowActor = { id: "Dr Arun Rao", name: "Dr Arun Rao", role: "clinician" };
const lab: WorkflowActor = { id: "fictional-lab", name: "Fictional lab feed", role: "lab" };
const delivery: WorkflowActor = { id: "fictional-delivery", name: "Fictional delivery feed", role: "delivery-system" };
const candidate = extractPendingTests(SYNTHETIC_DISCHARGE_NOTE)[0];
const apply = (state: PendingResultCase, event: WorkflowEvent, actor: WorkflowActor) => applyWorkflowEvent(state, event, actor, at);
const confirm = () => apply(INITIAL_CASE, { type: "confirm-source", source: candidate, testName: candidate.testName }, coordinator);
const assign = (owner: WorkflowActor) => apply(confirm(), { type: "assign", owner: owner.id, deadline: "2026-10-01" }, coordinator);
const arrive = (owner: WorkflowActor) => apply(assign(owner), { type: "result-arrived", testName: SYNTHETIC_LAB_RESULT.testName }, lab);

describe("pending-result workflow", () => {
  it("requires a reviewed source and owner before a result can move to clinical review", () => {
    expect(workflowStatus(INITIAL_CASE)).toBe("needs-source-review");
    expect(() => apply(INITIAL_CASE, { type: "assign", owner: meera.id, deadline: "2026-10-01" }, coordinator)).toThrow(/Review the document source/);
    expect(workflowStatus(confirm())).toBe("needs-owner");
    expect(() => apply(INITIAL_CASE, { type: "result-arrived", testName: SYNTHETIC_LAB_RESULT.testName }, lab)).toThrow(/Assign an owner/);
    expect(() => apply(confirm(), { type: "assign", owner: meera.id, deadline: "2026-99-99" }, coordinator)).toThrow(/review deadline/);
    expect(workflowStatus(assign(meera))).toBe("awaiting-result");
    expect(() => apply(assign(meera), { type: "result-arrived", testName: "Different test" }, lab)).toThrow(/does not match/);
    expect(workflowStatus(arrive(meera))).toBe("needs-review");
  });

  it("rejects actions from the wrong simulated role", () => {
    expect(() => apply(INITIAL_CASE, { type: "confirm-source", source: candidate, testName: candidate.testName }, meera)).toThrow(/coordinator or nurse/);
    expect(() => apply(confirm(), { type: "assign", owner: meera.id, deadline: "2026-10-01" }, meera)).toThrow(/coordinator or nurse/);
    expect(() => apply(assign(meera), { type: "result-arrived", testName: candidate.testName }, coordinator)).toThrow(/lab source/);
    expect(() => apply(arrive(meera), { type: "review", decision: "no-contact-needed", note: "Reviewed." }, arun)).toThrow(/assigned clinician/);
  });

  it("does not close a patient-contact case until review, message approval and delivery are recorded", () => {
    const arrived = arrive(meera);
    expect(() => apply(arrived, { type: "record-delivery" }, delivery)).toThrow(/Approve the patient message/);
    const reviewed = apply(arrived, { type: "review", decision: "contact-patient", note: "Contact required in this fictional case." }, meera);
    expect(workflowStatus(reviewed)).toBe("needs-message");
    expect(() => apply(reviewed, { type: "approve-message", message: "Please call." }, arun)).toThrow(/assigned clinician/);
    const approved = apply(reviewed, { type: "approve-message", message: "Please contact the care team." }, meera);
    expect(workflowStatus(approved)).toBe("needs-delivery");
    expect(() => apply(approved, { type: "record-delivery" }, coordinator)).toThrow(/delivery receipt/);
    const closed = apply(approved, { type: "record-delivery" }, delivery);
    expect(workflowStatus(closed)).toBe("closed");
    expect(closed.history).toHaveLength(6);
    expect(closed.history.at(-1)?.actor.role).toBe("delivery-system");
    expect(() => apply(closed, { type: "record-delivery" }, delivery)).toThrow(/already closed/);
  });

  it("allows a documented no-contact decision to close without inventing a patient message", () => {
    const arrived = arrive(arun);
    expect(() => apply(arrived, { type: "review", decision: "no-contact-needed", note: "   " }, arun)).toThrow(/decision note/);
    const closed = apply(arrived, { type: "review", decision: "no-contact-needed", note: "No further action in this fictional case." }, arun);
    expect(workflowStatus(closed)).toBe("closed");
    expect(closed.approvedMessage).toBeNull();
    expect(closed.delivered).toBe(false);
  });

  it("preserves the original extraction when a reviewer corrects the test name", () => {
    const corrected = apply(INITIAL_CASE, { type: "confirm-source", source: candidate, testName: "Corrected test" }, coordinator);
    expect(corrected.source?.extractedTestName).toBe("Urine culture");
    expect(corrected.source?.testName).toBe("Corrected test");
    expect(corrected.history[0].description).toContain("corrected Urine culture to Corrected test");
    const assigned = apply(corrected, { type: "assign", owner: meera.id, deadline: "2026-10-01" }, coordinator);
    expect(() => apply(assigned, { type: "result-arrived", testName: "Urine culture" }, lab)).toThrow(/does not match/);
  });
});
