import { z } from "zod";
import { ResearchChatRequest, ResearchEvent, ResearchResult, type ResearchReply, type ResearchStreamEvent } from "./contracts";

export const ResearchTurnSchema = z.object({
  id: z.string().max(80), request: ResearchChatRequest.omit({ history: true }),
  phase: z.enum(["working", "done", "stopped", "failed"]),
  reply: ResearchResult.nullable(), error: z.string().max(1000).optional(),
}).strict();
export type ResearchTurn = z.infer<typeof ResearchTurnSchema>;
export const ResearchThreadSchema = z.object({
  id: z.string().max(80), title: z.string().max(160), query: z.string().max(700),
  updatedAt: z.number(), turns: z.array(ResearchTurnSchema).max(12),
}).strict();
export type ResearchThread = z.infer<typeof ResearchThreadSchema>;
const Stored = z.object({ version: z.literal(1), activeId: z.string().nullable(), threads: z.array(ResearchThreadSchema).max(8) }).strict();
export const RESEARCH_STORAGE = "ns-research-chat-v1";
/** Event-time clock, kept outside React render/state updaters. */
export const researchTimestamp = () => Date.now();

export function readResearch() {
  const raw = localStorage.getItem(RESEARCH_STORAGE);
  if (!raw) return { version: 1 as const, activeId: null, threads: [] as ResearchThread[] };
  if (new TextEncoder().encode(raw).length > 1_000_000) throw new Error("Saved research exceeds the storage limit.");
  const value = Stored.parse(JSON.parse(raw));
  value.threads.forEach((thread) => thread.turns.forEach((turn) => {
    if (turn.phase === "working") { turn.phase = "stopped"; turn.reply = null; turn.error = "This run was interrupted. Retry the question to perform a fresh search."; }
  }));
  return value;
}

export function saveResearch(threads: ResearchThread[], activeId: string | null) {
  const raw = JSON.stringify(Stored.parse({ version: 1, activeId, threads }));
  if (new TextEncoder().encode(raw).length > 1_000_000) throw new Error("Research is open in this tab, but device storage is full. Export your work before closing.");
  localStorage.setItem(RESEARCH_STORAGE, raw);
}

export function replyText(reply: ResearchReply): string {
  const lines = [reply.status === "model-assisted" ? "Research draft — researcher review required" : "Source collection — no model answer", reply.notice];
  if (reply.model) lines.push(`Model: ${reply.model}`);
  for (const finding of reply.answer?.findings ?? []) lines.push(`${finding.text} [${finding.sourceIds.join(", ")}]`, ...finding.excerpts.map((e) => `Quoted passage [${e.sourceId}]: ${e.quote}`));
  for (const h of reply.answer?.hypotheses ?? []) lines.push(`Untested hypothesis: ${h.title}\nRationale: ${h.rationale}\nPrediction: ${h.prediction}\nAlternative: ${h.alternative}\nFalsification: ${h.falsification}\nSources: ${h.sourceIds.join(", ")}`);
  if (reply.answer?.plan.length) lines.push("Proposed study plan — not executed", ...reply.answer.plan.map((p, i) => `${i + 1}. ${p}`));
  if (reply.answer) lines.push("Limitations", ...reply.answer.limitations);
  if (reply.searches?.length) lines.push("Executed searches", ...reply.searches.map((s) => `${s.source}: ${s.query}\nStrategy: ${s.strategy}; status: ${s.status}; records: ${s.count}${s.error ? `; issue: ${s.error}` : ""}`));
  if (reply.diagnostics?.length) lines.push("Run issues", ...reply.diagnostics.map((d) => `${d.stage}: ${d.code}${d.model ? ` (${d.model})` : ""}`));
  if (reply.metrics) lines.push(`Model requests: ${reply.metrics.modelCalls}; reported input tokens: ${reply.metrics.inputTokens}; reported output tokens: ${reply.metrics.outputTokens}; duration: ${reply.metrics.durationMs} ms. Token counts exclude failed responses without usage data.`);
  lines.push(`Retrieved: ${reply.retrievedAt}`, ...reply.sources.map((s) => `${s.id}: ${s.title}\n${s.url}`));
  return lines.join("\n\n");
}

export function researchExport(request: ResearchTurn["request"], reply: ResearchReply) {
  return `NutritiScan research draft\n\nQuestion: ${request.message}\nMode: ${request.mode}\nSearch: ${request.searchMode === "manual" ? request.query : "Automatic, adapted to this question"}\n\n${replyText(reply)}`;
}

/** Bounded NDJSON consumer: an interrupted stream never becomes a completed turn. */
export async function consumeResearch(response: Response, emit: (event: ResearchStreamEvent) => void) {
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: unknown };
    throw new Error(typeof body.error === "string" ? body.error : "Research could not start. Please retry.");
  }
  if (!response.body) throw new Error("The research response was empty.");
  const reader = response.body.getReader(); const decoder = new TextDecoder();
  let buffer = "", bytes = 0, count = 0, terminal = false;
  const accept = (line: string) => {
    if (!line.trim()) return;
    if (terminal || ++count > 32) throw new Error("The research stream was inconsistent.");
    const event = ResearchEvent.parse(JSON.parse(line)); terminal = event.type !== "step"; emit(event);
  };
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      bytes += value.byteLength; if (bytes > 600_000) throw new Error("The research response exceeded its size limit.");
      buffer += decoder.decode(value, { stream: true });
      let newline: number;
      while ((newline = buffer.indexOf("\n")) >= 0) { accept(buffer.slice(0, newline)); buffer = buffer.slice(newline + 1); }
    }
    buffer += decoder.decode(); accept(buffer);
    if (!terminal) throw new Error("The connection ended before research completed. Retry to run a fresh search.");
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  finally { reader.releaseLock(); }
}
