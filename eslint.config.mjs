import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["desktop/src/preload.cjs"],
    // Electron's sandboxed preload entry uses its supported CommonJS bridge.
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "public/pdf.worker.min.mjs",
    "playwright-report/**",
    "test-results/**",
    "desktop/dist/**",
    "desktop/release/**",
    "desktop/test-results/**",
  ]),
]);

export default eslintConfig;
