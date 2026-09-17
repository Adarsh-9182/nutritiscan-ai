"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUp,
  ArrowUpRight,
  Plus,
  X,
  Check,
  FileText,
  Pill,
  Moon,
  Leaf,
  Heart,
  Stethoscope,
  ChevronDown,
  Cpu,
  Square,
  CalendarDays,
  ArrowRight,
  Bell,
  Copy,
  NotebookPen,
  Sparkles,
  Menu,
  SquarePen,
} from "lucide-react";
import { runHealthAgent, type AgentReply } from "@/lib/workspace/health-agent";
import { type DeviceModel } from "@/lib/workspace/device-model";
import { streamCompanion } from "@/lib/companion/client";
import {
  TaskSchema,
  type CareTask,
  type ChatMessage,
  type LogEntry,
  type Workspace,
} from "@/lib/workspace/types";

type ChatMeta = {
  id: string;
  version: number;
  title: string;
  createdAt: string;
};
type ChatMetaWithMessages = ChatMeta & { messages: ChatMessage[] };

type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
  answer?: AgentReply;
  /** Newly arrived replies are revealed progressively. */
  fresh?: boolean;
  /** An AI answer still arriving. */
  streaming?: boolean;
};

const starters = [
  ["Something feels off", "Help me organise my symptoms", Stethoscope],
  ["Food & nutrition", "Help me understand a balanced vegetarian diet", Leaf],
  ["Medicines", "What should I know about medicine interactions?", Pill],
  ["Sleep & energy", "Help me understand my sleep and energy", Moon],
  [
    "Mental wellbeing",
    "I want to talk about stress and mental wellbeing",
    Heart,
  ],
  ["My health records", "Summarise my latest report", FileText],
  ["Log my meal", "Had 2 roti, dal and sabzi for lunch", NotebookPen],
  ["What's next", "What should I do next?", CalendarDays],
] as const;

const modeText = {
  ai: "NutritiScan AI",
  reference: "From health reference notes",
  "record-summary": "From your own records",
  escalation: "Safety first",
  unavailable: "Outside what I can answer yet",
};

/** Stored form of a message: drafts are dropped so nothing is re-offered. */
export function toStored(m: Message): ChatMessage {
  const a = m.answer;
  return {
    id: m.id,
    role: m.role,
    text: m.text.slice(0, 12000),
    ...(a
      ? {
          mode: a.mode,
          sources: a.sources.slice(0, 6),
          steps: a.steps?.slice(0, 8).map((s) => s.slice(0, 120)),
          ...(a.detail ? { detail: a.detail.slice(0, 300) } : {}),
          ...(a.followUp ? { followUp: a.followUp.slice(0, 300) } : {}),
        }
      : {}),
  };
}
function fromStored(m: ChatMessage): Message {
  return {
    id: m.id,
    role: m.role,
    text: m.text,
    ...(m.role === "assistant" && m.mode
      ? {
          answer: {
            mode: m.mode,
            text: m.text,
            sources: m.sources ?? [],
            steps: m.steps,
            detail: m.detail,
            followUp: m.followUp,
          },
        }
      : {}),
  };
}

/** Reveals a reply a few words at a time, like a streamed answer. */
function Reveal({ text, onDone }: { text: string; onDone: () => void }) {
  const [shown, setShown] = useState(0);
  const words = useMemo(() => text.split(/(\s+)/), [text]);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  }, [onDone]);
  useEffect(() => {
    const reduce =
      process.env.NODE_ENV === "test" ||
      (typeof window !== "undefined" &&
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
    const total = words.length;
    if (reduce || total < 4) {
      const now = setTimeout(() => {
        setShown(total);
        done.current();
      }, 0);
      return () => clearTimeout(now);
    }
    // Long answers finish in about two seconds.
    const step = Math.max(2, Math.ceil(total / 90));
    let at = 0;
    const timer = setInterval(() => {
      at = Math.min(total, at + step);
      setShown(at);
      if (at >= total) {
        clearInterval(timer);
        done.current();
      }
    }, 22);
    return () => clearInterval(timer);
  }, [words]);
  return (
    <>
      {words.slice(0, shown).join("")}
      {shown < words.length && <span className="cg-caret" />}
    </>
  );
}

