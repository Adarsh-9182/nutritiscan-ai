"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import Ring from "@/components/ring";
import MealList from "@/components/meal-list";
import { proteinTarget, type ScanResult } from "@/lib/nutrition/analyze";
import { useMeals, useProfile, readProfile } from "@/lib/memory/store";
import { dayTotals, mealsOn, toLoggedMeal } from "@/lib/memory/meals";

type Stage = { id: string; label: string; status: "active" | "done" };
type Mode = "photo" | "describe";

const EXAMPLES = ["2 rotis, dal and a bowl of curd", "150g grilled chicken with rice and salad", "Masala dosa and a chai", "Maggi and a coke", "3 eggs, 2 brown bread toast, banana"];

const GRADE_COLOR: Record<ScanResult["grade"], string> = {
  excellent: "var(--emerald)",
  solid: "var(--cyan)",
  okay: "var(--amber)",
  heavy: "var(--rose)",
};

/** Shrink and re-encode in the browser so we ship a small payload, not a 12 MP photo. */
async function prepareImage(file: File): Promise<{ base64: string; mediaType: string; preview: string }> {
  const dataUrl = await new Promise<string>((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result));
    fr.onerror = () => rej(new Error("Could not read that file."));
    fr.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new window.Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error("That doesn't look like an image."));
    i.src = dataUrl;
  });

  const MAX = 1152;
  const scale = Math.min(1, MAX / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")?.drawImage(img, 0, 0, w, h);
  const out = canvas.toDataURL("image/jpeg", 0.82);
  return { base64: out.split(",")[1] ?? "", mediaType: "image/jpeg", preview: out };
}

/* ---------- small presentational pieces ---------- */

function MacroBar({ label, grams, kcalPerG, total, color }: { label: string; grams: number; kcalPerG: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round(((grams * kcalPerG) / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-[var(--text-muted)]">{label}</span>
        <span className="font-medium" style={{ color }}>
          {grams} g <span className="text-[var(--text-dim)]">· {pct}%</span>
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]">
        <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }} className="h-full rounded-full" style={{ background: color }} />
      </div>
    </div>
  );
}

function FlagRow({ tone, text }: { tone: "good" | "warn" | "bad"; text: string }) {
  const color = tone === "good" ? "var(--emerald)" : tone === "warn" ? "var(--amber)" : "var(--rose)";
  const glyph = tone === "good" ? "✓" : tone === "warn" ? "!" : "✕";
  return (
    <div className="flex gap-2.5 rounded-xl px-3 py-2" style={{ background: `color-mix(in oklab, ${color} 9%, transparent)` }}>
      <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full t-label font-bold" style={{ background: `${color}30`, color }}>
        {glyph}
      </span>
      <p className="text-xs leading-relaxed text-[var(--text-muted)]">{text}</p>
    </div>
  );
}

/* ---------- the scanner ---------- */

