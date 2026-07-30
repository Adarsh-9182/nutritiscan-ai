"use client";

import { MotionConfig } from "motion/react";

/**
 * App-wide motion policy.
 *
 * `globals.css` has a `prefers-reduced-motion` block, but it only neutralises
 * *CSS* animations and transitions. Almost every animation in this product is
 * driven by Motion in JavaScript — the timeline's staggered entries, the macro
 * bars, chat messages arriving, the nav pill spring, the scan spinner — and
 * none of it was affected by that media query. Only `Ring` asked.
 *
 * `reducedMotion="user"` makes every `motion` component in the tree respect
 * the OS setting: transforms and opacity animations are skipped, layout
 * animations stop. One declaration, whole app, no per-component discipline
 * required.
 */
export default function Providers({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
