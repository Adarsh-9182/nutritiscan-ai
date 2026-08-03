"use client";

// ============================================================
// CHARTS
//
// Every chart in this product is SINGLE-SERIES. That is a
// product decision before it is a chart decision: the vision
// says "a sentence beats a sparkline", so the written summary
// carries the meaning and the chart only has to show shape.
// One series means no legend (the title names it) and no
// categorical palette to get wrong.
//
// Fixed specs, applied everywhere:
//   - 2px lines, round cap/join
//   - end markers r=4.5 (≥8px) with a 2px surface ring, so the
//     dot stays legible where it crosses the line
//   - hairline SOLID gridlines one step off the surface — never
//     dashed, which reads as "threshold" when it's just a grid
//   - labels wear TEXT tokens, never the series colour. A light
//     amber is illegible as text; identity comes from the mark
//     beside it
//   - selective direct labels only (the endpoint, the extreme) —
//     a number on every point is chaos and goes unread
//   - every chart ships a table-view twin for screen readers and
//     for anyone who needs the actual figures
//
// The one intentional exception to "no dashed lines": the
// comfortable-floor rule on a biomarker trend. There, dashing IS
// the meaning — it marks a threshold rather than a grid — and it
// carries a visible label saying so.
// ============================================================

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";

export type Point = { t: string; v: number };

/**
 * The rendered width of a container, in CSS pixels.
 *
 * Charts need this because the obvious shortcut — a fixed
 * `viewBox` plus `preserveAspectRatio="none"` — distorts every
 * mark that is supposed to be round or upright. A sparkline with
 * a 100-unit viewBox stretched across 330px scales x by 6.6 and y
 * by 2, which turns every end-dot into a flat oval and every axis
 * label into condensed type. Drawing in true pixel space is the
 * only fix that keeps a circle a circle.
 *
 * Falls back to a sensible width before measurement so the first
 * paint isn't empty.
 */
function useMeasuredWidth(fallback: number): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(fallback);

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const next = Math.round(el.getBoundingClientRect().width);
    // Guard against 0 during layout, and against churn from
    // sub-pixel changes that would re-render on every scroll.
    if (next > 0) setWidth((prev) => (Math.abs(prev - next) > 0.5 ? next : prev));
  }, []);

  useEffect(() => {
    measure();
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);

  return [ref, width];
}

// ------------------------------------------------------------
// Geometry helpers
// ------------------------------------------------------------

type Box = { w: number; h: number; pad: number };

function scale(points: Point[], box: Box, padFraction = 0.12) {
  const values = points.map((p) => p.v);
  const min = Math.min(...values);
  const max = Math.max(...values);
  // A flat series would divide by zero and collapse to a single
  // row of pixels; give it a nominal span so the line renders
  // mid-height instead of vanishing.
  const span = max - min || Math.max(1, Math.abs(max) * 0.1);
  const lo = min - span * padFraction;
  const hi = max + span * padFraction;

  const x = (i: number) => box.pad + (i / Math.max(1, points.length - 1)) * (box.w - box.pad * 2);
  const y = (v: number) => box.h - box.pad - ((v - lo) / (hi - lo)) * (box.h - box.pad * 2);
  return { x, y, min, max, lo, hi };
}

