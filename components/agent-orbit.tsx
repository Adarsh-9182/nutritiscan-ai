"use client";

import { motion, useReducedMotion } from "motion/react";
import { AGENTS, agentColor, agentGlyph, agentName } from "@/lib/agents-meta";

/**
 * The team, drawn.
 *
 * The chat has always said "five specialists read every message" in a line
 * of grey text nobody reads. This is the same claim as a picture: the
 * Supervisor in the middle, the five specialists it can call on around it,
 * and the lines between them. It is decoration on the empty screen and a
 * live status readout during a turn — the two components below share one
 * vocabulary so the reader learns it once.
 */

const RADIUS = 118;
const SIZE = 320;

function position(i: number) {
  // Start at the top and go clockwise, so the first specialist is where the eye lands.
  const angle = (i / AGENTS.length) * Math.PI * 2 - Math.PI / 2;
  return { x: SIZE / 2 + Math.cos(angle) * RADIUS, y: SIZE / 2 + Math.sin(angle) * RADIUS };
}

export function AgentConstellation({ onPick }: { onPick?: (agentId: string) => void }) {
  const reduce = useReducedMotion();
  const c = SIZE / 2;

  return (
    <div className="ns-orbit relative mx-auto" style={{ width: SIZE, height: SIZE }} aria-hidden={!onPick}>
      <svg width={SIZE} height={SIZE} className="absolute inset-0" aria-hidden>
        <defs>
          <radialGradient id="ns-core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#6fe8b4" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#6fe8b4" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx={c} cy={c} r={RADIUS} fill="none" stroke="rgba(255,255,255,0.08)" strokeDasharray="2 6" />
        <circle cx={c} cy={c} r={RADIUS + 34} fill="none" stroke="rgba(255,255,255,0.04)" />
        <circle cx={c} cy={c} r={70} fill="url(#ns-core)" />
        {AGENTS.map((a, i) => {
          const p = position(i);
          return (
            <g key={a.id}>
              <line x1={c} y1={c} x2={p.x} y2={p.y} stroke={a.color} strokeOpacity="0.18" strokeWidth="1" />
              {/* A signal travelling out to each specialist, staggered. */}
              {!reduce && (
                <motion.circle
                  r="2.2"
                  fill={a.color}
                  initial={{ cx: c, cy: c, opacity: 0 }}
                  animate={{ cx: [c, p.x], cy: [c, p.y], opacity: [0, 1, 0] }}
                  transition={{ duration: 2.2, repeat: Infinity, delay: i * 0.44, ease: "easeInOut" }}
                />
              )}
            </g>
          );
        })}
      </svg>

      {/* The Supervisor. */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        {!reduce && <span className="ns-orbit-ring" />}
        <div className="relative grid h-20 w-20 place-items-center rounded-full border border-[rgba(111,232,180,0.45)] bg-[radial-gradient(circle_at_30%_30%,#1d3b30,#08110d)] shadow-[0_0_60px_-8px_rgba(111,232,180,0.6)]">
          <div className="text-center">
            <div className="text-xl leading-none text-[var(--emerald)]">✦</div>
            <div className="mt-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Supervisor</div>
          </div>
        </div>
      </div>

      {AGENTS.map((a, i) => {
        const p = position(i);
        const Tag = onPick ? "button" : "div";
        return (
          <motion.div
            key={a.id}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: p.x, top: p.y }}
            initial={reduce ? false : { opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.15 + i * 0.08, type: "spring", stiffness: 260, damping: 20 }}
          >
            <Tag
              {...(onPick ? { type: "button" as const, onClick: () => onPick(a.id), title: `${a.name} — ${a.tagline}` } : {})}
              className="group flex flex-col items-center gap-1 rounded-2xl focus-ring"
            >
              <span
                className="grid h-12 w-12 place-items-center rounded-2xl border text-lg backdrop-blur transition group-hover:scale-110"
                style={{ borderColor: `${a.color}66`, background: `${a.color}1a`, boxShadow: `0 0 28px -6px ${a.color}` }}
              >
                {a.glyph}
              </span>
              <span className="whitespace-nowrap text-[10.5px] font-medium" style={{ color: a.color }}>
                {a.name.replace(" Agent", "")}
              </span>
            </Tag>
          </motion.div>
        );
      })}
    </div>
  );
}

