"use client";

// ============================================================
// LAB SUMMARY — THE CALM SCREEN
//
// The most important screen in the product to get right, because
// it is the one where a person is most frightened and least
// equipped.
//
// A standard lab report is 38 rows, alphabetical, with red
// asterisks on the two that are out of range. It is optimised
// for a clinician scanning for exceptions, and it is actively
// hostile to the patient holding it.
//
// Four inversions, each visible in the markup below:
//
// 1. THE HEADLINE COUNTS WHAT IS FINE. "36 of 38 markers are
//    where they should be" is the first sentence, at display
//    size. The two exceptions come after. This is not spin — it
//    is the accurate summary, and it is the one a good doctor
//    leads with.
//
// 2. THE 36 GOOD ONES COLLAPSE INTO ONE GREEN LINE. They are
//    reachable, not hidden, but they do not each get a row —
//    36 rows of "normal" is how the two that matter get lost.
//
// 3. NOTHING IS RED. The two flagged markers are amber, because
//    "above target" is not "danger". There is no red token in
//    the design system to reach for.
//
// 4. THE EXIT IS A CONVERSATION WITH A HUMAN. The bottom of this
//    screen is three questions to bring to a doctor — not an
//    upsell, not a supplement, not a subscription.
// ============================================================

import Link from "next/link";
import { Badge, Card, ChipLink, Eyebrow } from "@/components/ds/primitives";
import { Disclosure } from "@/components/ds/interactive";
import { ScreenHeader } from "@/components/ds/screen";
import { Sparkline } from "@/components/ds/charts";
import { CheckIcon, ShareIcon } from "@/components/ds/icons";
import {
  attentionMarkers,
  calmGroups,
  delta,
  DOCTOR_QUESTIONS,
  FLAG_LABEL,
  steadyCount,
  steadyMarkers,
  type Panel,
} from "@/lib/v2/labs";
import { formatLongDate } from "@/lib/v2/records";

export function LabSummary({ panel }: { panel: Panel }) {
  const { steady, total } = steadyCount(panel);
  const attention = attentionMarkers(panel);
  const calm = calmGroups(panel);
  const fine = steadyMarkers(panel);

  return (
    <>
      <ScreenHeader
        backHref="/records"
        eyebrow={`Panel · ${formatLongDate(panel.date)}`}
        trailing={
          <button
            type="button"
            aria-label="Share this summary"
            className="tap grid size-9 place-items-center rounded-full text-[var(--accent-text)] transition-colors hover:bg-[var(--surface-2)]"
          >
            <ShareIcon size={17} />
          </button>
        }
      />

      <main id="main" className="app-scroll px-5">
        {/* 1 — The headline counts what is fine. */}
        <h1 className="t-display text-[var(--text)]">
          {steady} of {total} markers are where they should be.
        </h1>
        <p className="t-body t-prose mt-3 text-[var(--text-2)]">
          {attention.length === 0
            ? "Nothing on this panel needs a conversation."
            : `${attention.length === 1 ? "One is" : `${attention.length} are`} worth attention — neither is urgent, and both respond to what you eat.`}
        </p>

        {/* 2 — The good news, collapsed into one line. */}
        <div className="mt-5">
          <Disclosure
            tone="steady"
            summary={
              <span className="flex items-start gap-2.5">
                <CheckIcon size={15} strokeWidth={2.3} className="mt-0.5 shrink-0 text-[var(--steady-text)]" />
                <span className="t-body text-[var(--text)]">
                  {calm.join(", ").replace(/, ([^,]*)$/, " and $1")} all steady since March.
                </span>
              </span>
            }
          >
            <ul className="divide-y divide-[var(--border)]">
              {fine.map((m) => (
                <li key={m.id} className="flex items-baseline justify-between gap-3 py-2">
                  <Link
                    href={`/labs/${panel.id}/${m.id}`}
                    className="t-body min-w-0 flex-1 truncate text-[var(--text-2)] transition-colors hover:text-[var(--text)]"
                  >
                    {m.name}
                  </Link>
                  <span className="tnum t-meta shrink-0 text-[var(--text-3)]">
                    {m.value} {m.unit}
                  </span>
                </li>
              ))}
            </ul>
          </Disclosure>
        </div>

        {/* 3 — The exceptions. Amber, never red. */}
        {attention.length > 0 && (
          <section className="mt-6">
            <Eyebrow>Worth attention</Eyebrow>
            <div className="mt-2 space-y-3">
              {attention.map((m) => {
                const move = delta(m);
                return (
                  <Link key={m.id} href={`/labs/${panel.id}/${m.id}`} className="block">
                    <Card className="p-4 transition-colors hover:bg-[var(--surface-2)]">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="t-h3 text-[var(--text)]">{m.name}</p>
                          <p className="t-meta mt-0.5 text-[var(--text-3)]">{m.subtitle}</p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-[22px] font-[640] leading-none text-[var(--text)]">
                            {m.value}
                            <span className="t-meta ml-1 font-[500] text-[var(--text-3)]">{m.unit}</span>
                          </p>
                          <Badge tone="attention" className="mt-2">
                            {FLAG_LABEL[m.flag]}
                          </Badge>
                        </div>
                      </div>

                      {/* A shape, not a table. The sentence below
                          carries the meaning; this only shows
                          which way it has been moving. */}
                      {m.history && m.history.length > 1 && (
                        <div className="mt-3">
                          <Sparkline
                            points={[...m.history.map((h) => ({ t: h.date, v: h.value })), { t: panel.date, v: m.value }]}
                            height={34}
                          />
                        </div>
                      )}

                      <p className="t-body mt-3 text-[var(--text-2)]">{m.plain}</p>

                      {move && (
                        <p className="t-meta mt-2 text-[var(--text-3)]">
                          {move.direction === "flat"
                            ? "Unchanged since the last panel."
                            : `${move.direction === "up" ? "Up" : "Down"} from ${move.from} ${m.unit} last time.`}
                        </p>
                      )}
                    </Card>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {/* 4 — The exit is a human. */}
        <section className="mt-7">
          <Eyebrow>Three questions to bring to your doctor</Eyebrow>
          <Card className="mt-2 divide-y divide-[var(--border)]">
            {DOCTOR_QUESTIONS.map((q, i) => (
              <div key={q} className="flex gap-3 p-4">
                <span className="tnum t-meta shrink-0 font-[620] text-[var(--accent-text)]">{i + 1}</span>
                <p className="t-body text-[var(--text-2)]">{q}</p>
              </div>
            ))}
          </Card>
          <p className="t-meta mt-2 text-[var(--text-3)]">
            Written as questions, not conclusions. Your clinician has context this app doesn&apos;t.
          </p>
        </section>

        <div className="mt-6 flex flex-wrap gap-2">
          <ChipLink href={`/ask/new?q=${encodeURIComponent("Walk me through my July blood panel in plain language.")}`}>
            Ask about this panel
          </ChipLink>
          <ChipLink href="/plan">Build a week around it</ChipLink>
        </div>

        <p className="t-meta mt-7 text-[var(--text-3)]">
          Reference ranges vary between laboratories. This explains your results — it does not diagnose, and it is not
          a substitute for the clinician who ordered them.
        </p>
      </main>
    </>
  );
}
