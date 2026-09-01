import { describe, expect, it } from "vitest";
import { followUps } from "./followups";
import { demoProfile, blankProfile } from "@/lib/memory/profile";

describe("followUps", () => {
  it("offers three, because a row of suggestions is an offer and six is a menu", () => {
    expect(followUps("nutrition", blankProfile)).toHaveLength(3);
  });

  it("asks about the reader's own marker before anything generic", () => {
    // demoProfile carries a low B12 — a suggestion naming it is the whole
    // difference between a prompt library and something that read the file.
    const [first] = followUps("lab", demoProfile);
    expect(first.toLowerCase()).toContain("b12");
  });

  it("stays generic when the profile has nothing specific to say", () => {
    for (const q of followUps("lab", blankProfile)) {
      expect(q.toLowerCase()).not.toContain("b12");
    }
  });

  it("never repeats something already asked in this conversation", () => {
    const asked = followUps("fitness", blankProfile);
    const next = followUps("fitness", blankProfile, asked);
    expect(next.some((q) => asked.includes(q))).toBe(false);
  });

  it("ignores case and padding when matching what was already asked", () => {
    const [q] = followUps("coach", blankProfile);
    expect(followUps("coach", blankProfile, [`  ${q.toUpperCase()} `])).not.toContain(q);
  });

  it("returns something for every route the router can produce", () => {
    for (const route of ["doctor", "nutrition", "fitness", "lab", "coach", "supervisor"] as const) {
      expect(followUps(route, demoProfile).length).toBeGreaterThan(0);
    }
  });

  it("suggests nothing that implies acting on medicine without a clinician", () => {
    // Suggestions carry the authority of the interface: a question the
    // product puts in your mouth reads as one it thinks is safe to act on.
    const all = (["doctor", "nutrition", "fitness", "lab", "coach", "supervisor"] as const).flatMap((r) =>
      followUps(r, demoProfile, [], 99),
    );
    for (const q of all) {
      expect(q.toLowerCase()).not.toMatch(/\b(stop|skip|double|increase|reduce) (my |the )?(medicine|medication|dose|tablet)/);
    }
  });

  it("degrades to fewer rather than repeating when the pool runs out", () => {
    const all = followUps("supervisor", blankProfile, [], 99);
    const again = followUps("supervisor", blankProfile, all);
    expect(again).toEqual([]);
  });
});
