/**
 * OpenAI-compatible streaming chat (Groq by default). Configuration:
 *   HEALTH_MODEL_BASE_URL   e.g. https://api.groq.com/openai/v1
 *   HEALTH_MODEL_NAME       e.g. openai/gpt-oss-120b
 *   HEALTH_MODEL_FALLBACK   optional second model, tried on 429/5xx
 *   HEALTH_MODEL_API_KEY
 *   HEALTH_MODEL_APPROVED   "true" once the provider's data terms are reviewed
 */
export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export function cloudModelReady() {
  return Boolean(
    process.env.HEALTH_MODEL_BASE_URL &&
    process.env.HEALTH_MODEL_NAME &&
    process.env.HEALTH_MODEL_APPROVED === "true",
  );
}

export class ModelUnavailable extends Error {}

/** A short provider label for traces, never the full URL. */
export function providerName() {
  try {
    const host = new URL(process.env.HEALTH_MODEL_BASE_URL ?? "").hostname;
    return host.includes("groq")
      ? "groq"
      : host === "127.0.0.1" || host === "localhost"
        ? "local"
        : "other";
  } catch {
    return "none";
  }
}

function endpoint() {
  const base = new URL(process.env.HEALTH_MODEL_BASE_URL ?? "");
  const local = ["127.0.0.1", "localhost", "[::1]"].includes(base.hostname);
  if (base.protocol !== "https:" && !local)
    throw new ModelUnavailable("HTTPS required");
  return `${base.toString().replace(/\/$/, "")}/chat/completions`;
}

async function open(
  model: string,
  messages: ChatMessage[],
  signal: AbortSignal,
  fetcher: typeof fetch,
) {
  return fetcher(endpoint(), {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      ...(process.env.HEALTH_MODEL_API_KEY
        ? { Authorization: `Bearer ${process.env.HEALTH_MODEL_API_KEY}` }
        : {}),
    },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      temperature: 0.4,
      max_tokens: 1400,
      ...(/gpt-oss/.test(model) ? { reasoning_effort: "low" } : {}),
    }),
  });
}

/** Yields text as it arrives. Tries the fallback model only if the primary
 * fails before sending anything. */
export async function* streamChat(
  messages: ChatMessage[],
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): AsyncGenerator<string> {
  if (!cloudModelReady()) throw new ModelUnavailable("Not configured");
  const models = [
    process.env.HEALTH_MODEL_NAME!,
    ...(process.env.HEALTH_MODEL_FALLBACK
      ? [process.env.HEALTH_MODEL_FALLBACK]
      : []),
  ];
  let response: Response | undefined;
  for (const model of models) {
    response = await open(model, messages, signal, fetcher);
    if (response.ok && response.body) break;
    if (response.status !== 429 && response.status < 500) break;
  }
  if (!response?.ok || !response.body)
    throw new ModelUnavailable(`Provider ${response?.status ?? "error"}`);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline: number;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") return;
      try {
        const delta = JSON.parse(data).choices?.[0]?.delta?.content;
        // Reasoning tokens arrive in a separate field and are never shown.
        if (typeof delta === "string" && delta) yield delta;
      } catch {
        // Ignore keep-alive or malformed lines.
      }
    }
  }
}
