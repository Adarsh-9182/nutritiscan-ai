// ============================================================
// NUTRITISCAN ENGINE
//
//                       USER
//                        │
//                        ▼
//               ┌─────────────────┐
//               │ NutritiScan     │
//               │ Engine          │
//               └────────┬────────┘
//         ┌──────────────┼──────────────┐
//         ▼              ▼              ▼
//      Triage   →    Diagnosis   →   Treatment
//         │              │              │
//         └──────────────┼──────────────┘
//                        ▼
//               Safety / validation
//                        ▼
//              Patient-facing answer
//
// Two things differ from a naive reading of that diagram, both
// deliberate:
//
// 1. The stages are SEQUENTIAL, not parallel. Each one's output is
//    the next one's input. Diagnosing before triaging is what
//    produces a calm paragraph about a heart attack.
//
// 2. The pipeline can stop early. An emergency exits at stage 1, and
//    a too-thin description exits by asking questions instead of
//    manufacturing a differential. A pipeline that always runs all
//    three stages will always produce three stages' worth of
//    confidence, which is exactly the failure we are engineering
//    against.
// ============================================================

import type { HealthProfile } from "../memory/profile";
import type { EngineResult, TriageResult } from "./contract";
import { runDiagnosis, runTreatment, runTriage } from "./stages";
import { detectEmergency, validate } from "./validate";

export * from "./contract";
export { detectEmergency, isPrescriptionInstruction, validate } from "./validate";

/**
 * Emergency copy is a constant, not a generated string.
 *
 * When someone describes chest pain, the one sentence that matters must not
 * depend on a model call that could be slow, rate-limited, or creative.
 */
export const EMERGENCY_ANSWER = `**Please seek emergency care now.**

What you've described can be a medical emergency. Call your local emergency number or go to the nearest emergency department — don't wait, and don't drive yourself if you feel faint or short of breath.

I'm not going to work through possibilities with you here, because none of that changes what to do in the next few minutes.`;

export async function runEngine(args: {
  userText: string;
  profile: HealthProfile;
  nutrition?: string | null;
  signal?: AbortSignal;
}): Promise<EngineResult> {
  const nutrition = args.nutrition ?? null;

  // --- Stage 1: Triage ----------------------------------------------
  const triage = await runTriage({
    userText: args.userText,
    profile: args.profile,
    nutrition,
    signal: args.signal,
  });

  // Escalation is checked against the user's own words before anything
  // downstream runs, so a mis-triage cannot carry into two more stages.
  const forced = detectEmergency(args.userText);
  const isEmergency = triage.urgency === "emergency" || forced.length > 0;

  if (isEmergency) {
    const gate = validate({ userText: args.userText, triage, diagnosis: null, treatment: null });
    return {
      triage: { ...triage, urgency: gate.urgency, redFlags: gate.redFlags },
      diagnosis: null,
      treatment: null,
      violations: gate.violations,
      stoppedAt: "emergency",
    };
  }

  // --- Not enough to reason from: ask, don't guess -------------------
  if (!triage.enoughToProceed && triage.missingInfo.length > 0) {
    const gate = validate({ userText: args.userText, triage, diagnosis: null, treatment: null });
    return {
      triage: { ...triage, urgency: gate.urgency, redFlags: gate.redFlags },
      diagnosis: null,
      treatment: null,
      violations: gate.violations,
      stoppedAt: "needs-info",
    };
  }

  // --- Stage 2: Diagnosis -------------------------------------------
  const diagnosis = await runDiagnosis({
    userText: args.userText,
    triage,
    profile: args.profile,
    nutrition,
    signal: args.signal,
  });

  // --- Stage 3: Treatment -------------------------------------------
  const treatment = await runTreatment({
    userText: args.userText,
    triage,
    diagnosis,
    profile: args.profile,
    nutrition,
    signal: args.signal,
  });

  // --- Safety / validation ------------------------------------------
  const gate = validate({ userText: args.userText, triage, diagnosis, treatment });

  return {
    triage: { ...triage, urgency: gate.urgency, redFlags: gate.redFlags },
    diagnosis,
    treatment: gate.treatment,
    violations: gate.violations,
    stoppedAt: "complete",
  };
}

// ------------------------------------------------------------
// Composition — structured result to patient-facing markdown.
//
// Kept separate from the stages so the same result can be rendered
// differently (chat bubble, printable summary, clinician handoff)
// without re-running a single model call.
// ------------------------------------------------------------

function bullets(items: string[]): string {
  return items.map((i) => `- ${i}`).join("\n");
}

function urgencyLine(urgency: TriageResult["urgency"]): string {
  switch (urgency) {
    case "urgent":
      return "Based on what you've described, this is worth getting seen for **today or tomorrow** rather than waiting it out.";
    case "routine":
      return "This doesn't look like something that needs urgent care, but it is worth raising with a clinician if it persists.";
    case "self-care":
      return "This looks like something you can reasonably manage at home for now.";
    case "emergency":
      return "This needs emergency care now.";
  }
}

export function composeAnswer(result: EngineResult): string {
  if (result.stoppedAt === "emergency") return EMERGENCY_ANSWER;

  if (result.stoppedAt === "needs-info") {
    return [
      `I want to help with this, but I'd be guessing if I answered now — so let me ask a couple of things first.`,
      ``,
      bullets(result.triage.missingInfo),
      ``,
      result.triage.redFlags.length
        ? `**Medical Warning** — get seen urgently if any of these apply: ${result.triage.redFlags.join(", ")}.`
        : `**Medical Warning** — if anything changes sharply or you start to feel frightened by it, get seen rather than waiting for a follow-up here.`,
      ``,
      `_Educational only — this isn't a diagnosis._`,
    ].join("\n");
  }

  const { triage, diagnosis, treatment } = result;
  const out: string[] = [];

  out.push(`Thanks for telling me about this — here's how I'd think it through.`, ``);

  out.push(`**Facts**`, bullets(triage.facts.length ? triage.facts : ["Only what you've described just now."]), ``);

  if (diagnosis) {
    out.push(`**Inference**`);
    out.push(
      bullets(diagnosis.possibilities.map((p) => `*${p.condition}* (${p.likelihood}) — ${p.reasoning}`)),
    );
    if (diagnosis.distinguishers.length) {
      out.push(``, `What would help tell these apart:`, bullets(diagnosis.distinguishers));
    }
    out.push(``);
  }

  if (treatment) {
    out.push(`**Recommendation**`);
    out.push(urgencyLine(triage.urgency), ``);
    if (treatment.selfCare.length) out.push(`What you can do now:`, bullets(treatment.selfCare), ``);
    if (treatment.questionsForClinician.length) {
      out.push(`Worth asking a clinician:`, bullets(treatment.questionsForClinician), ``);
    }
  }

  out.push(`**Medical Warning**`);
  const warn = [...(treatment?.watchFor ?? []), ...(treatment?.whenToSeeClinician ?? [])];
  out.push(
    warn.length
      ? bullets(warn)
      : "Nothing you've described points to an emergency right now — but get seen if it worsens quickly.",
  );
  out.push(``);

  if (diagnosis) {
    out.push(
      `**Confidence** — ${diagnosis.confidence} (~${Math.round(diagnosis.confidencePct)}%). ${diagnosis.confidenceReason}`,
      ``,
    );
  }

  out.push(`_Educational only — this isn't a diagnosis, and I can't examine you._`);

  return out.join("\n");
}
