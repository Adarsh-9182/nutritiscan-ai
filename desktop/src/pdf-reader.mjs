import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { PaperSection } from "./paper-schema.mjs";

const Extracted = z.object({ engine: z.literal("apple-pdfkit-v1"), title: z.string().max(1000), author: z.string().max(2000), sections: z.array(PaperSection).min(1).max(80) }).strict();
const Preview = z.object({ image: z.string().max(6_700_000).regex(/^[a-z\d+/=]+$/i), width: z.number().int().min(1).max(2000), height: z.number().int().min(1).max(2000), page: z.number().int().min(1).max(80) }).strict();

export function runPdfReader(data, mode = "extract", page = null, signal = new AbortController().signal, { executable = fileURLToPath(new URL("../dist/paper-reader", import.meta.url)), timeoutMs = 20_000 } = {}) {
  signal.throwIfAborted();
  if (!Buffer.isBuffer(data) || data.length > 20_000_000 || data.subarray(0, 5).toString() !== "%PDF-") throw new Error("Choose a PDF smaller than 20 MB.");
  if (!["extract", "preview"].includes(mode) || (mode === "preview" && (!Number.isInteger(page) || page < 1 || page > 80))) throw new Error("Invalid PDF reader operation.");
  return new Promise((resolve, reject) => {
    const child = spawn(executable, [mode, ...(page === null ? [] : [String(page)])], { env: { PATH: "/usr/bin:/bin", LANG: "en_US.UTF-8" }, stdio: ["pipe", "pipe", "pipe"] });
    let size = 0, settled = false; const chunks = [], limit = mode === "preview" ? 7_000_000 : 2_000_000;
    const stop = (error) => { if (settled) return; settled = true; clearTimeout(timer); signal.removeEventListener("abort", cancelled); child.kill("SIGKILL"); reject(error); };
    const cancelled = () => stop(new Error("Paper reading was cancelled. No partial document was imported."));
    const timer = setTimeout(() => stop(new Error("The PDF reader exceeded its time limit. No partial document was imported.")), timeoutMs); timer.unref?.();
    signal.addEventListener("abort", cancelled, { once: true });
    child.on("error", () => stop(new Error("The bundled PDF reader could not start. Rebuild or reopen the Mac preview.")));
    child.stdout.on("data", (chunk) => { size += chunk.length; if (size > limit) stop(new Error("PDF output exceeds its limit. No partial document was imported.")); else chunks.push(chunk); });
    child.stderr.on("data", () => {}); // Parser diagnostics may contain document data.
    child.stdin.on("error", () => {});
    child.on("close", (code) => {
      if (settled) return;
      settled = true; clearTimeout(timer); signal.removeEventListener("abort", cancelled);
      try { const result = JSON.parse(Buffer.concat(chunks).toString("utf8")); if (code !== 0) throw new Error(typeof result.error === "string" ? result.error.slice(0, 500) : "The PDF reader failed."); resolve((mode === "preview" ? Preview : Extracted).parse(result)); }
      catch (error) { reject(error instanceof z.ZodError ? new Error("The PDF reader returned an invalid result.") : error); }
    });
    child.stdin.end(data);
    if (signal.aborted) cancelled();
  });
}
