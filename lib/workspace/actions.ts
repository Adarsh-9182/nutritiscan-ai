import type { AssistantAnswer } from "./assistant";
import { recentDays, shiftDate, localDate } from "./daily";
import { say, speaksHinglish } from "./voice";
import { mentionsMedicines } from "./medicine-boundary";
import {
  rangeStatus,
  type CareTask,
  type Saved,
  type Workspace,
} from "./types";

type Repeat = NonNullable<CareTask["repeat"]>;
type Category = NonNullable<CareTask["category"]>;

const MEDICINE =
  /\b(take|taking|tablet|tablets|pill|pills|capsule|medicine|medicines|dawai|dawa|dose|syrup|insulin|inhaler|vitamin|supplement)\b/i;
const TEST =
  /\b(test|tests|lab|blood work|checkup|check-up|recheck|re-test|retest|scan|x-ray)\b/i;
const APPOINTMENT = /\b(doctor|appointment|clinic|visit|dentist|consult)\b/i;

export function categorise(text: string): Category {
  if (APPOINTMENT.test(text)) return "appointment";
  if (TEST.test(text)) return "test";
  if (MEDICINE.test(text)) return "medicine";
  return "other";
}

/**
 * Clock times people write: “9am”, “9:30 pm”, “21:00”, “at 9.30”, “9.30 pm”,
 * “subah 8 baje”. A dotted number is a time only after “at” or before am/pm,
 * so a dose such as “0.25 mg” is never read as 00:25.
 */
const TIME_RE =
  /(?:\bat\s+)?(?:\b([01]?\d|2[0-3]):([0-5]\d)\s*(am|pm)?\b|\b(1[0-2]|0?[1-9])\.([0-5]\d)\s*(am|pm)\b|\bat\s+([01]?\d|2[0-3])\.([0-5]\d)\b(?!\s*(?:mg|mcg|ml|g|units?|iu|tablets?)\b)|\b(1[0-2]|0?[1-9])\s*(am|pm|a\.m\.|p\.m\.)(?=\W|$)|\b(subah|savere|dopahar|shaam|sham|raat)\s*(1[0-2]|0?[1-9])(?:[:.]([0-5]\d))?\s*baje\b)/gi;

export function parseTime(text: string): string | undefined {
  const m = new RegExp(TIME_RE.source, "i").exec(text);
  if (!m) return;
  const pad = (n: number) => String(n).padStart(2, "0");
  let hour: number;
  let minute = 0;
  let half: string | undefined;
  if (m[1] !== undefined)
    [hour, minute, half] = [Number(m[1]), Number(m[2]), m[3]];
  else if (m[4] !== undefined)
    [hour, minute, half] = [Number(m[4]), Number(m[5]), m[6]];
  else if (m[7] !== undefined) [hour, minute] = [Number(m[7]), Number(m[8])];
  else if (m[9] !== undefined) [hour, half] = [Number(m[9]), m[10]];
  else {
    hour = Number(m[12]);
    minute = Number(m[13] ?? 0);
    const part = m[11].toLowerCase();
    half =
      part === "subah" ||
      part === "savere" ||
      (part === "dopahar" && hour === 11)
        ? "am"
        : "pm";
  }
  if (half) {
    if (hour > 12) return;
    const pm = /^p/i.test(half);
    if (pm && hour < 12) hour += 12;
    if (!pm && hour === 12) hour = 0;
  }
  return `${pad(hour)}:${pad(minute)}`;
}

function parseRepeat(text: string): Repeat {
  if (
    /\b(every ?day|daily|roz|rozana|har ?din|each day|every morning|every night|every evening)\b/i.test(
      text,
    )
  )
    return "daily";
  if (/\b(every ?week|weekly|har hafte|each week)\b/i.test(text))
    return "weekly";
  if (/\b(every ?month|monthly|har mahine|each month)\b/i.test(text))
    return "monthly";
  return "none";
}

function parseDate(text: string, today: string): string {
  if (/\b(day after tomorrow|parso)\b/i.test(text)) return shiftDate(today, 2);
  if (/\b(tomorrow|kal)\b/i.test(text)) return shiftDate(today, 1);
  if (/\bnext week|agle hafte\b/i.test(text)) return shiftDate(today, 7);
  if (/\bnext month|agle mahine\b/i.test(text)) return shiftDate(today, 30);
  const inDays = text.match(/\bin (\d{1,3}) days?\b/i);
  if (inDays) return shiftDate(today, Number(inDays[1]));
  return today;
}

/** A clear request such as “remind me to take vitamin D every day at 9am”
 * becomes a draft reminder. Nothing is saved without confirmation. */
