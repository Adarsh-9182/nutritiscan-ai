import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CLOUD_ENGINE_LABEL,
  ENDPOINT_ENGINE_LABEL,
  cloudComplete,
  hostedEngine,
  hostedModelReady,
} from "./cloud-model";
import { runHealthAgent } from "./health-agent";
import { DEMO } from "./demo";

const generateText = vi.hoisted(() => vi.fn());
vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("ai")>()),
  generateText,
}));

function endpoint() {
  vi.stubEnv("HEALTH_MODEL_BASE_URL", "https://model.example/v1");
  vi.stubEnv("HEALTH_MODEL_NAME", "test-open-model");
  vi.stubEnv("HEALTH_MODEL_APPROVED", "true");
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  generateText.mockReset();
});

describe("hosted engine selection", () => {
  it("reports no engine when nothing is configured", () => {
    expect(hostedEngine()).toBeUndefined();
    expect(hostedModelReady()).toBe(false);
  });
  it("prefers the hosted model over an operator endpoint", () => {
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "test-key");
    endpoint();
    expect(hostedEngine()?.label).toBe(CLOUD_ENGINE_LABEL);
  });
  it("does not advertise an expired copied Vercel OIDC token as a working model", () => {
    const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) - 60 })).toString("base64url");
    vi.stubEnv("VERCEL_OIDC_TOKEN", `header.${payload}.signature`);
    expect(hostedModelReady()).toBe(false);
  });
  it("accepts a fresh OIDC token when it has time for a request", () => {
    const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url");
    vi.stubEnv("VERCEL_OIDC_TOKEN", `header.${payload}.signature`);
    expect(hostedModelReady()).toBe(true);
  });
  it("falls back to the operator endpoint, and says which engine ran", async () => {
    endpoint();
    vi.stubEnv("HEALTH_MODEL_REASONING_EFFORT", "none");
    const engine = hostedEngine();
    expect(engine?.label).toBe(ENDPOINT_ENGINE_LABEL);
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ choices: [{ message: { content: "  told  " } }] }),
        { status: 200 },
      ),
    );
    expect(
      await engine!.complete("system", "question", new AbortController().signal),
    ).toBe("told");
    expect(String(fetch.mock.calls[0][0])).toBe(
      "https://model.example/v1/chat/completions",
    );
    expect(JSON.parse(String(fetch.mock.calls[0][1]?.body)).reasoning_effort).toBe("none");
  });
  it("refuses plaintext transport to a remote endpoint", async () => {
    endpoint();
    vi.stubEnv("HEALTH_MODEL_BASE_URL", "http://remote.example/v1");
    const fetch = vi.spyOn(globalThis, "fetch");
    await expect(
      hostedEngine()!.complete("s", "q", new AbortController().signal),
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("hosted completion", () => {
  it("steps down the model ladder when a rung fails", async () => {
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "test-key");
    generateText
      .mockRejectedValueOnce(new Error("429 quota exhausted"))
      .mockResolvedValueOnce({ text: "An answer from the next rung." });
    expect(
      await cloudComplete("system", "question", new AbortController().signal),
    ).toBe("An answer from the next rung.");
    expect(generateText).toHaveBeenCalledTimes(2);
  });
  it("does not keep trying after the caller stops the turn", async () => {
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "test-key");
    const controller = new AbortController();
    generateText.mockImplementationOnce(() => {
      controller.abort();
      return Promise.reject(new Error("aborted"));
    });
    await expect(
      cloudComplete("system", "question", controller.signal),
    ).rejects.toThrow("Stopped");
    expect(generateText).toHaveBeenCalledTimes(1);
  });
  it("treats an empty completion as a failure rather than an answer", async () => {
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "test-key");
    generateText.mockResolvedValue({ text: "   " });
    await expect(
      cloudComplete("s", "q", new AbortController().signal),
    ).rejects.toThrow();
  });
});

describe("a server-side turn", () => {
  it("sends no stored record to the provider and labels the engine", async () => {
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "test-key");
    generateText
      .mockResolvedValueOnce({ text: '{"tools":["references"]}' })
      .mockResolvedValueOnce({
        text: "Sleep quality matters as well as timing. Keep notes for your clinician.",
      });
    const engine = hostedEngine()!;
    const reply = await runHealthAgent("How can I understand my sleep?", DEMO, {
      complete: engine.complete,
      engineLabel: engine.label,
    });
    expect(reply.mode).toBe("ai");
    expect(reply.detail).toBe(CLOUD_ENGINE_LABEL);
    const sent = JSON.stringify(generateText.mock.calls);
    expect(sent).not.toContain(DEMO.profile.name);
    expect(sent).not.toContain(DEMO.reports[0].title);
  });
});
