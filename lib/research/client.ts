import { z } from "zod";
import { ResearchChatRequest, ResearchEvent, ResearchResult, type ResearchReply, type ResearchStreamEvent } from "./contracts";
import { SourceReviewsSchema, sourceReviewText, type SourceReview } from "./source-review";
import { EvidenceBriefSchema } from "./brief";
import { StudyProtocolSchema, protocolText, type StudyProtocol } from "./protocol";

export const ResearchTurnSchema = z.object({
  id: z.string().max(80), request: ResearchChatRequest.omit({ history: true }),
  phase: z.enum(["working", "done", "stopped", "failed"]),
  reply: ResearchResult.nullable(), error: z.string().max(1000).optional(),
  sourceReviews: SourceReviewsSchema.optional(),
  briefs: z.array(EvidenceBriefSchema).max(2).optional(),
  protocol: StudyProtocolSchema.optional(),
}).strict().superRefine((turn, context) => {
  for (const review of turn.sourceReviews ?? []) {
    if (turn.phase !== "done" || !turn.reply?.sources.some((source) => source.id === review.sourceId)) {
      context.addIssue({ code: "custom", path: ["sourceReviews"], message: "Source decisions must refer to this completed research result." });
    }
  }
  if (new Set(turn.briefs?.map((b) => b.id)).size !== (turn.briefs?.length ?? 0)) context.addIssue({ code: "custom", path: ["briefs"], message: "Brief versions must have distinct IDs." });
  for (const brief of turn.briefs ?? []) {
    if (turn.phase !== "done" || brief.question !== turn.request.message || brief.selectedIds.some((id) => !turn.reply?.sources.some((s) => s.id === id))) context.addIssue({ code: "custom", path: ["briefs"], message: "Briefs must belong to this question and its retrieved sources." });
  }
  if (turn.protocol && (turn.phase !== "done" || turn.protocol.originQuestion !== turn.request.message || turn.protocol.sourceIds.some((id) => !turn.reply?.sources.some((source) => source.id === id)))) {
    context.addIssue({ code: "custom", path: ["protocol"], message: "A study protocol must belong to this question and its retrieved sources." });
  }
});
export type ResearchTurn = z.infer<typeof ResearchTurnSchema>;
export const ResearchThreadSchema = z.object({
  id: z.string().max(80), title: z.string().max(160), query: z.string().max(700),
  updatedAt: z.number(), turns: z.array(ResearchTurnSchema).max(12),
  importedAt: z.iso.datetime().optional(),
}).strict();
export type ResearchThread = z.infer<typeof ResearchThreadSchema>;
export const ResearchStored = z.object({ version: z.literal(1), activeId: z.string().nullable(), threads: z.array(ResearchThreadSchema).max(8) }).strict();
export const RESEARCH_STORAGE = "ns-research-chat-v1";
/** Event-time clock, kept outside React render/state updaters. */
export const researchTimestamp = () => Date.now();

export function readResearch() {
  const raw = localStorage.getItem(RESEARCH_STORAGE);
  if (!raw) return { version: 1 as const, activeId: null, threads: [] as ResearchThread[] };
  if (new TextEncoder().encode(raw).length > 1_000_000) throw new Error("Saved research exceeds the storage limit.");
  const value = ResearchStored.parse(JSON.parse(raw));
  value.threads.forEach((thread) => thread.turns.forEach((turn) => {
    if (turn.phase === "working") { turn.phase = "stopped"; turn.reply = null; turn.error = "This run was interrupted. Retry the question to perform a fresh search."; }
  }));
  return value;
}

export function saveResearch(threads: ResearchThread[], activeId: string | null) {
  const raw = JSON.stringify(ResearchStored.parse({ version: 1, activeId, threads }));
  if (new TextEncoder().encode(raw).length > 1_000_000) throw new Error("Research is open in this tab, but device storage is full. Export your work before closing.");
  localStorage.setItem(RESEARCH_STORAGE, raw);
}

export function replyText(reply: ResearchReply): string {
  const lines = [reply.status === "model-assisted" ? "Research draft — researcher review required" : "Source collection — no model answer", reply.notice];
  if (reply.model) lines.push(`Model: ${reply.model}`);
  if (reply.reviewModel) lines.push(`Source-review model: ${reply.reviewModel}`);
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

export function researchExport(request: ResearchTurn["request"], reply: ResearchReply, reviews: SourceReview[] = [], importedAt?: string, protocol?: StudyProtocol) {
  const included = reviews.filter((review) => review.decision === "include").map((review) => review.sourceId);
  return `NutritiScan research draft${importedAt ? " — imported backup; sources and AI checks have not been revalidated" : ""}\n\nQuestion: ${request.message}\nMode: ${request.mode}\nSearch: ${request.searchMode === "manual" ? request.query : "Automatic, adapted to this question"}\n\n${replyText(reply)}\n\n${sourceReviewText(reply, reviews)}${protocol ? `\n\n${protocolText(protocol, reply, included, Boolean(importedAt))}` : ""}`;
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