/** Catmull-Rom → cubic Bézier. Smooth without overshooting the data. */
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return "";
  if (pts.length === 2) return `M${pts[0].x},${pts[0].y} L${pts[1].x},${pts[1].y}`;

  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    // Tension 1/6 keeps the curve inside the data envelope — a
    // higher tension would draw an energy dip lower than the
    // lowest reading, which in a health chart is a fabrication.
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${c1x},${c1y} ${c2x},${c2y} ${p2.x},${p2.y}`;
  }
  return d;
}

// ------------------------------------------------------------
// Table-view twin
//
// Rendered for every chart. Visually hidden by default because
// the figures are already in the surrounding prose, but present
// in the accessibility tree so a chart is never the only route
// to a value.
// ------------------------------------------------------------

function DataTable({ caption, unit, points, visible }: { caption: string; unit: string; points: Point[]; visible?: boolean }) {
  return (
    <table className={cn("w-full", !visible && "sr-only")}>
      <caption className="t-label mb-2 text-left text-[var(--text-3)]">{caption}</caption>
      <tbody>
        {points.map((p) => (
          <tr key={p.t} className="border-b border-[var(--border)] last:border-0">
            <th scope="row" className="t-meta py-1.5 text-left font-normal text-[var(--text-3)]">
              {p.t}
            </th>
            <td className="tnum t-meta py-1.5 text-right text-[var(--text-2)]">
              {p.v}
              {unit}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ------------------------------------------------------------
// LineChart — the shape of something over time, with a hover
// crosshair. Used for the energy curve and biomarker trends.
// ------------------------------------------------------------

export function LineChart({
  label,
  unit = "",
  points,
  markAt,
  /** A horizontal threshold rule — e.g. the floor of the comfortable range. */
  threshold,
  height = 118,
  showAxis = true,
  className,
}: {
  label: string;
  unit?: string;
  points: Point[];
  /** Emphasise one point by name — the extreme the story is about. */
  markAt?: string;
  threshold?: { value: number; label: string };
  height?: number;
  showAxis?: boolean;
  className?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const titleId = useId();
  const [wrapRef, W] = useMeasuredWidth(300);
  // The plot box excludes the axis band. Sizing the container to
  // the plot alone is what produces a card with a tiny nested
  // scrollbar cropping the x labels.
  const AXIS_BAND = showAxis ? 20 : 0;
  const box: Box = { w: W, h: height - AXIS_BAND, pad: 12 };

  const geo = useMemo(() => {
    // Include the threshold in the domain, or a rule below every
    // reading gets clipped off the bottom of the plot and the
    // trend looks like it never approaches it.
    const withThreshold = threshold ? [...points, { t: "__t", v: threshold.value }] : points;
    return scale(withThreshold, box, 0.14);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, threshold?.value, box.w, box.h]);

  const coords = points.map((p, i) => ({ x: geo.x(i), y: geo.y(p.v), ...p }));
  const path = smoothPath(coords);
  const markIndex = markAt ? points.findIndex((p) => p.t === markAt) : -1;
  const active = hover ?? (markIndex >= 0 ? markIndex : coords.length - 1);
  const activePoint = coords[active];

  return (
    <figure className={cn("m-0", className)}>
      <figcaption id={titleId} className="t-label mb-2 text-[var(--text-3)]">
        {label}
      </figcaption>

      <div ref={wrapRef} className="w-full">
      <svg
        viewBox={`0 0 ${W} ${height}`}
        width={W}
        height={height}
        className="block touch-none"
        role="img"
        aria-labelledby={titleId}
        onPointerLeave={() => setHover(null)}
        onPointerMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const rel = ((e.clientX - rect.left) / rect.width) * W;
          // Nearest-point rather than exact-hit: an 8px dot you must
          // land on dead centre is not a hover target.
          let best = 0;
          let bestD = Infinity;
          coords.forEach((c, i) => {
            const d = Math.abs(c.x - rel);
            if (d < bestD) {
              bestD = d;
              best = i;
            }
          });
          setHover(best);
        }}
      >
        {threshold && (
          <>
            {/* Dashed ON PURPOSE — this is a threshold, not a grid.
                It carries a label so it can't be read as noise. */}
            <line
              x1={box.pad}
              x2={W - box.pad}
              y1={geo.y(threshold.value)}
              y2={geo.y(threshold.value)}
              stroke="var(--chart-grid)"
              strokeWidth={1}
              strokeDasharray="3 4"
            />
            <text
              x={W - box.pad}
              y={geo.y(threshold.value) - 5}
              textAnchor="end"
              className="tnum"
              fill="var(--text-3)"
              fontSize={9.5}
            >
              {threshold.label}
            </text>
          </>
        )}

        {/* Area wash at ~10% — never a saturated block. */}
        <path
          d={`${path} L${coords[coords.length - 1].x},${box.h - box.pad} L${coords[0].x},${box.h - box.pad} Z`}
          fill="var(--chart-line)"
          opacity={0.09}
        />

        <path d={path} fill="none" stroke="var(--chart-line)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

        {/* Crosshair on the active point. */}
        {activePoint && (
          <line
            x1={activePoint.x}
            x2={activePoint.x}
            y1={box.pad * 0.5}
            y2={box.h - box.pad}
            stroke="var(--chart-grid)"
            strokeWidth={1}
          />
        )}

        {/* End marker: r=4.5 with a 2px surface ring. */}
        {activePoint && (
          <>
            <circle cx={activePoint.x} cy={activePoint.y} r={6.5} fill="var(--surface)" />
            <circle cx={activePoint.x} cy={activePoint.y} r={4.5} fill="var(--chart-line)" />
          </>
        )}

        {showAxis &&
          points.map((p, i) => {
            // Thin the axis so labels can't collide on a narrow phone.
            const step = Math.ceil(points.length / 4);
            if (i % step !== 0 && i !== points.length - 1) return null;
            return (
              <text
                key={p.t}
                x={geo.x(i)}
                y={height - 5}
                textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"}
                className="tnum"
                fill="var(--text-3)"
                fontSize={10}
              >
                {p.t}
              </text>
            );
          })}
      </svg>
      </div>

      {/* The value readout. Lives outside the SVG so it wears real
          text tokens and inherits the app's font metrics. */}
      {activePoint && (
        <p className="t-meta mt-1 text-[var(--text-3)]">
          <span className="text-[var(--text-2)]">{activePoint.t}</span>{" "}
          <span className="tnum text-[var(--text)]">
            {activePoint.v}
            {unit}
          </span>
        </p>
      )}

      <DataTable caption={`${label} — full values`} unit={unit} points={points} />
    </figure>
  );
}

// ------------------------------------------------------------
// RangeBar — where a value sits along its reference interval.
//
// The single most important chart in the product, because it is
// the one that replaces a red "HIGH" flag. It shows POSITION,
// never pass/fail: the comfortable band is drawn as a region you
// would rather be in, not as a boundary you failed to clear.
// ------------------------------------------------------------

export function RangeBar({
  value,
  axis,
  comfortable,
  unit,
  label,
  className,
}: {
  value: number;
  axis: [number, number];
  comfortable: [number, number];
  unit: string;
  label: string;
  className?: string;
}) {
  const [lo, hi] = axis;
  const span = hi - lo || 1;
  const pos = Math.min(1, Math.max(0, (value - lo) / span));
  const bandStart = Math.min(1, Math.max(0, (comfortable[0] - lo) / span));
  const bandEnd = Math.min(1, Math.max(0, (comfortable[1] - lo) / span));

  return (
    <div className={cn("", className)}>
      <div
        className="relative h-2.5 w-full overflow-hidden rounded-[var(--r-full)] bg-[var(--surface-3)]"
        role="img"
        aria-label={`${label}: ${value} ${unit}. Reference range ${lo} to ${hi}. Comfortable range ${comfortable[0]} to ${comfortable[1]}.`}
      >
        {/* The comfortable region. Muted green: "you'd rather be
            here", not "you passed". */}
        <div
          className="absolute inset-y-0 bg-[var(--steady)] opacity-45"
          style={{ left: `${bandStart * 100}%`, width: `${Math.max(0, bandEnd - bandStart) * 100}%` }}
        />
        {/* Everything below the comfortable band, tinted amber —
            the region the value is actually in. */}
        {pos < bandStart && (
          <div className="absolute inset-y-0 left-0 bg-[var(--attention)] opacity-40" style={{ width: `${bandStart * 100}%` }} />
        )}
        {pos > bandEnd && (
          <div
            className="absolute inset-y-0 bg-[var(--attention)] opacity-40"
            style={{ left: `${bandEnd * 100}%`, right: 0 }}
          />
        )}
        {/* The value marker: a 2px rule with a surface ring either
            side so it reads against any band it lands on. */}
        <div
          className="absolute inset-y-[-3px] w-[6px] -translate-x-1/2 rounded-full border-2 border-[var(--surface)] bg-[var(--text)]"
          style={{ left: `${pos * 100}%` }}
        />
      </div>

      <div className="mt-2 flex items-center justify-between">
        <span className="tnum t-meta text-[var(--text-3)]">{lo}</span>
        <span className="t-meta text-[var(--text-3)]">
          Comfortable: <span className="tnum">{comfortable[0]}–{comfortable[1]}</span>
        </span>
        <span className="tnum t-meta text-[var(--text-3)]">{hi}</span>
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// ScoreRing — a meal's fit for this person, 0–100.
// ------------------------------------------------------------

export function ScoreRing({ score, size = 56, label }: { score: number; size?: number; label: string }) {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score)) / 100;

  // Tone by band, and always beside a text label — colour alone
  // never carries the verdict.
  const stroke = score >= 70 ? "var(--steady)" : score >= 45 ? "var(--attention)" : "var(--accent)";

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} role="img" aria-label={`${label}: ${score} out of 100`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={3} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={stroke}
          strokeWidth={3}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className="ns-draw"
          style={{ ["--dash" as string]: `${c}` }}
        />
      </svg>
      <span className="tnum absolute inset-0 grid place-items-center text-[15px] font-[620] text-[var(--text)]">
        {score}
      </span>
    </div>
  );
}

// ------------------------------------------------------------
// Meter — a linear progress bar with a stated target.
// ------------------------------------------------------------

export function Meter({
  value,
  target,
  label,
  unit = "g",
  tone = "accent",
}: {
  value: number;
  target: number;
  label: string;
  unit?: string;
  tone?: "accent" | "steady";
}) {
  const pct = Math.max(0, Math.min(1, target > 0 ? value / target : 0));
  const fill = tone === "steady" ? "var(--steady)" : "var(--accent)";

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className="t-meta text-[var(--text-2)]">{label}</span>
        <span className="tnum t-meta text-[var(--text)]">
          {value} / {target} {unit}
        </span>
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-[var(--r-full)] bg-[var(--surface-3)]"
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={target}
        aria-label={label}
      >
        <div
          className="h-full rounded-[var(--r-full)] transition-[width] duration-[var(--dur-5)] ease-[var(--ease-out)]"
          style={{ width: `${pct * 100}%`, background: fill }}
        />
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// Sparkline — a stat tile's trend. No axis, no labels; the tile's
// own value and delta carry the numbers.
// ------------------------------------------------------------

export function Sparkline({ points, height = 30, className }: { points: Point[]; height?: number; className?: string }) {
  const [wrapRef, W] = useMeasuredWidth(160);
  const box: Box = { w: W, h: height, pad: 4 };
  const geo = scale(points, box, 0.2);
  const coords = points.map((p, i) => ({ x: geo.x(i), y: geo.y(p.v) }));
  const last = coords[coords.length - 1];

  return (
    <div ref={wrapRef} className={cn("w-full", className)}>
    <svg viewBox={`0 0 ${W} ${height}`} width={W} height={height} className="block" aria-hidden="true">
      <path d={smoothPath(coords)} fill="none" stroke="var(--chart-line)" strokeWidth={2} strokeLinecap="round" />
      {last && (
        <>
          <circle cx={last.x} cy={last.y} r={4} fill="var(--surface)" />
          <circle cx={last.x} cy={last.y} r={2.5} fill="var(--chart-line)" />
        </>
      )}
    </svg>
    </div>
  );
}
