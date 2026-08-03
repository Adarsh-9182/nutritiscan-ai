"use client";

// ============================================================
// BIOMARKER DETAIL
//
// "Range bar shows position, not pass/fail. Recommendations
// carry an evidence grade — the honest move, and it stops the
// app sounding certain about things it isn't."
//
// Two ideas do the work here.
//
// POSITION, NOT PASS/FAIL. A reference range drawn as a
// boundary invites one question: did I pass? Drawn as a span
// with a comfortable region inside it, the same data invites a
// better one: where am I, and which way am I moving? The value
// is identical; only the framing changed, and the framing is
// what determines whether someone panics.
//
// EVIDENCE GRADES ON RECOMMENDATIONS. "Iron-rich food with
// vitamin C" and "cast-iron cooking" are not equally
// well-supported, and an app that presents them as a flat
// bulleted list is lying by omission. Grading them costs one
// badge and buys the right to be believed on the strong ones.
// It also, usefully, makes the product's uncertainty visible
// rather than something the user discovers later.
// ============================================================

import Link from "next/link";
import { Badge, Card, Eyebrow } from "@/components/ds/primitives";
import { LineChart, RangeBar } from "@/components/ds/charts";
import { ScreenHeader } from "@/components/ds/screen";
import {
  EVIDENCE_LABEL,
  FLAG_LABEL,
  delta,
  positionPhrase,
  type EvidenceGrade,
  type Marker,
  type Panel,
} from "@/lib/v2/labs";

/**
 * Evidence grade → visual weight.
 *
 * `strong` is the only one that gets the confident treatment.
 * `mixed` and `limited` deliberately read quieter than the
 * surrounding text — a weakly-supported suggestion should look
 * like one.
 */
const GRADE_TONE: Record<EvidenceGrade, "evidence" | "neutral"> = {
  strong: "evidence",
  moderate: "evidence",
  mixed: "neutral",
  limited: "neutral",
};

const MONTH_YEAR = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { month: "short", year: "2-digit" }).replace(" ", " '");

export function BiomarkerScreen({ panel, marker }: { panel: Panel; marker: Marker }) {
  const move = delta(marker);
  const position = positionPhrase(marker);

  const trend = [
    ...(marker.history ?? []).map((h) => ({ t: MONTH_YEAR(h.date), v: h.value })),
    { t: MONTH_YEAR(panel.date), v: marker.value },
  ];

  return (
    <>
      <ScreenHeader backHref={`/labs/${panel.id}`} title={marker.name} />

      <main id="main" className="app-scroll px-5">
        {/* The value. One hero figure per screen. */}
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
          <span className="t-numeral text-[var(--text)]">{marker.value}</span>
          <span className="t-h3 text-[var(--text-3)]">{marker.unit}</span>
          {position && (
            <Badge tone={marker.tone === "attention" ? "attention" : "steady"} className="ml-auto">
              {position}
            </Badge>
          )}
        </div>

        <p className="t-meta mt-1 text-[var(--text-3)]">
          {marker.subtitle} · {FLAG_LABEL[marker.flag]}
        </p>

        {/* Position along the range — the screen's central idea. */}
        <Card className="mt-5 p-4">
          <RangeBar
            value={marker.value}
            axis={marker.axis}
            comfortable={marker.comfortable}
            unit={marker.unit}
            label={marker.name}
          />
        </Card>

        {/* The trend. Slow-moving markers are the reason this
            exists: one reading is a data point, four is a story. */}
        {trend.length > 1 && (
          <Card className="mt-3 p-4">
            <LineChart
              label={`${trend.length} panels, ${spanYears(marker, panel)}`}
              unit={` ${marker.unit}`}
              points={trend}
              threshold={{
                value: marker.comfortable[0],
                label: `Comfortable from ${marker.comfortable[0]}`,
              }}
              height={140}
            />
            {move && (
              <p className="t-meta mt-2 text-[var(--text-2)]">
                {move.direction === "flat"
                  ? "Unchanged since the last panel."
                  : `${move.direction === "up" ? "Up" : "Down"} ${Math.abs(move.diff)} ${marker.unit} since ${MONTH_YEAR(
                      marker.history![marker.history!.length - 1].date,
                    )}.`}
              </p>
            )}
          </Card>
        )}

        {/* What it is, in words the reader doesn't need a degree
            for. Every number on this screen has a sentence. */}
        {marker.about && (
          <section className="mt-7">
            <Eyebrow>In plain terms</Eyebrow>
            <p className="t-body t-prose mt-2 text-[var(--text-2)]">{marker.about}</p>
          </section>
        )}

        <section className="mt-6">
          <Eyebrow>What this reading means for you</Eyebrow>
          <p className="t-body t-prose mt-2 text-[var(--text-2)]">{marker.plain}</p>
        </section>

        {/* Graded recommendations. */}
        {marker.helps && marker.helps.length > 0 && (
          <section className="mt-7">
            <Eyebrow>What tends to help</Eyebrow>
            <Card className="mt-2 divide-y divide-[var(--border)]">
              {marker.helps.map((h) => (
                <div key={h.text} className="flex items-center justify-between gap-3 px-4 py-3.5">
                  <span className="t-body min-w-0 flex-1 text-[var(--text-2)]">{h.text}</span>
                  <Badge tone={GRADE_TONE[h.grade]} className="shrink-0">
                    {EVIDENCE_LABEL[h.grade]}
                  </Badge>
                </div>
              ))}
            </Card>
            <p className="t-meta mt-2 text-[var(--text-3)]">
              Grades describe how well-studied each one is, not how well it will work for you.
            </p>
          </section>
        )}

        <div className="mt-6 flex flex-wrap gap-2">
          <Link
            href={`/ask/new?q=${encodeURIComponent(`Explain my ${marker.name} of ${marker.value} ${marker.unit} and what I should do about it.`)}`}
            className="inline-flex items-center rounded-[var(--r-full)] border border-[var(--border)] px-3 py-2 text-[13px] text-[var(--text-2)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
          >
            Ask about this
          </Link>
          <Link
            href="/plan"
            className="inline-flex items-center rounded-[var(--r-full)] border border-[var(--border)] px-3 py-2 text-[13px] text-[var(--text-2)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
          >
            Build meals around it
          </Link>
        </div>

        <p className="t-meta mt-7 text-[var(--text-3)]">
          Reference ranges differ between laboratories, and a single value out of range is common in healthy people.
          Bring this to the clinician who ordered the test rather than acting on it alone.
        </p>
      </main>
    </>
  );
}

/** "two years" — how long the trend actually covers. */
function spanYears(marker: Marker, panel: Panel): string {
  const first = marker.history?.[0]?.date;
  if (!first) return "one reading";
  const years = (new Date(panel.date).getTime() - new Date(first).getTime()) / (365.25 * 86_400_000);
  const rounded = Math.round(years);
  if (rounded < 1) return "under a year";
  return `${rounded} year${rounded === 1 ? "" : "s"}`;
}
