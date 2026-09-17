"use client";
import { useMemo, useState, type FormEvent } from "react";
import {
  Droplet,
  Moon,
  Smile,
  Utensils,
  Plus,
  X,
  Sparkles,
  ArrowUpRight,
  Pill,
  Footprints,
  Thermometer,
} from "lucide-react";
import { parseMeal } from "@/lib/nutrition/analyze";
import {
  describeEntry,
  localDate,
  patterns,
  recentDays,
} from "@/lib/workspace/daily";
import {
  LogEntrySchema,
  type LogEntry,
  type LogKind,
  type Workspace,
} from "@/lib/workspace/types";

const MOODS = ["Very low", "Low", "Okay", "Good", "Great"];
const ICONS: Record<LogKind, typeof Droplet> = {
  meal: Utensils,
  water: Droplet,
  sleep: Moon,
  mood: Smile,
  symptom: Thermometer,
  medicine: Pill,
  activity: Footprints,
};
const weekday = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString("en-IN", {
    weekday: "short",
  });

export default function DailyLog({
  workspace,
  disabled,
  saveToday,
  ask,
}: {
  workspace: Workspace;
  disabled: boolean;
  /** Replaces today's entries; the caller owns persistence. */
  saveToday: (entries: LogEntry[]) => Promise<void>;
  ask: (text: string) => void;
}) {
  const today = localDate();
  const week = useMemo(
    () => recentDays(workspace.days, today),
    [workspace.days, today],
  );
  const current = workspace.days?.find((d) => d.date === today);
  const entries = current?.entries ?? [];
  const totals = week[week.length - 1];
  const found = useMemo(() => patterns(week), [week]);
  const [meal, setMeal] = useState("");
  const [sleep, setSleep] = useState("");
  const [other, setOther] = useState<"symptom" | "medicine" | "activity">(
    "medicine",
  );
  const [error, setError] = useState("");
  const preview = useMemo(() => parseMeal(meal), [meal]);
  const maxSleep = Math.max(9, ...week.map((d) => d.sleep ?? 0));
  const maxWater = Math.max(8, ...week.map((d) => d.water));

  async function add(entry: LogEntry) {
    const parsed = LogEntrySchema.safeParse(entry);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check this entry.");
      return false;
    }
    if (entries.length >= 60) {
      setError("Today’s log is full (60 entries).");
      return false;
    }
    setError("");
    const now = new Date().toTimeString().slice(0, 5);
    await saveToday([...entries, { ...parsed.data, time: now }]);
    return true;
  }

  function submitOther(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const minutes = Number(f.get("minutes"));
    void add({
      kind: other,
      text: String(f.get("text") ?? "").trim(),
      amount: other === "activity" ? minutes || null : null,
    }).then((ok) => ok && form.reset());
  }

  return (
    <div className="dl">
      <div className="ns-page-heading">
        <div>
          <span className="ns-eyebrow">A FEW TAPS A DAY</span>
          <h1>Daily log</h1>
          <p>
            What you eat, drink, sleep and feel. The companion reads it to spot
            patterns and prepare your visits. You can also just tell it in chat
            — “had 2 rotis and dal”.
          </p>
        </div>
        <button
          className="ns-button ns-dark"
          onClick={() => ask("Give me my weekly summary")}
        >
          <Sparkles size={16} /> Review my week
        </button>
      </div>

      {error && (
        <div role="alert" className="ns-error">
          {error}
          <button aria-label="Dismiss error" onClick={() => setError("")}>
            <X size={16} />
          </button>
        </div>
      )}

      <section className="dl-today" aria-label="Today at a glance">
        <div className="dl-metric">
          <span className="dl-icon water">
            <Droplet size={18} />
          </span>
          <div>
            <small>Water</small>
            <strong>
              {totals.water}
              <em> {totals.water === 1 ? "glass" : "glasses"}</em>
            </strong>
          </div>
          <button
            className="dl-plus"
            disabled={disabled}
            aria-label="Add a glass of water"
            onClick={() => void add({ kind: "water", text: "", amount: 1 })}
          >
            <Plus size={16} />
          </button>
        </div>
        <form
          className="dl-metric"
          onSubmit={(e) => {
            e.preventDefault();
            void add({
              kind: "sleep",
              text: "",
              amount: Number(sleep),
            }).then((ok) => ok && setSleep(""));
          }}
        >
          <span className="dl-icon sleep">
            <Moon size={18} />
          </span>
          <div>
            <small>Sleep last night</small>
            {totals.sleep !== null ? (
              <strong>
                {totals.sleep}
                <em> h</em>
              </strong>
            ) : (
              <input
                aria-label="Hours slept last night"
                inputMode="decimal"
                type="number"
                min={0}
                max={24}
                step={0.5}
                required
                placeholder="hours"
                value={sleep}
                onChange={(e) => setSleep(e.target.value)}
              />
            )}
          </div>
          {totals.sleep === null && (
            <button
              className="dl-plus"
              disabled={disabled}
              aria-label="Save sleep"
            >
              <Plus size={16} />
            </button>
          )}
        </form>
        <div className="dl-metric dl-mood">
          <span className="dl-icon mood">
            <Smile size={18} />
          </span>
          <div>
            <small>
              Mood{totals.mood !== null ? ` · ${totals.mood}/5` : ""}
            </small>
            <div className="dl-mood-scale" role="group" aria-label="Log mood">
              {MOODS.map((label, i) => (
                <button
                  key={label}
                  disabled={disabled}
                  title={label}
                  aria-label={`Mood ${i + 1} of 5, ${label}`}
                  className={
                    totals.mood !== null && Math.round(totals.mood) === i + 1
                      ? "on"
                      : ""
                  }
                  onClick={() =>
                    void add({ kind: "mood", text: "", amount: i + 1 })
                  }
                >
                  {i + 1}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="dl-metric">
          <span className="dl-icon food">
            <Utensils size={18} />
          </span>
          <div>
            <small>Food (estimated)</small>
            <strong>
              {totals.protein}
              <em> g protein</em>
            </strong>
            <small>{totals.kcal} kcal</small>
          </div>
        </div>
      </section>

      <div className="dl-grid">
        <section className="ns-card">
          <h2 className="ns-card-title">Add a meal</h2>
          <form
            className="dl-meal"
            onSubmit={(e) => {
              e.preventDefault();
              void add({ kind: "meal", text: meal, amount: null }).then(
                (ok) => ok && setMeal(""),
              );
            }}
          >
            <input
              aria-label="What did you eat?"
              placeholder="e.g. 2 roti, 1 katori dal, salad"
              maxLength={300}
              value={meal}
              onChange={(e) => setMeal(e.target.value)}
              required
            />
            <button className="ns-button ns-dark" disabled={disabled}>
              Add
            </button>
          </form>
          <p className="dl-hint" aria-live="polite">
            {meal.trim()
              ? preview.length
                ? `Recognised: ${preview
                    .map((i) => `${i.name} (${i.grams} g)`)
                    .join(", ")} · ≈${Math.round(
                    preview.reduce((s, i) => s + i.kcal, 0),
                  )} kcal, ${
                    Math.round(
                      preview.reduce((s, i) => s + i.protein, 0) * 10,
                    ) / 10
                  } g protein`
                : "No foods recognised yet — it will be saved as a note without an estimate."
              : "Indian staples are understood: roti, dal, rice, poha, idli, paneer, katori and more."}
          </p>

          <h2 className="ns-card-title dl-second">Something else</h2>
          <form className="dl-other" onSubmit={submitOther}>
            <div className="dl-tabs" role="tablist">
              {(["medicine", "activity", "symptom"] as const).map((k) => {
                const Icon = ICONS[k];
                return (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={other === k}
                    key={k}
                    onClick={() => setOther(k)}
                  >
                    <Icon size={14} /> {k[0].toUpperCase() + k.slice(1)}
                  </button>
                );
              })}
            </div>
            <div className="dl-meal">
              <input
                key={other}
                name="text"
                required
                maxLength={300}
                aria-label={`${other} description`}
                placeholder={
                  other === "medicine"
                    ? "e.g. Vitamin D, morning"
                    : other === "activity"
                      ? "e.g. walk"
                      : "e.g. mild headache in the evening"
                }
              />
              {other === "activity" && (
                <input
                  name="minutes"
                  type="number"
                  min={1}
                  max={1440}
                  required
                  aria-label="Minutes"
                  placeholder="min"
                  className="dl-minutes"
                />
              )}
              <button className="ns-button ns-light" disabled={disabled}>
                Add
              </button>
            </div>
            {other === "symptom" && (
              <p className="dl-hint">
                Logging is not monitoring. If a symptom is severe, sudden or
                worsening, seek medical care now.
              </p>
            )}
          </form>
        </section>

        <section className="ns-card">
          <div className="ns-section-heading">
            <h2>Today</h2>
            <span className="dl-count">{entries.length} entries</span>
          </div>
          {entries.length ? (
            <ul className="dl-entries">
              {entries.map((entry, i) => {
                const Icon = ICONS[entry.kind];
                return (
                  <li key={`${i}-${entry.kind}-${entry.time}`}>
                    <span className={`dl-icon ${entry.kind}`}>
                      <Icon size={14} />
                    </span>
                    <span>{describeEntry(entry)}</span>
                    {entry.time && <time>{entry.time}</time>}
                    <button
                      disabled={disabled}
                      aria-label={`Remove ${describeEntry(entry)}`}
                      onClick={() =>
                        void saveToday(entries.filter((_, j) => j !== i))
                      }
                    >
                      <X size={14} />
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="dl-hint">
              Nothing logged yet today. Start with a glass of water.
            </p>
          )}
        </section>
      </div>

      <section className="ns-card dl-week">
        <div className="ns-section-heading">
          <h2>Last 7 days</h2>
          <button
            className="ns-text-button"
            onClick={() => ask("How did I sleep this week?")}
          >
            Ask about my sleep <ArrowUpRight size={15} />
          </button>
        </div>
        <div
          className="dl-bars"
          role="img"
          aria-label="Sleep and water for the last 7 days"
        >
          {week.map((d) => (
            <div key={d.date} className={d.date === today ? "today" : ""}>
              <div className="dl-bar-pair">
                <i
                  className="sleep"
                  style={{ height: `${((d.sleep ?? 0) / maxSleep) * 100}%` }}
                  title={
                    d.sleep !== null ? `${d.sleep} h sleep` : "No sleep logged"
                  }
                />
                <i
                  className="water"
                  style={{ height: `${(d.water / maxWater) * 100}%` }}
                  title={`${d.water} glass${d.water === 1 ? "" : "es"}`}
                />
              </div>
              <span>{weekday(d.date)}</span>
              <small>{d.mood !== null ? `☺ ${d.mood}` : "·"}</small>
            </div>
          ))}
        </div>
        <div className="dl-legend">
          <span>
            <i className="sleep" /> Sleep (h)
          </span>
          <span>
            <i className="water" /> Water (glasses)
          </span>
          <span>☺ Mood (1–5)</span>
        </div>
      </section>

      <section className="ns-card">
        <h2 className="ns-card-title">What stands out</h2>
        {found.length ? (
          <ul className="dl-patterns">
            {found.map((p) => (
              <li key={p.title}>
                <strong>{p.title}</strong>
                <p>{p.detail}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="dl-hint">
            Log for a few days and the companion will point out what it notices
            — only from what you recorded, and never as a diagnosis.
          </p>
        )}
      </section>
    </div>
  );
}
