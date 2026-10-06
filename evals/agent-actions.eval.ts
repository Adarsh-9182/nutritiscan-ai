// ============================================================
// AGENT ACTION EVAL — scripted model, real NutriScan action tools.
//
// The model response is fixed so this eval is free and repeatable. It tests
// the agent/tool loop and the actual logMeal implementation, but it does not
// measure whether a live model chooses logMeal correctly. That is a separate
// model-quality eval and remains advisory until we have a reviewed rubric.
// ============================================================

import { MockLanguageModelV3 } from "ai/test";
import { expect, vi } from "vitest";
import { buildSoloist } from "../lib/agents";
import { evalSuite, gate } from "./harness";
import { blankProfile } from "../lib/memory/profile";

// Keep the real production agent, prompt and action tools, but replace only
// provider resolution. The scripted model below is free and deterministic.
const { providerState } = vi.hoisted(() => ({ providerState: { model: undefined as unknown } }));
vi.mock("../lib/agents/provider", () => ({
  resolveModel: () => ({ model: providerState.model, providerOptions: {}, id: "eval/scripted" }),
  MODEL_TIERS: 3,
  hasAnyModel: () => true,
}));

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 10, text: 10, reasoning: 0 },
};

function toolCall(toolCallId: string, toolName: string, input: Record<string, unknown>) {
  return {
    content: [{ type: "tool-call" as const, toolCallId, toolName, input: JSON.stringify(input) }],
    finishReason: { unified: "tool-calls" as const, raw: "tool_calls" },
    usage,
    warnings: [],
  };
}

function finalText(text: string) {
  return {
    content: [{ type: "text" as const, text }],
    finishReason: { unified: "stop" as const, raw: "stop" },
    usage,
    warnings: [],
  };
}

evalSuite("agent action loop: meal logging", () => {
  gate("runs logMeal and returns database-calculated nutrition to the agent", async () => {
    const model = new MockLanguageModelV3({
      doGenerate: [
        toolCall("meal-call-1", "logMeal", { description: "2 roti, 1 katori dal, 100 g paneer", title: "Lunch" }),
        finalText("I've logged your lunch using the food database."),
      ],
    });
    providerState.model = model;
    // Same production Nutrition Agent the chat route uses for single-domain turns.
    const agent = buildSoloist("nutrition", blankProfile, "");
    const result = await agent.generate({ prompt: "I ate 2 roti, 1 katori dal and 100 g paneer for lunch." });
    const calls = result.steps.flatMap((step) => step.toolCalls);
    const outputs = result.steps.flatMap((step) => step.toolResults);

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      toolName: "logMeal",
      input: { description: "2 roti, 1 katori dal, 100 g paneer", title: "Lunch" },
    });
    expect(outputs).toHaveLength(1);
    expect(outputs[0].output).toMatchObject({ kind: "meal", meal: { title: "Lunch" } });
    expect((outputs[0].output as { meal: { kcal: number; protein: number } }).meal.kcal).toBeGreaterThan(0);
    expect((outputs[0].output as { meal: { kcal: number; protein: number } }).meal.protein).toBeGreaterThan(0);
    expect(result.text).toContain("logged your lunch");
    expect(model.doGenerateCalls).toHaveLength(2);
  });

  gate("uses a profile update before calculating targets from the new values", async () => {
    const model = new MockLanguageModelV3({
      doGenerate: [
        toolCall("profile-call-1", "updateProfile", { weightKg: 70, heightCm: 175, goal: "Build muscle" }),
        toolCall("targets-call-1", "calculateTargets", {}),
        finalText("I saved your details. Your calculated protein target is 126 g/day."),
      ],
    });
    providerState.model = model;
    const agent = buildSoloist("nutrition", blankProfile, "");
    const result = await agent.generate({ prompt: "I weigh 70 kg, I'm 175 cm tall, and my goal is to build muscle. What is my protein target?" });
    const calls = result.steps.flatMap((step) => step.toolCalls);
    const outputs = result.steps.flatMap((step) => step.toolResults);

    expect(calls.map((call) => call.toolName)).toEqual(["updateProfile", "calculateTargets"]);
    expect(outputs[1].output).toMatchObject({
      targets: { proteinGramsPerDay: 126 },
      missingForMore: expect.arrayContaining(["age", "sex (for a calorie estimate)"]),
    });
    expect(result.text).toContain("126 g/day");
    expect(model.doGenerateCalls).toHaveLength(3);
  });
});
