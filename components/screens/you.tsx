"use client";

// ============================================================
// YOU · PROFILE & SETTINGS
//
// "Goals live at the top because they're what the assistant
// reasons from. Training on personal data is off by default and
// says so."
//
// The ordering is an argument about what a settings screen is
// for. Most put identity at the top and preferences below,
// because that mirrors the database. This puts GOALS at the top,
// because goals are the input to every answer the product gives
// — a user who wants to understand why the app said something
// looks here first, and finding "Raise ferritin, Lower LDL" is
// the explanation.
//
// On privacy: the toggles describe what actually happens, in
// plain words, including the unflattering parts. "Health data
// lives in this browser's storage" is less impressive than
// "encrypted vault", and it is what is true. A product asking
// for the most sensitive data a person has does not get to be
// vague about where it goes.
// ============================================================

import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge, Button, Card, Divider, Eyebrow, Row } from "@/components/ds/primitives";
import { Segmented, Sheet, Toggle } from "@/components/ds/interactive";
import { DocIcon, LockIcon, PillIcon, TrashIcon, YouIcon } from "@/components/ds/icons";
import { DEV } from "@/lib/v2/persona";
import { formatLongDate } from "@/lib/v2/records";
import { deleteEverything, exportEverything, useHydrated, useSettings, useTheme, type ThemeChoice } from "@/lib/v2/store";

