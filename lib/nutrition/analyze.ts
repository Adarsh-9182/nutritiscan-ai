// ============================================================
// MEAL ANALYSIS ENGINE
// Turns "2 rotis, dal and a bowl of curd" — or a list of foods
// a vision model saw — into real numbers, then reads those
// numbers against THIS user's Health Memory: their goal, their
// low biomarkers, their allergies.
//
// Deterministic and keyless. The LLM identifies *what* is on the
// plate; this file decides what it means for the person eating it.
// ============================================================

import { matchFood, PORTIONS, type Allergen, type Food } from "./foods";
import { type HealthProfile } from "../memory/profile";

export type ScanItem = {
  name: string;
  grams: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  /** false when the model named a food our database doesn't know */
  matched: boolean;
  confidence?: number;
};

export type Totals = {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar: number;
  sodium: number;
  b12: number;
  vitD: number;
  iron: number;
  calcium: number;
};

export type Flag = { tone: "good" | "warn" | "bad"; text: string };
export type Swap = { from: string; to: string; why: string };

export type ScanResult = {
  title: string;
  items: ScanItem[];
  totals: Totals;
  /** 0–100, how well this meal serves THIS user's goal */
  fitScore: number;
  grade: "excellent" | "solid" | "okay" | "heavy";
  headline: string;
  flags: Flag[];
  swaps: Swap[];
  proteinTargetPerMeal: number;
  source: "vision" | "text" | "sample";
  note?: string;
};

/** A food the model named, with an optional portion. */
export type NamedItem = { name: string; grams?: number; confidence?: number; kcal?: number; protein?: number; carbs?: number; fat?: number };

const ZERO: Totals = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, sodium: 0, b12: 0, vitD: 0, iron: 0, calcium: 0 };
const r1 = (n: number) => Math.round(n * 10) / 10;

// ------------------------------------------------------------
// 1. Parsing free text into portions
// ------------------------------------------------------------

const NUM_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, half: 0.5,
};

/** Split "2 rotis, dal and a bowl of curd" into segments. */
function segments(text: string): string[] {
  return text
    .split(/,|\band\b|\bwith\b|\bplus\b|\n|\+|&|;/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 1);
}

/** Work out how many grams a segment describes for a given food. */
function gramsFor(segment: string, food: Food): number {
  const t = segment.toLowerCase();

  // explicit weight/volume — "200g chicken", "250 ml milk"
  const explicit = t.match(/(\d+(?:\.\d+)?)\s*(g|gm|gms|gram|grams|ml)\b/);
  if (explicit) return Math.max(1, parseFloat(explicit[1]));

  // leading count — "2 rotis", "three eggs", "half a bowl"
  const numMatch = t.match(/(\d+(?:\.\d+)?)/);
  const wordMatch = Object.keys(NUM_WORDS).find((w) => new RegExp(`\\b${w}\\b`).test(t));
  const count = numMatch ? parseFloat(numMatch[1]) : wordMatch ? NUM_WORDS[wordMatch] : null;

  // a named portion — "bowl", "katori", "scoop", "2 slices"
  const portionKey = Object.keys(PORTIONS).find((p) => new RegExp(`\\b${p}s?\\b`).test(t));
  if (portionKey) return Math.max(1, PORTIONS[portionKey] * (count ?? 1));

  if (count !== null) {
    // counts only make sense for countable foods; otherwise treat as servings
    return Math.max(1, (food.perPiece ?? food.serving) * count);
  }
  return food.serving;
}

/** Parse a written meal description into concrete items. */
export function parseMeal(text: string): ScanItem[] {
  const items: ScanItem[] = [];
  const seen = new Set<string>();

  for (const seg of segments(text)) {
    const food = matchFood(seg);
    if (!food || seen.has(food.id)) continue;
    seen.add(food.id);
    items.push(toItem(food, gramsFor(seg, food)));
  }

  // Nothing segmented cleanly? Sweep the whole string for any known food.
  if (!items.length) {
    const food = matchFood(text);
    if (food) items.push(toItem(food, food.serving));
  }
  return items;
}

function toItem(food: Food, grams: number, confidence?: number): ScanItem {
  const k = grams / 100;
  return {
    name: food.name,
    grams: Math.round(grams),
    kcal: Math.round(food.kcal * k),
    protein: r1(food.protein * k),
    carbs: r1(food.carbs * k),
    fat: r1(food.fat * k),
    fiber: r1(food.fiber * k),
    matched: true,
    confidence,
  };
}

