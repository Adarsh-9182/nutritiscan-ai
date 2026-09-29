import type { PendingTestCandidate } from "./extract";

export type ReviewDecision = "contact-patient" | "no-contact-needed";

export type ReviewedSource = PendingTestCandidate & { extractedTestName: string; reviewedBy: string };

export type WorkflowActor = {
  id: string;
  name: string;
  role: "coordinator" | "nurse" | "clinician" | "lab" | "delivery-system";
};

export type WorkflowEvent =
  | { type: "confirm-source"; source: PendingTestCandidate; testName: string }
  | { type: "assign"; owner: string; deadline: string }
  | { type: "result-arrived"; testName: string }
  | { type: "review"; decision: ReviewDecision; note: string }
  | { type: "approve-message"; message: string }
  | { type: "record-delivery" };

export type HistoryEntry = { at: string; actor: WorkflowActor; description: string };

export type PendingResultCase = {
  source: ReviewedSource | null;
  owner: string | null;
  deadline: string | null;
  resultArrived: boolean;
  review: { clinician: string; decision: ReviewDecision; note: string } | null;
  approvedMessage: string | null;
  delivered: boolean;
  history: HistoryEntry[];
};

export const INITIAL_CASE: PendingResultCase = {
  source: null,
  owner: null,
  deadline: null,
  resultArrived: false,
  review: null,
  approvedMessage: null,
  delivered: false,
  history: [],
};

export type WorkflowStatus =
  | "needs-source-review"
  | "needs-owner"
  | "awaiting-result"
  | "needs-review"
  | "needs-message"
  | "needs-delivery"
  | "closed";

export function workflowStatus(state: PendingResultCase): WorkflowStatus {
  if (!state.source) return "needs-source-review";
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
  actor: WorkflowActor,
  at: string,
): PendingResultCase {
  if (workflowStatus(state) === "closed") throw new Error("This case is already closed.");
  if (!actor.id.trim() || !actor.name.trim() || actor.id.length > 120 || actor.name.length > 120) {
    throw new Error("A named actor is required.");
  }

  let next: Omit<PendingResultCase, "history">;
  let description: string;

  switch (event.type) {
    case "confirm-source": {
      if (actor.role !== "coordinator" && actor.role !== "nurse") throw new Error("A coordinator or nurse must review the source.");
      if (state.source) throw new Error("The source has already been reviewed.");
      const testName = event.testName.trim();
      if (!testName || testName.length > 120 || !event.source.documentId || !event.source.excerpt ||
          !Number.isInteger(event.source.page) || event.source.page < 1 ||
          !Number.isInteger(event.source.line) || event.source.line < 1) {
        throw new Error("Confirm the test, reviewer and source location.");
      }
      next = { ...state, source: { ...event.source, extractedTestName: event.source.testName, testName, reviewedBy: actor.name } };
      description = `${actor.name} ${testName === event.source.testName ? "confirmed" : `corrected ${event.source.testName} to`} ${testName} from ${event.source.documentTitle}, page ${event.source.page}, line ${event.source.line}.`;
      break;
    }
    case "assign": {
      if (actor.role !== "coordinator" && actor.role !== "nurse") throw new Error("A coordinator or nurse must assign the result.");
      if (!state.source) throw new Error("Review the document source before assignment.");
      if (state.resultArrived) throw new Error("Assign an owner before the result arrives.");
      const owner = event.owner.trim();
      const parsedDeadline = new Date(`${event.deadline}T00:00:00.000Z`);
      const validDate = /^\d{4}-\d{2}-\d{2}$/.test(event.deadline) &&
        !Number.isNaN(parsedDeadline.getTime()) &&
        parsedDeadline.toISOString().slice(0, 10) === event.deadline;
      if (!owner || owner.length > 120 || !validDate) {
        throw new Error("Choose an owner and a review deadline.");
      }
      next = { ...state, owner, deadline: event.deadline };
      description = `Assigned to ${owner}; review deadline ${event.deadline}.`;
      break;
    }
    case "result-arrived": {
      if (actor.role !== "lab") throw new Error("A lab source must report the result arrival.");
      if (!state.owner) throw new Error("Assign an owner before the result arrives.");
      if (state.resultArrived) throw new Error("The result has already arrived.");
      if (event.testName.trim().toLowerCase() !== state.source?.testName.toLowerCase()) {
        throw new Error("The arriving result does not match the reviewed pending test.");
      }
      next = { ...state, resultArrived: true };
      description = "Lab result arrived; clinician review requested.";
      break;
    }
    case "review": {
      if (actor.role !== "clinician") throw new Error("A clinician must review the result.");
      if (!state.resultArrived) throw new Error("A result is required before clinical review.");
      if (state.review) throw new Error("This result has already been reviewed.");
      const note = event.note.trim();
      if (!note || note.length > 1000) throw new Error("Record the clinician's decision note (1 to 1000 characters).");
      if (actor.id !== state.owner) throw new Error("The assigned clinician must review this result.");
      next = { ...state, review: { clinician: actor.name, decision: event.decision, note } };
      description = `${actor.name} recorded a review: ${event.decision === "contact-patient" ? "patient contact required" : "no patient contact needed"}.`;
      break;
    }
    case "approve-message": {
      if (actor.role !== "clinician" || actor.id !== state.owner) throw new Error("The assigned clinician must approve the message.");
      if (state.review?.decision !== "contact-patient") {
        throw new Error("A clinician must request patient contact first.");
      }
      const message = event.message.trim();
      if (!message || message.length > 600) throw new Error("Review a patient message of 1 to 600 characters.");
      next = { ...state, approvedMessage: message };
      description = `${actor.name} approved a patient message for the synthetic case.`;
      break;
    }
    case "record-delivery": {
      if (actor.role !== "delivery-system") throw new Error("A delivery receipt must come from the delivery system.");
      if (!state.approvedMessage) throw new Error("Approve the patient message before recording delivery.");
      next = { ...state, delivered: true };
      description = "Simulated patient delivery recorded; case closed.";
      break;
    }
  }

  return { ...next, history: [...state.history, { at, actor, description }] };
}
