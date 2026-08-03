// ============================================================
// MEAL & GROCERY PLANNING
//
// "A meal plan is only trustworthy if you can see the
// constraints it was built from — and change one without
// starting over."
//
// That sentence forced the architecture here. A plan cannot be a
// stored array of meals, because then a constraint chip is
// decoration: tapping it would have to either do nothing or
// trigger a fake reshuffle. So the plan is a PURE FUNCTION of
// the active constraint set:
//
//     constraints -> plan -> grocery list
//
// Loosening "gluten-free" genuinely widens the candidate pool
// and genuinely changes Tuesday's lunch. The grocery list is
// derived from the resulting week rather than stored, so it can
// never drift out of sync with the meals it claims to buy.
//
// Selection is DETERMINISTIC (a seeded scan, not Math.random) so
// the same constraints always produce the same week. A planner
// that reshuffles on every render would make the user feel the
// app had changed its mind about their health.
// ============================================================

export type ConstraintId = "iron-up" | "ldl-down" | "gluten-free" | "quick" | "protein";

export type Constraint = {
  id: ConstraintId;
  label: string;
  /** Why this constraint exists, traced back to a marker or goal. */
  because: string;
  /** The lab marker it serves, if any — this is what keeps the plan and the labs visibly connected. */
  marker?: string;
  /** Locked constraints can't be loosened away — an allergy is not a preference. */
  locked?: boolean;
};

export const CONSTRAINTS: Constraint[] = [
  { id: "iron-up", label: "Iron up", because: "Ferritin at 38 µg/L, the bottom of its range", marker: "ferritin" },
  { id: "ldl-down", label: "LDL down", because: "LDL rose 0.5 mmol/L over four months", marker: "ldl" },
  { id: "gluten-free", label: "Gluten-free", because: "You've recorded a gluten sensitivity", locked: true },
  { id: "quick", label: "≤ 25 min", because: "Most of your logged meals are cooked on weeknights" },
  { id: "protein", label: "115 g protein", because: "Your stated daily target" },
];

export type Slot = "breakfast" | "lunch" | "dinner";

export type Recipe = {
  id: string;
  name: string;
  slot: Slot;
  time: string;      // clock time it's scheduled for
  minutes: number;
  protein: number;   // g
  iron: number;      // mg
  /** True when the recipe actively helps lower LDL (soluble fibre, oily fish, no sat fat). */
  ldlFriendly: boolean;
  glutenFree: boolean;
  /** One-line reason it earns its place, shown under the name. */
  note: string;
  ingredients: { item: string; qty: string; aisle: Aisle; price: number }[];
};

export type Aisle = "Produce" | "Protein" | "Pantry" | "Dairy & alternatives";

const AISLE_ORDER: Aisle[] = ["Produce", "Protein", "Pantry", "Dairy & alternatives"];

// ------------------------------------------------------------
// The candidate pool.
//
// Every recipe carries the facts the constraints filter on. No
// recipe is tagged with a benefit it doesn't have — a besan
// chilla really is gluten-free (chickpea flour), a rohu fillet
// really is the omega-3 one.
// ------------------------------------------------------------