/** Resolve foods a vision model named against the database. */
export function resolveNamed(named: NamedItem[]): { items: ScanItem[]; foods: Food[] } {
  const items: ScanItem[] = [];
  const foods: Food[] = [];

  for (const n of named) {
    const food = matchFood(n.name);
    const grams = n.grams && n.grams > 0 ? n.grams : food?.serving ?? 100;
    if (food) {
      foods.push(food);
      items.push({ ...toItem(food, grams, n.confidence), name: food.name });
    } else {
      // Unknown food — keep the model's own estimate rather than dropping it,
      // and mark it so the UI can show it as unverified.
      const k = grams / 100;
      items.push({
        name: n.name,
        grams: Math.round(grams),
        kcal: Math.round(n.kcal ?? 150 * k),
        protein: r1(n.protein ?? 5 * k),
        carbs: r1(n.carbs ?? 18 * k),
        fat: r1(n.fat ?? 5 * k),
        fiber: 0,
        matched: false,
        confidence: n.confidence,
      });
    }
  }
  return { items, foods };
}

// ------------------------------------------------------------
// 2. Totals — including the micronutrients this product tracks
// ------------------------------------------------------------

function totalsOf(items: ScanItem[], foods: Food[]): Totals {
  const t = { ...ZERO };
  for (const it of items) {
    t.kcal += it.kcal;
    t.protein += it.protein;
    t.carbs += it.carbs;
    t.fat += it.fat;
    t.fiber += it.fiber;
  }
  // sugar/sodium/micros only exist for database-matched foods
  for (const it of items) {
    const food = foods.find((f) => f.name === it.name) ?? matchFood(it.name);
    if (!food) continue;
    const k = it.grams / 100;
    t.sugar += food.sugar * k;
    t.sodium += food.sodium * k;
    t.b12 += (food.b12 ?? 0) * k;
    t.vitD += (food.vitD ?? 0) * k;
    t.iron += (food.iron ?? 0) * k;
    t.calcium += (food.calcium ?? 0) * k;
  }
  return {
    kcal: Math.round(t.kcal),
    protein: r1(t.protein),
    carbs: r1(t.carbs),
    fat: r1(t.fat),
    fiber: r1(t.fiber),
    sugar: r1(t.sugar),
    sodium: Math.round(t.sodium),
    b12: r1(t.b12),
    vitD: r1(t.vitD),
    iron: r1(t.iron),
    calcium: Math.round(t.calcium),
  };
}

// ------------------------------------------------------------
// 3. Personalization — the part that makes this NutritiScan
//    and not a calorie counter.
// ------------------------------------------------------------

/**
 * Goals are stored as imperatives ("Build muscle") but read inside sentences
 * ("...toward your goal of building muscle"), so turn the verb into a gerund.
 */
export function goalPhrase(p: HealthProfile): string {
  const g = p.goal.trim().toLowerCase();
  const [verb, ...rest] = g.split(/\s+/);
  if (!verb) return g;
  if (verb.endsWith("ing")) return g;
  const gerund = /e$/.test(verb) && !/ee$/.test(verb) ? `${verb.slice(0, -1)}ing` : /^(cut|run|get|put|slim|trim)$/.test(verb) ? `${verb}${verb.slice(-1)}ing` : `${verb}ing`;
  return [gerund, ...rest].join(" ");
}

/** Daily protein target in grams, from the user's goal and body weight. */
export function proteinTarget(p: HealthProfile): number {
  const perKg = /muscle|gain|strength|bulk/i.test(p.goal) ? 1.8 : /lose|fat|cut|weight/i.test(p.goal) ? 1.6 : 1.2;
  return Math.round(p.weightKg * perKg);
}

/** Which recorded biomarkers are below where they should be. */
function lowMarkers(p: HealthProfile) {
  return p.biomarkers.filter((b) => b.status === "low" || b.status === "borderline");
}

const ALLERGY_WORDS: Record<Allergen, RegExp> = {
  dairy: /dairy|milk|lactose|paneer|cheese/i,
  egg: /egg/i,
  gluten: /gluten|wheat/i,
  peanut: /peanut/i,
  treenut: /nut|almond|walnut|cashew/i,
  soy: /soy|soya/i,
  fish: /fish/i,
  shellfish: /shellfish|prawn|shrimp|crab/i,
};

