import { describe, it, expect } from "vitest";
import { initState } from "../src/state.js";
import { recordGateDecision, markGatePending } from "../src/gates.js";

const fixedNow = () => "2026-06-14T19:00:00.000Z";

describe("recordGateDecision", () => {
  it("approves a confirm gate immutably", () => {
    const s = initState({ name: "T" }, fixedNow);
    const next = recordGateDecision(s, "G1", { status: "approved", by: "yash", channel: "terminal" }, fixedNow);
    expect(s.gates.G1.status).toBe("not_reached"); // original unchanged
    expect(next.gates.G1).toEqual({
      status: "approved", verdict: undefined, decidedBy: "yash",
      channel: "terminal", at: "2026-06-14T19:00:00.000Z", note: undefined,
    });
  });
  it("records a select-gate verdict", () => {
    const s = initState({ name: "T" }, fixedNow);
    const next = recordGateDecision(s, "G2", { status: "approved", verdict: "iterate", by: "yash" }, fixedNow);
    expect(next.gates.G2.verdict).toBe("iterate");
  });
});

describe("markGatePending", () => {
  it("sets pending status", () => {
    const s = initState({ name: "T" }, fixedNow);
    const next = markGatePending(s, "G3", fixedNow);
    expect(next.gates.G3.status).toBe("pending");
    expect(next.gates.G3.at).toBe("2026-06-14T19:00:00.000Z");
  });
});
