"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Chat from "@/components/chat";
import ThreadSidebar from "@/components/thread-sidebar";
import AuthNav from "@/components/auth-nav";
import { clearPendingConversationImport, newThread, readPendingConversationImport, readThreads, replaceThreads, savePendingConversationImport, setAccountSyncEnabled, useProfile } from "@/lib/memory/store";
import type { Thread } from "@/lib/memory/threads";

type SyncStatus = "anonymous" | "off" | "on" | "error";

/**
 * The full-page conversation.
 *
 * The conversation gets the full workspace, with previous chats in a
 * collapsible history panel.
 *
 * On narrow screens the sidebar is a drawer rather than a column: a 260px
 * rail alongside a chat on a phone leaves neither usable.
 */
export default function ChatWorkspace() {
  const [profile] = useProfile();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [syncReady, setSyncReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("anonymous");
  const [pendingImport, setPendingImport] = useState<Thread[]>([]);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncError, setSyncError] = useState("");
  // The conversation list can be tucked away to give the chat more room.
  const [railShown, setRailShown] = usePanelPref("ns-rail", true);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    let live = true;
    const load = async () => {
      try {
        const response = await fetch("/api/conversations", { cache: "no-store" });
        if (!live) return;
        if (response.status === 401) {
          setAccountSyncEnabled(false);
          setSyncStatus("anonymous");
          return;
        }
        if (!response.ok) throw new Error("Could not check account chat sync.");
        const data = await response.json() as { enabled: boolean; conversations: Thread[] };
        if (!live) return;
        if (data.enabled) {
          const local = readThreads();
          const remoteById = new Map(data.conversations.map((thread) => [thread.id, thread.updatedAt]));
          const pending = readPendingConversationImport();
          const candidates = pending.length ? pending : local.filter((thread) => !remoteById.has(thread.id) || thread.updatedAt > (remoteById.get(thread.id) ?? 0));
          setPendingImport(candidates);
          if (candidates.length) savePendingConversationImport(candidates);
          replaceThreads(data.conversations);
          setAccountSyncEnabled(true);
          setSyncStatus("on");
        } else {
          setAccountSyncEnabled(false);
          setSyncStatus("off");
        }
      } catch {
        if (live) {
          setAccountSyncEnabled(false);
          setSyncStatus("error");
        }
      } finally {
        if (live) setSyncReady(true);
      }
    };
    void load();
    return () => { live = false; };
  }, []);

  useEffect(() => {
    const onSyncError = () => setSyncError("A conversation could not be synced. Your browser copy is still here; check your connection and keep this tab open.");
    window.addEventListener("ns-account-sync-error", onSyncError);
    return () => window.removeEventListener("ns-account-sync-error", onSyncError);
  }, []);

  const postImport = useCallback(async (threads: Thread[]) => {
    setSyncBusy(true);
    setSyncError("");
    try {
      const response = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "enable", conversations: threads }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save conversations.");
      replaceThreads(data.conversations as Thread[]);
      clearPendingConversationImport();
      setPendingImport([]);
      setAccountSyncEnabled(true);
      setSyncStatus("on");
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "Could not save conversations.");
    } finally { setSyncBusy(false); }
  }, []);

  const enableSync = useCallback(() => postImport(readThreads()), [postImport]);
  const importLocal = useCallback(() => {
    const current = readThreads();
    const combined = [...new Map([...current, ...pendingImport].map((thread) => [thread.id, thread])).values()];
    void postImport(combined);
  }, [pendingImport, postImport]);

  // On a wide screen the conversation list is a floating panel; on a narrow
  // screen it opens as a drawer.
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
      if (e.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!syncReady) return <div className="grid h-[100svh] place-items-center text-sm text-[var(--text-dim)]">Loading your conversations…</div>;

  return (
    <div className="flex h-[100svh] flex-col overflow-hidden">
      {/*
        Onboarding is deliberately NOT mounted here any more.

        This component is the home page now, and it opened with a modal
        demanding a name, a weight and a height before a first-time visitor
        could read a single word or ask a single question. That is the wrong
        first thing to do to someone who arrived to find out what this is.

        The agents are told which parts of the local profile were actually
        recorded (recordedSections), so they ask when relevant context is
        missing instead of assuming details.
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

        <Link href="/" className="btn-ghost rounded-full px-3 py-1 t-label">
          Home
        </Link>

        <Link href="/research" className="btn-ghost rounded-full px-3 py-1 t-label">
          Research
        </Link>

        <AuthNav />
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
                <ThreadSidebar syncStatus={syncStatus} pendingImportCount={pendingImport.length} syncBusy={syncBusy} syncError={syncError} onEnableSync={enableSync} onImportLocal={importLocal} />
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
                <ThreadSidebar onNavigate={() => setDrawerOpen(false)} syncStatus={syncStatus} pendingImportCount={pendingImport.length} syncBusy={syncBusy} syncError={syncError} onEnableSync={enableSync} onImportLocal={importLocal} />
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
