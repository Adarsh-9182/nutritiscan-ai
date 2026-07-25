// ============================================================
// HEALTH JOURNAL
// Dated, append-only entries — the spine of the patient timeline.
//
// Everything here is something that actually happened: a lab value
// was recorded, a weight changed, a goal was set. Nothing is
// inferred and nothing is back-dated, because a timeline that
// invents history is worse than no timeline at all.
// ============================================================

export type JournalKind = "lab" | "body" | "goal" | "milestone" | "symptom" | "medicine";

export type JournalEntry = {
  id: string;
  /** ISO timestamp of when this was true, not when it was typed */
  at: string;
  kind: JournalKind;
  title: string;
  detail?: string;
  tone?: "good" | "warn" | "bad" | "neutral";
  /** structured value, so trends are computed rather than parsed out of prose */
  metric?: { name: string; value: number; unit: string };
};

let seq = 0;
export function journalEntry(e: Omit<JournalEntry, "id" | "at"> & { at?: string }): JournalEntry {
  seq += 1;
  return {
    id: `j-${Date.now().toString(36)}-${seq.toString(36)}`,
    at: e.at ?? new Date().toISOString(),
    kind: e.kind,
    title: e.title,
    detail: e.detail,
    tone: e.tone ?? "neutral",
    metric: e.metric,
  };
}

/** Newest first, and defensive about entries that lost their timestamp. */
export function sortJournal(entries: JournalEntry[]): JournalEntry[] {
  return [...entries].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

/**
 * Seed history for the demo profile only. Cleared the moment a real person
 * finishes onboarding — their timeline starts on their first real day, not
 * with somebody else's borrowed past.
 */
export const demoJournal: JournalEntry[] = [
  { id: "j-seed-1", at: daysAgo(214), kind: "milestone", title: "Started tracking with NutritiScan", tone: "neutral" },
  { id: "j-seed-2", at: daysAgo(198), kind: "lab", title: "Vitamin B12 recorded at 152 pg/mL", detail: "Below the 200–900 reference range.", tone: "bad", metric: { name: "Vitamin B12", value: 152, unit: "pg/mL" } },
  { id: "j-seed-3", at: daysAgo(190), kind: "goal", title: "Goal set: build muscle", detail: "Protein target moved to 1.8 g/kg.", tone: "neutral" },
  { id: "j-seed-4", at: daysAgo(150), kind: "body", title: "Weight 61 kg", tone: "neutral", metric: { name: "Weight", value: 61, unit: "kg" } },
  { id: "j-seed-5", at: daysAgo(96), kind: "lab", title: "Vitamin D recorded at 21 ng/mL", detail: "Low. Aim for 40–60.", tone: "warn", metric: { name: "Vitamin D", value: 21, unit: "ng/mL" } },
  { id: "j-seed-6", at: daysAgo(64), kind: "milestone", title: "Training reached 5 days a week", tone: "good" },
  { id: "j-seed-7", at: daysAgo(38), kind: "lab", title: "Vitamin B12 improved to 180 pg/mL", detail: "Up 28 points, still under range.", tone: "warn", metric: { name: "Vitamin B12", value: 180, unit: "pg/mL" } },
  { id: "j-seed-8", at: daysAgo(31), kind: "body", title: "Weight 65 kg", detail: "+4 kg over five months.", tone: "good", metric: { name: "Weight", value: 65, unit: "kg" } },
  { id: "j-seed-9", at: daysAgo(12), kind: "lab", title: "Vitamin D improved to 34 ng/mL", detail: "Up 13 points, approaching range.", tone: "good", metric: { name: "Vitamin D", value: 34, unit: "ng/mL" } },
];
