"use client";

import { useChat } from "@ai-sdk/react";
import { dictationSupport, startDictation } from "@/lib/http/dictation";
import { DefaultChatTransport } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { routeOf } from "@/lib/agents/demo";
import { agentColor, agentGlyph, agentName } from "@/lib/agents-meta";
import { clearTranscript, readMeals, readProfile, readTranscript, useHydrated, writeTranscript } from "@/lib/memory/store";
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
export default function Chat({ profile }: { profile: HealthProfile }) {
  const hydrated = useHydrated();
  if (!hydrated) return <ChatSkeleton />;
  return <Conversation profile={profile} />;
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

function Conversation({ profile }: { profile: HealthProfile }) {
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

  // Restored once, at construction. `useChat` owns the list from here.
  const restored = useMemo(() => readTranscript(), []);
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
  const [canDictate, setCanDictate] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [micError, setMicError] = useState<string | null>(null);
  const dictationRef = useRef<{ stop: () => void } | null>(null);

  useEffect(() => {
    setCanDictate(dictationSupport() === "available");
  }, []);

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
    writeTranscript(messages);
  }, [messages, busy]);

  /**
   * Follow the stream, but never steal the viewport.
   *
   * This used to smooth-scroll to the bottom on every `messages` change — and
   * `messages` gets a new identity per token, so a single answer queued
   * hundreds of overlapping smooth-scroll animations and yanked the view back
   * every time the user scrolled up to re-read something.
   */
  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }, []);

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
   * Pick up a question typed on the landing page.
   *
   * The marketing hero owns an input but not a conversation, so it parks the
   * text in sessionStorage and routes here. Read once and cleared immediately,
   * so a refresh does not re-ask it — and sessionStorage rather than local, so
   * a stale draft cannot survive the tab and surprise someone tomorrow.
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
    if (pending?.trim()) send(pending);
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

  /** Health conversations are the most sensitive thing stored here. */
  const clearConversation = () => {
    stop();
    setMessages([]);
    clearTranscript();
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

  return (
    <div className="flex h-full flex-col">
      {/* header */}
      <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[linear-gradient(135deg,var(--emerald),var(--cyan))] text-sm font-bold text-[#04120c]">✦</span>
          <div>
            <p className="text-sm font-semibold">NutritiScan Supervisor</p>
            <p className="t-label text-[var(--text-dim)]">routing across 5 specialists · remembers your history</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <button
              type="button"
              onClick={clearConversation}
              className="rounded-full border border-[var(--border-strong)] px-2.5 py-1 t-label text-[var(--text-dim)] transition hover:text-white focus-ring"
            >
              Clear
            </button>
          )}
          <span className="flex items-center gap-1.5 rounded-full border border-[var(--border)] px-2.5 py-1 t-label text-[var(--text-muted)]">
            <span className={`h-1.5 w-1.5 rounded-full ${busy ? "bg-[var(--amber)]" : "bg-[var(--emerald)]"}`} />
            {busy ? "thinking" : "ready"}
          </span>
        </div>
      </div>

      {/* messages */}
      {/*
        The transcript is a live region: answers stream in token by token and
        a screen-reader user would otherwise get no signal that a reply
        arrived at all. "polite" so it waits for a pause rather than
        interrupting on every delta.
      */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="scroll-thin flex-1 space-y-4 overflow-y-auto px-5 py-5"
        role="log"
        aria-live="polite"
        aria-busy={busy}
        aria-label="Conversation with your health companion"
      >
        {messages.length === 0 && (
          <div className="grid h-full place-items-center text-center">
            <div>
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[color-mix(in_oklab,var(--emerald)_16%,transparent)] text-2xl">✦</div>
              <p className="mt-4 text-lg font-semibold">Hi {profile.name}. How are you feeling?</p>
              <p className="mt-1 text-sm text-[var(--text-muted)]">Ask about symptoms, food, training, sleep, or your labs.</p>
            </div>
          </div>
        )}

        {messages.map((m, idx) => {
          const text = m.parts.filter((p) => p.type === "text").map((p) => (p as { text: string }).text).join("");
          if (m.role === "user") {
            return (
              <div key={m.id} className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-[color-mix(in_oklab,var(--emerald)_18%,transparent)] px-4 py-2.5 text-sm text-white">
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
            <motion.div key={m.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="group flex gap-3">
              <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-sm" style={{ background: `${color}22` }}>
                {route === "supervisor" ? "✦" : agentGlyph(route)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="mb-1 t-label font-medium" style={{ color }}>
                  {route === "supervisor" ? "Supervisor" : agentName(route)}
                </p>
                {trace && (
                  <div className="mb-2 flex flex-wrap items-center gap-1.5">
                    <span className="t-label text-[var(--text-dim)]">{trace.done ? "Consulted" : "Consulting"}</span>
                    {trace.agents.map((a) => (
                      <span key={a} className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 t-label" style={{ borderColor: `${agentColor(a)}55`, color: agentColor(a) }}>
                        {!trace.done && <motion.span className="h-1 w-1 rounded-full" style={{ background: agentColor(a) }} animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1, repeat: Infinity }} />}
                        {agentGlyph(a)} {agentName(a)}
                      </span>
                    ))}
                  </div>
                )}
                <div className="rounded-2xl rounded-tl-sm bg-[var(--surface-2)] px-4 py-3">
                  {text ? <Markdown text={text} /> : <span className="typing-caret text-sm text-[var(--text-dim)]" />}
                </div>
                {note && <ConsultNote note={note} />}
                {/* Structured medical guidance is exactly the kind of thing a
                    user wants to hand to a clinician verbatim — copy has to
                    exist somewhere. Hover-revealed (with focus-visible as the
                    keyboard/screen-reader equivalent of hover) so it doesn't
                    compete with the answer itself at rest. */}
                {text && (
                  <button
                    type="button"
                    onClick={() => copyMessage(m.id, text)}
                    className="mt-1.5 flex items-center gap-1 rounded-md px-1.5 py-1 t-label text-[var(--text-dim)] opacity-0 transition hover:text-white focus-visible:opacity-100 group-hover:opacity-100 focus-ring"
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
                )}
              </div>
            </motion.div>
          );
        })}

        {status === "submitted" && (
          <div className="flex gap-3">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-[color-mix(in_oklab,var(--emerald)_16%,transparent)] text-sm">✦</span>
            <div className="flex items-center gap-1 rounded-2xl bg-[var(--surface-2)] px-4 py-3">
              {[0, 1, 2].map((d) => (
                <motion.span key={d} className="h-1.5 w-1.5 rounded-full bg-[var(--text-dim)]" animate={{ opacity: [0.2, 1, 0.2] }} transition={{ duration: 1, repeat: Infinity, delay: d * 0.15 }} />
              ))}
            </div>
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

      {/* suggestions */}
      <AnimatePresence>
        {messages.length === 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-wrap gap-2 px-5 pb-3">
            {SUGGESTIONS.map((s) => (
              <button key={s} onClick={() => send(s)} className="rounded-full border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-1.5 text-xs text-[var(--text-muted)] transition hover:bg-[var(--surface-2)] hover:text-white">
                {s}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* input */}
      <form
        onSubmit={(e) => { e.preventDefault(); send(input); }}
        className="border-t border-[var(--border)] p-4"
      >
        <div className="flex items-end gap-2 rounded-2xl border border-[var(--border-strong)] bg-[var(--surface)] px-3.5 py-2.5 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.5)] transition-colors focus-within:border-[color-mix(in_oklab,var(--emerald)_50%,transparent)]">
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
              // single-line input hid what the user had already typed —
              // this is a textarea specifically so that stays visible.
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send(input);
              }
            }}
            disabled={busy}
            placeholder="Describe how you feel, or ask anything…"
            className="max-h-40 min-h-[24px] flex-1 resize-none bg-transparent py-0.5 text-sm text-white outline-none placeholder:text-[var(--text-dim)]"
          />
          {/* Someone with a fever or shaking hands should not have to type a
              paragraph to be heard. Hidden entirely where the browser cannot
              do it, rather than offered and then doing nothing. */}
          {canDictate && !busy && (
            <button
              type="button"
              onClick={toggleDictation}
              aria-label={listening ? "Stop dictating" : "Dictate your symptoms"}
              aria-pressed={listening}
              title={listening ? "Stop dictating" : "Dictate your symptoms"}
              className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl transition ${
                listening
                  ? "bg-[color-mix(in_oklab,var(--rose)_22%,transparent)] text-[var(--rose)]"
                  : "btn-ghost"
              }`}
            >
              {listening ? (
                <motion.span
                  aria-hidden="true"
                  animate={reduceMotion ? {} : { opacity: [1, 0.35, 1] }}
                  transition={{ duration: 1.2, repeat: Infinity }}
                >
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
            <button type="button" onClick={() => stop()} aria-label="Stop generating" className="btn-ghost grid h-8 w-8 shrink-0 place-items-center rounded-xl">
              <span aria-hidden="true">■</span>
            </button>
          ) : (
            <button type="submit" disabled={!input.trim()} aria-label="Send message" className="btn-primary grid h-8 w-8 shrink-0 place-items-center rounded-xl text-base disabled:opacity-40">
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
        <p className="mt-2 text-center t-label text-[var(--text-dim)]">Educational only · not a diagnosis · consult a clinician for medical concerns</p>
      </form>
    </div>
  );
}
