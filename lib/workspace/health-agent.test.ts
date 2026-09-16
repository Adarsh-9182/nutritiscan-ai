import { describe, it, expect, vi } from "vitest";
import { runHealthAgent, parseEducation } from "./health-agent";
import { findReferences } from "./health-library";
import { recordAnswer } from "./record-tools";
import { DEMO } from "./demo";
describe("health companion boundaries", () => {
  it("does not route any mention of a doctor or question to a report", () => {
    expect(
      recordAnswer("I have a question about nutrition", DEMO),
    ).toBeUndefined();
    expect(
      recordAnswer("What does a doctor mean by medicine interactions?", DEMO),
    ).toBeUndefined();
  });
  it.each([
    "nutrition protein",
    "sleep",
    "medicines interactions",
    "mental wellbeing",
    "women menopause",
    "diabetes glucose",
    "healthy exercise",
  ])(
    "covers %s with published references without pretending AI ran",
    async (question) => {
      const result = await runHealthAgent(question, DEMO);
      expect(result.mode).toBe("reference");
      expect(result.sources.length).toBeGreaterThan(0);
      expect(
        result.sources.every((s) =>
          s.url.startsWith("https://medlineplus.gov/"),
        ),
      ).toBe(true);
    },
  );
  it("keeps unknown topics out of the model", async () => {
    const complete = vi.fn();
    const result = await runHealthAgent(
      "Explain rare chromosomal rearrangements",
      DEMO,
      { complete },
    );
    expect(result.mode).toBe("unavailable");
    expect(complete).not.toHaveBeenCalled();
  });
  it("checks emergency context before every tool or model call", async () => {
    const complete = vi.fn();
    const result = await runHealthAgent("Summarise my report", DEMO, {
      complete,
      history: ["I have crushing chest pain and cannot breathe"],
    });
    expect(result.mode).toBe("escalation");
    expect(complete).not.toHaveBeenCalled();
    expect(result.text).not.toContain("245");
  });
  it("blocks dose selection before inference", async () => {
    const complete = vi.fn();
    const result = await runHealthAgent(
      "What dose of paracetamol should I take?",
      DEMO,
      { complete },
    );
    expect(result.text).toContain("cannot choose a dose");
    expect(complete).not.toHaveBeenCalled();
  });
  it("runs a bounded planning and synthesis sequence with allowlisted citations", async () => {
    const complete = vi
      .fn()
      .mockResolvedValueOnce('{"tools":["references"]}')
      .mockResolvedValueOnce(
        "Sleep quality matters as well as timing. Keep notes about interruptions to discuss with your clinician.",
      );
    const result = await runHealthAgent(
      "How can I understand my sleep?",
      DEMO,
      { complete },
    );
    expect(result.mode).toBe("ai");
    expect(complete).toHaveBeenCalledTimes(2);
    expect(result.sources).toHaveLength(1);
    expect(JSON.stringify(complete.mock.calls)).not.toContain(
      DEMO.profile.name,
    );
    expect(DEMO.tasks).not.toHaveLength(0); // proposals never mutate the workspace
  });
  it("rejects fabricated tools without executing them", async () => {
    const complete = vi
      .fn()
      .mockResolvedValue('{"tools":["send_email","prescribe"]}');
    const before = JSON.stringify(DEMO);
    const result = await runHealthAgent("Help with sleep", DEMO, { complete });
    expect(result.mode).toBe("reference");
    expect(complete).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(DEMO)).toBe(before);
  });
  it.each([
    {
      explanation: "You have insomnia and you should take medication.",
      sourceIds: ["sleep"],
    },
    {
      explanation: "Sleep quality matters as well as timing.",
      sourceIds: ["invented"],
    },
    {
      explanation: "Take 20 mg daily and you will be safe.",
      sourceIds: ["sleep"],
    },
    {
      explanation: "Visit https://evil.example for a prescription.",
      sourceIds: ["sleep"],
    },
  ])("rejects unsafe or ungrounded synthesis %#", (output) =>
    expect(() => parseEducation(JSON.stringify(output), ["sleep"])).toThrow(),
  );
  it("allows a diagnostic limitation but still rejects a diagnosis in the same answer", () => {
    expect(
      parseEducation(
        JSON.stringify({
          explanation:
            "Sleep trouble cannot be diagnosed from a chat. Keep notes for your clinician.",
          sourceIds: ["sleep"],
        }),
        ["sleep"],
      ).explanation,
    ).toContain("cannot be diagnosed");
    expect(() =>
      parseEducation(
        JSON.stringify({
          explanation: "This is not a diagnosis, but you have insomnia.",
          sourceIds: ["sleep"],
        }),
        ["sleep"],
      ),
    ).toThrow();
  });
  it("does not return an answer after cancellation", async () => {
    const controller = new AbortController();
    const complete = vi.fn(async () => {
      controller.abort();
      return '{"tools":["references"]}';
    });
    await expect(
      runHealthAgent("Sleep", DEMO, { complete, signal: controller.signal }),
    ).rejects.toThrow("Stopped");
    expect(complete).toHaveBeenCalledTimes(1);
  });
  it("retrieves Hindi and Hinglish topics", () => {
    expect(findReferences("neend kyu nahi aati")[0].id).toBe("sleep");
    expect(findReferences("दवा")[0].id).toBe("medicines");
  });
});
