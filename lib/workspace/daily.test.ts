import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createLocalDatabase, type Database } from "./database";
import { WorkspaceService } from "./service";
import {
  dayTotals,
  logAnswer,
  patterns,
  proposeLog,
  recentDays,
  shiftDate,
} from "./daily";
import { runHealthAgent } from "./health-agent";
import {
  DayLogSchema,
  LogEntrySchema,
  type DayLog,
  type Workspace,
} from "./types";

const profile = {
  name: "Test",
  language: "English" as const,
  allergies: "",
  medicines: "",
  conditions: "",
};
const saved = (d: DayLog) => ({
  ...d,
  id: d.date,
  createdAt: `${d.date}T00:00:00Z`,
  version: 1,
});

describe("proposing log entries from notes", () => {
  it("reads meals, water, sleep, mood and activity", () => {
    expect(proposeLog("had 2 rotis and dal for lunch")).toEqual([
      { kind: "meal", text: "had 2 rotis and dal for lunch", amount: null },
    ]);
    expect(proposeLog("drank 3 glasses of water")).toEqual([
      { kind: "water", text: "", amount: 3 },
    ]);
    expect(proposeLog("slept 6.5 hours")).toEqual([
      { kind: "sleep", text: "", amount: 6.5 },
    ]);
    expect(proposeLog("aaj 7 ghante neend aayi")).toEqual([
      { kind: "sleep", text: "", amount: 7 },
    ]);
    expect(proposeLog("walked 30 minutes, feeling good")).toEqual([
      { kind: "activity", text: "walked", amount: 30 },
      { kind: "mood", text: "", amount: 4 },
    ]);
    expect(proposeLog("mood 2/5")).toEqual([
      { kind: "mood", text: "", amount: 2 },
    ]);
    expect(proposeLog("maine poha khaya nashte me")?.[0].kind).toBe("meal");
  });
  it("records a medicine without interpreting it", () => {
    expect(
      proposeLog("had 2 idli and sambar for breakfast, slept 7 hours"),
    ).toEqual([
      { kind: "sleep", text: "", amount: 7 },
      {
        kind: "meal",
        text: "had 2 idli and sambar for breakfast",
        amount: null,
      },
    ]);
    expect(proposeLog("took my thyroid tablet")).toEqual([
      { kind: "medicine", text: "took my thyroid tablet", amount: null },
    ]);
  });
  it("ignores questions and unrecognised text", () => {
    expect(proposeLog("how much water should I drink?")).toBeNull();
    expect(proposeLog("what is a good dinner")).toBeNull();
    expect(proposeLog("hello there")).toBeNull();
    expect(proposeLog("I ate something")).toBeNull();
    expect(proposeLog("drank 99 glasses of water")).toBeNull();
  });
  it("only logs symptoms when asked explicitly", () => {
    expect(proposeLog("log symptom: mild headache")).toEqual([
      { kind: "symptom", text: "mild headache", amount: null },
    ]);
  });
  it("every proposal passes the stored schema", () => {
    for (const text of [
      "had idli and sambar",
      "2 glass paani piya",
      "slept 8 hrs",
      "yoga 20 min",
    ])
      for (const entry of proposeLog(text) ?? [])
        expect(LogEntrySchema.safeParse(entry).success).toBe(true);
  });
});

describe("schema", () => {
  it("rejects out-of-range values", () => {
    expect(LogEntrySchema.safeParse({ kind: "mood", amount: 6 }).success).toBe(
      false,
    );
    expect(
      LogEntrySchema.safeParse({ kind: "mood", amount: 2.5 }).success,
    ).toBe(false);
    expect(
      LogEntrySchema.safeParse({ kind: "sleep", amount: 25 }).success,
    ).toBe(false);
    expect(LogEntrySchema.safeParse({ kind: "meal", text: "" }).success).toBe(
      false,
    );
    expect(
      DayLogSchema.safeParse({ date: "2026-02-30", entries: [] }).success,
    ).toBe(false);
  });
});

describe("totals and patterns", () => {
  it("estimates recognised meals only and keeps the latest sleep", () => {
    const t = dayTotals({
      date: "2026-09-10",
      entries: [
        { kind: "meal", text: "2 roti and dal", amount: null },
        { kind: "meal", text: "something from a cafe", amount: null },
        { kind: "sleep", text: "", amount: 5 },
        { kind: "sleep", text: "", amount: 6 },
        { kind: "water", text: "", amount: 2 },
        { kind: "water", text: "", amount: 1 },
      ],
    });
    expect(t.sleep).toBe(6);
    expect(t.water).toBe(3);
    expect(t.unrecognisedMeals).toBe(1);
    expect(t.protein).toBeGreaterThan(15);
    expect(t.kcal).toBeGreaterThan(300);
  });
  it("builds a full 7-day window including empty days", () => {
    const week = recentDays(
      [
        {
          date: "2026-09-10",
          entries: [{ kind: "water", text: "", amount: 2 }],
        },
      ],
      "2026-09-12",
    );
    expect(week.map((d) => d.date)).toEqual([
      "2026-09-06",
      "2026-09-07",
      "2026-09-08",
      "2026-09-09",
      "2026-09-10",
      "2026-09-11",
      "2026-09-12",
    ]);
    expect(week[4].water).toBe(2);
    expect(shiftDate("2026-03-01", -1)).toBe("2026-02-28");
  });
  it("reports short sleep and a mood association with sample sizes", () => {
    const days: DayLog[] = [4, 5, 5, 8, 8, 7].map((sleep, i) => ({
      date: shiftDate("2026-09-12", i - 5),
      entries: [
        { kind: "sleep", text: "", amount: sleep },
        { kind: "mood", text: "", amount: sleep < 6 ? 2 : 4 },
      ],
    }));
    const found = patterns(recentDays(days, "2026-09-12"));
    expect(found.map((p) => p.title)).toContain("Sleep averaged 6.2 h");
    const mood = found.find((p) => p.title.startsWith("Mood"));
    expect(mood?.detail).toContain("3 days");
    expect(mood?.detail).toContain("not proof of a cause");
  });
  it("finds nothing when nothing is logged", () => {
    expect(patterns(recentDays([], "2026-09-12"))).toEqual([]);
  });
});