export function proposeReminder(
  message: string,
  today = localDate(),
): CareTask | null {
  const text = message.trim().replace(/\s+/g, " ");
  const ask =
    text.match(
      /^(?:please\s+)?(?:remind me(?: to)?|set (?:a )?reminder(?: to| for)?|reminder(?: to| for)?:?|yaad dila(?:na|do|dena)?(?: ki)?)\s+(.+)$/i,
    ) ??
    text.match(
      /^(.+?)\s+(?:yaad dila(?:na|do|dena)|ka reminder (?:laga|set kar)(?:o|na|do)?)\.?$/i,
    );
  if (!ask) return null;
  const detail = ask[1];
  if (mentionsMedicines(detail)) return null;
  const repeat = parseRepeat(detail);
  const time = parseTime(detail);
  // The title keeps the person's own words minus the scheduling phrases.
  const title = detail
    .replace(
      /\b(every ?day|daily|roz|rozana|har ?din|each day|every ?week|weekly|har hafte|each week|every ?month|monthly|har mahine|each month|day after tomorrow|tomorrow|parso|kal|next week|agle hafte|next month|agle mahine|in \d{1,3} days?)\b/gi,
      "",
    )
    .replace(TIME_RE, "")
    .replace(/\b(at|on|ko|ke|par)\s*$/i, "")
    .replace(/\s+/g, " ")
    .replace(/^[\s,.-]+|[\s,.-]+$/g, "");
  if (title.length < 2) return null;
  return {
    title: (title[0].toUpperCase() + title.slice(1)).slice(0, 180),
    date: parseDate(detail, today),
    done: false,
    ...(time ? { time } : {}),
    repeat,
    category: categorise(title),
  };
}

/** The day of month a monthly reminder belongs to, kept separately so a
 * 31st that falls back to the 28th returns to the 31st next time. */
export const anchorDay = (task: CareTask) =>
  task.anchorDay ?? Number(task.date.slice(8));

