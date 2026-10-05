/** Public ClinicalTrials.gov API v2 search. Returned records are registry
 * metadata, not proof that a treatment works. */
const API = "https://clinicaltrials.gov/api/v2/studies";
const TIMEOUT_MS = 8_000;
const MAX_LIMIT = 20;

export type Trial = {
  nctId: string;
  title: string;
  status: string;
  studyType: string;
  startDate: string | null;
  conditions: string[];
  interventions: string[];
  url: string;
};

type ApiStudy = {
  protocolSection?: {
    identificationModule?: { nctId?: string; briefTitle?: string };
    statusModule?: { overallStatus?: string; startDateStruct?: { date?: string } };
    designModule?: { studyType?: string };
    conditionsModule?: { conditions?: string[] };
    armsInterventionsModule?: { interventions?: { name?: string }[] };
  };
};

export async function searchTrials(query: string, options: { limit?: number; signal?: AbortSignal } = {}): Promise<Trial[]> {
  const term = query.trim().slice(0, 300);
  if (!term) return [];
  const pageSize = Math.min(Math.max(Math.floor(options.limit ?? 8), 1), MAX_LIMIT);
  const url = new URL(API);
  url.searchParams.set("query.term", term);
  url.searchParams.set("pageSize", String(pageSize));
  url.searchParams.set("format", "json");
  url.searchParams.set("fields", [
    "NCTId", "BriefTitle", "OverallStatus", "StudyType", "StartDate", "Condition", "InterventionName",
  ].join(","));

  try {
    const timeout = AbortSignal.timeout(TIMEOUT_MS);
    const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
    const response = await fetch(url, { signal, headers: { accept: "application/json" } });
    if (!response.ok) return [];
    const payload = await response.json() as { studies?: unknown };
    if (!Array.isArray(payload.studies)) return [];
    return payload.studies.map(toTrial).filter((trial): trial is Trial => trial !== null).slice(0, pageSize);
  } catch {
    return [];
  }
}

function toTrial(value: unknown): Trial | null {
  if (!value || typeof value !== "object") return null;
  const study = value as ApiStudy;
  const id = study.protocolSection?.identificationModule?.nctId;
  const title = study.protocolSection?.identificationModule?.briefTitle;
  if (typeof id !== "string" || !/^NCT\d{8}$/.test(id) || typeof title !== "string" || !title.trim()) return null;
  const protocol = study.protocolSection;
  return {
    nctId: id,
    title: title.trim(),
    status: protocol?.statusModule?.overallStatus ?? "Status not reported",
    studyType: protocol?.designModule?.studyType ?? "Study type not reported",
    startDate: protocol?.statusModule?.startDateStruct?.date ?? null,
    conditions: strings(protocol?.conditionsModule?.conditions),
    interventions: (protocol?.armsInterventionsModule?.interventions ?? [])
      .map((item) => item.name).filter((name): name is string => typeof name === "string").slice(0, 8),
    url: `https://clinicaltrials.gov/study/${id}`,
  };
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").slice(0, 12) : [];
}
