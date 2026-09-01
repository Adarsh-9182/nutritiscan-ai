import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";
import {
  capThreads,

  migrateTranscript,
  retitle,
  safeThreads,
  searchThreads,
  titleFrom,
  UNTITLED,
  type Thread,
} from "./threads";

const msg = (role: UIMessage["role"], text: string, id = Math.random().toString(36)): UIMessage =>
  ({ id, role, parts: [{ type: "text", text }] }) as UIMessage;

const thread = (over: Partial<Thread> = {}): Thread => ({
  id: "t_1",
  title: UNTITLED,
  createdAt: 1,
  updatedAt: 1,
  messages: [],
  ...over,
});

describe("titleFrom", () => {
  it("names a conversation after the question that started it", () => {
    expect(titleFrom("Am I eating enough protein?")).toBe("Am I eating enough protein?");
  });

  it("truncates on a word boundary, because a mid-word cut reads as corruption", () => {
    const source = "My vitamin B12 came back low and I have been tired for weeks now";
    const title = titleFrom(source, 40);
    expect(title.endsWith("…")).toBe(true);
    expect(title.length).toBeLessThanOrEqual(41);
    // The kept text is a prefix of the original that stops where a word does:
    // the next character in the source is a space, not the rest of a word.
    const kept = title.slice(0, -1);
    expect(source.startsWith(kept)).toBe(true);
    expect(source[kept.length]).toBe(" ");
  });

  it("collapses newlines, so a pasted lab report is not a forty-line sidebar row", () => {
    expect(titleFrom("Vitamin B12: 180\nVitamin D: 34\nTSH 5.2")).toBe("Vitamin B12: 180 Vitamin D: 34 TSH 5.2");
  });

  it("falls back rather than showing an empty row", () => {
    expect(titleFrom("   \n  ")).toBe(UNTITLED);
  });
});

describe("safeThreads", () => {
  it("drops entries that are not shaped like a thread instead of crashing the sidebar", () => {
    const out = safeThreads([thread({ id: "keep" }), null, "nope", { title: "no id" }, { id: "" }]);
    expect(out.map((t) => t.id)).toEqual(["keep"]);
  });

  it("keeps a thread whose messages are corrupt, minus the corrupt messages", () => {
    const out = safeThreads([{ id: "t", title: "x", createdAt: 1, updatedAt: 2, messages: [msg("user", "hi"), { bogus: true }] }]);
    expect(out).toHaveLength(1);
    expect(out[0].messages).toHaveLength(1);
  });

  it("returns nothing for a non-array, which is what a cleared key parses to", () => {
    expect(safeThreads(null)).toEqual([]);
    expect(safeThreads({ threads: [] })).toEqual([]);
  });
});

describe("capThreads", () => {
  it("orders newest first, so the sidebar matches what you were just doing", () => {
    const out = capThreads([thread({ id: "old", updatedAt: 10 }), thread({ id: "new", updatedAt: 99 })]);
    expect(out.map((t) => t.id)).toEqual(["new", "old"]);
  });

  it("sheds whole conversations rather than half of each one", () => {
    // Half a conversation looks intact and reads as the whole exchange, which
    // is a worse failure than a conversation that is plainly gone.
    // Each thread is ~200 KB: under the per-transcript cap, so capTranscript
    // leaves it whole, but eight of them exceed the ceiling for the set.
    const fat = (id: string, updatedAt: number) =>
      thread({ id, updatedAt, messages: Array.from({ length: 40 }, () => msg("assistant", "x".repeat(5000))) });
    const input = Array.from({ length: 8 }, (_, i) => fat(`t${i}`, 100 - i));
    const out = capThreads(input);

    expect(out.length).toBeLessThan(8);
    expect(out[0].id).toBe("t0");
    // Whatever survived is whole — every message it started with is present.
    expect(out.every((t) => t.messages.length === 40)).toBe(true);
  });

  it("never empties the list entirely, however large the newest thread is", () => {
    const huge = thread({ id: "only", messages: Array.from({ length: 50 }, () => msg("assistant", "y".repeat(20_000))) });
    expect(capThreads([huge])).toHaveLength(1);
  });
});

describe("migrateTranscript", () => {
  it("carries an in-progress conversation forward as the first thread", () => {
    const out = migrateTranscript([], [msg("user", "I have a fever."), msg("assistant", "How long?")]);
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe("I have a fever.");
    expect(out[0].messages).toHaveLength(2);
  });

  it("does not resurrect a conversation the user already has threads instead of", () => {
    const existing = [thread({ id: "mine" })];
    expect(migrateTranscript(existing, [msg("user", "old")])).toBe(existing);
  });

  it("creates nothing from an empty legacy transcript", () => {
    expect(migrateTranscript([], [])).toEqual([]);
  });
});

describe("retitle", () => {
  it("names an untitled thread once its first question exists", () => {
    expect(retitle(thread({ messages: [msg("user", "Explain my blood report.")] })).title).toBe("Explain my blood report.");
  });

  it("leaves a name the user chose alone", () => {
    const named = thread({ title: "B12 follow-up", messages: [msg("user", "something else entirely")] });
    expect(retitle(named).title).toBe("B12 follow-up");
  });

  it("leaves a thread with no user message untouched", () => {
    const empty = thread();
    expect(retitle(empty)).toBe(empty);
  });
});

describe("searchThreads", () => {
  const threads = [
    thread({ id: "a", title: "Protein intake", messages: [msg("assistant", "Aim for 1.6g per kg.")] }),
    thread({ id: "b", title: "Fever", messages: [msg("user", "38.5 since Tuesday")] }),
  ];

  it("matches a title", () => {
    expect(searchThreads(threads, "prot").map((t) => t.id)).toEqual(["a"]);
  });

  it("matches inside the conversation, not just its name", () => {
    expect(searchThreads(threads, "tuesday").map((t) => t.id)).toEqual(["b"]);
  });

  it("returns everything for an empty query", () => {
    expect(searchThreads(threads, "  ")).toHaveLength(2);
  });
});
