"use client";

// ============================================================
// MEDICINE · RESPONSIBLY
//
// "The one genuinely actionable fact gets the amber card; dosing
// advice is explicitly deferred to a clinician."
//
// The editorial line is enforced in lib/v2/medicines.ts (there
// is no `dose` field to render). What this screen adds is the
// VISUAL hierarchy that makes the line legible:
//
//   - Purpose gets a plain card. It's context, not action.
//   - TIMING gets the only amber card on the screen, because it
//     is the one thing here that changes what the user does in
//     the next hour, and getting it wrong quietly wastes the
//     medicine.
//   - Interactions, effects and storage are a reference table.
//     Scannable, not shouty.
//   - The disclaimer is the last thing, unmissable, and not
//     dismissible.
//
// Note what is NOT prominent: side effects. Leading with "dark
// stools, nausea" is how you talk someone out of a medicine
// their doctor prescribed. It is present and honest, but it is
// reference material, not a headline.
// ============================================================

import Link from "next/link";
import { useState } from "react";
import { Badge, Card, Disclaimer, Divider, Eyebrow } from "@/components/ds/primitives";
import { Toggle, Sheet } from "@/components/ds/interactive";
import { ScreenHeader } from "@/components/ds/screen";
import { AlertIcon, ClockIcon, PillIcon } from "@/components/ds/icons";
import { useReminder } from "@/lib/v2/store";
import {
  MEDICINE_DISCLAIMER,
  SEVERITY_LABEL,
  yourItemClashes,
  type Medicine,
} from "@/lib/v2/medicines";

export function MedicineScreen({ medicine }: { medicine: Medicine }) {
  const [reminderOn, setReminderOn] = useState(false);
  const [storedOn, setStored] = useReminder(medicine.id);
  const [showInteractions, setShowInteractions] = useState(false);

  // The stored value is the source of truth once hydrated; the
  // local one only exists so the first paint doesn't flash.
  const on = storedOn || reminderOn;
  const clashes = yourItemClashes(medicine);

  return (
    <>
      <ScreenHeader backHref="/records" title="Scanned medicine" />

      <main id="main" className="app-scroll px-5">
        {/* ---- Identity ---- */}
        <div className="flex items-start gap-4">
          <div className="grid size-16 shrink-0 place-items-center rounded-[var(--r-md)] border border-dashed border-[var(--border-strong)] bg-[var(--surface-2)] text-[var(--text-3)]">
            <PillIcon size={22} />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="t-h1 text-[var(--text)]">{medicine.name}</h1>
            <p className="t-meta mt-1 text-[var(--text-3)]">
              {medicine.kind} · {medicine.form}
            </p>
          </div>
        </div>

        {/* ---- What it's for ---- */}
        <Card className="mt-6 p-4">
          <Eyebrow>What it&apos;s for</Eyebrow>
          <p className="t-body mt-2 text-[var(--text-2)]">{medicine.purpose}</p>
        </Card>

        {/* ---- Timing: the one amber card ---- */}
        {medicine.timing && (
          <Card tone="attention" className="mt-3 p-4">
            <span className="inline-flex items-center gap-1.5">
              <AlertIcon size={13} className="text-[var(--attention-text)]" />
              <span className="t-label text-[var(--attention-text)]">{medicine.timing.headline}</span>
            </span>
            <p className="t-body mt-2 text-[var(--text-2)]">{medicine.timing.detail}</p>
          </Card>
        )}

        {/* ---- Reference table ---- */}
        <Card className="mt-3 overflow-hidden">
          <div className="flex items-baseline justify-between gap-4 px-4 py-3.5">
            <span className="t-body text-[var(--text-2)]">Common effects</span>
            <span className="t-meta text-right text-[var(--text)]">{medicine.commonEffects.join(", ")}</span>
          </div>
          <Divider />

          <button
            type="button"
            onClick={() => setShowInteractions(true)}
            className="flex w-full items-baseline justify-between gap-4 px-4 py-3.5 text-left transition-colors hover:bg-[var(--surface-2)]"
          >
            <span className="t-body text-[var(--text-2)]">Interacts with</span>
            <span className="t-meta font-[560] text-[var(--attention-text)]">
              {clashes > 0 ? `${clashes} of your items` : "Nothing of yours"}
            </span>
          </button>
          <Divider />

          <div className="flex items-baseline justify-between gap-4 px-4 py-3.5">
            <span className="t-body text-[var(--text-2)]">Storage</span>
            <span className="t-meta text-right text-[var(--text)]">{medicine.storage}</span>
          </div>
        </Card>

        {/* ---- Reminder ---- */}
        {medicine.reminder && (
          <Card className="mt-3 overflow-hidden">
            <Toggle
              checked={on}
              onChange={(next) => {
                setReminderOn(next);
                setStored(next);
              }}
              label={`Remind me at ${medicine.reminder.time}`}
              description={medicine.reminder.why}
            />
          </Card>
        )}

        {/* ---- The line that cannot be dismissed ---- */}
        <Disclaimer className="flex gap-2">
          <ClockIcon size={14} className="mt-0.5 shrink-0" />
          <span>
            {MEDICINE_DISCLAIMER}{" "}
            <Link
              href={`/ask/new?q=${encodeURIComponent(`Help me write the question to ask my doctor about ${medicine.name}.`)}`}
              className="font-[560] text-[var(--accent-text)] underline underline-offset-2"
            >
              Prepare that question
            </Link>
          </span>
        </Disclaimer>
      </main>

      {/* ---- Interactions detail ---- */}
      <Sheet open={showInteractions} onClose={() => setShowInteractions(false)} title="Interactions">
        <ul className="space-y-4">
          {medicine.interactions.map((i) => (
            <li key={i.with}>
              <div className="flex items-center gap-2">
                <span className="t-h3 text-[var(--text)]">{i.with}</span>
                <Badge tone={i.severity === "note" ? "steady" : "attention"}>{SEVERITY_LABEL[i.severity]}</Badge>
                {i.fromYourItems && <Badge tone="evidence">Yours</Badge>}
              </div>
              <p className="t-body mt-1.5 text-[var(--text-2)]">{i.what}</p>
              {i.spaceHours && (
                <p className="t-meta mt-1 text-[var(--text-3)]">
                  Leave at least {i.spaceHours} hour{i.spaceHours === 1 ? "" : "s"} between them.
                </p>
              )}
            </li>
          ))}
        </ul>
        <p className="t-meta mt-6 text-[var(--text-3)]">
          Checked against the medicines and restrictions in your own records. It cannot know about anything you
          haven&apos;t told it.
        </p>
      </Sheet>
    </>
  );
}
