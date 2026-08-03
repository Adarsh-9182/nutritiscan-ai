// ============================================================
// APP SHELL
//
// A route group, so these five screens share the dock and the
// first-run flow while the marketing page at `/` stays exactly
// as it was — no dock, no onboarding modal, no change in how it
// renders for a crawler.
//
// The group folder `(app)` contributes nothing to the URL, so
// the routes underneath stay /home, /scan, /coach, /progress
// and /profile.
// ============================================================

import Dock from "@/components/dock";
import Onboarding from "@/components/onboarding";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/*
        The dock is the first landmark on every app screen and it is five
        links long. Without this, reaching the actual content by keyboard
        costs five tabs on every single navigation.
      */}
      <a href="#main" className="sr-only skip-link">
        Skip to content
      </a>

      <Onboarding />

      {/*
        Bottom spacing is the screen's job, not the shell's. Four of these
        five screens scroll and need the dock's height reserved at the end
        (`app-page`); Coach does the opposite — it fills the viewport exactly
        so the composer pins above the dock. A padding rule here would have
        to be undone there.
      */}
      <main id="main" className="min-h-[100svh]">
        {children}
      </main>

      <Dock />
    </>
  );
}
