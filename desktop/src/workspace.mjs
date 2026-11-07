import fs from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { extractObservations, profileDelimited } from "./datasets.mjs";
import { ANALYSIS_ENGINE, AnalysisRecord, AnalysisSpec, executeAnalysis, validateAnalysis } from "./analysis.mjs";
import { PaperReference, PaperCheck } from "./paper-schema.mjs";

const Message = z.object({ id: z.string().uuid(), role: z.enum(["user", "assistant"]), text: z.string().max(80000), status: z.enum(["working", "completed", "failed", "interrupted"]), createdAt: z.string() });
const Activity = z.object({ id: z.string(), name: z.string(), status: z.enum(["running", "completed", "failed"]), summary: z.string().max(1000) });
const Source = z.object({ id: z.string(), title: z.string().max(2000), url: z.url(), detail: z.string().max(14000), kind: z.enum(["paper", "trial"]), notice: z.string().optional(), metadata: z.object({ hasAbstract: z.boolean().optional(), publicationTypes: z.array(z.string()).optional(), year: z.number().nullable().optional(), studyType: z.string().optional(), status: z.string().optional() }).optional() });
const PassageCheck = z.object({ claim: z.string().max(1200), sourceId: z.string().max(80), quote: z.string().max(1000), status: z.enum(["quote-found", "withheld"]), reason: z.string().max(500) });
const archivedAt = z.string().datetime().nullable().default(null);
const Session = z.object({ id: z.string().uuid(), title: z.string().max(160), threadId: z.string().nullable(), messages: z.array(Message).max(100), activities: z.array(Activity).max(200), sources: z.array(Source).max(100), checks: z.array(PassageCheck).max(30).default([]), paperChecks: z.array(PaperCheck).max(30).default([]), analyses: z.array(AnalysisRecord).max(12).default([]), status: z.enum(["ready", "working", "completed", "failed", "interrupted"]), archivedAt });
const Project = z.object({ id: z.string().uuid(), name: z.string().min(1).max(160), path: z.string().min(1), memory: z.string().max(6000), sample: z.boolean(), papers: z.array(PaperReference).max(30).default([]), activeSessionId: z.string().uuid().nullable(), sessions: z.array(Session).max(20), archivedAt });
const State = z.object({ version: z.literal(1), activeProjectId: z.string().uuid().nullable(), projects: z.array(Project).max(12) });
const Label = z.string().trim().min(1).max(160).refine((value) => [...value].every((character) => character.charCodeAt(0) > 31 && character.charCodeAt(0) !== 127), "Use a name on one line.");
function selectAvailable(state) {
  const projects = state.projects.filter((p) => !p.archivedAt);
  if (!projects.some((p) => p.id === state.activeProjectId)) state.activeProjectId = projects[0]?.id ?? null;
  for (const p of state.projects) if (!p.sessions.some((s) => s.id === p.activeSessionId && !s.archivedAt)) p.activeSessionId = p.sessions.find((s) => !s.archivedAt)?.id ?? null;
}
const allowed = new Set([".md", ".txt", ".csv", ".tsv", ".json", ".fasta", ".fa", ".log", ".py", ".r", ".pdf"]);
const blocked = (name) => name.startsWith(".") || /^(node_modules|dist|build|venv|__pycache__)$/i.test(name) || /(?:^|[._-])(credentials?|secrets?|tokens?|passwords?)(?:[._-]|$)/i.test(name) || /\.(pem|key|p12|pfx)$/i.test(name);

