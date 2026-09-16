import type { WebWorkerMLCEngine } from "@mlc-ai/web-llm";
import type { Completion } from "./health-agent";
export const DEVICE_MODEL = "Qwen2.5-1.5B-Instruct-q4f32_1-MLC";
export type DeviceModel = { complete: Completion; dispose: () => void };

/** Loaded only after an explicit download action. Worker termination cancels
 * downloads/inference and releases GPU memory; patient text is never fetched. */
export async function loadDeviceModel(
  progress: (value: number, text: string) => void,
  signal: AbortSignal,
): Promise<DeviceModel> {
  const gpu = (
    navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }
  ).gpu;
  if (!gpu)
    throw new Error(
      "This browser has no WebGPU support. Try a recent desktop Chrome or Edge. References and record tools still work here.",
    );
  const adapter = await gpu.requestAdapter();
  if (!adapter)
    throw new Error(
      "WebGPU could not find a compatible GPU. Try a supported desktop browser with hardware acceleration enabled. References still work.",
    );
  const { WebWorkerMLCEngine } = await import("@mlc-ai/web-llm");
  if (signal.aborted) throw new DOMException("Stopped", "AbortError");
  const worker = new Worker(new URL("./device.worker.ts", import.meta.url), {
    type: "module",
  });
  const engine: WebWorkerMLCEngine = new WebWorkerMLCEngine(worker, {
    initProgressCallback: (report) =>
      progress(Math.max(0, Math.min(1, report.progress)), report.text),
    logLevel: "ERROR",
  });
  let disposed = false;
  const dispose = () => {
    disposed = true;
    worker.terminate();
  };
  const cancelled = new Promise<never>((_, reject) =>
    signal.addEventListener(
      "abort",
      () => {
        dispose();
        reject(new DOMException("Stopped", "AbortError"));
      },
      { once: true },
    ),
  );
  try {
    await Promise.race([
      engine.reload(DEVICE_MODEL, { context_window_size: 4096 }),
      cancelled,
    ]);
  } catch (error) {
    dispose();
    if (process.env.NODE_ENV !== "production")
      console.warn("On-device model initialization:", String(error));
    throw error;
  }
  const complete: Completion = async (system, question, turnSignal) => {
    if (disposed || turnSignal.aborted)
      throw new DOMException("Stopped", "AbortError");
    let onAbort: () => void = () => {};
    const aborted = new Promise<never>((_, reject) => {
      onAbort = () => {
        dispose();
        reject(new DOMException("Stopped", "AbortError"));
      };
      turnSignal.addEventListener("abort", onAbort, { once: true });
    });
    try {
      const result = await Promise.race([
        engine.chat.completions.create({
          messages: [
            { role: "system", content: system },
            { role: "user", content: question },
          ],
          temperature: 0,
          max_tokens: 650,
          // Validate planning JSON and answer text in health-agent.ts. The runtime grammar
          // matcher is incompatible with this model binary; do not rely on it.
        }),
        aborted,
      ]);
      if (result.choices[0]?.finish_reason !== "stop")
        throw new Error("Incomplete model response");
      return result.choices[0]?.message.content ?? "";
    } finally {
      turnSignal.removeEventListener("abort", onAbort);
    }
  };
  return { complete, dispose };
}
