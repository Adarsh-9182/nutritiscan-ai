"use client";

import { useChat } from "@ai-sdk/react";
import { dictationSupport, startDictation } from "@/lib/http/dictation";
import { DefaultChatTransport } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { routeOf } from "@/lib/agents/demo";
import { followUps } from "@/lib/agents/followups";
import { agentColor, agentGlyph, agentName } from "@/lib/agents-meta";
import { deleteThread, newThread, readActiveThread, readMeals, readProfile, saveThread, useActiveThreadId, useHydrated, useThreads } from "@/lib/memory/store";
import type { Thread } from "@/lib/memory/threads";
import type { HealthProfile } from "@/lib/memory/profile";

/* --- tiny, safe markdown-lite renderer --- */
function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|_[^_]+_)/g).filter(Boolean);
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith("**") && p.endsWith("**")) return <strong key={i} className="font-semibold text-white">{p.slice(2, -2)}</strong>;
        if (p.startsWith("_") && p.endsWith("_")) return <em key={i} className="text-[var(--text-dim)]">{p.slice(1, -1)}</em>;
        return <span key={i}>{p}</span>;
      })}
    </>
  );
}

/**
 * Strip this file's markdown-lite syntax for copy-to-clipboard. Someone
 * copying an answer to hand to a clinician shouldn't paste literal `**`/`_`
 * markers — line-level structure (headers, bullets, numbering) already
 * reads fine as plain text, so only the inline emphasis markers need
 * unwrapping.
 */
function toPlainText(text: string): string {
  return text.replace(/\*\*([^*]+)\*\*|_([^_]+)_/g, (_match, bold: string | undefined, italic: string | undefined) => bold ?? italic ?? "");
}

function Markdown({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className="space-y-1.5 text-sm leading-relaxed">
      {lines.map((line, i) => {
        const t = line.trim();
        if (!t) return <div key={i} className="h-1" />;
        // Anchored to the flag glyph and to a line that *opens* with "red
        // flag" or "medical warning" (the Medical Reasoning Format's header
        // for this section — lib/agents/safety.ts). A bare /red flag/i test
        // styled "there were no red flags here" as an urgent rose alert — the
        // exact inversion of its meaning, hence the header-anchored match.
        if (t.startsWith("🚩") || /^\*{0,2}(red flags?|medical warning)\b/i.test(t))
          return <p key={i} className="rounded-lg border border-[color-mix(in_oklab,var(--rose)_40%,transparent)] bg-[color-mix(in_oklab,var(--rose)_10%,transparent)] px-3 py-1.5 text-[#ffd7dd]"><Inline text={t} /></p>;
        // A line that is *entirely* bold is a section heading, not a sentence.
        // Every agent writes them ("**Protein**", "**What stands out**") and
        // they used to render at body weight and body size, so the answers
        // arrived as one undifferentiated wall.
        if (/^\*\*[^*]+\*\*$/.test(t))
          return (
            <p key={i} className="pt-2 t-label font-semibold uppercase tracking-wide text-[var(--text-dim)] first:pt-0">
              {t.slice(2, -2)}
            </p>
          );
        if (t.startsWith("- "))
          return (
            <div key={i} className="flex gap-2 pl-1">
              <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[var(--emerald)]" />
              <span className="text-[var(--text-muted)]"><Inline text={t.slice(2)} /></span>
            </div>
          );
        if (/^\d+\.\s/.test(t))
          return <p key={i} className="pl-1 text-[var(--text-muted)]"><Inline text={t} /></p>;
        return <p key={i} className="text-[var(--text)]"><Inline text={t} /></p>;
      })}
    </div>
  );
}

// Extract the "which specialists were consulted" trace from a message.
// Demo mode → data-trace part; real mode → tool-ask* parts.
const TOOL_MAP: Record<string, string> = {
  asknutritionagent: "nutrition",
  askfitnessagent: "fitness",
  askdoctoragent: "doctor",
  asklabagent: "lab",
  askcoachagent: "coach",
};
type Trace = { agents: string[]; done: boolean; source: "demo" | "real" };