export async function safeProjectFile(root, relative, { pdf = false } = {}) {
  if (typeof relative !== "string" || !relative || relative.length > 500 || path.isAbsolute(relative) || relative.includes("\0")) throw new Error("Choose a relative project file.");
  const pieces = relative.split(/[\\/]/); if (pieces.some((p) => !p || p === ".." || blocked(p))) throw new Error("Hidden, secret, parent and dependency paths are excluded.");
  if ((await fs.lstat(root)).isSymbolicLink()) throw new Error("Project folders cannot be replaced with symbolic links.");
  const realRoot = await fs.realpath(root); let current = realRoot;
  for (const piece of pieces) { current = path.join(current, piece); if ((await fs.lstat(current)).isSymbolicLink()) throw new Error("Symbolic links are excluded from project access."); }
  const ext = path.extname(current).toLowerCase();
  if (!current.startsWith(realRoot + path.sep) || (pdf ? ext !== ".pdf" : !allowed.has(ext) || ext === ".pdf")) throw new Error(pdf ? "Choose a PDF inside this project." : "This file type is not supported for text reading. Import PDFs through Papers.");
  const handle = await fs.open(current, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const limit = pdf ? 20_000_000 : 2_000_000;
    const stat = await handle.stat(); if (!stat.isFile() || stat.size > limit) throw new Error(`Choose a regular project file smaller than ${pdf ? 20 : 2} MB.`);
    // Bound the read itself, including a file that grows after the initial stat.
    const buffer = Buffer.alloc(limit + 1); let offset = 0;
    while (offset < buffer.length) { const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset); if (!bytesRead) break; offset += bytesRead; }
    const after = await handle.stat();
    if (offset > limit) throw new Error(`Choose a regular project file smaller than ${pdf ? 20 : 2} MB.`);
    if (after.size !== stat.size || after.mtimeMs !== stat.mtimeMs || after.ctimeMs !== stat.ctimeMs) throw new Error("The project file changed while it was being read. Retry against a stable source.");
    const bytes = buffer.subarray(0, offset);
    return { ...(pdf ? { data: bytes } : { text: bytes.toString("utf8") }), relative, size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), modifiedAt: stat.mtime.toISOString() };
  }
  finally { await handle.close(); }
}

export async function projectFiles(root) {
  if ((await fs.lstat(root)).isSymbolicLink()) throw new Error("Project folders cannot be symbolic links.");
  const files = []; let visited = 0, limited = false;
  async function visit(dir, prefix, depth) {
    if (depth > 4 || files.length >= 250 || ++visited > 100) { limited = true; return; }
    const items = [];
    for await (const entry of await fs.opendir(dir)) { if (items.length >= 1000) { limited = true; break; } items.push(entry); }
    for (const entry of items.sort((a, b) => a.name.localeCompare(b.name))) {
      if (files.length >= 250) { limited = true; break; }
      if (blocked(entry.name) || entry.isSymbolicLink()) continue;
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await visit(path.join(dir, entry.name), relative, depth + 1);
      else if (entry.isFile() && allowed.has(path.extname(entry.name).toLowerCase())) files.push({ path: relative, name: entry.name, kind: path.extname(entry.name).slice(1) });
    }
  }
  await visit(await fs.realpath(root), "", 0); return { files, limited };
}

