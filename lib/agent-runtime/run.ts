import { createHash, randomUUID } from "node:crypto";
import { assessTurn } from "@/lib/safety/triage";
import { validateAnswer } from "@/lib/safety/validate";
import { emergencyResponse, mentalHealthResponse, urgentPreamble } from "@/lib/safety/templates";
import { blankProfile } from "@/lib/memory/profile";
import { PLUGINS, RunRequestSchema, SourceSchema, type AgentSource, type SearchAudit, type RunEvent, type RunRequest } from "./contracts";
import { executeReadPlugin } from "./plugins";
import { renderBrief, summarize, validateSummary } from "./brief";
import { planResearch } from "./plan";

export const RUN_LIMITS = { steps: 6, milliseconds: 45_000, sources: 13 } as const;
type Emit = (event: RunEvent) => void;
type Dependencies = {
  signal: AbortSignal;
  emit: Emit;
  read?: typeof executeReadPlugin;
  synthesize?: typeof summarize;
};

/** A budget expiry also stops waiting for a queued or misbehaving plugin. */
async function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    promise.then((value) => {
      signal.removeEventListener("abort", abort);
      resolve(value);
    }, (error) => {
      signal.removeEventListener("abort", abort);
      reject(error);
    });
  });
}

function validSource(source: AgentSource): boolean {
  if (!SourceSchema.safeParse(source).success) return false;
  const url = new URL(source.url);
  if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
  if (source.kind === "paper") return source.id.startsWith("pubmed:") && url.hostname === "pubmed.ncbi.nlm.nih.gov";
  if (source.kind === "trial") return source.id.startsWith("trials:") && url.hostname === "clinicaltrials.gov";
  return source.id.startsWith("library:") && ["medlineplus.gov", "ods.od.nih.gov"].includes(url.hostname);
}

