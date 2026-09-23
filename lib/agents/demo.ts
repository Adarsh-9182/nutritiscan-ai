import { bmi, heightImperial, isRecorded, type HealthProfile } from "../memory/profile";
import type { LoggedMeal } from "../memory/meals";
import { dayTotals } from "../memory/meals";
import { proteinTarget } from "../nutrition/analyze";
import type { ClinicalState } from "@/lib/clinical/state";

// ------------------------------------------------------------
// DEMO BRAIN — a safe, rule-based responder used when no
// AI_GATEWAY_API_KEY is set, so the product is fully usable
// out of the box. When a key is present, the real multi-agent
// supervisor takes over (see lib/agents/index.ts).
// ------------------------------------------------------------

export type Route =
  | "doctor"
  | "nutrition"
  | "fitness"
  | "lab"
  | "coach"
  | "supervisor";

// Each domain in English and in the Hinglish people actually type.
const SYMPTOM = /(fever|cough|headache|pain|symptom|sick|cold|flu|nausea|dizzy|sore|vomit|breath|chest|infection|rash|diarrh|bukhar|bukhaar|dard|khansi|khaansi|zukaam|jukam|ulti|chakkar|dast|sujan|jalan)/;
const LAB = /(report|blood test|cbc|thyroid|tsh|\bt3\b|\bt4\b|b12|\blab\b|panel|glucose|hba1c|cholesterol|ldl|hdl|triglycer|hemoglobin|haemoglobin|ferritin|creatinine|test result|\d\s*(ng|pg|mg|mmol|µ?iu|miu|g)\s*\/\s*(ml|dl|l)\b)/;
const NUTRITION = /(protein|calorie|diet|vitamin|deficien|\beat|\bate\b|food|nutrition|macro|meal|hydrat|water|breakfast|lunch|dinner|snack|khana|khaya|khayi|roti|dal|paneer|chawal|rice|sabzi|nashta)/;
const FITNESS = /(workout|exercise|muscle|gym|training|bmi|body fat|strength|cardio|\bgain|lift|squat|push.?up|run|walk|kasrat|vyayam)/;
const COACH = /(sleep|habit|goal|routine|remind|stress|recovery|consistency|motivat|neend|thakan|tired|energy)/;

export function routeOf(text: string): Route {
  const t = text.toLowerCase();
  const hits = [SYMPTOM, LAB, NUTRITION, FITNESS, COACH].filter((r) => r.test(t)).length;
  if (SYMPTOM.test(t)) return "doctor";
  // Numbers with units are a report being read, even when the analyte is a vitamin.
  if (LAB.test(t)) return "lab";
  // Several domains at once is the supervisor's job: that is where noticing the
  // link between them matters.
  if (hits >= 3) return "supervisor";
  if (NUTRITION.test(t)) return "nutrition";
  if (FITNESS.test(t)) return "fitness";
  if (COACH.test(t)) return "coach";
  return "supervisor";
}

/** A turn with no health content at all — a greeting, thanks, "what can you do". */
export function isSmallTalk(text: string): boolean {
  const t = text.toLowerCase().trim();
  if (t.length > 80) return false;
  if ([SYMPTOM, LAB, NUTRITION, FITNESS, COACH].some((r) => r.test(t))) return false;
  return /^(hi+|hello|hey|namaste|namaskar|hola|yo|sup|good (morning|afternoon|evening|night)|thanks?|thank you|thx|shukriya|dhanyavaad|ok(ay)?|cool|nice|great|bye|who are you|what can you do|kaise ho|kya haal|help)\b/.test(t);
}

