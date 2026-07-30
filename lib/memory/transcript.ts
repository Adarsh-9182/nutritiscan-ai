// ============================================================
// CONVERSATION MEMORY
//
// The product's promise is "Your Health Has A Memory". Until this
// file existed, the one surface where a user actually *talks* to
// that memory forgot everything on refresh: `useChat` holds its
// transcript in React state and nothing wrote it down. You could
// describe your symptoms, close the tab, and come back to a blank
// greeting from something claiming to remember you.
//
// Stored alongside the profile and the meal log, under the same
// caveat: this is health data in localStorage on a single device.
// See the note at the top of store.ts.
// ============================================================

import type { UIMessage } from "ai";

export const CHAT_KEY = "ns-chat-v1";

/** Beyond this the transcript is history, not context, and it costs quota. */
const MAX_MESSAGES = 50;

/**
 * localStorage is a shared, unforgiving ~5 MB. A long conversation carrying
 * tool inputs and outputs will reach that, and a failed write is silent — so
 * the transcript is trimmed from the front until it comfortably fits.
 */
const MAX_BYTES = 256_000;

export function capTranscript(messages: UIMessage[]): UIMessage[] {
  let out = messages.slice(-MAX_MESSAGES);
  while (out.length > 1 && JSON.stringify(out).length > MAX_BYTES) {
    out = out.slice(Math.ceil(out.length / 4));
  }
  return out;
}

/**
 * Guard the other direction too: whatever is in localStorage is untrusted
 * input by the time it reaches React, and a hand-edited entry that isn't
 * shaped like a UIMessage would crash the transcript on mount.
 */
export function safeTranscript(input: unknown): UIMessage[] {
  if (!Array.isArray(input)) return [];
  return input.filter(
    (m): m is UIMessage =>
      !!m &&
      typeof m === "object" &&
      typeof (m as UIMessage).id === "string" &&
      (["user", "assistant", "system"] as const).includes((m as UIMessage).role) &&
      Array.isArray((m as UIMessage).parts),
  );
}
