"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  ArrowUpRight,
  Plus,
  X,
  Check,
  FileText,
  Activity,
  Pill,
  Moon,
  Leaf,
  Heart,
  Stethoscope,
  ChevronDown,
  LoaderCircle,
  Cpu,
  Square,
  ShieldCheck,
  CalendarDays,
  ArrowRight,
  Bell,
} from "lucide-react";
import { runHealthAgent, type AgentReply } from "@/lib/workspace/health-agent";
import { type DeviceModel } from "@/lib/workspace/device-model";
import {
  TaskSchema,
  type CareTask,
  type LogEntry,
  type Workspace,
} from "@/lib/workspace/types";

type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
  answer?: AgentReply;
};
const starters = [
  [
    "Something feels off",
    "Help me organise my symptoms",
    Stethoscope,
    "Make sense of what you’re feeling",
  ],
  [
    "Food & nutrition",
    "Help me understand a balanced vegetarian diet",
    Leaf,
    "Everyday eating, a little clearer",
  ],
  [
    "Medicines",
    "What should I know about medicine interactions?",
    Pill,
    "Understand the questions to ask",
  ],
  [
    "Sleep & energy",
    "Help me understand my sleep and energy",
    Moon,
    "Find a healthier daily rhythm",
  ],
  [
    "Mental wellbeing",
    "I want to talk about stress and mental wellbeing",
    Heart,
    "A space to talk about your mind",
  ],
  [
    "My health records",
    "Summarise my latest report",
    FileText,
    "Put your results into perspective",
  ],
] as const;
const modeText = {
  ai: "AI-assisted answer · experimental",
  reference: "Health reference notes · no AI inference",
  "record-summary": "Your confirmed records · no AI inference",
  escalation: "Human support comes first",
  unavailable: "Coverage limit",
};

/**
 * A turn taken on the server.
 *
 * The same agent as the browser path, run where a hosted model key lives.
 * Only the question and the person's own recent messages are posted; the
 * reference notes, record arithmetic and safety rules are applied on the
 * other side, exactly as they are here.
 */
async function serverTurn(
  question: string,
  demo: boolean,
  history: string[],
  signal: AbortSignal,
): Promise<AgentReply> {
  const response = await fetch(
    `/api/workspace/assistant${demo ? "/demo" : ""}`,
    {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question,
        history,
        today: new Date().toLocaleDateString("en-CA"),
      }),
    },
  );
  const data = await response.json();
  if (!response.ok)
    throw new Error(data?.error || "The answer could not be completed.");
  return data as AgentReply;
}