const EMERGENCY = /(can't breathe|cannot breathe|chest pain|suicid|kill myself|stroke|severe bleeding|unconscious|passing out)/i;

// ------------------------------------------------------------
// Judgements, made conditional.
//
// Every one of these used to be a fixed sentence. The fitness route told a
// user with a BMI of 31 they were "within a healthy range"; the coach told a
// user sleeping five hours it was "solid"; the lab route announced a low B12
// to people who had never recorded a blood test. The demo brain is not a
// placeholder — with no Gateway credential it *is* what production answers
// with, so it has to earn every claim from the profile in front of it.
// ------------------------------------------------------------

function bmiBand(b: number): string {
  if (b < 18.5) return `**BMI ${b}** — below the 18.5 healthy-range floor`;
  if (b <= 24.9) return `**BMI ${b}** — within the 18.5–24.9 healthy range`;
  if (b <= 29.9) return `**BMI ${b}** — above the healthy range (25–29.9)`;
  return `**BMI ${b}** — well above the healthy range. BMI is a crude measure and says nothing about body composition; worth discussing with a clinician`;
}

function trainingRead(days: number): string {
  if (days === 0) return `You haven't recorded any training days, so there's no base to build on yet — one session a week is a real start.`;
  if (days <= 2) return `Training **${days} day${days === 1 ? "" : "s"}/week** — enough to hold ground, not yet enough to drive much adaptation.`;
  if (days <= 5) return `Training **${days} days/week** — a strong, consistent base.`;
  return `Training **${days} days/week** — that's a lot. Make sure at least one day is genuinely easy.`;
}

function sleepRead(h: number): string {
  if (h < 6) return `You're averaging **${h}h**, which is below the 7–9h most adults need. This is the highest-leverage thing on your list.`;
  if (h < 7) return `You're averaging **${h}h** — just under the usual 7–9h range.`;
  if (h <= 9) return `You're averaging **${h}h** — inside the range most adults do well on.`;
  return `You're averaging **${h}h**. Consistently long sleep is worth mentioning to a clinician if you still wake tired.`;
}

const GOAL_PROTEIN_NOTE = (goal: string) =>
  /muscle|gain|strength|bulk/i.test(goal)
    ? "1.6–2.0 g/kg supports muscle gain"
    : /lose|fat|cut|weight/i.test(goal)
      ? "1.6 g/kg helps hold onto muscle in a deficit"
      : "1.2 g/kg covers general health";

/** Joins a list the way a person would: "a, b and c". */
function listOf(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export function demoAnswer(
  text: string,
  p: HealthProfile,
  meals: LoggedMeal[] = [],
  /**
   * What the extractor found this turn. Optional so the demo brain still
   * works standalone, but passed in practice — a keyless deployment should
   * not be the one place that ignores the clinical state.
   */
  state?: ClinicalState,
): string {
  if (EMERGENCY.test(text)) {
    return `**This may be an emergency.** Please seek emergency care right now — call your local emergency number or go to the nearest ER. I can't safely triage this over chat.\n\n_I'm an educational companion, not a substitute for emergency medical care._`;
  }

  const route = routeOf(text);
  // blankProfile's name is the greeting filler "there" — never address someone by it.
  const name = isRecorded(p, "name") && p.name && p.name !== "there" ? p.name : "";
  const to = name ? `, ${name}` : "";

  /*
   * Nothing here may state a body metric the person never gave.
   *
   * blankProfile has to put a number in weightKg, heightCm, sleepHours and
   * exerciseDaysPerWeek because the type requires one, and the answers below
   * quote all four flatly — "At 70 kg … aim for ~84 g/day". To a first-time
   * visitor that is not a default, it is a personalised target, and it is
   * wrong. The agent prompts already withhold these sections
   * (recordedSections); the keyless brain has to hold the same line, because
   * with no credential configured it is the only thing anybody sees.
   *
   * Only the routes that reason from the body are gated. Doctor, lab and a
   * plain question do not need a weight, and blocking those would be an
   * obstacle rather than a safeguard.
   */
  if (!isRecorded(p, "weightKg") && (route === "nutrition" || route === "fitness" || route === "supervisor")) {
    return `I'd rather ask than guess.

To answer that properly I need a couple of things about you — they change the numbers completely, and I don't have them yet.

- Your **weight**, and your **height** if you have it
- What you're working toward: building muscle, losing fat, or staying healthy

Tell me in a sentence ("68 kg, 5'9\", trying to build muscle") and I'll work from that. You can also open the chart beside this conversation and fill it in once.

_I won't invent a target from an average — a protein or calorie figure is only useful if it's actually yours._`;
  }

  if (route === "doctor") {
    // Deliberately no Inference, Recommendation, or Confidence section here.
    // A bare symptom mention ("I have a headache") is not enough to reason
    // from — per the Medical Reasoning Format, the honest move is to ask
    // before guessing, not to attach a low-confidence guess anyway. Medical
    // Warning is the exception: red flags are generic, not patient-specific,
    // so they can be stated with zero facts in hand.
    // Name what was actually reported. The extractor has already read this
    // turn, and saying "you mentioned not feeling well" back to someone who
    // wrote "I've had a fever since yesterday" reads as not having listened
    // — worse here than anywhere, because the consult note beside it says
    // "Chief complaint: Fever" and the two visibly disagree.
    const reported = (state?.findings ?? []).filter((f) => !f.qualifiers.historical);
    const said = reported.length
      ? `you told me about ${listOf(reported.map((f) => f.label.toLowerCase()))}`
      : "you mentioned not feeling well";

    // Drop the follow-up that asks about something they have already reported
    // or explicitly denied. DATA.md §3.5: do not re-ask what was answered.
    const known = new Set(
      [...reported.map((f) => f.label), ...(state?.negatives ?? [])].map((s) => s.toLowerCase()),
    );
    const alongside = ["fever", "breathlessness", "rash"].filter((s) => !known.has(s));

    const questions = [
      "When did it start, and is it getting better or worse?",
      "How bad is it, 1–10?",
      alongside.length ? `Is anything else happening alongside it — ${listOf(alongside)}?` : null,
      "Have you taken any medicine for it today?",
      "Has this happened before?",
      "Anything that reliably makes it better or worse?",
    ].filter((q): q is string => q !== null);

    return `Sorry you're not feeling well${to}. Let me help you think this through calmly.

**Facts**
- Here's what I have: ${said}. That's not enough to reason from yet — I can't tell you what you have, because I have your answers to none of the questions below, and any specific cause I named would be a guess dressed up as a read.

**Clarifying questions**
${questions.map((q, i) => `${i + 1}. ${q}`).join("\n")}

**Medical Warning**
- Seek care urgently if you have any of these:
- Difficulty breathing or chest pain
- A severe or worsening headache
- A stiff neck, confusion, or a rash that doesn't fade
- Fever above 39.4°C / 103°F, or lasting more than 3 days

**Recommendation**
- While you gather that: rest and sip fluids regularly
- Monitor your temperature every few hours
- Keep the room cool and comfortable

_This is educational information, not a diagnosis. If you're worried or it worsens, please see a clinician._`;
  }

  if (route === "nutrition") {
    // Same source as the scanner and the dashboard — three screens quoting
    // three different protein targets is how a health product loses trust.
    const target = proteinTarget(p);
    const b12 = p.biomarkers.find((x) => x.name.toLowerCase().includes("b12"));

    // Answer from what was actually logged. Quoting a target back at someone
    // whose meals we can see would be the one thing this product must not do.
    const DAY = 86_400_000;
    const window = meals.filter((m) => Date.now() - new Date(m.at).getTime() < 14 * DAY);
    const byDay = new Map<string, number>();
    for (const m of window) {
      const k = new Date(m.at).toDateString();
      byDay.set(k, (byDay.get(k) ?? 0) + m.protein);
    }
    const days = byDay.size;
    const avg = days ? Math.round([...byDay.values()].reduce((a, b) => a + b, 0) / days) : 0;
    const today = dayTotals(meals);

    const actual = days
      ? `**What you've actually eaten**
- Across the **${days} day${days === 1 ? "" : "s"}** you logged in the last fortnight, you averaged **${avg} g protein/day** — ${avg >= target ? "clearing" : `about **${target - avg} g short of**`} your ${target} g target.
- Today so far: **${today.protein} g protein**, ${today.kcal} kcal, from ${today.count} meal${today.count === 1 ? "" : "s"}.
- ${days < 3 ? "That's only a few days of data, so treat this as tentative rather than settled." : "That's enough logged data for this to be a reasonably solid read."}
- I only see meals you logged — anything unlogged is invisible to me.`
      : `**What you've actually eaten**
- Nothing is logged yet, so I genuinely don't know what you're eating and won't guess.
- Scan or describe a couple of meals and I'll answer this from your real intake instead of a formula.`;

    return `Here's your nutrition read${to} — tuned to your goal of **${p.goal.toLowerCase()}**.

${actual}

**Your protein target**
- At ${p.weightKg} kg with a goal of ${p.goal.toLowerCase()}, aim for **~${target} g/day** — ${GOAL_PROTEIN_NOTE(p.goal)}.
- Spread it across 3–4 meals (~${Math.round(target / 4)} g each) for better use.

**Micronutrients**
${
  b12
    ? `- Your **Vitamin B12 is ${b12.status}** (${b12.value}). B12 supports energy and nerve health — B12-rich foods (eggs, dairy, fish) or a supplement discussed with a clinician can help.`
    : p.biomarkers.length
      ? "- Nothing in your recorded panel is flagged low. Keep variety high."
      : "- You haven't recorded any lab values, so I can't say anything about your micronutrient status. Paste a report on the dashboard and I'll read it."
}
- Keep hydration steady across the day.

**Simple next step**
- Add one protein-forward snack (Greek yogurt, eggs, or a shake) on training days.

_General guidance, not a prescription — check supplements with your clinician._`;
  }

  if (route === "fitness") {
    const b = bmi(p);
    return `Let's map your training to your goal${to}.

**Where you are**
- ${p.heightCm} cm (${heightImperial(p.heightCm)}), ${p.weightKg} kg → ${bmiBand(b)}.
- ${trainingRead(p.exerciseDaysPerWeek)}

**For ${p.goal.toLowerCase()}**
- Prioritise **progressive overload**: add reps or a little weight each week.
- A 4-day upper/lower or push-pull-legs split fits most schedules well.
- Pair it with **~${proteinTarget(p)} g protein/day** and ${p.sleepHours}h+ sleep for recovery.

**This week**
- Log your top set on 2 key lifts so we can track progression.

_Educational guidance. Ease off and check with a professional if you feel pain beyond normal muscle soreness._`;
  }

  if (route === "lab") {
    // Read the panel that is actually recorded. This block used to state
    // "Your Vitamin B12 is on the low side" unconditionally — to users with an
    // empty panel, under a heading promising to read "your latest labs".
    if (!p.biomarkers.length) {
      return `I don't have any lab values for you yet${to} — so there's nothing here I can honestly interpret, and I won't guess.

**How to give me something to read**
- Open the dashboard and use **+ Report**, then paste the lines from your report — e.g. \`Vitamin B12: 180 pg/mL\`, \`Vitamin D 34\`, \`TSH 5.2\`.
- I'll extract each marker, record it with today's date, and explain it in plain language.
- Once there are two readings of the same marker, I can talk about the trend rather than the number.

_I interpret values in plain language — I don't diagnose. Please review results with your doctor._`;
    }

    // Facts: only the recorded values — no marker-specific clinical read is
    // attempted here (that would mean fabricating physiology per marker with
    // no knowledge base behind it, which is exactly the "invent medical
    // facts" failure the format exists to prevent). Inference is limited to
    // what a flag structurally means, not what it implies about the body.
    const lines = p.biomarkers
      .map((bm) => `- **${bm.name}: ${bm.value}** — ${bm.status}${bm.note ? ` (${bm.note})` : ""}`)
      .join("\n");
    const flagged = p.biomarkers.filter((bm) => bm.status !== "normal");
    const inference = flagged.length
      ? flagged.map((bm) => `- **${bm.name}** sits outside its typical reference range (${bm.status} at ${bm.value}). By itself that only means it's worth a closer look — not what's causing it.`).join("\n")
      : "- Nothing in this panel sits outside its reference range, based on what's recorded.";

    return `Here's a plain-language read of your recorded labs${to}:

**Facts**
${lines}

**Inference**
${inference}

**Recommendation**
- ${flagged.length ? "Bring the flagged value(s) to your clinician rather than acting on them alone." : "Keep logging results so trends become visible over time."}
- A second reading of the same marker turns this from a single data point into a trend, which I can read with more confidence.

**Medical Warning**
- A flagged lab value alone doesn't tell us if it's urgent — this dataset has no severity data. If you also have symptoms that feel severe or sudden, treat that as the signal to seek care, not the number by itself.

**Confidence**
- possible, ~30% — each value here is its most recently recorded reading, not a trend. Recording the same marker again over time (visible on your Timeline) is what would let me speak with more confidence.

_I interpret values in plain language — I don't diagnose. Please review results with your doctor._`;
  }

  if (route === "coach") {
    const trends = p.trends ?? [];
    // `[].map().join()` is "", not nullish, so the old `??` fallback never
    // fired and a user with no trends got an empty section under the heading
    // "What's going well".
    const going = trends.length
      ? trends.map((x) => `- ${x.label}: **${x.delta}** ${x.good ? "✅" : ""}`).join("\n")
      : "- I don't have enough history to point at a trend yet. Trends appear once there are repeated readings to compare.";

    return `Love the focus on the fundamentals${to}. Here's your coach view.

**What's going well**
${going}

**Sleep**
- ${sleepRead(p.sleepHours)}
- A consistent wind-down time is the single biggest lever from here.

**Habit for this week**
- Pick one keystone habit (lights out by a fixed time) and I'll help you keep the streak.

_Small, repeatable steps beat big resets. I'll remember your progress and nudge gently._`;
  }

  return `Hi${name ? ` ${name}` : ""} — I'm your NutritiScan supervisor. I coordinate five specialists (Nutrition, Fitness, Doctor, Lab, and your Health Coach) and I remember your full picture: ${p.weightKg} kg, goal to ${p.goal.toLowerCase()}, ~${p.sleepHours}h sleep, training ${p.exerciseDaysPerWeek} days a week.

Ask me anything — for example:
- "I have a fever" → I'll triage it carefully
- "Am I eating enough protein?" → Nutrition Agent
- "Explain my blood report" → Lab Agent
- "How's my sleep trend?" → Health Coach

_Educational companion — never a replacement for your doctor._`;
}
