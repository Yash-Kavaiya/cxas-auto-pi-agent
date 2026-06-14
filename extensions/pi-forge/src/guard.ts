import { canAdvance } from "./machine.js";
import type { ForgeState, Phase } from "./types.js";

export interface ToolCallLike {
  toolName: string;
  input: { toPhase?: Phase } & Record<string, unknown>;
}

export interface BlockResult {
  block: true;
  reason: string;
}

/**
 * The single gate-enforcement point. Returns a block result for an illegal or
 * un-gated forge_advance; returns undefined to allow the call through.
 */
export function guardToolCall(state: ForgeState, event: ToolCallLike): BlockResult | undefined {
  if (event.toolName !== "forge_advance") return undefined;
  const toPhase = event.input?.toPhase;
  if (!toPhase) return { block: true, reason: "forge_advance requires a toPhase argument" };
  const check = canAdvance(state, toPhase);
  if (!check.ok) return { block: true, reason: check.reason };
  return undefined;
}
