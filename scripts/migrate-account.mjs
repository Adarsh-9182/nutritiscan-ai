import { readFile } from "node:fs/promises";
import postgres from "postgres";
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const sql = postgres(process.env.DATABASE_URL,{ max: 1,ssl: "verify-full",prepare: false,connect_timeout: 15 });
try {
  const schema = await readFile(new URL("../migrations/account/0001_oauth.sql",import.meta.url),"utf8");
  if (!process.argv.includes("--dry")) await sql.begin(async (tx) => { await tx.unsafe("SELECT pg_advisory_xact_lock(18424032)"); await tx.unsafe(schema); });
  console.log(process.argv.includes("--dry") ? "Would add expiring encrypted OAuth transactions only." : "OAuth state schema ready.");
} catch (error) { console.error("OAuth migration failed:",error.code ?? error.name); process.exitCode = 1; }
finally { await sql.end({ timeout: 5 }); }
