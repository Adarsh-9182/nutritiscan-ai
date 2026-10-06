import type { Database } from "./database";
import { seal, unseal } from "./crypto";
import { ApiError } from "./service";
import { capThreads, safeThreads, type Thread } from "@/lib/memory/threads";

type Row = { id: string; payload: string; created_at: Date | string; updated_at: Date | string };
const MAX_THREADS = 40;
const MAX_BYTES = 1_500_000;
const validId = /^[a-zA-Z0-9_-]{1,80}$/;
const SYNC_NOTICE_VERSION = "2026-10-06-v1";

/** Validate and bound untrusted browser storage before it reaches SQL. */
function cleanThreads(input: unknown): Thread[] {
  if (!Array.isArray(input) || input.length > MAX_THREADS)
    throw new ApiError(400, "Conversation list is too large or invalid.");
  const threads = safeThreads(input);
  if (threads.length !== input.length || threads.some((t) =>
    !validId.test(t.id) || t.title.length > 120 ||
    !Number.isFinite(t.createdAt) || t.createdAt < 0 ||
    !Number.isFinite(t.updatedAt) || t.updatedAt < t.createdAt ||
    t.messages.length > 50 ||
    t.messages.some((m) => (m.role !== "user" && m.role !== "assistant") || !Array.isArray(m.parts))
  )) throw new ApiError(400, "One or more conversations could not be read.");
  const bounded = capThreads(threads);
  if (bounded.length !== threads.length || Buffer.byteLength(JSON.stringify(bounded), "utf8") > MAX_BYTES)
    throw new ApiError(413, "Conversation history is too large to sync.");
  return bounded;
}

export class ConversationService {
  constructor(private db: Database) {}

  async enabled(userId: string): Promise<boolean> {
    const user = await this.db.query<{ id: string }>("SELECT id FROM ns_users WHERE id=$1", [userId]);
    if (!user[0]) throw new ApiError(401, "Please sign in again.");
    const rows = await this.db.query<{ user_id: string }>(
      "SELECT user_id FROM ns_chat_sync_consents WHERE user_id=$1 AND revoked_at IS NULL",
      [userId],
    );
    return rows.length > 0;
  }

  async list(userId: string): Promise<Thread[]> {
    if (!(await this.enabled(userId))) return [];
    const rows = await this.db.query<Row>(
      "SELECT id,payload,created_at,updated_at FROM ns_conversations WHERE user_id=$1 ORDER BY updated_at DESC LIMIT 40",
      [userId],
    );
    return Promise.all(rows.map(async (row) => {
      const value = await unseal<Thread>(row.payload, `${userId}:conversation:${row.id}`);
      return { ...value, id: row.id, createdAt: new Date(row.created_at).getTime(), updatedAt: new Date(row.updated_at).getTime() };
    }));
  }

  async enableAndImport(userId: string, input: unknown): Promise<Thread[]> {
    const threads = cleanThreads(input);
    const rows = await this.db.query<{ user_id: string }>(
      `INSERT INTO ns_chat_sync_consents (user_id,notice_version,enabled_at,revoked_at)
       SELECT id,$2,now(),NULL FROM ns_users WHERE id=$1
       ON CONFLICT (user_id) DO UPDATE SET notice_version=EXCLUDED.notice_version,
         enabled_at=now(),revoked_at=NULL RETURNING user_id`,
      [userId, SYNC_NOTICE_VERSION],
    );
    if (!rows.length) throw new ApiError(401, "Please sign in again.");
    for (const thread of threads) await this.put(userId, thread);
    return this.list(userId);
  }

  async revokeConsent(userId: string): Promise<void> {
    await this.db.query(
      "UPDATE ns_chat_sync_consents SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL",
      [userId],
    );
  }

  async put(userId: string, input: unknown): Promise<void> {
    const [thread] = cleanThreads([input]);
    if (!(await this.enabled(userId)))
      throw new ApiError(403, "Turn on account chat sync before saving conversations.");
    const payload = await seal(thread, `${userId}:conversation:${thread.id}`);
    await this.db.query(
      `INSERT INTO ns_conversations (user_id,id,payload,created_at,updated_at)
       VALUES ($1,$2,$3,to_timestamp($4 / 1000.0),to_timestamp($5 / 1000.0))
       ON CONFLICT (user_id,id) DO UPDATE SET payload=EXCLUDED.payload,updated_at=EXCLUDED.updated_at
       WHERE EXCLUDED.updated_at >= ns_conversations.updated_at`,
      [userId, thread.id, payload, thread.createdAt, thread.updatedAt],
    );
    await this.db.query(
      `DELETE FROM ns_conversations WHERE user_id=$1 AND id NOT IN
       (SELECT id FROM ns_conversations WHERE user_id=$1 ORDER BY updated_at DESC LIMIT 40)`,
      [userId],
    );
  }

  async remove(userId: string, id?: string): Promise<void> {
    if (!(await this.enabled(userId))) throw new ApiError(403, "Account chat sync is not enabled.");
    if (id) {
      if (!validId.test(id)) throw new ApiError(400, "Conversation id is invalid.");
      await this.db.query("DELETE FROM ns_conversations WHERE user_id=$1 AND id=$2", [userId, id]);
    } else {
      await this.db.query("DELETE FROM ns_conversations WHERE user_id=$1", [userId]);
    }
  }
}
