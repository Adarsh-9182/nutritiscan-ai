import { spawnSync } from "node:child_process";

// Hosting builds use NODE_ENV=production. React's act() exists only in the
// development/test bundle. Never let isolated tests inherit live credentials.
const env = { ...process.env, NODE_ENV: "test" };
for (const key of Object.keys(env)) {
  if (/^(DATABASE_|POSTGRES_|PGHOST|PGUSER|PGPASSWORD|PGDATABASE|HEALTH_|APP_ORIGIN$|GOOGLE_GENERATIVE_AI_|AI_GATEWAY_|VERCEL_OIDC_|NCBI_)/.test(key)) delete env[key];
}
const result = spawnSync(process.execPath, [
  new URL("../node_modules/vitest/vitest.mjs", import.meta.url).pathname,
  ...process.argv.slice(2),
], { stdio: "inherit", env });
if (result.error) console.error("Could not start test runner:", result.error.message);
process.exit(result.status ?? 1);
