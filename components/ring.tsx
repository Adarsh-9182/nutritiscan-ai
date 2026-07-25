"use client";

import { motion, useReducedMotion } from "motion/react";

/**
 * Animated progress ring — shared by the dashboard and the scanner.
 *
 * The ring is the primary readout on both surfaces (health score, fit score,
 * protein progress), so it carries a real accessible name rather than leaving
 * a screen reader to stitch meaning out of two loose `<p>` elements.
 */
export default function Ring({
  value,
  max = 100,
  size = 132,
  stroke = 10,
  color = "var(--emerald)",
  label,
  sub,
  /** Overrides the generated announcement when the visual label is ambiguous. */
  ariaLabel,
}: {
  value: number;
  max?: number;
  size?: number;
  stroke?: number;
  color?: string;
  label: string;
  sub?: string;
  ariaLabel?: string;
}) {
  const reduceMotion = useReducedMotion();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const safeValue = Number.isFinite(value) ? value : 0;
  const pct = Math.max(0, Math.min(1, max > 0 ? safeValue / max : 0));
  const offset = c * (1 - pct);

  return (
    <div
      className="relative grid place-items-center"
      style={{ width: size, height: size }}
      role="img"
      aria-label={ariaLabel ?? `${label}${sub ? ` ${sub}` : ""}`}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true" focusable="false">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.07)" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          // A ring sweeping into place is decorative; the number is the content.
          initial={reduceMotion ? false : { strokeDashoffset: c }}
          animate={{ strokeDashoffset: offset }}
          transition={reduceMotion ? { duration: 0 } : { duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
          style={{ filter: `drop-shadow(0 0 10px ${color}80)` }}
        />
      </svg>
      <div className="absolute text-center" aria-hidden="true">
        <p className="text-3xl font-semibold" style={{ color }}>
          {label}
        </p>
        {sub && <p className="text-[11px] text-[var(--text-dim)]">{sub}</p>}
      </div>
    </div>
  );
}
