"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";

/**
 * One nav for every surface. Where you are and where you can go should never
 * be a question, and moving between the two workspaces is always one click.
 */
const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/scan", label: "Scan" },
];

export default function Nav({ status }: { status?: { tone: "good" | "warn"; label: string } }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Primary" className="mx-auto mb-5 flex max-w-7xl items-center justify-between rounded-full glass px-3 py-2 sm:px-4">
      <Link href="/" className="flex shrink-0 items-center gap-2 rounded-full px-1 py-1 focus-ring" aria-label="NutritiScan home">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-[linear-gradient(135deg,var(--emerald),var(--cyan))] text-sm font-bold text-[#04120c]">N</span>
        <span className="hidden text-sm font-semibold sm:inline">
          NutritiScan <span className="text-[var(--text-dim)]">Health OS</span>
        </span>
      </Link>

      <div className="flex items-center gap-1 rounded-full border border-[var(--border)] p-1">
        {LINKS.map((l) => {
          const active = pathname === l.href;
          return (
            <Link
              key={l.href}
              href={l.href}
              aria-current={active ? "page" : undefined}
              className={`relative rounded-full px-3.5 py-1.5 text-xs transition focus-ring ${active ? "text-white" : "text-[var(--text-dim)] hover:text-white"}`}
            >
              {active && <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-full bg-[var(--surface-2)]" transition={{ type: "spring", stiffness: 380, damping: 32 }} />}
              <span className="relative">{l.label}</span>
            </Link>
          );
        })}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {status && (
          <span className="hidden items-center gap-1.5 rounded-full border border-[var(--border)] px-2.5 py-1 text-[11px] text-[var(--text-muted)] sm:flex">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: status.tone === "good" ? "var(--emerald)" : "var(--amber)" }} />
            {status.label}
          </span>
        )}
      </div>
    </nav>
  );
}
