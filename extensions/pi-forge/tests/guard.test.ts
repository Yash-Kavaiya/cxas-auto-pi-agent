import { describe, it, expect } from "vitest";
import { initState } from "../src/state.js";
import { guardToolCall } from "../src/guard.js";
import type { ForgeState } from "../src/types.js";

function at(phase: ForgeState["phase"]["current"]): ForgeState {
  const s = initState({ name: "T" }, () => "2026-06-14T18:00:00.000Z");
  s.phase.current = phase;
  return s;
}

describe("guardToolCall", () => {
  it("ignores non-advance tools", () => {
    expect(guardToolCall(at("clarify"), { toolName: "forge_status", input: {} })).toBeUndefined();
  });
  it("blocks forge_advance across an unapproved gate with a reason", () => {
    const r = guardToolCall(at("clarify"), { toolName: "forge_advance", input: { toPhase: "build" } });
    expect(r).toEqual({ block: true, reason: expect.stringMatching(/gate G1 not approved/) });
  });
  it("allows forge_advance once the gate is approved", () => {
    const s = at("clarify");
    s.gates.G1 = { status: "approved" };
    expect(guardToolCall(s, { toolName: "forge_advance", input: { toPhase: "build" } })).toBeUndefined();
  });
  it("blocks an illegal target phase", () => {
    const r = guardToolCall(at("intake"), { toolName: "forge_advance", input: { toPhase: "deliver" } });
    expect(r?.block).toBe(true);
    expect(r?.reason).toMatch(/illegal transition/);
  });
});
