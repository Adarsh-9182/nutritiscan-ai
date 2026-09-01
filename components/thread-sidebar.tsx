"use client";

import { useMemo, useRef, useState } from "react";
import { DAY_MS, useStartOfToday } from "@/lib/clock";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { deleteAllThreads, deleteThread, newThread, renameThread, selectThread, useActiveThreadId, useThreads } from "@/lib/memory/store";
import { searchThreads, textOf, type Thread } from "@/lib/memory/threads";

/**
 * Group conversations the way a person remembers them — by when, not by id.
 * A flat list of forty titles is a filing cabinet; "Today / Yesterday" is a
 * memory.
 */
function bucketOf(updatedAt: number, startOfToday: number): string {
  if (updatedAt >= startOfToday) return "Today";
  if (updatedAt >= startOfToday - DAY_MS) return "Yesterday";
  if (updatedAt >= startOfToday - 7 * DAY_MS) return "Previous 7 days";
  if (updatedAt >= startOfToday - 30 * DAY_MS) return "Previous 30 days";
  return "Older";
}

const BUCKET_ORDER = ["Today", "Yesterday", "Previous 7 days", "Previous 30 days", "Older"];

/** Server render, before the clock is known: everything is simply "Recent". */
const UNTIMED = "Recent";

/** The first thing the assistant said, as a one-line preview. */
function previewOf(thread: Thread): string {
  const reply = thread.messages.find((m) => m.role === "assistant");
  const text = reply ? textOf(reply) : "";
  return text.replace(/\s+/g, " ").slice(0, 70);
}

