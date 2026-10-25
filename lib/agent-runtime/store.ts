import { useSyncExternalStore } from "react";
import { AgentDefinitionSchema, RESEARCH_AGENT, type AgentDefinition } from "./contracts";

const KEY = "ns-agent-definitions-v1";
const defaults = [RESEARCH_AGENT];
const listeners = new Set<() => void>();
let cachedRaw: string | null = null;
let cached = defaults;

function read(): AgentDefinition[] {
  let raw: string | null;
  try { raw = localStorage.getItem(KEY); } catch { return defaults; }
  if (raw === cachedRaw) return cached;
  cachedRaw = raw;
  try {
    const input: unknown = raw ? JSON.parse(raw) : defaults;
    const parsed = AgentDefinitionSchema.array().min(1).max(12).parse(input);
    if (new Set(parsed.map((agent) => agent.id)).size !== parsed.length) throw new Error("Duplicate agents");
    cached = parsed;
  } catch { cached = defaults; }
  return cached;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => { if (event.key === KEY || event.key === null) listener(); };
  window.addEventListener("storage", onStorage);
  return () => { listeners.delete(listener); window.removeEventListener("storage", onStorage); };
}

export function useAgentDefinitions(): AgentDefinition[] {
  return useSyncExternalStore(subscribe, read, () => defaults);
}

export function saveAgentDefinition(input: AgentDefinition): void {
  const agent = AgentDefinitionSchema.parse(input);
  const existing = read();
  if (!existing.some((item) => item.id === agent.id) && existing.length >= 12) {
    throw new Error("This device has 12 saved agents. Edit an existing agent to reuse it.");
  }
  const next = existing.some((item) => item.id === agent.id)
    ? existing.map((item) => item.id === agent.id ? agent : item)
    : [...existing, agent];
  try { localStorage.setItem(KEY, JSON.stringify(next)); }
  catch { throw new Error("This browser could not save the agent. You can still run it, or enable site storage to save it."); }
  for (const listener of listeners) listener();
}

export function removeAgentDefinition(id: string): void {
  const remaining = read().filter((agent) => agent.id !== id);
  try { localStorage.setItem(KEY, JSON.stringify(remaining.length ? remaining : defaults)); }
  catch { throw new Error("This browser could not remove the saved agent."); }
  for (const listener of listeners) listener();
}
