import { PLUGINS, type RunRequest } from "./contracts";

export function planResearch(request: RunRequest) {
  const allowed = request.agent.plugins.filter((id) => id !== "artifact");
  const primary = /\b(trials?|registered|recruiting|nct\d*|registry)\b/i.test(request.task) ? "trials"
    : /\b(papers?|literature|reviews?|evidence|publications?)\b/i.test(request.task) ? "pubmed" : "library";
  const readers = [...allowed].sort((a, b) => Number(b === primary) - Number(a === primary));
  return {
    readers,
    stages: [
      ...readers.map((id) => `Read ${PLUGINS.find((plugin) => plugin.id === id)!.name}`),
      "Retry one empty or unavailable public source if time permits",
      "Prepare a source-linked research brief", "Validate references and prepare the approval preview", "Wait for your approval to download",
    ],
  };
}
