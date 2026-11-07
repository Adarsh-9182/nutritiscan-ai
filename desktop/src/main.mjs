import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { WorkspaceStore } from "./workspace.mjs";
import { CodexBridge } from "./codex.mjs";
import { ResearchController } from "./controller.mjs";
import { LocalTerminal } from "./terminal.mjs";
import { searchLiterature } from "./literature.mjs";
import { CLAUDE_BIOLOGY_CONTEXT } from "./policy.mjs";
import { AnalysisSpec } from "./analysis.mjs";
import { PaperClaims } from "./paper-schema.mjs";
import { PmcId } from "./pmc.mjs";
import { readPickedPdf } from "./papers.mjs";

app.setName("NutritiScan");
if (process.env.NUTRITISCAN_DATA_DIR) app.setPath("userData", path.resolve(process.env.NUTRITISCAN_DATA_DIR));
let window, controller, terminal, notificationTimer, store, previewAbort;
let loadFailed = false;
function send(channel, ...data) { if (window && !window.isDestroyed()) window.webContents.send(channel, ...data); }
function changed() { if (notificationTimer) return; notificationTimer = setTimeout(() => { notificationTimer = null; send("biology:change"); }, 50); }
function trusted(event) { return window && event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame; }
const object = z.object({}).strict();
const savedItem = z.object({ id: z.string().uuid() }).strict();
const renamedItem = savedItem.extend({ name: z.string().trim().min(1).max(160) });
const requests = {
  state: object, connect: object, login: object, "project.open": object, "project.sample": object,
  "project.select": z.object({ id: z.string().uuid() }).strict(), "session.new": object, "session.select": z.object({ id: z.string().uuid() }).strict(),
  "project.rename": renamedItem, "session.rename": renamedItem,
  "project.archive": savedItem, "project.restore": savedItem, "project.remove": savedItem,
  "session.archive": savedItem, "session.restore": savedItem, "session.remove": savedItem,
  "files.refresh": object,
  run: z.object({ text: z.string().trim().min(3).max(6000), model: z.string().max(160).optional() }).strict(), stop: object,
  "file.read": z.object({ path: z.string().min(1).max(500) }).strict(), "file.profile": z.object({ path: z.string().min(1).max(500) }).strict(),
  "memory.save": z.object({ memory: z.string().max(6000) }).strict(), "session.export": object,
  "analysis.propose": z.object({ spec: AnalysisSpec }).strict(),
  "analysis.run": z.object({ id: z.string().uuid(), sha256: z.string().regex(/^[a-f\d]{64}$/) }).strict(),
  "analysis.reject": savedItem,
  "paper.pick": object, "paper.import": z.object({ path: z.string().min(1).max(500) }).strict(),
  "paper.pmc": z.object({ pmcid: PmcId }).strict(),
  "paper.inspect": savedItem,
  "paper.section": savedItem.extend({ sectionId: z.string().regex(/^[ps]\d{1,4}$/) }),
  "paper.search": savedItem.extend({ query: z.string().trim().min(3).max(200) }),
  "paper.preview": savedItem.extend({ page: z.number().int().min(1).max(80) }), "paper.preview.cancel": object,
  "paper.verify": z.object({ claims: PaperClaims }).strict(),
  "terminal.start": z.object({ claude: z.boolean().optional() }).strict(), "terminal.close": object,
  external: z.object({ url: z.string().max(2500) }).strict(),
};
async function openExternal(value, authentication = false) {
  const url = new URL(value);
  const hosts = authentication ? ["auth.openai.com", "chatgpt.com"] : ["pubmed.ncbi.nlm.nih.gov", "clinicaltrials.gov", "www.ncbi.nlm.nih.gov", "pmc.ncbi.nlm.nih.gov", "doi.org", "nature.com", "www.nature.com", "learn.chatgpt.com", "developers.openai.com", "code.claude.com", "gdc.cancer.gov", "platform-docs.opentargets.org"];
  if (url.protocol !== "https:" || !hosts.includes(url.hostname) || url.username || url.password || url.port) throw new Error("This external address is not a supported research or sign-in destination.");
  await shell.openExternal(url.href);
}
async function invoke(action, value) {
  if (!Object.hasOwn(requests, action)) throw new Error("Unknown workspace action.");
  const args = requests[action].parse(value), store = controller.store;
  switch (action) {
    case "state": return controller.snapshot();
    case "connect": await controller.bridge.connect(); await controller.bridge.refreshAuth(); changed(); return { connected: true };
    case "login": { const url = await controller.bridge.login(); if (url) await openExternal(url, true); return { opened: Boolean(url) }; }
    case "project.open": {
      controller.idle(); const result = await dialog.showOpenDialog(window, { title: "Open a biology research project", properties: ["openDirectory", "createDirectory"] });
      if (!result.canceled && result.filePaths[0]) { controller.idle(); terminal.close(); await store.addProject(result.filePaths[0]); changed(); } return { opened: !result.canceled };
    }
    case "project.sample": {
      controller.idle(); const folder = path.join(app.getPath("userData"), "sample-project"); await fs.mkdir(folder, { recursive: true, mode: 0o700 });
      for (const filename of ["instrument-readings.csv", "synthetic-cohort.csv", "sample-paper.pdf", "README.md"]) { try { await fs.copyFile(fileURLToPath(new URL(`../resources/${filename}`, import.meta.url)), path.join(folder, filename), fs.constants.COPYFILE_EXCL); } catch (e) { if (e.code !== "EEXIST") throw e; } }
      terminal.close(); await store.addProject(folder, true); changed(); return { opened: true };
    }
    case "project.select": controller.idle(); terminal.close(); await store.selectProject(args.id); changed(); return { selected: true };
    case "session.new": controller.idle(); store.newSession(); await store.persist(); changed(); return { created: true };
    case "session.select": controller.idle(); await store.selectSession(args.id); changed(); return { selected: true };
    case "project.rename": case "session.rename": controller.idle(); await store.rename(action.split(".")[0], args.id, args.name); changed(); return { saved: true };
    case "project.archive": case "session.archive": case "project.restore": case "session.restore": {
      controller.idle(); const [kind, operation] = action.split(".");
      await store.archive(kind, args.id, operation === "restore"); if (kind === "project") terminal.close(); changed(); return { saved: true };
    }
    case "project.remove": case "session.remove": {
      controller.idle(); const kind = action.split(".")[0];
      const item = kind === "project" ? store.state.projects.find((p) => p.id === args.id) : store.project()?.sessions.find((s) => s.id === args.id);
      if (!item?.archivedAt) throw new Error("Only archived work can be removed.");
      const result = await dialog.showMessageBox(window, { type: "warning", title: "Remove archived work?", message: `Remove “${item.name ?? item.title}” from NutritiScan?`, detail: kind === "project" ? "This removes this project's saved chats and handoff from this app. Research files and saved reports in the folder stay on your Mac. The original Codex history is separate. Export any chats you need before removing them." : "This removes the saved conversation, sources and checks from this app. Project files, saved reports and the original Codex history stay separate. Restore and export this conversation first if you need a copy.", buttons: ["Keep archived", "Remove saved history"], defaultId: 0, cancelId: 0 });
      if (result.response !== 1) return { removed: false };
      controller.idle(); await store.removeArchived(kind, args.id); changed(); return { removed: true };
    }
    case "files.refresh": controller.inventory = null; changed(); return { refreshed: true };
    case "run": return controller.run(args.text, args.model);
    case "stop": await controller.stop(); changed(); return { stopped: true };
    case "file.read": return store.read(args.path);
    case "file.profile": return store.profile(args.path);
    case "analysis.propose": controller.idle(); try { return await store.proposeAnalysis(args.spec); } finally { changed(); }
    case "analysis.run": return controller.runAnalysis(args.id, args.sha256);
    case "analysis.reject": controller.idle(); { const result = await store.rejectAnalysis(args.id); changed(); return result; }
    case "paper.pick": {
      controller.idle(); const projectId = store.project()?.id; if (!projectId) throw new Error("Open a research project first.");
      const picked = await dialog.showOpenDialog(window, { title: "Import a research PDF", filters: [{ name: "PDF paper", extensions: ["pdf"] }], properties: ["openFile"] });
      if (picked.canceled || !picked.filePaths[0]) return { cancelled: true };
      if (store.project()?.id !== projectId) throw new Error("The active project changed. Choose the PDF again.");
      return controller.paperTask(async (signal) => { const data = await readPickedPdf(picked.filePaths[0]); signal.throwIfAborted(); return controller.papers.importPdf({ data, name: path.basename(picked.filePaths[0]) }, signal); });
    }
    case "paper.import": return controller.paperTask((signal) => controller.papers.importPdf({ path: args.path }, signal));
    case "paper.pmc": return controller.paperTask((signal) => controller.papers.importPmc(args.pmcid, signal));
    case "paper.inspect": return controller.papers.inspect(args.id);
    case "paper.section": return controller.papers.read(args.id, args.sectionId);
    case "paper.search": return controller.papers.search(args.id, args.query);
    case "paper.preview": {
      previewAbort?.abort(); const active = new AbortController(); previewAbort = active;
      try { return await controller.papers.preview(args.id, args.page, active.signal); } finally { if (previewAbort === active) previewAbort = null; }
    }
    case "paper.preview.cancel": previewAbort?.abort(); return { cancelled: true };
    case "paper.verify": {
      const session = store.session(); if (!session) throw new Error("Open an investigation first.");
      const result = await controller.papers.verify(args.claims);
      if (store.session() !== session) throw new Error("The active investigation changed. Verify the passages again.");
      session.paperChecks = [...(session.paperChecks ?? []), ...result.checks].slice(-30); await store.persist(); changed(); return result;
    }
    case "memory.save": controller.idle(); if (!store.project()) throw new Error("Open a project first."); store.project().memory = args.memory; await store.persist(); changed(); return { saved: true };
    case "session.export": {
      const session = store.session(); if (!session) throw new Error("Open a research session first.");
      const result = await dialog.showSaveDialog(window, { title: "Export research session", defaultPath: "nutritiscan-research.md", filters: [{ name: "Markdown", extensions: ["md"] }], properties: ["showOverwriteConfirmation"] });
      if (result.canceled || !result.filePath) return { saved: false };
      const text = [`# ${session.title}`, "Research draft — researcher review required", ...session.messages.map((m) => `## ${m.role === "user" ? "Researcher" : "NutritiScan"} (${m.status})\n\n${m.text}`), "## Retrieved sources", ...session.sources.map((s) => `### ${s.id}: ${s.title}\n${s.url}\n\n${s.detail}\n\n${s.notice ?? ""}`), "## Recorded tool activity", ...session.activities.map((a) => `${a.name}: ${a.status} — ${a.summary}`), "## Analysis records", ...(session.analyses ?? []).map((record) => JSON.stringify(record, null, 2)), "## Project paper snapshots", ...(store.project()?.papers ?? []).map((paper) => JSON.stringify(paper, null, 2)), "## Paper passage membership checks (not scientific validation)", ...(session.paperChecks ?? []).map((check) => JSON.stringify(check, null, 2))].join("\n\n");
      await fs.writeFile(result.filePath, text, { mode: 0o600 }); return { saved: true };
    }
    case "terminal.start": {
      const project = store.project(); if (!project) throw new Error("Open a project first.");
      send("biology:terminal", { type: "reset" }); const result = await terminal.start(project.path);
      if (args.claude) {
        const contextFile = path.join(app.getPath("userData"), "biology-context.md"); await fs.writeFile(contextFile, CLAUDE_BIOLOGY_CONTEXT, { mode: 0o600 });
        const quote = (s) => `'${s.replaceAll("'", `'"'"'`)}'`;
        terminal.input(`claude --append-system-prompt-file ${quote(contextFile)}\r`);
      }
      return result;
    }
    case "terminal.close": terminal.close(); return { closed: true };
    case "external": await openExternal(args.url); return { opened: true };
  }
}

