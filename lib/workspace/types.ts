import { z } from "zod";
import { localDate, recentDays } from "./daily";

export const ProfileSchema = z.object({
  name: z.string().trim().min(1).max(70),
  language: z.enum(["English", "Hindi / Hinglish"]).default("English"),
  allergies: z.string().max(1000).default(""),
  medicines: z.string().max(2000).default(""),
  conditions: z.string().max(2000).default(""),
});
export type Profile = z.infer<typeof ProfileSchema>;
export const ObservationSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    value: z.number().finite().min(0).max(1e9),
    unit: z.string().trim().min(1).max(40),
    low: z.number().finite().min(0).max(1e9).nullable(),
    high: z.number().finite().min(0).max(1e9).nullable(),
  })
  .refine((o) => o.low === null || o.high === null || o.low <= o.high, {
    message: "Reference minimum must not exceed maximum.",
  });
export type Observation = z.infer<typeof ObservationSchema>;
export const ReportSchema = z.object({
  title: z.string().trim().min(1).max(120),
  date: z.iso.date(),
  lab: z.string().trim().max(100),
  observations: z.array(ObservationSchema).min(1).max(80),
  notes: z.string().max(2000).default(""),
  confirmed: z.literal(true),
  source: z
    .object({
      method: z.enum(["pdf", "text", "manual"]),
      label: z.string().trim().min(1).max(180),
      fingerprint: z
        .string()
        .regex(/^[a-f0-9]{64}$/)
        .optional(),
    })
    .optional(),
  assistantAccess: z.boolean().optional(),
});
export type Report = z.infer<typeof ReportSchema>;
export const REPEATS = ["none", "daily", "weekly", "monthly"] as const;
export const TASK_CATEGORIES = [
  "medicine",
  "test",
  "appointment",
  "other",
] as const;
export const TaskSchema = z.object({
  title: z.string().trim().min(1).max(180),
  date: z.iso.date(),
  done: z.boolean().default(false),
  /** Local time of day for a reminder; absent means an all-day item. */
  time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .optional(),
  repeat: z.enum(REPEATS).optional(),
  /** Day of month for monthly reminders, kept when a short month clamps it. */
  anchorDay: z.number().int().min(1).max(31).optional(),
  category: z.enum(TASK_CATEGORIES).optional(),
});
export type CareTask = z.infer<typeof TaskSchema>;
export const LOG_KINDS = [
  "meal",
  "water",
  "sleep",
  "mood",
  "symptom",
  "medicine",
  "activity",
] as const;
export type LogKind = (typeof LOG_KINDS)[number];
/** One thing a person noted about their day. `amount` means glasses (water),
 * hours (sleep), 1–5 (mood) or minutes (activity); text-only kinds leave it null. */
export const LogEntrySchema = z
  .object({
    kind: z.enum(LOG_KINDS),
    text: z.string().trim().max(300).default(""),
    amount: z.number().finite().min(0).max(1440).nullable().default(null),
    time: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .optional(),
  })
  .refine(
    (e) =>
      e.kind === "water" || e.kind === "sleep" || e.kind === "mood"
        ? e.amount !== null
        : e.text.length > 0,
    { message: "Add a description or amount for this entry." },
  )
  .refine((e) => e.kind !== "sleep" || (e.amount ?? 0) <= 24, {
    message: "Sleep must be 24 hours or less.",
  })
  .refine(
    (e) =>
      e.kind !== "mood" ||
      (Number.isInteger(e.amount) && e.amount! >= 1 && e.amount! <= 5),
    { message: "Mood is a whole number from 1 to 5." },
  )
  .refine((e) => e.kind !== "water" || (e.amount ?? 0) <= 30, {
    message: "Water is recorded in glasses, up to 30.",
  });
export type LogEntry = z.infer<typeof LogEntrySchema>;
/** A single calendar day of entries, stored as one encrypted record. */
export const DayLogSchema = z.object({
  date: z.iso.date(),
  entries: z.array(LogEntrySchema).max(60),
});
export type DayLog = z.infer<typeof DayLogSchema>;
/** One saved chat. Drafts are not stored, so reopening a chat never
 * re-offers an action the person already handled. */
