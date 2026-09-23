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
  // The conversation rail is remembered per browser.
  const [railShown, setRailShown] = usePanelPref("ns-rail", true);
  const reduceMotion = useReducedMotion();

  // One button per panel: on a wide screen it floats the card in and out, on
  // a narrow one it opens the same panel as a drawer.
  const toggleRail = () => (matchMedia("(min-width: 1024px)").matches ? setRailShown(!railShown) : setDrawerOpen((v) => !v));

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
      if (e.key === "Escape") {
        setDrawerOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex h-[100svh] flex-col overflow-hidden">
      {/*
        Onboarding is deliberately NOT mounted here any more.

        This component is the home page now, and it opened with a modal
        demanding a name, a weight and a height before a first-time visitor
        could read a single word or ask a single question. That is the wrong
        first thing to do to someone who arrived to find out what this is.

        The agents are told which sections of memory were actually recorded,
        so an un-onboarded visitor's answers cannot claim an unknown weight.
      */}

      {/* Slim top bar — the conversation owns the rest of the screen. */}
      <header className="flex shrink-0 items-center gap-3 border-b border-[var(--border)] px-3 py-2.5">
        <button
          type="button"
          onClick={toggleRail}
          aria-label="Show or hide conversations"
          title="Conversations"
          className="btn-ghost grid h-8 w-8 place-items-center rounded-lg"
        >
          <span aria-hidden="true">☰</span>
        </button>

        <Link href="/" className="flex items-center gap-2 rounded-lg px-1 py-0.5 focus-ring">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-[linear-gradient(135deg,var(--emerald),var(--cyan))] text-xs font-bold text-[#07130c]">+</span>
          <span className="text-[13px] font-semibold">NutritiScan</span>
        </Link>

        <span className="ml-auto hidden t-label text-[var(--text-dim)] sm:block">
          <kbd className="rounded border border-[var(--border-strong)] px-1 py-0.5 font-mono text-[10px]">⌘K</kbd> new conversation
        </span>

        <Link href="/?home" className="btn-ghost rounded-full px-3 py-1 t-label">
          Home
        </Link>

      </header>

      <div className="flex min-h-0 flex-1">
        {/*
          Floating rail from lg up: a card lifted off the ground rather than a
          column ruled off from the chat, and it can be put away entirely so
          the conversation takes the whole width.
        */}
        <AnimatePresence initial={false}>
          {railShown && (
            <motion.aside
              key="rail"
              initial={reduceMotion ? { opacity: 0 } : { width: 0, opacity: 0, x: -24 }}
              animate={reduceMotion ? { opacity: 1 } : { width: 280, opacity: 1, x: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { width: 0, opacity: 0, x: -24 }}
              transition={{ type: "spring", stiffness: 320, damping: 34 }}
              className="hidden shrink-0 overflow-hidden lg:block"
            >
              <div className="ns-float ml-3 my-3 h-[calc(100%-24px)] w-[264px]">
                <ThreadSidebar />
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

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
                className="fixed inset-0 z-40 bg-[rgba(28,25,20,.28)] lg:hidden"
              />
              <motion.aside
                initial={reduceMotion ? { opacity: 0 } : { x: -280 }}
                animate={reduceMotion ? { opacity: 1 } : { x: 0 }}
                exit={reduceMotion ? { opacity: 0 } : { x: -280 }}
                transition={{ type: "spring", stiffness: 380, damping: 36 }}
                className="ns-float ns-float-solid fixed bottom-3 left-3 top-3 z-50 w-[280px] max-w-[calc(100vw-24px)] lg:hidden"
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

/** A remembered on/off for a floating panel. Storage can throw (private mode); the default then holds. */
function usePanelPref(key: string, fallback: boolean): [boolean, (v: boolean) => void] {
  const [value, setValue] = useState(fallback);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(key);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reading a browser-only preference after hydration
      if (saved !== null) setValue(saved === "1");
    } catch {}
  }, [key]);
  const set = (v: boolean) => {
    setValue(v);
    try {
      localStorage.setItem(key, v ? "1" : "0");
    } catch {}
  };
  return [value, set];
}
