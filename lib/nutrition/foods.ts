// ============================================================
// FOOD DATABASE
// Per-100g nutrition for foods this user actually eats — Indian
// staples first, then common Western items. Values are rounded
// public reference figures (USDA / IFCT style), good enough for
// educational estimates, never a clinical measurement.
// ============================================================

export type Allergen = "dairy" | "egg" | "gluten" | "peanut" | "treenut" | "soy" | "fish" | "shellfish";

export type Food = {
  id: string;
  name: string;
  aliases: string[];
  /** grams in one "piece" — enables "2 rotis", "3 eggs" */
  perPiece?: number;
  /** default grams when no quantity is given */
  serving: number;
  // per 100 g
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar: number;
  sodium: number; // mg
  // micronutrients per 100 g — the ones this product reasons about
  b12?: number; // µg
  vitD?: number; // µg
  iron?: number; // mg
  calcium?: number; // mg
  allergens?: Allergen[];
  tags?: string[];
};

export const FOODS: Food[] = [
  // ---------- Indian staples ----------
  { id: "roti", name: "Roti", aliases: ["roti", "rotis", "chapati", "chapatis", "phulka"], perPiece: 40, serving: 80, kcal: 297, protein: 11, carbs: 58, fat: 3.7, fiber: 5, sugar: 1.6, sodium: 4, iron: 3.5, allergens: ["gluten"], tags: ["grain"] },
  { id: "rice", name: "Cooked rice", aliases: ["rice", "chawal", "steamed rice", "white rice", "bhaat"], serving: 180, kcal: 130, protein: 2.7, carbs: 28, fat: 0.3, fiber: 0.4, sugar: 0.1, sodium: 1, iron: 0.2, tags: ["grain", "refined-carb"] },
  { id: "brown-rice", name: "Brown rice", aliases: ["brown rice"], serving: 180, kcal: 123, protein: 2.7, carbs: 26, fat: 1, fiber: 1.8, sugar: 0.4, sodium: 4, iron: 0.6, tags: ["grain"] },
  { id: "dal", name: "Dal", aliases: ["dal", "daal", "dhal", "lentils", "lentil", "toor dal", "moong dal", "sambar"], serving: 150, kcal: 116, protein: 9, carbs: 20, fat: 0.4, fiber: 8, sugar: 1.8, sodium: 238, iron: 3.3, tags: ["protein", "veg"] },
  { id: "rajma", name: "Rajma", aliases: ["rajma", "kidney beans", "kidney bean"], serving: 150, kcal: 127, protein: 8.7, carbs: 22.8, fat: 0.5, fiber: 6.4, sugar: 0.3, sodium: 237, iron: 2.2, tags: ["protein", "veg"] },
  { id: "chana", name: "Chole / chickpeas", aliases: ["chana", "chole", "chickpeas", "chickpea", "garbanzo"], serving: 150, kcal: 164, protein: 8.9, carbs: 27, fat: 2.6, fiber: 7.6, sugar: 4.8, sodium: 240, iron: 2.9, tags: ["protein", "veg"] },
  { id: "paneer", name: "Paneer", aliases: ["paneer", "cottage cheese"], serving: 100, kcal: 296, protein: 18, carbs: 6, fat: 22, fiber: 0, sugar: 6, sodium: 18, b12: 0.9, calcium: 480, allergens: ["dairy"], tags: ["protein"] },
  { id: "curd", name: "Curd / yogurt", aliases: ["curd", "dahi", "yogurt", "yoghurt", "raita"], serving: 150, kcal: 61, protein: 3.5, carbs: 4.7, fat: 3.3, fiber: 0, sugar: 4.7, sodium: 46, b12: 0.4, calcium: 121, allergens: ["dairy"], tags: ["protein"] },
  { id: "greek-yogurt", name: "Greek yogurt", aliases: ["greek yogurt", "greek yoghurt"], serving: 170, kcal: 59, protein: 10, carbs: 3.6, fat: 0.4, fiber: 0, sugar: 3.2, sodium: 36, b12: 0.75, calcium: 110, allergens: ["dairy"], tags: ["protein", "high-protein"] },
  { id: "milk", name: "Milk", aliases: ["milk", "doodh", "glass of milk"], serving: 250, kcal: 61, protein: 3.2, carbs: 4.8, fat: 3.3, fiber: 0, sugar: 5.1, sodium: 43, b12: 0.45, vitD: 1.3, calcium: 113, allergens: ["dairy"], tags: ["protein"] },
  { id: "chai", name: "Chai", aliases: ["chai", "tea", "milk tea"], serving: 150, kcal: 45, protein: 1.3, carbs: 6, fat: 1.5, fiber: 0, sugar: 5.5, sodium: 15, b12: 0.15, calcium: 45, allergens: ["dairy"], tags: ["drink"] },
  { id: "aloo-paratha", name: "Aloo paratha", aliases: ["paratha", "parathas", "aloo paratha"], perPiece: 100, serving: 100, kcal: 260, protein: 6, carbs: 36, fat: 10, fiber: 3, sugar: 1.5, sodium: 320, allergens: ["gluten"], tags: ["grain", "fried"] },
  { id: "dosa", name: "Dosa", aliases: ["dosa", "dosai", "masala dosa"], perPiece: 80, serving: 80, kcal: 168, protein: 3.9, carbs: 30, fat: 3.7, fiber: 1.4, sugar: 0.6, sodium: 300, tags: ["grain"] },
  { id: "idli", name: "Idli", aliases: ["idli", "idlis", "iddli"], perPiece: 40, serving: 80, kcal: 130, protein: 4, carbs: 26, fat: 0.5, fiber: 1.3, sugar: 0.5, sodium: 210, tags: ["grain", "steamed"] },
  { id: "poha", name: "Poha", aliases: ["poha", "flattened rice"], serving: 180, kcal: 130, protein: 2.6, carbs: 27, fat: 1.4, fiber: 1, sugar: 0.5, sodium: 280, iron: 2.7, tags: ["grain"] },
  { id: "upma", name: "Upma", aliases: ["upma"], serving: 180, kcal: 145, protein: 3.5, carbs: 22, fat: 4.5, fiber: 1.8, sugar: 1, sodium: 300, allergens: ["gluten"], tags: ["grain"] },
  { id: "biryani", name: "Chicken biryani", aliases: ["biryani", "biriyani", "chicken biryani"], serving: 300, kcal: 190, protein: 9, carbs: 22, fat: 7, fiber: 1.2, sugar: 1.5, sodium: 430, b12: 0.2, tags: ["mixed"] },
  { id: "chicken-curry", name: "Chicken curry", aliases: ["chicken curry", "butter chicken", "chicken masala"], serving: 200, kcal: 180, protein: 15, carbs: 5, fat: 11, fiber: 1, sugar: 2, sodium: 400, b12: 0.3, iron: 1.2, tags: ["protein"] },
  { id: "samosa", name: "Samosa", aliases: ["samosa", "samosas"], perPiece: 60, serving: 60, kcal: 308, protein: 5, carbs: 32, fat: 18, fiber: 2.5, sugar: 1.5, sodium: 420, allergens: ["gluten"], tags: ["fried", "snack"] },
  { id: "sprouts", name: "Moong sprouts", aliases: ["sprouts", "moong sprouts", "sprout salad"], serving: 100, kcal: 30, protein: 3, carbs: 6, fat: 0.2, fiber: 1.8, sugar: 4.1, sodium: 6, iron: 0.9, tags: ["veg"] },
  { id: "gulab-jamun", name: "Gulab jamun", aliases: ["gulab jamun", "jamun", "mithai", "sweet"], perPiece: 45, serving: 45, kcal: 336, protein: 4, carbs: 46, fat: 15, fiber: 0.4, sugar: 40, sodium: 60, allergens: ["dairy"], tags: ["dessert", "sugar"] },

  // ---------- animal protein ----------
  { id: "egg", name: "Egg", aliases: ["egg", "eggs", "boiled egg", "omelette", "anda"], perPiece: 50, serving: 100, kcal: 155, protein: 13, carbs: 1.1, fat: 11, fiber: 0, sugar: 1.1, sodium: 124, b12: 1.1, vitD: 2, iron: 1.2, calcium: 50, allergens: ["egg"], tags: ["protein", "b12-rich"] },
  { id: "chicken", name: "Chicken breast", aliases: ["chicken", "chicken breast", "grilled chicken"], serving: 150, kcal: 165, protein: 31, carbs: 0, fat: 3.6, fiber: 0, sugar: 0, sodium: 74, b12: 0.3, iron: 1, tags: ["protein", "high-protein"] },
  { id: "mutton", name: "Mutton", aliases: ["mutton", "lamb", "goat"], serving: 150, kcal: 294, protein: 25, carbs: 0, fat: 21, fiber: 0, sugar: 0, sodium: 72, b12: 2.6, iron: 1.9, tags: ["protein", "b12-rich"] },
  { id: "fish", name: "Fish", aliases: ["fish", "rohu", "salmon", "tuna", "machli"], serving: 150, kcal: 155, protein: 20, carbs: 0, fat: 8, fiber: 0, sugar: 0, sodium: 60, b12: 2.4, vitD: 8, iron: 0.8, allergens: ["fish"], tags: ["protein", "b12-rich", "vitd-rich"] },
  { id: "prawns", name: "Prawns", aliases: ["prawns", "shrimp", "prawn"], serving: 120, kcal: 99, protein: 24, carbs: 0.2, fat: 0.3, fiber: 0, sugar: 0, sodium: 111, b12: 1.1, calcium: 70, allergens: ["shellfish"], tags: ["protein", "high-protein"] },

  // ---------- plant protein ----------
  { id: "soya-chunks", name: "Soya chunks", aliases: ["soya chunks", "soya", "soy chunks", "meal maker"], serving: 50, kcal: 345, protein: 52, carbs: 33, fat: 0.5, fiber: 13, sugar: 2, sodium: 4, iron: 20, calcium: 350, allergens: ["soy"], tags: ["protein", "high-protein", "veg"] },
  { id: "tofu", name: "Tofu", aliases: ["tofu"], serving: 120, kcal: 76, protein: 8, carbs: 1.9, fat: 4.8, fiber: 0.3, sugar: 0.6, sodium: 7, iron: 5.4, calcium: 350, allergens: ["soy"], tags: ["protein", "veg"] },
  { id: "whey", name: "Whey protein", aliases: ["whey", "protein shake", "protein powder", "scoop of whey"], perPiece: 30, serving: 30, kcal: 400, protein: 80, carbs: 8, fat: 5, fiber: 0, sugar: 4, sodium: 300, b12: 1.5, calcium: 500, allergens: ["dairy"], tags: ["protein", "high-protein", "b12-rich"] },
  { id: "peanut-butter", name: "Peanut butter", aliases: ["peanut butter"], serving: 32, kcal: 588, protein: 25, carbs: 20, fat: 50, fiber: 6, sugar: 9, sodium: 17, iron: 1.9, allergens: ["peanut"], tags: ["fat", "protein"] },
  { id: "peanuts", name: "Peanuts", aliases: ["peanuts", "peanut", "moongphali"], serving: 30, kcal: 567, protein: 26, carbs: 16, fat: 49, fiber: 8.5, sugar: 4, sodium: 18, iron: 4.6, allergens: ["peanut"], tags: ["fat", "snack"] },
  { id: "almonds", name: "Almonds", aliases: ["almonds", "almond", "badam"], serving: 28, kcal: 579, protein: 21, carbs: 22, fat: 50, fiber: 12.5, sugar: 4.4, sodium: 1, iron: 3.7, calcium: 269, allergens: ["treenut"], tags: ["fat", "snack"] },
  { id: "walnuts", name: "Walnuts", aliases: ["walnuts", "walnut", "akhrot"], serving: 28, kcal: 654, protein: 15, carbs: 14, fat: 65, fiber: 6.7, sugar: 2.6, sodium: 2, iron: 2.9, calcium: 98, allergens: ["treenut"], tags: ["fat", "snack"] },

  // ---------- produce ----------
  { id: "spinach", name: "Spinach", aliases: ["spinach", "palak", "saag"], serving: 100, kcal: 23, protein: 2.9, carbs: 3.6, fat: 0.4, fiber: 2.2, sugar: 0.4, sodium: 79, iron: 2.7, calcium: 99, tags: ["veg", "iron-rich"] },
  { id: "broccoli", name: "Broccoli", aliases: ["broccoli"], serving: 100, kcal: 34, protein: 2.8, carbs: 7, fat: 0.4, fiber: 2.6, sugar: 1.7, sodium: 33, iron: 0.7, calcium: 47, tags: ["veg"] },
  { id: "salad", name: "Mixed salad", aliases: ["salad", "green salad", "kachumber"], serving: 120, kcal: 25, protein: 1.3, carbs: 5, fat: 0.2, fiber: 2, sugar: 2.4, sodium: 12, iron: 0.6, tags: ["veg"] },
  { id: "banana", name: "Banana", aliases: ["banana", "bananas", "kela"], perPiece: 118, serving: 118, kcal: 89, protein: 1.1, carbs: 23, fat: 0.3, fiber: 2.6, sugar: 12, sodium: 1, iron: 0.3, tags: ["fruit"] },
  { id: "apple", name: "Apple", aliases: ["apple", "apples", "seb"], perPiece: 182, serving: 182, kcal: 52, protein: 0.3, carbs: 14, fat: 0.2, fiber: 2.4, sugar: 10.4, sodium: 1, tags: ["fruit"] },
  { id: "potato", name: "Potato", aliases: ["potato", "potatoes", "aloo"], serving: 150, kcal: 87, protein: 2, carbs: 20, fat: 0.1, fiber: 1.8, sugar: 0.9, sodium: 6, iron: 0.3, tags: ["veg", "starch"] },
  { id: "sweet-potato", name: "Sweet potato", aliases: ["sweet potato", "shakarkandi"], serving: 150, kcal: 86, protein: 1.6, carbs: 20, fat: 0.1, fiber: 3, sugar: 4.2, sodium: 55, iron: 0.6, tags: ["veg"] },
  { id: "avocado", name: "Avocado", aliases: ["avocado"], serving: 100, kcal: 160, protein: 2, carbs: 9, fat: 15, fiber: 7, sugar: 0.7, sodium: 7, iron: 0.6, tags: ["fat"] },

  // ---------- grains & western ----------
  { id: "oats", name: "Oats", aliases: ["oats", "oatmeal", "porridge"], serving: 50, kcal: 389, protein: 16.9, carbs: 66, fat: 6.9, fiber: 10.6, sugar: 1, sodium: 2, iron: 4.7, allergens: ["gluten"], tags: ["grain", "fiber-rich"] },
  { id: "bread", name: "White bread", aliases: ["bread", "white bread", "toast"], perPiece: 30, serving: 60, kcal: 265, protein: 9, carbs: 49, fat: 3.2, fiber: 2.7, sugar: 5, sodium: 491, iron: 3.6, allergens: ["gluten"], tags: ["grain", "refined-carb"] },
  { id: "brown-bread", name: "Brown bread", aliases: ["brown bread", "whole wheat bread", "multigrain bread"], perPiece: 32, serving: 64, kcal: 247, protein: 13, carbs: 41, fat: 3.4, fiber: 7, sugar: 6, sodium: 455, iron: 2.5, allergens: ["gluten"], tags: ["grain"] },
  { id: "pasta", name: "Pasta", aliases: ["pasta", "spaghetti", "penne", "macaroni"], serving: 200, kcal: 131, protein: 5, carbs: 25, fat: 1.1, fiber: 1.8, sugar: 0.6, sodium: 6, allergens: ["gluten"], tags: ["grain"] },
  { id: "cheese", name: "Cheese", aliases: ["cheese", "cheddar"], serving: 30, kcal: 402, protein: 25, carbs: 1.3, fat: 33, fiber: 0, sugar: 0.5, sodium: 621, b12: 0.8, calcium: 721, allergens: ["dairy"], tags: ["protein", "fat"] },

  // ---------- treats & fast food ----------
  { id: "pizza", name: "Pizza", aliases: ["pizza"], perPiece: 110, serving: 220, kcal: 266, protein: 11, carbs: 33, fat: 10, fiber: 2.3, sugar: 3.6, sodium: 598, b12: 0.4, calcium: 188, allergens: ["gluten", "dairy"], tags: ["fast-food"] },
  { id: "burger", name: "Burger", aliases: ["burger", "hamburger", "cheeseburger"], perPiece: 200, serving: 200, kcal: 295, protein: 15, carbs: 24, fat: 15, fiber: 1.5, sugar: 5, sodium: 500, b12: 0.9, allergens: ["gluten"], tags: ["fast-food"] },
  { id: "fries", name: "French fries", aliases: ["fries", "french fries", "chips"], serving: 120, kcal: 312, protein: 3.4, carbs: 41, fat: 15, fiber: 3.8, sugar: 0.3, sodium: 210, tags: ["fried", "fast-food"] },
  { id: "maggi", name: "Instant noodles", aliases: ["maggi", "instant noodles", "ramen", "noodles"], perPiece: 70, serving: 70, kcal: 448, protein: 9, carbs: 60, fat: 17, fiber: 2.5, sugar: 2, sodium: 1200, allergens: ["gluten"], tags: ["fast-food", "high-sodium"] },
  { id: "cola", name: "Soft drink", aliases: ["cola", "coke", "pepsi", "soft drink", "soda"], serving: 330, kcal: 42, protein: 0, carbs: 10.6, fat: 0, fiber: 0, sugar: 10.6, sodium: 4, tags: ["drink", "sugar"] },
  { id: "ice-cream", name: "Ice cream", aliases: ["ice cream", "icecream"], serving: 100, kcal: 207, protein: 3.5, carbs: 24, fat: 11, fiber: 0.7, sugar: 21, sodium: 80, b12: 0.4, calcium: 128, allergens: ["dairy"], tags: ["dessert", "sugar"] },
  { id: "dark-chocolate", name: "Dark chocolate", aliases: ["dark chocolate", "chocolate"], serving: 30, kcal: 546, protein: 4.9, carbs: 61, fat: 31, fiber: 7, sugar: 48, sodium: 24, iron: 11.9, allergens: ["dairy"], tags: ["dessert", "sugar"] },

  // ---------- fats ----------
  { id: "ghee", name: "Ghee", aliases: ["ghee"], serving: 10, kcal: 900, protein: 0, carbs: 0, fat: 100, fiber: 0, sugar: 0, sodium: 2, allergens: ["dairy"], tags: ["fat"] },
  { id: "butter", name: "Butter", aliases: ["butter", "makhan"], serving: 10, kcal: 717, protein: 0.9, carbs: 0.1, fat: 81, fiber: 0, sugar: 0.1, sodium: 643, vitD: 1.5, allergens: ["dairy"], tags: ["fat"] },
  { id: "oil", name: "Cooking oil", aliases: ["oil", "olive oil", "cooking oil"], serving: 10, kcal: 884, protein: 0, carbs: 0, fat: 100, fiber: 0, sugar: 0, sodium: 0, tags: ["fat"] },
];

