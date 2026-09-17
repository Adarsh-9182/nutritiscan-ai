import { describe, expect, it } from "vitest";
import {
  categorise,
  completeTask,
  nextOccurrence,
  nextStepsAnswer,
  parseTime,
  proposeReminder,
  suggestions,
} from "./actions";
import { toICS } from "./calendar";
import { runHealthAgent } from "./health-agent";
import { recordAnswer } from "./record-tools";
import { DEMO } from "./demo";
import {
  summaryText,
  TaskSchema,
  type CareTask,
  type Saved,
  type Workspace,
} from "./types";

const T = "2026-09-17";
const task = (t: Partial<CareTask> & { id?: string }): Saved<CareTask> => ({
  title: "Item",
  date: T,
  done: false,
  id: "id-1",
  createdAt: `${T}T00:00:00Z`,
  version: 1,
  ...t,
});
const base: Workspace = {
  profile: {
    name: "A",
    language: "English",
    allergies: "",
    medicines: "",
    conditions: "",
  },
  reports: [],
  tasks: [],
  days: [],
};

describe("reminder requests", () => {
  it("parses times in English and Hindi", () => {
    expect(parseTime("at 9am")).toBe("09:00");
    expect(parseTime("9:30 pm")).toBe("21:30");
    expect(parseTime("12 am")).toBe("00:00");
    expect(parseTime("21:05")).toBe("21:05");
    expect(parseTime("raat 10 baje")).toBe("22:00");
    expect(parseTime("subah 8 baje")).toBe("08:00");
    expect(parseTime("no time here")).toBeUndefined();
  });
  it("drafts a daily medicine reminder in the person's own words", () => {
    expect(
      proposeReminder("remind me to take vitamin D every day at 9am", T),
    ).toEqual({
      title: "Take vitamin D",
      date: T,
      done: false,
      time: "09:00",
      repeat: "daily",
      category: "medicine",
    });
  });
  it("handles dates, weekly items and Hinglish", () => {
    expect(
      proposeReminder("remind me to book a blood test tomorrow", T),
    ).toMatchObject({ date: "2026-09-18", repeat: "none", category: "test" });
    expect(
      proposeReminder("set a reminder to call the doctor next week", T),
    ).toMatchObject({ date: "2026-09-24", category: "appointment" });
    expect(
      proposeReminder("roz raat 10 baje dawai lena yaad dilana", T),
    ).toMatchObject({ time: "22:00", repeat: "daily", category: "medicine" });
  });
  it("ignores other messages and empty titles", () => {
    expect(proposeReminder("how do reminders work?", T)).toBeNull();
    expect(proposeReminder("remind me tomorrow", T)).toBeNull();
    expect(proposeReminder("had 2 roti", T)).toBeNull();
  });
  it("always produces a valid stored task", () => {
    for (const text of [
      "remind me to walk every evening at 7:15 pm",
      "remind me to drink water every day",
      "remind me to refill my inhaler every month",
    ])
      expect(TaskSchema.safeParse(proposeReminder(text, T)).success).toBe(true);
  });
  it("categorises", () => {
    expect(categorise("Dentist appointment")).toBe("appointment");
    expect(categorise("Repeat thyroid test")).toBe("test");
    expect(categorise("Take metformin")).toBe("medicine");
    expect(categorise("Buy vegetables")).toBe("other");
  });
});