describe("companion", () => {
  const workspace: Workspace = {
    profile,
    reports: [],
    tasks: [],
    days: [
      saved({
        date: "2026-09-12",
        entries: [
          { kind: "meal", text: "poha", amount: null },
          { kind: "sleep", text: "", amount: 7 },
        ],
      }),
    ],
  };
  it("answers about the person's own log", () => {
    const today = logAnswer("what did I eat today", workspace, "2026-09-12");
    expect(today?.text).toContain("Poha");
    const week = logAnswer(
      "how did I sleep this week",
      workspace,
      "2026-09-12",
    );
    expect(week?.text).toContain("2026-09-12: 1 meal");
    expect(
      logAnswer(
        "what did I log this week",
        { ...workspace, days: [] },
        "2026-09-12",
      )?.text,
    ).toContain("haven’t logged");
    expect(logAnswer("what is protein", workspace)).toBeUndefined();
    expect(
      logAnswer("How can I understand my sleep?", workspace),
    ).toBeUndefined();
    expect(
      logAnswer("Give me my weekly summary", workspace, "2026-09-12")?.text,
    ).toContain("last 7 days");
  });
  it("drafts entries instead of saving, and still escalates first", async () => {
    const reply = await runHealthAgent("had 2 idli for breakfast", workspace);
    expect(reply.draftLog?.[0].kind).toBe("meal");
    const urgent = await runHealthAgent(
      "log symptom: crushing chest pain and cannot breathe",
      workspace,
    );
    expect(urgent.mode).toBe("escalation");
    expect(urgent.draftLog).toBeUndefined();
  });
});

describe("stored day logs", () => {
  let db: Database;
  let service: WorkspaceService;
  beforeAll(async () => {
    vi.stubEnv("HEALTH_DATA_KEY", "22".repeat(32));
    db = await createLocalDatabase();
    service = new WorkspaceService(db);
  });
  afterAll(async () => {
    await db.close();
    vi.unstubAllEnvs();
  });
  it("encrypts, versions, isolates and keeps one record per date", async () => {
    const a = await service.register("daylog_a", "password-123456", profile);
    const b = await service.register("daylog_b", "password-123456", profile);
    const day = {
      date: "2026-09-12",
      entries: [{ kind: "water" as const, text: "", amount: 2 }],
    };
    const id = await service.save(a.id, "day", day);
    const raw = await db.query<{ payload: string }>(
      "SELECT payload FROM ns_records WHERE id=$1",
      [id],
    );
    expect(raw[0].payload).not.toContain("water");
    await expect(service.save(a.id, "day", day)).rejects.toThrow(
      /already has a log/,
    );
    await service.save(
      a.id,
      "day",
      {
        ...day,
        entries: [...day.entries, { kind: "mood", text: "", amount: 3 }],
      },
      id,
      1,
    );
    await expect(service.save(a.id, "day", day, id, 1)).rejects.toThrow(
      /changed/,
    );
    await expect(service.save(b.id, "day", day, id, 2)).rejects.toThrow();
    const ws = await service.workspace(a.id);
    expect(ws.days?.[0].entries).toHaveLength(2);
    expect((await service.workspace(b.id)).days).toEqual([]);
    // Day logs do not consume the report/task quota.
    const count = await db.query<{ record_count: number }>(
      "SELECT record_count FROM ns_users WHERE id=$1",
      [a.id],
    );
    expect(count[0].record_count).toBe(0);
    // Concurrent first writes for one date: exactly one succeeds.
    const other = { ...day, date: "2026-09-13" };
    const results = await Promise.allSettled([
      service.save(a.id, "day", other),
      service.save(a.id, "day", other),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    // Export sees every stored day, not only the display window.
    expect((await service.workspace(a.id, true)).days).toHaveLength(2);
    await service.remove(
      a.id,
      (await service.workspace(a.id)).days!.find(
        (d) => d.date === "2026-09-13",
      )!.id,
    );
    await service.remove(a.id, id);
    expect((await service.workspace(a.id)).days).toEqual([]);
  });
});
