// ============================================================
// LABS EVAL
//
// Two halves, deliberately:
//
//   gate(...)      What lib/memory/labs.ts genuinely does today —
//                  extraction, and classification against OUR documented
//                  default ranges.
//
//   advisory(...)  Spec §15 — "Reference ranges can differ between
//                  laboratories. Never assume a universal reference range."
//                  The current parser assumes universal ranges and has no
//                  unit handling at all. These advisories are the executable
//                  record of that gap (docs/ARCHITECTURE.md §3.6), and they
//                  are expected to FAIL until Phase 6 lands.
//
// An advisory that starts passing is the signal to promote it to a gate.
// ============================================================

import { expect } from "vitest";
import { advisory, evalSuite, gate } from "./harness";
import { mergeBiomarkers, parseLabReport } from "../lib/memory/labs";

const parse = (s: string) => parseLabReport(s);
const marker = (s: string, name: string) => parse(s).find((b) => b.name === name);

evalSuite("labs: extraction", () => {
  gate("extracts a value from a typical panel line", () => {
    expect(marker("Vitamin B12 : 180 pg/mL", "Vitamin B12")?.value).toBe("180 pg/mL");
  });

  gate("extracts several markers from one report", () => {
    const text = `
      Haemoglobin      14.6 g/dL
      Vitamin B12      180 pg/mL
      TSH              5.2 mIU/L
      Fasting glucose  88 mg/dL
    `;
    const names = parse(text).map((b) => b.name);
    expect(names).toEqual(expect.arrayContaining(["Hemoglobin", "Vitamin B12", "TSH", "Fasting glucose"]));
  });

  gate("invents nothing when a marker is absent", () => {
    expect(marker("Haemoglobin 14.6 g/dL", "Vitamin B12")).toBeUndefined();
  });

  gate("returns nothing for text with no recognisable markers", () => {
    expect(parse("Patient advised to return in six weeks.")).toEqual([]);
  });

  gate("merging replaces by name and keeps everything else", () => {
    const existing = [
      { name: "Vitamin B12", value: "152 pg/mL", status: "low" as const },
      { name: "Hemoglobin", value: "14.6 g/dL", status: "normal" as const },
    ];
    const merged = mergeBiomarkers(existing, [{ name: "Vitamin B12", value: "180 pg/mL", status: "low" as const }]);
    expect(merged).toHaveLength(2);
    expect(merged.find((b) => b.name === "Vitamin B12")?.value).toBe("180 pg/mL");
    expect(merged.find((b) => b.name === "Hemoglobin")?.value).toBe("14.6 g/dL");
  });
});

evalSuite("labs: classification against documented defaults", () => {
  gate("B12 below the documented 200–900 default is flagged low", () => {
    expect(marker("B12 152", "Vitamin B12")?.status).toBe("low");
  });

  gate("fasting glucose in 100–125 is flagged borderline, not normal", () => {
    expect(marker("Fasting glucose 112 mg/dL", "Fasting glucose")?.status).toBe("borderline");
  });

  gate("TSH above the documented default carries a see-a-clinician note", () => {
    expect(marker("TSH 6.1", "TSH")?.note).toMatch(/clinician/i);
  });

  gate("a normal value is not given a note it does not need", () => {
    expect(marker("Fasting glucose 88 mg/dL", "Fasting glucose")?.note).toBeUndefined();
  });
});

evalSuite("labs: spec §15 — per-report reference ranges", () => {
  advisory(
    "uses the range printed on the report rather than a system default",
    () => {
      // A lab whose own stated B12 range starts at 150. 180 is NORMAL there,
      // but the current parser calls it low against our hardcoded 200.
      const text = "Vitamin B12   180 pg/mL   (Reference: 150 - 950)";
      const b12 = parse(text).find((b) => b.name === "Vitamin B12");
      expect(b12?.status).toBe("normal");
    },
    "Phase 6 — DATA.md §4",
  );

  advisory(
    "records where the reference range came from",
    () => {
      const b12 = parse("Vitamin B12 180 pg/mL (Reference: 150 - 950)")[0] as unknown as {
        referenceSource?: string;
      };
      expect(b12.referenceSource).toBe("report");
    },
    "Phase 6 — DATA.md §4 rule 1",
  );

  advisory(
    "labels a system-supplied range as such, so the UI can say so",
    () => {
      const b12 = parse("Vitamin B12 180 pg/mL")[0] as unknown as { referenceSource?: string };
      expect(b12.referenceSource).toBe("system_default");
    },
    "Phase 6 — DATA.md §4 rule 1",
  );
});

evalSuite("labs: unit handling", () => {
  /**
   * The failure this guards is directional and therefore dangerous: 180
   * pmol/L is a NORMAL B12, but read as pg/mL it lands under the 200 floor
   * and the product tells a healthy person they are deficient.
   */
  advisory(
    "does not read a pmol/L value as pg/mL",
    () => {
      const b12 = marker("Vitamin B12   180 pmol/L", "Vitamin B12");
      expect(b12?.value).toContain("pmol/L");
    },
    "Phase 6 — DATA.md §4 rule 2",
  );

  advisory(
    "leaves the SI value unset rather than guessing a conversion",
    () => {
      const b12 = parse("Vitamin B12 180 pmol/L")[0] as unknown as { valueSi?: number | null };
      expect(b12.valueSi ?? null).toBeNull();
    },
    "Phase 6 — DATA.md §4 rule 2",
  );

  advisory(
    "does not classify a value whose unit it could not identify",
    () => {
      const b12 = marker("Vitamin B12 180 pmol/L", "Vitamin B12");
      expect(b12?.status).toBe("unknown");
    },
    "Phase 6 — unknown beats wrong",
  );
});

evalSuite("labs: critical values feed triage", () => {
  advisory(
    "a critical result is flagged for the safety layer, not just for display",
    () => {
      // docs/DATA.md §4 rule 4 and SAFETY.md §2.4: a critical lab is a triage
      // input. Nothing wires lab results into triage today.
      const glucose = parse("Fasting glucose 480 mg/dL")[0] as unknown as { flag?: string };
      expect(glucose.flag).toBe("critical");
    },
    "Phase 6 — SAFETY.md §2.4",
  );
});
