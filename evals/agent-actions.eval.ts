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

evalSuite("agent action loop: meal logging", () => {
  gate("runs logMeal and returns database-calculated nutrition to the agent", async () => {
    const model = new MockLanguageModelV3({
      doGenerate: [
        {
          content: [{
            type: "tool-call",
            toolCallId: "meal-call-1",
            toolName: "logMeal",
            input: JSON.stringify({ description: "2 roti, 1 katori dal, 100 g paneer", title: "Lunch" }),
          }],
          finishReason: { unified: "tool-calls", raw: "tool_calls" },
          usage,
          warnings: [],
        },
        {
          content: [{ type: "text", text: "I've logged your lunch using the food database." }],
          finishReason: { unified: "stop", raw: "stop" },
          usage,
          warnings: [],
        },
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
});
