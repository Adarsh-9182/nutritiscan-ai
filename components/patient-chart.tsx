"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { readProfile, useMeals, useProfile } from "@/lib/memory/store";
import { todaySummary } from "@/lib/health/insights";
import { buildTimeline, timeAgo, KIND_META } from "@/lib/health/timeline";
import { toLoggedMeal } from "@/lib/memory/meals";
import { journalEntry } from "@/lib/memory/journal";
import { mergeBiomarkers, parseLabReport } from "@/lib/memory/labs";
import type { Biomarker } from "@/lib/memory/profile";
import type { ScanResult } from "@/lib/nutrition/analyze";

/* =====================================================================
   PATIENT CHART — the record, beside the conversation

   The dashboard, the scanner and the timeline used to be three routes.
   That is the wrong shape for this product: a consultation is not a
   thing you leave to go and read the chart, it is a thing you have with
   the chart open. Every clinical system on earth puts the record beside
   the note for that reason, and this panel is that record.

   It is deliberately NOT the old dashboard moved sideways. That surface
   was a wellness app — rings, emoji, a score out of 100 in 40px type.
   This one is written the way clinical software is written:

     - the value is the loudest thing in the row, set in tabular figures
       so a column of numbers reads as a column
     - status is a 5px marker and a word, never a filled colour block
     - the reference range sits under the value, because a lab number
       without its range is not information
     - nothing is decorative. There is no chrome here that is not a
       label, a value, or a rule separating two of them.
   ===================================================================== */

const STATUS: Record<Biomarker["status"], { color: string; label: string }> = {
  low: { color: "var(--rose)", label: "Low" },
  high: { color: "var(--rose)", label: "High" },
  borderline: { color: "var(--amber)", label: "Borderline" },
  normal: { color: "var(--emerald)", label: "In range" },
};

function Section({ title, meta, children }: { title: string; meta?: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-[var(--border)] px-4 py-3.5">
      <div className="mb-2.5 flex items-baseline justify-between gap-2">
        <h3 className="t-label font-medium uppercase tracking-[0.13em] text-[var(--text-dim)]">{title}</h3>
        {meta && <span className="t-label tabular-nums text-[var(--text-dim)]">{meta}</span>}
      </div>
      {children}
    </section>
  );
}

/** A lab row: name, value, status, and the range that gives the value meaning. */
function LabRow({ marker, index }: { marker: Biomarker; index: number }) {
  const s = STATUS[marker.status];
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, delay: index * 0.03, ease: [0.22, 1, 0.36, 1] }}
      className="flex items-start justify-between gap-3 border-t border-[var(--border)] py-2 first:border-t-0 first:pt-0"
    >
      <div className="min-w-0">
        <p className="t-meta text-[var(--text)]">{marker.name}</p>
        {marker.note && <p className="t-label mt-0.5 text-[var(--text-dim)]">{marker.note}</p>}
      </div>
      <div className="shrink-0 text-right">
        <p className="t-meta font-medium tabular-nums text-[var(--text)]">{marker.value}</p>
        <p className="t-label mt-0.5 inline-flex items-center gap-1.5 text-[var(--text-dim)]">
          <span aria-hidden="true" className="inline-block h-[5px] w-[5px] rounded-full" style={{ background: s.color }} />
          {s.label}
        </p>
      </div>
    </motion.div>
  );
}

