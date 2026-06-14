import { nowIso } from "./util.js";
import type { ForgeState, GateId, Verdict } from "./types.js";

export interface GateDecision {
  status: "approved" | "rejected";
  verdict?: Verdict;
  by?: string;
  channel?: string;
  note?: string;
}

export function recordGateDecision(
  state: ForgeState,
  id: GateId,
  decision: GateDecision,
  now: () => string = nowIso,
): ForgeState {
  const next = structuredClone(state);
  next.gates[id] = {
    status: decision.status,
    verdict: decision.verdict,
    decidedBy: decision.by,
    channel: decision.channel,
    at: now(),
    note: decision.note,
  };
  return next;
}

export function markGatePending(
  state: ForgeState,
  id: GateId,
  now: () => string = nowIso,
): ForgeState {
  const next = structuredClone(state);
  next.gates[id] = { ...next.gates[id], status: "pending", at: now() };
  return next;
}
