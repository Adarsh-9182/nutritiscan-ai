import { bmi, heightImperial, type HealthProfile } from "../memory/profile";
import type { LoggedMeal } from "../memory/meals";
import { dayTotals } from "../memory/meals";
import { proteinTarget } from "../nutrition/analyze";

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

export function routeOf(text: string): Route {
  const t = text.toLowerCase();
  if (/(fever|cough|headache|pain|symptom|sick|cold|flu|nausea|dizzy|sore|vomit|breath|chest|infection)/.test(t)) return "doctor";
  if (/(protein|calorie|diet|vitamin|deficien|eat|food|nutrition|macro|meal|hydrat|water)/.test(t)) return "nutrition";
  if (/(workout|exercise|muscle|gym|training|bmi|body fat|strength|cardio|gain|lift)/.test(t)) return "fitness";
  if (/(report|blood|cbc|thyroid|tsh|b12|lab|panel|glucose|cholesterol|hemoglobin|test result)/.test(t)) return "lab";
  if (/(sleep|habit|goal|routine|remind|stress|recovery|consistency|motivat)/.test(t)) return "coach";
  return "supervisor";
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

export function demoAnswer(text: string, p: HealthProfile, meals: LoggedMeal[] = []): string {
  if (EMERGENCY.test(text)) {
    return `**This may be an emergency.** Please seek emergency care right now — call your local emergency number or go to the nearest ER. I can't safely triage this over chat.\n\n_I'm an educational companion, not a substitute for emergency medical care._`;
  }

  const route = routeOf(text);
  const name = p.name;

  if (route === "doctor") {
    // Deliberately no Inference, Recommendation, or Confidence section here.
    // A bare symptom mention ("I have a headache") is not enough to reason
    // from — per the Medical Reasoning Format, the honest move is to ask
    // before guessing, not to attach a low-confidence guess anyway. Medical
    // Warning is the exception: red flags are generic, not patient-specific,
    // so they can be stated with zero facts in hand.
    return `Sorry you're not feeling well, ${name}. Let me help you think this through calmly.

**Facts**
- Here's what I have: you mentioned not feeling well. That's not enough to reason from yet — I can't tell you what you have, because I have your answers to none of the questions below, and any specific cause I named would be a guess dressed up as a read.

**Clarifying questions**
1. When did it start, and is it getting better or worse?
2. How bad is it, 1–10?
3. Is anything else happening alongside it — fever, breathlessness, rash?
4. Have you taken any medicine for it today?
5. Has this happened before?
6. Anything that reliably makes it better or worse?

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

    return `Here's your nutrition read, ${name} — tuned to your goal of **${p.goal.toLowerCase()}**.

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
    return `Let's map your training to your goal, ${name}.

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
      return `I don't have any lab values for you yet, ${name} — so there's nothing here I can honestly interpret, and I won't guess.

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

    return `Here's a plain-language read of your recorded labs, ${name}:

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

    return `Love the focus on the fundamentals, ${name}. Here's your coach view.

**What's going well**
${going}

**Sleep**
- ${sleepRead(p.sleepHours)}
- A consistent wind-down time is the single biggest lever from here.

**Habit for this week**
- Pick one keystone habit (lights out by a fixed time) and I'll help you keep the streak.

_Small, repeatable steps beat big resets. I'll remember your progress and nudge gently._`;
  }

  return `Hi ${name} — I'm your NutritiScan supervisor. I coordinate five specialists (Nutrition, Fitness, Doctor, Lab, and your Health Coach) and I remember your full picture: ${p.weightKg} kg, goal to ${p.goal.toLowerCase()}, ~${p.sleepHours}h sleep, training ${p.exerciseDaysPerWeek} days a week.

Ask me anything — for example:
- "I have a fever" → I'll triage it carefully
- "Am I eating enough protein?" → Nutrition Agent
- "Explain my blood report" → Lab Agent
- "How's my sleep trend?" → Health Coach

_Educational companion — never a replacement for your doctor._`;
}
