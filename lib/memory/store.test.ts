/**
 * The conversation state machine, exercised against a real storage shim.
 *
 * threads.ts holds the pure rules; this file covers the part that has state —
 * what "new", "select" and "delete" actually do to what is stored and to
 * which conversation is open. That logic only ever ran in a browser, which
 * meant it only ever ran by hand.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UIMessage } from "ai";
import { CHAT_KEY } from "./transcript";
import { ACTIVE_THREAD_KEY, THREADS_KEY, UNTITLED } from "./threads";

/** The smallest thing that behaves like localStorage, plus the window it hangs off. */
class MemoryStorage {
  private map = new Map<string, string>();
  getItem = (k: string) => this.map.get(k) ?? null;
  setItem = (k: string, v: string) => void this.map.set(k, v);
  removeItem = (k: string) => void this.map.delete(k);
  clear = () => this.map.clear();
}

const storage = new MemoryStorage();
vi.stubGlobal("localStorage", storage);
vi.stubGlobal("window", { localStorage: storage, addEventListener() {}, removeEventListener() {} });

const store = await import("./store");

const msg = (role: UIMessage["role"], text: string): UIMessage =>
  ({ id: `m_${Math.random().toString(36).slice(2)}`, role, parts: [{ type: "text", text }] }) as UIMessage;

beforeEach(() => storage.clear());

describe("conversations", () => {
  it("opens a first conversation rather than rendering nothing", () => {
    const thread = store.readActiveThread();
    expect(thread.title).toBe(UNTITLED);
    expect(store.readThreads()).toHaveLength(1);
    expect(localStorage.getItem(ACTIVE_THREAD_KEY)).toContain(thread.id);
  });

  it("carries a pre-threads transcript forward instead of losing it", () => {
    // Someone mid-consultation when this shipped must not come back to a
    // blank greeting from something claiming to remember them.
    localStorage.setItem(CHAT_KEY, JSON.stringify([msg("user", "I have a fever."), msg("assistant", "How long?")]));

    const threads = store.readThreads();
    expect(threads).toHaveLength(1);
    expect(threads[0].title).toBe("I have a fever.");
    // Copied, then the legacy key cleared — a second stale copy of a health
    // conversation must not sit in storage forever.
    expect(JSON.parse(localStorage.getItem(CHAT_KEY)!)).toEqual([]);
  });

  it("names a conversation after its first question once one exists", () => {
    const thread = store.readActiveThread();
    store.saveThread(thread.id, [msg("user", "Am I eating enough protein?")]);
    expect(store.readThreads()[0].title).toBe("Am I eating enough protein?");
  });

  it("keeps a name the user chose", () => {
    const thread = store.readActiveThread();
    store.renameThread(thread.id, "B12 follow-up");
    store.saveThread(thread.id, [msg("user", "something else entirely")]);
    expect(store.readThreads()[0].title).toBe("B12 follow-up");
  });

  it("does not resurrect a conversation that was deleted mid-save", () => {
    // A save landing after a delete is a race, not an instruction.
    const thread = store.readActiveThread();
    // Give it content, or `newThread` correctly reuses this same blank one
    // and there is no second conversation to survive the delete.
    store.saveThread(thread.id, [msg("user", "fever")]);
    const other = store.newThread();
    store.deleteThread(thread.id);
    store.saveThread(thread.id, [msg("user", "late arrival")]);

    const ids = store.readThreads().map((t) => t.id);
    expect(ids).not.toContain(thread.id);
    expect(ids).toContain(other.id);
  });

  it("reuses the open blank conversation instead of stacking empty rows", () => {
    const first = store.newThread();
    expect(store.newThread().id).toBe(first.id);
    expect(store.readThreads().filter((t) => t.messages.length === 0)).toHaveLength(1);
  });

  it("starts a genuinely new one once the current has something in it", () => {
    const first = store.readActiveThread();
    store.saveThread(first.id, [msg("user", "fever")]);
    const second = store.newThread();
    expect(second.id).not.toBe(first.id);
    expect(store.readThreads()).toHaveLength(2);
  });

  it("moves to a surviving conversation when the open one is deleted", () => {
    const first = store.readActiveThread();
    store.saveThread(first.id, [msg("user", "fever")]);
    const second = store.newThread();

    store.deleteThread(second.id);
    expect(localStorage.getItem(ACTIVE_THREAD_KEY)).toContain(first.id);
    expect(store.readActiveThread().id).toBe(first.id);
  });

  it("never leaves the chat with nothing to render", () => {
    const only = store.readActiveThread();
    store.deleteThread(only.id);
    expect(store.readThreads()).toHaveLength(1);
    expect(store.readThreads()[0].id).not.toBe(only.id);
  });

  it("resumes the most recent conversation when the stored id has gone stale", () => {
    // Deleted in another tab, or shed by the cap. That is not the same as
    // the user asking to start over.
    const thread = store.readActiveThread();
    store.saveThread(thread.id, [msg("user", "fever")]);
    localStorage.setItem(ACTIVE_THREAD_KEY, JSON.stringify("t_does_not_exist"));

    expect(store.readActiveThread().id).toBe(thread.id);
  });

  it("ignores a request to open a conversation that does not exist", () => {
    const thread = store.readActiveThread();
    store.selectThread("t_nope");
    expect(store.readActiveThread().id).toBe(thread.id);
  });

  it("survives storage that has been hand-edited into nonsense", () => {
    localStorage.setItem(THREADS_KEY, "{not json");
    expect(() => store.readThreads()).not.toThrow();
    expect(store.readActiveThread().title).toBe(UNTITLED);
  });

  it("deletes everything on request, legacy transcript included", () => {
    const thread = store.readActiveThread();
    store.saveThread(thread.id, [msg("user", "my blood report")]);
    store.newThread();

    store.deleteAllThreads();
    const remaining = store.readThreads();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].messages).toEqual([]);
    expect(remaining[0].id).not.toBe(thread.id);
  });
});
