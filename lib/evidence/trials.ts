/** Public ClinicalTrials.gov API v2 search. Returned records are registry
 * metadata, not proof that a treatment works. */
import { EvidenceReadError } from "./errors";

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
  enrollment?: string;
  eligibility?: string;
  endpoints?: string;
  arms?: string;
};

type ApiStudy = {
  protocolSection?: {
    identificationModule?: { nctId?: string; briefTitle?: string };
    statusModule?: { overallStatus?: string; startDateStruct?: { date?: string } };
    designModule?: { studyType?: string; enrollmentInfo?: { count?: number; type?: string } };
    eligibilityModule?: { eligibilityCriteria?: string; sex?: string; minimumAge?: string; maximumAge?: string };
    outcomesModule?: { primaryOutcomes?: { measure?: string; description?: string; timeFrame?: string }[] };
    conditionsModule?: { conditions?: string[] };
    armsInterventionsModule?: { interventions?: { name?: string }[]; armGroups?: { label?: string; type?: string; description?: string }[] };
  };
};

export async function searchTrials(query: string, options: { limit?: number; signal?: AbortSignal; strict?: boolean } = {}): Promise<Trial[]> {
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

  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  try {
    const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
    const response = await fetch(url, { signal, headers: { accept: "application/json" } });
    if (!response.ok) {
      if (options.strict) throw new EvidenceReadError(response.status === 429 ? "quota" : "unavailable");
      return [];
    }
    const payload = await response.json() as { studies?: unknown };
    if (!Array.isArray(payload.studies)) {
      if (options.strict) throw new EvidenceReadError("invalid-response");
      return [];
    }
    return payload.studies.map(toTrial).filter((trial): trial is Trial => trial !== null).slice(0, pageSize);
  } catch (error) {
    if (options.strict) {
      options.signal?.throwIfAborted();
      throw error instanceof EvidenceReadError ? error : new EvidenceReadError(timeout.aborted ? "timeout" : "unavailable");
    }
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
    ...(typeof protocol?.designModule?.enrollmentInfo?.count === "number" ? { enrollment: `${protocol.designModule.enrollmentInfo.count} (${protocol.designModule.enrollmentInfo.type ?? "type not reported"})` } : {}),
    ...(protocol?.eligibilityModule ? { eligibility: [protocol.eligibilityModule.sex, protocol.eligibilityModule.minimumAge, protocol.eligibilityModule.maximumAge, protocol.eligibilityModule.eligibilityCriteria].filter((s) => typeof s === "string").join("; ").slice(0, 3500) } : {}),
    ...(protocol?.outcomesModule?.primaryOutcomes ? { endpoints: protocol.outcomesModule.primaryOutcomes.slice(0, 5).map((p) => [p.measure, p.description, p.timeFrame].filter((s) => typeof s === "string").join("; ")).join("\n").slice(0, 3500) } : {}),
    ...(protocol?.armsInterventionsModule?.armGroups ? { arms: protocol.armsInterventionsModule.armGroups.slice(0, 5).map((a) => [a.label, a.type, a.description].filter((s) => typeof s === "string").join("; ")).join("\n").slice(0, 2500) } : {}),
  };
}

/** Resolve only a canonical registry identifier, never a browser-supplied URL. */
export async function fetchTrial(id: string, signal: AbortSignal): Promise<Trial | null> {
  if (!/^NCT\d{8}$/.test(id)) throw new EvidenceReadError("invalid-response");
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  try {
    const response = await fetch(`${API}/${id}?format=json`, { signal: AbortSignal.any([signal, timeout]), headers: { accept: "application/json" } });
    if (response.status === 404) return null;
    if (!response.ok) throw new EvidenceReadError(response.status === 429 ? "quota" : "unavailable");
    const trial = toTrial(await response.json());
    if (!trial || trial.nctId !== id) throw new EvidenceReadError("invalid-response");
    return trial;
  } catch (error) {
    signal.throwIfAborted();
    throw error instanceof EvidenceReadError ? error : new EvidenceReadError(timeout.aborted ? "timeout" : "unavailable");
  }
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").slice(0, 12) : [];
}
