import { nowIso } from "./util.js";
import { TRANSITIONS } from "./types.js";
import type { ForgeState, Phase, TransitionDef } from "./types.js";

export function findTransition(from: Phase, to: Phase): TransitionDef | undefined {
  return TRANSITIONS.find((t) => t.from === from && t.to === to);
}

export interface AdvanceCheck {
  ok: boolean;
  reason: string;
}

export function canAdvance(state: ForgeState, to: Phase): AdvanceCheck {
  const from = state.phase.current;
  const t = findTransition(from, to);
  if (!t) return { ok: false, reason: `illegal transition ${from} -> ${to}` };

  if (t.gate) {
    const g = state.gates[t.gate];
    if (g.status !== "approved") {
      return { ok: false, reason: `gate ${t.gate} not approved (status: ${g.status})` };
    }
    if (t.requiresVerdict && g.verdict !== t.requiresVerdict) {
      return {
        ok: false,
        reason: `gate ${t.gate} verdict is ${g.verdict ?? "none"}, requires ${t.requiresVerdict}`,
      };
    }
  }

  if (from === "evaluate" && to === "improve" && state.improve.iteration >= state.improve.maxIterations) {
    return { ok: false, reason: `max iterations (${state.improve.maxIterations}) reached` };
  }

  return { ok: true, reason: "" };
}

export function advance(state: ForgeState, to: Phase, now: () => string = nowIso): ForgeState {
  const from = state.phase.current;
  const t = findTransition(from, to);
  const ts = now();
  const next: ForgeState = structuredClone(state);
  next.phase = { current: to, status: to === "done" ? "done" : "in_progress", enteredAt: ts };
  next.history.push({
    from,
    to,
    at: ts,
    gate: t?.gate,
    verdict: t?.gate ? state.gates[t.gate].verdict : undefined,
  });
  if (from === "evaluate" && to === "improve") {
    next.improve.iteration += 1;
  }
  return next;
}
