import type { CareTask, Saved } from "@/lib/workspace/types";

export type Local = { date: string; minutes: number };
export type ChannelSettings = {
  /** Show reminder titles in messages. Off: “You have a reminder due”. */
  titles: boolean;
  morning: boolean;
  evening: boolean;
};
export const DEFAULT_SETTINGS: ChannelSettings = {
  titles: false,
  morning: true,
  evening: true,
};
export const MORNING = 8 * 60;
export const EVENING = 21 * 60;
/** Scheduled runs can be late; a reminder is still useful for this long. */
export const LATE_MINUTES = 90;

export function isTimeZone(zone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return zone.length <= 64;
  } catch {
    return false;
  }
}

export function localNow(timeZone: string, now = new Date()): Local {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

const days = (a: string, b: string) =>
  Math.round(
    (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000,
  );

/** Whether an open item falls on `date`, following its repeat rule. */
export function occursOn(task: CareTask, date: string): boolean {
  if (task.done || task.date > date) return false;
  switch (task.repeat ?? "none") {
    case "none":
      return task.date === date;
    case "daily":
      return true;
    case "weekly":
      return days(task.date, date) % 7 === 0;
    case "monthly": {
      const want = task.anchorDay ?? Number(task.date.slice(8));
      const day = Number(date.slice(8));
      // The 31st falls back to the last day of shorter months.
      const last = new Date(
        Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)), 0),
      ).getUTCDate();
      return day === Math.min(want, last);
    }
  }
}

const toMinutes = (time: string) =>
  Number(time.slice(0, 2)) * 60 + Number(time.slice(3));

const previousDay = (date: string) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

/**
 * Timed occurrences whose time passed within the lateness window, including
 * ones from late yesterday: a 23:55 reminder is still due at 00:05. Each
 * result carries the date of the occurrence it belongs to.
 */
export function dueReminders<T extends Saved<CareTask>>(
  tasks: T[],
  local: Local,
): { task: T; date: string }[] {
  const yesterday = previousDay(local.date);
  const due: { task: T; date: string; late: number }[] = [];
  for (const task of tasks) {
    if (!task.time) continue;
    const at = toMinutes(task.time);
    if (occursOn(task, local.date) && at <= local.minutes)
      due.push({ task, date: local.date, late: local.minutes - at });
    else if (occursOn(task, yesterday))
      due.push({ task, date: yesterday, late: local.minutes + 1440 - at });
  }
  return due
    .filter((d) => d.late < LATE_MINUTES)
    .sort((a, b) => b.late - a.late)
    .map(({ task, date }) => ({ task, date }));
}

export function reminderText(
  tasks: Saved<CareTask>[],
  settings: ChannelSettings,
) {
  if (!settings.titles)
    return tasks.length === 1
      ? `⏰ You have a reminder due at ${tasks[0].time}. Open NutritiScan to see it.`
      : `⏰ You have ${tasks.length} reminders due. Open NutritiScan to see them.`;
  return [
    "⏰ Reminder",
    ...tasks.map((t) => `• ${t.time} — ${t.title}`),
    "",
    "Tap Done when finished, or just tell me how your day is going.",
  ].join("\n");
}

export function morningText(
  tasks: Saved<CareTask>[],
  date: string,
  settings: ChannelSettings,
) {
  const today = tasks
    .filter((t) => occursOn(t, date))
    .sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""));
  const overdue = tasks.filter(
    (t) => !t.done && (t.repeat ?? "none") === "none" && t.date < date,
  );
  if (!today.length && !overdue.length) return null;
  const lines = ["☀️ Good morning. Today on your care list:"];
  if (settings.titles)
    lines.push(
      ...today.map((t) => `• ${t.time ?? "Any time"} — ${t.title}`),
      ...(overdue.length
        ? [`• Past due: ${overdue.map((t) => t.title).join("; ")}`]
        : []),
    );
  else
    lines.push(
      `• ${today.length} item${today.length === 1 ? "" : "s"} today${overdue.length ? `, ${overdue.length} past due` : ""}`,
    );
  lines.push(
    "",
    "Tell me what you eat, how you slept or how you feel and I’ll keep your log.",
  );
  return lines.join("\n");
}

export const EVENING_TEXT =
  "🌙 Nothing in your log today yet. How did it go? For example: “had dal chawal, slept 7 hours, mood 4/5”.";
