// ============================================================
// C10 — live run against the real provider.
//
//   HEALTH_MODEL_BASE_URL=... HEALTH_MODEL_NAME=... HEALTH_MODEL_API_KEY=... \
//   HEALTH_MODEL_APPROVED=true npm run eval:companion
//
// The suite imports app modules through the `@/` alias, which plain node
// cannot resolve, so this script only checks configuration and then runs
// the same vitest suite with LIVE=1. It calls vitest directly rather than
// scripts/test-runner.mjs, because that runner strips HEALTH_* variables
// on purpose (CI must never reach a live model).
// ============================================================

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const required = ["HEALTH_MODEL_BASE_URL", "HEALTH_MODEL_NAME"];
const missing = required.filter((key) => !process.env[key]);
if (missing.length || process.env.HEALTH_MODEL_APPROVED !== "true") {
  console.error(
    `Live companion eval needs ${required.join(", ")} and HEALTH_MODEL_APPROVED=true.` +
      (missing.length ? ` Missing: ${missing.join(", ")}.` : ""),
  );
  process.exit(2);
}

const root = fileURLToPath(new URL("../../", import.meta.url));
const vitest = fileURLToPath(
  new URL("../../node_modules/vitest/vitest.mjs", import.meta.url),
);

const result = spawnSync(
  process.execPath,
  [
    vitest,
    "run",
    "--config",
    "vitest.eval.config.ts",
    "--testTimeout=120000",
    "evals/companion",
  ],
  {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, NODE_ENV: "test", LIVE: "1" },
  },
);
if (result.error) console.error("Could not start vitest:", result.error.message);
process.exit(result.status ?? 1);
