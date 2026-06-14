import { describe, it, expect } from "vitest";
import { PHASES, TRANSITIONS, GATE_IDS } from "../src/types.js";

describe("PHASES", () => {
  it("is the ordered lifecycle", () => {
    expect(PHASES).toEqual([
      "intake", "clarify", "build", "test", "evaluate", "improve", "deliver", "done",
    ]);
  });
});

describe("TRANSITIONS", () => {
  it("gates clarify->build with G1 (confirm)", () => {
    const t = TRANSITIONS.find((x) => x.from === "clarify" && x.to === "build");
    expect(t?.gate).toBe("G1");
    expect(t?.kind).toBe("confirm");
  });
  it("gates both evaluate exits with G2 and distinct verdicts", () => {
    const imp = TRANSITIONS.find((x) => x.from === "evaluate" && x.to === "improve");
    const del = TRANSITIONS.find((x) => x.from === "evaluate" && x.to === "deliver");
    expect(imp?.gate).toBe("G2");
    expect(imp?.requiresVerdict).toBe("iterate");
    expect(del?.gate).toBe("G2");
    expect(del?.requiresVerdict).toBe("approve");
  });
  it("gates deliver->done with G3", () => {
    const t = TRANSITIONS.find((x) => x.from === "deliver" && x.to === "done");
    expect(t?.gate).toBe("G3");
  });
  it("has no gate on the improve->build re-loop", () => {
    const t = TRANSITIONS.find((x) => x.from === "improve" && x.to === "build");
    expect(t?.gate).toBeUndefined();
  });
});

describe("GATE_IDS", () => {
  it("lists the three gates", () => {
    expect(GATE_IDS).toEqual(["G1", "G2", "G3"]);
  });
});
