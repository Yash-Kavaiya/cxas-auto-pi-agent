import type { ExtensionAPI, ToolCallEvent, ToolCallEventResult } from "@earendil-works/pi-coding-agent";
import { initState, saveState, loadState, statePath } from "./src/state.js";
import { recordGateDecision } from "./src/gates.js";
import { clearInbox } from "./src/inbox.js";
import { guardToolCall } from "./src/guard.js";
import { buildForgeTools } from "./src/tools.js";
import { buildCxasTool, runCxasBinary } from "./src/cxas.js";
import { terminalChannel } from "./src/notifier.js";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { GATE_IDS } from "./src/types.js";
import type { GateId, Verdict } from "./src/types.js";

export default function (pi: ExtensionAPI) {
  // 1. Gate enforcement: block forge_advance unless its gate is approved.
  pi.on("tool_call", async (event: ToolCallEvent, ctx): Promise<ToolCallEventResult | void> => {
    if (event.toolName !== "forge_advance") return;
    if (!existsSync(statePath(ctx.cwd))) return;
    const state = loadState(ctx.cwd);
    const result = guardToolCall(state, { toolName: event.toolName, input: event.input as { toPhase?: any } & Record<string, unknown> });
    if (result) {
      return { block: result.block, reason: result.reason };
    }
  });

  // 2. Register the forge_* tools.
  const deps = {
    git: (msg: string) => {
      // Synchronous + ordered so the commit always captures what advance/checkpoint
      // just wrote on disk (the "every advance = a commit" audit trail). Best-effort:
      // a git failure (e.g. not a repo, nothing to commit) must not abort a phase.
      try {
        execFileSync("git", ["add", "-A"], { stdio: "ignore" });
        execFileSync("git", ["commit", "-m", msg], { stdio: "ignore" });
      } catch (err) {
        process.stderr.write(`[pi-forge] git commit skipped: ${(err as Error).message}\n`);
      }
    },
    channels: [terminalChannel()],
  };
  for (const tool of buildForgeTools(deps)) {
    // ForgeToolDef is a structural subset of ToolDefinition; label is the only missing
    // required field. We supply a default label equal to the tool name so registerTool
    // gets a fully-shaped value while keeping all runtime behaviour identical.
    pi.registerTool({ label: tool.name, ...tool } as Parameters<typeof pi.registerTool>[0]);
  }

  // CXAS bridge: register forge_cxas backed by the real (bounded) binary runner.
  const cxasTool = buildCxasTool({ run: runCxasBinary });
  pi.registerTool({ label: cxasTool.name, ...cxasTool } as Parameters<typeof pi.registerTool>[0]);

  // 3. Operator commands.
  pi.registerCommand("forge-new", {
    description: "Start a new pi-forge project: /forge-new <project name>",
    handler: async (args, ctx) => {
      const name = args.trim() || "Untitled Project";
      const state = initState({ name, repoRoot: ctx.cwd });
      saveState(ctx.cwd, state);
      ctx.ui.notify(`pi-forge initialised: ${name} (phase: intake)`, "info");
    },
  });

  pi.registerCommand("forge-status", {
    description: "Show pi-forge phase + gate status",
    handler: async (_args, ctx) => {
      if (!existsSync(statePath(ctx.cwd))) {
        ctx.ui.notify("No pi-forge project here. Run /forge-new first.", "warning");
        return;
      }
      const s = loadState(ctx.cwd);
      const gates = Object.entries(s.gates)
        .map(([k, v]) => `${k}:${v.status}${v.verdict ? `(${v.verdict})` : ""}`)
        .join("  ");
      ctx.ui.notify(`phase=${s.phase.current} iter=${s.improve.iteration}/${s.improve.maxIterations}  ${gates}`, "info");
    },
  });

  pi.registerCommand("forge-approve", {
    description: "Resolve a gate: /forge-approve <G1|G2|G3> <approve|reject|iterate> [note]",
    handler: async (args, ctx) => {
      const [gate, decision, ...rest] = args.trim().split(/\s+/);
      const note = rest.join(" ") || undefined;
      if (!gate || !decision) {
        ctx.ui.notify("Usage: /forge-approve <G1|G2|G3> <approve|reject|iterate> [note]", "warning");
        return;
      }
      if (!GATE_IDS.includes(gate as GateId)) {
        ctx.ui.notify(`Unknown gate '${gate}'. Use one of: ${GATE_IDS.join(", ")}.`, "warning");
        return;
      }
      const id = gate as GateId;
      const state = loadState(ctx.cwd);
      const status = decision === "reject" ? "rejected" : "approved";
      const verdict: Verdict | undefined =
        decision === "iterate" ? "iterate" : decision === "approve" ? "approve" : undefined;
      const next = recordGateDecision(state, id, { status, verdict, by: "operator", channel: "terminal", note });
      saveState(ctx.cwd, next);
      clearInbox(ctx.cwd, id);
      ctx.ui.notify(`Gate ${id} -> ${status}${verdict ? ` (${verdict})` : ""}`, "info");
    },
  });

  pi.registerCommand("forge-resume", {
    description: "Print where the project left off",
    handler: async (_args, ctx) => {
      if (!existsSync(statePath(ctx.cwd))) {
        ctx.ui.notify("No pi-forge project here.", "warning");
        return;
      }
      const s = loadState(ctx.cwd);
      const last = s.history.at(-1);
      ctx.ui.notify(
        `Resuming '${s.project.name}' at phase=${s.phase.current}. Last transition: ${last ? `${last.from}->${last.to}` : "none"}.`,
        "info",
      );
    },
  });
}
