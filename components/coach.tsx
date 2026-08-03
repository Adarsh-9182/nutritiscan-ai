"use client";

// ============================================================
// COACH
//
// The chat was previously the middle column of the dashboard,
// wedged between a health-score card and a lab table at roughly
// half the width of the screen. It is the centrepiece of the
// product, so it gets a screen.
//
// This is a thin shell on purpose: `Chat` already owns the
// transcript, the streaming, the suggestion chips and the
// agent-routing display. All that was missing was somewhere
// for it to breathe.
// ============================================================

import Chat from "@/components/chat";
import { useProfile } from "@/lib/memory/store";

export default function Coach() {
  const [profile] = useProfile();

  return (
    <div
      className="mx-auto flex w-full max-w-3xl flex-col px-4 pt-6 sm:px-6"
      style={{ height: "calc(100svh - var(--dock-h) - var(--safe-b) - 18px)" }}
    >
      <header className="mb-3 shrink-0">
        <h1 className="a-h1">Coach</h1>
        <p className="mt-1 a-caption text-[var(--text-dim)]">
          Five specialists and a supervisor, all reading the same memory of you.
        </p>
      </header>

      {/*
        The composer is the one control that must always be reachable, so the
        panel is sized to the space actually left over — viewport minus the
        dock, its safe-area inset, and this header — rather than a guessed
        percentage. svh (not vh) because mobile Safari measures vh against the
        largest viewport, which pushes the input under the URL bar.
      */}
      <div className="min-h-0 flex-1 overflow-hidden rounded-[var(--radius)] glass-strong">
        <Chat profile={profile} />
      </div>
    </div>
  );
}
