import type { ForgeState, GateId } from "./types.js";

export interface NotifyChannel {
  name: string;
  send(message: string): Promise<void> | void;
}

export function formatGateMessage(state: ForgeState, id: GateId, summary: string): string {
  return [
    `🚦 GATE ${id} — ${state.project.name}`,
    `Phase: ${state.phase.current}`,
    summary,
  ].join("\n");
}

export function terminalChannel(
  write: (s: string) => void = (s) => process.stdout.write(s + "\n"),
): NotifyChannel {
  return { name: "terminal", send: (m) => write(m) };
}

/** Sends a message through all channels. A failing channel is swallowed so one
 *  broken transport never blocks a gate notification. */
export async function fanOut(channels: NotifyChannel[], message: string): Promise<void> {
  for (const ch of channels) {
    try {
      await ch.send(message);
    } catch {
      // intentionally ignored — notification must be best-effort
    }
  }
}
