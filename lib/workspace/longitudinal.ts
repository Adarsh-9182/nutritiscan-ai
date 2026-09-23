import { rangeStatus, type Observation, type Saved, type Report, type Workspace } from "./types";

export type HistoryPoint = Observation & {
  reportId: string;
  title: string;
  date: string;
  lab: string;
};
export type MarkerHistory = {
  key: string;
  name: string;
  unit: string;
  points: HistoryPoint[];
  comparison: { previous: HistoryPoint; latest: HistoryPoint; delta: number } | null;
  caution: string | null;
};

const nameKey = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
// Unit symbols are case-sensitive. Never silently merge mg/dL with mmol/L,
// or infer that differently named assays measure the same thing.
export function markerHistory(reports: Saved<Report>[]): MarkerHistory[] {
  const groups = new Map<string, HistoryPoint[]>();
  for (const report of reports) {
    for (const o of report.observations) {
      const key = JSON.stringify([nameKey(o.name), o.unit.trim()]);
      const points = groups.get(key) ?? [];
      points.push({ ...o, reportId: report.id, title: report.title, date: report.date, lab: report.lab });
      groups.set(key, points);
    }
  }
  return [...groups].map(([key, input]) => {
    const points = [...input].sort((a, b) => a.date.localeCompare(b.date) || a.reportId.localeCompare(b.reportId));
    const latest = points.at(-1)!;
    const previous = points.filter(p => p.date < latest.date).at(-1);
    const repeatedDates = new Set(points.map(p => p.date)).size !== points.length;
    const changedLab = points.some(p => !p.lab.trim() || nameKey(p.lab) !== nameKey(latest.lab));
    const changedRange = points.some(p => p.low !== latest.low || p.high !== latest.high);
    const caution = repeatedDates
      ? "Multiple readings share a date. No single change is calculated. Open each source report to check the context."
      : changedLab || changedRange
        ? "The lab or reference range differs, or the lab is missing. These readings may not be comparable; no change is calculated."
        : null;
    return {
      key, name: latest.name, unit: latest.unit, points, caution,
      comparison: previous && !caution ? {
        previous, latest, delta: Number((latest.value - previous.value).toPrecision(10)),
      } : null,
    };
  }).sort((a, b) => a.name.localeCompare(b.name) || a.unit.localeCompare(b.unit));
}

export type VisitQuestion = { id: string; text: string; reason: string; reportId?: string };
export function visitQuestions(workspace: Workspace): VisitQuestion[] {
  const questions: VisitQuestion[] = [];
  const latest = [...workspace.reports].sort((a, b) => b.date.localeCompare(a.date))[0];
  if (latest) {
    for (const o of latest.observations) {
      const status = rangeStatus(o);
      if (status === "above" || status === "below") questions.push({
        id: `range:${latest.id}:${o.name}:${o.unit}`,
        text: `What does my ${o.name} result mean in the context of my health?`,
        reason: `${o.value} ${o.unit}; ${status} the range on ${latest.date}.`,
        reportId: latest.id,
      });
      if (status === "unknown") questions.push({
        id: `missing:${latest.id}:${o.name}:${o.unit}`,
        text: `Which reference range applies to my ${o.name} test?`,
        reason: "The confirmed record does not contain a complete reference range.",
        reportId: latest.id,
      });
    }
  }
  if (workspace.profile.medicines.trim()) questions.push({
    id: "medicines", text: "Could my medicines affect these results or the next steps?",
    reason: "You have recorded a medicine list. Bring the current list to your visit.",
  });
  questions.push({ id: "follow-up", text: "What follow-up do you recommend, and when?", reason: "Agree on next steps with your clinician." });
  questions.push({ id: "changes", text: "What changes should prompt me to seek help sooner?", reason: "Ask for advice specific to your situation." });
  return questions;
}

export function changesText(workspace: Workspace): string {
  const histories = markerHistory(workspace.reports);
  if (!histories.length) return "Add a report and confirm its values first. I will only compare records you have saved.";
  return [
    "Your recorded results over time",
    "", ...histories.map(h => {
      if (h.caution) return `${h.name} (${h.unit}): ${h.caution}`;
      if (!h.comparison) return `${h.name}: one dated reading (${h.points[0].value} ${h.unit}). Add an earlier or later report to see a change.`;
      const { previous, latest, delta } = h.comparison;
      return `${h.name}: ${previous.value} on ${previous.date} → ${latest.value} ${h.unit} on ${latest.date}. Recorded change: ${delta > 0 ? "+" : ""}${delta} ${h.unit}.`;
    }), "", "These are numerical changes, not an assessment of improvement or worsening. Matching labels and units do not guarantee the same testing method. Your clinician can check comparability.",
  ].join("\n");
}