/** **bold** and whole-line _italic_; everything else stays plain text
 * (no HTML is parsed). */
function Inline({ text }: { text: string }) {
  const italic = text.match(/^_(.+)_$/);
  if (italic)
    return (
      <em>
        <Inline text={italic[1]} />
      </em>
    );
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) =>
        /^\*\*[^*]+\*\*$/.test(part) ? (
          <strong key={i}>{part.slice(2, -2)}</strong>
        ) : (
          part
        ),
      )}
    </>
  );
}

/** A small, safe subset of Markdown for answers: headings, bullet and
 * numbered lists, bold. Short lines before a blank line in the app's own
 * replies also read as headings. */
function Body({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <>
      {lines.map((raw, i) => {
        const line = raw.trimEnd();
        if (!line.trim()) return <div key={i} className="cg-gap" />;
        const md = line.match(/^#{1,4}\s+(.*)$/);
        if (md)
          return (
            <h3 key={i} className="cg-h">
              <Inline text={md[1].replace(/\*\*/g, "")} />
            </h3>
          );
        const bullet = line.match(/^\s*(?:[-*•])\s+(.*)$/);
        if (bullet)
          return (
            <p
              key={i}
              className={`cg-li ${/^\s{2,}/.test(line) ? "nested" : ""}`}
            >
              <Inline text={bullet[1]} />
            </p>
          );
        const numbered = line.match(/^\s*(\d{1,2})[.)]\s+(.*)$/);
        if (numbered)
          return (
            <p key={i} className="cg-ol" data-n={`${numbered[1]}.`}>
              <Inline text={numbered[2]} />
            </p>
          );
        if (/^-{3,}$/.test(line.trim()))
          return <hr key={i} className="cg-hr" />;
        const heading =
          line.length < 60 &&
          !/[.:,?]$/.test(line) &&
          lines[i + 1] === "" &&
          i < lines.length - 2 &&
          !line.includes("**");
        if (heading)
          return (
            <h3 key={i} className="cg-h">
              {line}
            </h3>
          );
        return (
          <p key={i}>
            <Inline text={line} />
          </p>
        );
      })}
    </>
  );
}

