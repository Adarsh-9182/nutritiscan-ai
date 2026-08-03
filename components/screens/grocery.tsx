"use client";

// ============================================================
// GROCERY PLANNER
//
// "Grouped by aisle because that's how shopping happens. Swaps
// state both what they save and what they cost — never a silent
// substitution."
//
// Two decisions, both about trust rather than layout.
//
// AISLE, NOT RECIPE. A list ordered by recipe sends you back
// across the shop four times. Aisle order is the only grouping
// that matches the physical task, and it is derived — the user
// never files anything.
//
// SWAPS ARE LABELLED, ALWAYS. The planner is willing to put tofu
// in the basket instead of paneer, because it serves the LDL
// goal and costs less. What it is not willing to do is put it
// there quietly. The swapped line says what it replaced, and the
// banner says what the swap saves AND what it changes. A silent
// substitution is the single fastest way to make someone stop
// trusting a list — they find out at the till, and then they
// wonder what else was changed without telling them.
// ============================================================

import { useMemo, useState } from "react";
import { Button, Card, Eyebrow } from "@/components/ds/primitives";
import { ScreenHeader } from "@/components/ds/screen";
import { ScreenFooter } from "@/components/ds/screen";
import { BasketIcon, CheckIcon } from "@/components/ds/icons";
import { EmptyState } from "@/components/ds/states";
import { useConstraints, useGroceryChecks, useHydrated } from "@/lib/v2/store";
import { buildGrocery, buildWeek } from "@/lib/v2/plan";
import { cn } from "@/lib/cn";

const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;

export function GroceryScreen() {
  const hydrated = useHydrated();
  const [active] = useConstraints();
  const [checked, toggle, clearChecks] = useGroceryChecks();
  const [sent, setSent] = useState(false);

  const list = useMemo(() => buildGrocery(buildWeek(active)), [active]);

  // Only count what's still to buy — a total that includes ticked
  // items is the wrong number the moment you start shopping.
  const remaining = list.items.filter((i) => !checked[i.item]);
  const remainingTotal = remaining.reduce((a, i) => a + i.price, 0);
  const doneCount = list.items.length - remaining.length;

  if (!list.items.length) {
    return (
      <>
        <ScreenHeader backHref="/plan" title="Shopping list" />
        <EmptyState
          icon={<BasketIcon size={22} />}
          title="Nothing to buy yet"
          body="Your week has no meals in it, so there's nothing to shop for. Set a constraint or two and the plan — and this list — will build themselves."
          action={{ label: "Back to the plan", href: "/plan" }}
        />
      </>
    );
  }

  return (
    <>
      <ScreenHeader
        backHref="/plan"
        title="Shopping list"
        trailing={
          <span className="tnum t-h3 shrink-0 text-[var(--text)]">{hydrated ? rupees(remainingTotal) : ""}</span>
        }
      />

      <main id="main" className="app-scroll px-5" style={{ paddingBottom: "calc(var(--tabbar-h) + var(--safe-b) + 96px)" }}>
        <p className="t-meta text-[var(--text-3)]">
          {list.items.length} items · {list.days} days of meals
          {doneCount > 0 && ` · ${doneCount} in the basket`}
        </p>

        {/* Swaps, stated. Never silent. */}
        {list.swaps.map((s) => (
          <Card key={s.from} tone="steady" className="mt-4 p-3.5">
            <p className="t-body text-[var(--text-2)]">
              Swapped <span className="font-[590] text-[var(--text)]">{s.from}</span> for{" "}
              <span className="font-[590] text-[var(--text)]">{s.to}</span> — saves{" "}
              <span className="tnum">{rupees(s.saves)}</span> and {s.benefit}.
            </p>
          </Card>
        ))}

        {list.byAisle.map((group) => (
          <section key={group.aisle} className="mt-6">
            <Eyebrow>{group.aisle}</Eyebrow>
            <Card className="mt-2 divide-y divide-[var(--border)]">
              {group.items.map((item) => {
                const on = !!checked[item.item];
                return (
                  <label
                    key={item.item}
                    className="flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-[var(--surface-2)]"
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggle(item.item)}
                      className="peer sr-only"
                    />
                    <span
                      aria-hidden="true"
                      className={cn(
                        "grid size-5 shrink-0 place-items-center rounded-[6px] border transition-colors",
                        "peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--accent)]",
                        on ? "border-transparent bg-[var(--accent)] text-[var(--accent-ink)]" : "border-[var(--border-strong)]",
                      )}
                    >
                      {on && <CheckIcon size={13} strokeWidth={2.6} />}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          "t-body block transition-colors",
                          on ? "text-[var(--text-3)] line-through" : "text-[var(--text)]",
                        )}
                      >
                        {item.item}
                        <span className="t-meta ml-2 text-[var(--text-3)]">{item.qty}</span>
                      </span>
                      {item.swappedFrom && (
                        <span className="t-meta mt-0.5 block text-[var(--steady-text)]">
                          swapped from {item.swappedFrom}
                        </span>
                      )}
                    </span>

                    <span className={cn("tnum t-meta shrink-0", on ? "text-[var(--text-3)]" : "text-[var(--text-2)]")}>
                      {rupees(item.price)}
                    </span>
                  </label>
                );
              })}
            </Card>
          </section>
        ))}

        <div className="mt-5 flex items-center justify-between gap-3">
          <span className="t-meta text-[var(--text-3)]">Prices are estimates and vary by shop.</span>
          {doneCount > 0 && (
            <button
              type="button"
              onClick={clearChecks}
              className="t-meta shrink-0 font-[560] text-[var(--accent-text)] transition-opacity hover:opacity-80"
            >
              Clear ticks
            </button>
          )}
        </div>
      </main>

      <ScreenFooter style={{ bottom: "calc(var(--tabbar-h) + var(--safe-b))" }}>
        <Button variant="primary" full onClick={() => setSent(true)} disabled={sent}>
          {sent ? (
            <>
              <CheckIcon size={17} strokeWidth={2.2} /> Sent — open your delivery app
            </>
          ) : (
            <>
              <BasketIcon size={17} /> Send to delivery
            </>
          )}
        </Button>
      </ScreenFooter>
    </>
  );
}
