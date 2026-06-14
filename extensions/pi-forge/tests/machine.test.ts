import { describe, it, expect } from "vitest";
import { initState } from "../src/state.js";
import { findTransition, canAdvance, advance } from "../src/machine.js";
import type { ForgeState, GateId, Verdict } from "../src/types.js";

const fixedNow = () => "2026-06-14T18:00:00.000Z";

function at(phase: ForgeState["phase"]["current"]): ForgeState {
  const s = initState({ name: "T" }, fixedNow);
  s.phase.current = phase;
  return s;
}
function withGate(s: ForgeState, id: GateId, verdict?: Verdict): ForgeState {
  s.gates[id] = { status: "approved", verdict };
  return s;
}

describe("findTransition", () => {
  it("finds a legal edge and returns undefined for illegal ones", () => {
    expect(findTransition("intake", "clarify")?.to).toBe("clarify");
    expect(findTransition("intake", "deliver")).toBeUndefined();
  });
});

describe("canAdvance", () => {
  it("allows ungated transitions", () => {
    expect(canAdvance(at("intake"), "clarify").ok).toBe(true);
    expect(canAdvance(at("build"), "test").ok).toBe(true);
  });
  it("rejects illegal transitions", () => {
    const r = canAdvance(at("intake"), "build");
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/illegal transition/);
  });
  it("blocks clarify->build until G1 is approved", () => {
    expect(canAdvance(at("clarify"), "build").ok).toBe(false);
    expect(canAdvance(withGate(at("clarify"), "G1"), "build").ok).toBe(true);
  });
  it("routes evaluate by G2 verdict", () => {
    expect(canAdvance(withGate(at("evaluate"), "G2", "approve"), "deliver").ok).toBe(true);
    expect(canAdvance(withGate(at("evaluate"), "G2", "approve"), "improve").ok).toBe(false);
    expect(canAdvance(withGate(at("evaluate"), "G2", "iterate"), "improve").ok).toBe(true);
    expect(canAdvance(withGate(at("evaluate"), "G2", "iterate"), "deliver").ok).toBe(false);
  });
  it("blocks evaluate->improve when maxIterations reached", () => {
    const s = withGate(at("evaluate"), "G2", "iterate");
    s.improve = { iteration: 3, maxIterations: 3 };
    const r = canAdvance(s, "improve");
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/max iterations/);
  });
  it("blocks deliver->done until G3 approved", () => {
    expect(canAdvance(at("deliver"), "done").ok).toBe(false);
    expect(canAdvance(withGate(at("deliver"), "G3"), "done").ok).toBe(true);
  });
});

describe("advance", () => {
  it("moves phase, appends history, and is immutable", () => {
    const s = at("intake");
    const next = advance(s, "clarify", fixedNow);
    expect(s.phase.current).toBe("intake"); // original unchanged
    expect(next.phase.current).toBe("clarify");
    expect(next.history.at(-1)).toEqual({
      from: "intake", to: "clarify", at: "2026-06-14T18:00:00.000Z", gate: undefined, verdict: undefined,
    });
  });
  it("records the gate + verdict on gated transitions", () => {
    const s = withGate(at("evaluate"), "G2", "iterate");
    const next = advance(s, "improve", fixedNow);
    expect(next.history.at(-1)?.gate).toBe("G2");
    expect(next.history.at(-1)?.verdict).toBe("iterate");
  });
  it("increments iteration on evaluate->improve only", () => {
    const s = withGate(at("evaluate"), "G2", "iterate");
    expect(advance(s, "improve", fixedNow).improve.iteration).toBe(1);
    const b = at("improve");
    expect(advance(b, "build", fixedNow).improve.iteration).toBe(0);
  });
  it("sets status done when reaching done", () => {
    const s = withGate(at("deliver"), "G3");
    expect(advance(s, "done", fixedNow).phase.status).toBe("done");
  });
});
