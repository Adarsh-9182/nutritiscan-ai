/** Curated educational summaries, not a clinical knowledge base or live search.
 * Source pages checked 2026-09-16; B12 checked 2026-09-23. Keep summaries and provenance together. */
export const HEALTH_LIBRARY = [
  {
    id: "nutrition",
    title: "Nutrition",
    url: "https://medlineplus.gov/nutrition.html",
    keywords:
      "nutrition food diet protein meal vegetarian vegan eating nutrients khana poshan आहार पोषण",
    text: "Nutrition is about the nutrients in food and how the body uses them. A varied eating pattern can include vegetables, fruit, whole grains and sources of protein. Individual needs differ with health conditions and life stage. Restrictive diets and supplements are not a substitute for individual advice from a qualified professional.",
    question:
      "What does a usual day of eating look like, and what would you like to understand?",
  },
  {
    id: "b12",
    title: "Vitamin B12",
    url: "https://ods.od.nih.gov/factsheets/VitaminB12-Consumer/",
    keywords: "b12 cobalamin vitamin vegetarian vegan fortified शाकाहारी विटामिन",
    text: "Vitamin B12 helps keep blood and nerve cells healthy. It occurs naturally in animal foods; some plant-based foods are fortified with it. People who eat little or no animal foods may not get enough. A clinician can assess an individual's status and discuss whether fortified foods or a supplement are appropriate; this note cannot establish a deficiency or determine a personal dose.",
    question: "Are you asking about food sources, a test result, or a concern to discuss with a clinician?",
  },
  {
    id: "sleep",
    title: "Sleep and sleep disorders",
    url: "https://medlineplus.gov/sleepdisorders.html",
    keywords: "sleep insomnia tired fatigue snore rest neend नींद थकान",
    text: "Sleep supports memory, energy and health. Both sleep quality and timing matter. Difficulty sleeping and daytime sleepiness can have different causes; they cannot be diagnosed from a chat. Keeping track of sleep times, interruptions and daytime effects can help a clinician understand a persistent problem.",
    question:
      "How long has this been happening, and how is it affecting your day?",
  },
  {
    id: "medicines",
    title: "Understanding medicines",
    url: "https://medlineplus.gov/medicines.html",
    keywords:
      "medicine medicines medication medications drug drugs tablet tablets pill pills supplement supplements interaction interactions prescription side effects effect antibiotic paracetamol ibuprofen metformin dawai dava दवा",
    text: "Medicines have benefits and risks. Prescription medicines, non-prescription products and supplements can interact. A pharmacist or prescriber needs the exact product names and your health context to check them. Follow the prescribed instructions and ask your pharmacist about unclear instructions or side effects. This reference cannot establish whether a specific combination is safe for you.",
    question:
      "Do you want to understand a medicine label, possible side effects, or what to ask a pharmacist?",
  },
  {
    id: "mental",
    title: "Mental health",
    url: "https://medlineplus.gov/mentalhealth.html",
    keywords:
      "mental stress anxious anxiety mood depression depressed overwhelmed wellbeing tension चिंता उदास",
    text: "Mental health includes emotional, psychological and social wellbeing. It affects how people cope, relate to others and make decisions. Persistent changes in mood, sleep or daily functioning are reasons to speak with a qualified professional. Support and treatment options exist; a conversation here cannot diagnose a mental health condition.",
    question:
      "What has been hardest recently, and is there someone you trust you can talk with?",
  },
  {
    id: "prevention",
    title: "Everyday health and prevention",
    url: "https://medlineplus.gov/healthyliving.html",
    keywords:
      "healthy health prevention preventive vaccine screening exercise activity fitness wellness lifestyle routine habit walking",
    text: "Everyday health includes food, movement, sleep, mental wellbeing and preventive care. Small sustainable changes can be easier to maintain. Screening and vaccination recommendations depend on age, health history and local guidance; discuss what applies to you with your clinician.",
    question:
      "Which part of your everyday health would you like to work on first?",
  },
  {
    id: "womens",
    title: "Women’s health",
    url: "https://medlineplus.gov/womenshealth.html",
    keywords:
      "woman women womens menstrual period pregnancy pregnant menopause reproductive fertility pcos periods mahina गर्भावस्था",
    text: "Health needs can change across reproductive life stages. Menstrual health, pregnancy, menopause and preventive care can require different kinds of support. Symptoms and concerns deserve individual assessment; chat cannot confirm pregnancy, diagnose a condition or decide which treatment is appropriate.",
    question: "What is your concern, and when did you first notice it?",
  },
  {
    id: "diabetes",
    title: "Understanding diabetes",
    url: "https://medlineplus.gov/diabetes.html",
    keywords: "diabetes diabetic glucose sugar hba1c insulin madhumeh मधुमेह",
    text: "Diabetes involves blood glucose being too high. There are different types, and diagnosis relies on appropriate clinical testing and interpretation. Food, activity, monitoring and medicines may form part of an individual care plan. Do not change insulin or other medicines based on this chat.",
    question:
      "Are you looking for a general explanation, help reading a report, or questions for your care team?",
  },
  {
    id: "lab",
    title: "Understanding lab results",
    url: "https://medlineplus.gov/lab-tests/how-to-understand-your-lab-results/",
    keywords:
      "lab laboratory laboratories reference interval test result range biomarker blood report रिपोर्ट",
    text: "Reference ranges can differ between laboratories. A result outside a reference range does not by itself establish a diagnosis, and a result within range does not rule out illness. Results need interpretation alongside symptoms, medical history and other information.",
    question: "Which test or term would you like to understand?",
  },
] as const;
export type HealthReference = (typeof HEALTH_LIBRARY)[number];
export function findReferences(question: string): HealthReference[] {
  const words = new Set(
    question.toLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu) ?? [],
  );
  return HEALTH_LIBRARY.map((reference) => ({
    reference,
    score: reference.keywords.split(" ").filter((word) => words.has(word))
      .length,
  }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((item) => item.reference);
}