// ------------------------------------------------------------
// Portion vocabulary — how people actually describe food.
// ------------------------------------------------------------

export const PORTIONS: Record<string, number> = {
  bowl: 150,
  katori: 120,
  cup: 200,
  glass: 250,
  plate: 250,
  slice: 30,
  slices: 30,
  scoop: 30,
  tbsp: 15,
  tablespoon: 15,
  tsp: 5,
  teaspoon: 5,
  handful: 30,
  packet: 70,
  can: 330,
};

/** Alias index, longest-first so "brown rice" wins over "rice". */
const INDEX: { alias: string; food: Food }[] = FOODS.flatMap((food) =>
  [food.name.toLowerCase(), ...food.aliases].map((alias) => ({ alias: alias.toLowerCase(), food })),
).sort((a, b) => b.alias.length - a.alias.length);

/** Find the food whose alias appears in `text`, preferring the longest match. */
export function matchFood(text: string): Food | null {
  const t = ` ${text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ")} `;
  for (const { alias, food } of INDEX) {
    if (t.includes(` ${alias} `)) return food;
  }
  return null;
}

/** Indexed rather than scanned — this is on the hot path of every totals pass. */
const BY_ID = new Map(FOODS.map((f) => [f.id, f]));

export const foodById = (id: string): Food | null => BY_ID.get(id) ?? null;
