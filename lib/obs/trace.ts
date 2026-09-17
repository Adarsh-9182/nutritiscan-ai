import { createHash, randomUUID } from "node:crypto";

// ============================================================
// ONE TRACE PER CHAT TURN
//
// A trace is a single structured JSON log line: timings, counts,
// identifiers. It must never carry health content — no message
// text, no report text, no matched phrases. The field whitelist
// and the value checks in `set` are what enforce that, not caller
// discipline.
// ============================================================

export type Channel = "web" | "telegram" | "cron";

export type Outcome =
  | "answered"
  | "escalated"
  | "deterministic"
  | "guarded"
  | "error"
  | "rate_limited"
  | "aborted";

export type TraceFields = {
  channel: Channel;
  signedIn: boolean;
  provider: string;
  model: string;
  fallbackUsed: boolean;
  promptChars: number;
  outputChars: number;
  inputTokens: number;
  outputTokens: number;
  historyTurns: number;
  reportsInContext: number;
  guardRule: string;
  language: "en" | "hinglish" | "hi";
};

export type TraceRecord = {
  traceId: string;
  name: string;
  startedAt: string;
  durationMs: number;
  stages: Record<string, number>;
  outcome: Outcome;
  errorCode?: string;
} & Partial<TraceFields>;

export type Trace = {
  mark(stage: string): void;
  set(fields: Partial<TraceFields>): void;
  end(outcome: Outcome, errorCode?: string): TraceRecord;
};

type FieldKind = "string" | "number" | "boolean" | readonly string[];

const FIELD_KINDS: Record<keyof TraceFields, FieldKind> = {
  channel: ["web", "telegram", "cron"],
  signedIn: "boolean",
  provider: "string",
  model: "string",
  fallbackUsed: "boolean",
  promptChars: "number",
  outputChars: "number",
  inputTokens: "number",
  outputTokens: "number",
  historyTurns: "number",
  reportsInContext: "number",
  guardRule: "string",
  language: ["en", "hinglish", "hi"],
};

const OUTCOMES: readonly Outcome[] = [
  "answered",
  "escalated",
  "deterministic",
  "guarded",
  "error",
  "rate_limited",
  "aborted",
];

const MAX_TEXT = 64;

// DEFENCE AGAINST CONTENT LEAKS: free-text fields accept only
// identifier-shaped values (letters, digits, . _ : / -). A sentence
// has spaces, so if someone passes message text as `model` or
// `guardRule` it is dropped entirely rather than logged. Values that
// pass are then capped at 64 chars.
const SAFE_TEXT = /^[a-z0-9._:/-]+$/i;

function cleanText(value: unknown): string | undefined {
  if (typeof value !== "string" || !SAFE_TEXT.test(value)) return undefined;
  return value.slice(0, MAX_TEXT);
}

function cleanValue(kind: FieldKind, value: unknown): unknown {
  if (Array.isArray(kind)) {
    return typeof value === "string" && kind.includes(value)
      ? value
      : undefined;
  }
  switch (kind) {
    case "string":
      return cleanText(value);
    case "number":
      return typeof value === "number" && Number.isFinite(value) && value >= 0
        ? Math.round(value)
        : undefined;
    case "boolean":
      return typeof value === "boolean" ? value : undefined;
    default:
      return undefined;
  }
}

function defaultSink(record: TraceRecord): void {
  console.info("[trace]", JSON.stringify(record));
}

export function startTrace(
  name: string,
  sink: (record: TraceRecord) => void = defaultSink,
): Trace {
  const t0 = performance.now();
  const startedAt = new Date().toISOString();
  const traceId = randomUUID();
  const traceName = cleanText(name) ?? "unnamed";
  const stages: Record<string, number> = {};
  const fields: Partial<Record<keyof TraceFields, unknown>> = {};
  let finished: TraceRecord | undefined;

  const elapsed = () => Math.max(0, Math.round(performance.now() - t0));

  return {
    mark(stage) {
      if (finished) return;
      const key = cleanText(stage);
      if (key) stages[key] = elapsed();
    },

    set(input) {
      if (finished || !input || typeof input !== "object") return;
      for (const [key, value] of Object.entries(input)) {
        if (!Object.hasOwn(FIELD_KINDS, key)) continue;
        const field = key as keyof TraceFields;
        const clean = cleanValue(FIELD_KINDS[field], value);
        if (clean !== undefined) fields[field] = clean;
      }
    },

    end(outcome, errorCode) {
      if (finished) return finished;
      try {
        const record: TraceRecord = {
          ...(fields as Partial<TraceFields>),
          traceId,
          name: traceName,
          startedAt,
          durationMs: 0,
          stages: { ...stages },
          outcome: OUTCOMES.includes(outcome) ? outcome : "error",
        };
        const code = cleanText(errorCode);
        if (code) record.errorCode = code;
        const lastStage = Math.max(0, ...Object.values(stages));
        record.durationMs = Math.max(elapsed(), lastStage);
        finished = record;
      } catch {
        finished = {
          traceId,
          name: traceName,
          startedAt,
          durationMs: 0,
          stages: {},
          outcome: "error",
        };
      }
      try {
        sink(finished);
      } catch {
        // Telemetry must never break a chat turn.
      }
      return finished;
    },
  };
}

export function hashId(id: string): string {
  return createHash("sha256")
    .update("ns-trace:" + id)
    .digest("hex")
    .slice(0, 16);
}
