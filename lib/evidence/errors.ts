/** Public, bounded failure reasons; never includes an upstream URL or body. */
export class EvidenceReadError extends Error {
  constructor(public readonly code: "timeout" | "quota" | "unavailable" | "invalid-response") {
    super(`Evidence service: ${code}`);
    this.name = "EvidenceReadError";
  }
}
