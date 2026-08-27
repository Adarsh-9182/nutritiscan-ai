// ============================================================
// HEALTH MEMORY — SEMANTIC RECALL
//
// memoryContext() and nutritionContext() give every agent a fixed slice of
// the record: current biomarker values, the last ~14 days of meals. Journal
// entries — symptoms, milestones, past lab readings, goal changes — never
// reached an agent at all; they only powered the Timeline UI client-side
// (lib/health/timeline.ts, lib/health/insights.ts).
//
// This is what makes "Health Memory" — already described on the landing
// page as "RAG + longitudinal store" — actually a RAG: embed the journal
// and meal history, embed the question, and retrieve whichever entries are
// semantically relevant, not just whichever are most recent. A question
// about a headache should be able to surface a symptom logged two months
// ago even though it would never make the 14-day nutrition window or any
// fixed "last N" cutoff.
//
// Deliberately NOT persisted. There's no backend yet — memory lives in
// localStorage (see the note in lib/memory/store.ts) — so embeddings are
// recomputed per request rather than cached. That's the honest cost of this
// pass: one extra request-scoped embedMany call, added latency on every
// real chat turn. Caching embeddings alongside the record is the natural
// next step once there's somewhere durable to put them, not a gap here.
// ============================================================

import { embedMany } from "ai";
import { resolveEmbeddingModel } from "../agents/provider";
import type { HealthProfile } from "./profile";
import type { LoggedMeal } from "./meals";

type RecallDoc = { text: string; at: string };

/** Bounds the embedding call's cost and latency to the most recent slice of
 * a long history, not the whole thing. */
const MAX_JOURNAL = 60;
const MAX_MEALS = 60;
/** How many retrieved entries actually reach the agent. */
const TOP_K = 8;
/**
 * Below this, a match is noise, not signal. Unscientific — there's no
 * labelled data here to calibrate against — but its job is only to keep an
 * unrelated entry from padding the context just to fill the count, so a
 * conservative floor is the safe direction to be wrong in.
 */
const MIN_SIMILARITY = 0.15;

function journalDocs(p: HealthProfile): RecallDoc[] {
  return (p.journal ?? []).slice(-MAX_JOURNAL).map((e) => ({
    at: e.at,
    text: `${new Date(e.at).toLocaleDateString()}: ${e.title}${e.detail ? ` — ${e.detail}` : ""}`,
  }));
}

function mealDocs(meals: LoggedMeal[]): RecallDoc[] {
  return meals.slice(-MAX_MEALS).map((m) => ({
    at: m.at,
    text: `${new Date(m.at).toLocaleDateString()}: ${m.title} — ${m.kcal} kcal, ${m.protein} g protein (meal fit ${m.fitScore}/100)`,
  }));
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

/**
 * Retrieve whichever journal entries and meals are actually relevant to the
 * question, ranked by embedding similarity rather than recency.
 *
 * Never throws: an embedding failure (rate limit, unsupported model,
 * network) degrades to no retrieved context — memoryContext() and
 * nutritionContext() still carry the answer, just without this extra reach
 * into older history.
 */
export async function recallRelevant(
  query: string,
  profile: HealthProfile,
  meals: LoggedMeal[],
  signal?: AbortSignal,
): Promise<string | null> {
  const docs = [...journalDocs(profile), ...mealDocs(meals)];
  if (!docs.length || !query.trim()) return null;

  const embedding = resolveEmbeddingModel();

  try {
    const { embeddings } = await embedMany({
      model: embedding,
      values: [query, ...docs.map((d) => d.text)],
      abortSignal: signal,
    });
    const [queryVec, ...docVecs] = embeddings;

    const ranked = docs
      .map((d, i) => ({ doc: d, score: cosineSimilarity(queryVec, docVecs[i]) }))
      .filter((r) => r.score >= MIN_SIMILARITY)
      .sort((a, b) => b.score - a.score)
      .slice(0, TOP_K)
      // Chronological within the retrieved set — a reasoning trace should
      // read as a timeline, not a relevance-ranked jumble.
      .sort((a, b) => new Date(a.doc.at).getTime() - new Date(b.doc.at).getTime());

    if (!ranked.length) return null;

    return `[RELEVANT HEALTH HISTORY — retrieved by relevance to this question, not just recency]\n${ranked
      .map((r) => `  - ${r.doc.text}`)
      .join("\n")}\n[END RELEVANT HEALTH HISTORY]`;
  } catch (err) {
    console.error("[recall] embedding retrieval failed", err);
    return null;
  }
}
