import { describe, expect, it } from "vitest";
import { DEMO } from "./demo";
import { changesText, markerHistory, visitQuestions } from "./longitudinal";
import { recordAnswer } from "./record-tools";

describe("longitudinal record integrity", () => {
  it("sorts by report date and compares values without interpreting clinical direction", () => {
    const history = markerHistory([...DEMO.reports].reverse()).find(h => h.name === "Vitamin B12")!;
    expect(history.comparison?.delta).toBe(27);
    expect(history.comparison?.latest.date).toBe("2026-09-10");
    expect(changesText(DEMO)).toContain("not an assessment of improvement");
  });
  it("never merges different or differently cased unit symbols", () => {
    const w = structuredClone(DEMO);
    w.reports[1].observations[0].unit = "PG/mL";
    expect(markerHistory(w.reports).filter(h => h.name === "Vitamin B12")).toHaveLength(2);
    w.reports[1].observations[0].unit = "pmol/L";
    expect(markerHistory(w.reports).filter(h => h.name === "Vitamin B12").every(h => h.comparison === null)).toBe(true);
  });
  it.each(["lab", "range", "duplicate", "missing lab"])("suppresses arithmetic across %s ambiguity", kind => {
    const w = structuredClone(DEMO);
    if (kind === "lab") w.reports[1].lab = "Different lab";
    if (kind === "missing lab") w.reports[1].lab = "";
    if (kind === "range") w.reports[1].observations[0].low = 180;
    if (kind === "duplicate") w.reports[1].date = w.reports[0].date;
    const h = markerHistory(w.reports).find(h => h.name === "Vitamin B12")!;
    expect(h.comparison).toBeNull();
    expect(h.caution).toBeTruthy();
  });
  it("generates questions only from the latest report and identifies missing ranges", () => {
    const w = structuredClone(DEMO);
    w.reports[0].observations[0].low = null;
    const questions = visitQuestions(w);
    expect(questions.some(q => q.text.includes("Vitamin D"))).toBe(true);
    expect(questions.some(q => q.text.includes("reference range applies to my Vitamin B12"))).toBe(true);
    expect(questions.some(q => q.text.includes("Glucose"))).toBe(false);
    expect(questions.every(q => !q.reportId || q.reportId === "demo-september")).toBe(true);
  });
  it("has useful empty states without invented data", () => {
    const w = { ...DEMO, reports: [] };
    expect(markerHistory([])).toEqual([]);
    expect(changesText(w)).toContain("Add a report");
    expect(visitQuestions(w).every(q => !q.reportId)).toBe(true);
  });
});

describe("shared assistant tools", () => {
  it("routes comparisons before the broad report keyword", () => {
    expect(recordAnswer("Compare my reports over time", DEMO)?.text).toContain("Recorded change: +27 pg/mL");
  });
  it("grounds visit questions in records rather than returning the report summary", () => {
    const answer = recordAnswer("What questions should I ask my doctor about my report?", DEMO);
    expect(answer?.text).toContain("What does my Vitamin D result mean");
  });
  it("prioritises escalation over every records tool", () => {
    expect(recordAnswer("Compare my reports, I have crushing chest pain and cannot breathe", DEMO)?.mode).toBe("escalation");
  });
});
