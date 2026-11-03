import { describe, expect, it } from "vitest";
import { tracesFor } from "./agent-trace";
const direct = { type: "data-trace", data: { agents: ["nutrition"], done: true } };
describe("health agent activity provenance", () => {
  it("hides legacy simulated traces in reference and deterministic safety answers", () => {
    for (const mode of ["demo", "safety"]) expect(tracesFor({ parts: [direct, { type: "data-mode", data: { mode } }] })).toBeNull();
    expect(tracesFor({ parts: [direct] })).toBeNull();
  });
  it("retains acknowledged direct model routes and actual tool execution", () => {
    expect(tracesFor({ parts: [direct, { type: "data-mode", data: { mode: "model" } }] })).toEqual({ agents: ["nutrition"], done: true, source: "direct" });
    expect(tracesFor({ parts: [{ type: "tool-askLabAgent", state: "input-available" }] })).toEqual({ agents: ["lab"], done: false, source: "tools" });
    expect(tracesFor({ parts: [{ type: "tool-askLabAgent", state: "output-available" }] })).toEqual({ agents: ["lab"], done: true, source: "tools" });
  });
  it("does not promote failed, merely planned or unknown tools into consultations", () => {
    for (const state of ["output-error", "input-streaming"]) expect(tracesFor({ parts: [{ type: "tool-askDoctorAgent", state }] })).toBeNull();
    expect(tracesFor({ parts: [{ type: "tool-askUnknownAgent", state: "output-available" }] })).toBeNull();
    expect(tracesFor({ parts: [null, { type: "data-mode", data: { mode: "model" } }, { type: "data-trace", data: { agents: ["made-up-agent"] } }] })).toBeNull();
    expect(tracesFor({ parts: [{ type: 12 }, { type: "data-mode", data: { mode: "model" } }, { type: "data-trace", data: { agents: "nutrition" } }] })).toBeNull();
  });
});
