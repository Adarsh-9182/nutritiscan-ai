// ============================================================
// PATIENT TIMELINE
// Merges every dated thing the system knows — journal entries and
// logged meals — into one chronological story, grouped for reading.
// ============================================================

import type { HealthProfile } from "../memory/profile";
import type { JournalEntry, JournalKind } from "../memory/journal";
import type { LoggedMeal } from "../memory/meals";

export type TimelineKind = JournalKind | "meal";

export type TimelineEvent = {
  id: string;
  at: string;
  kind: TimelineKind;
  title: string;
  detail?: string;
  tone: "good" | "warn" | "bad" | "neutral";
};

export const KIND_META: Record<TimelineKind, { glyph: string; label: string; color: string }> = {
  lab: { glyph: "🧪", label: "Lab", color: "var(--violet)" },
  meal: { glyph: "🍽️", label: "Meal", color: "var(--emerald)" },
  body: { glyph: "⚖️", label: "Body", color: "var(--cyan)" },
  goal: { glyph: "🎯", label: "Goal", color: "var(--amber)" },
  milestone: { glyph: "✦", label: "Milestone", color: "var(--blue)" },
  symptom: { glyph: "🩺", label: "Symptom", color: "var(--rose)" },
  medicine: { glyph: "💊", label: "Medicine", color: "var(--blue)" },
};

const mealTone = (fitScore: number): TimelineEvent["tone"] => (fitScore >= 80 ? "good" : fitScore >= 62 ? "neutral" : "warn");

export function buildTimeline(p: HealthProfile, meals: LoggedMeal[]): TimelineEvent[] {
  const fromJournal: TimelineEvent[] = (p.journal ?? []).map((e: JournalEntry) => ({
    id: e.id,
    at: e.at,
    kind: e.kind,
    title: e.title,
    detail: e.detail,
    tone: e.tone ?? "neutral",
  }));

  const fromMeals: TimelineEvent[] = meals.map((m) => ({
    id: m.id,
    at: m.at,
    kind: "meal" as const,
    title: m.title,
    detail: `${m.kcal} kcal · ${m.protein} g protein · fit ${m.fitScore}`,
    tone: mealTone(m.fitScore),
  }));

  return [...fromJournal, ...fromMeals].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

/** Group into "Today", "This week", then month-year buckets. */
export function groupTimeline(events: TimelineEvent[]): { label: string; events: TimelineEvent[] }[] {
  const now = new Date();
  const today = now.toDateString();
  const weekAgo = now.getTime() - 7 * 86_400_000;

  const groups = new Map<string, TimelineEvent[]>();
  const order: string[] = [];

  for (const e of events) {
    const d = new Date(e.at);
    const label =
      d.toDateString() === today
        ? "Today"
        : d.getTime() >= weekAgo
          ? "This week"
          : d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
    if (!groups.has(label)) {
      groups.set(label, []);
      order.push(label);
    }
    groups.get(label)!.push(e);
  }

  return order.map((label) => ({ label, events: groups.get(label)! }));
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days} d ago`;
  const months = Math.round(days / 30);
  return months < 12 ? `${months} mo ago` : `${Math.round(months / 12)} y ago`;
}
