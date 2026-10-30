import { afterAll, describe, expect, it } from "vitest";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import benchmark from "./data/research-benchmark.json";
import { ResearchChatRequest } from "../lib/research/contracts";
import { consumeResearch } from "../lib/research/client";
import type { ResearchReply } from "../lib/research/contracts";

// Explicit opt-in: this sends public benchmark prompts to the deployed provider.
// Run sequentially to avoid manufacturing a simultaneous-request quota failure.
const enabled = process.env.RESEARCH_EVAL_LIVE === "1" && process.env.EVAL_GATE_ONLY !== "1";
const base = new URL(process.env.RESEARCH_EVAL_URL ?? "https://www.nutritiscan.com");
if (!["www.nutritiscan.com", "localhost", "127.0.0.1"].includes(base.hostname)) throw new Error("Research benchmark destination must be NutritiScan or localhost.");
const results: unknown[] = [];
let lastStartedAt = 0;
const cases = benchmark.cases.filter((c) => !process.env.RESEARCH_CASE || c.id === process.env.RESEARCH_CASE);
const normalize = (s: string) => s.replace(/\s+/g, " ").trim();

afterAll(async () => {
  if (!enabled) return;
  const path = process.env.RESEARCH_EVAL_OUTPUT ?? join(tmpdir(), "nutritiscan-research-benchmark.json");
  await writeFile(path, JSON.stringify({ at: new Date().toISOString(), destination: base.origin, scientificReview: benchmark.scientificReview, results }, null, 2));
  console.log(`Research benchmark report: ${path}. Domain-expert scientific review is pending.`);
});

describe.skipIf(!enabled).sequential("live research benchmark — structural checks only", () => {
  for (const item of cases) it(item.id, async () => {
    // Respect this endpoint's five requests/minute limit even for fast replies.
    const wait = 13_000 - (Date.now() - lastStartedAt);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastStartedAt = Date.now();
    const request = ResearchChatRequest.parse(item.request);
    const started = Date.now();
    let reply: ResearchReply | undefined;
    const response = await fetch(new URL("/api/research/chat", base), { method: "POST", headers: { origin: base.origin, "content-type": "application/json" }, body: JSON.stringify(request), signal: AbortSignal.timeout(70_000) });
    await consumeResearch(response, (e) => { if (e.type === "result") reply = e.result; if (e.type === "error") throw new Error(e.error); });
    results.push({ id: item.id, durationMs: Date.now() - started, reply, referenceUrls: item.referenceUrls, reviewQuestions: item.reviewQuestions, scientificReview: "pending" });
    expect(reply, "A complete terminal result is required").toBeDefined();
    if (!reply) return;
    expect(reply.sources.length, "At least one source should be retrieved for this known research topic").toBeGreaterThan(0);
    for (const id of "expectedSourceIds" in item ? item.expectedSourceIds ?? [] : []) expect(reply.sources.map((s) => s.id)).toContain(id);
    expect(reply.status, JSON.stringify(reply.diagnostics)).toBe("model-assisted");
    const answer = reply.answer;
    expect(answer).not.toBeNull();
    if (!answer) return;
    for (const finding of answer.findings) {
      for (const id of finding.sourceIds) expect(finding.excerpts.some((e) => e.sourceId === id)).toBe(true);
      for (const excerpt of finding.excerpts) {
        const source = reply.sources.find((s) => s.id === excerpt.sourceId);
        expect(source).toBeDefined(); expect(finding.sourceIds).toContain(excerpt.sourceId);
        expect(normalize(source?.detail ?? "")).toContain(normalize(excerpt.quote));
      }
    }
    if (request.mode === "hypotheses") expect(answer.hypotheses.length).toBeGreaterThan(0);
    if (request.mode === "study-plan") expect(answer.plan.length).toBeGreaterThanOrEqual(3);
    expect(reply.searches?.every((s) => request.sources.includes(s.source))).toBe(true);
  }, 75_000);
});
