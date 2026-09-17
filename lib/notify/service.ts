import { randomUUID } from "node:crypto";
import type { Database } from "@/lib/workspace/database";
import { digest, seal, token, unseal } from "@/lib/workspace/crypto";
import { ApiError, WorkspaceService } from "@/lib/workspace/service";
import { runHealthAgent } from "@/lib/workspace/health-agent";
import { nextOccurrence } from "@/lib/workspace/actions";
import { recentDays } from "@/lib/workspace/daily";
import { say, speaksHinglish } from "@/lib/workspace/voice";
import {
  DayLogSchema,
  TaskSchema,
  type CareTask,
  type LogEntry,
} from "@/lib/workspace/types";
import {
  DEFAULT_SETTINGS,
  EVENING,
  EVENING_TEXT,
  MORNING,
  dueReminders,
  isTimeZone,
  localNow,
  morningText,
  reminderText,
  type ChannelSettings,
} from "./schedule";
import type { Messenger, TelegramUpdate } from "./telegram";

type ChannelRow = {
  user_id: string;
  chat: string;
  time_zone: string;
  settings: string;
};
type Pending =
  | { kind: "log"; date: string; entries: LogEntry[] }
  | { kind: "reminder"; task: CareTask };

const LINK_MINUTES = 15;
const PENDING_MINUTES = 30;
const chatHash = (chat: string) => digest(`telegram:${chat}`);
const HELP = [
  "I’m your NutritiScan companion. You can:",
  "• Tell me what you ate, drank, how you slept or feel — “had 2 roti and dal, slept 7 hours”",
  "• Ask for a reminder — “remind me to take vitamin D every day at 9am”",
  "• /today — today’s care list and log",
  "• /week — your last 7 days",
  "• /stop — disconnect Telegram",
  "",
  "I organise your information and questions for your clinician. I can’t diagnose, prescribe or monitor emergencies. In an emergency, call 112 or your local emergency number.",
].join("\n");

