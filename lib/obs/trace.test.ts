import { describe, expect, it, vi } from "vitest";
import {
  hashId,
  startTrace,
  type TraceFields,
  type TraceRecord,
} from "./trace";

const capture = () => {
  const records: TraceRecord[] = [];
  const sink = vi.fn((r: TraceRecord) => {
    records.push(r);
  });
  return { records, sink };
};

describe("trace", () => {
  it("records stages as non-negative integer ms and duration covers them", async () => {
    const { sink } = capture();
    const trace = startTrace("chat.turn", sink);
    trace.mark("triage");
    await new Promise((r) => setTimeout(r, 5));
    trace.mark("first_token");
    trace.mark("done");
    const record = trace.end("answered");

    const values = Object.values(record.stages);
    expect(Object.keys(record.stages)).toEqual([
      "triage",
      "first_token",
      "done",
    ]);
    for (const v of values) {
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
    }
    expect(record.stages.first_token).toBeGreaterThanOrEqual(
      record.stages.triage,
    );
    expect(Number.isInteger(record.durationMs)).toBe(true);
    expect(record.durationMs).toBeGreaterThanOrEqual(record.stages.done);
    expect(record.traceId).toMatch(/^[0-9a-f-]{36}$/);
    expect(record.name).toBe("chat.turn");
    expect(Number.isNaN(Date.parse(record.startedAt))).toBe(false);
  });

  it("end is idempotent", () => {
    const { sink } = capture();
    const trace = startTrace("chat.turn", sink);
    const first = trace.end("answered");
    const second = trace.end("error", "late");
    expect(second).toBe(first);
    expect(second.outcome).toBe("answered");
    expect(sink).toHaveBeenCalledTimes(1);
  });

  it("drops unknown keys and wrong-typed values, truncates long identifiers", () => {
    const { sink } = capture();
    const trace = startTrace("chat.turn", sink);
    trace.set({
      channel: "email",
      signedIn: "yes",
      promptChars: "12",
      inputTokens: Number.NaN,
      outputTokens: -3,
      historyTurns: 4.6,
      fallbackUsed: false,
      language: "fr",
      model: "a".repeat(500),
      provider: "groq",
      userText: "hello",
    } as unknown as Partial<TraceFields>);
    const record = trace.end("answered") as Record<string, unknown>;

    expect(record).not.toHaveProperty("userText");
    expect(record).not.toHaveProperty("channel");
    expect(record).not.toHaveProperty("signedIn");
    expect(record).not.toHaveProperty("promptChars");
    expect(record).not.toHaveProperty("inputTokens");
    expect(record).not.toHaveProperty("outputTokens");
    expect(record).not.toHaveProperty("language");
    expect(record.historyTurns).toBe(5);
    expect(record.fallbackUsed).toBe(false);
    expect(record.provider).toBe("groq");
    expect(record.model).toBe("a".repeat(64));
  });

  it("does not throw when the sink throws", () => {
    const trace = startTrace("chat.turn", () => {
      throw new Error("sink down");
    });
    expect(() => trace.end("error", "provider_timeout")).not.toThrow();
    expect(trace.end("error").errorCode).toBe("provider_timeout");
  });

  it("uses console.info as the default sink", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    startTrace("chat.turn").end("answered");
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toBe("[trace]");
    expect(JSON.parse(spy.mock.calls[0][1] as string).outcome).toBe("answered");
    spy.mockRestore();
  });

  it("hashId is stable, 16 hex chars, and input-sensitive", () => {
    const a = hashId("user-123");
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(hashId("user-123")).toBe(a);
    expect(hashId("user-124")).not.toBe(a);
  });

  it("never records health content passed into text fields", () => {
    const secret = "I have chest pain and take 500 mg metformin";
    const { sink } = capture();
    const trace = startTrace("chat.turn", sink);
    trace.set({ provider: secret, model: secret, guardRule: secret });
    trace.set({
      channel: secret,
      language: secret,
    } as unknown as Partial<TraceFields>);
    trace.mark(secret);
    const record = trace.end("guarded", secret);
    const json = JSON.stringify(record);

    expect(json).not.toContain("chest pain");
    expect(json).not.toContain("metformin");
    expect(json).not.toContain("chest");
    expect(record).not.toHaveProperty("provider");
    expect(record).not.toHaveProperty("model");
    expect(record).not.toHaveProperty("guardRule");
    expect(record).not.toHaveProperty("errorCode");
    expect(record.stages).toEqual({});
  });
});