export default function Scan() {
  const [profile] = useProfile();
  const [meals, setMeals, addMeal] = useMeals();
  const [userMode, setUserMode] = useState<Mode | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [stages, setStages] = useState<Stage[]>([]);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [logged, setLogged] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [vision, setVision] = useState<boolean | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  // A ref, not `busy` state, so `run` keeps a stable identity — otherwise
  // every consumer that depends on it is rebuilt twice per scan.
  const runningRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    fetch("/api/scan", { signal: ac.signal })
      .then((r) => r.json())
      .then((d: { vision: boolean }) => setVision(!!d.vision))
      .catch(() => {});
    return () => ac.abort();
  }, []);

  // Leaving mid-scan must not leave a stream running and setState firing
  // into an unmounted tree.
  useEffect(() => () => abortRef.current?.abort(), []);

  const reset = () => {
    setResult(null);
    setError(null);
    setStages([]);
    setLogged(false);
  };

  const run = useCallback(
    async (payload: { mode: Mode; text?: string; image?: { base64: string; mediaType: string; filename?: string } }) => {
      if (runningRef.current) return;
      runningRef.current = true;
      reset();
      setBusy(true);

      const ac = new AbortController();
      abortRef.current = ac;

      try {
        const res = await fetch("/api/scan", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...payload, profile: readProfile() }),
          signal: ac.signal,
        });

        // A 429 or 413 returns JSON, not a stream — surface what it says
        // instead of failing with a generic message.
        if (!res.ok) {
          const detail = await res.json().catch(() => null);
          throw new Error(detail?.error ?? "The scanner is unavailable right now. Try again in a moment.");
        }
        if (!res.body) throw new Error("No response from the scanner.");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            // One malformed frame must not discard a result that already arrived.
            let ev: { type: string; id?: string; label?: string; status?: Stage["status"]; result?: ScanResult; message?: string };
            try {
              ev = JSON.parse(line);
            } catch {
              continue;
            }
            if (ev.type === "stage" && ev.id && ev.label && ev.status) {
              const stage = { id: ev.id, label: ev.label, status: ev.status };
              setStages((prev) => (prev.some((s) => s.id === stage.id) ? prev.map((s) => (s.id === stage.id ? stage : s)) : [...prev, stage]));
            } else if (ev.type === "result" && ev.result) {
              setResult(ev.result);
            } else if (ev.type === "error") {
              setError(ev.message ?? "Something went wrong.");
              setStages([]);
            }
          }
        }
      } catch (e) {
        if ((e as Error)?.name === "AbortError") return; // deliberate cancel
        setError(e instanceof Error ? e.message : "Something went wrong analysing that meal.");
        setStages([]);
      } finally {
        runningRef.current = false;
        abortRef.current = null;
        setBusy(false);
      }
    },
    [],
  );

  const cancel = () => abortRef.current?.abort();

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("image/")) {
        setError("That's not an image — try a JPEG or PNG of your plate.");
        return;
      }
      try {
        const { base64, mediaType, preview: p } = await prepareImage(file);
        setPreview(p);
        setUserMode("photo");
        await run({ mode: "photo", image: { base64, mediaType, filename: file.name } });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not read that image.");
      }
    },
    [run],
  );

  const logMeal = () => {
    if (!result || logged) return;
    addMeal(toLoggedMeal(result));
    setLogged(true);
  };

  // Photo mode is the hero, but only when it can actually see. Until we know
  // vision is available, open on Describe — which is always real.
  const mode: Mode = userMode ?? (vision ? "photo" : "describe");

  const today = dayTotals(meals);
  const todayMeals = mealsOn(meals).slice().reverse();
  // Must come from the one function that knows the goal multiplier. Hardcoding
  // 1.8 here meant a "Lose fat" user saw a target on /scan that disagreed with
  // the ring on /dashboard.
  const proteinGoal = proteinTarget(profile);

  // No `bg-aurora` on the page wrapper — <body> already carries it. Re-applying
  // it stacked a second set of fixed gradient layers, so /scan and /timeline
  // rendered at double the intensity of /dashboard.
  return (
    <div className="app-page px-4 pt-6 sm:px-6">
      <a href="#scan-analysis" className="sr-only skip-link">
        Skip to the analysis
      </a>

      {/*
        The capture-mode status used to live in the top nav's status pill.
        The dock has no room for it and it is not decoration: it is the
        difference between "the vision model read your photo" and "we fell
        back to parsing your description", which changes how much to trust
        the numbers below. It moves here, next to the thing it describes.
      */}
      <header className="mx-auto mb-4 flex max-w-6xl items-center justify-between gap-3">
        <h1 className="a-h1">Scan</h1>
        {vision !== null && (
          <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--border-strong)] px-2.5 py-1 t-label text-[var(--text-muted)]">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full" style={{ background: vision ? "var(--emerald)" : "var(--amber)" }} />
            {vision ? "Vision online" : "Describe mode"}
          </span>
        )}
      </header>

      <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-12">
        {/* LEFT — capture */}
        <div className="space-y-4 lg:col-span-5">
          <div className="rounded-[var(--radius)] glass p-5">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="t-hero">Scan a meal</h1>
                <p className="t-label text-[var(--text-dim)]">
                  personalised to {profile.name} · {profile.goal.toLowerCase()}
                </p>
              </div>
              <div className="flex rounded-full border border-[var(--border-strong)] p-0.5 t-label">
                {(["photo", "describe"] as Mode[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={mode === m}
                    onClick={() => {
                      setUserMode(m);
                      reset();
                    }}
                    className={`rounded-full px-3 py-1 capitalize transition ${mode === m ? "bg-[var(--surface-2)] text-white" : "text-[var(--text-dim)] hover:text-white"}`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            <AnimatePresence mode="wait">
              {mode === "photo" ? (
                <motion.div key="photo" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="mt-4">
                  {/*
                    A real button element, not a div with onClick: this is the
                    primary action of the page and was previously unreachable by
                    keyboard and invisible to assistive tech. Drag-and-drop is
                    layered on top of it rather than replacing it.
                  */}
                  <button
                    type="button"
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragging(true);
                    }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragging(false);
                      const f = e.dataTransfer.files?.[0];
                      if (f) void handleFile(f);
                    }}
                    onClick={() => fileRef.current?.click()}
                    disabled={busy}
                    aria-label={preview ? "Replace the meal photo" : "Choose a photo of your plate to scan"}
                    className={`relative grid w-full cursor-pointer place-items-center overflow-hidden rounded-2xl border border-dashed transition disabled:cursor-not-allowed ${
                      dragging ? "border-[var(--emerald)] bg-[color-mix(in_oklab,var(--emerald)_10%,transparent)]" : "border-[var(--border-strong)] bg-[var(--surface)] hover:bg-[var(--surface-2)]"
                    }`}
                    style={{ minHeight: 220 }}
                  >
                    {preview ? (
                      <>
                        <Image src={preview} alt="Your meal" width={640} height={480} unoptimized className="h-[220px] w-full object-cover" />
                        {busy && <div className="absolute inset-0 bg-[rgba(5,7,10,.55)] backdrop-blur-[1px]" />}
                      </>
                    ) : (
                      <div className="px-6 py-8 text-center">
                        <div aria-hidden="true" className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[color-mix(in_oklab,var(--emerald)_16%,transparent)] text-xl">📸</div>
                        <p className="mt-3 text-sm font-medium">Drop a photo of your plate</p>
                        <p className="mt-1 t-label text-[var(--text-dim)]">or click to choose a file</p>
                      </div>
                    )}
                  </button>

                  <div className="mt-3 flex gap-2">
                    <button onClick={() => cameraRef.current?.click()} className="btn-ghost flex-1 rounded-xl px-3 py-2 text-xs">
                      Take a photo
                    </button>
                    <button onClick={() => fileRef.current?.click()} className="btn-ghost flex-1 rounded-xl px-3 py-2 text-xs">
                      Choose file
                    </button>
                  </div>

                  {vision === false && (
                    <p className="mt-3 rounded-xl border border-[color-mix(in_oklab,var(--amber)_35%,transparent)] bg-[color-mix(in_oklab,var(--amber)_10%,transparent)] px-3 py-2 t-label leading-relaxed text-[var(--text-muted)]">
                      No vision model configured, so photos return a clearly-labelled sample. <strong className="text-white">Describe</strong> mode is fully real and works offline — every number there is computed from the food database.
                    </p>
                  )}

                  <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && void handleFile(e.target.files[0])} />
                  <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => e.target.files?.[0] && void handleFile(e.target.files[0])} />
                </motion.div>
              ) : (
                <motion.div key="describe" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="mt-4">
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void run({ mode: "describe", text });
                    }}
                    rows={4}
                    placeholder={"What did you eat?\ne.g. 2 rotis, a katori of dal, curd and salad"}
                    className="scroll-thin w-full resize-none rounded-2xl border border-[var(--border-strong)] bg-[var(--surface)] px-3.5 py-3 text-sm text-white outline-none transition placeholder:text-[var(--text-dim)] focus:border-[color-mix(in_oklab,var(--emerald)_50%,transparent)]"
                  />
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {EXAMPLES.map((ex) => (
                      <button
                        key={ex}
                        disabled={busy}
                        onClick={() => {
                          setText(ex);
                          void run({ mode: "describe", text: ex });
                        }}
                        className="rounded-full border border-[var(--border-strong)] bg-[var(--surface)] px-2.5 py-1 t-label text-[var(--text-muted)] transition hover:bg-[var(--surface-2)] hover:text-white disabled:opacity-40 focus-ring"
                      >
                        {ex}
                      </button>
                    ))}
                  </div>
                  <button onClick={() => void run({ mode: "describe", text })} disabled={busy || !text.trim()} className="btn-primary mt-3 w-full rounded-xl px-4 py-2.5 text-sm disabled:opacity-40">
                    {busy ? "Analysing…" : "Analyse this meal"}
                  </button>
                  <p className="mt-2 text-center t-label text-[var(--text-dim)]">Understands portions — “2 rotis”, “a katori of dal”, “200g chicken”, “a glass of milk”.</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* today's log */}
          <div className="rounded-[var(--radius)] glass p-5">
            <div className="flex items-center justify-between">
              <h2 className="t-title">Today</h2>
              <span className="t-label text-[var(--text-dim)]">
                {today.count} meal{today.count === 1 ? "" : "s"} logged
              </span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
              {[
                { k: "Calories", v: today.kcal, u: "kcal", c: "var(--cyan)" },
                { k: "Protein", v: today.protein, u: `/ ${proteinGoal} g`, c: "var(--emerald)" },
                { k: "Fibre", v: today.fiber, u: "g", c: "var(--violet)" },
              ].map((s) => (
                <div key={s.k} className="rounded-xl bg-[var(--surface-2)] py-2.5">
                  <p className="t-label text-[var(--text-dim)]">{s.k}</p>
                  <p className="mt-0.5 font-medium" style={{ color: s.c }}>
                    {s.v}
                    <span className="ml-1 t-label text-[var(--text-dim)]">{s.u}</span>
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-3">
              {todayMeals.length > 0 ? (
                <MealList meals={todayMeals} onRemove={(id) => setMeals(meals.filter((x) => x.id !== id))} />
              ) : (
                <p className="rounded-lg bg-[var(--surface-2)] px-3 py-2.5 t-label text-[var(--text-muted)]">
                  Nothing logged yet today. Scan a meal and hit “Log this meal” — your dashboard reads from here.
                </p>
              )}
            </div>
          </div>
        </div>

        {/*
          RIGHT — analysis.
          aria-live so the pipeline stages, the verdict and any error are
          announced as they stream in. Without it a screen-reader user gets
          silence through the entire scan and never learns it finished.
        */}
        <div className="lg:col-span-7">
          <div
            id="scan-analysis"
            className="min-h-[70vh] rounded-[var(--radius)] glass-strong p-5"
            aria-live="polite"
            aria-busy={busy}
          >
            {/* pipeline */}
            <AnimatePresence>
              {stages.length > 0 && !result && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, height: 0 }} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h2 className="t-title">Analysing</h2>
                    {busy && (
                      <button onClick={cancel} className="rounded-full border border-[var(--border-strong)] px-2.5 py-1 t-label text-[var(--text-dim)] transition hover:text-white focus-ring">
                        Cancel
                      </button>
                    )}
                  </div>
                  {stages.map((s) => (
                    <motion.div key={s.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-2.5 rounded-xl bg-[var(--surface-2)] px-3 py-2.5">
                      {s.status === "done" ? (
                        <span className="grid h-4 w-4 place-items-center rounded-full bg-[color-mix(in_oklab,var(--emerald)_25%,transparent)] text-[9px] text-[var(--emerald)]">✓</span>
                      ) : (
                        <motion.span className="h-4 w-4 rounded-full border-2 border-[var(--emerald)] border-t-transparent" animate={{ rotate: 360 }} transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }} />
                      )}
                      <span className={`text-xs ${s.status === "done" ? "text-[var(--text-dim)]" : "text-white"}`}>{s.label}</span>
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            {/* empty state */}
            {!stages.length && !result && !error && (
              <div className="grid min-h-[60vh] place-items-center text-center">
                <div className="max-w-sm">
                  <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[color-mix(in_oklab,var(--emerald)_16%,transparent)] text-2xl">🍽️</div>
                  <p className="mt-4 t-hero">Point it at a plate.</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-[var(--text-muted)]">
                    I&apos;ll break the meal into foods, count what&apos;s in it, and read the result against your goal, your labs, and your allergies — not a generic daily value.
                  </p>
                </div>
              </div>
            )}

            {error && (
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-2 rounded-xl border border-[color-mix(in_oklab,var(--rose)_40%,transparent)] bg-[color-mix(in_oklab,var(--rose)_10%,transparent)] px-4 py-3">
                <p className="text-sm text-[#ffd7dd]">{error}</p>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  <button
                    onClick={() => {
                      setUserMode("describe");
                      reset();
                    }}
                    className="btn-ghost rounded-lg px-3 py-1.5 text-xs"
                  >
                    Describe it instead
                  </button>
                  <button onClick={reset} className="rounded-lg px-3 py-1.5 text-xs text-[var(--text-muted)] transition hover:text-white focus-ring">
                    Dismiss
                  </button>
                </div>
              </motion.div>
            )}

            {/* result */}
            <AnimatePresence>
              {result && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                  {/* verdict header */}
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                    <Ring value={result.fitScore} size={116} stroke={9} color={GRADE_COLOR[result.grade]} label={String(result.fitScore)} sub="fit score" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="t-hero">{result.title}</h2>
                        <span className="rounded-full px-2 py-0.5 t-label font-medium capitalize" style={{ background: `color-mix(in oklab, ${GRADE_COLOR[result.grade]} 18%, transparent)`, color: GRADE_COLOR[result.grade] }}>
                          {result.grade}
                        </span>
                        <span className="rounded-full border border-[var(--border)] px-2 py-0.5 t-label text-[var(--text-dim)]">
                          {result.source === "vision" ? "from photo" : result.source === "sample" ? "sample" : "from description"}
                        </span>
                      </div>
                      <p className="mt-1.5 text-sm leading-relaxed text-[var(--text-muted)]">{result.headline}</p>
                    </div>
                  </div>

                  {result.note && <p className="rounded-xl border border-[color-mix(in_oklab,var(--amber)_35%,transparent)] bg-[color-mix(in_oklab,var(--amber)_9%,transparent)] px-3 py-2 t-label leading-relaxed text-[var(--text-muted)]">{result.note}</p>}

                  {/* macros */}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-2xl bg-[var(--surface-2)] p-4">
                      <div className="flex items-baseline justify-between">
                        <h3 className="t-title">Macros</h3>
                        <p className="text-sm font-semibold text-[var(--cyan)]">
                          {result.totals.kcal} <span className="t-label font-normal text-[var(--text-dim)]">kcal</span>
                        </p>
                      </div>
                      <div className="mt-3 space-y-2.5">
                        <MacroBar label="Protein" grams={result.totals.protein} kcalPerG={4} total={result.totals.kcal} color="var(--emerald)" />
                        <MacroBar label="Carbs" grams={result.totals.carbs} kcalPerG={4} total={result.totals.kcal} color="var(--cyan)" />
                        <MacroBar label="Fat" grams={result.totals.fat} kcalPerG={9} total={result.totals.kcal} color="var(--amber)" />
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-1.5 text-center">
                        {[
                          { k: "Fibre", v: `${result.totals.fiber} g` },
                          { k: "Sugar", v: `${result.totals.sugar} g` },
                          { k: "Sodium", v: `${result.totals.sodium} mg` },
                        ].map((x) => (
                          <div key={x.k} className="rounded-lg bg-[var(--surface)] py-1.5">
                            <p className="t-label text-[var(--text-dim)]">{x.k}</p>
                            <p className="t-label font-medium">{x.v}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-2xl bg-[var(--surface-2)] p-4">
                      <h3 className="t-title">On the plate</h3>
                      <div className="mt-3 space-y-1.5">
                        {result.items.map((it) => (
                          <div key={`${it.name}-${it.grams}`} className="flex items-center justify-between rounded-lg bg-[var(--surface)] px-3 py-2 text-xs">
                            <span className="min-w-0 flex-1 truncate">
                              {it.name}
                              {!it.matched && <span className="ml-1.5 t-label text-[var(--amber)]">est.</span>}
                            </span>
                            <span className="ml-2 shrink-0 t-label text-[var(--text-dim)]">
                              {it.grams} g · {it.kcal} kcal · {it.protein} g P
                            </span>
                          </div>
                        ))}
                      </div>
                      {result.totals.b12 > 0 && (
                        <p className="mt-3 rounded-lg bg-[var(--surface)] px-3 py-2 t-label text-[var(--text-dim)]">
                          Micros: B12 {result.totals.b12} µg · Iron {result.totals.iron} mg · Calcium {result.totals.calcium} mg
                        </p>
                      )}
                    </div>
                  </div>

                  {/* personalized flags */}
                  <div className="rounded-2xl bg-[var(--surface-2)] p-4">
                    <h3 className="t-title">
                      What this means for you<span className="ml-2 t-label font-normal text-[var(--text-dim)]">read against your Health Memory</span>
                    </h3>
                    <div className="mt-3 space-y-1.5">
                      {result.flags.map((f, i) => (
                        <motion.div key={i} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06 }}>
                          <FlagRow tone={f.tone} text={f.text} />
                        </motion.div>
                      ))}
                    </div>
                  </div>

                  {/* swaps */}
                  {result.swaps.length > 0 && (
                    <div className="rounded-2xl bg-[var(--surface-2)] p-4">
                      <h3 className="t-title">Smarter swaps</h3>
                      <div className="mt-3 grid gap-2 sm:grid-cols-3">
                        {result.swaps.map((s, i) => (
                          <div key={i} className="rounded-xl bg-[var(--surface)] p-3">
                            <p className="t-label text-[var(--text-dim)] line-through">{s.from}</p>
                            <p className="mt-0.5 text-xs font-medium text-[var(--emerald)]">{s.to}</p>
                            <p className="mt-1.5 t-label leading-relaxed text-[var(--text-muted)]">{s.why}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* actions */}
                  <div className="flex flex-wrap items-center gap-2">
                    <button onClick={logMeal} disabled={logged} className="btn-primary rounded-xl px-4 py-2.5 text-sm disabled:opacity-50">
                      {logged ? "Logged ✓" : "Log this meal"}
                    </button>
                    <button
                      onClick={() => {
                        reset();
                        setPreview(null);
                        setText("");
                      }}
                      className="btn-ghost rounded-xl px-4 py-2.5 text-sm"
                    >
                      Scan another
                    </button>
                    <Link href="/dashboard" className="btn-ghost rounded-xl px-4 py-2.5 text-sm">
                      See it on the dashboard →
                    </Link>
                  </div>

                  <p className="text-center t-label text-[var(--text-dim)]">Estimates for education, not clinical measurement · portions and cooking method change these numbers</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