export default function HealthAgent({
  workspace,
  demo,
  cloudAI,
  seed,
  addReport,
  navigate,
  saveTask,
  saveLog,
}: {
  workspace: Workspace;
  demo: boolean;
  /** Whether this deployment can answer with a hosted model. */
  cloudAI: boolean;
  seed: { text: string; id: number } | null;
  addReport: () => void;
  navigate: (
    view: "records" | "visit" | "care" | "settings" | "trends" | "sources",
  ) => void;
  saveTask: (task: CareTask) => Promise<void>;
  saveLog?: (entries: LogEntry[]) => Promise<void>;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
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
  const model = useRef<DeviceModel | null>(null);
  const loadController = useRef<AbortController | null>(null);
  const turnController = useRef<AbortController | null>(null);
  const active = useRef(false);
  const mounted = useRef(true);
  const end = useRef<HTMLDivElement>(null);
  const draftDialog = useRef<HTMLDialogElement>(null);
  const savingLock = useRef(false);
  const seenSeed = useRef<number | undefined>(undefined);
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
    if (messages.length) end.current?.scrollIntoView({ block: "nearest" });
  }, [messages, busy]);
  const hasDraft = Boolean(draft);
  useEffect(() => {
    if (hasDraft) draftDialog.current?.showModal();
    else draftDialog.current?.close();
  }, [hasDraft]);
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
    setMessages((current) => [...current, userMessage]);
    const history = messages
      .filter((m) => m.role === "user")
      .slice(-3)
      .map((m) => m.text);
    try {
      /*
       * Which engine answers.
       *
       * On-device wins when it is loaded — someone who downloaded a model to
       * keep the question in the tab should not have it posted anywhere. With
       * no device model, the server answers when this deployment has a key,
       * and if that call fails the browser still runs the agent over the
       * reference notes rather than leaving the turn empty.
       */
      const answer = model.current
        ? await runHealthAgent(userMessage.text, workspace, {
            complete: model.current.complete,
            signal: controller.signal,
            history,
          })
        : cloudAI
          ? await serverTurn(
              userMessage.text,
              demo,
              history,
              controller.signal,
            ).catch(async (error) => {
              if (controller.signal.aborted) throw error;
              return runHealthAgent(userMessage.text, workspace, {
                signal: controller.signal,
                history,
              });
            })
          : await runHealthAgent(userMessage.text, workspace, {
              signal: controller.signal,
              history,
            });
      if (mounted.current && !controller.signal.aborted)
        setMessages((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            text: answer.text,
            answer,
          },
        ]);
    } catch {
      if (controller.signal.aborted && model.current) {
        model.current.dispose();
        model.current = null;
        setDevice("off");
      }
      if (mounted.current)
        setMessages((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            text: controller.signal.aborted
              ? "Response stopped. No action was saved. You can keep using references or reload on-device AI."
              : "I couldn’t complete that request. Please try again. No action was saved.",
          },
        ]);
    } finally {
      clearTimeout(timeout);
      active.current = false;
      if (mounted.current) setBusy(false);
    }
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
  return (
    <div className={`ha-layout ${messages.length ? "ha-has-messages" : ""}`}>
      <section className="ha-conversation" aria-label="Health conversation">
        <header className="ha-toolbar">
          <span>
            <span className="ha-status-dot" /> Your health companion
            <b className="ha-engine-tag">
              {device === "ready"
                ? "On-device AI"
                : cloudAI
                  ? "AI engine on"
                  : "References only"}
            </b>
          </span>
          <div>
            <button
              className="ha-mode-button"
              onClick={() => setSettings(!settings)}
              aria-expanded={settings}
            >
              <Cpu size={14} />
              {device === "ready" ? "On-device AI" : "Enable private AI"}
              <ChevronDown size={13} />
            </button>
            {!!messages.length && (
              <button
                className="ha-new"
                disabled={busy}
                onClick={() => {
                  setMessages([]);
                  setDraft(null);
                  setSaved([]);
                }}
              >
                New chat <Plus size={14} />
              </button>
            )}
          </div>
        </header>
        {settings && (
          <section className="ha-device" aria-label="On-device AI settings">
            <div>
              <Cpu size={20} />
              <h2>AI that runs on your device.</h2>
              <button
                aria-label="Close AI settings"
                onClick={() => setSettings(false)}
              >
                <X size={18} />
              </button>
            </div>
            {cloudAI && (
              <p>
                Answers come from the hosted NutritiScan engine by default —
                your question and the published reference notes go to the model
                provider, never your stored reports. Would you rather the
                question stayed on this device?
              </p>
            )}
            <p>
              Qwen 2.5 · open model · no API charges. An initial download of
              roughly 1 GB uses your connection and browser storage. A
              WebGPU-capable browser and sufficient memory are required. Your
              chat stays in this tab, and it answers instead of the hosted
              engine while it is on.
            </p>
            <small>
              Experimental general-purpose model, not clinically validated. It
              can make mistakes. Medical decisions belong with your clinician.
            </small>
            {device === "loading" ? (
              <>
                <progress value={progress} max={1} />
                <div role="status">
                  Loading model · {Math.round(progress * 100)}%{" "}
                  <button onClick={() => loadController.current?.abort()}>
                    Cancel download
                  </button>
                </div>
              </>
            ) : device === "ready" ? (
              <button
                className="ns-button ns-light"
                disabled={busy}
                onClick={() => {
                  model.current?.dispose();
                  model.current = null;
                  setDevice("off");
                }}
              >
                Turn off on-device AI
              </button>
            ) : (
              <button
                className="ns-button ns-dark"
                disabled={busy}
                onClick={() => void enableDevice()}
              >
                Download & enable <ArrowRight size={15} />
              </button>
            )}
            {modelError && (
              <p className="ns-error" role="alert">
                {modelError}
              </p>
            )}
          </section>
        )}
        {!messages.length && (
          <div className="ha-proof-strip" aria-label="Companion principles">
            <span>
              <Check size={12} /> Published references
            </span>
            <span>
              <FileText size={12} /> Your chosen records
            </span>
            <span>
              <Cpu size={12} /> Optional private AI
            </span>
          </div>
        )}
        {!messages.length && (
          <div className="ha-welcome">
            <div className="ha-kicker">
              HELLO,{" "}
              {workspace.profile.name.split(" ")[0].toUpperCase() || "THERE"}{" "}
              <span /> THIS SPACE IS YOURS
            </div>
            <h1>
              How are you
              <br />
              <em>really feeling?</em>
            </h1>
            <p>
              Bring the question. Add the context you choose.
              <br className="ns-desktop" /> Leave with a clearer next step.
            </p>
          </div>
        )}
        {!!messages.length && (
          <div className="ha-transcript" aria-live="polite" aria-busy={busy}>
            {messages.map((message) => (
              <article
                key={message.id}
                className={`ha-message ${message.role}`}
              >
                {message.role === "assistant" && (
                  <div className="ha-message-label">
                    <span className="ha-tiny-mark">n.</span>
                    {message.answer
                      ? modeText[message.answer.mode]
                      : "NutritiScan"}
                  </div>
                )}
                {!!message.answer?.steps?.length && (
                  <details className="ha-steps">
                    <summary>
                      <Check size={13} /> {message.answer.steps.length}{" "}
                      {message.answer.steps.length === 1 ? "step" : "steps"}{" "}
                      completed <ChevronDown size={12} />
                    </summary>
                    <ol>
                      {message.answer.steps.map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ol>
                  </details>
                )}
                <div className="ha-message-body">{message.text}</div>
                {message.answer?.detail && (
                  <p className="ha-result-note">{message.answer.detail}</p>
                )}
                {!!message.answer?.sources.length && (
                  <div className="ha-sources">
                    <span>REFERENCE MATERIAL</span>
                    {message.answer.sources.map((source) => (
                      <a
                        href={source.url}
                        key={source.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <FileText size={13} />
                        {source.title}
                        <ArrowUpRight size={12} />
                      </a>
                    ))}
                  </div>
                )}
                {message.answer?.followUp && (
                  <p className="ha-follow-question">
                    {message.answer.followUp}
                  </p>
                )}
                {message.answer?.draftLog && saveLog && (
                  <>
                    <button
                      className="ha-action"
                      disabled={busy || saving || logged.includes(message.id)}
                      onClick={async () => {
                        if (savingLock.current) return;
                        savingLock.current = true;
                        setSaving(true);
                        setLogError("");
                        try {
                          await saveLog(message.answer!.draftLog!);
                          setLogged((current) => [...current, message.id]);
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
                      {logged.includes(message.id) ? (
                        <>
                          <Check size={14} /> Added to today’s log
                        </>
                      ) : (
                        <>
                          <Check size={14} /> Confirm and add to log
                        </>
                      )}
                    </button>
                    {logError && !logged.includes(message.id) && (
                      <p role="alert" className="ns-error">
                        {logError}
                      </p>
                    )}
                  </>
                )}
                {message.answer?.draftReminder && (
                  <button
                    className="ha-action"
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
                        <Bell size={14} /> Review and save reminder{" "}
                        <ArrowUpRight size={13} />
                      </>
                    )}
                  </button>
                )}
                {message.answer?.draftTask && (
                  <button
                    className="ha-action"
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
                        <CalendarDays size={14} /> Draft a follow-up{" "}
                        <ArrowUpRight size={13} />
                      </>
                    )}
                  </button>
                )}
              </article>
            ))}
            {busy && (
              <div className="ha-thinking" role="status">
                <LoaderCircle size={15} className="ns-spin" />
                {device === "ready" || cloudAI
                  ? "Reading references and preparing your answer…"
                  : "Checking your question…"}
              </div>
            )}
            <div ref={end} />
          </div>
        )}
        <form
          className="ha-composer"
          onSubmit={(event) => {
            event.preventDefault();
            void ask(question);
          }}
        >
          <textarea
            aria-label="Message your health assistant"
            placeholder="Tell me what’s on your mind…"
            value={question}
            maxLength={3000}
            rows={2}
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
          <div>
            <button type="button" className="ha-attach" onClick={addReport}>
              <Plus size={17} /> Add a report
            </button>
            <span>
              {device === "ready"
                ? "Private · on-device"
                : cloudAI
                  ? "AI answers · sources shown"
                  : "References & record tools"}
            </span>
            {busy ? (
              <button
                type="button"
                className="ha-send"
                aria-label="Stop response"
                onClick={() => turnController.current?.abort()}
              >
                <Square size={15} />
              </button>
            ) : (
              <button
                className="ha-send"
                disabled={!question.trim() || device === "loading"}
                aria-label="Send message"
              >
                <ArrowUp size={20} />
              </button>
            )}
          </div>
        </form>
        {!messages.length && (
          <>
            <div className="ha-start-label">
              OR START WITH SOMETHING SPECIFIC
            </div>
            <div className="ha-starters">
              {starters.map(([title, prompt, Icon, description]) => (
                <button
                  key={title}
                  aria-label={title}
                  disabled={busy || device === "loading"}
                  onClick={() => void ask(prompt)}
                >
                  <Icon size={17} strokeWidth={1.5} />
                  <span>
                    <strong>{title}</strong>
                    <small>{description}</small>
                  </span>
                  <ArrowUpRight size={13} />
                </button>
              ))}
            </div>
          </>
        )}
        <button
          className="ha-mobile-access"
          onClick={() => navigate("sources")}
        >
          <ShieldCheck size={14} /> Choose which records your companion can read{" "}
          <ArrowUpRight size={13} />
        </button>
        <p className="ha-disclaimer">
          Health education, not diagnosis or emergency care. Chats aren’t saved.{" "}
          {demo
            ? "Records shown are fictional."
            : "Only confirmed actions are saved to your workspace."}
        </p>
      </section>
      <aside className="ha-context" aria-label="Your health context">
        <div className="ha-context-heading">
          <span>YOUR CONTEXT</span>
          <button
            onClick={() => navigate("settings")}
            aria-label="Edit health context"
          >
            Edit <ArrowUpRight size={12} />
          </button>
        </div>
        <h2>
          Your health,
          <br />
          <em>in one place.</em>
        </h2>
        <p>You choose what to share. Your records stay one click away.</p>
        <button className="ha-context-row" onClick={() => navigate("records")}>
          <FileText size={17} />
          <span>
            Health records
            <small>
              {
                workspace.reports.filter((r) => r.assistantAccess !== false)
                  .length
              }{" "}
              available to your companion
            </small>
          </span>
          <ArrowUpRight size={14} />
        </button>
        <button className="ha-context-row" onClick={() => navigate("care")}>
          <CalendarDays size={17} />
          <span>
            Follow-ups
            <small>
              {workspace.tasks.filter((t) => !t.done).length} open items
            </small>
          </span>
          <ArrowUpRight size={14} />
        </button>
        <button className="ha-context-row" onClick={() => navigate("trends")}>
          <Activity size={17} />
          <span>
            Your health story<small>Results over time</small>
          </span>
          <ArrowUpRight size={14} />
        </button>
        <button className="ha-context-row" onClick={() => navigate("sources")}>
          <ShieldCheck size={17} />
          <span>
            Sources & access<small>You’re in control</small>
          </span>
          <ArrowUpRight size={14} />
        </button>
        <div className="ha-visit-note">
          <span>BEFORE YOUR NEXT APPOINTMENT</span>
          <h3>
            Bring the questions
            <br />
            you meant to ask.
          </h3>
          <p>Prepare a brief with your records, notes and questions.</p>
          <button onClick={() => navigate("visit")}>
            Prepare my visit <ArrowRight size={15} />
          </button>
        </div>
        <div className="ha-source-note">
          <span className="ha-status-dot" />
          <p>
            Educational references from <b>MedlinePlus</b>, the US National
            Library of Medicine. Curated notes, not a live medical search.
          </p>
        </div>
      </aside>
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
