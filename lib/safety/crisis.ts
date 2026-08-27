// ============================================================
// CRISIS CONTACTS — CONFIGURATION, NOT GENERATION
//
// docs/SAFETY.md §3: "Crisis resources are configuration keyed to the
// deployment's jurisdiction, not a model's recollection of a phone number.
// A hallucinated helpline number is a uniquely bad failure."
//
// ┌──────────────────────────────────────────────────────────┐
// │ ACTION REQUIRED BEFORE LAUNCH                            │
// │                                                          │
// │ This registry is EMPTY on purpose. It must be filled in  │
// │ by a human who has verified each number against the      │
// │ operator's own published source, on the day they add it. │
// │                                                          │
// │ Do NOT populate this from a language model, from this    │
// │ file's git history, or from memory. A wrong number here  │
// │ is worse than no number: it sends someone in crisis to   │
// │ a dead line and costs them the attempt.                  │
// │                                                          │
// │ Until it is populated, `crisisBlock()` degrades to       │
// │ generic guidance that is always true. That degradation   │
// │ is intentional and safe.                                 │
// └──────────────────────────────────────────────────────────┘
// ============================================================

export type CrisisContact = {
  name: string;
  contact: string;
  hours?: string;
  languages?: string;
  /** Where this was verified and when. Required — see the box above. */
  verified: { source: string; on: string; by: string };
};

/**
 * Keyed by ISO 3166-1 alpha-2. The deployment's jurisdiction is set by
 * CRISIS_JURISDICTION; see docs/ARCHITECTURE.md §4.1, which flags the
 * regulatory target as an open decision.
 */
export const CRISIS_CONTACTS: Record<string, CrisisContact[]> = {
  // "IN": [ ... ]   ← populate per the box above
};

export const jurisdiction = (): string | null => process.env.CRISIS_JURISDICTION?.toUpperCase() ?? null;

export function contactsFor(region: string | null): CrisisContact[] {
  if (!region) return [];
  return CRISIS_CONTACTS[region] ?? [];
}

/**
 * The crisis-resources section of the mental-health response.
 *
 * Returns verified contacts when configured, and otherwise guidance that is
 * true everywhere: point at emergency services and at a person, without
 * inventing a specific number.
 */
export function crisisBlock(): string {
  const contacts = contactsFor(jurisdiction());

  if (!contacts.length) {
    return [
      "**If you are in immediate danger, call your local emergency number now.**",
      "",
      "If you can, tell someone who is physically near you — a family member, a friend, a neighbour — and ask them to stay with you.",
      "",
      "Most countries have a free, confidential crisis line staffed around the clock. Your local emergency number can connect you to one, and a search for a crisis or suicide helpline in your country will find it.",
    ].join("\n");
  }

  const lines = contacts.map((c) => {
    const extras = [c.hours, c.languages].filter(Boolean).join(" · ");
    return `- **${c.name}** — ${c.contact}${extras ? ` (${extras})` : ""}`;
  });

  return [
    "**If you are in immediate danger, call your local emergency number now.**",
    "",
    "You can also reach a trained person here, free and confidentially:",
    "",
    ...lines,
  ].join("\n");
}
