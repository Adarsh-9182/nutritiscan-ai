import { randomUUID } from "node:crypto";
import type { Database } from "./database";
import {
  digest,
  hashPassword,
  verifyPassword,
  seal,
  unseal,
  token,
} from "./crypto";
import type { Profile, Saved, Report, CareTask, Workspace } from "./types";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
type UserRow = {
  id: string;
  password_hash: string;
  recovery_hash: string;
  profile: string;
};
type RecordRow = {
  id: string;
  kind: string;
  payload: string;
  created_at: Date | string;
  version: number;
};
export const SESSION_SECONDS = 60 * 60 * 24 * 7;

export class WorkspaceService {
  constructor(private db: Database) {}

  async rate(key: string, maximum: number, seconds = 60): Promise<void> {
    const result = await this.db.query<{ count: number }>(
      `INSERT INTO ns_rate_limits (key,count,expires_at)
      VALUES ($1,1,now() + $2 * interval '1 second') ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN ns_rate_limits.expires_at <= now() THEN 1 ELSE ns_rate_limits.count + 1 END,
      expires_at = CASE WHEN ns_rate_limits.expires_at <= now() THEN EXCLUDED.expires_at ELSE ns_rate_limits.expires_at END RETURNING count`,
      [digest(key), seconds],
    );
    if (result[0].count > maximum)
      throw new ApiError(429, "Too many attempts. Please wait and try again.");
    // Bound storage over time without holding per-instance counters.
    await this.db.query(
      "DELETE FROM ns_rate_limits WHERE expires_at < now() - interval '1 hour'",
    );
  }

  async register(username: string, password: string, profile: Profile) {
    const id = randomUUID(),
      recovery = token();
    const passwordHash = await hashPassword(password);
    const rows = await this.db.query<{ id: string }>(
      `INSERT INTO ns_users (id,username,password_hash,recovery_hash,profile)
      VALUES ($1,$2,$3,$4,$5) ON CONFLICT (username) DO NOTHING RETURNING id`,
      [
        id,
        username.toLowerCase(),
        passwordHash,
        digest(recovery),
        await seal(profile, id),
      ],
    );
    if (!rows.length)
      throw new ApiError(409, "That username is unavailable. Choose another.");
    return { id, recovery, session: await this.session(id) };
  }

  async login(username: string, password: string) {
    const rows = await this.db.query<UserRow>(
      "SELECT * FROM ns_users WHERE username = $1",
      [username.toLowerCase()],
    );
    const user = rows[0];
    // Same expensive KDF path whether or not the account exists.
    const matches = await verifyPassword(
      password,
      user?.password_hash ?? `${"0".repeat(32)}:${"0".repeat(128)}`,
    );
    if (!user || !matches)
      throw new ApiError(401, "Username or password is incorrect.");
    return { id: user.id, session: await this.session(user.id) };
  }

