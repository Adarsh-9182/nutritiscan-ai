import type { ResearchDiagnostic } from "./contracts";

export type ResearchTrace = { startedAt: number; diagnostics: ResearchDiagnostic[]; modelCalls: number; inputTokens: number; outputTokens: number; reviewFeedback?: string };
export const newTrace = (): ResearchTrace => ({ startedAt: Date.now(), diagnostics: [], modelCalls: 0, inputTokens: 0, outputTokens: 0 });

export function failureCode(error: unknown): ResearchDiagnostic["code"] {
  const e = error as { name?: string; statusCode?: number; code?: string } | null;
  if (["quota", "timeout", "unavailable", "invalid-response"].includes(e?.code ?? "")) return e!.code as ResearchDiagnostic["code"];
  if (e?.statusCode === 429) return "quota";
  if ([401, 403, 404].includes(e?.statusCode ?? 0)) return "access";
  if (e?.name === "TimeoutError" || e?.name === "AbortError") return "timeout";
  if (["AI_NoObjectGeneratedError", "AI_TypeValidationError", "AI_JSONParseError"].includes(e?.name ?? "") || e?.statusCode === 400) return "invalid-response";
  return "unavailable";
}

export function recordIssue(trace: ResearchTrace, issue: ResearchDiagnostic) {
  if (trace.diagnostics.length < 12) trace.diagnostics.push(issue);
  // Never log prompts, source text, keys, upstream bodies or exception messages.
  console.warn(JSON.stringify({ event: "research_issue", ...issue }));
}

export function recordUsage(trace: ResearchTrace, usage?: { inputTokens?: number; outputTokens?: number }) {
  trace.inputTokens += usage?.inputTokens ?? 0;
  trace.outputTokens += usage?.outputTokens ?? 0;
}
