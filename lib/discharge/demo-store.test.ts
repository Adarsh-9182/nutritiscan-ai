import { describe, expect, it } from "vitest";
import { DEMO_ACTORS, recordDemoEvent, restoreDemo } from "./demo-store";
import { extractPendingTests, SYNTHETIC_DISCHARGE_NOTE } from "./extract";
import { workflowStatus } from "./workflow";

const at = "2026-09-29T10:00:00.000Z";
const candidate = extractPendingTests(SYNTHETIC_DISCHARGE_NOTE)[0];

describe("synthetic case event storage", () => {
  it("replays a reviewed source and assignment after a browser refresh", () => {
    const source = recordDemoEvent([], {
      type: "confirm-source", source: candidate, testName: candidate.testName,
    }, DEMO_ACTORS["Anika, discharge coordinator"].id, at);
    const assigned = recordDemoEvent(source.events, {
      type: "assign", owner: DEMO_ACTORS["Dr Meera Shah"].id, deadline: "2026-10-01",
    }, DEMO_ACTORS["Anika, discharge coordinator"].id, at);

    const restored = restoreDemo(assigned.serialized);
    expect(restored.error).toBeNull();
    expect(workflowStatus(restored.state)).toBe("awaiting-result");
    expect(restored.state.history).toHaveLength(2);
    expect(restored.state.history[1].actor.role).toBe("coordinator");
  });

  it("resets malformed or reordered local events instead of trusting a saved closed state", () => {
    expect(restoreDemo('{bad').state.history).toEqual([]);
    const outOfOrder = JSON.stringify({ version: 1, events: [{
      event: { type: "record-delivery" }, actorId: DEMO_ACTORS["Fictional delivery feed"].id, at,
    }] });
    const restored = restoreDemo(outOfOrder);
    expect(workflowStatus(restored.state)).toBe("needs-source-review");
    expect(restored.error).toMatch(/could not be restored/);
  });
});
