"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";

/**
 * One nav for every surface. Where you are and where you can go should never
 * be a question, and moving between the two workspaces is always one click.
 */
const LINKS = [
  // Chat leads. The product is the consultation; everything else is a view
  // onto what the consultation produced. Leaving it out of the nav — its only
  // door was an "Expand" link inside the dashboard panel — made the main
  // surface the hardest one to reach.
  { href: "/chat", label: "Chat" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/scan", label: "Scan" },
  { href: "/timeline", label: "Timeline" },
];

export default function Nav({ status, width = "max-w-7xl" }: { status?: { tone: "good" | "warn"; label: string }; width?: string }) {
  const pathname = usePathname();

  return (
    /*
     * A bar, not a floating pill.
     *
     * A rounded capsule hovering above the content reads as a widget placed
     * on a page. Application chrome sits flush at the top with a hairline
     * under it and lets the page scroll beneath — which is also what makes
     * the panels below look like they belong to something.
     */
    <nav
      aria-label="Primary"
      className="sticky top-0 z-40 -mx-4 mb-5 border-b border-[var(--border)] bg-[color-mix(in_oklab,var(--bg)_88%,transparent)] px-4 py-2.5 backdrop-blur-md sm:-mx-6 sm:px-6"
    >
      {/* The bar spans the viewport; its contents stay on the page's measure,
          so the logo lines up with the first card under it. */}
      <div className={`mx-auto flex ${width} items-center justify-between`}>
      <Link href="/" className="flex shrink-0 items-center gap-2 rounded-lg px-1 py-1 focus-ring" aria-label="NutritiScan home">
        {/* The one place brand colour is spent. Everything else in the chrome
            is grey so the data can be the thing with hue. */}
        <span className="grid h-6 w-6 place-items-center rounded-md bg-[linear-gradient(135deg,var(--emerald),var(--cyan))] text-[11px] font-bold text-[#04120c]">N</span>
        <span className="hidden text-[13px] font-semibold tracking-tight sm:inline">
          NutritiScan <span className="font-normal text-[var(--text-dim)]">Health OS</span>
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
          <span className="hidden items-center gap-1.5 rounded-full border border-[var(--border)] px-2.5 py-1 t-label text-[var(--text-muted)] sm:flex">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: status.tone === "good" ? "var(--emerald)" : "var(--amber)" }} />
            {status.label}
          </span>
        )}
      </div>
      </div>
    </nav>
  );
}
