import type { Profile } from "./types";
import type { AssistantAnswer } from "./assistant";
import { assessTurn } from "../safety/triage";
import {
  emergencyResponse,
  mentalHealthResponse,
  urgentPreamble,
} from "../safety/templates";
import { blankProfile } from "../memory/profile";

export function escalation(
  question: string,
  profile: Profile,
): AssistantAnswer | undefined {
  const state = assessTurn({
    text: question,
    profile: {
      ...blankProfile,
      conditions: profile.conditions.split("\n").filter(Boolean),
      medicines: profile.medicines.split("\n").filter(Boolean),
      allergies: profile.allergies.split("\n").filter(Boolean),
    },
    consultationId: "workspace",
    turn: 1,
  });
  if (state.triage.channel === "mental_health")
    return { text: mentalHealthResponse(), mode: "escalation", sources: [] };
  if (state.triage.verdict === "emergency")
    return { text: emergencyResponse(state), mode: "escalation", sources: [] };
  if (state.triage.verdict === "urgent")
    return { text: urgentPreamble(state), mode: "escalation", sources: [] };
}
