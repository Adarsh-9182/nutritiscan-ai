import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Component tests, kept in their own config.
 *
 * The main suite runs in `node` over `lib/**` and is fast because of it —
 * pulling a DOM into it would slow every pure-function test down for the
 * sake of a handful of files. This config is the one that boots jsdom, and
 * `npm run verify` runs both.
 */
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["components/**/*.test.tsx"],
    setupFiles: ["./vitest.ui.setup.ts"],
  },
});