export default function ThreadSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const threads = useThreads();
  const activeId = useActiveThreadId();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [confirmingClearAll, setConfirmingClearAll] = useState(false);
  const reduceMotion = useReducedMotion();
  const renameRef = useRef<HTMLInputElement>(null);

  const startOfToday = useStartOfToday();

  const groups = useMemo(() => {
    const found = searchThreads(threads, query);
    const map = new Map<string, Thread[]>();
    for (const t of found) {
      const bucket = startOfToday ? bucketOf(t.updatedAt, startOfToday) : UNTIMED;
      map.set(bucket, [...(map.get(bucket) ?? []), t]);
    }
    const order = startOfToday ? BUCKET_ORDER : [UNTIMED];
    return order.filter((b) => map.has(b)).map((b) => [b, map.get(b)!] as const);
  }, [threads, query, startOfToday]);

  const startRename = (thread: Thread) => {
    setEditing(thread.id);
    setDraft(thread.title);
    // Focus after the input exists. Selecting the text as well means the
    // common case — replacing an auto-generated title — is one keystroke.
    queueMicrotask(() => renameRef.current?.select());
  };

  const commitRename = () => {
    if (editing) renameThread(editing, draft);
    setEditing(null);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2.5 border-b border-[var(--border)] p-3">
        <button
          type="button"
          onClick={() => {
            newThread();
            onNavigate?.();
          }}
          className="btn-primary flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-[13px] font-medium"
        >
          <span aria-hidden="true">+</span> New conversation
        </button>

        <div className="relative">
          <label htmlFor="thread-search" className="sr-only">
            Search your conversations
          </label>
          <input
            id="thread-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search conversations…"
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 pl-8 text-[13px] text-white outline-none transition-colors placeholder:text-[var(--text-dim)] focus:border-[color-mix(in_oklab,var(--emerald)_50%,transparent)]"
          />
          <span aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-dim)]">
            ⌕
          </span>
        </div>
      </div>

      <nav aria-label="Your conversations" className="scroll-thin min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {groups.length === 0 && (
          <p className="px-2 py-6 text-center text-[13px] text-[var(--text-dim)]">
            {query ? "Nothing matches that." : "No conversations yet."}
          </p>
        )}

        {groups.map(([bucket, items]) => (
          <div key={bucket} className="mb-3">
            <p className="px-2 pb-1 t-label uppercase tracking-wide text-[var(--text-dim)]">{bucket}</p>
            <ul className="space-y-0.5">
              <AnimatePresence initial={false}>
                {items.map((t) => {
                  const active = t.id === activeId;
                  return (
                    <motion.li
                      key={t.id}
                      layout={!reduceMotion}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0, height: 0 }}
                      className="group relative"
                    >
                      {editing === t.id ? (
                        <input
                          ref={renameRef}
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          onBlur={commitRename}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitRename();
                            if (e.key === "Escape") setEditing(null);
                          }}
                          aria-label={`Rename ${t.title}`}
                          className="w-full rounded-lg border border-[color-mix(in_oklab,var(--emerald)_50%,transparent)] bg-[var(--surface-2)] px-2.5 py-2 text-[13px] text-white outline-none"
                        />
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              selectThread(t.id);
                              onNavigate?.();
                            }}
                            aria-current={active ? "true" : undefined}
                            className={`block w-full rounded-lg px-2.5 py-2 pr-14 text-left transition ${
                              active ? "bg-[var(--surface-2)]" : "hover:bg-[var(--surface)]"
                            }`}
                          >
                            <span className={`block truncate text-[13px] ${active ? "text-white" : "text-[var(--text-muted)]"}`}>
                              {t.title}
                            </span>
                            {previewOf(t) && (
                              <span className="mt-0.5 block truncate t-label text-[var(--text-dim)]">{previewOf(t)}</span>
                            )}
                          </button>

                          {/* Row controls. Revealed on hover, and on
                              focus-visible so they are reachable by keyboard
                              rather than being a mouse-only feature. */}
                          <div className="absolute right-1 top-1.5 flex gap-0.5 opacity-0 transition focus-within:opacity-100 group-hover:opacity-100">
                            <button
                              type="button"
                              onClick={() => startRename(t)}
                              aria-label={`Rename ${t.title}`}
                              title="Rename"
                              className="grid h-7 w-6 place-items-center rounded-md text-[11px] text-[var(--text-dim)] transition hover:bg-[var(--surface-2)] hover:text-white focus-ring"
                            >
                              <span aria-hidden="true">✎</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteThread(t.id)}
                              aria-label={`Delete ${t.title}`}
                              title="Delete"
                              className="grid h-7 w-6 place-items-center rounded-md text-[11px] text-[var(--text-dim)] transition hover:bg-[color-mix(in_oklab,var(--rose)_18%,transparent)] hover:text-[var(--rose)] focus-ring"
                            >
                              <span aria-hidden="true">✕</span>
                            </button>
                          </div>
                        </>
                      )}
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ul>
          </div>
        ))}
      </nav>

      {/* Deleting every health conversation at once is not something to do on
          a mis-click, so it asks — inline, rather than through a dialog that
          would trap focus over a chat someone may be mid-sentence in. */}
      <div className="border-t border-[var(--border)] p-2">
        {confirmingClearAll ? (
          <div className="flex items-center gap-2 px-1 py-1">
            <span className="flex-1 t-label text-[var(--text-muted)]">Delete every conversation?</span>
            <button
              type="button"
              onClick={() => {
                deleteAllThreads();
                setConfirmingClearAll(false);
              }}
              className="rounded-md border border-[color-mix(in_oklab,var(--rose)_45%,transparent)] px-2 py-1 t-label text-[var(--rose)] focus-ring"
            >
              Delete
            </button>
            <button type="button" onClick={() => setConfirmingClearAll(false)} className="rounded-md px-2 py-1 t-label text-[var(--text-dim)] hover:text-white focus-ring">
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingClearAll(true)}
            disabled={threads.every((t) => t.messages.length === 0)}
            className="w-full rounded-lg px-2.5 py-2 text-left t-label text-[var(--text-dim)] transition hover:text-white disabled:opacity-40 focus-ring"
          >
            Delete all conversations
          </button>
        )}
      </div>
    </div>
  );
}