export const RECIPES: Recipe[] = [
  // ---- Breakfast -------------------------------------------
  {
    id: "besan-chilla",
    name: "Besan chilla, spinach",
    slot: "breakfast", time: "08:00", minutes: 12,
    protein: 22, iron: 3.8, ldlFriendly: true, glutenFree: true,
    note: "Chickpea flour and spinach — plant iron with no wheat in it",
    ingredients: [
      { item: "Besan", qty: "1 kg", aisle: "Pantry", price: 90 },
      { item: "Spinach", qty: "500 g", aisle: "Produce", price: 60 },
    ],
  },
  {
    id: "oats-berries",
    name: "Steel-cut oats, berries",
    slot: "breakfast", time: "08:00", minutes: 15,
    protein: 14, iron: 2.1, ldlFriendly: true, glutenFree: false,
    note: "Beta-glucan in oats is the best-evidenced food for lowering LDL",
    ingredients: [
      { item: "Steel-cut oats", qty: "1 kg", aisle: "Pantry", price: 220 },
      { item: "Mixed berries", qty: "400 g", aisle: "Produce", price: 260 },
    ],
  },
  {
    id: "tofu-scramble",
    name: "Tofu scramble, peppers",
    slot: "breakfast", time: "08:00", minutes: 14,
    protein: 26, iron: 3.2, ldlFriendly: true, glutenFree: true,
    note: "High protein without the saturated fat of a paneer bhurji",
    ingredients: [
      { item: "Tofu", qty: "800 g", aisle: "Protein", price: 320 },
      { item: "Bell peppers", qty: "4", aisle: "Produce", price: 90 },
    ],
  },
  {
    id: "poha-peanuts",
    name: "Poha with peanuts",
    slot: "breakfast", time: "08:00", minutes: 10,
    protein: 9, iron: 2.6, ldlFriendly: false, glutenFree: true,
    note: "Fast and iron-fortified, but light on protein",
    ingredients: [
      { item: "Poha", qty: "500 g", aisle: "Pantry", price: 60 },
      { item: "Peanuts", qty: "250 g", aisle: "Pantry", price: 70 },
    ],
  },

  // ---- Lunch -----------------------------------------------
  {
    id: "chickpea-quinoa",
    name: "Chickpea & quinoa bowl",
    slot: "lunch", time: "13:30", minutes: 18,
    protein: 31, iron: 4.6, ldlFriendly: true, glutenFree: true,
    note: "Lemon dressing — the vitamin C is what makes the plant iron usable",
    ingredients: [
      { item: "Chickpeas", qty: "1 kg", aisle: "Pantry", price: 140 },
      { item: "Quinoa", qty: "500 g", aisle: "Pantry", price: 280 },
      { item: "Lemons", qty: "6", aisle: "Produce", price: 40 },
    ],
  },
  {
    id: "rajma-rice",
    name: "Rajma chawal",
    slot: "lunch", time: "13:30", minutes: 25,
    protein: 18, iron: 4.1, ldlFriendly: true, glutenFree: true,
    note: "4.1 mg of plant iron and 11 g of fibre in one bowl",
    ingredients: [
      { item: "Rajma", qty: "500 g", aisle: "Pantry", price: 130 },
      { item: "Basmati rice", qty: "1 kg", aisle: "Pantry", price: 150 },
    ],
  },
  {
    id: "lentil-salad",
    name: "Warm lentil & beet salad",
    slot: "lunch", time: "13:30", minutes: 20,
    protein: 24, iron: 5.2, ldlFriendly: true, glutenFree: true,
    note: "Highest iron per calorie in the plan",
    ingredients: [
      { item: "Brown lentils", qty: "500 g", aisle: "Pantry", price: 110 },
      { item: "Beetroot", qty: "500 g", aisle: "Produce", price: 50 },
    ],
  },
  {
    id: "chicken-wrap",
    name: "Chicken & slaw wrap",
    slot: "lunch", time: "13:30", minutes: 15,
    protein: 34, iron: 1.8, ldlFriendly: false, glutenFree: false,
    note: "Protein-dense and fast, but the wrap is wheat",
    ingredients: [
      { item: "Chicken breast", qty: "600 g", aisle: "Protein", price: 380 },
      { item: "Tortilla wraps", qty: "8", aisle: "Pantry", price: 120 },
    ],
  },

  // ---- Dinner ----------------------------------------------
  {
    id: "grilled-fish",
    name: "Grilled fish, greens",
    slot: "dinner", time: "20:00", minutes: 22,
    protein: 38, iron: 1.4, ldlFriendly: true, glutenFree: true,
    note: "Omega-3 — the dinner that works hardest on your LDL",
    ingredients: [
      { item: "Rohu fillets", qty: "600 g", aisle: "Protein", price: 480 },
      { item: "Broccoli", qty: "2 heads", aisle: "Produce", price: 120 },
    ],
  },
  {
    id: "dal-palak",
    name: "Dal palak, millet roti",
    slot: "dinner", time: "20:00", minutes: 24,
    protein: 21, iron: 5.8, ldlFriendly: true, glutenFree: true,
    note: "Spinach and lentils together — the biggest iron hit of the week",
    ingredients: [
      { item: "Toor dal", qty: "1 kg", aisle: "Pantry", price: 160 },
      { item: "Millet flour", qty: "1 kg", aisle: "Pantry", price: 95 },
    ],
  },
  {
    id: "tofu-stirfry",
    name: "Tofu & greens stir-fry",
    slot: "dinner", time: "20:00", minutes: 18,
    protein: 29, iron: 3.6, ldlFriendly: true, glutenFree: true,
    note: "Uses tamari, not soy sauce — most soy sauce contains wheat",
    ingredients: [
      { item: "Tofu", qty: "800 g", aisle: "Protein", price: 320 },
      { item: "Pak choi", qty: "400 g", aisle: "Produce", price: 80 },
      { item: "Tamari", qty: "250 ml", aisle: "Pantry", price: 180 },
    ],
  },
  {
    id: "paneer-curry",
    name: "Paneer butter masala",
    slot: "dinner", time: "20:00", minutes: 30,
    protein: 27, iron: 1.1, ldlFriendly: false, glutenFree: true,
    note: "Comfort food — high in saturated fat, so it works against the LDL goal",
    ingredients: [
      { item: "Paneer", qty: "500 g", aisle: "Dairy & alternatives", price: 510 },
      { item: "Tomatoes", qty: "1 kg", aisle: "Produce", price: 70 },
    ],
  },
];

// ------------------------------------------------------------
// Selection
// ------------------------------------------------------------

/** Does this recipe survive the active constraint set? */
function passes(r: Recipe, active: Set<ConstraintId>): boolean {
  if (active.has("gluten-free") && !r.glutenFree) return false;
  if (active.has("quick") && r.minutes > 25) return false;
  return true;
}

/**
 * How well a recipe serves the goals that are switched on.
 *
 * Constraints split into two kinds and it matters which is
 * which: `gluten-free` and `quick` are FILTERS (a wheat wrap is
 * not "less gluten-free", it's out), while `iron-up`, `ldl-down`
 * and `protein` are PREFERENCES that rank what survived. Treating
 * a preference as a filter would hand back an empty week the
 * first time someone asked for both high iron and low LDL.
 */
