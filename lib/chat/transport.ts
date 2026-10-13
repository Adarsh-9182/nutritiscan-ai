import type { UIMessage } from "ai";

type FailureKind = "connection" | "rate-limit" | "too-large" | "invalid" | "unavailable";

export class ChatRequestError extends Error {
  constructor(readonly kind: FailureKind, readonly retryAt = 0) {
    super(kind);
    this.name = "ChatRequestError";
  }
}

/** Keep long threads within the API's context window without erasing history. */
export function chatRequestMessages(messages: UIMessage[]): UIMessage[] {
  const recent = messages.slice(-40);
  const firstUser = recent.findIndex((message) => message.role === "user");
  return recent.slice(Math.max(0, firstUser)).map((message) => ({
    ...message,
    // UI-only notes, sources and traces do not need to be re-uploaded.
    parts: message.parts.filter((part) => !part.type.startsWith("data-")),
  }));
}

function retryAt(header: string | null): number {
  const now = Date.now();
  if (!header) return now + 30_000;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return now + seconds * 1_000;
  const date = Date.parse(header);
  return Number.isFinite(date) && date > now ? date : now + 30_000;
}

/** Translate HTTP failures without displaying server or provider internals. */
export async function fetchChat(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(input, init);
  } catch (error) {
    // The Stop button remains an intentional cancellation, not a failure.
    if (init?.signal?.aborted || (error instanceof Error && error.name === "AbortError")) throw error;
    throw new ChatRequestError("connection");
  }
  if (response.ok) return response;
  void response.body?.cancel().catch(() => {});
  if (response.status === 429) throw new ChatRequestError("rate-limit", retryAt(response.headers.get("retry-after")));
  if (response.status === 413) throw new ChatRequestError("too-large");
  if (response.status === 400) throw new ChatRequestError("invalid");
  throw new ChatRequestError("unavailable");
}

export function chatFailure(error: Error) {
  const kind = error instanceof ChatRequestError ? error.kind : "unavailable";
  switch (kind) {
    case "connection":
      return { message: "Connection lost. Your message is still here. Check your connection, then try again.", newChat: false };
    case "rate-limit":
      return { message: "A few too many messages at once. Your message is still here; wait a moment before retrying.", newChat: false };
    case "too-large":
      return { message: "This conversation is too large to send. Start a new chat with a shorter question or report section. This chat stays in your history.", newChat: true };
    case "invalid":
      return { message: "This conversation could not be sent. Start a new chat and ask again. This chat stays in your history.", newChat: true };
    default:
      return { message: "That answer didn’t come through. Your message is still here; please try again.", newChat: false };
  }
}