export function YouScreen() {
  const hydrated = useHydrated();
  const [theme, setTheme] = useTheme();
  const [settings, patch] = useSettings();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleted, setDeleted] = useState(false);

  const height = useMemo(() => `${DEV.heightCm} cm`, []);

  function download() {
    const blob = new Blob([JSON.stringify(exportEverything(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nutritiscan-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main id="main" className="app-scroll px-5">
      <header className="flex items-center gap-4 pb-6 pt-[calc(var(--s-6)+var(--safe-t))]">
        <span className="grid size-14 shrink-0 place-items-center rounded-full bg-[var(--accent-soft)] text-[15px] font-[640] text-[var(--accent-text)]">
          {DEV.initials}
        </span>
        <div className="min-w-0">
          <h1 className="t-h1 text-[var(--text)]">{DEV.name}</h1>
          <p className="t-meta mt-0.5 text-[var(--text-3)]">
            {DEV.age} · {height} · {DEV.weightKg} kg · {DEV.restrictions.join(", ").toLowerCase()}-free
          </p>
        </div>
      </header>

      {/* ---- Goals first: this is what the assistant reasons from. ---- */}
      <Card className="p-4">
        <Eyebrow>What we&apos;re optimising for</Eyebrow>
        <div className="mt-3 flex flex-wrap gap-2">
          {DEV.goals.map((g) =>
            g.marker ? (
              <Link key={g.id} href={`/labs/panel-2026-07/${g.marker}`}>
                <Badge tone="accent">{g.label}</Badge>
              </Link>
            ) : (
              <Badge key={g.id} tone="neutral">
                {g.label}
              </Badge>
            ),
          )}
        </div>
        <p className="t-meta mt-3 text-[var(--text-3)]">
          Last reviewed {formatLongDate(DEV.goalsReviewed)}. We&apos;ll ask again when a new panel arrives.
        </p>
      </Card>

      {/* ---- Memory ---- */}
      <section className="mt-6">
        <Eyebrow>Health memory</Eyebrow>
        <Card className="mt-2 overflow-hidden">
          <Row
            icon={<YouIcon size={16} />}
            title="Health profile"
            detail="Body, sleep, activity, goals"
            value="12 answers"
            href="/you/profile"
          />
          <Divider />
          <Row
            icon={<AllergyGlyph />}
            title="Allergies & conditions"
            value={DEV.restrictions.join(", ")}
            href="/you/profile"
          />
          <Divider />
          <Row icon={<DocIcon size={16} />} title="Medical records" value={`${7} documents`} href="/records" />
          <Divider />
          <Row icon={<PillIcon size={16} />} title="Medicines" value="1 active" href="/medicine/ferrous-fumarate-210" />
          <Divider />
          <Row icon={<HeartGlyph />} title="Connected sources" value="Apple Health" />
        </Card>
      </section>

      {/* ---- Privacy, stated plainly ---- */}
      <section className="mt-6">
        <Eyebrow>Privacy</Eyebrow>
        <Card className="mt-2 overflow-hidden">
          <Toggle
            checked={hydrated ? settings.keepOnDevice : true}
            onChange={(v) => patch({ keepOnDevice: v })}
            label="Keep records on device"
            description="No cloud copy of your files"
          />
          <Divider />
          <Toggle
            checked={hydrated ? settings.improveAnswers : false}
            onChange={(v) => patch({ improveAnswers: v })}
            label="Use my data to improve answers"
            description="Off by default"
          />
        </Card>

        {/* The honest version, not the reassuring version. */}
        <p className="t-meta mt-3 flex gap-2 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)] p-3.5 text-[var(--text-3)]">
          <LockIcon size={14} className="mt-0.5 shrink-0" />
          <span>
            Your health data lives in this browser&apos;s local storage on this device. It is not encrypted at rest and
            it is not synced anywhere. Questions you ask are sent to a model provider to be answered, along with the
            profile summary above — the documents themselves are not.
          </span>
        </p>
      </section>

      {/* ---- Appearance ---- */}
      <section className="mt-6">
        <Eyebrow>Appearance</Eyebrow>
        <Segmented<ThemeChoice>
          className="mt-2"
          label="Theme"
          value={hydrated ? theme : "dark"}
          onChange={setTheme}
          options={[
            { value: "dark", label: "Dark" },
            { value: "light", label: "Light" },
            { value: "system", label: "System" },
          ]}
        />
      </section>

      {/* ---- Ownership. Deletion is a first-class action. ---- */}
      <section className="mt-6">
        <Eyebrow>Your data</Eyebrow>
        <Card className="mt-2 overflow-hidden">
          <button type="button" onClick={download} className="w-full text-left">
            <Row icon={<DocIcon size={16} />} title="Export everything" detail="One JSON file, yours to keep" />
          </button>
          <Divider />
          <button type="button" onClick={() => setConfirmDelete(true)} className="w-full text-left">
            <Row
              tone="attention"
              icon={<TrashIcon size={16} />}
              title="Delete everything"
              detail="Removes every record, meal and answer from this device"
            />
          </button>
        </Card>
      </section>

      <p className="t-meta mt-7 text-[var(--text-3)]">
        NutritiScan is an educational companion. It explains your data and helps you prepare questions — it does not
        diagnose, prescribe, or replace the clinician who knows you.
      </p>

      {/* ---- Delete confirmation ---- */}
      <Sheet open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete everything?">
        {deleted ? (
          <>
            <p className="t-body text-[var(--text-2)]">
              Everything stored on this device has been removed — records, logged meals, conversations, settings.
            </p>
            <Button
              variant="secondary"
              full
              className="mt-5"
              onClick={() => {
                setConfirmDelete(false);
                window.location.href = "/";
              }}
            >
              Start fresh
            </Button>
          </>
        ) : (
          <>
            <p className="t-body text-[var(--text-2)]">
              This removes every record, logged meal, conversation and setting from this device. It cannot be undone,
              and there is no cloud copy to restore from.
            </p>
            <p className="t-meta mt-3 text-[var(--text-3)]">
              If you want a copy first, close this and export — it takes a second.
            </p>
            <div className="mt-5 flex gap-2">
              <Button variant="secondary" full onClick={() => setConfirmDelete(false)}>
                Keep it
              </Button>
              <Button
                variant="primary"
                full
                onClick={() => {
                  deleteEverything();
                  setDeleted(true);
                }}
              >
                Delete everything
              </Button>
            </div>
          </>
        )}
      </Sheet>
    </main>
  );
}

/* Two one-off glyphs that don't earn a place in the shared icon
   set — they appear exactly once each. */

function AllergyGlyph() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="8.6" />
      <path d="m6.5 6.5 11 11" />
    </svg>
  );
}

function HeartGlyph() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20s-7-4.6-7-9.4A4.1 4.1 0 0 1 12 8a4.1 4.1 0 0 1 7 2.6C19 15.4 12 20 12 20z" />
    </svg>
  );
}
