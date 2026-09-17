import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createLocalDatabase, type Database } from "@/lib/workspace/database";
import { WorkspaceService } from "@/lib/workspace/service";
import type { CareTask, Saved } from "@/lib/workspace/types";
import {
  DEFAULT_SETTINGS,
  dueReminders,
  localNow,
  morningText,
  occursOn,
  reminderText,
} from "./schedule";
import { NotifyService } from "./service";
import { telegram, type Button, type Messenger } from "./telegram";

const task = (t: Partial<Saved<CareTask>>): Saved<CareTask> => ({
  id: "00000000-0000-4000-8000-000000000001",
  title: "Take vitamin D",
  date: "2026-09-17",
  done: false,
  createdAt: "",
  version: 1,
  ...t,
});

describe("schedule", () => {
  it("converts to the person's local time", () => {
    const now = new Date("2026-09-17T19:00:00Z");
    expect(localNow("Asia/Kolkata", now)).toEqual({
      date: "2026-09-18",
      minutes: 30,
    });
    expect(localNow("America/New_York", now)).toEqual({
      date: "2026-09-17",
      minutes: 15 * 60,
    });
  });
  it("follows repeat rules", () => {
    expect(occursOn(task({}), "2026-09-17")).toBe(true);
    expect(occursOn(task({}), "2026-09-18")).toBe(false);
    expect(occursOn(task({ repeat: "daily" }), "2026-10-02")).toBe(true);
    expect(occursOn(task({ repeat: "daily" }), "2026-09-16")).toBe(false);
    expect(occursOn(task({ repeat: "weekly" }), "2026-09-24")).toBe(true);
    expect(occursOn(task({ repeat: "weekly" }), "2026-09-25")).toBe(false);
    expect(
      occursOn(task({ repeat: "monthly", date: "2026-01-31" }), "2026-02-28"),
    ).toBe(true);
    expect(
      occursOn(task({ repeat: "monthly", date: "2026-01-31" }), "2026-03-30"),
    ).toBe(false);
    expect(occursOn(task({ done: true }), "2026-09-17")).toBe(false);
  });
  it("finds timed items due within the lateness window", () => {
    const tasks = [
      task({ id: "a", time: "09:00" }),
      task({ id: "b", time: "07:00" }),
      task({ id: "c", time: "10:00" }),
      task({ id: "d" }),
    ];
    expect(
      dueReminders(tasks, { date: "2026-09-17", minutes: 9 * 60 + 5 }).map(
        (t) => t.id,
      ),
    ).toEqual(["a"]);
  });
  it("hides titles unless the person opts in", () => {
    const due = [task({ time: "09:00" })];
    expect(reminderText(due, DEFAULT_SETTINGS)).not.toContain("vitamin");
    expect(reminderText(due, { ...DEFAULT_SETTINGS, titles: true })).toContain(
      "09:00 — Take vitamin D",
    );
    const morning = morningText(
      [task({}), task({ id: "x", date: "2026-09-01", title: "Old" })],
      "2026-09-17",
      DEFAULT_SETTINGS,
    );
    expect(morning).toContain("1 item today, 1 past due");
    expect(morning).not.toContain("Old");
    expect(morningText([], "2026-09-17", DEFAULT_SETTINGS)).toBeNull();
  });
});

describe("telegram client", () => {
  it("sends plain text with inline buttons and no markup parsing", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("{}"));
    await telegram("T", fetcher).send("42", "<b>hi</b>", [
      [{ text: "Save", data: "c:1" }],
    ]);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("https://api.telegram.org/botT/sendMessage");
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ chat_id: "42", text: "<b>hi</b>" });
    expect(body.parse_mode).toBeUndefined();
    expect(body.reply_markup.inline_keyboard[0][0]).toEqual({
      text: "Save",
      callback_data: "c:1",
    });
  });
});

class FakeMessenger implements Messenger {
  sent: { chat: string; text: string; buttons?: Button[][] }[] = [];
  acks: string[] = [];
  async send(chat: string, text: string, buttons?: Button[][]) {
    this.sent.push({ chat, text, buttons });
  }
  async acknowledge(_id: string, text?: string) {
    this.acks.push(text ?? "");
  }
  last() {
    return this.sent[this.sent.length - 1];
  }
}

