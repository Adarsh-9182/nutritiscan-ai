// ============================================================
// CONVERSATIONS
//
// transcript.ts gave the chat one memory. This gives it many.
//
// A single transcript forces every question into the same thread, and
// the only way out was "Clear", which deleted the history rather than
// setting it aside. In a health product that is the wrong shape: a
// three-week thread about a recurring headache and a passing question
// about protein are not the same conversation, and neither should cost
// you the other.
//
// Same storage caveat as the rest of the memory — health data in
// localStorage on one device. See the note at the top of store.ts.
// ============================================================

import type { UIMessage } from "ai";
import { capTranscript, safeTranscript } from "./transcript";

export const THREADS_KEY = "ns-threads-v1";
export const ACTIVE_THREAD_KEY = "ns-thread-active-v1";

export type Thread = {
  readonly id: string;
  /** Derived from the opening question, or renamed by the user. */
  readonly title: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly messages: UIMessage[];
};

/** Enough to keep a real history; bounded so the list stays navigable. */
export const MAX_THREADS = 40;

/**
 * localStorage is a shared ~5 MB across the whole origin — the profile, the
 * meal log and the labs live in it too. One transcript was capped at 256 KB;
 * forty of those would not fit, so the *set* carries its own ceiling and
 * sheds whole conversations from the oldest end rather than corrupting the
 * newest one.
 */
const MAX_TOTAL_BYTES = 1_500_000;

export const newThreadId = () => `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

/** What an untouched, unopened conversation is called. */
export const UNTITLED = "New conversation";

/**
 * Name a thread after the question that started it.
 *
 * Titles are a navigation aid, so they are truncated on a word boundary —
 * a title cut mid-word reads as corruption rather than as brevity. Newlines
 * collapse because a pasted lab report would otherwise make one row of the
 * sidebar forty lines tall.
 */
export function titleFrom(text: string, max = 48): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return UNTITLED;
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** The text of a message, ignoring tool calls, traces and notes. */
export function textOf(message: UIMessage): string {
  return message.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("")
    .trim();
}

export function createThread(messages: UIMessage[] = [], now = Date.now()): Thread {
  const firstUser = messages.find((m) => m.role === "user");
  return {
    id: newThreadId(),
    title: firstUser ? titleFrom(textOf(firstUser)) : UNTITLED,
    createdAt: now,
    updatedAt: now,
    messages,
  };
}

/**
 * Whatever is in localStorage is untrusted by the time it reaches React: a
 * hand-edited or half-written entry that is not shaped like a Thread would
 * take down the sidebar and the conversation with it. Anything unrecognisable
 * is dropped rather than repaired — a thread we cannot read is not a thread
 * we should show a title for.
 */
export function safeThreads(input: unknown): Thread[] {
  if (!Array.isArray(input)) return [];
  const out: Thread[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const t = raw as Partial<Thread>;
    if (typeof t.id !== "string" || !t.id) continue;
    out.push({
      id: t.id,
      title: typeof t.title === "string" && t.title.trim() ? t.title : UNTITLED,
      createdAt: typeof t.createdAt === "number" ? t.createdAt : 0,
      updatedAt: typeof t.updatedAt === "number" ? t.updatedAt : 0,
      messages: safeTranscript(t.messages),
    });
  }
  return out;
}

/**
 * Bound the stored set: newest first, each thread trimmed by the same rule a
 * lone transcript used, then whole threads dropped from the end until the
 * total fits.
 *
 * Dropping whole threads rather than trimming every thread a little is
 * deliberate. A conversation missing its first half is worse than one that is
 * gone — it looks intact, and a reader would take the remaining half as the
 * whole exchange.
 */
export function capThreads(threads: Thread[]): Thread[] {
  let out = [...threads]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_THREADS)
    .map((t) => ({ ...t, messages: capTranscript(t.messages) }));

  while (out.length > 1 && JSON.stringify(out).length > MAX_TOTAL_BYTES) out = out.slice(0, -1);
  return out;
}

/**
 * Carry the old single transcript forward as the first conversation.
 *
 * Someone mid-consultation when this ships must not lose it. Runs only when
 * there are no threads yet, so it cannot resurrect a conversation the user
 * has since deleted.
 */
export function migrateTranscript(existing: Thread[], legacy: UIMessage[]): Thread[] {
  if (existing.length || !legacy.length) return existing;
  return [createThread(legacy)];
}

/**
 * Rename a thread from its first user message, unless the user has named it.
 *
 * The check is against UNTITLED rather than a stored "was renamed" flag: a
 * flag is one more thing that can desynchronise, and a thread whose title is
 * still the placeholder is by definition one nobody has named.
 */
export function retitle(thread: Thread): Thread {
  if (thread.title !== UNTITLED) return thread;
  const firstUser = thread.messages.find((m) => m.role === "user");
  if (!firstUser) return thread;
  const title = titleFrom(textOf(firstUser));
  return title === UNTITLED ? thread : { ...thread, title };
}

/** Case-insensitive search over titles and message text. */
export function searchThreads(threads: readonly Thread[], query: string): Thread[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...threads];
  return threads.filter(
    (t) =>
      t.title.toLowerCase().includes(q) ||
      t.messages.some((m) => textOf(m).toLowerCase().includes(q)),
  );
}
