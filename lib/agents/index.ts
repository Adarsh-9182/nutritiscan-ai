import { ToolLoopAgent, tool } from "ai";
import { z } from "zod";
import { SAFETY, MEDICAL_REASONING_FORMAT } from "./safety";
import { resolveModel } from "./provider";
import { memoryContext, ALL_MEMORY_SECTIONS, type HealthProfile, type MemorySection } from "../memory/profile";

// ------------------------------------------------------------
// Specialist subagents. Each is focused, safety-bound, and
// personalized with the user's Health Memory.
//
// CONTEXT ENGINEERING: each specialist declares only the memory sections
// its expertise actually uses, instead of every specialist getting the
// full profile (allergies, medicines, every biomarker) regardless of
// relevance. This is a scoping decision, not a safety one — the Supervisor
// (buildSupervisor, below) and the Doctor Agent both keep
// ALL_MEMORY_SECTIONS, because they're the two places a narrowed view could
// cause real harm: the Supervisor decides whether a question is
// cross-domain and routes to more than one specialist when it is, and
// Doctor's triage role means an omitted fact is indistinguishable from an
// invented one. A narrow specialist plus a broad synthesizer is the
// intended shape here, not a gap — see buildSupervisor's routing
// instructions, which explicitly tell it to consult more than one
// specialist when a question crosses domains.
// ------------------------------------------------------------

function specialist(name: string, expertise: string, profile: HealthProfile, sections: MemorySection[], nutrition: string | null) {
  const resolved = resolveModel("specialist");
  return new ToolLoopAgent({
    model: resolved.model,
    providerOptions: resolved.providerOptions,
    instructions: `You are the ${name} inside NutritiScan AI, a health operating system.
${expertise}

${SAFETY}

${memoryContext(profile, sections)}
${nutrition ? `\n${nutrition}\n` : ""}
Answer ONLY within your specialty, concisely and practically. Return a focused
summary the supervisor can hand to the user. Reference the user's memory when relevant
(e.g. their goal, sleep, or lab values). No preamble.`,
  });
}

export function buildSpecialists(profile: HealthProfile, nutrition: string) {
  return {
    nutrition: specialist(
      "Nutrition Agent",
      "Expertise: protein targets, calories, macro/micro-nutrients, vitamin & mineral deficiencies, food choices, hydration. You reason about grams per kg, meal timing, and food sources.",
      profile,
      // Not sleep/activity — training frequency doesn't change a food answer.
      ["identity", "vitals", "goal", "allergies", "medicines", "conditions", "biomarkers"],
      nutrition,
    ),
    fitness: specialist(
      "Fitness Agent",
      "Expertise: workout programming, BMI/body-composition context, progressive overload, muscle gain vs fat loss, recovery, training frequency.",
      profile,
      // Not allergies/medicines/biomarkers — a workout plan doesn't hinge on lab values.
      ["identity", "vitals", "goal", "sleep", "activity", "conditions"],
      nutrition,
    ),
    doctor: specialist(
      "Doctor Agent (educational)",
      `Expertise: symptom education, general condition information, and how medications work in general terms. You NEVER diagnose or prescribe. When given symptoms, you reason like a careful triage assistant.
${MEDICAL_REASONING_FORMAT}`,
      profile,
      ALL_MEMORY_SECTIONS, // triage can turn on any fact — narrowing this one is the actual risk
      nutrition,
    ),
    lab: specialist(
      "Lab Agent",
      `Expertise: interpreting lab reports in plain language — CBC, thyroid (TSH/T3/T4), vitamin panels (B12, D), lipids, glucose. You explain what a value means, reference ranges, and trends, without diagnosing. A recorded value is a Fact; what it might indicate is Inference — never blur the two.
${MEDICAL_REASONING_FORMAT}`,
      profile,
      // Not vitals/goal/sleep/activity/allergies — reading a panel doesn't need them.
      // Medicines and conditions stay: some medicines (e.g. biotin, metformin) skew
      // specific assay results, and chronic conditions contextualize an abnormal value.
      ["identity", "medicines", "conditions", "biomarkers"],
      null, // meal log isn't relevant to interpreting a blood panel
    ),
    coach: specialist(
      "Health Coach",
      "Expertise: sleep quality, habit formation, goal setting, consistency, reminders, motivation, and turning insights into small daily actions.",
      profile,
      // Not allergies/medicines/biomarkers — habit coaching isn't a medical read.
      ["identity", "goal", "sleep", "activity"],
      null, // food is the Nutrition Agent's job, not the Coach's
    ),
  };
}

// ------------------------------------------------------------
// Supervisor agent — routes to specialists and synthesizes one
// coherent, safe, personalized answer.
// ------------------------------------------------------------

/**
 * @param triage Directive from the deterministic safety layer (lib/safety).
 *   Present only when triage returned `urgent`. It is injected ABOVE the
 *   safety block rather than appended at the end: this instruction is the
 *   one thing in the prompt the model is explicitly forbidden from
 *   overriding, and burying it under a long memory dump is how it would get
 *   lost. `emergency` never reaches this function at all — that turn is
 *   answered by a fixed template with no model call.
 */
export function buildSupervisor(
  profile: HealthProfile,
  nutrition: string,
  recalled?: string | null,
  triage?: string | null,
  /**
   * What the deterministic extractor found in this turn (lib/clinical/brief.ts).
   * Separate from `triage`: this is what the patient said, that is what the
   * safety layer decided, and the model may question the first but not the
   * second.
   */
  brief?: string | null,
) {
  const resolved = resolveModel();
  const s = buildSpecialists(profile, nutrition);

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
    model: resolved.model,
    providerOptions: resolved.providerOptions,
    instructions: `You are the Supervisor of NutritiScan AI — an AI Health Operating System.
${triage ? `\n${triage}\n` : ""}${brief ? `\n${brief}\n` : ""}
You coordinate five specialists (Nutrition, Fitness, Doctor, Lab, Health Coach) to help the
user understand their body and make better decisions.

How you work:
- Read the user's message and their Health Memory below. You see the user's FULL memory;
  each specialist you consult sees only the slice relevant to their expertise (e.g. the
  Nutrition Agent doesn't see sleep hours, the Fitness Agent doesn't see lab values). You
  are the only one positioned to notice when a fact outside the obvious specialist's scope
  is actually relevant.
- Route to ONE or MORE specialists via tools when their expertise helps. Default to the
  single best-fit specialist for a clearly single-domain question (a lab report goes to
  Lab; sleep/habits go to Coach) — but if their Health Memory suggests a cross-domain
  factor might matter (poor sleep behind constant hunger, a medicine that could explain
  low energy for training, a flagged lab value relevant to a symptom), consult that
  second specialist too rather than letting the primary one answer blind to it.
- Synthesize the specialists' input into ONE warm, clear, personalized answer for the user.
  Do not mention the internal routing or agent names unless it helps clarity.
- Keep it scannable, human, and calm.

${SAFETY}

${MEDICAL_REASONING_FORMAT}

${memoryContext(profile, ALL_MEMORY_SECTIONS)}

${nutrition}
${recalled ? `\n${recalled}\n` : ""}`,
    tools: {
      askNutritionAgent: delegate(s.nutrition, "Nutrition Agent"),
      askFitnessAgent: delegate(s.fitness, "Fitness Agent"),
      askDoctorAgent: delegate(s.doctor, "Doctor Agent"),
      askLabAgent: delegate(s.lab, "Lab Agent"),
      askCoachAgent: delegate(s.coach, "Health Coach"),
    },
  });
}