/** Today's intake against this person's own target, not a generic one. */
function TodayBlock() {
  const [profile] = useProfile();
  const [meals] = useMeals();
  const t = useMemo(() => todaySummary(profile, meals), [profile, meals]);
  const pct = t.target > 0 ? Math.min(100, Math.round((t.protein / t.target) * 100)) : 0;

  return (
    <>
      <div className="flex items-baseline justify-between gap-2">
        <p className="t-meta text-[var(--text-muted)]">Protein</p>
        <p className="t-meta tabular-nums text-[var(--text)]">
          <span className="font-medium">{Math.round(t.protein)}</span>
          <span className="text-[var(--text-dim)]"> / {t.target} g</span>
        </p>
      </div>

      {/*
        A 3px rule rather than a ring. The ring was the loudest object on
        the old dashboard and carried one number; this carries the same
        number and leaves the emphasis to the values themselves.
      */}
      <div className="mt-2 h-[3px] w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
        <motion.div
          className="h-full rounded-full"
          style={{ background: pct >= 100 ? "var(--emerald)" : "var(--cyan)" }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>

      <div className="mt-3 grid grid-cols-4 gap-2">
        {[
          ["kcal", Math.round(t.kcal)],
          ["Carbs", `${Math.round(t.carbs)} g`],
          ["Fat", `${Math.round(t.fat)} g`],
          ["Fibre", `${Math.round(t.fiber)} g`],
        ].map(([label, value]) => (
          <div key={String(label)}>
            <p className="t-label text-[var(--text-dim)]">{label}</p>
            <p className="t-meta tabular-nums text-[var(--text)]">{value}</p>
          </div>
        ))}
      </div>
    </>
  );
}

/* ---------------------------------------------------------------------
   Adding to the record

   /scan was a whole route to answer "what did I eat", and lab entry lived
   on the dashboard. Both were the same act — putting a fact into the
   record — reached two different ways, neither of them from the
   conversation where the fact usually comes up.

   Both are now one control at the foot of the chart. Neither leaves the
   page, and what they write appears in the sections above immediately,
   because those read the same store.
   --------------------------------------------------------------------- */

type Mode = "meal" | "labs";

function AddToRecord() {
  const [, , patch] = useProfile();
  const [, , addMeal] = useMeals();
  const [mode, setMode] = useState<Mode | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  function reset() {
    setMode(null);
    setText("");
    setMsg(null);
  }

  /** Labs parse locally — no model, no request, no failure mode worth a spinner. */
  function saveLabs() {
    const found = parseLabReport(text);
    if (!found.length) {
      setMsg('No known markers found. Try lines like "B12 180".');
      return;
    }
    const profile = readProfile();
    // Each marker is a dated event as well as a current value, so the
    // record can show how it moved rather than only where it landed.
    const entries = found.map((b) =>
      journalEntry({
        kind: "lab",
        title: `${b.name} recorded at ${b.value}`,
        detail: b.note,
        tone: b.status === "normal" ? "good" : b.status === "borderline" ? "warn" : "bad",
        metric: { name: b.name, value: parseFloat(b.value), unit: b.value.replace(/^[\d.]+\s*/, "") },
      }),
    );
    patch({
      biomarkers: mergeBiomarkers(profile.biomarkers, found),
      journal: [...(profile.journal ?? []), ...entries],
    });
    reset();
  }

  /**
   * A meal goes through the same endpoint the scanner used, in describe
   * mode. The route streams its stages as NDJSON; only the final `result`
   * frame matters here, because this panel reports the outcome rather than
   * narrating the work.
   */
  async function saveMeal() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "describe", text, profile: readProfile() }),
      });
      if (!res.ok || !res.body) throw new Error("unavailable");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let result: ScanResult | null = null;

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        // A chunk can end mid-object; the tail stays buffered until it closes.
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const ev = JSON.parse(line) as { type: string; result?: ScanResult };
            if (ev.type === "result" && ev.result) result = ev.result;
          } catch {
            /* one malformed frame must not discard a result already in hand */
          }
        }
      }

      if (!result) throw new Error("no result");
      addMeal(toLoggedMeal(result));
      reset();
    } catch {
      setMsg("Could not read that meal. Try naming the foods and portions.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="px-4 py-3.5">
      <h3 className="mb-2.5 t-label font-medium uppercase tracking-[0.13em] text-[var(--text-dim)]">
        Add to record
      </h3>

      <div className="flex gap-1.5">
        {(["meal", "labs"] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(mode === m ? null : m);
              setText("");
              setMsg(null);
            }}
            aria-expanded={mode === m}
            className={`flex-1 rounded-lg border px-2 py-1.5 t-label transition focus-ring ${
              mode === m
                ? "border-[var(--border-strong)] bg-[var(--surface-2)] text-[var(--text)]"
                : "border-[var(--border)] text-[var(--text-dim)] hover:text-[var(--text)]"
            }`}
          >
            {m === "meal" ? "Meal" : "Lab report"}
          </button>
        ))}
      </div>

      <AnimatePresence initial={false}>
        {mode && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={mode === "labs" ? 3 : 2}
              placeholder={
                mode === "meal" ? "2 rotis, a katori of dal and curd" : "B12 180\nVitamin D 34"
              }
              className="mt-2 w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 t-meta text-[var(--text)] outline-none placeholder:text-[var(--text-dim)] focus:border-[var(--border-strong)]"
            />
            <button
              type="button"
              disabled={busy || !text.trim()}
              onClick={mode === "meal" ? saveMeal : saveLabs}
              className="mt-1.5 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface-2)] px-2 py-1.5 t-label text-[var(--text)] transition disabled:opacity-40 focus-ring"
            >
              {busy ? "Reading…" : mode === "meal" ? "Log this meal" : "Save results"}
            </button>
            {msg && <p className="mt-1.5 t-label text-[var(--amber)]">{msg}</p>}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

export default function PatientChart() {
  const [profile] = useProfile();
  const [meals] = useMeals();

  const bmi = useMemo(() => {
    const m = profile.heightCm / 100;
    return m > 0 ? (profile.weightKg / (m * m)).toFixed(1) : "—";
  }, [profile.heightCm, profile.weightKg]);

  const events = useMemo(() => buildTimeline(profile, meals).slice(0, 6), [profile, meals]);
  const logged = todaySummary(profile, meals).logged;

  /* Abnormal first: a chart is read for what is out of range. */
  const labs = useMemo(
    () =>
      [...profile.biomarkers].sort(
        (a, b) => (a.status === "normal" ? 1 : 0) - (b.status === "normal" ? 1 : 0),
      ),
    [profile.biomarkers],
  );
  const flagged = labs.filter((b) => b.status !== "normal").length;

  return (
    <div className="flex h-full flex-col overflow-y-auto scroll-thin">
      {/*
        The patient banner. Every clinical screen opens with who this is
        and the handful of constants the rest of the screen is read
        against — here, the body the numbers below belong to.
      */}
      <header className="border-b border-[var(--border)] px-4 py-3.5">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="t-title text-[var(--text)]">{profile.name || "Unnamed"}</h2>
          <span className="t-label tabular-nums text-[var(--text-dim)]">
            {profile.age ? `${profile.age} y` : "—"}
            {profile.sex ? ` · ${profile.sex[0].toUpperCase()}` : ""}
          </span>
        </div>
        <p className="t-label mt-1 tabular-nums text-[var(--text-dim)]">
          {profile.heightCm} cm · {profile.weightKg} kg · BMI {bmi}
        </p>
        {profile.goal && (
          <p className="t-label mt-2 inline-flex rounded border border-[var(--border)] px-1.5 py-0.5 text-[var(--text-muted)]">
            {profile.goal}
          </p>
        )}
      </header>

      <Section title="Today" meta={`${logged} logged`}>
        <TodayBlock />
      </Section>

      <Section title="Labs" meta={flagged ? `${flagged} flagged` : undefined}>
        {labs.length ? (
          labs.map((b, i) => <LabRow key={b.name} marker={b} index={i} />)
        ) : (
          <p className="t-meta text-[var(--text-dim)]">No results on file.</p>
        )}
      </Section>

      <AddToRecord />

      <Section title="Recent">
        {events.length ? (
          <div className="space-y-2">
            {events.map((e) => (
              <div key={e.id} className="flex items-start gap-2.5">
                <span
                  aria-hidden="true"
                  className="mt-[6px] inline-block h-[5px] w-[5px] shrink-0 rounded-full"
                  style={{ background: KIND_META[e.kind].color }}
                />
                <div className="min-w-0 flex-1">
                  <p className="t-meta leading-snug text-[var(--text-muted)]">{e.title}</p>
                  <p className="t-label text-[var(--text-dim)]">{timeAgo(e.at)}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="t-meta text-[var(--text-dim)]">Nothing recorded yet.</p>
        )}
      </Section>
    </div>
  );
}
