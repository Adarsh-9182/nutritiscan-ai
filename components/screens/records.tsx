"use client";

// ============================================================
// MEDICAL RECORDS
//
// "Never make users organize folders. The AI should organize
// everything."
//
// So there is no folder, no tag editor, no "move to". The only
// organisation is derived: by kind (the filter rail), by year
// (the grouping), and by content (the search).
//
// The detail that makes this an assistant rather than a drive:
// EVERY ROW SAYS WHAT THE APP ALREADY DID WITH THE DOCUMENT —
// "38 markers · summarised · compared to March". A file manager
// tells you a file exists. This tells you it was read.
//
// Search covers the extracted contents, not just filenames,
// which is why typing "ferritin" finds a document called "Full
// blood panel". Title-only search would push the user straight
// back into remembering their own filing — the exact job this
// screen exists to remove.
// ============================================================

import Link from "next/link";
import { useMemo, useState } from "react";
import { Card, Chip, Eyebrow } from "@/components/ds/primitives";
import { EmptyState } from "@/components/ds/states";
import { ChevronRight, DocIcon, ImageIcon, PillIcon, PlusIcon, SearchIcon, ShieldIcon } from "@/components/ds/icons";
import {
  RECORDS,
  RECORD_LABEL,
  formatRecordDate,
  groupByYear,
  searchRecords,
  type RecordKind,
} from "@/lib/v2/records";
import { cn } from "@/lib/cn";

const ICON: Record<RecordKind, typeof DocIcon> = {
  lab: DocIcon,
  prescription: PillIcon,
  vaccine: ShieldIcon,
  imaging: ImageIcon,
  note: DocIcon,
};

const KINDS: RecordKind[] = ["lab", "prescription", "vaccine", "imaging"];

export function RecordsScreen() {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<RecordKind | null>(null);

  const groups = useMemo(() => groupByYear(searchRecords(RECORDS, query, kind ?? undefined)), [query, kind]);
  const empty = groups.length === 0;

  return (
    <main id="main" className="app-scroll px-5">
      <header className="flex items-center justify-between pb-4 pt-[calc(var(--s-6)+var(--safe-t))]">
        <h1 className="t-h1 text-[var(--text)]">Records</h1>
        <Link
          href="/scan?mode=report"
          aria-label="Add a record"
          className="grid size-9 place-items-center rounded-full border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-2)] transition-colors hover:text-[var(--text)]"
        >
          <PlusIcon size={17} />
        </Link>
      </header>

      {/* Search first — it is the primary way in, not a filter of
          last resort. */}
      <div className="flex items-center gap-2.5 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 transition-colors focus-within:border-[var(--accent-line)]">
        <SearchIcon size={17} className="shrink-0 text-[var(--text-3)]" />
        <label htmlFor="record-search" className="sr-only">
          Search reports and prescriptions
        </label>
        <input
          id="record-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search reports, prescriptions"
          className="t-body min-w-0 flex-1 bg-transparent text-[var(--text)] outline-none placeholder:text-[var(--text-3)]"
        />
      </div>

      <div className="rail mt-3 py-1">
        <Chip selected={kind === null} tone="accent" onClick={() => setKind(null)}>
          All
        </Chip>
        {KINDS.map((k) => (
          <Chip key={k} selected={kind === k} tone="accent" onClick={() => setKind(kind === k ? null : k)}>
            {RECORD_LABEL[k]}
          </Chip>
        ))}
      </div>

      {empty ? (
        <EmptyState
          icon={<SearchIcon size={22} />}
          title={query ? `Nothing matches “${query}”` : "Nothing filed here yet"}
          body={
            query
              ? "Search looks inside your documents, not just their titles — so if it isn't here, it hasn't been added yet."
              : "Scan a report or a prescription and it appears here already summarised, already compared to what came before."
          }
          action={query ? { label: "Clear search", onClick: () => setQuery("") } : { label: "Scan a document", href: "/scan?mode=report" }}
        />
      ) : (
        groups.map((group) => (
          <section key={group.year} className="mt-6">
            <Eyebrow>{group.year}</Eyebrow>
            <Card className="mt-2 divide-y divide-[var(--border)]">
              {group.records.map((r) => {
                const Icon = ICON[r.kind];
                const body = (
                  <>
                    <span className="grid size-9 shrink-0 place-items-center rounded-[var(--r-sm)] border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-3)]">
                      <Icon size={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="t-body block truncate font-[560] text-[var(--text)]">{r.title}</span>
                      {/* What the app already did with it. */}
                      <span className="t-meta mt-0.5 block text-[var(--text-3)]">
                        {formatRecordDate(r.date)} · {r.did}
                      </span>
                    </span>
                    {r.href && <ChevronRight size={16} className="shrink-0 text-[var(--text-3)]" />}
                  </>
                );

                const classes = cn(
                  "flex items-center gap-3 px-4 py-3.5",
                  r.href && "transition-colors hover:bg-[var(--surface-2)]",
                );

                return r.href ? (
                  <Link key={r.id} href={r.href} className={classes}>
                    {body}
                  </Link>
                ) : (
                  <div key={r.id} className={classes}>
                    {body}
                  </div>
                );
              })}
            </Card>
          </section>
        ))
      )}

      <p className="t-meta mt-7 text-[var(--text-3)]">
        Everything here is stored on this device. Nothing was filed by you — the app read each document, named it,
        and compared it to what came before.
      </p>
    </main>
  );
}
