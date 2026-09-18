import { describe, expect, it, vi } from "vitest";
import { toHealthProfile } from "./supervisor";
import { runHealthAgent } from "./health-agent";
import { memoryContext } from "../memory/profile";
import { DEMO } from "./demo";
import type { Workspace } from "./types";

const expert = () =>
  vi.fn().mockResolvedValue({ text: "A specialist explanation.", steps: ["Consulted the Doctor Agent (educational)"] });

describe("translating the workspace for the specialist team", () => {
  it("carries confirmed values across as biomarkers with their own lab range", () => {
    const profile = toHealthProfile(DEMO);
    expect(profile.biomarkers.length).toBeGreaterThan(0);
    const first = profile.biomarkers[0];
    expect(first.value).toMatch(/\d/);
    expect(first.note).toContain("range");
  });
  it("splits the workspace's free-text fields into lists", () => {
    const workspace: Workspace = {
      ...DEMO,
      profile: { ...DEMO.profile, medicines: "Metformin 500\nThyronorm", allergies: "", conditions: "Type 2 diabetes" },
    };
    const profile = toHealthProfile(workspace);
    expect(profile.medicines).toEqual(["Metformin 500", "Thyronorm"]);
    expect(profile.conditions).toEqual(["Type 2 diabetes"]);
    expect(profile.allergies).toEqual([]);
  });
  it("never invents a body the person did not record", () => {
    const rendered = memoryContext(toHealthProfile(DEMO));
    expect(rendered).toContain("Height/Weight: not recorded");
    expect(rendered).not.toMatch(/BMI \d/);
  });
  it("excludes reports the person closed to the companion", () => {
    const closed: Workspace = {
      ...DEMO,
      reports: DEMO.reports.map((r) => ({ ...r, assistantAccess: false })),
    };
    expect(toHealthProfile(closed).biomarkers).toEqual([]);
  });
  it("claims a sleep average only once there is a week to average", () => {
    expect(toHealthProfile({ ...DEMO, days: [] }).sleepHours).toBe(0);
  });
});

describe("the specialist team runs behind every deterministic gate", () => {
  it.each([
    ["an emergency", "I have crushing chest pain and cannot breathe"],
    ["a dose request", "What dose of paracetamol should I take?"],
  ])("never reaches the team for %s", async (_label, question) => {
    const team = expert();
    await runHealthAgent(question, DEMO, { expert: team });
    expect(team).not.toHaveBeenCalled();
  });
  it("answers a saved-record question without the team", async () => {
    const team = expert();
    const reply = await runHealthAgent("Summarise my report", DEMO, { expert: team });
    expect(reply.mode).toBe("record-summary");
    expect(team).not.toHaveBeenCalled();
  });
  it("answers an education question with the team, and says so", async () => {
    const team = expert();
    const reply = await runHealthAgent("How can I understand my sleep?", DEMO, {
      expert: team,
      engineLabel: "NutritiScan AI · experimental",
    });
    expect(team).toHaveBeenCalledOnce();
    expect(reply.mode).toBe("ai");
    expect(reply.text).toBe("A specialist explanation.");
    expect(reply.steps).toContain("Consulted the Doctor Agent (educational)");
    expect(reply.detail).toBe("NutritiScan AI · experimental");
  });
  it("answers topics the eight curated notes never covered", async () => {
    const team = expert();
    const reply = await runHealthAgent("mera BP high rehta hai, kya karun", DEMO, { expert: team });
    expect(team).toHaveBeenCalledOnce();
    expect(reply.mode).toBe("ai");
  });
  it("falls back to the reference notes when the team cannot answer", async () => {
    const team = vi.fn().mockRejectedValue(new Error("quota exhausted"));
    const reply = await runHealthAgent("How can I understand my sleep?", DEMO, { expert: team });
    expect(team).toHaveBeenCalledOnce();
    expect(reply.mode).toBe("reference");
    expect(reply.sources[0].url).toContain("medlineplus.gov");
  });
  it("stops rather than answering when the person cancels", async () => {
    const controller = new AbortController();
    const team = vi.fn(async () => {
      controller.abort();
      throw new Error("cancelled mid-flight");
    });
    await expect(
      runHealthAgent("How can I understand my sleep?", DEMO, { expert: team, signal: controller.signal }),
    ).rejects.toThrow("Stopped");
  });
});
