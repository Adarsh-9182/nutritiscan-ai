// Display metadata for agents — shared by the landing page and dashboard.
export type AgentMeta = {
  id: "nutrition" | "fitness" | "doctor" | "lab" | "coach";
  name: string;
  glyph: string; // emoji glyph as a lightweight, dependency-free icon
  color: string; // css color var value
  tagline: string;
  knows: string[];
};

export const AGENTS: AgentMeta[] = [
  {
    id: "nutrition",
    name: "Nutrition Agent",
    glyph: "🥗",
    color: "#34d399",
    tagline: "Fuels your goals",
    knows: ["Protein & calories", "Vitamins", "Deficiencies", "Meal timing"],
  },
  {
    id: "fitness",
    name: "Fitness Agent",
    glyph: "🏋️",
    color: "#22d3ee",
    tagline: "Builds your body",
    knows: ["Workouts", "BMI & body-fat", "Progression", "Recovery"],
  },
  {
    id: "doctor",
    name: "Doctor Agent",
    glyph: "🩺",
    color: "#60a5fa",
    tagline: "Reasons with care",
    knows: ["Symptom triage", "Risk flags", "General conditions", "Follow-ups"],
  },
  {
    id: "lab",
    name: "Lab Agent",
    glyph: "🧪",
    color: "#a78bfa",
    tagline: "Reads your reports",
    knows: ["CBC & thyroid", "Vitamin panels", "Trends", "Plain-language reads"],
  },
  {
    id: "coach",
    name: "Health Coach",
    glyph: "🧭",
    color: "#fbbf24",
    tagline: "Keeps you on track",
    knows: ["Sleep", "Habits", "Goals", "Reminders"],
  },
];

export const agentColor = (id: string) => AGENTS.find((a) => a.id === id)?.color ?? "#34d399";
export const agentName = (id: string) => AGENTS.find((a) => a.id === id)?.name ?? "Supervisor";
export const agentGlyph = (id: string) => AGENTS.find((a) => a.id === id)?.glyph ?? "✦";
