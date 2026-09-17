"use client";
import { useEffect, useMemo, useState } from "react";
import { Bell, Check, Sparkles, X } from "lucide-react";
import { suggestions } from "@/lib/workspace/actions";
import type { CareTask, Workspace } from "@/lib/workspace/types";

const keyFor = (scope: string) => `ns-dismissed:${scope}`;
function readDismissed(scope: string): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(keyFor(scope)) ?? "[]");
    return Array.isArray(value) ? value.slice(-200) : [];
  } catch {
    return [];
  }
}
/** Suggestion ids contain health details; only an opaque hash is stored. */
async function opaque(id: string) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(id),
  );
  return [...new Uint8Array(bytes).slice(0, 12)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
/** Called on sign-out and account deletion. */
export function clearDismissals(scope?: string) {
  if (!scope) return;
  try {
    localStorage.removeItem(keyFor(scope));
  } catch {
    // Nothing stored.
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
  const scope = workspace.scope ?? "demo";
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [hashes, setHashes] = useState<Record<string, string>>({});
  const [times, setTimes] = useState<Record<string, string>>({});
  const [repeats, setRepeats] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [added, setAdded] = useState<string[]>([]);
  const [error, setError] = useState("");
  const all = useMemo(
    () => suggestions(workspace).filter((s) => !s.id.startsWith("overdue:")),
    [workspace],
  );
  const ids = all.map((s) => s.id).join("\n");
  useEffect(() => {
    // Browser storage and hashing are unavailable during server rendering.
    let alive = true;
    const pending = ids ? ids.split("\n") : [];
    Promise.all(pending.map(async (id) => [id, await opaque(id)] as const))
      .then((pairs) => {
        if (!alive) return;
        setHashes(Object.fromEntries(pairs));
        setDismissed(readDismissed(scope));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [ids, scope]);
  const list = all.filter(
    (s) => hashes[s.id] && !dismissed.includes(hashes[s.id]),
  );
  if (!list.length && !added.length) return null;

  function dismiss(id: string) {
    const next = [...dismissed, hashes[id]];
    setDismissed(next);
    try {
      localStorage.setItem(keyFor(scope), JSON.stringify(next.slice(-200)));
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
              {s.needsSchedule && (
                <label>
                  <span className="sr-only">How often</span>
                  <select
                    required
                    value={repeats[s.id] ?? s.task.repeat ?? ""}
                    onChange={(e) =>
                      setRepeats({ ...repeats, [s.id]: e.target.value })
                    }
                  >
                    <option value="" disabled>
                      How often?
                    </option>
                    <option value="daily">Every day</option>
                    <option value="weekly">Every week</option>
                    <option value="monthly">Every month</option>
                    <option value="none">Once</option>
                  </select>
                </label>
              )}
              {(s.task.time || s.needsSchedule) && (
                <label>
                  <span className="sr-only">Reminder time</span>
                  <input
                    type="time"
                    required={s.needsSchedule}
                    value={times[s.id] ?? s.task.time ?? ""}
                    onChange={(e) =>
                      setTimes({ ...times, [s.id]: e.target.value })
                    }
                  />
                </label>
              )}
              <button
                className="ns-button ns-dark"
                disabled={
                  disabled ||
                  busy === s.id ||
                  (s.needsSchedule &&
                    (!(times[s.id] ?? s.task.time) ||
                      !(repeats[s.id] ?? s.task.repeat)))
                }
                onClick={async () => {
                  setBusy(s.id);
                  setError("");
                  try {
                    const time = times[s.id] || s.task.time;
                    const repeat = (repeats[s.id] ||
                      s.task.repeat) as CareTask["repeat"];
                    await add({
                      ...s.task,
                      ...(time ? { time } : {}),
                      ...(repeat ? { repeat } : {}),
                    });
                    setAdded((a) => [...a, s.title]);
                  } catch {
                    setError("Could not add that. Please try again.");
                  } finally {
                    setBusy("");
                  }
                }}
              >
                {s.task.category === "medicine" ? (
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
