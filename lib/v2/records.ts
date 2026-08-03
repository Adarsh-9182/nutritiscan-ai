// ============================================================
// MEDICAL RECORDS — AN INTELLIGENT TIMELINE
//
// "Never make users organize folders. The AI should organize
// everything."
//
// The design consequence of that line is the `did` field. Every
// record states what the app ALREADY DID with it —
// "summarised", "compared automatically", "38 markers matched".
// That is the difference between a folder and an assistant: a
// folder holds your file, an assistant tells you it read it.
//
// There is no folder type, no tag editor, and no "move to"
// action anywhere in this module, on purpose. Organisation is
// derived (by kind, by year, by search) and never authored.
// ============================================================

export type RecordKind = "lab" | "prescription" | "vaccine" | "imaging" | "note";

export type MedicalRecord = {
  id: string;
  kind: RecordKind;
  title: string;
  date: string; // ISO
  /**
   * What the system did with this document, unprompted. Shown on
   * every row. If a record has nothing here, we failed it.
   */
  did: string;
  /** Where tapping it goes. */
  href?: string;
  /** Extra facts surfaced in search results. */
  keywords?: string[];
};

export const RECORD_LABEL: Record<RecordKind, string> = {
  lab: "Labs",
  prescription: "Prescriptions",
  vaccine: "Vaccines",
  imaging: "Imaging",
  note: "Notes",
};

export const RECORDS: MedicalRecord[] = [
  {
    id: "rec-panel-jul",
    kind: "lab",
    title: "Full blood panel",
    date: "2026-07-12",
    did: "38 markers · summarised · compared to March",
    href: "/labs/panel-2026-07",
    keywords: ["ferritin", "ldl", "cholesterol", "iron", "thyroid", "hba1c", "cbc"],
  },
  {
    id: "rec-ferrous",
    kind: "prescription",
    title: "Ferrous fumarate 210 mg",
    date: "2026-07-14",
    did: "Dr. Sethi · 3 months · interactions checked against your items",
    href: "/medicine/ferrous-fumarate-210",
    keywords: ["iron", "supplement", "tablet"],
  },
  {
    id: "rec-flu",
    kind: "vaccine",
    title: "Influenza vaccine",
    date: "2026-02-03",
    did: "Next due Feb 2027 · reminder set",
    keywords: ["flu", "immunisation"],
  },
  {
    id: "rec-lipid-nov",
    kind: "lab",
    title: "Lipid profile",
    date: "2025-11-19",
    did: "Compared automatically · LDL trend started here",
    keywords: ["ldl", "hdl", "cholesterol", "triglycerides"],
  },
  {
    id: "rec-dental",
    kind: "imaging",
    title: "Dental X-ray",
    date: "2025-08-22",
    did: "Stored · no action needed",
    keywords: ["dental", "x-ray", "image"],
  },
  {
    id: "rec-panel-mar",
    kind: "lab",
    title: "Full blood panel",
    date: "2025-03-02",
    did: "36 markers · summarised · baseline for your trends",
    keywords: ["ferritin", "ldl", "baseline"],
  },
  {
    id: "rec-vitd",
    kind: "prescription",
    title: "Vitamin D3 1000 IU",
    date: "2024-11-08",
    did: "Completed course · still in your interaction checks",
    href: "/medicine/vitamin-d3-1000",
    keywords: ["vitamin d", "cholecalciferol"],
  },
];

export type RecordYear = { year: number; records: MedicalRecord[] };

/** Newest first, grouped by year — the only organisation the user gets, and the only one they need. */
export function groupByYear(records: MedicalRecord[]): RecordYear[] {
  const sorted = [...records].sort((a, b) => b.date.localeCompare(a.date));
  const years = new Map<number, MedicalRecord[]>();
  for (const r of sorted) {
    const y = new Date(r.date).getFullYear();
    if (!years.has(y)) years.set(y, []);
    years.get(y)!.push(r);
  }
  return [...years.entries()].map(([year, recs]) => ({ year, records: recs }));
}

/**
 * Search across the title, what we did with it, and the contents
 * we extracted.
 *
 * Searching `did` and `keywords` — not just the title — is what
 * makes "ferritin" find a document called "Full blood panel".
 * Title-only search would push the user straight back into
 * remembering their own filing.
 */
export function searchRecords(records: MedicalRecord[], query: string, kind?: RecordKind): MedicalRecord[] {
  const q = query.trim().toLowerCase();
  return records.filter((r) => {
    if (kind && r.kind !== kind) return false;
    if (!q) return true;
    return (
      r.title.toLowerCase().includes(q) ||
      r.did.toLowerCase().includes(q) ||
      (r.keywords ?? []).some((k) => k.includes(q))
    );
  });
}

export const formatRecordDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

export const formatLongDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
