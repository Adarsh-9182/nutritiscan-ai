import { readFile } from "node:fs/promises";
import postgres from "postgres";
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const sql = postgres(process.env.DATABASE_URL, { max: 1, ssl: "verify-full", prepare: false, connect_timeout: 15 });
try {
  const schema = await readFile(new URL("../migrations/billing/0001_subscriptions.sql", import.meta.url), "utf8");
  if (process.argv.includes("--dry")) console.log("Would add isolated ns_billing_* tables. Existing identity and health tables are not changed.");
  else await sql.begin(async (tx) => { await tx.unsafe("SELECT pg_advisory_xact_lock(18424031)"); await tx.unsafe(schema); });
  console.log(process.argv.includes("--dry") ? "Billing migration dry run complete." : "Billing schema ready.");
} catch (error) { console.error("Billing migration failed:", error.code ?? error.name); process.exitCode = 1; }
finally { await sql.end({ timeout: 5 }); }
