import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { consumeRun, verifiedArtifactBlob } from "./client";
import type { AgentArtifact, RunEvent } from "./contracts";

const runId = "8d7983ed-d3d5-4c4c-8c94-14a1b65e97e1";
const at = "2026-10-13T10:00:00.000Z";
const started = { type: "started", runId, at, plan: ["Read sources"] };
const failed = { type: "failed", runId, at, message: "No sources returned" };
const response = (parts: string[]) => new Response(new ReadableStream({ start(controller) { for (const part of parts) controller.enqueue(new TextEncoder().encode(part)); controller.close(); } }));
const artifact = (): AgentArtifact => {
  const content = "# Reviewed brief\n";
  return { filename: "research-brief-test.md", content, sha256: createHash("sha256").update(content).digest("hex"), bytes: Buffer.byteLength(content), sources: [], mode: "source-collection", expiresAt: new Date(Date.now() + 60000).toISOString() };
};

describe("run stream", () => {
  it("decodes records split across network chunks", async () => {
    const text = `${JSON.stringify(started)}\n${JSON.stringify(failed)}\n`;
    const events: RunEvent[] = [];
    await consumeRun(response([text.slice(0, 20), text.slice(20, 85), text.slice(85)]), (event) => events.push(event));
    expect(events.map((event) => event.type)).toEqual(["started", "failed"]);
  });
  it("treats an interrupted stream as failure", async () => {
    await expect(consumeRun(response([`${JSON.stringify(started)}\n`]), () => {})).rejects.toThrow("before the run completed");
  });
  it("rejects events from another run", async () => {
    await expect(consumeRun(response([`${JSON.stringify(started)}\n${JSON.stringify({ ...failed, runId: "608d19eb-55bf-4346-b970-0cbe494a89ef" })}\n`]), () => {})).rejects.toThrow("inconsistent");
  });
});

describe("exact artifact approval", () => {
  it("verifies the reviewed file's bytes before export", async () => {
    const expected = artifact();
    const blob = await verifiedArtifactBlob(expected);
    expect(blob.size).toBe(expected.bytes);
    expect(await blob.text()).toBe(expected.content);
  });
  it("rejects changed content and byte counts", async () => {
    await expect(verifiedArtifactBlob({ ...artifact(), content: "Changed after review" })).rejects.toThrow("does not match");
    await expect(verifiedArtifactBlob({ ...artifact(), bytes: 1 })).rejects.toThrow("does not match");
  });
  it("rejects expired approvals", async () => {
    await expect(verifiedArtifactBlob({ ...artifact(), expiresAt: "2020-01-01T00:00:00.000Z" })).rejects.toThrow("expired");
  });
});