async function initialize() {
await app.whenReady();
store = new WorkspaceStore(app.getPath("userData"));
try { await store.load(); }
catch { loadFailed = true; dialog.showErrorBox("Saved research was preserved", "NutritiScan could not load its saved workspace. The existing file was preserved. Restore a backup or use a separate data directory before trying again."); app.quit(); }
if (!loadFailed) {
  const bridge = new CodexBridge(); terminal = new LocalTerminal(); controller = new ResearchController(store, bridge, searchLiterature);
  controller.on("change", changed); terminal.on("data", (data) => send("biology:terminal", { type: "data", data })); terminal.on("exit", () => send("biology:terminal", { type: "exit" }));
  window = new BrowserWindow({ width: 1400, height: 940, minWidth: 760, minHeight: 600, title: "NutritiScan — Biology Workspace", backgroundColor: "#111812", titleBarStyle: "hiddenInset", trafficLightPosition: { x: 18, y: 18 }, webPreferences: { preload: fileURLToPath(new URL("../dist/preload.cjs", import.meta.url)), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, spellcheck: false } });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  window.webContents.session.setPermissionCheckHandler(() => false);
  ipcMain.handle("biology:call", async (event, action, args) => {
    if (!trusted(event)) return { ok: false, error: "Unknown app frame." };
    try { return { ok: true, value: await invoke(action, args) }; }
    catch (e) { return { ok: false, error: e instanceof z.ZodError ? "Invalid workspace request." : e.message ?? "The workspace action failed." }; }
  });
  ipcMain.on("biology:terminal-input", (event, data) => { if (trusted(event)) terminal.input(data); });
  ipcMain.on("biology:terminal-resize", (event, cols, rows) => { if (trusted(event)) terminal.resize(cols, rows); });
  await window.loadFile(fileURLToPath(new URL("../dist/index.html", import.meta.url)));
}
}
void initialize().catch(() => { loadFailed = true; dialog.showErrorBox("Workspace could not open", "NutritiScan could not start its local workspace. Existing research was preserved."); app.quit(); });
let quitting = false;
app.on("before-quit", (event) => {
  if (quitting || loadFailed) return;
  event.preventDefault();
  controller?.finish("interrupted"); clearTimeout(controller?.saveTimer);
  controller?.analysisActive?.abort.abort();
  controller?.paperActive?.abort.abort(); previewAbort?.abort();
  terminal?.close(); controller?.bridge.close(); clearTimeout(notificationTimer);
  void Promise.allSettled([controller?.analysisActive?.promise, controller?.paperActive?.promise]).then(() => store?.pendingChange).catch(() => {}).then(() => controller?.persist()).finally(() => { quitting = true; app.quit(); });
});
app.on("window-all-closed", () => app.quit());
