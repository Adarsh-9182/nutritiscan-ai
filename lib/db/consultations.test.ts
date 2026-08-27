import { afterEach, describe, expect, it, vi } from "vitest";
import { ensureAnonymousPatient, recordAssessment, startConsultation } from "./consultations";
import { emptyState } from "../clinical/state";

/*
 * These cover the behaviour that matters without a database in front of
 * them: what happens when there is none, and what happens when a write
 * fails. Both are the normal state today — persistence is arriving after
 * the product shipped — and both must leave the patient's answer untouched.
 *
 * The SQL itself is not exercised here; that belongs in a test with a real
 * Postgres, and pretending otherwise with a mock would only assert that the
 * mock matches the code.
 */

const state = emptyState("c-1", 1, "fever since yesterday");

afterEach(() => {
  delete process.env.DATABASE_URL;
  vi.restoreAllMocks();
});

describe("without a database", () => {
  it("resolves a patient to null rather than throwing", async () => {
    await expect(ensureAnonymousPatient("browser-key")).resolves.toBeNull();
  });

  it("starts no consultation and does not throw", async () => {
    await expect(startConsultation("p-1", "Fever")).resolves.toBeNull();
  });

  it("records no assessment and does not throw", async () => {
    await expect(
      recordAssessment({
        consultationId: "c-1",
        state,
        validation: null,
        specialists: ["doctor"],
        modelId: "google/gemini-3.5-flash-lite",
        promptVersion: "1",
        latencyMs: 8200,
        outcome: { kind: "answered", text: "…" },
      }),
    ).resolves.toBeNull();
  });

  it("says nothing in the logs — an absent database is not an error", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await ensureAnonymousPatient("k");
    await startConsultation("p-1", null);
    expect(err).not.toHaveBeenCalled();
  });
});

describe("an empty anon key", () => {
  it("is refused rather than creating an unreachable row", async () => {
    process.env.DATABASE_URL = "postgres://unused";
    await expect(ensureAnonymousPatient("   ")).resolves.toBeNull();
  });
});
