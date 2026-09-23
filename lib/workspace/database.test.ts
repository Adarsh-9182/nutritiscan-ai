import { afterAll, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLocalDatabase } from "./database";

describe("local workspace database", () => {
  const temporary: string[] = [];
  afterAll(async () => {
    for (const path of temporary) await rm(path, { recursive: true, force: true });
  });

  it("starts when the private parent directory does not exist yet", async () => {
    const root = await mkdtemp(join(tmpdir(), "nutritiscan-db-test-"));
    temporary.push(root);
    const db = await createLocalDatabase(join(root, "private", "workspace"));
    try {
      const rows = await db.query<{ value: number }>("SELECT 1 AS value");
      expect(rows[0].value).toBe(1);
    } finally {
      await db.close();
    }
  });
});
