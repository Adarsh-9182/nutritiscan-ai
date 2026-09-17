import { shiftDate } from "./daily";
import type { CareTask, Saved } from "./types";

// RFC 5545 text escaping and 75-octet line folding.
const escape = (s: string) =>
  s
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/([,;])/g, "\\$1");
function fold(line: string) {
  const out: string[] = [];
  let rest = line;
  while (new TextEncoder().encode(rest).length > 75) {
    let cut = 74;
    while (new TextEncoder().encode(rest.slice(0, cut)).length > 74) cut--;
    out.push(rest.slice(0, cut));
    rest = ` ${rest.slice(cut)}`;
  }
  out.push(rest);
  return out.join("\r\n");
}
const compact = (date: string) => date.replaceAll("-", "");
const RRULE = { daily: "DAILY", weekly: "WEEKLY", monthly: "MONTHLY" };

/** An .ics calendar of open care items. Timed items alert at their time using
 * the device's local time zone; all-day items alert at 09:00 that day. Phone
 * and desktop calendars deliver the notification — the app sends nothing. */
export function toICS(tasks: Saved<CareTask>[], now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const events = tasks
    .filter((t) => !t.done)
    .flatMap((t) => {
      const start = t.time
        ? [`DTSTART:${compact(t.date)}T${t.time.replace(":", "")}00`]
        : [
            `DTSTART;VALUE=DATE:${compact(t.date)}`,
            `DTEND;VALUE=DATE:${compact(shiftDate(t.date, 1))}`,
          ];
      return [
        "BEGIN:VEVENT",
        `UID:${t.id}@nutritiscan.com`,
        `DTSTAMP:${stamp}`,
        ...start,
        ...(t.time ? ["DURATION:PT15M"] : []),
        `SUMMARY:${escape(t.title)}`,
        "DESCRIPTION:From your NutritiScan care list. Not medical advice.",
        ...(t.repeat && t.repeat !== "none"
          ? [`RRULE:FREQ=${RRULE[t.repeat]}`]
          : []),
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        `DESCRIPTION:${escape(t.title)}`,
        `TRIGGER:${t.time ? "PT0M" : "PT9H"}`,
        "END:VALARM",
        "END:VEVENT",
      ];
    });
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//NutritiScan//Care list//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:NutritiScan reminders",
    ...events,
    "END:VCALENDAR",
  ]
    .map(fold)
    .join("\r\n")
    .concat("\r\n");
}