function tracesFor(m: { parts: unknown[] }): Trace | null {
  const parts = m.parts as { type: string; data?: { agents?: string[]; done?: boolean }; state?: string }[];
  const d = parts.find((p) => p.type === "data-trace");
  if (d?.data?.agents?.length) return { agents: d.data.agents, done: !!d.data.done, source: "demo" };
  const toolParts = parts.filter((p) => typeof p.type === "string" && p.type.startsWith("tool-ask"));
  if (toolParts.length) {
    const agents = [...new Set(toolParts.map((p) => TOOL_MAP[p.type.slice(5).toLowerCase()]).filter(Boolean))];
    const done = toolParts.every((p) => p.state === "output-available" || p.state === "output-error");
    if (agents.length) return { agents, done, source: "real" };
  }
  return null;
}

/**
 * The consult note.
 *
 * Collapsed by default and never mixed into the answer text: it is a record,
 * not part of the conversation, and its job is to be handed to a clinician
 * intact. Assembled server-side from ClinicalState (lib/clinical/note.ts) —
 * the copy button hands over exactly what the system concluded.
 */
type NotePart = {
  note: { verdict: string; firedRules: string[]; generatedAt: string };
  text: string;
};

function noteFor(m: { parts: unknown[] }): NotePart | null {
  const parts = m.parts as { type: string; data?: NotePart }[];
  return parts.find((p) => p.type === "data-note")?.data ?? null;
}

function ConsultNote({ note }: { note: NotePart }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(note.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — the text is still on screen to select */
    }
  };

  const urgent = note.note.verdict === "emergency" || note.note.verdict === "urgent";

  return (
    <details className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] open:bg-[var(--surface-2)]">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
        <span className="flex items-center gap-2 text-[13px] font-medium">
          Consult note
          <span
            className="rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider"
            style={{
              color: urgent ? "var(--rose)" : "var(--text-dim)",
              borderColor: urgent ? "color-mix(in oklab, var(--rose) 45%, transparent)" : "var(--border)",
            }}
          >
            {note.note.verdict}
          </span>
        </span>
        <span className="text-[11px] text-[var(--text-dim)]">for your doctor</span>
      </summary>

      <div className="border-t border-[var(--border)] px-4 py-3">
        <pre className="max-h-80 overflow-auto whitespace-pre-wrap font-mono text-[11.5px] leading-relaxed text-[var(--text-muted)]">
          {note.text}
        </pre>
        <button
          type="button"
          onClick={copy}
          className="mt-3 rounded-lg border border-[var(--border)] px-3 py-1.5 text-[11.5px] text-[var(--text-muted)] transition hover:border-[var(--border-strong)] hover:text-[var(--text)] focus-ring"
        >
          {copied ? "Copied" : "Copy note"}
        </button>
      </div>
    </details>
  );
}

const SUGGESTIONS = [
  "I have a fever.",
  "Am I eating enough protein?",
  "Explain my blood report.",
  "How's my sleep trend?",
  "Best workout for building muscle?",
];

/**
 * The transcript can only be restored on the client, and `useChat` reads its
 * initial messages exactly once. Mounting the conversation behind a hydration
 * gate is what lets us hand it the stored history at construction time instead
 * of pushing it in from an effect — no mismatch, no setState-in-effect.
 */
export default function Chat({ profile, embedded = true }: { profile: HealthProfile; embedded?: boolean }) {
  const hydrated = useHydrated();
  if (!hydrated) return <ChatSkeleton />;
  return <ThreadedChat profile={profile} embedded={embedded} />;
}

/**
 * Bind the conversation to the selected thread.
 *
 * `useChat` reads its messages once, at construction, so switching
 * conversations is a remount — hence the `key`. Pushing a different history
 * into a live `useChat` would fight it for ownership of the list, and the
 * failure mode is two conversations interleaved on screen.
 */
function ThreadedChat({ profile, embedded }: { profile: HealthProfile; embedded: boolean }) {
  const threads = useThreads();
  const activeId = useActiveThreadId();

  // Establishing the first conversation is a write, so it happens after
  // render rather than during it.
  useEffect(() => {
    readActiveThread();
  }, []);

  const thread = threads.find((t) => t.id === activeId);
  if (!thread) return <ChatSkeleton />;
  return <Conversation key={thread.id} thread={thread} profile={profile} embedded={embedded} />;
}