type Phase = "reading" | "consulting" | "writing" | "done";

/**
 * What the team is doing on this turn, as it happens.
 *
 * Derived only from what the stream has actually reported — the trace part
 * (keyless path) or the ask* tool calls (real supervisor) — plus whether any
 * answer text has arrived. It never invents a specialist that was not
 * called, so it is a readout, not an animation of one.
 */
export function AgentRun({
  agents,
  consultDone,
  hasText,
  live,
}: {
  agents: string[];
  consultDone: boolean;
  hasText: boolean;
  live: boolean;
}) {
  const reduce = useReducedMotion();
  const phase: Phase = !live ? "done" : hasText ? "writing" : agents.length && !consultDone ? "consulting" : agents.length ? "writing" : "reading";

  const steps: { key: Phase; label: string }[] = [
    { key: "reading", label: "Supervisor reads" },
    { key: "consulting", label: agents.length ? `Consults ${agents.length === 1 ? "1 specialist" : `${agents.length} specialists`}` : "Routes" },
    { key: "writing", label: "Writes the answer" },
  ];
  const order: Phase[] = ["reading", "consulting", "writing", "done"];
  const at = order.indexOf(phase);

  return (
    <div className="ns-run mb-3 overflow-hidden rounded-2xl border border-[var(--border)] bg-[color-mix(in_oklab,var(--surface)_70%,transparent)] backdrop-blur">
      <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2">
        <span className="relative grid h-5 w-5 place-items-center">
          {live && !reduce && <span className="absolute inset-0 animate-ping rounded-full bg-[var(--emerald)] opacity-30" />}
          <span className="relative h-2 w-2 rounded-full" style={{ background: live ? "var(--emerald)" : "var(--text-dim)" }} />
        </span>
        <span className="t-label font-medium text-[var(--text)]">{live ? "Agent team working" : "Agent team"}</span>
        <span className="ml-auto flex items-center gap-2">
          {steps.map((s, i) => {
            const state = i < at ? "done" : i === at ? "active" : "todo";
            return (
              <span key={s.key} className="hidden items-center gap-1 t-label sm:inline-flex" style={{ color: state === "todo" ? "var(--text-dim)" : state === "active" ? "var(--emerald)" : "var(--text-muted)" }}>
                <span aria-hidden>{state === "done" ? "✓" : state === "active" ? "●" : "○"}</span>
                {s.label}
              </span>
            );
          })}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
        <AgentPill id="supervisor" active={live && (phase === "reading" || phase === "writing")} done={!live} />
        {agents.length > 0 && (
          <>
            <span className="relative h-px w-6 overflow-hidden bg-[var(--border-strong)]" aria-hidden>
              {live && !consultDone && !reduce && (
                <motion.span className="absolute inset-y-0 w-2 bg-[var(--emerald)]" animate={{ x: [-8, 24] }} transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }} />
              )}
            </span>
            {agents.map((a, i) => (
              <motion.span key={a} initial={reduce ? false : { opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08 }}>
                <AgentPill id={a} active={live && !consultDone} done={consultDone || !live} />
              </motion.span>
            ))}
          </>
        )}
        {live && phase === "reading" && <span className="t-label text-[var(--text-dim)]">deciding who should answer…</span>}
      </div>
    </div>
  );
}

function AgentPill({ id, active, done }: { id: string; active: boolean; done: boolean }) {
  const reduce = useReducedMotion();
  const color = id === "supervisor" ? "#6fe8b4" : agentColor(id);
  return (
    <span
      className="relative inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium"
      style={{ borderColor: `${color}${active ? "aa" : "44"}`, background: `${color}${active ? "22" : "10"}`, color }}
    >
      {active && !reduce && (
        <motion.span
          className="absolute inset-0 rounded-full"
          style={{ boxShadow: `0 0 18px ${color}` }}
          animate={{ opacity: [0.2, 0.8, 0.2] }}
          transition={{ duration: 1.3, repeat: Infinity }}
          aria-hidden
        />
      )}
      <span aria-hidden>{id === "supervisor" ? "✦" : agentGlyph(id)}</span>
      {id === "supervisor" ? "Supervisor" : agentName(id)}
      {done && <span aria-hidden className="opacity-70">✓</span>}
    </span>
  );
}
