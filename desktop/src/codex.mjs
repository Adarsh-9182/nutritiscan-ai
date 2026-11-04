import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { EventEmitter } from "node:events";
import { safeChildEnvironment } from "./policy.mjs";

const exec = promisify(execFile);
export async function executable(name) {
  const directories = [...(process.env.PATH ?? "").split(path.delimiter), path.join(os.homedir(), ".local/bin"), path.join(os.homedir(), ".local/node/bin"), "/opt/homebrew/bin", "/usr/local/bin", "/usr/bin"];
  for (const directory of directories) { const candidate = path.join(directory, name); try { await fs.access(candidate, fs.constants.X_OK); return candidate; } catch {} }
  throw new Error(`${name} is not installed. Install the official CLI, then reconnect.`);
}

export function restrictedArgs(names) {
  if (!Array.isArray(names) || names.length > 100 || names.some((n) => typeof n !== "string" || n.length > 200)) throw new Error("Could not isolate inherited tool configuration.");
  const args = ["app-server", "--listen", "stdio://", "-c", 'model_provider="openai"', "-c", "project_doc_max_bytes=0", "-c", 'web_search="disabled"'];
  for (const feature of ["shell_tool", "apps", "plugins", "browser_use", "computer_use", "view_image", "image_generation", "memories", "multi_agent", "request_permissions_tool", "skill_search", "skill_mcp_dependency_install", "code_mode", "hooks"]) args.push("-c", `features.${feature}=false`);
  if (names.length) args.push("-c", `mcp_servers={${names.map((n) => `${JSON.stringify(n)}={enabled=false,command="/usr/bin/false"}`).join(",")}}`);
  return args;
}

export class CodexBridge extends EventEmitter {
  constructor() { super(); this.pending = new Map(); this.sequence = 0; this.process = null; this.buffer = ""; this.connected = false; this.auth = { connected: false, plan: null }; this.models = []; }
  async connect() {
    if (this.starting) return this.starting;
    if (this.connected) return this.status();
    this.starting = this.start().finally(() => { this.starting = null; }); return this.starting;
  }
  async start() {
    const cli = await executable("codex"), env = safeChildEnvironment();
    let configured;
    try { const { stdout } = await exec(cli, ["mcp", "list", "--json"], { env, timeout: 15_000, maxBuffer: 2_000_000 }); const entries = JSON.parse(stdout); if (!Array.isArray(entries)) throw new Error(); configured = entries.map((e) => e.name); }
    catch { throw new Error("Codex tool configuration could not be checked. Reconnect after the CLI is ready."); }
    const child = spawn(cli, restrictedArgs(configured), { env, stdio: ["pipe", "pipe", "pipe"] }); this.process = child;
    child.stdout.setEncoding("utf8"); child.stdout.on("data", (chunk) => { if (this.process === child) this.receive(chunk); });
    child.stderr.on("data", () => {}); // Never surface auth diagnostics, tokens or prompt bodies.
    child.stdin.on("error", () => { if (this.process === child) this.closed(); });
    child.on("error", () => { if (this.process === child) this.closed(); }); child.on("exit", () => { if (this.process === child) this.closed(); });
    try {
      await this.rpc("initialize", { clientInfo: { name: "nutritiscan_desktop", title: "NutritiScan", version: "0.1.0" }, capabilities: { experimentalApi: true } });
      this.notify("initialized"); this.connected = true;
      await this.refreshAuth();
      const models = await this.rpc("model/list", { limit: 30, includeHidden: false });
      this.models = (models.data ?? []).map((m) => ({ id: m.id, model: m.model, name: m.displayName ?? m.model, isDefault: Boolean(m.isDefault) })).filter((m) => typeof m.model === "string");
      this.emit("status", this.status()); return this.status();
    } catch (e) { this.close(); throw e; }
  }
  status() { return { connected: this.connected, auth: this.auth, models: this.models }; }
  async refreshAuth() { const result = await this.rpc("account/read", { refreshToken: false }); this.auth = { connected: result.account?.type === "chatgpt", plan: result.account?.type === "chatgpt" ? result.account.planType ?? "unknown" : null }; this.emit("status", this.status()); return this.auth; }
  async login() { await this.connect(); if (this.auth.connected) return null; const reply = await this.rpc("account/login/start", { type: "chatgpt" }); if (reply.type !== "chatgpt") throw new Error("Codex did not return a ChatGPT sign-in flow."); return reply.authUrl; }
  rpc(method, params, timeout = 30_000) {
    if (!this.process || this.process.killed) return Promise.reject(new Error("The local Codex process is not connected."));
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error("Codex did not respond in time. Reconnect or retry; existing work is retained.")); }, timeout); timer.unref?.();
      this.pending.set(id, { resolve, reject, timer });
      this.process.stdin.write(JSON.stringify({ id, method, params }) + "\n");
    });
  }
  notify(method, params) { this.process?.stdin.write(JSON.stringify({ method, ...(params ? { params } : {}) }) + "\n"); }
  reply(id, result) { this.process?.stdin.write(JSON.stringify({ id, result }) + "\n"); }
  receive(chunk) {
    this.buffer += chunk;
    if (this.buffer.length > 4_000_000) { this.close(); return; }
    let newline;
    while ((newline = this.buffer.indexOf("\n")) !== -1) {
      const line = this.buffer.slice(0, newline); this.buffer = this.buffer.slice(newline + 1); if (!line.trim()) continue;
      let message; try { message = JSON.parse(line); } catch { this.close(); return; }
      if (message.id !== undefined && !message.method) {
        const request = this.pending.get(message.id); if (!request) continue; clearTimeout(request.timer); this.pending.delete(message.id);
        if (message.error) request.reject(new Error("Codex rejected the operation. Check sign-in, model access or provider limits; no paid fallback was used.")); else request.resolve(message.result);
      } else if (message.id !== undefined) this.emit("request", message);
      else {
        if (message.method === "account/login/completed" && message.params?.success) void this.refreshAuth().catch(() => {});
        this.emit("notification", message);
      }
    }
  }
  closed() { if (!this.process && !this.connected) return; this.process = null; this.connected = false; this.auth = { connected: false, plan: null }; for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new Error("The local Codex process stopped. Saved work is retained.")); } this.pending.clear(); this.emit("closed"); this.emit("status", this.status()); }
  close() { const child = this.process; if (child && !child.killed) child.kill("SIGTERM"); this.closed(); }
}
