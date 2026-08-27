/**
 * Migration runner.
 *
 * Applies every unapplied file in migrations/, in filename order, each inside
 * its own transaction. Deliberately small — a health product's schema history
 * should be readable in one sitting, and a migration tool nobody understands
 * is a migration tool nobody trusts at 2am.
 *
 *   npm run migrate          apply everything outstanding
 *   npm run migrate -- --dry show what would run, touch nothing
 *
 * Two rules it enforces:
 *
 *   ONE AT A TIME, IN A TRANSACTION. A half-applied migration is worse than
 *   a failed one — it leaves a schema no file describes.
 *
 *   ALREADY-APPLIED FILES ARE NEVER RE-RUN, and their checksum is compared.
 *   Editing a migration that has already run in production is how two
 *   environments quietly stop matching; this refuses instead.
 */
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import postgres from "postgres";

// Connects directly rather than importing lib/db/client: that module caches a
// pool on `global` for the Next.js server, which is the wrong lifetime for a
// script that must open, migrate and close.
const DIR = join(process.cwd(), "migrations");

const sha = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);

async function main() {
  const dry = process.argv.includes("--dry");
  const url = process.env.DATABASE_URL;

  if (!url) {
    console.error("DATABASE_URL is not set. Nothing to migrate against.");
    process.exit(1);
  }

  const sql = postgres(url, { max: 1, ssl: "require", connect_timeout: 15 });
  const close = () => sql.end({ timeout: 5 });

  // The ledger is itself created outside the ledger — it has to exist before
  // anything can be recorded, and CREATE TABLE IF NOT EXISTS is idempotent.
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   text PRIMARY KEY,
      checksum   text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `;

  const files = (await readdir(DIR)).filter((f) => f.endsWith(".sql")).sort();
  const applied = await sql<{ filename: string; checksum: string }[]>`
    SELECT filename, checksum FROM schema_migrations
  `;
  const seen = new Map(applied.map((r) => [r.filename, r.checksum]));

  let ran = 0;

  for (const file of files) {
    const body = await readFile(join(DIR, file), "utf8");
    const sum = sha(body);
    const before = seen.get(file);

    if (before) {
      if (before !== sum) {
        console.error(
          `\n✗ ${file} has changed since it was applied (${before} → ${sum}).\n` +
            `  Migrations are immutable once run. Add a new file instead.\n`,
        );
        process.exit(1);
      }
      continue;
    }

    if (dry) {
      console.log(`would apply  ${file}`);
      ran++;
      continue;
    }

    process.stdout.write(`applying     ${file} … `);
    try {
      await sql.begin(async (tx) => {
        await tx.unsafe(body);
        await tx`INSERT INTO schema_migrations (filename, checksum) VALUES (${file}, ${sum})`;
      });
      console.log("ok");
      ran++;
    } catch (err) {
      console.log("failed");
      console.error(`\n${err instanceof Error ? err.message : String(err)}\n`);
      console.error("Rolled back. The schema is unchanged.");
      await close();
      process.exit(1);
    }
  }

  console.log(
    ran === 0
      ? "Schema is up to date."
      : dry
        ? `${ran} migration${ran === 1 ? "" : "s"} would run.`
        : `Applied ${ran} migration${ran === 1 ? "" : "s"}.`,
  );

  await close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
