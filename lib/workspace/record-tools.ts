import type { AssistantAnswer } from "./assistant";
import { changesText, visitQuestions } from "./longitudinal";
import { rangeStatus, statusLabel, type Workspace } from "./types";
import { escalation } from "./escalation";
import { logAnswer } from "./daily";
import { nextStepsAnswer } from "./actions";

export const LAB_SOURCE = {
  id: "lab",
  title: "Understanding your lab test results",
  url: "https://medlineplus.gov/lab-tests/how-to-understand-your-lab-results/",
  text: "Reference ranges can differ between laboratories. A result outside a reference range does not by itself establish a diagnosis, and a result within range does not rule out illness.",
};

/** Shared by the signed-in assistant and fictional demo; no provider or secrets. */
export function recordAnswer(
  question: string,
  workspace: Workspace,
): AssistantAnswer | undefined {
  const urgent = escalation(question, workspace.profile);
  if (urgent) return urgent;
  // Enforce access at the shared tool boundary for browser and server callers.
  workspace = {
    ...workspace,
    reports: workspace.reports.filter((r) => r.assistantAccess !== false),
  };
  if (
    /(?:\b(trend|trends|compare|comparison|changed|changes|history)\b|over time).*(?:report|result|record|lab|value)|(?:report|result|record|lab|value).*\b(trend|trends|compare|comparison|changed|changes|history)\b/i.test(
      question,
    )
  )
    return {
      text: changesText(workspace),
      mode: "record-summary",
      sources: [LAB_SOURCE],
    };
  if (
    /(?:prepare|plan|questions?|summary).*(?:appointment|doctor|visit|डॉक्टर)|(?:appointment|doctor|visit).*(?:prepare|questions?|summary)/i.test(
      question,
    )
  )
    return {
      text: [
        "Questions prepared from your confirmed records",
        "",
        ...visitQuestions(workspace).map(
          (q, i) => `${i + 1}. ${q.text}\n   ${q.reason}`,
        ),
        "",
        "Open Visit preparation to choose your questions, add your own notes and download a summary. Questions are suggestions for discussion, not a treatment plan.",
      ].join("\n"),
      mode: "record-summary",
      sources: [],
    };
  if (
    /(?:my|saved|latest|summarise|summarize|मेरी).*(?:report|result|record|रिपोर्ट)|summar.*report/i.test(
      question,
    )
  ) {
    const report = [...workspace.reports].sort((a, b) =>
      b.date.localeCompare(a.date),
    )[0];
    return {
      text: report
        ? [
            `Here is your latest confirmed report: ${report.title} (${report.date}).`,
            "",
            ...report.observations.map(
              (o) =>
                `${o.name}: ${o.value} ${o.unit} — ${statusLabel[rangeStatus(o)]}.`,
            ),
            "",
            "These comparisons use only the ranges you confirmed from this report. They do not establish a diagnosis or rule out illness. A clinician can interpret them alongside your symptoms, history and medicines.",
            "",
            "Next: compare your recorded results over time, or prepare questions for your doctor.",
          ].join("\n")
        : "No confirmed reports are available to the companion. Add a report in My records or enable a saved report in Sources & access. I will not fill in missing results.",
      mode: "record-summary",
      sources: report ? [LAB_SOURCE] : [],
    };
  }
  return nextStepsAnswer(question, workspace) ?? logAnswer(question, workspace);
}
