import { beforeEach, describe, expect, it, vi } from "vitest";
import { Chat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage, type UIMessageChunk } from "ai";

const modelStream = vi.hoisted(() => vi.fn());
vi.mock("ai", async (original) => ({
  ...await original<typeof import("ai")>(),
  createAgentUIStream: modelStream,
}));
vi.mock("@/lib/agents", () => ({
  buildGeneralist: () => ({}), buildSoloist: () => ({}), buildSupervisor: () => ({}),
}));
vi.mock("@/lib/agents/provider", () => ({ MODEL_TIERS: 3, hasAnyModel: () => true }));
vi.mock("@/lib/memory/recall", () => ({ recallRelevant: async () => null }));
vi.mock("@/lib/billing/models", () => ({
  premiumForRequest: async () => null,
  withPremium: (_premium: unknown, run: () => unknown) => run(),
}));

import { POST } from "@/app/api/chat/route";
import { answerMode } from "./agent-trace";

async function* chunks(...parts: UIMessageChunk[]) {
  for (const part of parts) yield part;
}

function modelAnswer(id: string, text: string) {
  return chunks(
    { type: "start", messageId: id },
    { type: "text-start", id: "text" },
    { type: "text-delta", id: "text", delta: text },
    { type: "text-end", id: "text" },
    { type: "finish", finishReason: "stop" },
  );
}

async function ask(text: string) {
  const chat = new Chat<UIMessage>({
    transport: new DefaultChatTransport({
      api: "http://localhost/api/chat",
      prepareSendMessagesRequest: ({ messages }) => ({ body: { messages } }),
      fetch: async (_url, init) => POST(new Request("http://localhost/api/chat", init)),
    }),
  });
  await chat.sendMessage({ text });
  expect(chat.error).toBeUndefined();
  return chat.messages.filter((message) => message.role === "assistant");
}

const textOf = (message: UIMessage) => message.parts
  .filter((part) => part.type === "text").map((part) => part.text).join("");

describe("one assistant reply per chat turn", () => {
  beforeEach(() => modelStream.mockReset());

  it("keeps safety metadata and the streamed model answer in the same message", async () => {
    modelStream.mockResolvedValueOnce(modelAnswer("model-answer", "Hello, how can I help?"));
    const replies = await ask("Hello");
    expect(replies).toHaveLength(1);
    expect(textOf(replies[0])).toBe("Hello, how can I help?");
    expect(answerMode(replies[0])).toBe("model");
    expect(replies[0].parts.some((part) => part.type === "data-triage")).toBe(true);
  });

  it("does not create an empty Safety guidance message for each failed model attempt", async () => {
    modelStream.mockResolvedValueOnce(chunks(
      { type: "start", messageId: "unavailable-model" },
      { type: "error", errorText: "Synthetic provider unavailable" },
    )).mockResolvedValueOnce(modelAnswer("fallback-model", "A synthetic nutrition answer."));
    const replies = await ask("Explain dietary fibre");
    expect(replies).toHaveLength(1);
    expect(textOf(replies[0])).toBe("A synthetic nutrition answer.");
    expect(answerMode(replies[0])).toBe("model");
    expect(modelStream).toHaveBeenCalledTimes(2);
  });

  it("keeps a real safety escalation as one complete reply without calling a model", async () => {
    const replies = await ask("I have crushing chest pain and I am sweating");
    expect(replies).toHaveLength(1);
    expect(textOf(replies[0])).toContain("emergency");
    expect(answerMode(replies[0])).toBe("safety");
    expect(modelStream).not.toHaveBeenCalled();
  });

  it("keeps a buffered clinical answer in the same message after an unavailable model", async () => {
    const checkedAnswer = "**Facts** — You reported a fever since yesterday.\n\n**Inference** — The cause is uncertain.\n\n**Recommendation** — Tell a clinician when it started and your temperature.\n\n**Medical Warning** — Seek urgent care if symptoms become severe or rapidly worsen.\n\n**Confidence** — Low, with only the reported symptom available.\n\nThis is educational, not a diagnosis.";
    modelStream.mockResolvedValueOnce(chunks(
      { type: "start", messageId: "failed-clinical-model" },
      { type: "text-start", id: "held" },
      { type: "text-delta", id: "held", delta: "Unvalidated partial answer" },
      { type: "error", errorText: "Synthetic provider failure" },
    )).mockResolvedValueOnce(modelAnswer("clinical-answer", checkedAnswer));
    const replies = await ask("I have had a fever since yesterday");
    expect(replies).toHaveLength(1);
    expect(textOf(replies[0])).toBe(checkedAnswer);
    expect(textOf(replies[0])).not.toContain("Unvalidated");
    expect(answerMode(replies[0])).toBe("model");
  });
});
