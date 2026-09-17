import { parseMeal, type ScanItem } from "@/lib/nutrition/analyze";
import type { AssistantAnswer } from "./assistant";
import type { DayLog, LogEntry, Workspace } from "./types";
import { say, speaksHinglish } from "./voice";

/** Local calendar date, YYYY-MM-DD. */
export const localDate = (d = new Date()) => d.toLocaleDateString("en-CA");
export function shiftDate(date: string, days: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export type DayTotals = {
  date: string;
  water: number;
  sleep: number | null;
  mood: number | null;
  activityMinutes: number;
  meals: { text: string; items: ScanItem[] }[];
  kcal: number;
  protein: number;
  fiber: number;
  /** meals where no food was recognised — never guessed */
  unrecognisedMeals: number;
  symptoms: string[];
  medicines: string[];
  entries: number;
};

const r1 = (n: number) => Math.round(n * 10) / 10;

export function dayTotals(day: DayLog): DayTotals {
  const of = (kind: LogEntry["kind"]) =>
    day.entries.filter((e) => e.kind === kind);
  const meals = of("meal").map((e) => ({
    text: e.text,
    items: parseMeal(e.text),
  }));
  const items = meals.flatMap((m) => m.items);
  const moods = of("mood").map((e) => e.amount!);
  const sleeps = of("sleep").map((e) => e.amount!);
  return {
    date: day.date,
    water: of("water").reduce((s, e) => s + (e.amount ?? 0), 0),
    // The latest sleep entry is the correction of any earlier one that day.
    sleep: sleeps.length ? sleeps[sleeps.length - 1] : null,
    mood: moods.length
      ? r1(moods.reduce((s, m) => s + m, 0) / moods.length)
      : null,
    activityMinutes: of("activity").reduce((s, e) => s + (e.amount ?? 0), 0),
    meals,
    kcal: Math.round(items.reduce((s, i) => s + i.kcal, 0)),
    protein: r1(items.reduce((s, i) => s + i.protein, 0)),
    fiber: r1(items.reduce((s, i) => s + i.fiber, 0)),
    unrecognisedMeals: meals.filter((m) => !m.items.length).length,
    symptoms: of("symptom").map((e) => e.text),
    medicines: of("medicine").map((e) => e.text),
    entries: day.entries.length,
  };
}

export function recentDays(
  days: DayLog[] | undefined,
  today: string,
  count = 7,
): DayTotals[] {
  const byDate = new Map((days ?? []).map((d) => [d.date, d]));
  return Array.from({ length: count }, (_, i) => {
    const date = shiftDate(today, i - count + 1);
    return dayTotals(byDate.get(date) ?? { date, entries: [] });
  });
}

const average = (values: number[]) =>
  values.length ? r1(values.reduce((s, v) => s + v, 0) / values.length) : null;

export type Pattern = { title: string; detail: string };

/** Observations drawn only from what the person logged. Each states its sample
 * size and never implies a cause or a diagnosis. */
export function patterns(week: DayTotals[], hi = false): Pattern[] {
  const found: Pattern[] = [];
  const logged = week.filter((d) => d.entries > 0);
  if (!logged.length) return found;
  const nights = logged.filter((d) => d.sleep !== null);
  const sleepAvg = average(nights.map((d) => d.sleep!));
  if (nights.length >= 3 && sleepAvg !== null && sleepAvg < 7)
    found.push({
      title: say(
        hi,
        `Sleep averaged ${sleepAvg} h`,
        `Neend ausatan ${sleepAvg} ghante`,
      ),
      detail: say(
        hi,
        `Across ${nights.length} logged nights. Most adults are advised to get at least 7 hours; if tiredness or poor sleep continues, it is worth raising with a clinician.`,
        `${nights.length} raaton ke log se. Zyadatar badon ko kam se kam 7 ghante ki neend ki salah di jaati hai; agar thakaan ya kharab neend bani rahe to doctor se baat karein.`,
      ),
    });
  const short = logged.filter(
    (d) => d.sleep !== null && d.sleep < 6 && d.mood !== null,
  );
  const rested = logged.filter(
    (d) => d.sleep !== null && d.sleep >= 6 && d.mood !== null,
  );
  if (short.length >= 2 && rested.length >= 2) {
    const a = average(short.map((d) => d.mood!))!;
    const b = average(rested.map((d) => d.mood!))!;
    if (b - a >= 1)
      found.push({
        title: say(
          hi,
          "Mood was lower after short nights",
          "Kam neend ke baad mood kam raha",
        ),
        detail: say(
          hi,
          `Average mood ${a}/5 on ${short.length} days after under 6 h of sleep, versus ${b}/5 on ${rested.length} other days. A pattern in your notes, not proof of a cause.`,
          `6 ghante se kam neend wale ${short.length} dinon me mood ausatan ${a}/5, baaki ${rested.length} dinon me ${b}/5. Ye aapke notes ka pattern hai, wajah ka saboot nahi.`,
        ),
      });
  }
  const symptomDays = logged.filter((d) => d.symptoms.length);
  if (symptomDays.length >= 3)
    found.push({
      title: say(
        hi,
        `Symptoms noted on ${symptomDays.length} days`,
        `${symptomDays.length} din takleef note hui`,
      ),
      detail: say(
        hi,
        "Repeated symptoms are worth discussing with a clinician. Your log can go into a visit summary so you don’t have to remember the dates.",
        "Baar-baar hone wali takleef ke baare me doctor se baat karein. Aapka log visit summary me jaa sakta hai, taaki tareekhein yaad na rakhni padein.",
      ),
    });
  const mealDays = logged.filter((d) => d.meals.length && !d.unrecognisedMeals);
  const protein = average(mealDays.map((d) => d.protein));
  if (mealDays.length >= 3 && protein !== null)
    found.push({
      title: say(
        hi,
        `About ${Math.round(protein)} g protein a day`,
        `Roz lagbhag ${Math.round(protein)} g protein`,
      ),
      detail: say(
        hi,
        `Estimated from ${mealDays.length} days of recognised meals using typical portions. Needs vary with body weight, age and health; a dietitian can set a target for you.`,
        `${mealDays.length} din ke pehchane gaye khane se, aam portion ke hisaab se andaaza. Zaroorat vazan, umar aur sehat par nirbhar hai; dietitian aapka target tay kar sakte hain.`,
      ),
    });
  if (logged.length >= 5)
    found.push({
      title: say(
        hi,
        `${logged.length} of 7 days logged`,
        `7 me se ${logged.length} din log kiye`,
      ),
      detail: say(
        hi,
        "Consistent notes make patterns and visit summaries more useful.",
        "Roz ke notes se pattern aur visit summary zyada kaam ke bante hain.",
      ),
    });
  return found;
}

const QUESTION =
  /\?|^\s*(what|how|why|when|should|can|could|is|are|do|does|kya|kaise|kyu|kyon|kitna|kitni)\b/i;

/** Turn a first-person note like “had 2 rotis and dal for lunch” into proposed
 * entries. Returns null unless the message clearly records something; the
 * person always confirms before anything is saved. */
export function proposeLog(message: string): LogEntry[] | null {
  const text = message.trim().replace(/\s+/g, " ");
  if (!text || text.length > 300) return null;
  const explicit = /^(log|note|add)\b[:\s-]*/i;
  const isExplicit = explicit.test(text);
  if (QUESTION.test(text) && !isExplicit) return null;
  const body = text.replace(explicit, "");
  const entries: LogEntry[] = [];

  const water =
    body.match(
      /(\d{1,2})\s*(?:glass(?:es)?|gilas|cups?)\s*(?:of\s*)?(?:water|paani|pani)/i,
    ) ??
    body.match(
      /(?:water|paani|pani)\D{0,12}(\d{1,2})\s*(?:glass(?:es)?|gilas|cups?)/i,
    );
  if (water && Number(water[1]) > 0 && Number(water[1]) <= 30)
    entries.push({ kind: "water", text: "", amount: Number(water[1]) });

  const sleep =
    body.match(
      /(?:slept|sleep|soya|soyi|soye|neend)\D{0,20}?(\d{1,2}(?:\.\d)?)\s*(?:h\b|hrs?\b|hours?|ghante|ghanta)/i,
    ) ??
    body.match(
      /(\d{1,2}(?:\.\d)?)\s*(?:h\b|hrs?\b|hours?|ghante|ghanta)\D{0,12}(?:of\s*)?(?:sleep|neend|soya|soyi|soye)/i,
    );
  if (sleep && Number(sleep[1]) <= 24)
    entries.push({ kind: "sleep", text: "", amount: Number(sleep[1]) });

  const activity = body.match(
    /(walk(?:ed)?|ran|run|jog(?:ged)?|gym|workout|yoga|exercise[ds]?|cycl(?:ed|ing)|swim(?:ming)?|swam)\D{0,20}?(\d{1,3})\s*(?:min(?:ute)?s?|mins)\b/i,
  );
  if (activity && Number(activity[2]) > 0)
    entries.push({
      kind: "activity",
      text: activity[1].toLowerCase(),
      amount: Number(activity[2]),
    });

  const mood =
    body.match(/\bmood\D{0,10}([1-5])\s*(?:\/\s*5|out of 5)/i) ??
    body.match(
      /\b(?:feeling|feel|felt|mood)\s+(?:very\s+)?(great|good|okay|ok|fine|low|sad|bad|terrible|awful|acha|accha|theek)\b/i,
    );
  if (mood) {
    const words: Record<string, number> = {
      great: 5,
      good: 4,
      acha: 4,
      accha: 4,
      okay: 3,
      ok: 3,
      fine: 3,
      theek: 3,
      low: 2,
      sad: 2,
      bad: 2,
      terrible: 1,
      awful: 1,
    };
    const value = Number(mood[1]) || words[mood[1].toLowerCase()];
    if (value) entries.push({ kind: "mood", text: "", amount: value });
  }

  if (
    /\b(took|taken|had|li|le li|kha li|khayi)\b.*\b(tablet|tablets|medicine|medicines|dawai|dawa|pill|pills|capsule|capsules|dose)\b/i.test(
      body,
    )
  )
    entries.push({ kind: "medicine", text: body.slice(0, 300), amount: null });
  else if (
    /\b(ate|eaten|had|have had|khaya|khayi|khaye|breakfast|lunch|dinner|snack|nashta)\b/i.test(
      body,
    )
  ) {
    // Keep only the clauses that name food, so “had idli, slept 7 hours”
    // stores “had idli” as the meal and the sleep separately.
    const clauses = body
      .split(/\s*(?:[,;]|\.(?!\d))\s*|\s+(?:but|then|aur phir|phir)\s+/i)
      .filter((c) => c && parseMeal(c).length);
    if (clauses.length)
      entries.push({
        kind: "meal",
        text: clauses.join(", ").slice(0, 300),
        amount: null,
      });
  }

  if (/^symptom\b[:\s-]*/i.test(body))
    entries.push({
      kind: "symptom",
      text: body.replace(/^symptom\b[:\s-]*/i, "").slice(0, 300),
      amount: null,
    });

  return entries.length ? entries : null;
}

export const describeEntry = (e: LogEntry) => {
  switch (e.kind) {
    case "water":
      return `Water · ${e.amount} glass${e.amount === 1 ? "" : "es"}`;
    case "sleep":
      return `Sleep · ${e.amount} h`;
    case "mood":
      return `Mood · ${e.amount}/5`;
    case "activity":
      return `Activity · ${e.text ? `${e.text}, ` : ""}${e.amount} min`;
    case "meal": {
      const items = parseMeal(e.text);
      const protein = r1(items.reduce((s, i) => s + i.protein, 0));
      const kcal = Math.round(items.reduce((s, i) => s + i.kcal, 0));
      return items.length
        ? `Meal · ${e.text} (≈${kcal} kcal, ${protein} g protein)`
        : `Meal · ${e.text}`;
    }
    case "symptom":
      return `Symptom · ${e.text}`;
    case "medicine":
      return `Medicine · ${e.text}`;
  }
};

function dayText(d: DayTotals) {
  const parts = [
    d.meals.length
      ? `${d.meals.length} meal${d.meals.length > 1 ? "s" : ""}${
          d.meals.length > d.unrecognisedMeals
            ? ` (≈${d.kcal} kcal, ${d.protein} g protein from recognised foods)`
            : ""
        }`
      : "",
    d.water ? `${d.water} glass${d.water === 1 ? "" : "es"} of water` : "",
    d.sleep !== null ? `${d.sleep} h sleep` : "",
    d.mood !== null ? `mood ${d.mood}/5` : "",
    d.activityMinutes ? `${d.activityMinutes} min activity` : "",
    d.symptoms.length ? `symptoms: ${d.symptoms.join("; ")}` : "",
    d.medicines.length ? `medicines: ${d.medicines.join("; ")}` : "",
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "nothing logged";
}

/** Answers questions about the person's own daily log without a model. */
export function logAnswer(
  question: string,
  workspace: Workspace,
  today = localDate(),
): AssistantAnswer | undefined {
  // Only questions about what was recorded — “how can I improve my sleep” is
  // an education question, not a request to read the log.
  const aboutLog =
    (/\b(did i|have i|i've|maine|kaisi rahi|kaisa raha|kitna|kitni|this week|last week|past week|last (?:7|seven) days|today|aaj|hafte|my (?:daily )?log|so far)\b/i.test(
      question,
    ) &&
      /\b(sleep|slept|neend|water|paani|ate|eat|eaten|drank|khaya|khayi|piya|soya|khana|food|meals?|protein|calories|mood|week|hafte|log|habits?|activity|exercise)\b/i.test(
        question,
      )) ||
    /\b(weekly|week(?:'s)?) (summary|review|report)\b/i.test(question);
  if (!aboutLog || proposeLog(question)) return;
  const hi = speaksHinglish(question, workspace.profile);
  const week = recentDays(workspace.days, today);
  const logged = week.filter((d) => d.entries);
  if (!logged.length)
    return {
      mode: "record-summary",
      sources: [],
      text: say(
        hi,
        "You haven’t logged anything in the last 7 days. Tell me what you ate, how you slept or how you feel — for example “had 2 rotis and dal for lunch” or “slept 6 hours” — and I’ll add it to your daily log after you confirm.",
        "Pichhle 7 din me kuch log nahi hua. Batayein kya khaya, kitna soye ya kaisa mehsoos kar rahe hain — jaise “do roti aur dal khayi” ya “6 ghante soya” — aapke confirm karne ke baad main log me add kar dunga.",
      ),
    };
  const todayTotals = week[week.length - 1];
  const wantsToday =
    /\b(today|aaj)\b/i.test(question) && !/\bweek|hafte/i.test(question);
  const found = patterns(week, hi);
  const text = wantsToday
    ? [
        say(hi, "Today, from your log", "Aaj ka log"),
        "",
        dayText(todayTotals),
        ...todayTotals.meals.flatMap((m) =>
          m.items.length
            ? [
                `• ${m.text}: ${m.items
                  .map((i) => `${i.name} ${i.grams} g`)
                  .join(", ")}`,
              ]
            : [
                `• ${m.text}: ${say(hi, "no foods recognised, so no estimate", "koi khana pehchana nahi gaya, isliye andaaza nahi")}`,
              ],
        ),
        "",
        say(
          hi,
          "Nutrition figures are estimates from typical portions, not measurements.",
          "Nutrition ke numbers aam portion ke andaaze hain, naap nahi.",
        ),
      ]
    : [
        say(
          hi,
          `Your last 7 days (${logged.length} logged)`,
          `Aapke pichhle 7 din (${logged.length} din log hue)`,
        ),
        "",
        ...week.filter((d) => d.entries).map((d) => `${d.date}: ${dayText(d)}`),
        ...(found.length
          ? [
              "",
              say(hi, "What stands out", "Kya dikh raha hai"),
              ...found.map((p) => `• ${p.title}. ${p.detail}`),
            ]
          : []),
        "",
        say(
          hi,
          "These are summaries of what you logged, not a health assessment.",
          "Ye aapke log ka saar hai, sehat ki jaanch nahi.",
        ),
      ];
  return { mode: "record-summary", sources: [], text: text.join("\n") };
}