  async session(id: string) {
    const value = token();
    await this.db.query("DELETE FROM ns_sessions WHERE expires_at < now()");
    await this.db.query(
      `INSERT INTO ns_sessions (token_hash,user_id,expires_at) VALUES ($1,$2,now() + $3 * interval '1 second')`,
      [digest(value), id, SESSION_SECONDS],
    );
    return value;
  }
  async authenticate(session: string | undefined) {
    if (!session || session.length > 100)
      throw new ApiError(401, "Please sign in to continue.");
    const rows = await this.db.query<{ user_id: string }>(
      "SELECT user_id FROM ns_sessions WHERE token_hash=$1 AND expires_at>now()",
      [digest(session)],
    );
    if (!rows[0])
      throw new ApiError(
        401,
        "Your session has expired. Please sign in again.",
      );
    return rows[0].user_id;
  }
  async logout(session: string) {
    await this.db.query("DELETE FROM ns_sessions WHERE token_hash=$1", [
      digest(session),
    ]);
  }
  async recover(username: string, recovery: string, password: string) {
    const hash = await hashPassword(password),
      nextRecovery = token();
    // Both the credential change and session invalidation form one SQL statement.
    const rows = await this.db.query<{ id: string }>(
      `WITH changed AS (
      UPDATE ns_users SET password_hash=$1, recovery_hash=$2 WHERE username=$3 AND recovery_hash=$4 RETURNING id
    ), revoked AS (DELETE FROM ns_sessions WHERE user_id IN (SELECT id FROM changed)) SELECT id FROM changed`,
      [hash, digest(nextRecovery), username.toLowerCase(), digest(recovery)],
    );
    if (!rows.length)
      throw new ApiError(401, "Username or recovery key is incorrect.");
    return { recovery: nextRecovery };
  }
  async workspace(id: string): Promise<Workspace> {
    const users = await this.db.query<UserRow>(
      "SELECT * FROM ns_users WHERE id=$1",
      [id],
    );
    if (!users[0]) throw new ApiError(401, "Please sign in again.");
    const records = await this.db.query<RecordRow>(
      `SELECT id,kind,payload,created_at,version FROM ns_records WHERE user_id=$1 AND kind IN ('report','task') ORDER BY created_at DESC LIMIT 500`,
      [id],
    );
    const decoded = await Promise.all(
      records.map(async (r) => ({
        ...(await unseal<Report | CareTask>(r.payload, `${id}:${r.id}`)),
        id: r.id,
        createdAt: new Date(r.created_at).toISOString(),
        version: r.version,
        kind: r.kind,
      })),
    );
    return {
      profile: await unseal<Profile>(users[0].profile, id),
      reports: decoded.filter((r) => r.kind === "report") as Saved<Report>[],
      tasks: decoded.filter((r) => r.kind === "task") as Saved<CareTask>[],
    };
  }
  async profile(id: string, value: Profile) {
    await this.db.query("UPDATE ns_users SET profile=$1 WHERE id=$2", [
      await seal(value, id),
      id,
    ]);
  }
  async save(
    id: string,
    kind: "report" | "task",
    value: Report | CareTask,
    recordId: string = randomUUID(),
    version?: number,
  ) {
    const payload = await seal(value, `${id}:${recordId}`);
    if (version !== undefined) {
      const rows = await this.db.query<{ id: string }>(
        "UPDATE ns_records SET payload=$1,version=version+1 WHERE id=$2 AND user_id=$3 AND kind=$4 AND version=$5 RETURNING id",
        [payload, recordId, id, kind, version],
      );
      if (!rows.length)
        throw new ApiError(
          409,
          "This record changed or is no longer available. Refresh before editing.",
        );
    } else {
      // Reserve quota with a conditional row update, atomic under concurrent inserts.
      const rows = await this.db.query<{ id: string }>(
        `WITH owner AS (UPDATE ns_users SET record_count=record_count+1 WHERE id=$1 AND record_count<500 RETURNING id)
        INSERT INTO ns_records (id,user_id,kind,payload) SELECT $2,owner.id,$3,$4 FROM owner RETURNING id`,
        [id, recordId, kind, payload],
      );
      if (!rows.length)
        throw new ApiError(
          409,
          "Record limit reached. Export and remove older records first.",
        );
    }
    return recordId;
  }
  async remove(id: string, recordId: string) {
    const rows = await this.db.query<{ id: string }>(
      `WITH removed AS (DELETE FROM ns_records WHERE id=$1 AND user_id=$2 RETURNING id),
      released AS (UPDATE ns_users SET record_count=GREATEST(0,record_count-1) WHERE id=$2 AND EXISTS (SELECT 1 FROM removed)) SELECT id FROM removed`,
      [recordId, id],
    );
    if (!rows.length) throw new ApiError(404, "Record not found.");
  }
  async deleteAccount(id: string, password: string) {
    const users = await this.db.query<UserRow>(
      "SELECT * FROM ns_users WHERE id=$1",
      [id],
    );
    if (!users[0] || !(await verifyPassword(password, users[0].password_hash)))
      throw new ApiError(401, "Password is incorrect.");
    await this.db.query("DELETE FROM ns_users WHERE id=$1", [id]);
  }
}
