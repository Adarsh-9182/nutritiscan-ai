import { describe, expect, it } from "vitest";
import { picoFromTitle, recallAt, summarizeRecall } from "./recall";

describe("recallAt", () => {
  it("counts gold papers found within the first k", () => {
    expect(recallAt(["1", "2", "3", "4"], ["9", "1", "2", "8", "3"], 3)).toBe(0.25 + 0.25);
    expect(recallAt(["1", "2", "3", "4"], ["9", "1", "2", "8", "3"], 50)).toBe(0.75);
  });
  it("treats an empty gold set as fully recalled and an empty result as none", () => {
    expect(recallAt([], ["1"], 10)).toBe(1);
    expect(recallAt(["1"], [], 10)).toBe(0);
  });
});

describe("summarizeRecall", () => {
  it("averages per review and reports how often anything relevant was found", () => {
    expect(summarizeRecall([{ recall10: 1, recall50: 1, retrieved: 40 }, { recall10: 0, recall50: 0, retrieved: 0 }])).toEqual({ recall10: 0.5, recall50: 0.5, hitRate: 0.5, retrieved: 20 });
    expect(summarizeRecall([]).recall50).toBe(0);
  });
});

describe("picoFromTitle", () => {
  it("splits intervention and condition", () => {
    expect(picoFromTitle("Antibiotic regimens for early-onset neonatal sepsis")).toMatchObject({ intervention: ["Antibiotic regimens"], population: ["early-onset neonatal sepsis"], comparison: [] });
  });
  it("separates a comparator and ignores parentheses and subtitles", () => {
    expect(picoFromTitle("Intermittent phototherapy versus continuous phototherapy for neonatal jaundice")).toMatchObject({ intervention: ["Intermittent phototherapy"], comparison: ["continuous phototherapy"], population: ["neonatal jaundice"] });
    expect(picoFromTitle("The McKenzie method for (sub)acute non-specific low back pain: a review")?.population).toEqual(["acute non-specific low back pain"]);
  });
  it("returns null for a title with no 'for' or 'in'", () => expect(picoFromTitle("Machine perfusion")).toBeNull());
});
