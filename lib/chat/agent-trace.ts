const TOOL_MAP: Record<string, string> = {
  asknutritionagent: "nutrition", askfitnessagent: "fitness", askdoctoragent: "doctor", asklabagent: "lab", askcoachagent: "coach",
};
const AGENTS = new Set(["nutrition", "fitness", "doctor", "lab", "coach", "supervisor"]);
type Part = { type?: string; state?: string; data?: { mode?: string; agents?: string[]; done?: boolean } };
export type AgentTrace = { agents: string[]; done: boolean; source: "direct" | "tools" };
const partsOf = (m: { parts: unknown[] }) => m.parts.filter((p): p is Part => !!p && typeof p === "object" && "type" in p && typeof p.type === "string");
export function answerMode(m: { parts: unknown[] }) {
  return partsOf(m).filter((p) => p.type === "data-mode").at(-1)?.data?.mode;
}
export function tracesFor(m: { parts: unknown[] }): AgentTrace | null {
  const mode = answerMode(m);
  // Old reference messages can contain simulated consultation traces. Never
  // render those, or failed model attempts, as consultations behind this answer.
  if (mode === "demo" || mode === "safety") return null;
  const parts = partsOf(m);
  const tools = parts.filter((p) => p.type?.startsWith("tool-ask") && ["input-available", "output-available"].includes(p.state ?? ""));
  const agents = [...new Set(tools.map((p) => TOOL_MAP[p.type!.slice(5).toLowerCase()]).filter(Boolean))];
  if (agents.length) return { agents, done: tools.every((p) => p.state === "output-available"), source: "tools" };
  // A completed model response acknowledges a directly routed specialist.
  // A legacy data-trace without mode metadata cannot establish a model call.
  if (mode !== "model") return null;
  const trace = parts.filter((p) => p.type === "data-trace").at(-1)?.data;
  const direct = [...new Set((Array.isArray(trace?.agents) ? trace.agents : []).filter((id) => AGENTS.has(id)))];
  return direct.length ? { agents: direct, done: !!trace?.done, source: "direct" } : null;
}
