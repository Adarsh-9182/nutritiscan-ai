import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createLocalDatabase, type Database } from "./database";
import { WorkspaceService } from "./service";
import { ConversationSchema } from "./types";

const profile = {
  name: "C",
  language: "English" as const,
  allergies: "",
  medicines: "",
  conditions: "",
};
const chat = (title: string) =>
  ConversationSchema.parse({
    title,
    updatedAt: new Date().toISOString(),
    messages: [
      { id: "u1", role: "user", text: "My chest feels tight after meals" },
      {
        id: "a1",
        role: "assistant",
        text: "Let’s organise this for a clinician.",
        mode: "reference",
        sources: [],
      },
    ],
  });

describe("saved chats", () => {
  let db: Database;
  let service: WorkspaceService;
  beforeAll(async () => {
    vi.stubEnv("HEALTH_DATA_KEY", "44".repeat(32));
    db = await createLocalDatabase();
    service = new WorkspaceService(db);
  });
  afterAll(async () => {
    await db.close();
    vi.unstubAllEnvs();
  });

  it("encrypts, versions and isolates chats outside the record quota", async () => {
    const a = await service.register("chat_a", "password-123456", profile);
    const b = await service.register("chat_b", "password-123456", profile);
    const id = await service.save(a.id, "message", chat("Chest after meals"));
    const raw = await db.query<{ payload: string }>(
      "SELECT payload FROM ns_records WHERE id=$1",
      [id],
    );
    expect(raw[0].payload).not.toContain("chest");
    const ws = await service.workspace(a.id);
    expect(ws.conversations?.[0]).toMatchObject({
      id,
      title: "Chest after meals",
      version: 1,
    });
    await service.save(a.id, "message", chat("Renamed"), id, 1);
    await expect(
      service.save(a.id, "message", chat("Stale"), id, 1),
    ).rejects.toThrow(/changed/);
    await expect(
      service.save(b.id, "message", chat("Theft"), id, 2),
    ).rejects.toThrow();
    expect((await service.workspace(b.id)).conversations).toEqual([]);
    const count = await db.query<{ record_count: number }>(
      "SELECT record_count FROM ns_users WHERE id=$1",
      [a.id],
    );
    expect(count[0].record_count).toBe(0);
    await service.remove(a.id, id);
    expect((await service.workspace(a.id)).conversations).toEqual([]);
  });

  it("rejects malformed chats", () => {
    expect(
      ConversationSchema.safeParse({
        title: "",
        updatedAt: new Date().toISOString(),
        messages: [],
      }).success,
    ).toBe(false);
    expect(
      ConversationSchema.safeParse({
        title: "x",
        updatedAt: new Date().toISOString(),
        messages: [{ id: "1", role: "system", text: "hi" }],
      }).success,
    ).toBe(false);
  });
});
