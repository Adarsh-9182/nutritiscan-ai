"use client";

// ============================================================
// ASK · HOME
//
// The most important screen in the product, and the one that
// defines the category. It is a QUESTION FIELD, not a dashboard.
//
// What is deliberately NOT here:
//   - no calorie ring, no six-metric grid, no streak
//   - no "progress" of any kind
//   - no more than ONE pushed insight
//
// The argument: a dashboard asks the user to do the analysis.
// Six numbers on a screen is six judgements they now have to
// make about themselves before breakfast. One sentence that
// already did the analysis, plus a caret, is the whole product.
//
// The vertical order is the priority order, and it is the same
// order a good doctor uses: reassure, then raise the one thing,
// then invite the question.
// ============================================================

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUp, ChevronRight, DocIcon, MicIcon, PillIcon, ShieldIcon, SparkIcon } from "@/components/ds/icons";
import { Card, ChipLink, DotLabel, Eyebrow } from "@/components/ds/primitives";
import { DEV } from "@/lib/v2/persona";
import { greeting, greetingSubtitle, pickInsight, SUGGESTED_QUESTIONS } from "@/lib/v2/insight";
import { SEEDED_CONVERSATIONS, relativeDay } from "@/lib/v2/conversation";
import { RECORDS, formatRecordDate } from "@/lib/v2/records";
import { cn } from "@/lib/cn";

const TIMELINE_ICON = {
  lab: DocIcon,
  prescription: PillIcon,
  vaccine: ShieldIcon,
  imaging: DocIcon,
  note: DocIcon,
} as const;