export function monthlyDate(year: number, month: number, anchor: number) {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(Math.min(anchor, last)).padStart(2, "0")}`;
}

/** Marking a repeating reminder done moves it to its next date instead. */
export function nextOccurrence(task: CareTask, today = localDate()): string {
  const anchor = anchorDay(task);
  const step = (date: string) => {
    if (task.repeat === "daily") return shiftDate(date, 1);
    if (task.repeat === "weekly") return shiftDate(date, 7);
    const [y, m] = date.split("-").map(Number);
    return m === 12
      ? monthlyDate(y + 1, 1, anchor)
      : monthlyDate(y, m + 1, anchor);
  };
  let date = step(task.date);
  // A reminder ignored for a while resumes from today, not from the past.
  while (date <= today) date = step(date);
  return date;
}

/** The task after “done”: repeating items move on, others are completed. */
export function completeTask<T extends CareTask>(
  task: T,
  today = localDate(),
): T {
  if (task.done || !task.repeat || task.repeat === "none")
    return { ...task, done: !task.done };
  return {
    ...task,
    date: nextOccurrence(task, today),
    ...(task.repeat === "monthly" ? { anchorDay: anchorDay(task) } : {}),
  };
}

export const repeatText: Record<Repeat, string> = {
  none: "",
  daily: "Every day",
  weekly: "Every week",
  monthly: "Every month",
};

export type Suggestion = {
  id: string;
  title: string;
  why: string;
  task: CareTask;
  /** The person must choose how often and when before it can be added. */
  needsSchedule?: boolean;
};

const mentions = (tasks: Saved<CareTask>[], word: string) =>
  tasks.some(
    (t) => !t.done && t.title.toLowerCase().includes(word.toLowerCase()),
  );

/** Next steps the companion proposes from the person's own records. Each is a
 * question for a clinician or an organising reminder — never a treatment. */
export function suggestions(
  workspace: Workspace,
  today = localDate(),
): Suggestion[] {
  const found: Suggestion[] = [];
  const tasks = workspace.tasks.filter(
    (task) => task.category !== "medicine" && !mentionsMedicines(task.title),
  );
  const reports = workspace.reports
    .filter((r) => r.assistantAccess !== false)
    .sort((a, b) => b.date.localeCompare(a.date));
  const latest = reports[0];
  if (latest)
    for (const o of latest.observations) {
      const status = rangeStatus(o);
      if (status !== "below" && status !== "above") continue;
      // A medicine reminder does not cover asking a clinician about a result.
      if (
        mentions(
          tasks.filter((t) => t.category !== "medicine"),
          o.name,
        )
      )
        continue;
      found.push({
        id: `range:${latest.id}:${o.name}`,
        title: `Ask my clinician about ${o.name}`,
        why: `${o.name} was ${status} the report range (${o.value} ${o.unit}) on ${latest.date}. A clinician can say whether and when it should be rechecked.`,
        task: {
          title: `Ask my clinician about my ${o.name} result and when to recheck it`,
          date: today,
          done: false,
          repeat: "none",
          category: "appointment",
        },
      });
    }
  if (
    latest &&
    latest.date < shiftDate(today, -365) &&
    !mentions(tasks, "check-up")
  )
    found.push({
      id: `checkup:${latest.id}`,
      title: "Ask whether a routine check-up is due",
      why: `Your most recent saved report is from ${latest.date}, over a year ago.`,
      task: {
        title: "Ask my clinician whether a routine check-up is due",
        date: today,
        done: false,
        repeat: "none",
        category: "appointment",
      },
    });
  const week = recentDays(workspace.days, today);
  const symptomDays = week.filter((d) => d.symptoms.length);
  if (symptomDays.length >= 3 && !mentions(tasks, "symptom"))
    found.push({
      id: `symptoms:${symptomDays[0].date}`,
      title: "Discuss your recurring symptoms",
      why: `You logged symptoms on ${symptomDays.length} of the last 7 days: ${[
        ...new Set(symptomDays.flatMap((d) => d.symptoms)),
      ]
        .slice(0, 3)
        .join("; ")}.`,
      task: {
        title: "Discuss my recurring symptoms with a clinician",
        date: today,
        done: false,
        repeat: "none",
        category: "appointment",
      },
    });
  const overdue = tasks.filter((t) => !t.done && t.date < today);
  if (overdue.length)
    found.push({
      id: `overdue:${overdue.map((t) => t.id).join(",")}`,
      title: `${overdue.length} past-due item${overdue.length > 1 ? "s" : ""}`,
      why: overdue
        .slice(0, 3)
        .map((t) => t.title)
        .join("; "),
      task: {
        title: "Review my past-due care items",
        date: today,
        done: false,
        repeat: "none",
        category: "other",
      },
    });
  return found.slice(0, 6);
}

/** “What should I do next?” answered from the record, without a model. */
export function nextStepsAnswer(
  question: string,
  workspace: Workspace,
  today = localDate(),
): AssistantAnswer | undefined {
  if (
    !/\b(what(?:'s| is| should i do)? next|next steps?|to-?do|my (?:reminders|list|plan)|aage kya|kya karna (?:hai|chahiye)|meri list|reminders)\b/i.test(
      question,
    )
  )
    return;
  const hi = speaksHinglish(question, workspace.profile);
  const open = workspace.tasks
    .filter((t) => !t.done && t.category !== "medicine" && !mentionsMedicines(t.title))
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        (a.time ?? "").localeCompare(b.time ?? ""),
    );
  const ideas = suggestions(workspace, today).filter(
    (s) => !s.id.startsWith("overdue:"),
  );
  const line = (t: CareTask) =>
    `• ${t.date === today ? say(hi, "Today", "Aaj") : t.date}${t.time ? ` ${t.time}` : ""} — ${t.title}${t.repeat && t.repeat !== "none" ? ` (${repeatText[t.repeat].toLowerCase()})` : ""}${!t.repeat || t.repeat === "none" ? (t.date < today ? say(hi, " · past due", " · tareekh nikal gayi") : "") : ""}`;
  return {
    mode: "record-summary",
    sources: [],
    text: [
      open.length
        ? say(hi, "On your list", "Aapki list me")
        : say(hi, "Your care list is empty.", "Aapki care list khaali hai."),
      ...open.slice(0, 8).map(line),
      ...(ideas.length
        ? [
            "",
            say(hi, "Suggested from your records", "Aapke records se sujhav"),
            ...ideas.map((s) => `• ${s.title} — ${s.why}`),
            "",
            say(
              hi,
              "Open Care & reminders to add any of these. Suggestions organise questions for your clinician; they are not treatment advice.",
              "Inme se koi bhi jodne ke liye Care & reminders kholein. Ye doctor se poochhne ke sawal hain, ilaaj ki salah nahi.",
            ),
          ]
        : []),
      "",
      say(
        hi,
        "Tip: say “remind me to walk every day at 9am” and I’ll draft it for you.",
        "Tip: bolein “roz subah 9 baje walk yaad dilana” aur main reminder bana dunga.",
      ),
    ].join("\n"),
  };
}
