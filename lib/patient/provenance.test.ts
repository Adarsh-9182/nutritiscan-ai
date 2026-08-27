import { describe, expect, it } from "vitest";
import {
  assertAsFact,
  describeSource,
  isAssertable,
  isClinicianVerified,
  isCurrent,
  isInferred,
  partitionByAssertability,
  type ClinicalFact,
  type FactSource,
} from "./provenance";

const fact = <T>(value: T, source: FactSource, patch: Partial<ClinicalFact<T>["provenance"]> = {}): ClinicalFact<T> => ({
  id: `f-${source}`,
  value,
  provenance: { source, recordedAt: "2026-08-27T00:00:00.000Z", ...patch },
});

describe("what may be stated as fact", () => {
  it("admits everything asserted by a person, document or device", () => {
    for (const s of ["patient_reported", "document_extracted", "device_measured", "clinician_verified"] as const) {
      expect(isAssertable(s)).toBe(true);
    }
  });

  it("excludes the system's own inference, and only that", () => {
    expect(isAssertable("model_inferred")).toBe(false);
    expect(isInferred("model_inferred")).toBe(true);
    expect(isInferred("patient_reported")).toBe(false);
  });

  it("treats clinician verification as the only trust upgrade", () => {
    expect(isClinicianVerified("clinician_verified")).toBe(true);
    expect(isClinicianVerified("document_extracted")).toBe(false);
  });
});

describe("assertAsFact", () => {
  it("returns the value for an asserted fact", () => {
    expect(assertAsFact(fact(180, "document_extracted"))).toBe(180);
  });

  it("throws rather than silently skipping an inference", () => {
    expect(() => assertAsFact(fact("low B12", "model_inferred"))).toThrow(/Inferences belong in Inference/);
  });

  it("throws on a superseded fact, so a correction cannot be stated as current", () => {
    const corrected = fact(180, "document_extracted", {
      supersededBy: "f-new",
      supersededAt: "2026-08-27T10:00:00.000Z",
    });
    expect(() => assertAsFact(corrected)).toThrow(/superseded/);
  });
});

describe("partition", () => {
  const facts = [
    fact("reported headache", "patient_reported"),
    fact("B12 180", "document_extracted"),
    fact("possible deficiency", "model_inferred"),
    fact("old value", "patient_reported", { supersededBy: "f-x", supersededAt: "2026-08-27T09:00:00.000Z" }),
  ];

  it("keeps inferences out of the assertable half", () => {
    const { assertable, inferred } = partitionByAssertability(facts);
    expect(assertable.map((f) => f.value)).toEqual(["reported headache", "B12 180"]);
    expect(inferred.map((f) => f.value)).toEqual(["possible deficiency"]);
  });

  it("excludes superseded rows from both halves — history is neither", () => {
    const { assertable, inferred } = partitionByAssertability(facts);
    const all = [...assertable, ...inferred].map((f) => f.value);
    expect(all).not.toContain("old value");
  });

  it("hands back both halves, so dropping the split has to be deliberate", () => {
    const result = partitionByAssertability(facts);
    expect(Object.keys(result).sort()).toEqual(["assertable", "inferred"]);
  });
});

describe("isCurrent", () => {
  it("is false once a correction supersedes the row", () => {
    expect(isCurrent(fact(1, "patient_reported"))).toBe(true);
    expect(isCurrent(fact(1, "patient_reported", { supersededBy: "f-2" }))).toBe(false);
  });
});

describe("describeSource", () => {
  it("does not let an inference borrow the authority of a report", () => {
    expect(describeSource("model_inferred")).toContain("not confirmed");
    expect(describeSource("patient_reported")).toBe("you told us");
    expect(describeSource("clinician_verified")).toContain("clinician");
  });
});