function allergyFlags(foods: Food[], p: HealthProfile): Flag[] {
  if (!p.allergies.length) return [];
  const flags: Flag[] = [];
  for (const food of foods) {
    for (const a of food.allergens ?? []) {
      const hit = p.allergies.find((u) => ALLERGY_WORDS[a]?.test(u));
      if (hit) flags.push({ tone: "bad", text: `⚠︎ ${food.name} contains ${a} — you've recorded an allergy to ${hit}.` });
    }
  }
  return [...new Map(flags.map((f) => [f.text, f])).values()];
}

function buildFlags(totals: Totals, foods: Food[], p: HealthProfile, perMeal: number): Flag[] {
  const flags: Flag[] = [...allergyFlags(foods, p)];

  // protein vs this user's per-meal share
  if (totals.protein >= perMeal) {
    flags.push({ tone: "good", text: `${totals.protein} g protein — clears your ${perMeal} g per-meal share for ${goalPhrase(p)}.` });
  } else if (totals.protein >= perMeal * 0.6) {
    flags.push({ tone: "warn", text: `${totals.protein} g protein — about ${Math.round(perMeal - totals.protein)} g short of your per-meal share.` });
  } else {
    flags.push({ tone: "bad", text: `Only ${totals.protein} g protein. You're aiming for ~${perMeal} g a meal to ${p.goal.toLowerCase()}.` });
  }

  // deficiency-aware reads — the whole point of Health Memory
  for (const m of lowMarkers(p)) {
    const name = m.name.toLowerCase();
    if (name.includes("b12")) {
      if (totals.b12 >= 0.6) flags.push({ tone: "good", text: `Good B12 hit (~${totals.b12} µg) — helpful with your ${m.value} reading.` });
      else flags.push({ tone: "warn", text: `Almost no B12 here, and yours is ${m.status} (${m.value}). Eggs, dairy, or fish would help.` });
    }
    if (name.includes("vitamin d")) {
      if (totals.vitD >= 2) flags.push({ tone: "good", text: `Contains ~${totals.vitD} µg vitamin D — useful while yours sits at ${m.value}.` });
    }
    if (name.includes("hemoglobin") || name.includes("iron") || name.includes("ferritin")) {
      if (totals.iron >= 4) flags.push({ tone: "good", text: `Iron-rich (~${totals.iron} mg) — relevant to your ${m.name.toLowerCase()} of ${m.value}.` });
    }
  }

  if (totals.fiber >= 8) flags.push({ tone: "good", text: `${totals.fiber} g fibre — excellent for digestion and steady energy.` });
  if (totals.sodium >= 1200) flags.push({ tone: "warn", text: `High sodium (~${totals.sodium} mg) — roughly half a day's worth in one meal.` });
  if (totals.sugar >= 25) flags.push({ tone: "warn", text: `${totals.sugar} g sugar — expect a spike and a dip an hour or two later.` });
  if (totals.kcal >= 900) flags.push({ tone: "warn", text: `${totals.kcal} kcal is a large single meal — fine occasionally, worth spacing out.` });

  return flags;
}

function buildSwaps(foods: Food[], p: HealthProfile, totals: Totals, perMeal: number): Swap[] {
  const swaps: Swap[] = [];
  const has = (id: string) => foods.some((f) => f.id === id);
  const tagged = (tag: string) => foods.filter((f) => f.tags?.includes(tag));
  const b12Low = lowMarkers(p).some((m) => /b12/i.test(m.name));

  if (totals.protein < perMeal) {
    if (has("rice")) swaps.push({ from: "Half the rice", to: "A katori of dal or 100 g paneer", why: `+12–18 g protein for the same plate size.` });
    else if (b12Low) swaps.push({ from: "Add to this meal", to: "2 boiled eggs", why: `+13 g protein and ~2 µg B12 — both things you're short on.` });
    else swaps.push({ from: "Add to this meal", to: "A bowl of curd or a scoop of whey", why: `Closes the ${Math.round(perMeal - totals.protein)} g protein gap.` });
  }

  const fried = tagged("fried");
  if (fried.length) swaps.push({ from: fried[0].name, to: "A baked or steamed version", why: "Cuts most of the added oil without changing the meal." });

  if (has("cola")) swaps.push({ from: "The soft drink", to: "Water or nimbu pani", why: "Removes ~35 g of sugar with zero effort." });
  if (has("maggi")) swaps.push({ from: "Half the masala sachet", to: "Egg + vegetables in the noodles", why: "Halves the sodium and adds real protein." });
  if (totals.fiber < 3 && !tagged("veg").length) swaps.push({ from: "Nothing removed", to: "Add a salad or sabzi", why: "Fibre slows the glucose curve and keeps you full longer." });

  return swaps.slice(0, 3);
}

