// ============================================================
// HEALTH AGENT EVAL — scripted specialist handoff and patient context.
//
// A fixed model response makes this free and repeatable. It tests whether the
// production Supervisor can execute specialist handoffs and whether those
// specialists receive the patient's recorded biology/lab context. It does
// NOT score medical correctness or whether a live model chooses these agents.
// ============================================================

import { MockLanguageModelV3 } from "ai/test";
import { expect, vi } from "vitest";
import { buildSupervisor } from "../lib/agents";
import { evalSuite, gate } from "./harness";
import { blankProfile } from "../lib/memory/profile";

const { providers } = vi.hoisted(() => ({
  providers: { supervisor: undefined as unknown, specialist: undefined as unknown },
}));

// Mock only model resolution. We still construct and run the real production
// Supervisor, real specialist agents and their real delegation tools.
vi.mock("../lib/agents/provider", () => ({
  resolveModel: (role: "supervisor" | "specialist") => ({
    model: providers[role],
    providerOptions: {},
    id: `eval/${role}`,
  }),
  MODEL_TIERS: 3,
  hasAnyModel: () => true,
}));

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 10, text: 10, reasoning: 0 },
};

function toolCalls(calls: { id: string; name: string; task: string }[]) {
  return {
    content: calls.map(({ id, name, task }) => ({
      type: "tool-call" as const,
      toolCallId: id,
      toolName: name,
      input: JSON.stringify({ task }),
    })),
    finishReason: { unified: "tool-calls" as const, raw: "tool_calls" },
    usage,
    warnings: [],
  };
}

function textAnswer(text: string) {
  return {
    content: [{ type: "text" as const, text }],
    finishReason: { unified: "stop" as const, raw: "stop" },
    usage,
    warnings: [],
  };
}

evalSuite("health agent: biology context and specialist handoff", () => {
  gate("routes a biology question across Lab and Doctor with recorded patient context", async () => {
    const profile = {
      ...blankProfile,
      biomarkers: [{
        name: "Vitamin B12",
        value: "180 pg/mL",
        status: "low" as const,
        note: "Report reference 200–900 pg/mL",
      }],
    };

    const supervisor = new MockLanguageModelV3({
      doGenerate: [
        toolCalls([
          { id: "lab-1", name: "askLabAgent", task: "Interpret the recorded B12 result and report range." },
          { id: "doctor-1", name: "askDoctorAgent", task: "Explain the biology of B12 and tingling, and what should be clarified." },
        ]),
        textAnswer("Your B12 result is below the range recorded from your report. B12 supports nerve function; tingling deserves assessment by a clinician, who can consider your symptoms and the full report."),
      ],
    });

    const specialist = new MockLanguageModelV3({
      doGenerate: (options) => {
        const prompt = JSON.stringify(options.prompt);
        const name = prompt.includes("You are the Lab Agent") ? "Lab" : "Doctor";
        return textAnswer(`${name} specialist response for the Supervisor.`);
      },
    });

    providers.supervisor = supervisor;
    providers.specialist = specialist;

    const agent = buildSupervisor(profile, "", null, null, null, 0, undefined, false);
    const result = await agent.generate({
      prompt: "My B12 is 180 pg/mL and I've had tingling in my hands. How does B12 relate to nerves, and what should I ask my doctor?",
    });

    const calls = result.steps.flatMap((step) => step.toolCalls);
    expect(calls.map((call) => call.toolName)).toEqual(["askLabAgent", "askDoctorAgent"]);
    expect(supervisor.doGenerateCalls).toHaveLength(2);
    expect(specialist.doGenerateCalls).toHaveLength(2);

    const specialistPrompts = specialist.doGenerateCalls.map((call) => JSON.stringify(call.prompt));
    expect(specialistPrompts.some((prompt) => prompt.includes("Lab Agent") && prompt.includes("180 pg/mL"))).toBe(true);
    expect(specialistPrompts.some((prompt) => prompt.includes("Doctor Agent") && prompt.includes("180 pg/mL"))).toBe(true);
    expect(result.text).toContain("B12 supports nerve function");
    expect(result.text).toContain("clinician");
  });
});