/** The host owns the lifecycle and tool gate; model prose grants no powers. */
export async function runAgent(input: RunRequest, dependencies: Dependencies): Promise<void> {
  const runId = randomUUID();
  const deadline = Date.now() + RUN_LIMITS.milliseconds;
  const signal = AbortSignal.any([dependencies.signal, AbortSignal.timeout(RUN_LIMITS.milliseconds)]);
  const activeStep: { current: { id: string; label: string } | null } = { current: null };
  const send = (event: Omit<Extract<RunEvent, { type: "step" }>, "runId" | "at">) => {
    if (event.status !== "running" && activeStep.current?.id === event.id) activeStep.current = null;
    dependencies.emit({ ...event, runId, at: new Date().toISOString() });
  };
  let steps = 0;
  const step = (id: string, label: string) => {
    signal.throwIfAborted();
    if (++steps > RUN_LIMITS.steps) throw new Error("Step budget exhausted");
    activeStep.current = { id, label };
    send({ type: "step", id, label, status: "running", detail: "" });
  };
  try {
    const request = RunRequestSchema.parse(input);
    const { readers, stages } = planResearch(request);
    dependencies.emit({ type: "started", runId, at: new Date().toISOString(), plan: stages });
    const state = assessTurn({ text: request.task, profile: blankProfile, consultationId: runId, turn: 1 });
    if (state.triage.channel === "mental_health" || state.triage.verdict === "emergency" || state.triage.verdict === "urgent") {
      const message = state.triage.channel === "mental_health" ? mentalHealthResponse() : state.triage.verdict === "emergency" ? emergencyResponse(state) : urgentPreamble(state);
      dependencies.emit({ type: "failed", runId, at: new Date().toISOString(), message: message.slice(0, 2000) });
      return;
    }
    const sources: AgentSource[] = [];
    const searches: SearchAudit[] = [];
    const query = request.searchTerms ?? request.task;
    const retryCandidates: typeof readers = [];
    const readOne = async (id: typeof readers[number], retry = false) => {
      const label = `${PLUGINS.find((plugin) => plugin.id === id)!.name}${retry ? " (retry)" : ""}`;
      const stepId = retry ? `${id}-retry` : id;
      step(stepId, label);
      const readSignal = AbortSignal.any([signal, AbortSignal.timeout(retry ? 6_000 : 8_000)]);
      let result: AgentSource[];
      try {
        result = await abortable((dependencies.read ?? executeReadPlugin)(request.agent, id, query, readSignal), readSignal);
      } catch {
        signal.throwIfAborted();
        searches.push({ plugin: id, query, status: "failed", returned: 0, retry });
        send({ type: "step", id: stepId, label, status: "failed", detail: "This source could not be read. Other permitted sources will still be used." });
        if (!retry && id !== "library") retryCandidates.push(id);
        return;
      }
      signal.throwIfAborted();
      if (!result.every(validSource)) throw new Error("Plugin returned invalid source provenance");
      searches.push({ plugin: id, query, status: result.length ? "done" : "empty", returned: result.length, retry });
      for (const source of result) if (!sources.some((existing) => existing.id === source.id)) sources.push(source);
      if (sources.length > RUN_LIMITS.sources) throw new Error("Source budget exhausted");
      send({ type: "step", id: stepId, label, status: result.length ? "done" : "empty", detail: result.length ? `${result.length} sources retrieved` : "No results returned. This source may be unavailable or need different search terms." });
      if (!result.length && !retry && id !== "library") retryCandidates.push(id);
    };
    for (const id of readers) await readOne(id);
    // Exactly one read-only recovery attempt; reserve time for synthesis and validation.
    if (retryCandidates.length && deadline - Date.now() > 19_000) await readOne(retryCandidates[0], true);
    if (!sources.length) {
      dependencies.emit({ type: "failed", runId, at: new Date().toISOString(), message: "No sources were returned. Try a more specific question or enable another source plugin. A source may also be temporarily unavailable." });
      return;
    }
    step("draft", "Prepare brief");
    const candidate = await abortable((dependencies.synthesize ?? summarize)(request, sources, signal, {
      searches,
      milliseconds: Math.max(1, deadline - Date.now() - 2_000),
      onAttempt: (attempt) => send({ type: "step", id: "draft", label: "Prepare brief", status: "running", detail: attempt === 1 ? "Preparing a source-linked summary" : "Trying another configured model within the same time budget" }),
    }), signal);
    const cited = candidate ? validateSummary(candidate, sources) : null;
    const summary = cited && !validateAnswer([...cited.points.map((point) => point.text), ...cited.gaps].join("\n"), state).blocked ? cited : null;
    send({ type: "step", id: "draft", label: "Prepare brief", status: "done", detail: summary ? "Model-assisted summary prepared from retrieved sources" : "Source collection prepared; no model-assisted summary is included" });
    step("validate", "Validate artifact");
    const at = new Date().toISOString();
    const content = renderBrief(request, sources, summary, at, searches);
    const bytes = Buffer.byteLength(content, "utf8");
    if (bytes > 400000 || content.length > 100000) throw new Error("Artifact budget exhausted");
    const sha256 = createHash("sha256").update(content, "utf8").digest("hex");
    send({ type: "step", id: "validate", label: "Validate artifact", status: "done", detail: "Source IDs checked; file size and SHA-256 fingerprint verified" });
    signal.throwIfAborted();
    dependencies.emit({ type: "approval", runId, at, artifact: {
      filename: `research-brief-${runId.slice(0, 8)}.md`, content, sha256, bytes, sources,
      mode: summary ? "model-assisted" : "source-collection",
      summary: summary ?? undefined, searches,
      expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    } });
  } catch {
    // Finish the active row too, so failed/stopped runs never keep pulsing.
    if (activeStep.current) send({ type: "step", ...activeStep.current, status: dependencies.signal.aborted ? "cancelled" : "failed", detail: dependencies.signal.aborted ? "Stopped before completion" : "This step did not complete" });
    dependencies.emit(dependencies.signal.aborted
      ? { type: "cancelled", runId, at: new Date().toISOString() }
      : { type: "failed", runId, at: new Date().toISOString(), message: signal.aborted ? "The run reached its time limit. Try a narrower question or fewer plugins." : "The run could not be completed. No file was exported. Please try again." });
  }
}
