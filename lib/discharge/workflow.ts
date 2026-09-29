export type ReviewDecision = "contact-patient" | "no-contact-needed";

export type WorkflowEvent =
  | { type: "assign"; owner: string; deadline: string }
  | { type: "result-arrived" }
  | { type: "review"; clinician: string; decision: ReviewDecision; note: string }
  | { type: "approve-message"; approvedBy: string; message: string }
  | { type: "record-delivery" };

export type HistoryEntry = { at: string; description: string };

export type PendingResultCase = {
  owner: string | null;
  deadline: string | null;
  resultArrived: boolean;
  review: { clinician: string; decision: ReviewDecision; note: string } | null;
  approvedMessage: string | null;
  delivered: boolean;
  history: HistoryEntry[];
};

export const INITIAL_CASE: PendingResultCase = {
  owner: null,
  deadline: null,
  resultArrived: false,
  review: null,
  approvedMessage: null,
  delivered: false,
  history: [],
};

export type WorkflowStatus =
  | "needs-owner"
  | "awaiting-result"
  | "needs-review"
  | "needs-message"
  | "needs-delivery"
  | "closed";

export function workflowStatus(state: PendingResultCase): WorkflowStatus {
  if (!state.owner) return "needs-owner";
  if (!state.resultArrived) return "awaiting-result";
  if (!state.review) return "needs-review";
  if (state.review.decision === "no-contact-needed" || state.delivered) return "closed";
  if (!state.approvedMessage) return "needs-message";
  return "needs-delivery";
}

export function applyWorkflowEvent(
  state: PendingResultCase,
  event: WorkflowEvent,
  at: string,
): PendingResultCase {
  if (workflowStatus(state) === "closed") throw new Error("This case is already closed.");

  let next: Omit<PendingResultCase, "history">;
  let description: string;

  switch (event.type) {
    case "assign": {
      if (state.resultArrived) throw new Error("Assign an owner before the result arrives.");
      const owner = event.owner.trim();
      const parsedDeadline = new Date(`${event.deadline}T00:00:00.000Z`);
      const validDate = /^\d{4}-\d{2}-\d{2}$/.test(event.deadline) &&
        !Number.isNaN(parsedDeadline.getTime()) &&
        parsedDeadline.toISOString().slice(0, 10) === event.deadline;
      if (!owner || !validDate) {
        throw new Error("Choose an owner and a review deadline.");
      }
      next = { ...state, owner, deadline: event.deadline };
      description = `Assigned to ${owner}; review deadline ${event.deadline}.`;
      break;
    }
    case "result-arrived": {
      if (!state.owner) throw new Error("Assign an owner before the result arrives.");
      if (state.resultArrived) throw new Error("The result has already arrived.");
      next = { ...state, resultArrived: true };
      description = "Lab result arrived; clinician review requested.";
      break;
    }
    case "review": {
      if (!state.resultArrived) throw new Error("A result is required before clinical review.");
      if (state.review) throw new Error("This result has already been reviewed.");
      const clinician = event.clinician.trim();
      const note = event.note.trim();
      if (!clinician || !note) throw new Error("Record the reviewing clinician and their decision note.");
      if (clinician !== state.owner) throw new Error("The assigned clinician must review this result.");
      next = { ...state, review: { clinician, decision: event.decision, note } };
      description = `${clinician} recorded a review: ${event.decision === "contact-patient" ? "patient contact required" : "no patient contact needed"}.`;
      break;
    }
    case "approve-message": {
      if (state.review?.decision !== "contact-patient") {
        throw new Error("A clinician must request patient contact first.");
      }
      if (event.approvedBy.trim() !== state.owner) throw new Error("The assigned clinician must approve the message.");
      const message = event.message.trim();
      if (!message) throw new Error("Review the patient message before approving it.");
      next = { ...state, approvedMessage: message };
      description = `${event.approvedBy.trim()} approved a patient message for the synthetic case.`;
      break;
    }
    case "record-delivery": {
      if (!state.approvedMessage) throw new Error("Approve the patient message before recording delivery.");
      next = { ...state, delivered: true };
      description = "Simulated patient delivery recorded; case closed.";
      break;
    }
  }

  return { ...next, history: [...state.history, { at, description }] };
}
