export type CompanionEvent =
  | { t: "delta"; v: string }
  | { t: "replace"; v: string; mode?: "escalation" }
  | { t: "done" }
  | { t: "error"; v: string };

/** Reads the NDJSON answer stream from /api/companion. Resolves when the
 * stream ends; rejects if the request itself could not start. */
export async function streamCompanion(
  messages: { role: "user" | "assistant"; text: string }[],
  onEvent: (event: CompanionEvent) => void,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
) {
  const response = await fetcher("/api/companion", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: messages.slice(-24) }),
    signal,
  });
  if (!response.ok || !response.body) {
    const detail = await response.json().catch(() => ({}));
    throw Object.assign(
      new Error(detail.error || "The AI is unavailable right now."),
      { status: response.status },
    );
  }
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
      if (!line) continue;
      try {
        onEvent(JSON.parse(line) as CompanionEvent);
      } catch {
        // Ignore a malformed line rather than dropping the whole answer.
      }
    }
  }
}