describe("Codex review regressions", () => {
  it("never reads a decimal dose as a clock time", () => {
    expect(
      proposeReminder(
        "remind me to take 0.25 mg clonazepam every day at 9am",
        T,
      ),
    ).toMatchObject({
      title: "Take 0.25 mg clonazepam",
      time: "09:00",
      repeat: "daily",
    });
    expect(parseTime("take 1.5 tablets")).toBeUndefined();
    expect(parseTime("at 9.30")).toBe("09:30");
    expect(parseTime("9.30 pm")).toBe("21:30");
    expect(parseTime("raat 9:30 baje")).toBe("21:30");
  });
  it("keeps a stated medicine frequency and never defaults to daily", () => {
    const pick = (medicines: string) =>
      suggestions({ ...base, profile: { ...base.profile, medicines } }, T)[0];
    expect(pick("Methotrexate once weekly").task.repeat).toBe("weekly");
    expect(pick("Metformin 500 mg twice daily").why).toContain(
      "more than once a day",
    );
    expect(pick("Vitamin D daily at 9am").task).toMatchObject({
      repeat: "daily",
      time: "09:00",
    });
    expect(pick("Levothyroxine").task.repeat).toBeUndefined();
    for (const entry of [
      "Methotrexate twice weekly",
      "Vitamin D twice a week",
      "Iron 3 times a month",
    ]) {
      expect(pick(entry).task.repeat, entry).toBeUndefined();
      expect(pick(entry).why, entry).not.toContain("more than once a day");
    }
    expect(pick("Paracetamol 3 times a day").why).toContain(
      "more than once a day",
    );
    expect(pick("Amoxicillin BD").why).toContain("more than once a day");
  });
  it("returns monthly reminders to their original day", () => {
    const jan = { ...task({ repeat: "monthly", date: "2026-01-31" }) };
    const feb = completeTask(jan, "2026-01-31");
    expect(feb).toMatchObject({ date: "2026-02-28", anchorDay: 31 });
    const mar = completeTask(feb, "2026-02-28");
    expect(mar.date).toBe("2026-03-31");
    expect(completeTask(task({}), T).done).toBe(true);
  });
});

describe("repeating reminders", () => {
  it("advances to the next future date", () => {
    expect(nextOccurrence({ ...task({ repeat: "daily" }) }, T)).toBe(
      "2026-09-18",
    );
    expect(
      nextOccurrence({ ...task({ repeat: "daily", date: "2026-09-01" }) }, T),
    ).toBe("2026-09-18");
    expect(nextOccurrence({ ...task({ repeat: "weekly" }) }, T)).toBe(
      "2026-09-24",
    );
    expect(
      nextOccurrence(
        task({ repeat: "monthly", date: "2026-01-31" }),
        "2026-01-31",
      ),
    ).toBe("2026-02-28");
    expect(
      nextOccurrence(
        task({ repeat: "monthly", date: "2026-12-15" }),
        "2026-12-15",
      ),
    ).toBe("2027-01-15");
  });
});

describe("calendar export", () => {
  it("writes timed, repeating and all-day events with alarms", () => {
    const ics = toICS(
      [
        task({
          id: "a",
          title: "Take vitamin D, with food",
          time: "09:00",
          repeat: "daily",
        }),
        task({ id: "b", title: "Blood test" }),
        task({ id: "c", title: "Finished", done: true }),
      ],
      new Date("2026-09-17T10:00:00Z"),
    );
    expect(ics).toContain("DTSTART:20260917T090000");
    expect(ics).toContain("RRULE:FREQ=DAILY");
    expect(ics).toContain("SUMMARY:Take vitamin D\\, with food");
    expect(ics).toContain("DTSTART;VALUE=DATE:20260917");
    expect(ics).toContain("DTEND;VALUE=DATE:20260918");
    expect(ics).not.toContain("Finished");
    expect(ics.match(/BEGIN:VALARM/g)).toHaveLength(2);
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    for (const line of ics.split("\r\n"))
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  });
  it("keeps month-end reminders on the last day in calendars", () => {
    const ics = (t: Partial<CareTask>) =>
      toICS([task({ repeat: "monthly", ...t })]);
    expect(ics({ date: "2026-01-31" })).toContain(
      "RRULE:FREQ=MONTHLY;BYMONTHDAY=28,29,30,31;BYSETPOS=-1",
    );
    expect(ics({ date: "2026-02-28", anchorDay: 31 })).toContain(
      "BYMONTHDAY=28,29,30,31;BYSETPOS=-1",
    );
    expect(ics({ date: "2026-01-30" })).toContain(
      "BYMONTHDAY=28,29,30;BYSETPOS=-1",
    );
    expect(ics({ date: "2026-01-15" })).toContain(
      "RRULE:FREQ=MONTHLY;BYMONTHDAY=15",
    );
  });
  it("folds long titles", () => {
    const ics = toICS([task({ title: "x".repeat(170) })]);
    expect(ics).toMatch(/\r\n x/);
  });
});

