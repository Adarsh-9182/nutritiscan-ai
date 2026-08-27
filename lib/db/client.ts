// ============================================================
// DATABASE CLIENT
//
// One connection per process, created lazily. Next.js reloads modules in
// development, so a module-level connection would leak a pool per edit —
// hence the global cache, which is the standard shape for this and not a
// clever trick.
//
// Everything here assumes the database may simply not exist. Persistence is
// arriving after the product shipped, so a missing DATABASE_URL is a normal
// state, not a crash: the app keeps working on localStorage and the write
// paths become no-ops. `isConfigured()` is how callers ask.
// ============================================================

import postgres from "postgres";

type Sql = ReturnType<typeof postgres>;

declare global {
  var __nutritiscanSql: Sql | undefined;
}

export function isConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/**
 * The connection, or null when none is configured.
 *
 * Returning null rather than throwing is deliberate: every call site has to
 * decide what to do without a database, and a thrown error would let that
 * decision be skipped by accident in the one place it matters.
 */
export function db(): Sql | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;

  if (!global.__nutritiscanSql) {
    global.__nutritiscanSql = postgres(url, {
      // Supabase's pooler terminates idle connections; keeping the pool small
      // and the idle timeout short avoids handing out a socket the server has
      // already closed.
      max: 5,
      idle_timeout: 20,
      connect_timeout: 10,
      // Health data over the public internet is not negotiable.
      ssl: "require",
      // Interval and numeric types arrive as strings unless asked otherwise;
      // leaving them as strings is safer than a silent lossy cast to Number.
      transform: { undefined: null },
    });
  }
  return global.__nutritiscanSql;
}

/** Closes the pool. For scripts and tests — the server holds its own. */
export async function closeDb(): Promise<void> {
  if (global.__nutritiscanSql) {
    await global.__nutritiscanSql.end({ timeout: 5 });
    global.__nutritiscanSql = undefined;
  }
}