export function AskHome() {
  const router = useRouter();
  const [draft, setDraft] = useState("");

  const insight = pickInsight();
  const firstName = DEV.name.split(" ")[0];

  function ask(question: string) {
    const q = question.trim();
    if (!q) return;
    router.push(`/ask/new?q=${encodeURIComponent(q)}`);
  }

  return (
    <main id="main" className="app-scroll px-5">
      {/* ---- Identity bar. Small on purpose: the app does not
           need to announce itself to someone who opened it. ---- */}
      <header className="flex items-center justify-between pb-6 pt-[calc(var(--s-6)+var(--safe-t))]">
        <span className="t-label text-[var(--accent-text)]">NutritiScan</span>
        <Link
          href="/you"
          aria-label="Your profile and settings"
          className="grid size-9 place-items-center rounded-full border border-[var(--border)] bg-[var(--surface-2)] text-[12px] font-[620] text-[var(--text-2)] transition-colors hover:text-[var(--text)]"
        >
          {DEV.initials}
        </Link>
      </header>

      {/* ---- The greeting. Plain, not performed. ---- */}
      <h1 className="t-display text-[var(--text)]">{greeting(firstName)}</h1>
      <p className="t-body mt-2 max-w-[34ch] text-[var(--text-2)]">{greetingSubtitle(insight ? 1 : 0)}</p>

      {/* ---- TODAY'S READ — the only thing pushed at the user.
           Renders nothing at all when nothing clears the bar,
           rather than filling the slot with a number they
           already know. ---- */}
      {insight && (
        <Card tone="accent" className="mt-6 p-4">
          <DotLabel tone="accent">Today&apos;s read</DotLabel>
          <p className="t-body mt-2.5 text-[var(--text)]">{insight.text}</p>
          <Link
            href={insight.action.href}
            className="mt-3 inline-flex items-center gap-1.5 text-[13.5px] font-[590] text-[var(--accent-text)] transition-opacity hover:opacity-80"
          >
            {insight.action.label}
            <ArrowRight size={15} />
          </Link>
        </Card>
      )}

      {/* ---- The ask field. The caret is the real interaction. ---- */}
      <form
        className="mt-4"
        onSubmit={(e) => {
          e.preventDefault();
          ask(draft);
        }}
      >
        <div className="flex items-center gap-2 rounded-[var(--r-xl)] border border-[var(--border)] bg-[var(--surface)] p-2 pl-4 transition-colors focus-within:border-[var(--accent-line)]">
          <label htmlFor="ask" className="sr-only">
            Ask anything about your health
          </label>
          <input
            id="ask"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Ask anything"
            autoComplete="off"
            enterKeyHint="send"
            className="t-body min-w-0 flex-1 bg-transparent text-[var(--text)] outline-none placeholder:text-[var(--text-3)]"
          />

          {/* The button swaps from mic to send as soon as there is
              something to send — one control, never two competing
              primary actions. */}
          {draft.trim() ? (
            <button
              type="submit"
              aria-label="Send question"
              className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--accent)] text-[var(--accent-ink)] transition-transform active:scale-95"
            >
              <ArrowUp size={19} strokeWidth={2} />
            </button>
          ) : (
            <Link
              href="/ask/voice"
              aria-label="Ask by voice"
              className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--accent)] text-[var(--accent-ink)] transition-transform active:scale-95"
            >
              <MicIcon size={18} strokeWidth={1.9} />
            </Link>
          )}
        </div>
      </form>

      {/* ---- Suggested questions. Three, chosen to show the
           three things this product can do that a tracker
           can't. ---- */}
      <div className="mt-3 flex flex-wrap gap-2">
        {SUGGESTED_QUESTIONS.map((q) => (
          <ChipLink key={q.label} href={q.href}>
            {q.label}
          </ChipLink>
        ))}
      </div>

      {/* ---- Earlier conversations ---- */}
      <section className="mt-8">
        <Eyebrow>Earlier</Eyebrow>
        <ul className="mt-2">
          {SEEDED_CONVERSATIONS.map((c) => (
            <li key={c.id}>
              <Link
                href={`/ask/${c.id}`}
                className="flex items-center gap-3 border-b border-[var(--border)] py-3.5 transition-colors last:border-0 hover:text-[var(--text)]"
              >
                <SparkIcon size={16} className="shrink-0 text-[var(--text-3)]" />
                <span className="t-body min-w-0 flex-1 truncate text-[var(--text)]">{c.title}</span>
                <span className="t-meta shrink-0 text-[var(--text-3)]">{relativeDay(c.updatedAt)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* ---- Health timeline.
           A strip, not a screen. Its job here is to prove the app
           remembers — every row states what the app already did
           with the document, which is the difference between
           storage and an assistant. ---- */}
      <section className="mt-8">
        <header className="mb-2 flex items-baseline justify-between">
          <Eyebrow>Your timeline</Eyebrow>
          <Link href="/records" className="t-meta font-[560] text-[var(--accent-text)] transition-opacity hover:opacity-80">
            All records
          </Link>
        </header>

        <Card className="overflow-hidden">
          {RECORDS.slice(0, 3).map((r, i) => {
            const Icon = TIMELINE_ICON[r.kind];
            const content = (
              <>
                <span className="grid size-8 shrink-0 place-items-center rounded-[var(--r-sm)] border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-3)]">
                  <Icon size={15} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="t-body block truncate font-[560] text-[var(--text)]">{r.title}</span>
                  <span className="t-meta mt-0.5 block truncate text-[var(--text-3)]">
                    {formatRecordDate(r.date)} · {r.did}
                  </span>
                </span>
                {r.href && <ChevronRight size={15} className="shrink-0 text-[var(--text-3)]" />}
              </>
            );

            const classes = cn(
              "flex items-center gap-3 px-4 py-3",
              i > 0 && "border-t border-[var(--border)]",
              r.href && "transition-colors hover:bg-[var(--surface-2)]",
            );

            return r.href ? (
              <Link key={r.id} href={r.href} className={classes}>
                {content}
              </Link>
            ) : (
              <div key={r.id} className={classes}>
                {content}
              </div>
            );
          })}
        </Card>
      </section>

      <p className="t-meta mt-8 text-[var(--text-3)]">
        NutritiScan is an educational companion, not a doctor. It explains, it never diagnoses.
      </p>
    </main>
  );
}