// ------------------------------------------------------------
// 4. Scoring
// ------------------------------------------------------------

function scoreMeal(totals: Totals, foods: Food[], p: HealthProfile, perMeal: number): number {
  let s = 50;

  // protein against this user's actual target
  s += Math.min(25, (totals.protein / perMeal) * 25);

  // fibre and micronutrients
  s += Math.min(10, totals.fiber * 1.4);
  if (lowMarkers(p).some((m) => /b12/i.test(m.name)) && totals.b12 >= 0.6) s += 8;
  if (foods.some((f) => f.tags?.includes("veg"))) s += 5;

  // penalties
  if (totals.sugar >= 25) s -= 12;
  if (totals.sodium >= 1200) s -= 10;
  if (totals.kcal >= 900) s -= 8;
  if (foods.some((f) => f.tags?.includes("fried"))) s -= 8;
  if (foods.some((f) => f.tags?.includes("refined-carb")) && totals.fiber < 3) s -= 5;

  return Math.max(5, Math.min(99, Math.round(s)));
}

function gradeOf(score: number, totals: Totals, perMeal: number): ScanResult["grade"] {
  if (totals.kcal >= 900 && score < 70) return "heavy";
  // A meal can't be "excellent" for someone chasing a protein target while
  // badly missing it — fibre and micronutrients shouldn't paper over that.
  const proteinRatio = perMeal > 0 ? totals.protein / perMeal : 1;
  if (score >= 80 && proteinRatio >= 0.85) return "excellent";
  if (score >= 62) return "solid";
  return "okay";
}

/** Build the headline out of what actually drove the score, not the grade alone. */
function headlineFor(grade: ScanResult["grade"], totals: Totals, p: HealthProfile, perMeal: number): string {
  const name = p.name;
  const goal = goalPhrase(p);
  const shortBy = Math.round(perMeal - totals.protein);

  const wins: string[] = [];
  if (totals.protein >= perMeal) wins.push(`${totals.protein} g of protein`);
  if (totals.fiber >= 8) wins.push(`${totals.fiber} g of fibre`);
  if (totals.b12 >= 0.6 && p.biomarkers.some((b) => /b12/i.test(b.name) && b.status !== "normal")) wins.push("a real B12 hit");
  if (totals.iron >= 4) wins.push(`${totals.iron} mg of iron`);
  const strengths = wins.length > 1 ? `${wins.slice(0, -1).join(", ")} and ${wins.slice(-1)}` : wins[0];

  if (grade === "heavy") {
    return `That's a big one, ${name} — ${totals.kcal} kcal. Nothing wrong with it, but it's most of an afternoon's energy in one sitting.`;
  }
  if (grade === "excellent") {
    return `Strong plate, ${name} — ${strengths}. This is the shape of meal that moves you toward your goal of ${goal}.`;
  }
  if (strengths && shortBy > 0) {
    return `Good in parts, ${name}: ${strengths}. The gap is protein — you're about ${shortBy} g under the ~${perMeal} g a meal that ${goal} asks for.`;
  }
  if (shortBy > 0) {
    return `This works, ${name}, but it's leaning carb-heavy — about ${shortBy} g short of the ~${perMeal} g protein a meal that ${goal} asks for.`;
  }
  return `Reasonable meal, ${name}. Protein's covered; a little more fibre or colour on the plate is the easiest upgrade from here.`;
}

// ------------------------------------------------------------
// 5. The public entry point
// ------------------------------------------------------------

export function analyzeMeal(
  items: ScanItem[],
  p: HealthProfile,
  opts: { source: ScanResult["source"]; title?: string; note?: string },
): ScanResult {
  const foods = items.map((i) => matchFood(i.name)).filter((f): f is Food => !!f);
  const totals = totalsOf(items, foods);
  const perMeal = Math.round(proteinTarget(p) / 3);
  const fitScore = scoreMeal(totals, foods, p, perMeal);
  const grade = gradeOf(fitScore, totals, perMeal);

  return {
    title: opts.title || (items.length ? items.map((i) => i.name).slice(0, 3).join(" · ") : "Meal"),
    items,
    totals,
    fitScore,
    grade,
    headline: headlineFor(grade, totals, p, perMeal),
    flags: buildFlags(totals, foods, p, perMeal),
    swaps: buildSwaps(foods, p, totals, perMeal),
    proteinTargetPerMeal: perMeal,
    source: opts.source,
    note: opts.note,
  };
}
