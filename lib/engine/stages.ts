// ============================================================
// NUTRITISCAN ENGINE · THE THREE CLINICAL STAGES
//
// Triage → Diagnosis → Treatment, run in sequence, each seeing the
// stage before it. This is a different shape from lib/agents (a
// supervisor routing to five topic specialists in whatever order it
// decides) and the difference is the point: a clinical encounter has
// an order, and urgency is decided before anything else is reasoned
// about.
// ============================================================

import { generateObject } from "ai";
import { MODEL, SAFETY } from "../agents/safety";
import { ALL_MEMORY_SECTIONS, memoryContext, type HealthProfile } from "../memory/profile";
import { DiagnosisResult, TreatmentResult, TriageResult } from "./contract";

/**
 * Every stage sees the full Health Memory.
 *
 * lib/agents narrows memory per specialist, which is right when the
 * question is "what should I eat". It is wrong here: in a clinical
 * pipeline an omitted allergy or medicine is indistinguishable from an
 * invented one, and each stage feeds the next, so a fact dropped at
 * triage is gone for the whole encounter.
 */
function base(profile: HealthProfile, nutrition: string | null) {
  return `${SAFETY}

${memoryContext(profile, ALL_MEMORY_SECTIONS)}
${nutrition ? `\n${nutrition}\n` : ""}`;
}

export async function runTriage(args: {
  userText: string;
  profile: HealthProfile;
  nutrition: string | null;
  signal?: AbortSignal;
}): Promise<TriageResult> {
  const { object } = await generateObject({
    model: MODEL,
    schema: TriageResult,
    abortSignal: args.signal,
    system: `You are the Triage stage of the NutritiScan Engine.

Your only job is to decide how quickly this person needs a human, and to
separate what they actually told you from what you might assume.

Rules:
- Set urgency by the worst plausible reading of what they described, not the
  most likely one. Under-triage is the expensive error here.
- "emergency" means: go now, do not wait for the rest of this answer.
- Put ONLY stated or remembered facts in \`facts\`. If you inferred it, it is
  not a fact and belongs nowhere in this stage.
- Set \`enoughToProceed\` to false when you would have to guess to say anything
  useful. Asking two good questions beats a confident answer built on nothing.

${base(args.profile, args.nutrition)}`,
    prompt: args.userText,
  });
  return object;
}

export async function runDiagnosis(args: {
  userText: string;
  triage: TriageResult;
  profile: HealthProfile;
  nutrition: string | null;
  signal?: AbortSignal;
}): Promise<DiagnosisResult> {
  const { object } = await generateObject({
    model: MODEL,
    schema: DiagnosisResult,
    abortSignal: args.signal,
    system: `You are the Diagnosis stage of the NutritiScan Engine.

You produce a DIFFERENTIAL — a small set of possibilities with the reasoning
that connects them to the facts. You never produce a verdict. Phrases like
"you have" are forbidden; use "this pattern can point to".

Rules:
- Ground every possibility in a fact from triage. If nothing supports it, leave
  it out rather than padding to a nice round number.
- \`distinguishers\` are what would actually separate these — a test, a timing
  detail, an associated symptom.
- Confidence is about your evidence, not your fluency. A single symptom with no
  history is "possible" at best, whatever the prose sounds like.

Triage already established:
- Presenting problem: ${args.triage.presentingProblem}
- Urgency: ${args.triage.urgency}
- Facts: ${args.triage.facts.join("; ") || "(none recorded)"}
- Red flags: ${args.triage.redFlags.join("; ") || "(none)"}

${base(args.profile, args.nutrition)}`,
    prompt: args.userText,
  });
  return object;
}

export async function runTreatment(args: {
  userText: string;
  triage: TriageResult;
  diagnosis: DiagnosisResult;
  profile: HealthProfile;
  nutrition: string | null;
  signal?: AbortSignal;
}): Promise<TreatmentResult> {
  const { object } = await generateObject({
    model: MODEL,
    schema: TreatmentResult,
    abortSignal: args.signal,
    system: `You are the Treatment stage of the NutritiScan Engine.

You produce safe next steps. You are NOT prescribing and there is nowhere in
your output to put a prescription — anything requiring one belongs in
\`questionsForClinician\`, phrased as a question they should ask.

Rules:
- \`selfCare\` is limited to things a person can safely do without a clinician:
  rest, fluids, positioning, tracking, over-the-counter measures described
  generically, and lifestyle changes. Never name a prescription drug with a
  dose or an instruction to start, stop, or change one.
- Respect their Health Memory: never suggest something that conflicts with a
  listed allergy, condition, or current medicine.
- \`watchFor\` must never be empty. It is how someone knows their situation
  changed after they close this app.

Context:
- Urgency: ${args.triage.urgency}
- Leading possibilities: ${args.diagnosis.possibilities.map((p) => `${p.condition} (${p.likelihood})`).join("; ")}

${base(args.profile, args.nutrition)}`,
    prompt: args.userText,
  });
  return object;
}