export class WorkspaceStore {
  constructor(directory) { this.directory = directory; this.file = path.join(directory, "workspace.json"); this.state = { version: 1, activeProjectId: null, projects: [] }; this.queue = Promise.resolve(); }
  async load() {
    await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
    try { const raw = await fs.readFile(this.file, "utf8"); if (Buffer.byteLength(raw) > 20_000_000) throw new Error("Workspace storage exceeds its limit."); this.state = State.parse(JSON.parse(raw)); }
    catch (e) { if (e.code !== "ENOENT") throw new Error("Saved workspace could not be loaded. Its file was preserved; choose a separate data directory or restore a backup."); }
    for (const p of this.state.projects) for (const s of p.sessions) { if (s.status === "working") s.status = "interrupted"; for (const m of s.messages) if (m.status === "working") m.status = "interrupted"; for (const a of s.activities) if (a.status === "running") a.status = "failed"; for (const analysis of s.analyses) if (analysis.status === "running") { analysis.status = "interrupted"; analysis.error = "The application closed during analysis. No completed result is established; propose a fresh run."; } }
    selectAvailable(this.state);
  }
  persist(state = this.state) {
    const content = JSON.stringify(State.parse(state)); if (Buffer.byteLength(content) > 20_000_000) throw new Error("Workspace storage is full. Export research before adding more.");
    const task = this.queue.catch(() => {}).then(async () => { const temp = `${this.file}.${randomUUID()}.tmp`; try { await fs.writeFile(temp, content, { mode: 0o600, flag: "wx" }); await fs.rename(temp, this.file); } finally { await fs.unlink(temp).catch(() => {}); } }); this.queue = task; return task;
  }
  project() { return this.state.projects.find((p) => p.id === this.state.activeProjectId && !p.archivedAt) ?? null; }
  session() { const p = this.project(); return p?.sessions.find((s) => s.id === p.activeSessionId && !s.archivedAt) ?? null; }
  async manage(change) {
    if (this.pendingChange) throw new Error("Workspace changes are still being saved. Try again in a moment.");
    const next = structuredClone(this.state); change(next); selectAvailable(next);
    const pending = this.persist(next); this.pendingChange = pending;
    try { await pending; this.state = next; } finally { this.pendingChange = null; }
  }
  async rename(kind, id, name) {
    const label = Label.parse(name);
    await this.manage((state) => { const item = kind === "project" ? state.projects.find((p) => p.id === id) : state.projects.find((p) => p.id === state.activeProjectId && !p.archivedAt)?.sessions.find((s) => s.id === id); if (!item) throw new Error("This saved work could not be found."); item[kind === "project" ? "name" : "title"] = label; });
  }
  async archive(kind, id, restore = false) {
    await this.manage((state) => {
      const p = kind === "project" ? state.projects.find((p) => p.id === id) : state.projects.find((p) => p.id === state.activeProjectId && !p.archivedAt);
      const item = kind === "project" ? p : p?.sessions.find((s) => s.id === id);
      if (!item) throw new Error("This saved work could not be found.");
      if ((kind === "project" ? p.sessions : [item]).some((s) => s.status === "working")) throw new Error("Finish or stop the active investigation first.");
      item.archivedAt = restore ? null : new Date().toISOString();
      if (restore) { state.activeProjectId = p.id; if (kind === "session") p.activeSessionId = id; }
    });
  }
  async removeArchived(kind, id) {
    await this.manage((state) => {
      const p = kind === "project" ? state.projects.find((p) => p.id === id) : state.projects.find((p) => p.id === state.activeProjectId && !p.archivedAt);
      const item = kind === "project" ? p : p?.sessions.find((s) => s.id === id);
      if (!item?.archivedAt) throw new Error("Only archived work can be removed.");
      if (kind === "project") state.projects = state.projects.filter((project) => project.id !== id);
      else p.sessions = p.sessions.filter((s) => s.id !== id);
    });
  }
  async addProject(directory, sample = false) {
    const real = await fs.realpath(directory); if (!(await fs.stat(real)).isDirectory() || real === path.parse(real).root || real === process.env.HOME) throw new Error("Choose a dedicated research folder, not your home or disk root.");
    let p = this.state.projects.find((p) => p.path === real);
    if (!p) { if (this.state.projects.length >= 12) throw new Error("This app supports twelve project folders."); p = { id: randomUUID(), name: path.basename(real).slice(0, 160), path: real, memory: "", sample, sessions: [], activeSessionId: null }; this.state.projects.push(p); }
    p.archivedAt = null; this.state.activeProjectId = p.id; selectAvailable(this.state); if (!p.sessions.length) this.newSession(); await this.persist(); return p;
  }
  newSession() { const p = this.project(); if (!p) throw new Error("Open a research project first."); if (p.sessions.length >= 20) throw new Error("This project has twenty saved investigations, including archived work. Restore and export any work you need, then remove an archived investigation to make room."); const s = { id: randomUUID(), title: "New investigation", threadId: null, messages: [], activities: [], sources: [], checks: [], status: "ready" }; p.sessions.push(s); p.activeSessionId = s.id; return s; }
  async selectProject(id) { if (!this.state.projects.some((p) => p.id === id && !p.archivedAt)) throw new Error("Unknown active project. Restore archived work from the library."); this.state.activeProjectId = id; await this.persist(); }
  async selectSession(id) { const p = this.project(); if (!p?.sessions.some((s) => s.id === id && !s.archivedAt)) throw new Error("Unknown active investigation. Restore archived work from the library."); p.activeSessionId = id; await this.persist(); }
  async context() { const p = this.project(); if (!p) throw new Error("Open a project first."); return { name: p.name, memory: p.memory, sample: p.sample, papers: p.papers ?? [], ...(await projectFiles(p.path)) }; }
  async read(relative) { const p = this.project(); if (!p) throw new Error("Open a project first."); const file = await safeProjectFile(p.path, relative); return { path: relative, sha256: file.sha256, modifiedAt: file.modifiedAt, bytes: file.size, text: file.text.slice(0, 60000), truncated: file.text.length > 60000 }; }
  async profile(relative) { const p = this.project(); if (!p) throw new Error("Open a project first."); const file = await safeProjectFile(p.path, relative); const ext = path.extname(relative).toLowerCase(); if (![".csv", ".tsv", ".json"].includes(ext)) throw new Error("Choose a CSV, TSV or FHIR Observation JSON file."); return { path: relative, sha256: file.sha256, modifiedAt: file.modifiedAt, bytes: file.size, ...(ext === ".json" ? extractObservations(file.text) : profileDelimited(file.text, ext === ".tsv" ? "\t" : ",")) }; }
  async proposeAnalysis(input, signal = new AbortController().signal) {
    const spec = AnalysisSpec.parse(input), p = this.project(), session = this.session();
    if (!p || !session) throw new Error("Open an investigation first.");
    const file = await safeProjectFile(p.path, spec.path); signal.throwIfAborted();
    validateAnalysis(spec, file.text);
    if (this.project() !== p || this.session() !== session || this.pendingChange) throw new Error("The active investigation changed. Propose the analysis again.");
    session.analyses ??= [];
    if (session.analyses.length >= 12) throw new Error("This investigation has twelve analysis records. Start a new investigation; prior records are preserved.");
    const record = AnalysisRecord.parse({ id: randomUUID(), spec, engine: ANALYSIS_ENGINE, source: { sha256: file.sha256, bytes: file.size, modifiedAt: file.modifiedAt }, status: "pending", createdAt: new Date().toISOString(), approvedAt: null, completedAt: null, result: null, artifact: null, error: null });
    session.analyses.push(record); await this.persist();
    return { id: record.id, status: "pending", spec, source: record.source, notice: "Proposed only. Review the exact operations and approve in the Analysis panel. No calculation has executed. Summaries are descriptive, not validated biological findings." };
  }
  analysis(id) { const record = this.session()?.analyses?.find((record) => record.id === id); if (!record) throw new Error("This analysis does not belong to the active investigation."); return record; }
  async rejectAnalysis(id) { const record = this.analysis(id); if (record.status !== "pending") throw new Error("Only a pending analysis can be rejected."); record.status = "rejected"; await this.persist(); return { rejected: true }; }
  async runAnalysis(id, expectedSha256, signal = new AbortController().signal) {
    const record = this.analysis(id), p = this.project(), session = this.session();
    if (record.status !== "pending") throw new Error("This analysis is no longer pending. Duplicate execution is refused; propose a new run to reproduce it.");
    if (record.source.sha256 !== expectedSha256) throw new Error("The displayed input hash does not match this plan. Refresh the proposal before approving.");
    record.status = "running"; record.approvedAt = new Date().toISOString();
    try {
      await this.persist(); signal.throwIfAborted();
      const file = await safeProjectFile(p.path, record.spec.path); signal.throwIfAborted();
      if (file.sha256 !== record.source.sha256) { record.status = "stale"; throw new Error("The source dataset changed after this proposal. No analysis ran. Inspect the new file and propose a new plan."); }
      const result = await executeAnalysis(record.spec, file.text, signal);
      if (this.project() !== p || this.session() !== session || this.pendingChange) throw new Error("The active investigation changed; this analysis cannot be committed.");
      signal.throwIfAborted();
      const completedAt = new Date().toISOString();
      const receipt = { format: "nutritiscan-analysis", version: 1, id, engine: record.engine, spec: record.spec, source: record.source, approvedAt: record.approvedAt, completedAt, result, sourceSnapshot: "Original source is not copied. Reproduction requires the same file contents and SHA-256." };
      const serialized = JSON.stringify(receipt, null, 2);
      if (serialized.length > 60000) throw new Error("The analysis receipt exceeds 60,000 characters. Propose fewer operations; no result was published.");
      const artifact = await this.artifact(`analysis-${id}.json`, serialized);
      record.result = result; record.artifact = artifact.path; record.completedAt = completedAt; record.status = "completed"; record.error = null;
      return record;
    } catch (error) { if (record.status !== "stale") record.status = signal.aborted ? "interrupted" : "failed"; record.error = error.message.slice(0, 1000); throw error; }
    finally { await this.persist(); }
  }
  async artifact(filename, content) {
    const p = this.project(); if (!p) throw new Error("Open a project first.");
    if (!/^[a-z\d][a-z\d_. -]{0,100}\.(md|txt|json|csv)$/i.test(filename) || typeof content !== "string" || content.length > 60000) throw new Error("Use a simple artifact filename and at most 60,000 characters.");
    const target = path.join(p.path, "artifacts"); await fs.mkdir(target, { recursive: true }); if ((await fs.lstat(target)).isSymbolicLink()) throw new Error("Artifact folders cannot be symbolic links.");
    for (let i = 0; i < 5; i++) { const actual = i ? `${path.parse(filename).name}-${randomUUID().slice(0, 8)}${path.extname(filename)}` : filename; try { await fs.writeFile(path.join(target, actual), content, { flag: "wx", mode: 0o600 }); return { path: `artifacts/${actual}`, saved: true }; } catch (e) { if (e.code !== "EEXIST") throw e; } }
    throw new Error("Could not create a new artifact without replacing existing work.");
  }
}
