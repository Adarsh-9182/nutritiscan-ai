import postgres from "postgres";
import { mkdir, readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { workspaceSchema } from "./schema";

export interface Database {
  query<T>(sql: string, values?: unknown[]): Promise<T[]>;
  close(): Promise<void>;
}

export async function createLocalDatabase(path?: string): Promise<Database> {
  if (path) await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const { PGlite } = await import("@electric-sql/pglite");
  const instance = new PGlite(path);
  await instance.exec(workspaceSchema);
  const migrationsDir = join(process.cwd(), "migrations", "workspace");
  const migrations = (await readdir(migrationsDir))
    .filter((file) => file.endsWith(".sql"))
    .sort();
  for (const migration of migrations)
    await instance.exec(await readFile(join(migrationsDir, migration), "utf8"));
  return {
    query: async <T>(sql: string, values: unknown[] = []) =>
      (await instance.query<T>(sql, values)).rows,
    close: () => instance.close(),
  };
}

declare global {
  var nsWorkspaceDB: Promise<Database> | undefined;
}

export function database(): Promise<Database> {
  if (!global.nsWorkspaceDB) {
    global.nsWorkspaceDB = (async () => {
      if (process.env.DATABASE_URL) {
        const client = postgres(process.env.DATABASE_URL, {
          max: 3,
          idle_timeout: 20,
          connect_timeout: 10,
          prepare: false,
          ssl:
            process.env.DATABASE_SSL === "disable" &&
            process.env.NODE_ENV !== "production"
              ? false
              : "verify-full",
        });
        // Production schema is installed by the explicit migration command.
        return {
          query: async <T>(sql: string, values: unknown[] = []) =>
            (await client.unsafe(sql, values as never[])) as unknown as T[],
          close: () => client.end({ timeout: 5 }),
        };
      }
      if (process.env.NODE_ENV === "production")
        throw new Error("DATABASE_URL is required");
      return createLocalDatabase(`${process.cwd()}/.local/workspace`);
    })().catch((error) => {
      global.nsWorkspaceDB = undefined;
      throw error;
    });
  }
  return global.nsWorkspaceDB;
}
