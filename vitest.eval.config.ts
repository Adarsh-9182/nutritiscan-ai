import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Evaluation runs are separate from `npm test` on purpose.
 *
 * Unit tests answer "does this code do what it says". Evals answer "does
 * this system behave safely and correctly on clinical input" — a different
 * question, a different failure mode, and a different gate. Mixing them
 * would let a red eval read as a broken build rather than a safety signal,
 * and would make the advisory/gating split (evals/harness.ts) meaningless.
 *
 * See docs/EVALUATION.md.
 */
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["evals/**/*.eval.ts"],
    // Evals report a great deal of intentional advisory output; the default
    // reporter keeps it readable alongside the pass/fail line.
    reporters: ["default"],
  },
});