describe("companion over Telegram", () => {
  let db: Database;
  let workspaces: WorkspaceService;
  let bot: FakeMessenger;
  let notify: NotifyService;
  let userId: string;
  const chat = { id: 777, type: "private" };
  const say = (text: string, now?: Date) =>
    notify.handleUpdate({ message: { text, chat } }, now);
  const tap = (data: string) =>
    notify.handleUpdate({
      callback_query: { id: "cb", data, message: { chat } },
    });
  const lastButton = () => bot.last().buttons![0][0].data;

  beforeAll(async () => {
    vi.stubEnv("HEALTH_DATA_KEY", "33".repeat(32));
    db = await createLocalDatabase();
    workspaces = new WorkspaceService(db);
    bot = new FakeMessenger();
    notify = new NotifyService(db, bot, "nutritiscan_bot");
    userId = (
      await workspaces.register("tg_user", "password-123456", {
        name: "T",
        language: "English",
        allergies: "",
        medicines: "",
        conditions: "",
      })
    ).id;
  });
  afterAll(async () => {
    await db.close();
    vi.unstubAllEnvs();
  });

  it("refuses unlinked chats and bad codes", async () => {
    await say("hello");
    expect(bot.last().text).toContain("open Settings");
    await say("/start " + "x".repeat(30));
    expect(bot.last().text).toContain("expired");
    await notify.handleUpdate({
      message: { text: "hi", chat: { id: 5, type: "group" } },
    });
    expect(bot.sent).toHaveLength(2);
  });

  it("links once with a single-use code and stores the chat sealed", async () => {
    await expect(notify.createLink(userId, "Not/AZone")).rejects.toThrow();
    const { url } = await notify.createLink(userId, "Asia/Kolkata");
    expect(url).toMatch(/^https:\/\/t\.me\/nutritiscan_bot\?start=[\w-]{43}$/);
    const code = url.split("start=")[1];
    await say(`/start ${code}`);
    expect(bot.last().text).toContain("Connected");
    const rows = await db.query<{ chat: string }>(
      "SELECT chat FROM ns_channels",
    );
    expect(rows[0].chat).not.toContain("777");
    await say(`/start ${code}`);
    expect(bot.last().text).toContain("expired");
    expect((await notify.status(userId)).connected).toBe(true);
  });

  it("drafts a log from a message and saves it only on confirmation", async () => {
    const now = new Date("2026-09-17T06:00:00Z");
    await say("had 2 roti and dal, slept 6 hours", now);
    expect(bot.last().text).toContain("Tap Save");
    const save = lastButton();
    expect(save).toMatch(/^c:/);
    expect((await workspaces.workspace(userId)).days).toEqual([]);
    await tap(save);
    expect(bot.last().text).toContain("Added to today’s log");
    const days = (await workspaces.workspace(userId)).days!;
    expect(days[0].date).toBe("2026-09-17");
    expect(days[0].entries.map((e) => e.kind)).toEqual(["sleep", "meal"]);
    await tap(save);
    expect(bot.acks.at(-1)).toContain("expired");
  });

  it("cancels drafts and saves reminders", async () => {
    await say("remind me to take vitamin D every day at 9am");
    const cancel = bot.last().buttons![0][1].data;
    await tap(cancel);
    expect(bot.last().text).toBe("Okay, not saved.");
    expect((await workspaces.workspace(userId)).tasks).toEqual([]);
    await say("remind me to take vitamin D every day at 9am");
    await tap(lastButton());
    const tasks = (await workspaces.workspace(userId)).tasks;
    expect(tasks[0]).toMatchObject({ time: "09:00", repeat: "daily" });
  });

  it("escalates emergencies without drafting", async () => {
    await say("I have crushing chest pain and can't breathe");
    expect(bot.last().buttons).toBeUndefined();
    expect(bot.last().text).toMatch(/emergency|112|108|immediately/i);
  });

  it("sends due reminders once, with Done buttons when titles are shown", async () => {
    await notify.updateSettings(
      userId,
      { titles: false, morning: false, evening: false },
      "Asia/Kolkata",
    );
    const tasks = (await workspaces.workspace(userId)).tasks;
    await workspaces.save(
      userId,
      "task",
      { ...tasks[0], date: "2026-09-17" },
      tasks[0].id,
      tasks[0].version,
    );
    const at = new Date("2026-09-17T03:35:00Z"); // 09:05 in India
    const before = bot.sent.length;
    const first = await notify.runDue(at);
    expect(first).toEqual({ channels: 1, sent: 1, failed: 0 });
    expect(bot.last().text).toContain("reminder due at 09:00");
    expect(bot.last().text).not.toContain("vitamin");
    expect((await notify.runDue(at)).sent).toBe(0);
    expect(bot.sent.length).toBe(before + 1);

    await notify.updateSettings(
      userId,
      { titles: true, morning: false, evening: true },
      "Asia/Kolkata",
    );
    const nextDay = new Date("2026-09-18T03:40:00Z");
    await notify.runDue(nextDay);
    expect(bot.last().text).toContain("09:00 — Take vitamin D");
    const done = lastButton();
    expect(done).toBe(`d:${tasks[0].id}`);
    await notify.handleUpdate(
      { callback_query: { id: "cb", data: done, message: { chat } } },
      nextDay,
    );
    expect(bot.last().text).toContain("Next one: 2026-09-19 at 09:00");
  });

  it("sends the morning list and evening nudge once per day", async () => {
    await notify.updateSettings(userId, DEFAULT_SETTINGS, "Asia/Kolkata");
    const morning = new Date("2026-09-19T02:45:00Z"); // 08:15 IST
    await notify.runDue(morning);
    expect(bot.last().text).toContain("Good morning");
    const count = bot.sent.length;
    await notify.runDue(new Date("2026-09-19T02:55:00Z"));
    expect(bot.sent.length).toBe(count);
    await notify.runDue(new Date("2026-09-19T15:40:00Z")); // 21:10 IST
    expect(bot.last().text).toContain("Nothing in your log today");
    // The 17th has entries, so no nudge that evening.
    const before = bot.sent.length;
    await notify.runDue(new Date("2026-09-17T15:40:00Z"));
    expect(
      bot.sent
        .slice(before)
        .some((m) => m.text.includes("Nothing in your log")),
    ).toBe(false);
  });

  it("ignores forged callbacks and disconnects on /stop", async () => {
    await tap("c:not-a-uuid");
    expect(bot.acks.at(-1)).toContain("no longer available");
    await notify.handleUpdate({
      callback_query: {
        id: "cb",
        data: `d:${(await workspaces.workspace(userId)).tasks[0].id}`,
        message: { chat: { id: 999, type: "private" } },
      },
    });
    expect(bot.acks.at(-1)).toContain("no longer available");
    await say("/stop");
    expect(bot.last().text).toContain("disconnected");
    expect((await notify.status(userId)).connected).toBe(false);
    expect((await notify.runDue()).channels).toBe(0);
  });
});
