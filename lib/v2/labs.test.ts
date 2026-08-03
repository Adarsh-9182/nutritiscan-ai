import { describe, expect, it } from "vitest";
import {
  JULY_PANEL,
  axisPosition,
  comfortBand,
  positionPhrase,
  delta,
  steadyCount,
  calmGroups,
  attentionMarkers,
} from "./labs";

/**
 * The lab panel is the product's most load-bearing data, and the
 * screen built on it makes claims in words ("36 of 38 markers are
 * where they should be"). These tests exist so a marker added or
 * removed can never silently make that sentence false.
 */
describe("the July panel", () => {
  it("holds exactly the 38 markers the summary claims", () => {
    const { steady, total } = steadyCount(JULY_PANEL);
    expect(total).toBe(38);
    expect(steady).toBe(36);
  });

  it("flags exactly the two markers the whole narrative hangs off", () => {
    expect(attentionMarkers(JULY_PANEL).map((m) => m.id).sort()).toEqual(["ferritin", "ldl"]);
  });

  /**
   * Every number gets a sentence — the one rule this product
   * cannot break. A marker with no `plain` read is a bare number
   * on a screen built to never show one.
   */
  it("gives every marker a plain-language sentence", () => {
    for (const m of JULY_PANEL.markers) {
      expect(m.plain.trim().length, `${m.id} has no plain read`).toBeGreaterThan(0);
    }
  });

  it("keeps every value inside the axis it is drawn on", () => {
    for (const m of JULY_PANEL.markers) {
      const pos = axisPosition(m);
      expect(pos, `${m.id} sits off its own axis`).toBeGreaterThanOrEqual(0);
      expect(pos).toBeLessThanOrEqual(1);
      const [start, width] = comfortBand(m);
      expect(start + width, `${m.id} comfortable band overflows the axis`).toBeLessThanOrEqual(1.0001);
    }
  });

  it("names the calm groups without naming a group that has a flagged marker", () => {
    const calm = calmGroups(JULY_PANEL);
    expect(calm).not.toContain("Iron studies"); // ferritin lives here
    expect(calm).not.toContain("Lipids"); // LDL lives here
    expect(calm).toContain("Thyroid");
  });
});

describe("derived reads", () => {
  it("phrases a bottom-of-range value as a position, not a score", () => {
    const ferritin = JULY_PANEL.markers.find((m) => m.id === "ferritin")!;
    expect(positionPhrase(ferritin)).toMatch(/^Bottom \d+% of range$/);
  });

  it("stays silent in the middle of the range rather than printing noise", () => {
    const tsh = JULY_PANEL.markers.find((m) => m.id === "tsh")!;
    expect(positionPhrase(tsh)).toBeNull();
  });

  it("reports the direction of travel against the previous panel", () => {
    const ferritin = JULY_PANEL.markers.find((m) => m.id === "ferritin")!;
    const move = delta(ferritin)!;
    expect(move.direction).toBe("down");
    expect(move.from).toBe(44);
  });

  it("returns no delta for a marker with no history to compare", () => {
    const tsh = JULY_PANEL.markers.find((m) => m.id === "tsh")!;
    expect(delta(tsh)).toBeNull();
  });
});