function parseSettings(raw: string): ChannelSettings {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export class NotifyService {
  private workspaces: WorkspaceService;
  constructor(
    private db: Database,
    private messenger: Messenger,
    private botUsername = process.env.TELEGRAM_BOT_USERNAME ?? "",
  ) {
    this.workspaces = new WorkspaceService(db);
  }

  async createLink(userId: string, timeZone: string) {
    if (!isTimeZone(timeZone)) throw new ApiError(400, "Unknown time zone.");
    const code = token();
    await this.db.query(
      "DELETE FROM ns_link_codes WHERE expires_at < now() OR user_id=$1",
      [userId],
    );
    await this.db.query(
      `INSERT INTO ns_link_codes (code_hash,user_id,time_zone,expires_at)
       VALUES ($1,$2,$3,now() + $4 * interval '1 minute')`,
      [digest(code), userId, timeZone, LINK_MINUTES],
    );
    return {
      url: `https://t.me/${this.botUsername}?start=${code}`,
      expiresInMinutes: LINK_MINUTES,
    };
  }

  async status(userId: string) {
    const rows = await this.db.query<ChannelRow>(
      "SELECT user_id,chat,time_zone,settings FROM ns_channels WHERE user_id=$1",
      [userId],
    );
    const row = rows[0];
    return row
      ? {
          connected: true,
          timeZone: row.time_zone,
          settings: parseSettings(row.settings),
        }
      : { connected: false, timeZone: null, settings: DEFAULT_SETTINGS };
  }

  async updateSettings(
    userId: string,
    settings: ChannelSettings,
    timeZone: string,
  ) {
    if (!isTimeZone(timeZone)) throw new ApiError(400, "Unknown time zone.");
    const rows = await this.db.query<{ user_id: string }>(
      "UPDATE ns_channels SET settings=$1,time_zone=$2 WHERE user_id=$3 RETURNING user_id",
      [JSON.stringify(settings), timeZone, userId],
    );
    if (!rows.length) throw new ApiError(404, "Telegram is not connected.");
  }

  async disconnect(userId: string, notify = true) {
    const rows = await this.db.query<ChannelRow>(
      "DELETE FROM ns_channels WHERE user_id=$1 RETURNING user_id,chat,time_zone,settings",
      [userId],
    );
    await this.db.query("DELETE FROM ns_pending WHERE user_id=$1", [userId]);
    if (rows[0] && notify) {
      const chat = await unseal<string>(rows[0].chat, `${userId}:channel`);
      await this.messenger
        .send(
          chat,
          "NutritiScan is disconnected. You won’t get more messages here.",
        )
        .catch(() => undefined);
    }
  }

  private async channelFor(chat: string) {
    const rows = await this.db.query<ChannelRow>(
      "SELECT user_id,chat,time_zone,settings FROM ns_channels WHERE chat_hash=$1",
      [chatHash(chat)],
    );
    return rows[0];
  }

  private async link(chat: string, code: string) {
    const rows = await this.db.query<{ user_id: string; time_zone: string }>(
      "DELETE FROM ns_link_codes WHERE code_hash=$1 AND expires_at > now() RETURNING user_id,time_zone",
      [digest(code)],
    );
    const found = rows[0];
    if (!found)
      return this.messenger.send(
        chat,
        "That link has expired. Open Settings → Telegram reminders in NutritiScan and connect again.",
      );
    // One chat per account and one account per chat.
    await this.db.query(
      "DELETE FROM ns_channels WHERE chat_hash=$1 OR user_id=$2",
      [chatHash(chat), found.user_id],
    );
    await this.db.query(
      `INSERT INTO ns_channels (user_id,kind,chat_hash,chat,time_zone,settings)
       VALUES ($1,'telegram',$2,$3,$4,$5)`,
      [
        found.user_id,
        chatHash(chat),
        await seal(chat, `${found.user_id}:channel`),
        found.time_zone,
        JSON.stringify(DEFAULT_SETTINGS),
      ],
    );
    await this.messenger.send(chat, `✅ Connected.\n\n${HELP}`);
  }

  private async savePending(userId: string, pending: Pending) {
    const id = randomUUID();
    await this.db.query("DELETE FROM ns_pending WHERE expires_at < now()");
    await this.db.query(
      `INSERT INTO ns_pending (id,user_id,payload,expires_at)
       VALUES ($1,$2,$3,now() + $4 * interval '1 minute')`,
      [
        id,
        userId,
        await seal(pending, `${userId}:pending:${id}`),
        PENDING_MINUTES,
      ],
    );
    return id;
  }

  private async appendLog(userId: string, date: string, entries: LogEntry[]) {
    const workspace = await this.workspaces.workspace(userId);
    const day = workspace.days?.find((d) => d.date === date);
    const next = DayLogSchema.parse({
      date,
      entries: [...(day?.entries ?? []), ...entries],
    });
    await this.workspaces.save(userId, "day", next, day?.id, day?.version);
  }

  /** Handle one webhook update. Never throws for user-caused problems. */
  async handleUpdate(update: TelegramUpdate, now = new Date()) {
    const callback = update.callback_query;
    if (callback?.message?.chat.type === "private" && callback.data)
      return this.handleCallback(
        String(callback.message.chat.id),
        callback.id,
        callback.data,
        now,
      );
    const message = update.message;
    if (!message || message.chat.type !== "private" || !message.text) return;
    const chat = String(message.chat.id);
    const text = message.text.trim().slice(0, 1000);
    await this.workspaces.rate(`telegram:${chatHash(chat)}`, 20);
    const start = text.match(/^\/start(?:\s+([A-Za-z0-9_-]{20,64}))?$/);
    if (start?.[1]) return this.link(chat, start[1]);
    const channel = await this.channelFor(chat);
    if (!channel)
      return this.messenger.send(
        chat,
        "Hi! To use NutritiScan here, open Settings → Telegram reminders in the app and tap Connect.",
      );
    const userId = channel.user_id;
    const local = localNow(channel.time_zone, now);
    if (/^\/stop\b/.test(text)) return this.disconnect(userId);
    if (/^\/(start|help)\b/.test(text)) return this.messenger.send(chat, HELP);
    const workspace = await this.workspaces.workspace(userId);
    const question = /^\/today\b/.test(text)
      ? "what should I do next"
      : /^\/week\b/.test(text)
        ? "weekly summary"
        : /^\/next\b/.test(text)
          ? "what should I do next"
          : text;
    const reply = await runHealthAgent(question, workspace, {
      today: local.date,
    });
    let body = reply.text;
    if (/^\/today\b/.test(text)) {
      const today = recentDays(workspace.days, local.date, 1)[0];
      body += today.entries
        ? `\n\nLogged today: ${today.entries} entr${today.entries === 1 ? "y" : "ies"}.`
        : "\n\nNothing logged yet today.";
    }
    if (reply.draftLog || reply.draftReminder) {
      const id = await this.savePending(
        userId,
        reply.draftLog
          ? { kind: "log", date: local.date, entries: reply.draftLog }
          : { kind: "reminder", task: reply.draftReminder! },
      );
      // The app's closing hint is the last paragraph; Telegram confirms with
      // a button instead.
      const hi = speaksHinglish(text, workspace.profile);
      body = [
        body.slice(0, body.lastIndexOf("\n\n")),
        say(
          hi,
          "Tap Save to keep it. You can edit it later in the app.",
          "Rakhna hai to Save dabayein. Baad me app me badal sakte hain.",
        ),
      ].join("\n\n");
      return this.messenger.send(chat, body, [
        [
          { text: "✓ Save", data: `c:${id}` },
          { text: hi ? "Rehne do" : "Cancel", data: `x:${id}` },
        ],
      ]);
    }
    return this.messenger.send(
      chat,
      reply.sources.length
        ? `${body}\n\nSources: ${reply.sources.map((s) => s.url).join(" ")}`
        : body,
    );
  }

  private async handleCallback(
    chat: string,
    callbackId: string,
    data: string,
    now: Date,
  ) {
    const channel = await this.channelFor(chat);
    const match = data.match(/^([cxd]):([0-9a-f-]{36})$/);
    if (!channel || !match)
      return this.messenger.acknowledge(
        callbackId,
        "This action is no longer available.",
      );
    const userId = channel.user_id;
    const [, action, id] = match;
    if (action === "d") {
      const local = localNow(channel.time_zone, now);
      const workspace = await this.workspaces.workspace(userId);
      const task = workspace.tasks.find((t) => t.id === id);
      if (!task || task.done)
        return this.messenger.acknowledge(callbackId, "Already done.");
      const repeating = task.repeat && task.repeat !== "none";
      const next = TaskSchema.parse(
        repeating
          ? { ...task, date: nextOccurrence(task, local.date) }
          : { ...task, done: true },
      );
      await this.workspaces.save(userId, "task", next, task.id, task.version);
      await this.messenger.acknowledge(callbackId, "Done ✓");
      return this.messenger.send(
        chat,
        repeating
          ? `✓ Done. Next one: ${next.date}${next.time ? ` at ${next.time}` : ""}.`
          : "✓ Marked done.",
      );
    }
    const rows = await this.db.query<{ payload: string }>(
      "DELETE FROM ns_pending WHERE id=$1 AND user_id=$2 AND expires_at > now() RETURNING payload",
      [id, userId],
    );
    if (!rows[0])
      return this.messenger.acknowledge(
        callbackId,
        "This draft expired. Send it again.",
      );
    if (action === "x") {
      await this.messenger.acknowledge(callbackId, "Cancelled");
      return this.messenger.send(chat, "Okay, not saved.");
    }
    const pending = await unseal<Pending>(
      rows[0].payload,
      `${userId}:pending:${id}`,
    );
    try {
      if (pending.kind === "log")
        await this.appendLog(userId, pending.date, pending.entries);
      else
        await this.workspaces.save(
          userId,
          "task",
          TaskSchema.parse(pending.task),
        );
    } catch (error) {
      await this.messenger.acknowledge(callbackId, "Could not save");
      if (error instanceof ApiError)
        return this.messenger.send(chat, `Couldn’t save: ${error.message}`);
      throw error;
    }
    await this.messenger.acknowledge(callbackId, "Saved ✓");
    return this.messenger.send(
      chat,
      pending.kind === "log"
        ? "✓ Added to today’s log."
        : "✓ Reminder saved. I’ll message you when it’s due.",
    );
  }

  /** One scheduled pass: due reminders, the morning list and an evening
   * nudge, each sent at most once per item per day. */
  async runDue(now = new Date()) {
    const channels = await this.db.query<ChannelRow>(
      "SELECT user_id,chat,time_zone,settings FROM ns_channels ORDER BY created_at LIMIT 1000",
    );
    let sent = 0;
    let failed = 0;
    for (const channel of channels) {
      try {
        sent += await this.runChannel(channel, now);
      } catch {
        failed++;
      }
    }
    await this.db.query(
      "DELETE FROM ns_notify_log WHERE sent_at < now() - interval '3 days'",
    );
    return { channels: channels.length, sent, failed };
  }

  /** Records a send key first, so overlapping runs never double-send. */
  private async claim(userId: string, key: string) {
    const rows = await this.db.query<{ key: string }>(
      "INSERT INTO ns_notify_log (user_id,key) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING key",
      [userId, key],
    );
    return rows.length > 0;
  }

  private async runChannel(channel: ChannelRow, now: Date) {
    const userId = channel.user_id;
    const settings = parseSettings(channel.settings);
    const local = localNow(channel.time_zone, now);
    const chat = await unseal<string>(channel.chat, `${userId}:channel`);
    const workspace = await this.workspaces.workspace(userId);
    let sent = 0;
    const due = [];
    for (const task of dueReminders(workspace.tasks, local))
      if (await this.claim(userId, `r:${task.id}:${local.date}:${task.time}`))
        due.push(task);
    if (due.length) {
      await this.messenger.send(
        chat,
        reminderText(due, settings),
        settings.titles
          ? due.map((t) => [
              { text: `✓ Done: ${t.title.slice(0, 40)}`, data: `d:${t.id}` },
            ])
          : undefined,
      );
      sent++;
    }
    if (
      settings.morning &&
      local.minutes >= MORNING &&
      local.minutes < MORNING + 4 * 60
    ) {
      const text = morningText(workspace.tasks, local.date, settings);
      if (text && (await this.claim(userId, `m:${local.date}`))) {
        await this.messenger.send(chat, text);
        sent++;
      }
    }
    if (settings.evening && local.minutes >= EVENING) {
      const today = workspace.days?.find((d) => d.date === local.date);
      if (
        !today?.entries.length &&
        (await this.claim(userId, `e:${local.date}`))
      ) {
        await this.messenger.send(chat, EVENING_TEXT);
        sent++;
      }
    }
    return sent;
  }
}