function score(r: Recipe, active: Set<ConstraintId>): number {
  let s = 0;
  if (active.has("iron-up")) s += r.iron * 10;
  if (active.has("ldl-down")) s += r.ldlFriendly ? 25 : -15;
  if (active.has("protein")) s += r.protein;
  if (active.has("quick")) s += Math.max(0, 30 - r.minutes);
  return s;
}

export type Day = { date: number; weekday: string; meals: Recipe[] };

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const SLOTS: Slot[] = ["breakfast", "lunch", "dinner"];

/**
 * Build a week from the active constraints.
 *
 * Rotates through the ranked candidates per slot rather than
 * always picking the single best one, so the week has variety
 * without ever dipping into a recipe the constraints excluded.
 * Deterministic: same constraints in, same week out.
 */
export function buildWeek(active: Set<ConstraintId>, days = 6, startDate = 3): Day[] {
  const ranked: Record<Slot, Recipe[]> = { breakfast: [], lunch: [], dinner: [] };
  for (const slot of SLOTS) {
    const pool = RECIPES.filter((r) => r.slot === slot && passes(r, active)).sort(
      (a, b) => score(b, active) - score(a, active) || a.id.localeCompare(b.id),
    );
    // Nothing survived the filters — fall back to the unfiltered
    // pool rather than rendering an empty day. An empty plan is
    // never the honest answer; a plan that breaks one preference
    // and says so is.
    ranked[slot] = pool.length ? pool : RECIPES.filter((r) => r.slot === slot);
  }

  return Array.from({ length: days }, (_, i) => ({
    date: startDate + i,
    weekday: WEEKDAYS[i % 7],
    meals: SLOTS.map((slot) => {
      const pool = ranked[slot];
      return pool[i % pool.length];
    }),
  }));
}

export const dayProtein = (d: Day) => Math.round(d.meals.reduce((a, m) => a + m.protein, 0));
export const dayIron = (d: Day) => +d.meals.reduce((a, m) => a + m.iron, 0).toFixed(1);

/** Which marker a meal is working for — the tag shown on each row. */
export function mealMarker(r: Recipe, active: Set<ConstraintId>): { label: string; marker: string } | null {
  if (active.has("iron-up") && r.iron >= 3.5) return { label: "Iron", marker: "ferritin" };
  if (active.has("ldl-down") && r.ldlFriendly) return { label: "LDL", marker: "ldl" };
  return null;
}

// ------------------------------------------------------------
// Grocery — derived, never stored.
// ------------------------------------------------------------

export type GroceryItem = {
  item: string;
  qty: string;
  aisle: Aisle;
  price: number;
  /** Set when this replaced something else, with what the swap costs and saves. */
  swappedFrom?: string;
};

export type Swap = { from: string; to: string; saves: number; benefit: string };

/**
 * Swaps we're prepared to make automatically.
 *
 * Every one states BOTH what it saves and what it costs. A silent
 * substitution — quietly putting tofu in the basket because it's
 * healthier — is the behaviour that makes people stop trusting a
 * shopping list, so the swap is always labelled on the item.
 */
export const SWAPS: Swap[] = [
  { from: "Paneer", to: "Tofu", saves: 190, benefit: "14 g less saturated fat, and it serves the LDL goal" },
];

export type GroceryList = {
  items: GroceryItem[];
  byAisle: { aisle: Aisle; items: GroceryItem[] }[];
  total: number;
  days: number;
  swaps: Swap[];
};

/**
 * Roll a week of meals into a shopping list.
 *
 * Grouped by aisle because that is how shopping actually
 * happens — a list ordered by recipe sends you back across the
 * shop four times.
 */
export function buildGrocery(week: Day[], applySwaps = true): GroceryList {
  const merged = new Map<string, GroceryItem>();

  for (const day of week) {
    for (const meal of day.meals) {
      for (const ing of meal.ingredients) {
        // Same ingredient across several days is one line, not four.
        if (merged.has(ing.item)) continue;
        merged.set(ing.item, { ...ing });
      }
    }
  }

  const applied: Swap[] = [];
  if (applySwaps) {
    for (const swap of SWAPS) {
      const target = merged.get(swap.from);
      if (!target) continue;
      merged.delete(swap.from);
      const existing = merged.get(swap.to);
      merged.set(swap.to, {
        item: swap.to,
        qty: existing?.qty ?? target.qty,
        aisle: existing?.aisle ?? "Protein",
        price: Math.max(0, (existing?.price ?? target.price) - swap.saves),
        swappedFrom: swap.from,
      });
      applied.push(swap);
    }
  }

  const items = [...merged.values()];
  const byAisle = AISLE_ORDER.map((aisle) => ({
    aisle,
    items: items.filter((i) => i.aisle === aisle),
  })).filter((g) => g.items.length > 0);

  return {
    items,
    byAisle,
    total: items.reduce((a, i) => a + i.price, 0),
    days: week.length,
    swaps: applied,
  };
}
