import { z } from "zod";

export const PluginId = z.enum(["library", "pubmed", "trials", "artifact"]);
export type PluginId = z.infer<typeof PluginId>;

export const AgentDefinitionSchema = z.object({
  id: z.string().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/),
  name: z.string().trim().min(2).max(60),
  instructions: z.string().trim().min(10).max(1200),
  plugins: z.array(PluginId).min(2).max(4)
    .refine((ids) => new Set(ids).size === ids.length, "Choose each plugin once.")
    .refine((ids) => ids.includes("artifact") && ids.some((id) => id !== "artifact"), "Enable a source plugin and the brief export plugin."),
}).strict();
export type AgentDefinition = z.infer<typeof AgentDefinitionSchema>;

export const RunRequestSchema = z.object({
  agent: AgentDefinitionSchema,
  task: z.string().trim().min(3).max(300),
}).strict();
export type RunRequest = z.infer<typeof RunRequestSchema>;

export const PLUGINS: { id: PluginId; name: string; description: string; scope: string; approval: boolean; version: string }[] = [
  { id: "library", name: "Health library", description: "Read curated educational notes and their published sources.", scope: "Local reference notes", approval: false, version: "1.0.0" },
  { id: "pubmed", name: "PubMed", description: "Search public paper metadata and available abstracts.", scope: "Public search terms → NCBI", approval: false, version: "1.0.0" },
  { id: "trials", name: "ClinicalTrials.gov", description: "Find registered studies and their reported status.", scope: "Public search terms → study registry", approval: false, version: "1.0.0" },
  { id: "artifact", name: "Brief export", description: "Prepare a Markdown file for your review and download.", scope: "Download to this device", approval: true, version: "1.0.0" },
];

export const SourceSchema = z.object({
  id: z.string().max(80),
  title: z.string().max(2000),
  url: z.string().url().max(2000).refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port &&
      ["medlineplus.gov", "ods.od.nih.gov", "pubmed.ncbi.nlm.nih.gov", "clinicaltrials.gov"].includes(url.hostname);
  }, "Only approved public source URLs are supported."),
  kind: z.enum(["reference", "paper", "trial"]),
  detail: z.string().max(12000),
}).strict();
export type AgentSource = z.infer<typeof SourceSchema>;

export const ArtifactSchema = z.object({
  filename: z.string().regex(/^[a-z0-9_-]+\.md$/).max(100),
  content: z.string().max(100000),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  bytes: z.number().int().nonnegative().max(400000),
  sources: z.array(SourceSchema).max(13),
  mode: z.enum(["model-assisted", "source-collection"]),
  expiresAt: z.string().datetime(),
}).strict();
export type AgentArtifact = z.infer<typeof ArtifactSchema>;

const eventBase = { runId: z.string().uuid(), at: z.string().datetime() };
export const RunEventSchema = z.discriminatedUnion("type", [
  z.object({ ...eventBase, type: z.literal("started"), plan: z.array(z.string().max(200)).max(6) }).strict(),
  z.object({ ...eventBase, type: z.literal("step"), id: z.string().max(40), label: z.string().max(200), status: z.enum(["running", "done", "empty"]), detail: z.string().max(500) }).strict(),
  z.object({ ...eventBase, type: z.literal("approval"), artifact: ArtifactSchema }).strict(),
  z.object({ ...eventBase, type: z.literal("failed"), message: z.string().max(2000) }).strict(),
  z.object({ ...eventBase, type: z.literal("cancelled") }).strict(),
]);
export type RunEvent = z.infer<typeof RunEventSchema>;

export const RESEARCH_AGENT: AgentDefinition = {
  id: "research-starter",
  name: "Evidence scout",
  instructions: "Gather public evidence for the question. Keep the brief concise, explain source coverage and limitations, and distinguish papers from registered studies.",
  plugins: ["library", "pubmed", "trials", "artifact"],
};