describe("suggestions", () => {
  it("proposes clinician questions for out-of-range results, once", () => {
    const list = suggestions(DEMO, T);
    const titles = list.map((s) => s.title);
    expect(titles).toContain("Ask my clinician about Vitamin D");
    expect(titles).not.toContain("Ask my clinician about Glucose");
    const covered = suggestions(
      {
        ...DEMO,
        tasks: [task({ title: "Ask about my Vitamin D result" })],
      },
      T,
    );
    expect(covered.map((s) => s.title)).not.toContain(
      "Ask my clinician about Vitamin D",
    );
  });
  it("never suggests from reports the person excluded", () => {
    const hidden = {
      ...DEMO,
      reports: DEMO.reports.map((r) => ({ ...r, assistantAccess: false })),
    };
    expect(suggestions(hidden, T).some((s) => s.id.startsWith("range:"))).toBe(
      false,
    );
  });
  it("offers reminders for listed medicines, not doses", () => {
    const list = suggestions(
      {
        ...base,
        profile: { ...base.profile, medicines: "Thyroxine 50mcg, Metformin" },
      },
      T,
    );
    const meds = list.filter((s) => s.task.category === "medicine");
    expect(meds).toHaveLength(2);
    // No schedule is invented: nothing in the list says how often or when.
    expect(meds[0].needsSchedule).toBe(true);
    expect(meds[0].task.title).toBe("Take Thyroxine 50mcg as prescribed");
    expect(meds[0].task.repeat).toBeUndefined();
    expect(meds[0].task.time).toBeUndefined();
    const withReminder = suggestions(
      {
        ...base,
        profile: { ...base.profile, medicines: "Metformin" },
        tasks: [task({ title: "Take metformin", repeat: "daily" })],
      },
      T,
    );
    expect(withReminder).toEqual([]);
  });
  it("flags recurring symptoms, old reports and overdue items", () => {
    const days = ["2026-09-14", "2026-09-15", "2026-09-16"].map((date) => ({
      date,
      entries: [{ kind: "symptom" as const, text: "headache", amount: null }],
      id: date,
      createdAt: date,
      version: 1,
    }));
    const old = { ...DEMO.reports[0], date: "2025-01-01" };
    const ids = suggestions(
      {
        ...base,
        days,
        reports: [{ ...old, observations: [old.observations[1]] }],
        tasks: [task({ date: "2026-09-01" })],
      },
      T,
    ).map((s) => s.id.split(":")[0]);
    expect(ids).toEqual(["checkup", "symptoms", "overdue"]);
  });
});

describe("companion actions", () => {
  it("drafts reminders before logging or dose boundaries apply", async () => {
    const reply = await runHealthAgent(
      "remind me to drink 2 glasses of water every day at 11am",
      base,
    );
    expect(reply.draftReminder).toMatchObject({
      repeat: "daily",
      time: "11:00",
    });
    expect(reply.draftLog).toBeUndefined();
    const med = await runHealthAgent(
      "remind me to take my BP tablet every day at 8am",
      base,
    );
    expect(med.text).toContain("don’t set or change medicine schedules");
  });
  it("still escalates emergencies first", async () => {
    const reply = await runHealthAgent(
      "remind me I have crushing chest pain and can't breathe",
      base,
    );
    expect(reply.mode).toBe("escalation");
  });
  it("answers what is next from the list and suggestions", () => {
    const answer = nextStepsAnswer(
      "what should I do next",
      {
        ...DEMO,
        tasks: [
          task({
            title: "Take vitamin D",
            time: "09:00",
            repeat: "daily",
            category: "medicine",
          }),
        ],
      },
      T,
    );
    expect(answer?.text).toContain("Today 09:00 — Take vitamin D (every day)");
    expect(answer?.text).toContain("Ask my clinician about Vitamin D");
    expect(recordAnswer("aage kya karna hai", base)?.text).toContain(
      "care list is empty",
    );
    expect(nextStepsAnswer("what is vitamin D", base)).toBeUndefined();
  });
});

describe("visit summary", () => {
  it("includes the recent log and reminder schedule", () => {
    const text = summaryText({
      ...DEMO,
      tasks: [
        task({ title: "Take vitamin D", time: "09:00", repeat: "daily" }),
      ],
    });
    expect(text).toContain("MY DAILY LOG · LAST 7 DAYS");
    expect(text).toMatch(/sleep \d+(\.\d)? h · mood \d\/5/);
    expect(text).toContain(`${T} 09:00 — Take vitamin D (daily)`);
    expect(summaryText(base)).not.toContain("MY DAILY LOG");
  });
});