function ChatSkeleton() {
  return (
    <div className="flex h-full flex-col" aria-busy="true" aria-label="Loading your conversation">
      <div className="flex items-center gap-2.5 border-b border-[var(--border)] px-5 py-4">
        <span className="shimmer h-9 w-9 rounded-xl" />
        <div className="space-y-1.5">
          <span className="shimmer block h-3 w-40 rounded" />
          <span className="shimmer block h-2.5 w-56 rounded" />
        </div>
      </div>
      <div className="flex-1 space-y-4 px-5 py-5">
        <span className="shimmer ml-auto block h-10 w-2/5 rounded-2xl" />
        <span className="shimmer block h-24 w-4/5 rounded-2xl" />
      </div>
    </div>
  );
}

function Conversation({ thread, profile, embedded }: { thread: Thread; profile: HealthProfile; embedded: boolean }) {
  // Read the live memory at send time rather than mirroring it into a ref —
  // the store is already the single source of truth.
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        prepareSendMessagesRequest: ({ messages }) => ({
          body: { messages, profile: readProfile(), meals: readMeals() },
        }),
      }),
    [],
  );

  // Restored once, at construction, from the thread this component is keyed
  // to. `useChat` owns the list from here.
  const restored = useMemo(() => thread.messages, [thread.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const { messages, setMessages, sendMessage, status, error, stop, regenerate } = useChat({ transport, messages: restored });
  const [input, setInput] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  /*
   * Dictation.
   *
   * Support is read after mount, never during render: SpeechRecognition does
   * not exist on the server, and branching on it while rendering would make
   * the markup disagree with itself on hydration.
   *
   * The transcript fills the box and stops there. Auto-sending a misheard
   * symptom into a clinical pipeline is how "chest pain" becomes "just
   * plain" and the triage rules never see it.
   */
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [micError, setMicError] = useState<string | null>(null);
  const dictationRef = useRef<{ stop: () => void } | null>(null);

  // Read through useSyncExternalStore rather than an effect: this is exactly
  // the case it exists for — a value the server and client disagree about,
  // where the server snapshot is "no" and the client's is read once on
  // hydration. An effect would set state during mount and cascade a render.
  const canDictate = useSyncExternalStore(
    // Support cannot change within a session, so there is nothing to subscribe to.
    useCallback(() => () => {}, []),
    () => dictationSupport() === "available",
    () => false,
  );

  // Never leave the microphone open behind a closed consult.
  useEffect(() => () => dictationRef.current?.stop(), []);

  const toggleDictation = () => {
    if (listening) {
      dictationRef.current?.stop();
      return;
    }
    setMicError(null);
    const session = startDictation(input, navigator.language || "en-IN", {
      onCommitted: (text, tail) => {
        setInput(text);
        setInterim(tail);
      },
      onError: (message) => setMicError(message),
      onEnd: () => {
        setListening(false);
        setInterim("");
        dictationRef.current = null;
      },
    });
    if (!session) {
      setMicError("Dictation isn't available in this browser. You can type instead.");
      return;
    }
    dictationRef.current = session;
    setListening(true);
  };
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const reduceMotion = useReducedMotion();

  const busy = status === "submitted" || status === "streaming";

  // Write the transcript back only when a turn settles. Persisting on every
  // token would serialise the whole conversation to localStorage tens of times
  // per answer.
  useEffect(() => {
    if (busy) return;
    saveThread(thread.id, messages);
  }, [messages, busy, thread.id]);

  /**
   * Follow the stream, but never steal the viewport.
   *
   * This used to smooth-scroll to the bottom on every `messages` change — and
   * `messages` gets a new identity per token, so a single answer queued
   * hundreds of overlapping smooth-scroll animations and yanked the view back
   * every time the user scrolled up to re-read something.
   */
  /*
   * `pinnedRef` decides whether to follow the stream and must not cause a
   * render — it is read hundreds of times per answer. `atBottom` is the same
   * fact as UI state, so the jump-to-latest button can appear; it is written
   * only when the answer changes, not on every scroll event.
   */
  const [atBottom, setAtBottom] = useState(true);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const pinned = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    pinnedRef.current = pinned;
    setAtBottom((was) => (was === pinned ? was : pinned));
  }, []);

  const scrollToLatest = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    pinnedRef.current = true;
    setAtBottom(true);
    el.scrollTo({ top: el.scrollHeight, behavior: reduceMotion ? "auto" : "smooth" });
  }, [reduceMotion]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !pinnedRef.current) return;
    el.scrollTo({ top: el.scrollHeight, behavior: reduceMotion || busy ? "auto" : "smooth" });
  }, [messages, status, busy, reduceMotion]);

  const send = (text: string) => {
    if (!text.trim() || busy) return;
    pinnedRef.current = true;
    sendMessage({ text });
    setInput("");
  };

  /**
   * Re-ask an earlier question with different words.
   *
   * Everything after the edited message is dropped rather than kept. The
   * answers below it were reasoning about the original wording, and leaving
   * them in place would show a conversation that never happened — in a
   * clinical thread that is a transcript nobody can trust.
   */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  const startEdit = (id: string, text: string) => {
    setEditingId(id);
    setEditDraft(text);
  };

  const submitEdit = (id: string) => {
    const text = editDraft.trim();
    setEditingId(null);
    if (!text || busy) return;
    const index = messages.findIndex((m) => m.id === id);
    if (index < 0) return;
    pinnedRef.current = true;
    setMessages(messages.slice(0, index));
    sendMessage({ text });
  };

  /**
   * Which follow-ups to offer, and when.
   *
   * Only under the newest answer, and only once the turn has settled: a row
   * of new questions appearing beside a half-written answer invites you to
   * interrupt it. Questions already asked in this thread are excluded, so a
   * suggestion is never something the reader has already said.
   */
  const suggestions = useMemo(() => {
    if (busy || error) return [];
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant") return [];
    const asked = messages
      .filter((m) => m.role === "user")
      .map((m) => m.parts.filter((p) => p.type === "text").map((p) => (p as { text: string }).text).join(" "));
    return followUps(routeOf(asked[asked.length - 1] ?? ""), profile, asked);
  }, [messages, busy, error, profile]);

  /**
   * Pick up a question typed on the landing page.
   *
   * The marketing hero owns an input but not a conversation, so it parks the
   * text in sessionStorage and routes here. Read once and cleared immediately,
   * so a refresh does not re-ask it — and sessionStorage rather than local, so
   * a stale draft cannot survive the tab and surprise someone tomorrow.
   *
   * Sent on a microtask rather than in the effect body. Firing a request
   * synchronously during mount cascades a render before the component has
   * settled; deferring by a tick lets it finish mounting first, which is
   * also the more honest description of what this is — an action taken after
   * arrival, not part of rendering.
   */
  const handoffRef = useRef(false);
  useEffect(() => {
    if (handoffRef.current) return;
    handoffRef.current = true;
    let pending: string | null = null;
    try {
      pending = sessionStorage.getItem("nutritiscan:pending");
      if (pending) sessionStorage.removeItem("nutritiscan:pending");
    } catch {
      return;
    }
    if (!pending?.trim()) return;
    const text = pending;
    queueMicrotask(() => send(text));
    // Runs once on mount; `send` is stable enough for this one-shot handoff.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Grow the textarea with its content, capped by max-h-40 in the className
  // (the browser clamps the inline height itself once that's hit and the
  // native scrollbar takes over — no extra bookkeeping needed here).
  // Reset to "auto" first, or the element only ever grows: shrinking after
  // deleting text or sending needs the browser to remeasure from scratch.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [input]);

  const copyMessage = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(toPlainText(text));
      setCopiedId(id);
      setTimeout(() => setCopiedId((current) => (current === id ? null : current)), 1500);
    } catch {
      // Clipboard access can be denied (permissions) or unavailable
      // (non-secure context) — a failed copy isn't worth surfacing as an
      // error in a health chat; the user can still select and copy by hand.
    }
  };

  /**
   * Set this conversation aside and open a fresh one.
   *
   * This used to wipe the transcript in place, which was the only way out of
   * a thread and cost you its history to take it. Now the conversation stays
   * in the sidebar — health history is the product's whole promise, and
   * "start a new topic" should never be spelled "delete what you told me".
   */
  const startNewConversation = () => {
    stop();
    newThread();
  };

  /** Deliberate deletion still exists; it is just no longer the only exit. */
  const deleteConversation = () => {
    stop();
    deleteThread(thread.id);
  };

  /**
   * Which specialist to credit an assistant message to.
   *
   * This used to run the *demo* router over the preceding user message
   * regardless of which brain actually answered. In real multi-agent mode
   * that meant the badge could read "Doctor Agent" on an answer the
   * supervisor had routed to Nutrition — a wrong clinical attribution shown
   * with full confidence.
   *
   * Now the demo trace is the only thing that licenses a specialist badge.
   * A real answer is credited to the Supervisor, which is what actually
   * composed it, and the consulted specialists appear in the trace chips
   * where they are known for certain.
   */
  const badgeFor = (idx: number, trace: Trace | null) => {
    if (trace?.source === "real") return "supervisor";
    for (let i = idx - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        const t = messages[i].parts.filter((p) => p.type === "text").map((p) => (p as { text: string }).text).join(" ");
        return routeOf(t);
      }
    }
    return "supervisor";
  };

  const empty = messages.length === 0;

  const composer = (
    <Composer
      centered={empty}
      input={input}
      setInput={setInput}
      textareaRef={textareaRef}
      busy={busy}
      onSubmit={() => send(input)}
      onStop={stop}
      canDictate={canDictate}
      listening={listening}
      onToggleDictation={toggleDictation}
      interim={interim}
      micError={micError}
      reduceMotion={!!reduceMotion}
    />
  );

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      {/*
        A slim bar, not a masthead.

        This used to be a 9×9 gradient avatar, a product name and a strapline
        above every conversation — a permanent 64px advertisement for the
        thing you were already using. What a reader needs here is which
        conversation this is and whether it is thinking; the introduction
        belongs on the empty state, where there is nothing to read yet.
      */}
      <div className="group/head flex shrink-0 items-center gap-2 px-4 py-2.5">
        <p className="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--text-muted)]">
          {empty ? "" : thread.title}
        </p>

        <div className="flex items-center gap-1 opacity-0 transition focus-within:opacity-100 group-hover/head:opacity-100">
          {!empty && (
            <>
              <button
                type="button"
                onClick={startNewConversation}
                title="Start a new conversation"
                className="rounded-lg px-2 py-1 t-label text-[var(--text-dim)] transition hover:bg-[var(--surface)] hover:text-white focus-ring"
              >
                + New
              </button>
              <button
                type="button"
                onClick={deleteConversation}
                title="Delete this conversation"
                aria-label="Delete this conversation"
                className="grid h-7 w-7 place-items-center rounded-lg t-label text-[var(--text-dim)] transition hover:bg-[color-mix(in_oklab,var(--rose)_18%,transparent)] hover:text-[var(--rose)] focus-ring"
              >
                <span aria-hidden="true">✕</span>
              </button>
            </>
          )}
          {embedded && (
            <a
              href="/chat"
              title="Open the full conversation view"
              className="rounded-lg px-2 py-1 t-label text-[var(--text-dim)] transition hover:bg-[var(--surface)] hover:text-white focus-ring"
            >
              Expand ↗
            </a>
          )}
        </div>

        {busy && (
          <span className="flex shrink-0 items-center gap-1.5 t-label text-[var(--text-dim)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--amber)]" />
            thinking
          </span>
        )}
      </div>

      {/*
        Nothing said yet.

        The composer sits in the middle of the screen rather than pinned to
        the floor, because at this moment the input *is* the page — there is
        no transcript for it to be the footer of. It moves down on the first
        message, which is also the clearest possible signal that the
        conversation has started.
      */}
      {empty ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-4 pb-8">
          <div className="w-full max-w-2xl">
            <div className="mb-6 text-center">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[linear-gradient(135deg,var(--emerald),var(--cyan))] text-xl text-[#04120c]">
                ✦
              </div>
              <h1 className="mt-4 text-[22px] font-semibold tracking-tight">Hi {profile.name}. How are you feeling?</h1>
              <p className="mt-1.5 text-sm text-[var(--text-muted)]">
                Five specialists read every message — symptoms, food, training, sleep, labs.
              </p>
            </div>

            {composer}

            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="rounded-full border border-[var(--border)] px-3 py-1.5 text-[13px] text-[var(--text-muted)] transition hover:border-[var(--border-strong)] hover:bg-[var(--surface)] hover:text-white focus-ring"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <>
          {/*
            The transcript is a live region: answers stream in token by token
            and a screen-reader user would otherwise get no signal that a
            reply arrived at all. "polite" so it waits for a pause rather
            than interrupting on every delta.

            The bottom padding is what the floating composer sits over. It
            has to be generous: the composer grows with the text in it, and
            a fixed gap sized to one line hides the newest answer the moment
            someone types a paragraph.
          */}
          <div
            ref={scrollRef}
            onScroll={onScroll}
            className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4 pb-44 pt-2"
            role="log"
            aria-live="polite"
            aria-busy={busy}
            aria-label="Conversation with your health companion"
          >
            <div className="mx-auto max-w-2xl space-y-5">
              {messages.map((m, idx) => {
                const text = m.parts.filter((p) => p.type === "text").map((p) => (p as { text: string }).text).join("");
                if (m.role === "user") {
                  if (editingId === m.id) {
                    return (
                      <div key={m.id} className="flex justify-end">
                        <div className="w-full max-w-[85%] rounded-2xl border border-[color-mix(in_oklab,var(--emerald)_50%,transparent)] bg-[var(--surface)] p-2.5">
                          <label htmlFor={`edit-${m.id}`} className="sr-only">
                            Edit your message
                          </label>
                          <textarea
                            id={`edit-${m.id}`}
                            autoFocus
                            rows={2}
                            value={editDraft}
                            onChange={(e) => setEditDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                                e.preventDefault();
                                submitEdit(m.id);
                              }
                              if (e.key === "Escape") setEditingId(null);
                            }}
                            className="scroll-thin w-full resize-none bg-transparent text-sm text-white outline-none"
                          />
                          <div className="mt-1.5 flex justify-end gap-2">
                            <button type="button" onClick={() => setEditingId(null)} className="rounded-lg px-2.5 py-1 t-label text-[var(--text-dim)] hover:text-white focus-ring">
                              Cancel
                            </button>
                            <button type="button" onClick={() => submitEdit(m.id)} disabled={!editDraft.trim()} className="btn-primary rounded-lg px-2.5 py-1 t-label disabled:opacity-40">
                              Ask again
                            </button>
                          </div>
                          {/* Said plainly, because it is not recoverable. */}
                          <p className="mt-1 t-label text-[var(--text-dim)]">Replies after this one will be replaced.</p>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div key={m.id} className="group flex items-start justify-end gap-1.5">
                      {/* Rewording a symptom is the most common correction in
                          a health chat — "since Tuesday" turns out to be
                          Monday — and retyping it was the only way to do it. */}
                      {!busy && (
                        <button
                          type="button"
                          onClick={() => startEdit(m.id, text)}
                          aria-label="Edit this message"
                          title="Edit"
                          className="mt-1.5 rounded-md px-1.5 py-1 t-label text-[var(--text-dim)] opacity-0 transition hover:text-white focus-visible:opacity-100 group-hover:opacity-100 focus-ring"
                        >
                          <span aria-hidden="true">✎</span>
                        </button>
                      )}
                      <div className="max-w-[80%] rounded-3xl rounded-br-lg bg-[var(--surface-2)] px-4 py-2.5 text-sm text-white">
                        {text}
                      </div>
                    </div>
                  );
                }

                const trace = tracesFor(m);
                const note = noteFor(m);
                const route = badgeFor(idx, trace);
                const color = agentColor(route);
                return (
                  <motion.div key={m.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="group">
                    <div className="mb-1.5 flex items-center gap-2">
                      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-[11px]" style={{ background: `${color}22` }}>
                        {route === "supervisor" ? "✦" : agentGlyph(route)}
                      </span>
                      <span className="t-label font-medium" style={{ color }}>
                        {route === "supervisor" ? "Supervisor" : agentName(route)}
                      </span>
                      {trace && (
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="t-label text-[var(--text-dim)]">· {trace.done ? "consulted" : "consulting"}</span>
                          {trace.agents.map((a) => (
                            <span key={a} className="inline-flex items-center gap-1 t-label" style={{ color: agentColor(a) }}>
                              {!trace.done && (
                                <motion.span
                                  className="h-1 w-1 rounded-full"
                                  style={{ background: agentColor(a) }}
                                  animate={{ opacity: [0.3, 1, 0.3] }}
                                  transition={{ duration: 1, repeat: Infinity }}
                                />
                              )}
                              {agentGlyph(a)} {agentName(a)}
                            </span>
                          ))}
                        </span>
                      )}
                    </div>

                    {/*
                      No bubble. A bubble is right for a short turn and wrong
                      for a differential with headings and a red-flag block —
                      it boxes structured medical prose into a chat sticker.
                      The answer is the page here; only the reader's own
                      messages are bubbled, which is what makes them scan as
                      theirs.
                    */}
                    <div className="pl-8">
                      {text ? <Markdown text={text} /> : <span className="typing-caret text-sm text-[var(--text-dim)]" />}
                      {note && <ConsultNote note={note} />}

                      {text && (
                        <div className="mt-1.5 flex items-center gap-1 opacity-0 transition focus-within:opacity-100 group-hover:opacity-100">
                          <button
                            type="button"
                            onClick={() => copyMessage(m.id, text)}
                            className="flex items-center gap-1 rounded-md px-1.5 py-1 t-label text-[var(--text-dim)] transition hover:text-white focus-ring"
                          >
                            {copiedId === m.id ? (
                              <>
                                <span aria-hidden="true">✓</span> Copied
                              </>
                            ) : (
                              <>
                                <span aria-hidden="true">⧉</span> Copy
                              </>
                            )}
                          </button>
                          {/* Only the newest answer can be regenerated:
                              `regenerate` re-runs the last turn, so offering
                              it on an older message would silently rewrite a
                              different one. */}
                          {idx === messages.length - 1 && !busy && (
                            <button
                              type="button"
                              onClick={() => regenerate()}
                              title="Ask the same question again"
                              className="flex items-center gap-1 rounded-md px-1.5 py-1 t-label text-[var(--text-dim)] transition hover:text-white focus-ring"
                            >
                              <span aria-hidden="true">↻</span> Retry
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}

              {/*
                Where to go next.

                Under the answer rather than in the composer: these continue
                what was just said, and moving them into the input would make
                them read as generic prompts rather than as this
                conversation's next question. Derived, never generated — see
                lib/agents/followups.ts.
              */}
              {suggestions.length > 0 && (
                <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="pl-8">
                  <p className="mb-1 t-label uppercase tracking-wide text-[var(--text-dim)]">Ask next</p>
                  <div className="flex flex-col items-start">
                    {suggestions.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => send(s)}
                        className="flex w-full items-center justify-between gap-3 border-b border-[var(--border)] py-2 text-left text-[13px] text-[var(--text-muted)] transition last:border-0 hover:text-white focus-ring"
                      >
                        <span>{s}</span>
                        <span aria-hidden="true" className="shrink-0 text-[var(--text-dim)]">
                          +
                        </span>
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}

              {status === "submitted" && (
                <div className="flex items-center gap-2 pl-8">
                  {[0, 1, 2].map((d) => (
                    <motion.span
                      key={d}
                      className="h-1.5 w-1.5 rounded-full bg-[var(--text-dim)]"
                      animate={{ opacity: [0.2, 1, 0.2] }}
                      transition={{ duration: 1, repeat: Infinity, delay: d * 0.15 }}
                    />
                  ))}
                </div>
              )}

              {error && (
                <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[color-mix(in_oklab,var(--rose)_40%,transparent)] bg-[color-mix(in_oklab,var(--rose)_10%,transparent)] px-3 py-2 text-xs text-[#ffd7dd]">
                  <span>That answer didn&apos;t come through.</span>
                  {/* An error with no way out is a dead end — offer the retry. */}
                  <button type="button" onClick={() => regenerate()} className="rounded-md border border-[color-mix(in_oklab,var(--rose)_45%,transparent)] px-2.5 py-1 font-medium transition hover:bg-[color-mix(in_oklab,var(--rose)_18%,transparent)]">
                    Try again
                  </button>
                </div>
              )}
            </div>
          </div>

          {/*
            The composer floats over the transcript rather than sitting in a
            bordered row beneath it. A docked footer divides the panel in two
            and makes the conversation feel like the top half of a form; a
            floating one keeps the transcript continuous and lets it scroll
            *under* the input, which is what every assistant people already
            use does. The gradient is what makes text pass behind it legibly
            instead of colliding with its edge.
          */}
          {/*
            A blur scrim, not a solid fill. The same chat renders full-page
            over --bg and inside the dashboard's translucent glass panel; a
            solid --bg block reads as a hole punched in the glass. Blurring
            what passes underneath works on both, and is what actually makes
            the text legible where it meets the composer.
          */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10">
            <div className="h-16 bg-[linear-gradient(to_bottom,transparent,rgba(5,7,10,.72))] backdrop-blur-[2px]" />
            <div className="bg-[rgba(5,7,10,.72)] px-4 pb-3 backdrop-blur-md">
              <div className="pointer-events-auto mx-auto max-w-2xl">
                <AnimatePresence>
                  {!atBottom && (
                    <motion.button
                      type="button"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 6 }}
                      onClick={scrollToLatest}
                      aria-label="Jump to the latest message"
                      className="mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text-muted)] shadow-[0_8px_24px_-12px_rgba(0,0,0,0.6)] transition hover:text-white focus-ring"
                    >
                      <span aria-hidden="true">↓</span>
                    </motion.button>
                  )}
                </AnimatePresence>
                {composer}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * The input.
 *
 * Lifted out of the conversation so the same control can be the centre of an
 * empty screen and the floating footer of a running one. Defining it inline
 * would remount it on every render and take the caret with it mid-sentence.
 */
function Composer({
  centered,
  input,
  setInput,
  textareaRef,
  busy,
  onSubmit,
  onStop,
  canDictate,
  listening,
  onToggleDictation,
  interim,
  micError,
  reduceMotion,
}: {
  centered: boolean;
  input: string;
  setInput: (v: string) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  busy: boolean;
  onSubmit: () => void;
  onStop: () => void;
  canDictate: boolean;
  listening: boolean;
  onToggleDictation: () => void;
  interim: string;
  micError: string | null;
  reduceMotion: boolean;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <div className="flex items-end gap-2 rounded-[26px] border border-[var(--border-strong)] bg-[var(--surface)] px-4 py-3 shadow-[0_12px_40px_-16px_rgba(0,0,0,0.7)] transition-colors focus-within:border-[color-mix(in_oklab,var(--emerald)_50%,transparent)]">
        {/* A placeholder is not a label — it disappears on focus. */}
        <label htmlFor="chat-input" className="sr-only">
          Describe how you feel, or ask a health question
        </label>
        <textarea
          id="chat-input"
          ref={textareaRef}
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends; Shift+Enter (or any IME composition) inserts a
            // newline. Symptom descriptions run long enough that a
            // single-line input hid what the user had already typed — this
            // is a textarea specifically so that stays visible.
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              onSubmit();
            }
          }}
          disabled={busy}
          placeholder={centered ? "Describe how you feel, or ask anything…" : "Reply…"}
          className="scroll-thin max-h-40 min-h-[24px] flex-1 resize-none bg-transparent py-0.5 text-[15px] text-white outline-none placeholder:text-[var(--text-dim)]"
        />
        {/* Someone with a fever or shaking hands should not have to type a
            paragraph to be heard. Hidden entirely where the browser cannot
            do it, rather than offered and then doing nothing. */}
        {canDictate && !busy && (
          <button
            type="button"
            onClick={onToggleDictation}
            aria-label={listening ? "Stop dictating" : "Dictate your symptoms"}
            aria-pressed={listening}
            title={listening ? "Stop dictating" : "Dictate your symptoms"}
            className={`grid h-8 w-8 shrink-0 place-items-center rounded-full transition ${
              listening ? "bg-[color-mix(in_oklab,var(--rose)_22%,transparent)] text-[var(--rose)]" : "btn-ghost"
            }`}
          >
            {listening ? (
              <motion.span aria-hidden="true" animate={reduceMotion ? {} : { opacity: [1, 0.35, 1] }} transition={{ duration: 1.2, repeat: Infinity }}>
                ●
              </motion.span>
            ) : (
              <span aria-hidden="true">🎙</span>
            )}
          </button>
        )}
        {busy ? (
          // The supervisor can fan out across five specialists for the best
          // part of a minute. Leaving the user with no way to interrupt that
          // was the single worst moment in the flow.
          <button type="button" onClick={onStop} aria-label="Stop generating" className="btn-ghost grid h-8 w-8 shrink-0 place-items-center rounded-full">
            <span aria-hidden="true">■</span>
          </button>
        ) : (
          <button type="submit" disabled={!input.trim()} aria-label="Send message" className="btn-primary grid h-8 w-8 shrink-0 place-items-center rounded-full text-base disabled:opacity-40">
            <span aria-hidden="true">↑</span>
          </button>
        )}
      </div>

      {interim && (
        <p className="mt-2 px-1 text-sm italic text-[var(--text-dim)]" aria-live="polite">
          {interim}
        </p>
      )}
      {micError && (
        <p className="mt-2 px-1 text-[13px] text-[var(--rose)]" role="status">
          {micError}
        </p>
      )}
      <p className="mt-2 text-center t-label text-[var(--text-dim)]">
        Educational only · not a diagnosis · consult a clinician for medical concerns
      </p>
    </form>
  );
}
