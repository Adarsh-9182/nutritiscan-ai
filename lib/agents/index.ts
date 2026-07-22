import { ToolLoopAgent, tool } from "ai";
import { z } from "zod";
import { MODEL, SAFETY, TRIAGE_FORMAT } from "./safety";
import { memoryContext, type HealthProfile } from "../memory/profile";

// ------------------------------------------------------------
// Specialist subagents. Each is focused, safety-bound, and
// personalized with the user's Health Memory.
// ------------------------------------------------------------

function specialist(name: string, expertise: string, profile: HealthProfile) {
  return new ToolLoopAgent({
    model: MODEL,
    instructions: `You are the ${name} inside NutritiScan AI, a health operating system.
${expertise}

${SAFETY}

${memoryContext(profile)}

Answer ONLY within your specialty, concisely and practically. Return a focused
summary the supervisor can hand to the user. Reference the user's memory when relevant
(e.g. their goal, sleep, or lab values). No preamble.`,
  });
}

function buildSpecialists(profile: HealthProfile) {
  return {
    nutrition: specialist(
      "Nutrition Agent",
      "Expertise: protein targets, calories, macro/micro-nutrients, vitamin & mineral deficiencies, food choices, hydration. You reason about grams per kg, meal timing, and food sources.",
      profile,
    ),
    fitness: specialist(
      "Fitness Agent",
      "Expertise: workout programming, BMI/body-composition context, progressive overload, muscle gain vs fat loss, recovery, training frequency.",
      profile,
    ),
    doctor: specialist(
      "Doctor Agent (educational)",
      `Expertise: symptom education, general condition information, and how medications work in general terms. You NEVER diagnose or prescribe. When given symptoms, you reason like a careful triage assistant.
${TRIAGE_FORMAT}`,
      profile,
    ),
    lab: specialist(
      "Lab Agent",
      "Expertise: interpreting lab reports in plain language — CBC, thyroid (TSH/T3/T4), vitamin panels (B12, D), lipids, glucose. You explain what a value means, reference ranges, and trends, without diagnosing.",
      profile,
    ),
    coach: specialist(
      "Health Coach",
      "Expertise: sleep quality, habit formation, goal setting, consistency, reminders, motivation, and turning insights into small daily actions.",
      profile,
    ),
  };
}

// ------------------------------------------------------------
// Supervisor agent — routes to specialists and synthesizes one
// coherent, safe, personalized answer.
// ------------------------------------------------------------

export function buildSupervisor(profile: HealthProfile) {
  const s = buildSpecialists(profile);

  const delegate = (agent: ToolLoopAgent, label: string) =>
    tool({
      description: `Ask the ${label} for its expert input on the user's request.`,
      inputSchema: z.object({
        task: z.string().describe(`The specific question to route to the ${label}.`),
      }),
      execute: async ({ task }, { abortSignal }) => {
        const r = await agent.generate({ prompt: task, abortSignal });
        return r.text;
      },
    });

  return new ToolLoopAgent({
    model: MODEL,
    instructions: `You are the Supervisor of NutritiScan AI — an AI Health Operating System.
You coordinate five specialists (Nutrition, Fitness, Doctor, Lab, Health Coach) to help the
user understand their body and make better decisions.

How you work:
- Read the user's message and their Health Memory below.
- Route to ONE or MORE specialists via tools when their expertise helps. Prefer the
  minimum needed; for a symptom question use the Doctor Agent; for "am I eating enough
  protein" use Nutrition; a lab report goes to Lab; sleep/habits go to Coach.
- Synthesize the specialists' input into ONE warm, clear, personalized answer for the user.
  Do not mention the internal routing or agent names unless it helps clarity.
- Keep it scannable, human, and calm.

${SAFETY}

${TRIAGE_FORMAT}

${memoryContext(profile)}`,
    tools: {
      askNutritionAgent: delegate(s.nutrition, "Nutrition Agent"),
      askFitnessAgent: delegate(s.fitness, "Fitness Agent"),
      askDoctorAgent: delegate(s.doctor, "Doctor Agent"),
      askLabAgent: delegate(s.lab, "Lab Agent"),
      askCoachAgent: delegate(s.coach, "Health Coach"),
    },
  });
}
