"use client";

// ============================================================
// TAB BAR
//
// Three destinations and one action. That count is the product
// argument, not a layout constraint:
//
//   Ask    — where you go with a question (the default)
//   Health — where you go to look at yourself over time
//   You    — where your records and your settings live
//
// Everything else is reached by ASKING or by SCANNING, which is
// why Scan is a raised action button rather than a fourth tab. A
// tab implies a place you browse; the camera is something you do.
//
// Plan, Records, Labs and Medicine deliberately have no tab.
// They are destinations you arrive at from an answer, which is
// what keeps the home screen a question field rather than a menu.
//
// LAYOUT: four equal slots — Ask, [scan], Health, You. The scan
// button occupies the second slot rather than the true centre,
// which is what puts even spacing between all four hit targets.
// ============================================================

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { AskIcon, HealthIcon, ScanIcon, YouIcon } from "./icons";

const TABS = [
  { href: "/", label: "Ask", Icon: AskIcon, match: (p: string) => p === "/" || p.startsWith("/ask") },
  {
    href: "/health",
    label: "Health",
    Icon: HealthIcon,
    match: (p: string) => p.startsWith("/health") || p.startsWith("/plan") || p.startsWith("/labs"),
  },
  {
    href: "/you",
    label: "You",
    Icon: YouIcon,
    match: (p: string) => p.startsWith("/you") || p.startsWith("/records") || p.startsWith("/medicine"),
  },
] as const;

export function TabBar() {
  const pathname = usePathname() ?? "/";

  return (
    <nav
      aria-label="Primary"
      className="blur-bar fixed inset-x-0 bottom-0 z-40 mx-auto max-w-[var(--app-max)] border-t border-[var(--border)]"
      style={{ paddingBottom: "var(--safe-b)" }}
    >
      <ul className="grid h-[var(--tabbar-h)] grid-cols-4 items-center">
        <TabItem tab={TABS[0]} active={TABS[0].match(pathname)} />

        {/* Slot 2 — the raised scan action. `relative` on the li so
            the button can lift above the bar without leaving the
            grid flow and collapsing the column. */}
        <li className="relative grid h-full place-items-center">
          <Link
            href="/scan"
            aria-label="Scan food, a label, a report or a medicine"
            className={cn(
              "absolute -top-5 grid size-14 place-items-center rounded-full",
              "bg-[var(--accent)] text-[var(--accent-ink)] shadow-[var(--shadow-accent)]",
              "transition-transform duration-[var(--dur-1)] active:scale-95",
            )}
          >
            <ScanIcon size={24} strokeWidth={1.9} />
          </Link>
        </li>

        <TabItem tab={TABS[1]} active={TABS[1].match(pathname)} />
        <TabItem tab={TABS[2]} active={TABS[2].match(pathname)} />
      </ul>
    </nav>
  );
}

function TabItem({ tab, active }: { tab: (typeof TABS)[number]; active: boolean }) {
  const { href, label, Icon } = tab;
  return (
    <li className="h-full">
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex h-full flex-col items-center justify-center gap-1 transition-colors duration-[var(--dur-1)]",
          active ? "text-[var(--accent-text)]" : "text-[var(--text-3)] hover:text-[var(--text-2)]",
        )}
      >
        <Icon size={21} strokeWidth={active ? 1.9 : 1.6} />
        <span className={cn("text-[10.5px] leading-none", active && "font-[600]")}>{label}</span>
      </Link>
    </li>
  );
}
