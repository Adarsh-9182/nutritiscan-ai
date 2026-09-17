"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Bell,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronRight,
  CircleHelp,
  FilePlus2,
  FileText,
  Heart,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  Menu,
  MessageCircle,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  X,
  LoaderCircle,
  NotebookPen,
  Repeat,
} from "lucide-react";
import { Brand } from "./product-landing";
import HealthAgent from "./health-agent";
import DailyLog from "./daily-log";
import AgentSuggestions from "./agent-suggestions";
import {
  categorise,
  nextOccurrence,
  repeatText,
} from "@/lib/workspace/actions";
import { toICS } from "@/lib/workspace/calendar";
import { localDate } from "@/lib/workspace/daily";
import RecordSources from "./record-sources";
import { HealthTrends, VisitPreparation } from "./health-story";
import { DEMO } from "@/lib/workspace/demo";
import { extractReport } from "@/lib/workspace/reports";
import {
  rangeStatus,
  statusLabel,
  summaryText,
  ReportSchema,
  TaskSchema,
  type Workspace,
  type Report,
  type Saved,
  type LogEntry,
  type Observation,
  type CareTask,
  type Profile,
} from "@/lib/workspace/types";

const blank: Workspace = {
  profile: {
    name: "",
    language: "English",
    allergies: "",
    medicines: "",
    conditions: "",
  },
  reports: [],
  tasks: [],
};
const today = () => new Date().toLocaleDateString("en-CA");
const dateText = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
const NAV = [
  ["assistant", "Health companion", MessageCircle],
  ["today", "Overview", LayoutDashboard],
  ["log", "Daily log", NotebookPen],
  ["records", "My records", FileText],
  ["trends", "Health trends", Activity],
  ["visit", "Visit preparation", CalendarDays],
  ["care", "Care & reminders", Heart],
  ["sources", "Sources & access", ShieldCheck],
] as const;
type View = (typeof NAV)[number][0] | "settings";
async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const result = await fetch(`/api/workspace/${path}`, {
    method,
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const data = await result.json();
  if (!result.ok)
    throw Object.assign(
      new Error(data.error || "The request could not be completed."),
      { status: result.status },
    );
  return data;
}
function download(name: string, text: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Modal({
  title,
  children,
  close,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    el?.showModal();
    return () => el?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`ns-dialog ${wide ? "wide" : ""}`}
      onCancel={close}
      aria-label={title}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="ns-dialog-head">
        <h2>{title}</h2>
        <button
          className="ns-icon-button"
          aria-label="Close dialog"
          onClick={close}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function Empty({
  icon,
  title,
  text,
  children,
}: {
  icon: ReactNode;
  title: string;
  text: string;
  children?: ReactNode;
}) {
  return (
    <div className="ns-empty">
      <span className="ns-empty-icon">{icon}</span>
      <h3>{title}</h3>
      <p>{text}</p>
      {children}
    </div>
  );
}

function AccountGate({
  onReady,
  demo,
  available,
  initialError,
}: {
  onReady: (recovery?: string) => void;
  demo: () => void;
  available: boolean;
  initialError: string;
}) {
  const [mode, setMode] = useState<"register" | "login" | "recover">(
    "register",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [recovery, setRecovery] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      const result = await api<{ recovery?: string }>(mode, "POST", {
        username: f.get("username"),
        password: f.get("password"),
        name: f.get("name"),
        recovery: f.get("recovery"),
        consent: f.get("consent") === "on",
        adult: f.get("adult") === "on",
      });
      if (mode === "recover") {
        setRecovery(result.recovery!);
        setMode("login");
      } else onReady(result.recovery);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="ns-auth">
      <section className="ns-auth-story">
        <Link href="/">
          <Brand />
        </Link>
        <span className="ns-eyebrow">YOUR NEXT CHAPTER STARTS HERE</span>
        <h1>
          A little more
          <br />
          clarity.
          <br />
          <em>A lot more you.</em>
        </h1>
        <p>
          Your reports, your questions, your health story.
          <br />
          One thoughtful space to bring them together.
        </p>
        <div className="ns-auth-quote">
          <ShieldCheck size={24} />
          <p>
            Your account starts empty.
            <br />
            <strong>Every record comes from you.</strong>
          </p>
        </div>
        <small>
          For adults 18+. Education and visit preparation, not medical
          diagnosis.
        </small>
      </section>
      <section className="ns-auth-form">
        <Link href="/" className="ns-back">
          ← Back to NutritiScan
        </Link>
        <span className="ns-icon soft">
          <Heart size={24} />
        </span>
        <h2>
          {mode === "register"
            ? "Make room for your health."
            : mode === "login"
              ? "Welcome back."
              : "Recover your workspace."}
        </h2>
        <p>
          {mode === "register"
            ? "Create your free early-access workspace."
            : mode === "login"
              ? "Sign in to your personal records."
              : "Use the recovery key you saved when signing up."}
        </p>
        {recovery && (
          <div className="ns-notice">
            <b>Save your new recovery key</b>
            <code>{recovery}</code>
            <p>The previous key no longer works.</p>
          </div>
        )}
        {initialError && (
          <p className="ns-error" role="alert">
            {initialError}
          </p>
        )}
        {!available && (
          <p className="ns-notice">
            Accounts are temporarily unavailable. You can explore the fictional
            demo below.
          </p>
        )}
        <form onSubmit={submit} className="ns-form">
          {mode === "register" && (
            <label>
              Your name
              <input
                name="name"
                required
                maxLength={70}
                autoComplete="given-name"
                placeholder="What should we call you?"
              />
            </label>
          )}
          <label>
            Username
            <input
              name="username"
              required
              minLength={3}
              maxLength={40}
              pattern="[a-zA-Z0-9_-]+"
              autoComplete="username"
              placeholder="Choose a unique username"
            />
          </label>
          {mode === "recover" && (
            <label>
              Recovery key
              <input name="recovery" required autoComplete="off" />
            </label>
          )}
          <label>
            {mode === "recover" ? "New password" : "Password"}
            <input
              name="password"
              type="password"
              required
              minLength={12}
              maxLength={128}
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              placeholder="At least 12 characters"
            />
          </label>
          {mode === "register" && (
            <>
              <label className="ns-check">
                <input type="checkbox" name="adult" required /> I am 18 or
                older.
              </label>
              <label className="ns-check">
                <input type="checkbox" name="consent" required />
                <span>
                  I agree to the{" "}
                  <Link href="/terms" target="_blank">
                    terms
                  </Link>{" "}
                  and consent to storing the records I submit, as described in
                  the{" "}
                  <Link href="/privacy" target="_blank">
                    privacy notice
                  </Link>
                  .
                </span>
              </label>
            </>
          )}
          {error && (
            <p className="ns-error" role="alert">
              {error}
            </p>
          )}
          <button className="ns-button ns-dark" disabled={busy || !available}>
            {busy ? (
              <LoaderCircle className="ns-spin" size={18} />
            ) : (
              <>
                {mode === "register"
                  ? "Create workspace"
                  : mode === "login"
                    ? "Sign in"
                    : "Reset password"}
                <ArrowRight size={17} />
              </>
            )}
          </button>
        </form>
        <div className="ns-auth-links">
          <button
            onClick={() => {
              setMode(mode === "register" ? "login" : "register");
              setError("");
            }}
          >
            {mode === "register"
              ? "Already have an account? Sign in"
              : "New here? Create an account"}
          </button>
          {mode === "login" && (
            <button onClick={() => setMode("recover")}>
              Use a recovery key
            </button>
          )}
        </div>
        <div className="ns-auth-demo">
          <span>Just looking around?</span>
          <button className="ns-text-button" onClick={demo}>
            Explore a fictional sample <ArrowUpRight size={15} />
          </button>
        </div>
      </section>
    </div>
  );
}

export default function HealthWorkspace() {
  const [workspace, setWorkspace] = useState<Workspace>(blank);
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [demo, setDemo] = useState(false);
  const [view, setView] = useState<View>("assistant");
  const [mobile, setMobile] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [upload, setUpload] = useState(false);
  const [selected, setSelected] = useState<Saved<Report> | null>(null);
  const [summary, setSummary] = useState(false);
  const [recovery, setRecovery] = useState("");
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState(false);
  const [agentAccessVersion, setAgentAccessVersion] = useState(0);
  const accessLock = useRef(false);
  const [accounts, setAccounts] = useState(true);
  const [agentSeed, setAgentSeed] = useState<{
    text: string;
    id: number;
  } | null>(null);
  function openDemo() {
    setDemo(true);
    setSignedIn(false);
    setWorkspace(structuredClone(DEMO));
    setLoading(false);
    setAgentSeed(null);
    setView("assistant");
    setError("");
  }
  async function refresh() {
    const [w, s] = await Promise.all([
      api<Workspace>("state"),
      api<{ model: boolean; accounts: boolean }>("status"),
    ]);
    setWorkspace(w);
    setAccounts(s.accounts);
    setSignedIn(true);
    setDemo(false);
  }
  useEffect(() => {
    let alive = true;
    if (new URLSearchParams(location.search).has("demo")) {
      queueMicrotask(() => {
        if (!alive) return;
        setDemo(true);
        setWorkspace(structuredClone(DEMO));
        setLoading(false);
      });
      return () => {
        alive = false;
      };
    }
    Promise.allSettled([
      api<Workspace>("state"),
      api<{ model: boolean; accounts: boolean }>("status"),
    ]).then(([w, s]) => {
      if (!alive) return;
      if (s.status === "fulfilled") {
        setAccounts(s.value.accounts);
      } else {
        setAccounts(false);
      }
      if (w.status === "fulfilled") {
        setWorkspace(w.value);
        setSignedIn(true);
      } else if (w.reason.status !== 401) {
        setError(w.reason.message);
      }
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);
  async function ready(key?: string) {
    try {
      await refresh();
      if (key) setRecovery(key);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function mutate(action: () => Promise<void>, reload = true) {
    setPending(true);
    setError("");
    setNotice("");
    try {
      await action();
      if (!demo && reload) await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }
  function navigate(next: View) {
    setView(next);
    setMobile(false);
    setError("");
    setNotice("");
  }
  async function saveReport(report: Report) {
    if (demo) {
      setWorkspace((w) => ({
        ...w,
        reports: [
          {
            ...report,
            id: crypto.randomUUID(),
            createdAt: new Date().toISOString(),
            version: 1,
          },
          ...w.reports,
        ],
      }));
    } else {
      await api("records", "POST", { kind: "report", data: report });
      await refresh();
    }
    setUpload(false);
    setView("records");
    setNotice(
      "Report saved. These results are confirmed by you, not clinically verified.",
    );
  }
  function ask(text: string) {
    setAgentSeed({ text, id: Date.now() });
    setView("assistant");
  }
  async function changeReportAccess(
    report: Saved<Report>,
    assistantAccess: boolean,
  ) {
    if (accessLock.current) return;
    accessLock.current = true;
    await mutate(async () => {
      const updated = { ...report, assistantAccess };
      if (!demo)
        await api("records", "POST", {
          kind: "report",
          id: report.id,
          version: report.version,
          data: updated,
        });
      setWorkspace((w) => ({
        ...w,
        reports: w.reports.map((r) =>
          r.id === report.id ? { ...updated, version: report.version + 1 } : r,
        ),
      }));
      setAgentSeed(null);
      setAgentAccessVersion((v) => v + 1);
      setNotice("Assistant access updated. A fresh conversation is ready.");
    }, false);
    accessLock.current = false;
  }
  async function saveAgentTask(task: CareTask) {
    if (demo)
      setWorkspace((w) => ({
        ...w,
        tasks: [
          {
            ...task,
            id: crypto.randomUUID(),
            createdAt: new Date().toISOString(),
            version: 1,
          },
          ...w.tasks,
        ],
      }));
    else {
      const saved = await api<{ id: string }>("records", "POST", {
        kind: "task",
        data: task,
      });
      setWorkspace((w) => ({
        ...w,
        tasks: [
          {
            ...task,
            id: saved.id,
            createdAt: new Date().toISOString(),
            version: 1,
          },
          ...w.tasks,
        ],
      }));
    }
  }
  /** Completing a repeating reminder schedules its next date instead. */
  function toggleTask(t: Saved<CareTask>) {
    const repeating = !t.done && t.repeat && t.repeat !== "none";
    const data = repeating
      ? { ...t, date: nextOccurrence(t) }
      : { ...t, done: !t.done };
    return mutate(async () => {
      if (demo)
        setWorkspace((w) => ({
          ...w,
          tasks: w.tasks.map((x) =>
            x.id === t.id ? { ...data, version: x.version + 1 } : x,
          ),
        }));
      else
        await api("records", "POST", {
          kind: "task",
          id: t.id,
          version: t.version,
          data,
        });
      if (repeating)
        setNotice(`Done for now. Next reminder: ${dateText(data.date)}.`);
    });
  }
  function exportCalendar(tasks: Saved<CareTask>[]) {
    download("nutritiscan-reminders.ics", toICS(tasks), "text/calendar");
  }
  /** Persist the full entry list for one date: create the day or update it
   * with its version so concurrent edits fail instead of overwriting. */
  async function saveDay(date: string, entries: LogEntry[]) {
    const existing = workspace.days?.find((d) => d.date === date);
    const data = { date, entries };
    if (demo) {
      setWorkspace((w) => ({
        ...w,
        days: [
          ...(w.days ?? []).filter((d) => d.date !== date),
          {
            ...data,
            id: existing?.id ?? crypto.randomUUID(),
            createdAt: existing?.createdAt ?? new Date().toISOString(),
            version: (existing?.version ?? 0) + 1,
          },
        ].sort((a, b) => a.date.localeCompare(b.date)),
      }));
      return;
    }
    await api("records", "POST", {
      kind: "day",
      data,
      ...(existing ? { id: existing.id, version: existing.version } : {}),
    });
    await refresh();
  }
  async function saveAgentLog(entries: LogEntry[]) {
    const date = localDate();
    const current = workspace.days?.find((d) => d.date === date);
    const now = new Date().toTimeString().slice(0, 5);
    await saveDay(date, [
      ...(current?.entries ?? []),
      ...entries.map((e) => ({ ...e, time: e.time ?? now })),
    ]);
  }
  if (loading)
    return (
      <div className="ns-loading">
        <Brand />
        <LoaderCircle className="ns-spin" />
        <p>Opening your workspace…</p>
      </div>
    );
  if (!signedIn && !demo)
    return (
      <AccountGate
        onReady={ready}
        demo={openDemo}
        available={accounts}
        initialError={error}
      />
    );
  const reports = [...workspace.reports].sort((a, b) =>
    b.date.localeCompare(a.date),
  );
  const latest = reports[0];
  const observations = latest?.observations.slice(0, 4) ?? [];
  const openTasks = workspace.tasks
    .filter((t) => !t.done)
    .sort((a, b) => a.date.localeCompare(b.date));
  return (
    <div className="ns-app ns-companion-app">
      <a href="#workspace-main" className="sr-only skip-link">
        Skip to workspace
      </a>
      {mobile && (
        <button
          className="ns-mobile-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        />
      )}
      <aside className={`ns-sidebar ${mobile ? "open" : ""}`}>
        <Link className="ns-sidebar-brand" href="/?home">
          <Brand />
        </Link>
        <div className="ns-space-label">PERSONAL WORKSPACE</div>
        <nav aria-label="Workspace">
          {NAV.map(([key, label, Icon]) => (
            <button
              key={key}
              onClick={() => navigate(key)}
              className={view === key ? "active" : ""}
              aria-current={view === key ? "page" : undefined}
            >
              <Icon size={19} />
              {label}
              {key === "records" && (
                <span className="ns-nav-count">{reports.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="ns-sidebar-note">
          <LockKeyhole size={15} />
          <p>
            A private space.
            <br />
            <span>For a healthier everyday.</span>
          </p>
        </div>
        <div className="ns-sidebar-bottom">
          <button
            className={view === "settings" ? "active" : ""}
            onClick={() => navigate("settings")}
          >
            <Settings2 size={18} /> Settings & privacy
          </button>
          <Link href="/terms">
            <CircleHelp size={18} /> What NutritiScan can do
          </Link>
          <button className="ns-user" onClick={() => navigate("settings")}>
            <span className="ns-avatar">
              {workspace.profile.name.slice(0, 1).toUpperCase()}
            </span>
            <span>
              <b>{workspace.profile.name}</b>
              <small>
                {demo ? "Fictional demo profile" : "Personal account"}
              </small>
            </span>
            <ChevronRight size={15} />
          </button>
        </div>
      </aside>
      <div className="ns-app-body">
        <header className="ns-app-top">
          <div className="ns-row">
            <button
              className="ns-icon-button ns-mobile-toggle"
              aria-label="Open navigation"
              onClick={() => setMobile(true)}
            >
              <Menu size={22} />
            </button>
            <span className="ns-breadcrumb">
              My workspace <ChevronRight size={13} />{" "}
              <b>
                {view === "settings"
                  ? "Settings"
                  : NAV.find((n) => n[0] === view)?.[1]}
              </b>
            </span>
          </div>
          <div className="ns-top-actions">
            <span className="ns-early">EARLY ACCESS</span>
            <button
              className="ns-icon-button"
              onClick={() => {
                navigate("records");
                setTimeout(
                  () => document.getElementById("record-search")?.focus(),
                  0,
                );
              }}
              aria-label="Search records"
            >
              <Search size={19} />
            </button>
            <button
              className="ns-icon-button"
              onClick={() => navigate("care")}
              aria-label="View follow-ups"
            >
              <Bell size={19} />
              {openTasks.length > 0 && <i />}
            </button>
            <button
              className="ns-avatar"
              aria-label="Open profile settings"
              onClick={() => navigate("settings")}
            >
              {workspace.profile.name.slice(0, 1).toUpperCase()}
            </button>
          </div>
        </header>
        {demo && (
          <div className="ns-demo-bar">
            <span>
              <Sparkles size={14} /> Demo workspace · fictional records ·
              changes last until refresh
            </span>
            <button
              onClick={() => {
                setDemo(false);
                setWorkspace(blank);
                setAgentSeed(null);
              }}
            >
              Create your own <ArrowRight size={14} />
            </button>
          </div>
        )}
        <main
          id="workspace-main"
          className={`ns-main ${view === "assistant" ? "assistant-view" : ""}`}
        >
          {error && (
            <div role="alert" className="ns-error ns-alert">
              {error}
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {notice && (
            <div role="status" className="ns-notice">
              {notice}
            </div>
          )}
          {view === "today" && (
            <>
              <div className="ns-page-heading">
                <div>
                  <span className="ns-eyebrow">
                    YOUR HEALTH, A LITTLE CLEARER
                  </span>
                  <h1>
                    Hello, {workspace.profile.name}.{" "}
                    <span className="ns-greeting">✳</span>
                  </h1>
                  <p>
                    One place for your records. A clearer view of what’s next.
                  </p>
                </div>
                <button
                  className="ns-button ns-dark"
                  onClick={() => setUpload(true)}
                >
                  <Plus size={17} /> Add a report
                </button>
              </div>
              <section className="ns-overview-hero">
                <div>
                  <span className="ns-pill ns-white-pill">
                    <Sparkles size={13} /> MEET YOUR HEALTH WORKSPACE
                  </span>
                  <h2>
                    More than numbers.
                    <br />
                    <em>Your health story.</em>
                  </h2>
                  <p>
                    Understand your reports in context and bring
                    <br className="ns-desktop" /> better questions to your next
                    appointment.
                  </p>
                  <button
                    className="ns-button ns-cream"
                    onClick={() => ask("Summarise my latest report")}
                  >
                    Understand my report <ArrowUpRight size={17} />
                  </button>
                </div>
                <div className="ns-orbit-illustration" aria-hidden="true">
                  <div />
                  <div />
                  <div />
                  <span className="ns-orbit-center">
                    <Heart size={40} strokeWidth={1.2} />
                  </span>
                  <i className="ns-orbit-icon one">
                    <FileText size={22} />
                  </i>
                  <i className="ns-orbit-icon two">
                    <Activity size={22} />
                  </i>
                  <i className="ns-orbit-icon three">
                    <Plus size={22} />
                  </i>
                  <span className="ns-orbit-caption">
                    A CONNECTED PICTURE OF YOU
                  </span>
                </div>
              </section>
              <AgentSuggestions
                workspace={workspace}
                disabled={pending}
                add={saveAgentTask}
                compact
              />
              <div className="ns-section-heading">
                <h2>
                  Your latest snapshot{" "}
                  <span>
                    {latest ? dateText(latest.date) : "No report yet"}
                  </span>
                </h2>
                <button
                  className="ns-text-button"
                  onClick={() => navigate("records")}
                >
                  All records <ArrowUpRight size={15} />
                </button>
              </div>
              {observations.length ? (
                <div className="ns-stat-grid">
                  {observations.map((o, i) => {
                    const status = rangeStatus(o);
                    return (
                      <button
                        className="ns-stat-card"
                        key={o.name}
                        onClick={() => setSelected(latest)}
                      >
                        <div className="ns-row ns-between">
                          <span>{o.name}</span>
                          <span className={`ns-stat-icon tone-${i}`}>
                            <Activity size={17} />
                          </span>
                        </div>
                        <div className="ns-stat-value">
                          {o.value}
                          <small>{o.unit}</small>
                        </div>
                        <div className="ns-stat-range">
                          <span className={`ns-status-dot ${status}`} />
                          {statusLabel[status]}
                        </div>
                        <div className="ns-mini-range">
                          <i
                            className={status}
                            style={{
                              left: `${Math.max(5, Math.min(95, o.high ? (o.value / o.high) * 85 : 50))}%`,
                            }}
                          />
                        </div>
                        <small>
                          Range from your report · {o.low ?? "?"}–
                          {o.high ?? "?"}
                        </small>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <Empty
                  icon={<FilePlus2 />}
                  title="Your first report starts the story"
                  text="Add a report and confirm its values. Your snapshot will only show information you have recorded."
                >
                  <button
                    className="ns-button ns-light"
                    onClick={() => setUpload(true)}
                  >
                    Add my first report <Plus size={16} />
                  </button>
                </Empty>
              )}
              <section className="ns-story-entry">
                <div>
                  <span className="ns-eyebrow">
                    ONE REPORT IS A MOMENT. TOGETHER, A STORY.
                  </span>
                  <h2>See what changed since last time.</h2>
                  <p>
                    Explore your recorded results across dates, with the
                    original report behind every number.
                  </p>
                </div>
                <button
                  className="ns-button ns-dark"
                  onClick={() => navigate("trends")}
                >
                  Explore health trends <ArrowUpRight size={17} />
                </button>
              </section>
              <div className="ns-overview-bottom">
                <section className="ns-card">
                  <div className="ns-section-heading">
                    <h2>Next on your list</h2>
                    <button
                      className="ns-text-button"
                      onClick={() => navigate("care")}
                    >
                      View care <ArrowUpRight size={15} />
                    </button>
                  </div>
                  {openTasks.length ? (
                    openTasks
                      .slice(0, 3)
                      .map((t) => (
                        <TaskRow
                          key={t.id}
                          task={t}
                          disabled={pending}
                          onToggle={() => toggleTask(t)}
                        />
                      ))
                  ) : (
                    <div className="ns-inline-empty">
                      <CalendarDays size={25} />
                      <p>
                        Keep your next steps close.
                        <br />
                        <button onClick={() => navigate("care")}>
                          Add a follow-up →
                        </button>
                      </p>
                    </div>
                  )}
                </section>
                <section className="ns-visit-card">
                  <span className="ns-icon soft">
                    <FileText size={21} />
                  </span>
                  <h2>
                    A better doctor visit
                    <br />
                    starts before the visit.
                  </h2>
                  <p>
                    Bring your reports, history and questions together in one
                    clear summary.
                  </p>
                  <button
                    className="ns-text-button"
                    onClick={() => navigate("visit")}
                  >
                    Prepare my summary <ArrowRight size={16} />
                  </button>
                </section>
              </div>
              <div className="ns-context-note">
                <ShieldCheck size={15} />
                <span>
                  A range comparison is not a diagnosis. Your clinician can
                  interpret results in the context of your health.
                </span>
              </div>
            </>
          )}
          {view === "log" && (
            <DailyLog
              workspace={workspace}
              disabled={pending}
              ask={ask}
              saveToday={(entries) =>
                mutate(() => saveDay(localDate(), entries), false)
              }
            />
          )}
          {view === "records" && (
            <>
              <div className="ns-page-heading">
                <div>
                  <span className="ns-eyebrow">EVERY RECORD HAS A STORY</span>
                  <h1>My records</h1>
                  <p>
                    Your confirmed results, organised and ready when you need
                    them.
                  </p>
                </div>
                <button
                  className="ns-button ns-dark"
                  onClick={() => setUpload(true)}
                >
                  <Plus size={17} /> Add a report
                </button>
              </div>
              <div className="ns-record-toolbar">
                <label className="ns-search">
                  <Search size={18} />
                  <input
                    id="record-search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search by report, lab or test…"
                  />
                </label>
                <span>{reports.length} reports</span>
              </div>
              <div className="ns-record-grid">
                {reports
                  .filter((r) =>
                    `${r.title} ${r.lab} ${r.observations.map((o) => o.name).join(" ")}`
                      .toLowerCase()
                      .includes(query.toLowerCase()),
                  )
                  .map((r) => (
                    <button
                      className="ns-record-card"
                      key={r.id}
                      onClick={() => setSelected(r)}
                    >
                      <div className="ns-row ns-between">
                        <span className="ns-icon soft">
                          <FileText size={24} />
                        </span>
                        <ArrowUpRight size={18} />
                      </div>
                      <h2>{r.title}</h2>
                      <p>
                        {r.lab || "Lab not recorded"} · {dateText(r.date)}
                      </p>
                      <div className="ns-record-tests">
                        {r.observations.slice(0, 3).map((o) => (
                          <span key={o.name}>{o.name}</span>
                        ))}
                        {r.observations.length > 3 && (
                          <span>+{r.observations.length - 3}</span>
                        )}
                      </div>
                      <div className="ns-record-footer">
                        <span>
                          <CheckCheck size={14} /> Confirmed by you
                        </span>
                        <span>{r.observations.length} results</span>
                      </div>
                    </button>
                  ))}
              </div>
              {!reports.length && (
                <Empty
                  icon={<FileText />}
                  title="A fresh start for your records"
                  text="Import a text-based PDF or enter your values manually. Nothing is saved until you check it."
                >
                  <button
                    className="ns-button ns-dark"
                    onClick={() => setUpload(true)}
                  >
                    Add a report
                  </button>
                </Empty>
              )}
              {reports.length > 0 &&
                !reports.some((r) =>
                  `${r.title} ${r.lab} ${r.observations.map((o) => o.name).join(" ")}`
                    .toLowerCase()
                    .includes(query.toLowerCase()),
                ) && (
                  <Empty
                    icon={<Search />}
                    title="No matching records"
                    text="Try a different report name, lab or test."
                  />
                )}
            </>
          )}
          {view === "trends" && (
            <HealthTrends
              workspace={workspace}
              openReport={(id) =>
                setSelected(workspace.reports.find((r) => r.id === id) ?? null)
              }
              addReport={() => setUpload(true)}
            />
          )}
          {view === "visit" && (
            <VisitPreparation
              workspace={workspace}
              download={download}
              demo={demo}
            />
          )}
          <div hidden={view !== "assistant"}>
            <HealthAgent
              key={agentAccessVersion}
              workspace={workspace}
              demo={demo}
              seed={agentSeed}
              addReport={() => setUpload(true)}
              navigate={navigate}
              saveTask={saveAgentTask}
              saveLog={saveAgentLog}
            />
          </div>
          {view === "sources" && (
            <RecordSources
              reports={reports}
              pending={pending}
              changeAccess={(report, allowed) =>
                void changeReportAccess(report, allowed)
              }
              addReport={() => setUpload(true)}
              openReport={setSelected}
            />
          )}
          {view === "care" && (
            <>
              <div className="ns-page-heading">
                <div>
                  <span className="ns-eyebrow">SMALL STEPS, KEPT TOGETHER</span>
                  <h1>Care & reminders</h1>
                  <p>
                    Your own next steps. Add advice from your clinician,
                    appointments or questions.
                  </p>
                </div>
                <button
                  className="ns-button ns-light"
                  onClick={() => setSummary(true)}
                >
                  <ArrowDownToLine size={17} /> Visit summary
                </button>
              </div>
              <AgentSuggestions
                workspace={workspace}
                disabled={pending}
                add={saveAgentTask}
              />
              <section className="ns-card">
                <h2 className="ns-card-title">What’s next?</h2>
                <form
                  className="ns-task-form ns-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const form = e.currentTarget;
                    const f = new FormData(form);
                    void mutate(async () => {
                      const title = String(f.get("title"));
                      const task = TaskSchema.parse({
                        title,
                        date: String(f.get("date")),
                        time: String(f.get("time") ?? "") || undefined,
                        repeat: String(f.get("repeat") ?? "none"),
                        category: categorise(title),
                        done: false,
                      });
                      if (demo)
                        setWorkspace((w) => ({
                          ...w,
                          tasks: [
                            {
                              ...task,
                              id: crypto.randomUUID(),
                              version: 1,
                              createdAt: new Date().toISOString(),
                            },
                            ...w.tasks,
                          ],
                        }));
                      else
                        await api("records", "POST", {
                          kind: "task",
                          data: task,
                        });
                      form.reset();
                    });
                  }}
                >
                  <label className="ns-grow">
                    Follow-up
                    <input
                      name="title"
                      required
                      maxLength={180}
                      placeholder="e.g. Bring my reports to my appointment"
                    />
                  </label>
                  <label>
                    Date
                    <input
                      name="date"
                      type="date"
                      defaultValue={today()}
                      required
                    />
                  </label>
                  <label>
                    Time
                    <input name="time" type="time" />
                  </label>
                  <label>
                    Repeat
                    <select name="repeat" defaultValue="none">
                      <option value="none">Once</option>
                      <option value="daily">Every day</option>
                      <option value="weekly">Every week</option>
                      <option value="monthly">Every month</option>
                    </select>
                  </label>
                  <button className="ns-button ns-dark" disabled={pending}>
                    <Plus size={17} /> Add
                  </button>
                </form>
                <div className="ns-calendar-note">
                  <p className="ns-small-note">
                    Want a phone notification? Add your open items to Google
                    Calendar, Apple Calendar or Outlook — your calendar sends
                    the alert, at the time you set.
                  </p>
                  <button
                    type="button"
                    className="ns-button ns-light"
                    disabled={!openTasks.length}
                    onClick={() => exportCalendar(openTasks)}
                  >
                    <Bell size={16} /> Add all to calendar
                  </button>
                </div>
                <div className="ns-task-list">
                  {[...workspace.tasks]
                    .sort(
                      (a, b) =>
                        Number(a.done) - Number(b.done) ||
                        a.date.localeCompare(b.date),
                    )
                    .map((t) => (
                      <TaskRow
                        key={t.id}
                        task={t}
                        disabled={pending}
                        onToggle={() => toggleTask(t)}
                        onCalendar={() => exportCalendar([t])}
                        onDelete={() =>
                          mutate(async () => {
                            if (demo)
                              setWorkspace((w) => ({
                                ...w,
                                tasks: w.tasks.filter((x) => x.id !== t.id),
                              }));
                            else await api("records", "DELETE", { id: t.id });
                          })
                        }
                      />
                    ))}
                </div>
                {!workspace.tasks.length && (
                  <Empty
                    icon={<CalendarDays />}
                    title="One next step is a good start"
                    text="Add a task above. Your list is yours to plan, edit and complete."
                  />
                )}
              </section>
              <section className="ns-care-info">
                <ShieldCheck size={24} />
                <div>
                  <h3>Your clinician leads your care.</h3>
                  <p>
                    These are organisational tools. NutritiScan does not
                    prescribe medicines, create treatment plans or book doctor
                    consultations.
                  </p>
                </div>
              </section>
            </>
          )}
          {view === "settings" && (
            <SettingsPanel
              profile={workspace.profile}
              pending={pending}
              demo={demo}
              onSave={(p) =>
                mutate(async () => {
                  if (demo) setWorkspace((w) => ({ ...w, profile: p }));
                  else await api("profile", "PUT", p);
                  setNotice("Profile saved.");
                })
              }
              onExport={() =>
                mutate(async () => {
                  const data = demo ? workspace : await api("export");
                  download(
                    "nutritiscan-records.json",
                    JSON.stringify(data, null, 2),
                    "application/json",
                  );
                })
              }
              onLogout={() =>
                mutate(async () => {
                  if (!demo) await api("logout", "POST", {});
                  setSignedIn(false);
                  setDemo(false);
                  setWorkspace(blank);
                  setAgentSeed(null);
                }, false)
              }
              onDelete={(password) =>
                mutate(async () => {
                  if (!demo) await api("account", "DELETE", { password });
                  setSignedIn(false);
                  setDemo(false);
                  setWorkspace(blank);
                  setAgentSeed(null);
                }, false)
              }
            />
          )}
        </main>
        <footer className="ns-app-footer">
          <span>
            <LockKeyhole size={12} />
            {demo
              ? "Demo data stays in this session"
              : "Account records · encrypted on the server"}
          </span>
          <Link href="/privacy">Privacy & data</Link>
        </footer>
      </div>
      {upload && (
        <ReportModal save={saveReport} close={() => setUpload(false)} />
      )}
      {selected && (
        <Modal title={selected.title} wide close={() => setSelected(null)}>
          <div className="ns-dialog-body">
            <p className="ns-small-note">
              {selected.lab || "Lab not recorded"} · {dateText(selected.date)} ·
              Confirmed by you
            </p>
            <div className="ns-table-wrap">
              <table className="ns-results-table">
                <thead>
                  <tr>
                    <th>Test</th>
                    <th>Result</th>
                    <th>Report range</th>
                    <th>Comparison</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.observations.map((o) => (
                    <tr key={o.name}>
                      <td>{o.name}</td>
                      <td>
                        <strong>{o.value}</strong> {o.unit}
                      </td>
                      <td>
                        {o.low ?? "?"}–{o.high ?? "?"}
                      </td>
                      <td>
                        <span className={`ns-badge ${rangeStatus(o)}`}>
                          {statusLabel[rangeStatus(o)]}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="ns-small-note">
              Ranges and units belong to this report. Results from different
              labs or methods may not be comparable.
            </p>
            {selected.notes && <p>{selected.notes}</p>}
            <div className="ns-dialog-actions">
              <button
                className="ns-button ns-dark"
                onClick={() => {
                  setSelected(null);
                  void ask("Summarise my latest report");
                }}
              >
                Explain latest report <Sparkles size={15} />
              </button>
              <button
                className="ns-button ns-danger"
                disabled={pending}
                onClick={() => {
                  if (window.confirm("Delete this report from your records?"))
                    void mutate(async () => {
                      if (demo)
                        setWorkspace((w) => ({
                          ...w,
                          reports: w.reports.filter(
                            (r) => r.id !== selected.id,
                          ),
                        }));
                      else await api("records", "DELETE", { id: selected.id });
                      setSelected(null);
                    });
                }}
              >
                <Trash2 size={15} /> Delete report
              </button>
            </div>
          </div>
        </Modal>
      )}
      {summary && (
        <Modal
          title="Your doctor-visit summary"
          wide
          close={() => setSummary(false)}
        >
          <div className="ns-dialog-body">
            <p>
              Patient-confirmed information, ready to take to your clinician.
            </p>
            <pre className="ns-summary">{summaryText(workspace)}</pre>
            <button
              className="ns-button ns-dark"
              onClick={() =>
                download(
                  "nutritiscan-visit-summary.txt",
                  summaryText(workspace),
                )
              }
            >
              <ArrowDownToLine size={16} /> Download summary
            </button>
          </div>
        </Modal>
      )}
      {recovery && (
        <Modal title="Save your recovery key" close={() => setRecovery("")}>
          <div className="ns-dialog-body">
            <p>
              This key is the only way to reset a forgotten password. Store it
              somewhere private, outside this app. We cannot recover it for you.
            </p>
            <code className="ns-recovery">{recovery}</code>
            <button
              className="ns-button ns-dark"
              onClick={() =>
                download(
                  "nutritiscan-recovery-key.txt",
                  `Keep this private. NutritiScan account recovery key:\n${recovery}`,
                )
              }
            >
              <ArrowDownToLine size={16} /> Download recovery key
            </button>
            <button className="ns-text-button" onClick={() => setRecovery("")}>
              I have saved it
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function TaskRow({
  task,
  disabled,
  onToggle,
  onDelete,
  onCalendar,
}: {
  task: Saved<CareTask>;
  disabled: boolean;
  onToggle: () => void;
  onDelete?: () => void;
  onCalendar?: () => void;
}) {
  const repeating = task.repeat && task.repeat !== "none";
  return (
    <div className={`ns-task-row ${task.done ? "done" : ""}`}>
      <button
        className="ns-task-check"
        role="checkbox"
        aria-checked={task.done}
        aria-label={`${task.done ? "Reopen" : repeating ? "Done for now:" : "Complete"} ${task.title}`}
        onClick={onToggle}
        disabled={disabled}
      >
        {task.done && <Check size={14} />}
      </button>
      <div>
        <b>{task.title}</b>
        <span>
          <CalendarDays size={12} />
          {dateText(task.date)}
          {task.time ? ` · ${task.time}` : ""}
          {repeating ? (
            <em className="ns-repeat">
              <Repeat size={11} /> {repeatText[task.repeat!]}
            </em>
          ) : null}
          {!task.done && task.date < today() ? " · Past due" : ""}
        </span>
      </div>
      {onCalendar && !task.done && (
        <button
          className="ns-icon-button"
          aria-label={`Add ${task.title} to calendar`}
          title="Add to calendar"
          onClick={onCalendar}
        >
          <Bell size={15} />
        </button>
      )}
      {onDelete ? (
        <button
          className="ns-icon-button"
          aria-label={`Delete ${task.title}`}
          disabled={disabled}
          onClick={onDelete}
        >
          <Trash2 size={15} />
        </button>
      ) : (
        <ChevronRight size={16} />
      )}
    </div>
  );
}

function ReportModal({
  save,
  close,
}: {
  save: (report: Report) => Promise<void>;
  close: () => void;
}) {
  const [raw, setRaw] = useState("");
  const [rows, setRows] = useState<Observation[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [filename, setFilename] = useState("");
  const [source, setSource] = useState<Report["source"]>();
  async function file(file: File) {
    setBusy(true);
    setError("");
    try {
      const { readReportFile } = await import("@/lib/workspace/pdf");
      const text = await readReportFile(file);
      const digest = await crypto.subtle.digest(
        "SHA-256",
        await file.arrayBuffer(),
      );
      setSource({
        method: /\.pdf$/i.test(file.name) ? "pdf" : "text",
        label: file.name.slice(0, 180),
        fingerprint: Array.from(new Uint8Array(digest), (n) =>
          n.toString(16).padStart(2, "0"),
        ).join(""),
      });
      setRaw(text);
      setRows(extractReport(text));
      setFilename(file.name);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const update = (i: number, key: keyof Observation, value: string) =>
    setRows(
      rows.map((o, j) =>
        j !== i
          ? o
          : {
              ...o,
              [key]: ["value", "low", "high"].includes(key)
                ? value === ""
                  ? key === "value"
                    ? NaN
                    : null
                  : Number(value)
                : value,
            },
      ),
    );
  return (
    <Modal title="Add a health report" close={close} wide>
      <form
        className="ns-dialog-body ns-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          setBusy(true);
          const f = new FormData(e.currentTarget);
          try {
            const report = ReportSchema.parse({
              title: f.get("title"),
              date: f.get("date"),
              lab: f.get("lab"),
              notes: f.get("notes"),
              observations: rows,
              confirmed: f.get("confirmed") === "on",
              source: source ?? { method: "manual", label: "Entered by you" },
              assistantAccess: true,
            });
            await save(report);
          } catch (e) {
            setError(e instanceof Error ? e.message : "Could not save report.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <p>
          Import a text-based PDF, paste report text, or enter results manually.
          Check every extracted value against the original before saving.
        </p>
        <label className="ns-upload-zone">
          <Upload size={26} />
          <strong>
            {busy ? "Reading your report…" : filename || "Choose a report"}
          </strong>
          <span>PDF or TXT · up to 5 MB · parsed on this device</span>
          <input
            aria-label="Upload report file"
            type="file"
            accept=".pdf,.txt"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void file(f);
            }}
          />
        </label>
        <details>
          <summary>Paste report text instead</summary>
          <textarea
            value={raw}
            onChange={(e) => {
              setRaw(e.target.value);
            }}
            maxLength={100000}
            rows={5}
            placeholder="Vitamin B12 245 pg/mL 200–900"
            aria-label="Report text"
          />
          <button
            type="button"
            className="ns-button ns-light"
            onClick={() => {
              setRows(extractReport(raw));
              setSource({
                method: "text",
                label: "Pasted text, reviewed by you",
              });
              setFilename("");
              setError("");
            }}
          >
            Extract values
          </button>
        </details>
        <div className="ns-form-grid">
          <label>
            Report title
            <input
              name="title"
              required
              maxLength={120}
              placeholder="e.g. Annual wellness panel"
              defaultValue={filename.replace(/\.[^.]+$/, "")}
            />
          </label>
          <label>
            Report date
            <input name="date" type="date" required defaultValue={today()} />
          </label>
          <label>
            Lab / provider
            <input
              name="lab"
              maxLength={100}
              placeholder="As written on your report"
            />
          </label>
        </div>
        <div className="ns-section-heading">
          <h3>Review your results</h3>
          <button
            type="button"
            className="ns-text-button"
            onClick={() =>
              setRows((r) => [
                ...r,
                { name: "", value: NaN, unit: "", low: null, high: null },
              ])
            }
          >
            <Plus size={15} /> Add result
          </button>
        </div>
        {!rows.length && (
          <div className="ns-notice">
            No values extracted yet. Add a result manually if the report format
            is not recognised. Missing units or ranges are never guessed.
          </div>
        )}
        <div className="ns-observation-editor">
          {rows.map((o, i) => (
            <fieldset key={i}>
              <legend>Result {i + 1}</legend>
              <label>
                Test
                <input
                  aria-label={`Test ${i + 1}`}
                  value={o.name}
                  onChange={(e) => update(i, "name", e.target.value)}
                  required
                  maxLength={100}
                />
              </label>
              <label>
                Value
                <input
                  aria-label={`Value ${i + 1}`}
                  type="number"
                  step="any"
                  min="0"
                  value={Number.isNaN(o.value) ? "" : o.value}
                  onChange={(e) => update(i, "value", e.target.value)}
                  required
                />
              </label>
              <label>
                Unit
                <input
                  aria-label={`Unit ${i + 1}`}
                  value={o.unit}
                  onChange={(e) => update(i, "unit", e.target.value)}
                  required
                  maxLength={40}
                />
              </label>
              <label>
                Range min
                <input
                  aria-label={`Range min ${i + 1}`}
                  type="number"
                  step="any"
                  min="0"
                  value={o.low ?? ""}
                  onChange={(e) => update(i, "low", e.target.value)}
                  placeholder="Unknown"
                />
              </label>
              <label>
                Range max
                <input
                  aria-label={`Range max ${i + 1}`}
                  type="number"
                  step="any"
                  min="0"
                  value={o.high ?? ""}
                  onChange={(e) => update(i, "high", e.target.value)}
                  placeholder="Unknown"
                />
              </label>
              <button
                type="button"
                className="ns-icon-button"
                aria-label={`Remove result ${i + 1}`}
                onClick={() => setRows((r) => r.filter((_, j) => i !== j))}
              >
                <X size={16} />
              </button>
            </fieldset>
          ))}
        </div>
        {raw && (
          <details>
            <summary>Check against extracted source text</summary>
            <pre className="ns-source-preview">{raw}</pre>
          </details>
        )}
        <label>
          Your note (optional)
          <textarea
            name="notes"
            maxLength={2000}
            rows={2}
            placeholder="Questions to bring to your doctor"
          />
        </label>
        <label className="ns-check">
          <input type="checkbox" name="confirmed" required />
          <span>
            I checked the test names, values, units and ranges against my
            report. These are my results, not another person’s.
          </span>
        </label>
        {error && (
          <p className="ns-error" role="alert">
            {error}
          </p>
        )}
        <div className="ns-dialog-actions">
          <button type="button" className="ns-button ns-light" onClick={close}>
            Cancel
          </button>
          <button className="ns-button ns-dark" disabled={busy || !rows.length}>
            {busy ? (
              <LoaderCircle size={16} className="ns-spin" />
            ) : (
              <Check size={16} />
            )}{" "}
            Confirm & save report
          </button>
        </div>
        <p className="ns-small-note">
          Only confirmed values and your notes are saved. The original file and
          pasted text are not uploaded or stored.
        </p>
      </form>
    </Modal>
  );
}

function SettingsPanel({
  profile,
  pending,
  demo,
  onSave,
  onExport,
  onLogout,
  onDelete,
}: {
  profile: Profile;
  pending: boolean;
  demo: boolean;
  onSave: (p: Profile) => void;
  onExport: () => void;
  onLogout: () => void;
  onDelete: (password: string) => void;
}) {
  const [deleting, setDeleting] = useState(false);
  return (
    <>
      <div className="ns-page-heading">
        <div>
          <span className="ns-eyebrow">ALWAYS IN YOUR HANDS</span>
          <h1>Settings & privacy</h1>
          <p>Your context, your records, your choices.</p>
        </div>
      </div>
      <div className="ns-settings-grid">
        <section className="ns-card">
          <h2 className="ns-card-title">Your health context</h2>
          <p className="ns-small-note">
            Leave anything unknown blank. These details are reported by you, not
            clinically verified.
          </p>
          <form
            className="ns-form"
            key={JSON.stringify(profile)}
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              onSave({
                name: String(f.get("name")),
                language: f.get("language") as Profile["language"],
                conditions: String(f.get("conditions")),
                allergies: String(f.get("allergies")),
                medicines: String(f.get("medicines")),
              });
            }}
          >
            <label>
              Name
              <input
                name="name"
                defaultValue={profile.name}
                required
                maxLength={70}
              />
            </label>
            <label>
              Preferred AI response language
              <select name="language" defaultValue={profile.language}>
                <option>English</option>
                <option>Hindi / Hinglish</option>
              </select>
            </label>
            <p className="ns-small-note">
              Interface and records summaries are currently in English.
            </p>
            <label>
              Conditions you have been told about
              <textarea
                name="conditions"
                defaultValue={profile.conditions}
                maxLength={2000}
                rows={2}
              />
            </label>
            <label>
              Medicines you currently take
              <textarea
                name="medicines"
                defaultValue={profile.medicines}
                maxLength={2000}
                rows={2}
              />
            </label>
            <label>
              Known allergies
              <textarea
                name="allergies"
                defaultValue={profile.allergies}
                maxLength={1000}
                rows={2}
              />
            </label>
            <button className="ns-button ns-dark" disabled={pending}>
              Save profile <Check size={16} />
            </button>
          </form>
        </section>
        <div>
          <section className="ns-card">
            <span className="ns-icon soft">
              <LockKeyhole size={22} />
            </span>
            <h2 className="ns-card-title">Your data belongs to you.</h2>
            <p>
              Download a copy of your profile, confirmed reports and follow-ups.
            </p>
            <button
              className="ns-button ns-light"
              onClick={onExport}
              disabled={pending}
            >
              <ArrowDownToLine size={16} /> Export my records
            </button>
            <hr />
            <p>
              Health records are encrypted on the server. Your password is
              hashed. Your browser holds a secure session cookie.
            </p>
            <Link href="/privacy" className="ns-text-button">
              Read the privacy notice <ArrowUpRight size={15} />
            </Link>
          </section>
          <section className="ns-card ns-account-actions">
            <button
              className="ns-button ns-light"
              onClick={onLogout}
              disabled={pending}
            >
              <LogOut size={16} />
              {demo ? "Leave demo" : "Sign out"}
            </button>
            <button
              className="ns-text-button ns-red"
              onClick={() => setDeleting(true)}
            >
              Delete my account and records
            </button>
          </section>
        </div>
      </div>
      {deleting && (
        <Modal title="Delete your account?" close={() => setDeleting(false)}>
          <form
            className="ns-dialog-body ns-form"
            onSubmit={(e) => {
              e.preventDefault();
              onDelete(String(new FormData(e.currentTarget).get("password")));
              setDeleting(false);
            }}
          >
            <p>
              This permanently removes your account, sessions and workspace
              records from the active database. Download an export first if you
              need a copy. Backups, where configured, expire under the
              operator’s retention policy.
            </p>
            {!demo && (
              <label>
                Confirm your password
                <input
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  minLength={12}
                />
              </label>
            )}
            <button className="ns-button ns-danger" disabled={pending}>
              Permanently delete {demo ? "demo session" : "account"}
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
