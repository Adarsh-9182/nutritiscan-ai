/** Source-backed, structural rubric for a basic human-physiology answer. */
export type BiologyCriterion = {
  id: string;
  description: string;
  /** Alternative phrasing patterns; avoids requiring one exact sentence. */
  anyOf: RegExp[];
};

export type BiologyRubric = {
  id: string;
  question: string;
  source: { title: string; url: string };
  required: BiologyCriterion[];
  criticalErrors: BiologyCriterion[];
};

export type BiologyScore = {
  passed: boolean;
  coverage: number;
  covered: string[];
  missing: string[];
  criticalErrors: string[];
};

/**
 * Starter case for human physiology: insulin and glucagon in glucose
 * homeostasis. Expected concepts are based on the source recorded on the case.
 */
export const glucoseHomeostasisRubric: BiologyRubric = {
  id: "physiology.glucose-homeostasis",
  question: "In a healthy person, how do insulin and glucagon help regulate blood glucose after a meal and between meals?",
  source: {
    title: "Physiology, Islets of Langerhans — NCBI Bookshelf",
    url: "https://www.ncbi.nlm.nih.gov/books/NBK542302/",
  },
  required: [
    {
      id: "insulin-source-and-trigger",
      description: "Higher blood glucose stimulates pancreatic beta cells to release insulin.",
      anyOf: [
        /(?:rising|increased|higher|high) (?:blood )?glucose.{0,100}(?:pancreatic )?(?:beta|β) cells?.{0,80}insulin/i,
        /(?:pancreatic )?(?:beta|β) cells?.{0,80}insulin.{0,100}(?:after a meal|when glucose (?:rises|is high))/i,
      ],
    },
    {
      id: "insulin-effect",
      description: "Insulin promotes glucose uptake or storage and lowers blood glucose.",
      anyOf: [
        /insulin.{0,120}(?:glucose uptake|take up glucose|glucose into (?:muscle|tissue|cells)|store glucose).{0,100}(?:lower|decrease|reduce) (?:blood )?glucose/i,
        /insulin.{0,160}(?:lowers|reduces|decreases) (?:blood )?glucose/i,
      ],
    },
    {
      id: "glucagon-source-and-trigger",
      description: "Low blood glucose between meals promotes glucagon release from pancreatic alpha cells.",
      anyOf: [
        /(?:low|falling|lower) (?:blood )?glucose.{0,120}(?:pancreatic )?(?:alpha|α) cells?.{0,80}glucagon/i,
        /(?:pancreatic )?(?:alpha|α) cells?.{0,80}glucagon.{0,120}(?:low|falling|between meals|fasting)/i,
      ],
    },
    {
      id: "glucagon-effect",
      description: "Glucagon increases blood glucose, principally by signaling the liver to release glucose.",
      anyOf: [
        /glucagon.{0,140}(?:liver|hepatic).{0,100}(?:release|produce|put|supply).{0,80}glucose/i,
        /glucagon.{0,120}(?:raises|increases) (?:blood )?glucose/i,
      ],
    },
  ],
  criticalErrors: [
    {
      id: "hormone-cell-swap",
      description: "Do not assign insulin to alpha cells or glucagon to beta cells.",
      anyOf: [/(?:alpha|α) cells?.{0,60}(?:release|secrete|produce|make) insulin/i, /(?:beta|β) cells?.{0,60}(?:release|secrete|produce|make) glucagon/i],
    },
    {
      id: "hormone-effect-swap",
      description: "Do not claim insulin raises or glucagon lowers blood glucose.",
      anyOf: [
        /insulin.{0,80}(?:raises|increases) (?:blood )?glucose/i,
        /glucagon.{0,80}(?:lowers|decreases|reduces) (?:blood )?glucose/i,
      ],
    },
  ],
};

/** Score mechanism coverage and high-impact concept reversals, not writing style. */
export function scoreBiologyAnswer(answer: string, rubric: BiologyRubric): BiologyScore {
  const covered = rubric.required.filter((criterion) => criterion.anyOf.some((pattern) => pattern.test(answer))).map((criterion) => criterion.id);
  const missing = rubric.required.filter((criterion) => !covered.includes(criterion.id)).map((criterion) => criterion.id);
  const criticalErrors = rubric.criticalErrors
    .filter((criterion) => criterion.anyOf.some((pattern) => pattern.test(answer)))
    .map((criterion) => criterion.id);
  return {
    passed: missing.length === 0 && criticalErrors.length === 0,
    coverage: rubric.required.length === 0 ? 1 : covered.length / rubric.required.length,
    covered,
    missing,
    criticalErrors,
  };
}
