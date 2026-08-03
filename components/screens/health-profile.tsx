"use client";

// ============================================================
// HEALTH MEMORY — WHAT THE ASSISTANT KNOWS
//
// This screen exists because of one question users ask about
// every AI product and almost never get answered: WHAT DOES IT
// ACTUALLY KNOW ABOUT ME?
//
// So it shows exactly that — the profile as the agents receive
// it, field by field, each with WHERE IT CAME FROM. A fact you
// told it, a fact it read out of a document, and a fact it
// derived are three different things with three different
// reliabilities, and collapsing them into one list is how
// "you're gluten sensitive" ends up sitting next to something
// the model inferred on a Tuesday.
//
// "Not recorded" is shown as a first-class value rather than
// hidden. An empty field is information: it tells the user why
// an answer was vague, and it is the most direct invitation to
// improve it.
// ============================================================

import Link from "next/link";
import { useMemo } from "react";
import { Badge, Card, Eyebrow } from "@/components/ds/primitives";
import { ScreenHeader } from "@/components/ds/screen";
import { ArrowRight } from "@/components/ds/icons";
import { DEV, personToProfile } from "@/lib/v2/persona";
import { bmi } from "@/lib/memory/profile";

/** Where a fact came from — and therefore how much to trust it. */
type Origin = "you" | "document" | "device" | "derived";

const ORIGIN_LABEL: Record<Origin, string> = {
  you: "You told us",
  document: "Read from a document",
  device: "From a connected source",
  derived: "Worked out",
};

const ORIGIN_TONE: Record<Origin, "steady" | "evidence" | "neutral"> = {
  you: "steady",
  document: "evidence",
  device: "evidence",
  derived: "neutral",
};

type Fact = { label: string; value: string; origin: Origin; href?: string };

export function HealthProfileScreen() {
  const profile = useMemo(() => personToProfile(), []);

  const groups: { title: string; facts: Fact[] }[] = [
    {
      title: "Body",
      facts: [
        { label: "Age", value: `${DEV.age}`, origin: "you" },
        { label: "Height", value: `${DEV.heightCm} cm`, origin: "you" },
        { label: "Weight", value: `${DEV.weightKg} kg`, origin: "device" },
        { label: "BMI", value: `${bmi(profile)}`, origin: "derived" },
      ],
    },
    {
      title: "Goals",
      facts: DEV.goals.map((g) => ({
        label: g.label,
        value: g.marker ? "Tied to a marker" : "No marker",
        origin: "you" as Origin,
        href: g.marker ? `/labs/panel-2026-07/${g.marker}` : undefined,
      })),
    },
    {
      title: "Constraints",
      facts: [
        { label: "Restrictions", value: DEV.restrictions.join(", ") || "None recorded", origin: "you" },
        { label: "Conditions", value: DEV.conditions.join(", ") || "None recorded", origin: "you" },
        { label: "Medicines", value: profile.medicines.join(", ") || "None recorded", origin: "document", href: "/medicine/ferrous-fumarate-210" },
      ],
    },
    {
      title: "Habits",
      facts: [
        { label: "Sleep", value: `${profile.sleepHours} h a night`, origin: "device" },
        { label: "Training", value: `${profile.exerciseDaysPerWeek} days a week`, origin: "you" },
        { label: "Protein target", value: `${profile.proteinGoal} g/day`, origin: "you" },
        { label: "Resting heart rate", value: "Not recorded", origin: "device" },
      ],
    },
    {
      title: "Labs the assistant reasons from",
      facts: profile.biomarkers.map((b) => ({
        label: b.name,
        value: b.value,
        origin: "document" as Origin,
        href: "/labs/panel-2026-07",
      })),
    },
  ];

  return (
    <>
      <ScreenHeader backHref="/you" title="Health profile" />

      <main id="main" className="app-scroll px-5">
        <p className="t-body t-prose text-[var(--text-2)]">
          This is what the assistant knows about you, and where each fact came from. It reasons only from what&apos;s
          here — anything marked <span className="text-[var(--text)]">not recorded</span> is a gap it will say it
          can&apos;t fill rather than guess at.
        </p>

        {groups.map((group) => (
          <section key={group.title} className="mt-6">
            <Eyebrow>{group.title}</Eyebrow>
            <Card className="mt-2 divide-y divide-[var(--border)]">
              {group.facts.map((f) => {
                const missing = /not recorded|none recorded/i.test(f.value);
                const body = (
                  <>
                    <span className="t-body min-w-0 flex-1 text-[var(--text-2)]">{f.label}</span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className={missing ? "t-meta text-[var(--text-3)]" : "t-meta text-[var(--text)]"}>
                        {f.value}
                      </span>
                      <Badge tone={ORIGIN_TONE[f.origin]} className="hidden sm:inline-flex">
                        {ORIGIN_LABEL[f.origin]}
                      </Badge>
                    </span>
                  </>
                );

                return f.href ? (
                  <Link
                    key={f.label}
                    href={f.href}
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[var(--surface-2)]"
                  >
                    {body}
                  </Link>
                ) : (
                  <div key={f.label} className="flex items-center gap-3 px-4 py-3">
                    {body}
                  </div>
                );
              })}
            </Card>
          </section>
        ))}

        <Link
          href={`/ask/new?q=${encodeURIComponent("What don't you know about me that would make your answers better?")}`}
          className="mt-6 inline-flex items-center gap-1.5 text-[13.5px] font-[590] text-[var(--accent-text)]"
        >
          Ask what&apos;s missing
          <ArrowRight size={15} />
        </Link>

        <p className="t-meta mt-6 text-[var(--text-3)]">
          A shortened version of this profile is sent with each question so answers are personal. Your documents are
          not sent — only the values read out of them.
        </p>
      </main>
    </>
  );
}
