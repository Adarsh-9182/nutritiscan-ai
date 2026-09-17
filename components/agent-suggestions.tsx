"use client";
import { useEffect, useMemo, useState } from "react";
import { Bell, Check, Sparkles, X } from "lucide-react";
import { suggestions } from "@/lib/workspace/actions";
import type { CareTask, Workspace } from "@/lib/workspace/types";

const KEY = "ns-dismissed-suggestions";
function readDismissed(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(value) ? value.slice(-200) : [];
  } catch {
    return [];
  }
}

/** Proposed next steps. Adding one is the person's confirmation; dismissals
 * are remembered only in this browser. */
export default function AgentSuggestions({
  workspace,
  disabled,
  add,
  compact = false,
}: {
  workspace: Workspace;
  disabled: boolean;
  add: (task: CareTask) => Promise<void>;
  compact?: boolean;
}) {
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [times, setTimes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [added, setAdded] = useState<string[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    // Browser storage is unavailable during server rendering.
    queueMicrotask(() => setDismissed(readDismissed()));
  }, []);
  const list = useMemo(
    () =>
      suggestions(workspace).filter(
        (s) => !dismissed.includes(s.id) && !s.id.startsWith("overdue:"),
      ),
    [workspace, dismissed],
  );
  if (!list.length && !added.length) return null;

  function dismiss(id: string) {
    const next = [...dismissed, id];
    setDismissed(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next.slice(-200)));
    } catch {
      // Dismissal still applies for this visit.
    }
  }

  return (
    <section
      className={`as-panel ${compact ? "compact" : ""}`}
      aria-label="Suggested next steps"
    >
      <header>
        <span className="as-mark">
          <Sparkles size={15} />
        </span>
        <div>
          <h2>Your companion suggests</h2>
          <p>
            From your records and log. Add what helps; each one is a question or
            reminder, not treatment advice.
          </p>
        </div>
      </header>
      {error && (
        <p role="alert" className="ns-error">
          {error}
        </p>
      )}
      <ul>
        {list.slice(0, compact ? 3 : 6).map((s) => (
          <li key={s.id}>
            <div>
              <strong>{s.title}</strong>
              <p>{s.why}</p>
            </div>
            <div className="as-actions">
              {s.task.time && (
                <label>
                  <span className="sr-only">Reminder time</span>
                  <input
                    type="time"
                    value={times[s.id] ?? s.task.time}
                    onChange={(e) =>
                      setTimes({ ...times, [s.id]: e.target.value })
                    }
                  />
                </label>
              )}
              <button
                className="ns-button ns-dark"
                disabled={disabled || busy === s.id}
                onClick={async () => {
                  setBusy(s.id);
                  setError("");
                  try {
                    await add({
                      ...s.task,
                      ...(s.task.time
                        ? { time: times[s.id] || s.task.time }
                        : {}),
                    });
                    setAdded((a) => [...a, s.title]);
                  } catch {
                    setError("Could not add that. Please try again.");
                  } finally {
                    setBusy("");
                  }
                }}
              >
                {s.task.repeat && s.task.repeat !== "none" ? (
                  <Bell size={14} />
                ) : (
                  <Check size={14} />
                )}
                Add
              </button>
              <button
                className="as-dismiss"
                aria-label={`Dismiss: ${s.title}`}
                onClick={() => dismiss(s.id)}
              >
                <X size={15} />
              </button>
            </div>
          </li>
        ))}
      </ul>
      {added.length > 0 && (
        <p className="as-added" role="status">
          <Check size={13} /> Added to your care list: {added.join(", ")}
        </p>
      )}
    </section>
  );
}
