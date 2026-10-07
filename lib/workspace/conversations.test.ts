import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createLocalDatabase, type Database } from "./database";
import { WorkspaceService } from "./service";
import { ConversationService } from "./conversations";
import { ProfileSchema } from "./types";
import type { Thread } from "@/lib/memory/threads";

function thread(id: string, updatedAt: number, text: string): Thread {
  return {
    id,
    title: "Health question",
    createdAt: updatedAt - 100,
    updatedAt,
    messages: [
      { id: `${id}-user`, role: "user", parts: [{ type: "text", text }] },
      { id: `${id}-answer`, role: "assistant", parts: [{ type: "text", text: "Educational reply" }] },
    ],
  };
}

describe("opt-in encrypted conversation sync", () => {
  let db: Database;
  let accounts: WorkspaceService;
  let conversations: ConversationService;
  let alice: Awaited<ReturnType<WorkspaceService["register"]>>;
  let bob: Awaited<ReturnType<WorkspaceService["register"]>>;

  beforeAll(async () => {
    vi.stubEnv("HEALTH_DATA_KEY", "42".repeat(32));
    db = await createLocalDatabase();
    accounts = new WorkspaceService(db);
    conversations = new ConversationService(db);
    alice = await accounts.register("sync_alice", "alice-test-password", ProfileSchema.parse({ name: "Alice" }));
    bob = await accounts.register("sync_bob", "bob-test-password", ProfileSchema.parse({ name: "Bob" }));
  }, 30_000);

  afterAll(async () => {
    await db.close();
    vi.unstubAllEnvs();
  });

  it("keeps chat local until the account explicitly enables sync", async () => {
    const local = thread("t_local_1", 2_000, "Sensitive synthetic symptom text");
    expect(await conversations.enabled(alice.id)).toBe(false);
    expect(await conversations.list(alice.id)).toEqual([]);
    await expect(conversations.put(alice.id, local)).rejects.toMatchObject({ status: 403 });

    const imported = await conversations.enableAndImport(alice.id, [local]);
    expect(imported).toHaveLength(1);
    expect(imported[0].messages[0]).toMatchObject({ role: "user", parts: [{ text: "Sensitive synthetic symptom text" }] });

    const stored = await db.query<{ payload: string }>(
      "SELECT payload FROM ns_conversations WHERE user_id=$1 AND id=$2",
      [alice.id, local.id],
    );
    expect(stored[0].payload).not.toContain("Sensitive synthetic symptom text");
  });

  it("isolates reads, overwrites and deletes between accounts", async () => {
    const sharedId = "t_shared_synthetic";
    await conversations.enableAndImport(bob.id, [thread(sharedId, 3_000, "Bob's synthetic question")]);
    await conversations.put(alice.id, thread(sharedId, 3_100, "Alice's synthetic question"));

    expect((await conversations.list(alice.id))[0].messages[0]).toMatchObject({ parts: [{ text: "Alice's synthetic question" }] });
    expect((await conversations.list(bob.id))[0].messages[0]).toMatchObject({ parts: [{ text: "Bob's synthetic question" }] });

    await conversations.remove(bob.id, sharedId);
    expect(await conversations.list(bob.id)).toEqual([]);
    expect((await conversations.list(alice.id))[0].messages[0]).toMatchObject({ parts: [{ text: "Alice's synthetic question" }] });
  });

  it("does not replace newer data with an out-of-order stale write", async () => {
    const newer = thread("t_ordered", 5_000, "Newer synthetic text");
    await conversations.put(alice.id, newer);
    await conversations.put(alice.id, thread(newer.id, 4_000, "Older synthetic text"));
    expect((await conversations.list(alice.id)).find((item) => item.id === newer.id)?.messages[0])
      .toMatchObject({ parts: [{ text: "Newer synthetic text" }] });
  });

  it("rejects system messages and deletes all data only for the requested owner", async () => {
    await conversations.enableAndImport(bob.id, [thread("t_bob_keep", 6_100, "Bob's retained synthetic chat")]);
    await expect(conversations.put(alice.id, {
      ...thread("t_system", 6_000, "synthetic"),
      messages: [{ id: "system", role: "system", parts: [{ type: "text", text: "unsafe" }] }],
    })).rejects.toMatchObject({ status: 400 });

    await conversations.remove(alice.id);
    expect(await conversations.list(alice.id)).toEqual([]);
    expect((await conversations.list(bob.id))[0].messages[0]).toMatchObject({ parts: [{ text: "Bob's retained synthetic chat" }] });
  });
});
