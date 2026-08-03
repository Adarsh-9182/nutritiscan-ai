"use client";

// ============================================================
// THE DOCK — primary navigation
//
// Replaces the top pill nav. Three reasons, in order of weight:
//
//   1. Reach. This is a phone-first product whose primary action
//      is "photograph the thing in your hand". A control at the
//      top of the screen is the one place a thumb cannot go.
//   2. Rank. The old nav listed Dashboard / Scan / Timeline as
//      three equal links. Scanning is not one of three equal
//      things; it is the product. Raising it out of the row is
//      the only honest way to say so.
//   3. Reachability of the rest. Coach and Profile did not exist
//      in the nav at all — Coach was a column inside the
//      dashboard, and there was no profile screen.
//
// The scan control is a raised circle rather than a fifth tab.
// That costs the layout a gap in the middle and buys a target
// that is unmistakable at a glance and ~2x the tap area.
// ============================================================

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { CoachIcon, HomeIcon, ProfileIcon, ProgressIcon, ScanIcon } from "@/components/icons";

type Item = {
  href: string;
  label: string;
  Icon: (p: { size?: number; strokeWidth?: number }) => React.ReactElement;
};

/** Split around the raised scan control — two tabs, the gap, two tabs. */
const LEFT: Item[] = [
  { href: "/home", label: "Home", Icon: HomeIcon },
  { href: "/coach", label: "Coach", Icon: CoachIcon },
];
const RIGHT: Item[] = [
  { href: "/progress", label: "Progress", Icon: ProgressIcon },
  { href: "/profile", label: "Profile", Icon: ProfileIcon },
];

function Tab({ item, active }: { item: Item; active: boolean }) {
  const { Icon } = item;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      /*
       * min-h-[52px] is not decorative. These are the only way to move
       * between screens on a phone, and a 40px row is below the ~44px
       * floor where taps start being missed.
       */
      className={`relative flex min-h-[52px] flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-1 transition-colors focus-ring ${
        active ? "text-[var(--emerald)]" : "text-[var(--text-dim)] hover:text-[var(--text)]"
      }`}
    >
      {active && (
        // Shared layoutId with the other tabs, so the highlight slides
        // between them rather than blinking out and in.
        <motion.span
          layoutId="dock-active"
          className="absolute inset-x-1 inset-y-0 -z-10 rounded-2xl bg-[color-mix(in_oklab,var(--emerald)_12%,transparent)]"
          transition={{ type: "spring", stiffness: 420, damping: 34 }}
        />
      )}
      {/* The active tab also gets a heavier stroke, so selection survives
          for anyone who can't separate emerald from grey. */}
      <Icon size={21} strokeWidth={active ? 2.1 : 1.6} />
      <span className="text-[10.5px] font-medium leading-none tracking-[0.01em]">{item.label}</span>
    </Link>
  );
}

export default function Dock() {
  const pathname = usePathname();
  // startsWith, not equality: /scan has sub-states and future screens
  // (a food result at /scan/[id]) must keep their parent tab lit.
  const isOn = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const scanActive = isOn("/scan");

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-3"
      style={{ paddingBottom: "calc(var(--safe-b) + 10px)" }}
    >
      <div className="relative w-full max-w-md">
        {/*
          The raised scan control. Rendered before the bar in the DOM but
          positioned over it — and deliberately *outside* the bar element
          so the bar's backdrop-filter doesn't clip its glow.
        */}
        <Link
          href="/scan"
          aria-label="Scan food"
          aria-current={scanActive ? "page" : undefined}
          className="group absolute left-1/2 z-10 grid h-[58px] w-[58px] -translate-x-1/2 -translate-y-[22px] place-items-center rounded-full btn-primary focus-ring"
        >
          <ScanIcon size={25} strokeWidth={2} />
          {/* A pulse only while you are *not* on the scanner — an idle
              invitation, not a distraction once you're already there. */}
          {!scanActive && (
            <motion.span
              aria-hidden="true"
              className="absolute inset-0 rounded-full border border-[var(--emerald)]"
              initial={{ opacity: 0.55, scale: 1 }}
              animate={{ opacity: 0, scale: 1.45 }}
              transition={{ duration: 2.4, repeat: Infinity, ease: "easeOut" }}
            />
          )}
        </Link>

        <div className="flex items-stretch gap-1 rounded-[26px] glass-strong px-2 py-1.5 shadow-[0_18px_50px_-18px_rgba(0,0,0,0.9)]">
          {LEFT.map((i) => (
            <Tab key={i.href} item={i} active={isOn(i.href)} />
          ))}
          {/* The hole the scan button sits in. aria-hidden so the row
              doesn't announce an empty item between Coach and Progress. */}
          <div aria-hidden="true" className="w-[58px] shrink-0" />
          {RIGHT.map((i) => (
            <Tab key={i.href} item={i} active={isOn(i.href)} />
          ))}
        </div>
      </div>
    </nav>
  );
}
