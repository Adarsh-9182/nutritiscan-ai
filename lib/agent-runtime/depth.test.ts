import { describe, expect, it, vi } from "vitest";
import { findPapers } from "@/lib/evidence/pubmed";
import { searchTrials } from "@/lib/evidence/trials";
import { ArtifactSchema, RESEARCH_AGENT, RunRequestSchema } from "./contracts";
import { executeReadPlugin } from "./plugins";
import { renderBrief } from "./brief";

vi.mock("@/lib/evidence/pubmed", () => ({ findPapers: vi.fn(async () => []) }));
vi.mock("@/lib/evidence/trials", () => ({ searchTrials: vi.fn(async () => []) }));

describe("research depth and review contract", () => {
  it("bounds quick public searches and preserves standard depth for old agents", async () => {
    const signal = new AbortController().signal;
    const oldAgent = RunRequestSchema.parse({ agent: RESEARCH_AGENT, task: "sleep duration" }).agent;
    await executeReadPlugin(oldAgent, "pubmed", "sleep duration", signal);
    expect(findPapers).toHaveBeenLastCalledWith("sleep duration", { limit: 6, signal });
    await executeReadPlugin({ ...oldAgent, depth: "quick" }, "pubmed", "sleep duration", signal);
    expect(findPapers).toHaveBeenLastCalledWith("sleep duration", { limit: 3, signal });
    await executeReadPlugin({ ...oldAgent, depth: "quick" }, "trials", "sleep duration", signal);
    expect(searchTrials).toHaveBeenLastCalledWith("sleep duration", { limit: 2, signal });
    expect(RunRequestSchema.safeParse({ agent: { ...oldAgent, depth: "unlimited" }, task: "sleep duration" }).success).toBe(false);
  });
  it("rejects readable summaries with unknown citations or an incompatible mode", () => {
    const source = { id: "library:nutrition", title: "Nutrition", url: "https://medlineplus.gov/nutrition.html", kind: "reference" as const, detail: "Food needs vary." };
    const summary = { points: [{ text: "Food needs vary.", sourceIds: [source.id] }], gaps: [] };
    const artifact = { filename: "brief.md", content: "brief", sha256: "a".repeat(64), bytes: 5, sources: [source], mode: "model-assisted", expiresAt: new Date().toISOString(), summary };
    expect(ArtifactSchema.safeParse(artifact).success).toBe(true);
    expect(ArtifactSchema.safeParse({ ...artifact, mode: "source-collection" }).success).toBe(false);
    expect(ArtifactSchema.safeParse({ ...artifact, summary: { ...summary, points: [{ text: "Unverified", sourceIds: ["fake:123"] }] } }).success).toBe(false);
    const markdown = renderBrief({ agent: { ...RESEARCH_AGENT, depth: "quick" }, task: "food needs" }, [source], summary, new Date().toISOString());
    expect(markdown).toContain(`[${source.id}](${source.url})`);
    expect(markdown).toContain("1 reference notes · 0 papers · 0 registered studies");
    expect(markdown).toContain("Search depth: Quick");
  });
});
