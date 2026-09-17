import { afterEach, describe, expect, it, vi } from "vitest";
import { HOLD_BACK, runTurn, type TurnEvent } from "./turn";
import { DEMO } from "@/lib/workspace/demo";

afterEach(() => vi.unstubAllEnvs());
const enableModel = () => {
  vi.stubEnv("HEALTH_MODEL_BASE_URL", "https://api.groq.com/openai/v1");
  vi.stubEnv("HEALTH_MODEL_NAME", "m");
  vi.stubEnv("HEALTH_MODEL_APPROVED", "true");
};
/** A fake model that streams `text` in small pieces. */
const model = (text: string, pieces = 7) =>
  vi.fn(async function* () {
    for (let i = 0; i < text.length; i += pieces)
      yield text.slice(i, i + pieces);
  });
const failing = () =>
  vi.fn(async function* () {
    yield* [];
    throw new Error("provider down");
  });
async function run(
  text: string,
  opts: Partial<Parameters<typeof runTurn>[0]> = {},
) {
  const events: TurnEvent[] = [];
  const trace = { mark: vi.fn(), set: vi.fn() };
  for await (const e of runTurn({
    messages: [{ role: "user", text }],
    workspace: null,
    route: false,
    signal: new AbortController().signal,
    trace,
    ...opts,
  }))
    events.push(e);
  const shown = events
    .filter((e) => e.t === "delta")
    .map((e) => (e as { v: string }).v)
    .join("");
  return { events, shown, trace, done: events.at(-1) };
}

describe("turn pipeline", () => {
  it("escalates before calling any model, in any language", async () => {
    const generate = model("hello");
    for (const text of [
      "I have crushing chest pain and cannot breathe",
      "seene me tez dard aur saans nahi aa rahi",
    ]) {
      const r = await run(text, { generate });
      expect(r.done).toEqual({ t: "done", outcome: "escalated" });
      expect(r.events[0]).toMatchObject({ t: "replace", mode: "escalation" });
    }
    expect(generate).not.toHaveBeenCalled();
  });

  it("uses earlier turns for triage", async () => {
    const generate = model("hello");
    const r = await run("what should I do", {
      generate,
      messages: [
        { role: "user", text: "my chest hurts badly and I can't breathe" },
        { role: "assistant", text: "…" },
        { role: "user", text: "what should I do" },
      ],
    });
    expect(r.done?.t === "done" && r.done.outcome).toBe("escalated");
  });

  it("streams a safe answer completely, holding back a tail", async () => {
    const answer = "Kidney stones are hard deposits. ".repeat(12);
    const r = await run("what are kidney stones", { generate: model(answer) });
    expect(r.shown).toBe(answer);
    expect(r.done).toEqual({ t: "done", outcome: "answered" });
    // Several releases, none before enough text had arrived.
    const deltas = r.events.filter((e) => e.t === "delta");
    expect(deltas.length).toBeGreaterThan(2);
    expect(r.trace.mark).toHaveBeenCalledWith("first_token");
  });

  it("never shows any part of an unsafe instruction", async () => {
    const answer =
      "Metformin is a common diabetes medicine that many people use. " +
      "For you, take 500 mg twice a day with food and then more words follow.";
    const r = await run("metformin?", { generate: model(answer, 3) });
    expect(r.shown).not.toMatch(/take|500/);
    expect(r.events).toContainEqual(expect.objectContaining({ t: "replace" }));
    expect(r.done).toEqual({
      t: "done",
      outcome: "guarded",
      rule: "personal_dose",
    });
    expect(r.trace.set).toHaveBeenCalledWith(
      expect.objectContaining({ guardRule: "personal_dose" }),
    );
  });

  it("holds back at least as much as any guard pattern can span", async () => {
    // The dose pattern spans a verb, up to 40 characters and an amount.
    const worst = `take ${"x".repeat(40)} 1000.5 capsules`;
    expect(worst.length).toBeLessThan(HOLD_BACK);
  });

  it("routes record questions without a model (Telegram)", async () => {
    enableModel();
    const generate = model("should not run");
    const r = await run("Summarise my latest report", {
      route: true,
      workspace: DEMO,
      generate,
    });
    expect(r.events[0]).toMatchObject({ t: "answer" });
    expect(r.done).toEqual({ t: "done", outcome: "deterministic" });
    expect(generate).not.toHaveBeenCalled();
  });

  it("answers from references when no model is configured", async () => {
    const r = await run("tell me about sleep", {
      route: true,
      generate: model("x"),
    });
    expect(r.events[0]).toMatchObject({ t: "answer" });
  });

  it("falls back quietly if the model fails before any text", async () => {
    enableModel();
    const r = await run("tell me about sleep", {
      route: true,
      generate: failing(),
    });
    expect(r.events[0]).toMatchObject({ t: "answer" });
    expect(r.done).toEqual({ t: "done", outcome: "deterministic" });
    const web = await run("tell me about sleep", { generate: failing() });
    expect(web.events[0]).toMatchObject({ t: "error" });
  });

  it("reports an aborted turn", async () => {
    const controller = new AbortController();
    const generate = vi.fn(async function* () {
      yield "a ".repeat(100);
      controller.abort();
      throw new Error("aborted");
    });
    const r = await run("hello there", {
      generate,
      signal: controller.signal,
    });
    expect(r.done).toEqual({ t: "done", outcome: "aborted" });
  });
});
