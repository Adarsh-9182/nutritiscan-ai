import { describe, expect, it, vi } from "vitest";
import { DEMO } from "./demo";
import { runHealthAgent, parseEducation } from "./health-agent";
import { mentionsMedicines } from "./medicine-boundary";
import { recordAnswer } from "./record-tools";

describe("medicine information boundary", () => {
  it.each([
    "What are the side effects of my tablets?",
    "Can I take metformin with another drug?",
    "remind me to take vitamin D every day at 9am",
    "dawaiyon ke baare mein batao",
    "कौन सी दवा लेनी चाहिए?",
    "what treatment should I start?",
  ])("refuses %s before any model or draft runs", async (question) => {
    const complete = vi.fn();
    const consult = vi.fn();
    const reply = await runHealthAgent(question, DEMO, { complete, consult });
    expect(reply.mode).toBe("unavailable");
    expect(reply.sources).toEqual([]);
    expect(reply.draftReminder).toBeUndefined();
    expect(reply.draftLog).toBeUndefined();
    expect(complete).not.toHaveBeenCalled();
    expect(consult).not.toHaveBeenCalled();
  });

  it("also blocks direct record tools and ambiguous medicine follow-ups", async () => {
    expect(recordAnswer("Summarise my reports and my medications", DEMO)?.mode).toBe("unavailable");
    const consult = vi.fn();
    const reply = await runHealthAgent("And what about it?", DEMO, {
      history: ["Can I take metformin?"],
      consult,
    });
    expect(reply.mode).toBe("unavailable");
    expect(consult).not.toHaveBeenCalled();
  });

  it("blocks medicine names saved in a person's own profile", async () => {
    const workspace = structuredClone(DEMO);
    workspace.profile.medicines = "Levothyroxine daily";
    expect(mentionsMedicines("Tell me about levothyroxine", workspace.profile)).toBe(true);
    expect((await runHealthAgent("Tell me about levothyroxine", workspace)).mode).toBe("unavailable");
  });

  it("does not mistake food-source education for a medicine request", () => {
    expect(mentionsMedicines("Which foods contain vitamin B12?", DEMO.profile)).toBe(false);
  });

  it("rejects an unexpected medicine claim from an otherwise covered model answer", () => {
    expect(() => parseEducation(JSON.stringify({
      explanation: "You can ask about metformin and its side effects.",
      sourceIds: ["sleep"],
    }), ["sleep"])).toThrow();
  });
});
