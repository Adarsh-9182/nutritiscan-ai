import { describe, expect, it, vi } from "vitest";
import { cosineSimilarity, recallRelevant } from "./recall";
import { journalEntry } from "./journal";
import { blankProfile, type HealthProfile } from "./profile";
import type { LoggedMeal } from "./meals";

const { embedManyMock } = vi.hoisted(() => ({ embedManyMock: vi.fn() }));

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return { ...actual, embedMany: embedManyMock };
});

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

const profileWith = (journal: HealthProfile["journal"]): HealthProfile => ({ ...blankProfile, journal });

const meal = (over: Partial<LoggedMeal> = {}): LoggedMeal => ({
  id: "m1",
  at: new Date().toISOString(),
  title: "Dal and rice",
  items: ["Dal (150 g)"],
  kcal: 400,
  protein: 20,
  carbs: 60,
  fat: 8,
  fiber: 9,
  fitScore: 75,
  source: "text",
  ...over,
});

describe("cosineSimilarity", () => {
  it("is 1 for identical vectors", () => {
    expect(cosineSimilarity([1, 0, 1], [1, 0, 1])).toBeCloseTo(1);
  });

  it("is 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it("doesn't divide by zero for a zero vector", () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
});

describe("recallRelevant", () => {
  it("skips the embedding call entirely with no history", async () => {
    const result = await recallRelevant("headache", blankProfile, []);
    expect(result).toBeNull();
    expect(embedManyMock).not.toHaveBeenCalled();
  });

  it("skips the embedding call for an empty query", async () => {
    const journal = [journalEntry({ kind: "symptom", title: "Headache logged", at: daysAgo(3) })];
    const result = await recallRelevant("   ", profileWith(journal), []);
    expect(result).toBeNull();
    expect(embedManyMock).not.toHaveBeenCalled();
  });

  it("ranks by similarity and reorders the top matches chronologically", async () => {
    const journal = [
      journalEntry({ kind: "symptom", title: "Headache after workouts", at: daysAgo(30) }),
      journalEntry({ kind: "milestone", title: "Started tracking with NutritiScan", at: daysAgo(200) }),
    ];
    const meals = [meal({ id: "m-recent", title: "Grilled chicken and rice", at: daysAgo(1) })];

    // Order of values passed to embedMany is [query, ...docs] — here:
    // [query, symptom(-30d), milestone(-200d), meal(-1d)].
    // Give the symptom the strongest match, the meal a weak-but-passable
    // match, and the milestone below the relevance floor entirely.
    embedManyMock.mockResolvedValueOnce({
      embeddings: [
        [1, 0, 0], // query
        [0.99, 0.1, 0], // symptom — closest
        [0, 1, 0], // milestone — orthogonal, filtered out
        [0.5, 0.5, 0], // meal — weaker, but still above the floor
      ],
    });

    const result = await recallRelevant("why does my head hurt after training", profileWith(journal), meals);

    expect(result).not.toBeNull();
    expect(result).toContain("RELEVANT HEALTH HISTORY");
    expect(result).toContain("Headache after workouts");
    expect(result).toContain("Grilled chicken and rice");
    expect(result).not.toContain("Started tracking with NutritiScan");

    // Chronological within the retrieved set: the older symptom (-30d)
    // should appear before the more recent meal (-1d) despite scoring higher.
    const symptomIdx = result!.indexOf("Headache after workouts");
    const mealIdx = result!.indexOf("Grilled chicken and rice");
    expect(symptomIdx).toBeLessThan(mealIdx);
  });

  it("returns null when every candidate is below the relevance floor", async () => {
    const journal = [journalEntry({ kind: "goal", title: "Goal set: build muscle", at: daysAgo(5) })];
    embedManyMock.mockResolvedValueOnce({
      embeddings: [
        [1, 0], // query
        [0, 1], // completely unrelated
      ],
    });
    const result = await recallRelevant("is my vitamin d improving", profileWith(journal), []);
    expect(result).toBeNull();
  });

  it("degrades to null instead of throwing when the embedding call fails", async () => {
    const journal = [journalEntry({ kind: "symptom", title: "Sore throat", at: daysAgo(2) })];
    embedManyMock.mockRejectedValueOnce(new Error("gateway unavailable"));
    await expect(recallRelevant("what about my throat", profileWith(journal), [])).resolves.toBeNull();
  });
});
