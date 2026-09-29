import { z } from "zod";
import { extractPendingTests, SYNTHETIC_CASES } from "./extract";
import { applyWorkflowEvent, INITIAL_CASE, type PendingResultCase, type WorkflowActor, type WorkflowEvent } from "./workflow";

export const DEMO_STORAGE_KEY = "nutritiscan-synthetic-discharge-v1";
export function demoStorageKey(caseId: string) {
  return caseId === SYNTHETIC_CASES[0].id ? DEMO_STORAGE_KEY : `${DEMO_STORAGE_KEY}:${caseId}`;
}

export const DEMO_ACTORS: Record<string, WorkflowActor> = {
  "Anika, discharge coordinator": { id: "Anika, discharge coordinator", name: "Anika, discharge coordinator", role: "coordinator" },
  "Ravi, discharge nurse": { id: "Ravi, discharge nurse", name: "Ravi, discharge nurse", role: "nurse" },
  "Dr Meera Shah": { id: "Dr Meera Shah", name: "Dr Meera Shah", role: "clinician" },
  "Dr Arun Rao": { id: "Dr Arun Rao", name: "Dr Arun Rao", role: "clinician" },
  "Fictional lab feed": { id: "Fictional lab feed", name: "Fictional lab feed", role: "lab" },
  "Fictional delivery feed": { id: "Fictional delivery feed", name: "Fictional delivery feed", role: "delivery-system" },
};

const CandidateSchema = z.object({
  testName: z.string().min(1).max(120),
  documentId: z.string().min(1).max(120),
  documentTitle: z.string().min(1).max(120),
  page: z.number().int().min(1),
  line: z.number().int().min(1),
  excerpt: z.string().min(1).max(500),
});

const EventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("confirm-source"), source: CandidateSchema, testName: z.string().min(1).max(120) }),
  z.object({ type: z.literal("assign"), owner: z.string().min(1).max(120), deadline: z.string().max(10) }),
  z.object({ type: z.literal("result-arrived"), testName: z.string().min(1).max(120) }),
  z.object({ type: z.literal("escalate-deadline"), observedOn: z.string().max(10) }),
  z.object({ type: z.literal("acknowledge-escalation"), note: z.string().min(1).max(500) }),
  z.object({ type: z.literal("review"), decision: z.enum(["contact-patient", "no-contact-needed"]), note: z.string().min(1).max(1000) }),
  z.object({ type: z.literal("approve-message"), message: z.string().min(1).max(600) }),
  z.object({ type: z.literal("record-delivery") }),
]);

const EntrySchema = z.object({
  event: EventSchema,
  actorId: z.string().min(1).max(120),
  at: z.iso.datetime({ offset: true }),
});

const SnapshotSchema = z.object({
  version: z.literal(1),
  events: z.array(EntrySchema).max(12),
});

export type RecordedEvent = { event: WorkflowEvent; actorId: string; at: string };

function replay(events: RecordedEvent[], caseId: string): PendingResultCase {
  const demoCase = SYNTHETIC_CASES.find((item) => item.id === caseId);
  if (!demoCase) throw new Error("Unknown fictional case.");
  const source = extractPendingTests(demoCase.document)[0];
  return events.reduce((state, entry) => {
    if (!Object.prototype.hasOwnProperty.call(DEMO_ACTORS, entry.actorId)) throw new Error("Unknown simulated actor.");
    const actor = DEMO_ACTORS[entry.actorId];
    if (entry.event.type === "confirm-source" && JSON.stringify(entry.event.source) !== JSON.stringify(source)) {
      throw new Error("The saved source does not match the fictional document.");
    }
    if (entry.event.type === "result-arrived" && entry.event.testName !== demoCase.result.testName) {
      throw new Error("The saved result does not belong to this fictional case.");
    }
    if (entry.event.type === "result-arrived" && demoCase.requiresEscalation && !state.escalation) {
      throw new Error("Record the missed-deadline escalation before this fictional result arrives.");
    }
    return applyWorkflowEvent(state, entry.event, actor, entry.at);
  }, INITIAL_CASE);
}

export function restoreDemo(raw: string | null, caseId = SYNTHETIC_CASES[0].id): { state: PendingResultCase; events: RecordedEvent[]; error: string | null } {
  if (!raw) return { state: INITIAL_CASE, events: [], error: null };
  if (raw.length > 16000) return { state: INITIAL_CASE, events: [], error: "Saved demo data was too large and was reset." };
  try {
    const parsed = SnapshotSchema.parse(JSON.parse(raw));
    const events = parsed.events as RecordedEvent[];
    return { state: replay(events, caseId), events, error: null };
  } catch {
    return { state: INITIAL_CASE, events: [], error: "Saved demo steps could not be restored and were reset." };
  }
}

export function recordDemoEvent(events: RecordedEvent[], event: WorkflowEvent, actorId: string, at: string, caseId = SYNTHETIC_CASES[0].id) {
  const next = [...events, { event, actorId, at }];
  if (next.length > 12) throw new Error("The demo event limit was reached. Start over to run it again.");
  return { state: replay(next, caseId), events: next, serialized: JSON.stringify({ version: 1, events: next }) };
}