export const ChatMessageSchema = z.object({
  id: z.string().min(1).max(64),
  role: z.enum(["user", "assistant"]),
  text: z.string().max(12000),
  mode: z
    .enum(["record-summary", "ai", "unavailable", "escalation", "reference"])
    .optional(),
  sources: z
    .array(
      z.object({
        title: z.string().max(200),
        url: z.url().max(500),
      }),
    )
    .max(6)
    .optional(),
  steps: z.array(z.string().max(120)).max(8).optional(),
  detail: z.string().max(300).optional(),
  followUp: z.string().max(300).optional(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export const ConversationSchema = z.object({
  title: z.string().trim().min(1).max(80),
  updatedAt: z.iso.datetime(),
  messages: z.array(ChatMessageSchema).max(120),
});
export type Conversation = z.infer<typeof ConversationSchema>;
export type Saved<T> = T & { id: string; createdAt: string; version: number };
export type Workspace = {
  profile: Profile;
  reports: Saved<Report>[];
  tasks: Saved<CareTask>[];
  days?: Saved<DayLog>[];
  conversations?: Saved<Conversation>[];
  /** Opaque per-account key for browser-only preferences. */
  scope?: string;
};

export function rangeStatus(
  o: Observation,
): "below" | "above" | "within" | "unknown" {
  if (o.low !== null && o.value < o.low) return "below";
  if (o.high !== null && o.value > o.high) return "above";
  if (o.low === null || o.high === null) return "unknown";
  return "within";
}
export const statusLabel = {
  below: "Below report range",
  above: "Above report range",
  within: "Within report range",
  unknown: "Range not supplied",
};

export function comparableHistory(
  reports: Saved<Report>[],
  observation: Observation,
) {
  return reports
    .flatMap((r) =>
      r.observations
        .filter(
          (o) =>
            o.name.toLowerCase() === observation.name.toLowerCase() &&
            o.unit.toLowerCase() === observation.unit.toLowerCase(),
        )
        .map((o) => ({ date: r.date, value: o.value, lab: r.lab })),
    )
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function summaryText(
  workspace: Workspace,
  visit?: { notes: string; questions: string[] },
): string {
  return [
    "NUTRITISCAN · VISIT PREPARATION",
    `Prepared ${new Date().toISOString().slice(0, 10)}`,
    "Patient-entered and patient-confirmed information. Not a diagnosis or clinician-verified record.",
    "",
    `Name: ${workspace.profile.name}`,
    `Conditions: ${workspace.profile.conditions || "Not recorded"}`,
    `Medicines: ${workspace.profile.medicines || "Not recorded"}`,
    `Allergies: ${workspace.profile.allergies || "Not recorded (does not mean none)"}`,
    "",
    "REPORTS",
    ...workspace.reports.flatMap((r) => [
      `${r.date} — ${r.title} · ${r.lab || "Lab not recorded"}`,
      ...r.observations.map(
        (o) =>
          `  ${o.name}: ${o.value} ${o.unit} | Report range: ${o.low ?? "?"}–${o.high ?? "?"} | ${statusLabel[rangeStatus(o)]}`,
      ),
      ...(r.notes ? [`  Patient note: ${r.notes}`] : []),
    ]),
    "",
    ...(visit
      ? [
          "MY VISIT NOTES",
          visit.notes.trim() || "No additional notes.",
          "",
          "QUESTIONS I CHOSE",
          ...(visit.questions.length
            ? visit.questions
            : ["No questions selected."]),
        ]
      : [
          "QUESTIONS TO DISCUSS",
          "Which results matter in the context of my symptoms and history?",
          "Do any results need confirmation or follow-up, and when?",
          "What should I watch for before our next visit?",
        ]),
    "",
    ...logSummary(workspace),
    "MY FOLLOW-UP LIST",
    ...workspace.tasks
      .filter((t) => !t.done)
      .map(
        (t) =>
          `${t.date}${t.time ? ` ${t.time}` : ""} — ${t.title}${t.repeat && t.repeat !== "none" ? ` (${t.repeat})` : ""}`,
      ),
  ].join("\n");
}

function logSummary(workspace: Workspace): string[] {
  const week = recentDays(workspace.days, localDate()).filter((d) => d.entries);
  if (!week.length) return [];
  return [
    "MY DAILY LOG · LAST 7 DAYS (self-recorded; nutrition is estimated)",
    ...week.map((d) =>
      [
        d.date,
        d.sleep !== null ? `sleep ${d.sleep} h` : "",
        d.mood !== null ? `mood ${d.mood}/5` : "",
        d.water ? `water ${d.water} glasses` : "",
        d.meals.length ? `≈${d.protein} g protein` : "",
        d.activityMinutes ? `activity ${d.activityMinutes} min` : "",
        d.symptoms.length ? `symptoms: ${d.symptoms.join("; ")}` : "",
        d.medicines.length ? `medicines: ${d.medicines.join("; ")}` : "",
      ]
        .filter(Boolean)
        .join(" · "),
    ),
    "",
  ];
}
