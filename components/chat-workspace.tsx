"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Chat from "@/components/chat";
import ThreadSidebar from "@/components/thread-sidebar";
import { newThread, useProfile } from "@/lib/memory/store";

/**
 * The full-page conversation.
 *
 * The dashboard embeds the same chat in a 78svh panel between two rails of
 * cards, which is right when you are glancing at it and wrong when you are
 * actually in a consultation — a long differential does not fit, and the
 * surrounding cards compete with the thing you are reading. This is the same
 * conversation with the room to have it, plus the history beside it.
 *
 * On narrow screens the sidebar is a drawer rather than a column: a 260px
 * rail alongside a chat on a phone leaves neither usable.
 */
export default function ChatWorkspace() {
  const [profile] = useProfile();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const reduceMotion = useReducedMotion();

  /*
   * Keyboard shortcuts, scoped to not steal keys from the composer.
   *
   * Cmd/Ctrl+K starts a new conversation and Escape closes the drawer. A
   * bare "/" to focus the input is deliberately absent: this composer is a
   * textarea people type sentences into, and swallowing a slash mid-sentence
   * is worse than the shortcut is useful.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        newThread();
        setDrawerOpen(false);
      }
      if (e.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex h-[100svh] flex-col overflow-hidden">
      {/* Slim top bar — the conversation owns the rest of the screen. */}
      <header className="flex shrink-0 items-center gap-3 border-b border-[var(--border)] px-3 py-2.5">
        <button
          type="button"
          onClick={() => setDrawerOpen((v) => !v)}
          aria-label={drawerOpen ? "Hide conversations" : "Show conversations"}
          aria-expanded={drawerOpen}
          className="btn-ghost grid h-8 w-8 place-items-center rounded-lg lg:hidden"
        >
          <span aria-hidden="true">☰</span>
        </button>

        <Link href="/dashboard" className="flex items-center gap-2 rounded-lg px-1 py-0.5 focus-ring">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-[linear-gradient(135deg,var(--emerald),var(--cyan))] text-xs font-bold text-[#04120c]">✦</span>
          <span className="text-[13px] font-semibold">NutritiScan</span>
        </Link>

        <span className="ml-auto hidden t-label text-[var(--text-dim)] sm:block">
          <kbd className="rounded border border-[var(--border-strong)] px-1 py-0.5 font-mono text-[10px]">⌘K</kbd> new conversation
        </span>

        {/*
          The same destinations the rest of the app has, in the slim bar this
          page needs. A single "Dashboard" link meant every other surface was
          two hops from the conversation, which is backwards for the surface
          people spend the most time in.
        */}
        <nav aria-label="Primary" className="flex items-center gap-1 rounded-full border border-[var(--border)] p-1">
          {[
            { href: "/dashboard", label: "Dashboard" },
            { href: "/scan", label: "Scan" },
            { href: "/timeline", label: "Timeline" },
          ].map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-full px-3 py-1 t-label text-[var(--text-dim)] transition hover:bg-[var(--surface-2)] hover:text-white focus-ring"
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Permanent rail from lg up. */}
        <aside className="hidden w-[264px] shrink-0 border-r border-[var(--border)] lg:block">
          <ThreadSidebar />
        </aside>

        {/* Drawer below lg. */}
        <AnimatePresence>
          {drawerOpen && (
            <>
              <motion.button
                type="button"
                aria-label="Close conversations"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setDrawerOpen(false)}
                className="fixed inset-0 z-40 bg-black/50 lg:hidden"
              />
              <motion.aside
                initial={reduceMotion ? { opacity: 0 } : { x: -280 }}
                animate={reduceMotion ? { opacity: 1 } : { x: 0 }}
                exit={reduceMotion ? { opacity: 0 } : { x: -280 }}
                transition={{ type: "spring", stiffness: 380, damping: 36 }}
                className="fixed inset-y-0 left-0 z-50 w-[280px] border-r border-[var(--border)] bg-[var(--bg)] lg:hidden"
              >
                <ThreadSidebar onNavigate={() => setDrawerOpen(false)} />
              </motion.aside>
            </>
          )}
        </AnimatePresence>

        {/*
          A reading measure, not a full-bleed column. Medical prose set across
          a 1600px monitor is unreadable, which is why every assistant that
          does this centres its transcript.
        */}
        <main className="min-w-0 flex-1">
          <div className="mx-auto h-full w-full max-w-3xl">
            <Chat profile={profile} />
          </div>
        </main>
      </div>
    </div>
  );
}
