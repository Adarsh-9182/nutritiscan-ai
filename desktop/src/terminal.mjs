import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { StringDecoder } from "node:string_decoder";
import { fileURLToPath } from "node:url";
import { executable } from "./codex.mjs";
import { safeChildEnvironment } from "./policy.mjs";

export class LocalTerminal extends EventEmitter {
  constructor() { super(); this.child = null; this.buffer = ""; }
  async start(directory) {
    this.close(); const python = await executable("python3");
    const child = spawn(python, [fileURLToPath(new URL("../resources/terminal.py", import.meta.url)), directory], { env: { ...safeChildEnvironment(), TERM: "xterm-256color" }, stdio: ["pipe", "pipe", "pipe"] }); this.child = child; this.buffer = ""; const decoder = new StringDecoder("utf8");
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      if (this.child !== child) return; this.buffer += chunk;
      if (this.buffer.length > 1_000_000) { this.close(); return; }
      let newline;
      while ((newline = this.buffer.indexOf("\n")) !== -1) { const line = this.buffer.slice(0, newline); this.buffer = this.buffer.slice(newline + 1); try { const e = JSON.parse(line); if (e.type === "data") this.emit("data", decoder.write(Buffer.from(e.data, "base64"))); else if (e.type === "exit") this.emit("exit"); } catch {} }
    });
    child.stdin.on("error", () => {}); child.stderr.on("data", () => {});
    child.on("error", () => { if (this.child === child) { this.child = null; this.emit("exit"); } });
    child.on("exit", () => { if (this.child === child) { this.child = null; this.emit("exit"); } }); return { started: true };
  }
  input(data) { if (typeof data !== "string" || data.length > 32000 || !this.child) return; this.child.stdin.write(JSON.stringify({ type: "input", data: Buffer.from(data).toString("base64") }) + "\n"); }
  resize(cols, rows) { if (Number.isInteger(cols) && Number.isInteger(rows)) this.child?.stdin.write(JSON.stringify({ type: "resize", cols, rows }) + "\n"); }
  close() { const child = this.child; this.child = null; child?.kill("SIGTERM"); }
}
