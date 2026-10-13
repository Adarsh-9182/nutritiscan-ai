import { RunEventSchema, type AgentArtifact, type RunEvent } from "./contracts";

/** Stream framing survives JSON lines split across network chunks. */
export async function consumeRun(response: Response, onEvent: (event: RunEvent) => void): Promise<void> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: unknown };
    throw new Error(typeof body.error === "string" ? body.error : "The agent could not start. Please try again.");
  }
  if (!response.body) throw new Error("The run response was empty.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let terminal = false;
  let runId: string | null = null;
  let bytes = 0;
  let events = 0;
  const accept = (line: string) => {
    if (!line.trim()) return;
    const event = RunEventSchema.parse(JSON.parse(line));
    if (++events > 20 || (!runId && event.type !== "started")) throw new Error("The run stream exceeded its contract.");
    if (terminal || (runId && runId !== event.runId)) throw new Error("The run stream was inconsistent. Please start a new run.");
    runId = event.runId;
    terminal = ["approval", "failed", "cancelled"].includes(event.type);
    onEvent(event);
  };
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 500000) throw new Error("The run response exceeded its size limit.");
      buffer += decoder.decode(value, { stream: true });
      if (buffer.length > 500000) throw new Error("The run response exceeded its size limit.");
      let newline: number;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        accept(buffer.slice(0, newline));
        buffer = buffer.slice(newline + 1);
      }
    }
    buffer += decoder.decode();
    accept(buffer);
    if (!terminal) throw new Error("The connection ended before the run completed. Please try again.");
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally { reader.releaseLock(); }
}

/** Approval is for this exact artifact. Check the bytes before a download. */
export async function verifiedArtifactBlob(artifact: AgentArtifact): Promise<Blob> {
  if (Date.parse(artifact.expiresAt) <= Date.now()) throw new Error("This approval preview expired. Run the agent again to prepare a fresh brief.");
  const bytes = new TextEncoder().encode(artifact.content);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  const fingerprint = Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
  if (fingerprint !== artifact.sha256 || bytes.byteLength !== artifact.bytes) throw new Error("The file does not match the approval preview. Run the agent again.");
  return new Blob([bytes], { type: "text/markdown;charset=utf-8" });
}
