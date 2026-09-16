import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createLocalDatabase, type Database } from "./database";
import { WorkspaceService } from "./service";
import { ProfileSchema, rangeStatus, summaryText } from "./types";
import { extractReport } from "./reports";
import { seal, unseal } from "./crypto";
import { answer } from "./assistant";
import { DEMO } from "./demo";

describe("report provenance and extraction", () => {
  it("preserves printed units and ranges instead of assigning universal values", () => {
    expect(extractReport("Vitamin B12 150 pmol/L 140–650")[0]).toEqual({
      name: "Vitamin B12",
      value: 150,
      unit: "pmol/L",
      low: 140,
      high: 650,
    });
    expect(
      rangeStatus(extractReport("Vitamin B12 150 pmol/L 140–650")[0]),
    ).toBe("within");
  });
  it("does not steal values from the next line or classify missing ranges", () => {
    expect(extractReport("TSH\n4.1 mIU/L")).toEqual([]);
    expect(extractReport("TSH 4.1")).toEqual([]);
    expect(rangeStatus(extractReport("TSH 4.1 mIU/L")[0])).toBe("unknown");
  });
  it("does not confuse HbA1c with hemoglobin or parse threshold-only results", () => {
    expect(extractReport("HbA1c 5.6 % 4.0–6.0").map((x) => x.name)).toEqual([
      "HbA1c",
    ]);
    expect(extractReport("TSH <0.01 mIU/L")).toEqual([]);
    expect(extractReport("Reference Vitamin B12 200 pg/mL 200–900")).toEqual(
      [],
    );
  });
  it("keeps decimal precision and rejects swapped ranges", () => {
    expect(extractReport("Hemoglobin 14.65 g/dL 13–17")[0].value).toBe(14.65);
    expect(extractReport("Glucose 5.2 mmol/L 7–4")[0].low).toBeNull();
  });
  it("export identifies the source of observations and does not invent allergies", () => {
    expect(summaryText(DEMO)).toContain("Not recorded (does not mean none)");
    expect(summaryText(DEMO)).toContain(
      "Not a diagnosis or clinician-verified record",
    );
  });
});

describe("real database account boundaries", () => {
  let db: Database, service: WorkspaceService;
  let alice: Awaited<ReturnType<WorkspaceService["register"]>>,
    bob: typeof alice;
  beforeAll(async () => {
    vi.stubEnv("HEALTH_DATA_KEY", "11".repeat(32));
    db = await createLocalDatabase();
    service = new WorkspaceService(db);
    alice = await service.register(
      "alice",
      "a-long-test-password",
      ProfileSchema.parse({ name: "Alice" }),
    );
    bob = await service.register(
      "bob",
      "another-long-password",
      ProfileSchema.parse({ name: "Bob" }),
    );
  }, 30000);
  afterAll(async () => {
    await db.close();
    vi.unstubAllEnvs();
  });
  it("starts new accounts empty, without importing a demo profile", async () => {
    expect((await service.workspace(alice.id)).reports).toEqual([]);
    expect((await service.workspace(bob.id)).profile.name).toBe("Bob");
  });
  it("hashes sessions and encrypts record payloads", async () => {
    const id = await service.save(alice.id, "report", DEMO.reports[0]);
    const rows = await db.query<{ payload: string }>(
      "SELECT payload FROM ns_records WHERE id=$1",
      [id],
    );
    expect(rows[0].payload).not.toContain("Vitamin");
    const sessions = await db.query<{ token_hash: string }>(
      "SELECT token_hash FROM ns_sessions",
    );
    expect(sessions.map((s) => s.token_hash)).not.toContain(alice.session);
    expect(
      (await service.workspace(alice.id)).reports[0].observations[0].value,
    ).toBe(245);
  });
  it("prevents another account from reading, editing or deleting a record", async () => {
    const record = (await service.workspace(alice.id)).reports[0];
    expect((await service.workspace(bob.id)).reports).toHaveLength(0);
    await expect(
      service.save(
        bob.id,
        "report",
        DEMO.reports[0],
        record.id,
        record.version,
      ),
    ).rejects.toMatchObject({ status: 409 });
    await expect(service.remove(bob.id, record.id)).rejects.toMatchObject({
      status: 404,
    });
  });
  it("rejects stale writes instead of silently losing a concurrent update", async () => {
    const id = await service.save(alice.id, "task", {
      title: "Appointment",
      date: "2026-09-20",
      done: false,
    });
    await service.save(
      alice.id,
      "task",
      { title: "Updated appointment", date: "2026-09-20", done: false },
      id,
      1,
    );
    await expect(
      service.save(
        alice.id,
        "task",
        { title: "Stale update", date: "2026-09-20", done: true },
        id,
        1,
      ),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("rejects a wrong password and enforces case-insensitive uniqueness", async () => {
    await expect(
      service.login("alice", "wrong-password-value"),
    ).rejects.toMatchObject({ status: 401 });
    await expect(
      service.register(
        "ALICE",
        "another-password",
        ProfileSchema.parse({ name: "Other" }),
      ),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("atomically consumes recovery keys and revokes all old sessions", async () => {
    const result = await service.recover(
      "alice",
      alice.recovery,
      "replacement-password",
    );
    expect(result.recovery).not.toBe(alice.recovery);
    await expect(service.authenticate(alice.session)).rejects.toMatchObject({
      status: 401,
    });
    await expect(
      service.recover("alice", alice.recovery, "replacement-password"),
    ).rejects.toMatchObject({ status: 401 });
    const login = await service.login("ALICE", "replacement-password");
    expect(await service.authenticate(login.session)).toBe(alice.id);
    await service.logout(login.session);
    await expect(service.authenticate(login.session)).rejects.toMatchObject({
      status: 401,
    });
  });
  it("applies shared rate limits in the database", async () => {
    await service.rate("test", 2);
    await service.rate("test", 2);
    await expect(
      new WorkspaceService(db).rate("test", 2),
    ).rejects.toMatchObject({ status: 429 });
  });
  it("requires the password to erase records, then cascades account deletion", async () => {
    await expect(
      service.deleteAccount(alice.id, "wrong-password"),
    ).rejects.toMatchObject({ status: 401 });
    await service.deleteAccount(alice.id, "replacement-password");
    expect(
      await db.query("SELECT id FROM ns_records WHERE user_id=$1", [alice.id]),
    ).toHaveLength(0);
    expect((await service.workspace(bob.id)).profile.name).toBe("Bob");
  });
  it("authenticates encrypted data against the owning account", async () => {
    const encrypted = await seal({ value: 4 }, "alice:record");
    await expect(unseal(encrypted, "bob:record")).rejects.toThrow();
  });
});

describe("assistant failure boundaries", () => {
  it("never calls a provider for a records summary", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    const result = await answer("Summarise my report", DEMO);
    expect(result.mode).toBe("record-summary");
    expect(result.text).toContain("245 pg/mL");
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockRestore();
  });
  it("does not pretend to generate an answer with no configured model", async () => {
    vi.stubEnv("HEALTH_MODEL_APPROVED", "false");
    expect((await answer("Tell me about digestion", DEMO)).mode).toBe(
      "unavailable",
    );
    vi.unstubAllEnvs();
  });
  it("halts emergency symptoms before summarising a requested report", async () => {
    const result = await answer(
      "I have crushing chest pain and cannot breathe. Summarise my report.",
      DEMO,
    );
    expect(result.mode).toBe("escalation");
    expect(result.text).not.toContain("245");
  });
});