export default function HealthAgent({
  workspace,
  demo,
  seed,
  addReport,
  navigate,
  saveTask,
  saveLog,
  conversation,
  persist,
  openMenu,
  newChat,
}: {
  workspace: Workspace;
  demo: boolean;
  seed: { text: string; id: number } | null;
  addReport: () => void;
  navigate: (
    view: "records" | "visit" | "care" | "settings" | "trends" | "sources",
  ) => void;
  saveTask: (task: CareTask) => Promise<void>;
  saveLog?: (entries: LogEntry[]) => Promise<void>;
  /** A saved chat to continue, or null for a new one. */
  conversation?: ChatMetaWithMessages | null;
  /** Saves the chat and returns what was stored. */
  persist?: (
    meta: ChatMeta | null,
    messages: ChatMessage[],
  ) => Promise<ChatMeta>;
  openMenu?: () => void;
  newChat?: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>(
    () => conversation?.messages.map(fromStored) ?? [],
  );
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [settings, setSettings] = useState(false);
  const [device, setDevice] = useState<"off" | "loading" | "ready">("off");
  const [progress, setProgress] = useState(0);
  const [modelError, setModelError] = useState("");
  const [draft, setDraft] = useState<
    (Omit<CareTask, "done"> & { message: string }) | null
  >(null);
  const [saved, setSaved] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [logged, setLogged] = useState<string[]>([]);
  const [logError, setLogError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [copied, setCopied] = useState("");
  const [persistError, setPersistError] = useState("");
  /** Whether this deployment has cloud AI answers switched on. */
  const [cloud, setCloud] = useState(false);
  const chatMeta = useRef<ChatMeta | null>(
    conversation
      ? {
          id: conversation.id,
          version: conversation.version,
          title: conversation.title,
          createdAt: conversation.createdAt,
        }
      : null,
  );
  const persistQueue = useRef<Promise<void>>(Promise.resolve());
  const model = useRef<DeviceModel | null>(null);
  const loadController = useRef<AbortController | null>(null);
  const turnController = useRef<AbortController | null>(null);
  const active = useRef(false);
  const mounted = useRef(true);
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const draftDialog = useRef<HTMLDialogElement>(null);
  const savingLock = useRef(false);
  const seenSeed = useRef<number | undefined>(undefined);
  const firstName = workspace.profile.name.split(" ")[0];

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      loadController.current?.abort();
      turnController.current?.abort();
      model.current?.dispose();
    };
  }, []);
  useEffect(() => {
    let alive = true;
    fetch("/api/workspace/status", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => alive && setCloud(Boolean(s?.model)))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    if (messages.length) end.current?.scrollIntoView({ block: "end" });
  }, [messages, busy]);
  useEffect(() => {
    // Grow the composer with its content, up to a limit.
    const el = input.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [question]);
  const hasDraft = Boolean(draft);
  useEffect(() => {
    if (hasDraft) draftDialog.current?.showModal();
    else draftDialog.current?.close();
  }, [hasDraft]);

  function save(all: Message[]) {
    if (!persist) return;
    // One save at a time, in order, so versions never race.
    persistQueue.current = persistQueue.current.then(async () => {
      try {
        const saved = await persist(chatMeta.current, all.map(toStored));
        chatMeta.current = {
          id: saved.id,
          version: saved.version,
          title: saved.title,
          createdAt: saved.createdAt,
        };
        if (mounted.current) setPersistError("");
      } catch {
        if (mounted.current)
          setPersistError(
            "This chat couldn’t be saved to your history. It stays here until you leave.",
          );
      }
    });
  }

  function patch(id: string, change: (m: Message) => Message) {
    setMessages((current) => current.map((m) => (m.id === id ? change(m) : m)));
  }

  /** Streams an AI answer into a placeholder message. Returns the final
   * message, or null when the AI could not start (the caller falls back). */
  async function streamAnswer(
    history: Message[],
    base: AgentReply,
    signal: AbortSignal,
  ): Promise<Message | null> {
    const id = crypto.randomUUID();
    let current: Message = {
      id,
      role: "assistant",
      text: "",
      streaming: true,
      answer: {
        ...base,
        mode: "ai",
        text: "",
        steps: [
          "Checked for urgent warning signs",
          "Read your context",
          "Wrote an answer",
        ],
        detail: undefined,
        followUp: undefined,
      },
    };
    let started = false;
    let failure = "";
    const update = (next: Message) => {
      current = next;
      if (!started) {
        started = true;
        setMessages((all) => [...all, next]);
      } else patch(id, () => next);
    };
    try {
      await streamCompanion(
        history.map((m) => ({ role: m.role, text: m.text })),
        (event) => {
          if (event.t === "delta")
            update({ ...current, text: current.text + event.v });
          else if (event.t === "replace")
            update({
              ...current,
              text: event.v,
              answer: {
                ...current.answer!,
                mode: event.mode === "escalation" ? "escalation" : "ai",
                steps:
                  event.mode === "escalation"
                    ? ["Urgent-care guidance"]
                    : current.answer!.steps,
                draftTask: undefined,
              },
            });
          else if (event.t === "error") failure = event.v;
        },
        signal,
      );
    } catch (error) {
      if (signal.aborted && started)
        return {
          ...current,
          streaming: false,
          answer: { ...current.answer!, detail: "Stopped." },
        };
      if (!started) {
        if ((error as { status?: number }).status === 503) setCloud(false);
        return null;
      }
      failure = "The answer was cut off. Please try again.";
    }
    if (!started) return null;
    return {
      ...current,
      streaming: false,
      answer: {
        ...current.answer!,
        text: current.text,
        ...(failure ? { detail: failure } : {}),
      },
    };
  }

  async function ask(text: string) {
    if (!text.trim() || active.current) return;
    active.current = true;
    setBusy(true);
    setQuestion("");
    const controller = new AbortController();
    turnController.current = controller;
    const timeout = setTimeout(() => controller.abort(), 90000);
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      text: text.trim().slice(0, 3000),
    };
    const before = messages;
    setMessages([...before, userMessage]);
    let reply: Message;
    try {
      const answer = await runHealthAgent(userMessage.text, workspace, {
        complete: model.current?.complete,
        signal: controller.signal,
        history: before
          .filter((m) => m.role === "user")
          .slice(-3)
          .map((m) => m.text),
      });
      // Records, drafts and escalations stay deterministic. Open questions
      // go to the AI when it is available and private AI is not chosen.
      const open =
        (answer.mode === "reference" || answer.mode === "unavailable") &&
        !answer.draftLog &&
        !answer.draftReminder;
      const streamed =
        open && cloud && !model.current
          ? await streamAnswer(
              [...before, userMessage],
              answer,
              controller.signal,
            )
          : null;
      reply = streamed ?? {
        id: crypto.randomUUID(),
        role: "assistant",
        text: answer.text,
        answer,
        fresh: true,
      };
    } catch {
      if (controller.signal.aborted && model.current) {
        model.current.dispose();
        model.current = null;
        setDevice("off");
      }
      reply = {
        id: crypto.randomUUID(),
        role: "assistant",
        text: controller.signal.aborted
          ? "Response stopped. No action was saved."
          : "I couldn’t complete that request. Please try again. No action was saved.",
      };
    } finally {
      clearTimeout(timeout);
    }
    active.current = false;
    if (!mounted.current) return;
    const all = [...before, userMessage, reply];
    setMessages(all);
    setBusy(false);
    save(all);
  }
  useEffect(() => {
    if (seed && seed.id !== seenSeed.current) {
      seenSeed.current = seed.id;
      void ask(seed.text);
    }
    // A seed is an explicit navigation request, not a workspace refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed]);

  async function enableDevice() {
    setDevice("loading");
    setModelError("");
    setProgress(0);
    const controller = new AbortController();
    loadController.current = controller;
    const timeout = setTimeout(() => controller.abort(), 600000);
    try {
      const { loadDeviceModel } = await import("@/lib/workspace/device-model");
      const loaded = await loadDeviceModel((value) => {
        if (mounted.current) setProgress(value);
      }, controller.signal);
      if (!mounted.current || controller.signal.aborted) {
        loaded.dispose();
        return;
      }
      model.current = loaded;
      setDevice("ready");
    } catch (error) {
      if (mounted.current) {
        setDevice("off");
        setModelError(
          controller.signal.aborted
            ? "Download stopped. You can try again whenever you’re ready."
            : error instanceof Error && error.message.includes("WebGPU")
              ? error.message
              : "The model could not load. Check available memory, WebGPU support and your connection. References still work.",
        );
      }
    } finally {
      clearTimeout(timeout);
    }
  }
  async function confirmTask() {
    if (!draft || savingLock.current) return;
    savingLock.current = true;
    setSaving(true);
    setSaveError("");
    try {
      const task = TaskSchema.parse({
        title: draft.title,
        date: draft.date,
        time: draft.time || undefined,
        repeat: draft.repeat,
        category: draft.category,
        done: false,
      });
      await saveTask(task);
      setSaved((current) => [...current, draft.message]);
      setDraft(null);
    } catch {
      setSaveError(
        "Could not save the follow-up. Check your connection and try again.",
      );
    } finally {
      savingLock.current = false;
      setSaving(false);
    }
  }
  function settle(id: string) {
    setMessages((current) =>
      current.map((m) => (m.id === id ? { ...m, fresh: false } : m)),
    );
  }

  const composer = (
    <form
      className="cg-composer"
      onSubmit={(event) => {
        event.preventDefault();
        void ask(question);
      }}
    >
      <textarea
        ref={input}
        aria-label="Message your health assistant"
        placeholder="Ask anything about your health"
        value={question}
        maxLength={3000}
        rows={1}
        onChange={(event) => setQuestion(event.target.value)}
        onKeyDown={(event) => {
          if (
            event.key === "Enter" &&
            !event.shiftKey &&
            !event.nativeEvent.isComposing
          ) {
            event.preventDefault();
            void ask(question);
          }
        }}
      />
      <div className="cg-composer-row">
        <button
          type="button"
          className="cg-round"
          aria-label="Add a report"
          title="Add a report"
          onClick={addReport}
        >
          <Plus size={18} />
        </button>
        <span className="cg-composer-hint">
          {device === "ready" ? "Private AI · on this device" : ""}
        </span>
        {busy ? (
          <button
            type="button"
            className="cg-send"
            aria-label="Stop response"
            onClick={() => turnController.current?.abort()}
          >
            <Square size={13} fill="currentColor" />
          </button>
        ) : (
          <button
            className="cg-send"
            disabled={!question.trim() || device === "loading"}
            aria-label="Send message"
          >
            <ArrowUp size={18} strokeWidth={2.4} />
          </button>
        )}
      </div>
    </form>
  );

  return (
    <div className={`cg ${messages.length ? "cg-has-messages" : ""}`}>
      <header className="cg-top">
        {openMenu && (
          <button
            className="cg-icon cg-mobile-only"
            aria-label="Open navigation"
            onClick={openMenu}
          >
            <Menu size={20} />
          </button>
        )}
        <div className="cg-model">
          <button
            className="cg-model-button"
            onClick={() => setSettings(!settings)}
            aria-expanded={settings}
            aria-label="Choose model"
          >
            NutritiScan <span>{device === "ready" ? "Private" : "Health"}</span>
            <ChevronDown size={15} />
          </button>
          {settings && (
            <section className="cg-menu" aria-label="Model settings">
              <button
                className={`cg-menu-item ${device !== "ready" ? "on" : ""}`}
                disabled={busy || device === "loading"}
                onClick={() => {
                  model.current?.dispose();
                  model.current = null;
                  setDevice("off");
                  setSettings(false);
                }}
              >
                <Sparkles size={16} />
                <span>
                  <b>NutritiScan Health</b>
                  <small>
                    {cloud
                      ? "AI answers with your records and daily log as context. Runs on an open model via Groq, which doesn’t train on your messages."
                      : "Your records, daily log and curated health references"}
                  </small>
                </span>
                {device !== "ready" && <Check size={15} />}
              </button>
              <div className={`cg-menu-item ${device === "ready" ? "on" : ""}`}>
                <Cpu size={16} />
                <span>
                  <b>Private AI</b>
                  <small>
                    Qwen 2.5 runs on your device. About 1 GB download, needs
                    WebGPU. Experimental, not clinically validated.
                  </small>
                  {device === "loading" ? (
                    <>
                      <progress value={progress} max={1} />
                      <span role="status" className="cg-menu-status">
                        Loading {Math.round(progress * 100)}%{" "}
                        <button onClick={() => loadController.current?.abort()}>
                          Cancel
                        </button>
                      </span>
                    </>
                  ) : device === "ready" ? null : (
                    <button
                      className="cg-menu-cta"
                      disabled={busy}
                      onClick={() => void enableDevice()}
                    >
                      Enable private AI <ArrowRight size={13} />
                    </button>
                  )}
                  {modelError && (
                    <span className="ns-error" role="alert">
                      {modelError}
                    </span>
                  )}
                </span>
                {device === "ready" && <Check size={15} />}
              </div>
              <button
                className="cg-menu-close"
                aria-label="Close model settings"
                onClick={() => setSettings(false)}
              >
                <X size={16} />
              </button>
            </section>
          )}
        </div>
        {newChat && (
          <button
            className="cg-icon cg-mobile-only"
            aria-label="New chat"
            onClick={newChat}
          >
            <SquarePen size={19} />
          </button>
        )}
      </header>

      <div className="cg-scroll">
        {!messages.length ? (
          <div className="cg-empty">
            <h1>
              {firstName
                ? `What’s on your mind, ${firstName}?`
                : "What’s on your mind today?"}
            </h1>
            {composer}
            <div className="cg-chips">
              {starters.map(([title, prompt, Icon]) => (
                <button
                  key={title}
                  aria-label={title}
                  disabled={busy || device === "loading"}
                  onClick={() => void ask(prompt)}
                >
                  <Icon size={15} strokeWidth={1.8} />
                  {title}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="cg-thread" aria-live="polite" aria-busy={busy}>
            {messages.map((message) =>
              message.role === "user" ? (
                <article key={message.id} className="cg-msg user">
                  <div className="cg-bubble">{message.text}</div>
                </article>
              ) : (
                <article key={message.id} className="cg-msg assistant">
                  <span className="cg-avatar" aria-hidden="true">
                    n.
                  </span>
                  <div className="cg-answer">
                    {message.answer && (
                      <div
                        className={`cg-mode ${message.answer.mode === "escalation" ? "urgent" : ""}`}
                      >
                        {message.answer.draftLog || message.answer.draftReminder
                          ? "Drafted for you to confirm"
                          : modeText[message.answer.mode]}
                        {!!message.answer.steps?.length && (
                          <details>
                            <summary>
                              {message.answer.steps.length}{" "}
                              {message.answer.steps.length === 1
                                ? "step"
                                : "steps"}
                              <ChevronDown size={12} />
                            </summary>
                            <ol>
                              {message.answer.steps.map((step) => (
                                <li key={step}>{step}</li>
                              ))}
                            </ol>
                          </details>
                        )}
                      </div>
                    )}
                    <div className="cg-text">
                      {message.streaming ? (
                        <>
                          <Body text={message.text} />
                          <span className="cg-caret" />
                        </>
                      ) : message.fresh ? (
                        <p className="cg-stream">
                          <Reveal
                            text={message.text}
                            onDone={() => settle(message.id)}
                          />
                        </p>
                      ) : (
                        <Body text={message.text} />
                      )}
                    </div>
                    {!message.fresh && !message.streaming && (
                      <>
                        {message.answer?.detail && (
                          <p className="cg-note">{message.answer.detail}</p>
                        )}
                        {!!message.answer?.sources.length && (
                          <div className="cg-sources">
                            {message.answer.sources.map((source) => (
                              <a
                                href={source.url}
                                key={source.url}
                                target="_blank"
                                rel="noreferrer"
                              >
                                <FileText size={12} />
                                {source.title}
                                <ArrowUpRight size={11} />
                              </a>
                            ))}
                          </div>
                        )}
                        {message.answer?.followUp && (
                          <p className="cg-follow">{message.answer.followUp}</p>
                        )}
                        <div className="cg-actions">
                          {message.answer?.draftLog && saveLog && (
                            <button
                              className="cg-action primary"
                              disabled={
                                busy || saving || logged.includes(message.id)
                              }
                              onClick={async () => {
                                if (savingLock.current) return;
                                savingLock.current = true;
                                setSaving(true);
                                setLogError("");
                                try {
                                  await saveLog(message.answer!.draftLog!);
                                  setLogged((c) => [...c, message.id]);
                                } catch {
                                  setLogError(
                                    "Could not save to your log. Check your connection and try again.",
                                  );
                                } finally {
                                  savingLock.current = false;
                                  setSaving(false);
                                }
                              }}
                            >
                              <Check size={14} />
                              {logged.includes(message.id)
                                ? "Added to today’s log"
                                : "Confirm and add to log"}
                            </button>
                          )}
                          {message.answer?.draftReminder && (
                            <button
                              className="cg-action primary"
                              disabled={busy || saved.includes(message.id)}
                              onClick={() => {
                                setSaveError("");
                                setDraft({
                                  ...message.answer!.draftReminder!,
                                  message: message.id,
                                });
                              }}
                            >
                              {saved.includes(message.id) ? (
                                <>
                                  <Check size={14} /> Reminder saved
                                </>
                              ) : (
                                <>
                                  <Bell size={14} /> Review and save reminder
                                </>
                              )}
                            </button>
                          )}
                          {message.answer?.draftTask && (
                            <button
                              className="cg-action"
                              disabled={busy || saved.includes(message.id)}
                              onClick={() => {
                                setSaveError("");
                                setDraft({
                                  title: message.answer!.draftTask!,
                                  date: new Date().toLocaleDateString("en-CA"),
                                  message: message.id,
                                });
                              }}
                            >
                              {saved.includes(message.id) ? (
                                <>
                                  <Check size={14} /> Follow-up saved
                                </>
                              ) : (
                                <>
                                  <CalendarDays size={14} /> Draft a follow-up
                                </>
                              )}
                            </button>
                          )}
                          <button
                            className="cg-icon small"
                            aria-label="Copy answer"
                            title="Copy"
                            onClick={() => {
                              void navigator.clipboard
                                ?.writeText(message.text)
                                .then(() => {
                                  setCopied(message.id);
                                  setTimeout(() => setCopied(""), 1500);
                                })
                                .catch(() => undefined);
                            }}
                          >
                            {copied === message.id ? (
                              <Check size={14} />
                            ) : (
                              <Copy size={14} />
                            )}
                          </button>
                        </div>
                        {logError &&
                          message.answer?.draftLog &&
                          !logged.includes(message.id) && (
                            <p role="alert" className="ns-error">
                              {logError}
                            </p>
                          )}
                      </>
                    )}
                  </div>
                </article>
              ),
            )}
            {busy && !messages.some((m) => m.streaming) && (
              <article className="cg-msg assistant" role="status">
                <span className="cg-avatar" aria-hidden="true">
                  n.
                </span>
                <span className="cg-thinking" aria-label="Thinking">
                  <i />
                  <i />
                  <i />
                </span>
              </article>
            )}
            <div ref={end} className="cg-end" />
          </div>
        )}
      </div>

      {!!messages.length && <div className="cg-dock">{composer}</div>}
      {persistError && (
        <p className="cg-foot-error" role="alert">
          {persistError}
        </p>
      )}
      <p className="cg-foot">
        NutritiScan can make mistakes and is not a doctor. In an emergency, call
        112.{" "}
        {demo
          ? "Demo chats and records are fictional."
          : persist
            ? "Chats are saved, encrypted, to your account."
            : "Chats aren’t saved."}{" "}
        <button onClick={() => navigate("sources")}>Record access</button>
      </p>

      <dialog
        ref={draftDialog}
        aria-labelledby="draft-title"
        className="ha-draft"
        onCancel={(event) => {
          event.preventDefault();
          if (!saving) setDraft(null);
        }}
      >
        {draft && (
          <>
            <h2 id="draft-title">
              {draft.repeat && draft.repeat !== "none"
                ? "Review your reminder"
                : "Review your follow-up"}
            </h2>
            <p>
              {demo
                ? "Saved in this demo until refresh."
                : "Saved to your care list after you confirm."}{" "}
              This does not book an appointment. For phone notifications, add
              your list to your calendar from Care & reminders.
            </p>
            <label>
              What would you like to do?
              <input
                autoFocus
                value={draft.title}
                maxLength={180}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </label>
            <label>
              Your chosen date
              <input
                type="date"
                value={draft.date}
                onChange={(e) => setDraft({ ...draft, date: e.target.value })}
              />
            </label>
            <div className="ha-draft-row">
              <label>
                Time (optional)
                <input
                  type="time"
                  value={draft.time ?? ""}
                  onChange={(e) =>
                    setDraft({ ...draft, time: e.target.value || undefined })
                  }
                />
              </label>
              <label>
                Repeat
                <select
                  value={draft.repeat ?? "none"}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      repeat: e.target.value as CareTask["repeat"],
                    })
                  }
                >
                  <option value="none">Does not repeat</option>
                  <option value="daily">Every day</option>
                  <option value="weekly">Every week</option>
                  <option value="monthly">Every month</option>
                </select>
              </label>
            </div>
            {saveError && (
              <p role="alert" className="ns-error">
                {saveError}
              </p>
            )}
            <div>
              <button disabled={saving} onClick={() => setDraft(null)}>
                Cancel
              </button>
              <button
                className="ns-button ns-dark"
                disabled={saving || !draft.title.trim() || !draft.date}
                onClick={() => void confirmTask()}
              >
                {saving ? "Saving…" : "Confirm & save"}
              </button>
            </div>
          </>
        )}
      </dialog>
    </div>
  );
}
