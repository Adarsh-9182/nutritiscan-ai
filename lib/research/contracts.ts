import { z } from "zod";
import { SourceSchema } from "@/lib/agent-runtime/contracts";

export const ResearchMode = z.enum(["evidence", "hypotheses", "study-plan"]);
export const ResearchChatRequest = z.object({
  message: z.string().trim().min(3).max(2000),
  query: z.string().trim().min(3).max(300),
  mode: ResearchMode,
  sources: z.array(z.enum(["pubmed", "trials"])).min(1).max(2).refine((v) => new Set(v).size === v.length),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) }).strict()).max(8),
}).strict();
export type ResearchRequest = z.infer<typeof ResearchChatRequest>;

const ids = z.array(z.string().max(80)).min(1).max(3);
export const ScientistDraft = z.object({
  findings: z.array(z.object({
    text: z.string().min(1).max(900), sourceIds: ids,
    excerpts: z.array(z.object({ sourceId: z.string().max(80), quote: z.string().min(15).max(500) }).strict()).min(1).max(3),
  }).strict()).min(1).max(6),
  hypotheses: z.array(z.object({
    title: z.string().min(1).max(250), rationale: z.string().min(1).max(700),
    prediction: z.string().min(1).max(500), alternative: z.string().min(1).max(500),
    falsification: z.string().min(1).max(500), sourceIds: ids,
  }).strict()).max(3),
  plan: z.array(z.string().min(1).max(700)).max(7),
  limitations: z.array(z.string().min(1).max(700)).min(1).max(6),
}).strict();
export type ScientistOutput = z.infer<typeof ScientistDraft>;

export const ResearchResult = z.object({
  sources: z.array(SourceSchema).max(10),
  answer: ScientistDraft.nullable(),
  model: z.string().max(100).nullable(),
  status: z.enum(["model-assisted", "sources-only"]),
  notice: z.string().max(1000),
  coverage: z.array(z.object({ source: z.enum(["pubmed", "trials"]), status: z.enum(["done", "empty", "failed"]), count: z.number().int().min(0).max(10) }).strict()).max(2),
  retrievedAt: z.string().datetime(),
}).strict().refine((value) => value.status === "model-assisted" ? Boolean(value.answer && value.model) : value.answer === null && value.model === null, "Research mode must match the actual model result.");
export type ResearchReply = z.infer<typeof ResearchResult>;

export const ResearchEvent = z.discriminatedUnion("type", [
  z.object({ type: z.literal("step"), text: z.string().max(300) }).strict(),
  z.object({ type: z.literal("result"), result: ResearchResult }).strict(),
  z.object({ type: z.literal("error"), error: z.string().max(1000) }).strict(),
]);
export type ResearchStreamEvent = z.infer<typeof ResearchEvent>;
