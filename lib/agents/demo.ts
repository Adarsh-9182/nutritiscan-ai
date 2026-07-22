import { bmi, heightImperial, type HealthProfile } from "../memory/profile";

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

export function demoAnswer(text: string, p: HealthProfile): string {
  if (EMERGENCY.test(text)) {
    return `**This may be an emergency.** Please seek emergency care right now — call your local emergency number or go to the nearest ER. I can't safely triage this over chat.\n\n_I'm an educational companion, not a substitute for emergency medical care._`;
  }

  const route = routeOf(text);
  const name = p.name;

  if (route === "doctor") {
    return `Sorry you're not feeling well, ${name}. Let me help you think this through calmly.

**A few things I'd want to know**
1. What's your temperature right now?
2. Since when have you had it?
3. Any cough or sore throat?
4. Are you breathing normally?
5. Any medicines you've taken today?
6. Any recent travel?

**What this could relate to**
- A viral infection (most common)
- Seasonal flu
- Heat exhaustion, if you've been in high heat

**Confidence: ~65%** — this is a rough read without your temperature and timeline. More detail would sharpen it.

**🚩 Red flags — seek care urgently if you have:**
- Difficulty breathing or chest pain
- A severe or worsening headache
- A stiff neck, confusion, or a rash that doesn't fade
- Fever above 39.4°C / 103°F, or lasting more than 3 days

**What you can do now**
- Rest and sip fluids regularly
- Monitor your temperature every few hours
- Keep the room cool and comfortable

_This is educational information, not a diagnosis. If you're worried or it worsens, please see a clinician._`;
  }

  if (route === "nutrition") {
    const target = Math.round(p.weightKg * 1.8);
    const b12 = p.biomarkers.find((x) => x.name.toLowerCase().includes("b12"));
    return `Here's your nutrition read, ${name} — tuned to your goal of **${p.goal.toLowerCase()}**.

**Protein**
- For muscle gain at ${p.weightKg} kg, aim for **~${target} g/day** (1.6–2.0 g/kg).
- Spread it across 3–4 meals (~${Math.round(target / 4)} g each) for better use.

**Micronutrients**
${b12 ? `- Your **Vitamin B12 is ${b12.status}** (${b12.value}). B12 supports energy and nerve health — B12-rich foods (eggs, dairy, fish) or a supplement discussed with a clinician can help.` : "- Your recorded panel looks broadly okay; keep variety high."}
- Keep hydration steady across the day.

**Simple next step**
- Add one protein-forward snack (Greek yogurt, eggs, or a shake) on training days.

_General guidance, not a prescription — check supplements with your clinician._`;
  }

  if (route === "fitness") {
    const b = bmi(p);
    return `Let's map your training to your goal, ${name}.

**Where you are**
- ${p.heightCm} cm (${heightImperial(p.heightCm)}), ${p.weightKg} kg → **BMI ${b}** (within a healthy range).
- Training **${p.exerciseDaysPerWeek} days/week** — a strong, consistent base.

**For building muscle**
- Prioritise **progressive overload**: add reps or a little weight each week.
- A 4-day upper/lower or push-pull-legs split fits your schedule well.
- Pair it with **~${Math.round(p.weightKg * 1.8)} g protein/day** and ${p.sleepHours}h+ sleep for recovery.

**This week**
- Log your top set on 2 key lifts so we can track progression.

_Educational guidance. Ease off and check with a professional if you feel pain beyond normal muscle soreness._`;
  }

  if (route === "lab") {
    const lines = p.biomarkers
      .map((bm) => `- **${bm.name}: ${bm.value}** — ${bm.status}${bm.note ? ` (${bm.note})` : ""}`)
      .join("\n");
    return `Here's a plain-language read of your latest labs, ${name}:

${lines}

**What stands out**
- Your **Vitamin B12 is on the low side** — common and usually manageable through diet or a supplement, worth confirming with your clinician.
- Everything else sits in or near normal range.

**Trend view**
- I'll keep watching these over time and flag meaningful changes early.

_I interpret values in plain language — I don't diagnose. Please review results with your doctor._`;
  }

  if (route === "coach") {
    const t = p.trends?.[0];
    return `Love the focus on the fundamentals, ${name}. Here's your coach view.

**What's going well**
${p.trends?.map((x) => `- ${x.label}: **${x.delta}** ${x.good ? "✅" : ""}`).join("\n") ?? "- Consistent habits building nicely."}

**Sleep**
- You're averaging **${p.sleepHours}h** — solid. ${t ? `Your sleep is trending ${t.direction === "up" ? "up" : "steady"} (${t.delta}).` : ""}
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
