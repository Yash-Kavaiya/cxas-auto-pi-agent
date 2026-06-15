import { Type } from "typebox";
import { loadState, saveState, setArtifact } from "./state.js";
import { canAdvance, advance } from "./machine.js";
import { recordGateDecision, markGatePending } from "./gates.js";
import { writeCheckpoint } from "./checkpoint.js";
import { writeInbox, clearInbox } from "./inbox.js";
import { appendDecision, writeMetric } from "./artifacts.js";
import { loadConfig, routeFor } from "./config.js";
import { formatGateMessage, terminalChannel, fanOut, type NotifyChannel } from "./notifier.js";
import { nowIso } from "./util.js";
import type { GateId, Phase, Verdict } from "./types.js";

export interface ForgeToolDeps {
  now?: () => string;
  git: (commitMessage: string) => void;
  channels?: NotifyChannel[];
}

// Minimal shape of the pi execute ctx we rely on (a subset of ExtensionContext).
export interface ForgeCtx {
  cwd: string;
  mode: "tui" | "rpc" | "json" | "print";
  hasUI: boolean;
  ui: {
    confirm(title: string, message: string): Promise<boolean>;
    select(title: string, items: string[]): Promise<string | null | undefined>;
    notify(message: string, type: string): void;
  };
}

export interface ForgeToolResult {
  content: { type: "text"; text: string }[];
  details?: Record<string, unknown>;
  isError?: boolean;
}

export interface ForgeToolDef {
  name: string;
  description: string;
  parameters: unknown;
  execute(
    toolCallId: string,
    params: any,
    signal: unknown,
    onUpdate: unknown,
    ctx: ForgeCtx,
  ): Promise<ForgeToolResult>;
}

function text(s: string, isError = false): ForgeToolResult {
  return { content: [{ type: "text", text: s }], ...(isError ? { isError: true } : {}) };
}

export function buildForgeTools(deps: ForgeToolDeps): ForgeToolDef[] {
  const now = deps.now ?? nowIso;
  const channels = (): NotifyChannel[] => deps.channels ?? [terminalChannel()];

  return [
    {
      name: "forge_status",
      description: "Return the current pi-forge project state (phase, gates, iteration, history).",
      parameters: Type.Object({}),
      async execute(_id, _params, _s, _u, ctx) {
        const state = loadState(ctx.cwd);
        return text(JSON.stringify({ phase: state.phase, gates: state.gates, improve: state.improve }, null, 2));
      },
    },
    {
      name: "forge_advance",
      description:
        "Advance the project to the next phase. Blocked automatically unless the guarding gate is approved. " +
        "Valid phases: intake, clarify, build, test, evaluate, improve, deliver, done.",
      parameters: Type.Object({
        toPhase: Type.String({ description: "Target phase to advance into." }),
      }),
      async execute(_id, params, _s, _u, ctx) {
        const state = loadState(ctx.cwd);
        const toPhase = params.toPhase as Phase;
        const check = canAdvance(state, toPhase);
        if (!check.ok) return text(`Cannot advance: ${check.reason}`, true);
        const next = advance(state, toPhase, now);
        saveState(ctx.cwd, next);
        writeCheckpoint(ctx.cwd, next, `advance-${toPhase}`, now);
        deps.git(`forge: advance ${state.phase.current} -> ${toPhase}`);
        return { content: [{ type: "text", text: `Advanced to ${toPhase}.` }], details: { phase: toPhase } };
      },
    },
    {
      name: "forge_gate",
      description:
        "Open a human-in-the-loop gate. kind 'confirm' (G1/G3) yields approve/reject; " +
        "kind 'select' (G2) yields verdict approve|iterate. In headless mode the gate is queued to the inbox.",
      parameters: Type.Object({
        id: Type.String({ description: "Gate id: G1, G2, or G3." }),
        summary: Type.String({ description: "What the human is approving." }),
        kind: Type.String({ description: "'confirm' or 'select'." }),
      }),
      async execute(_id, params, _s, _u, ctx) {
        const state = loadState(ctx.cwd);
        const id = params.id as GateId;
        const summary = params.summary as string;
        const kind = params.kind as "confirm" | "select";
        const message = formatGateMessage(state, id, summary);
        await fanOut(channels(), message);

        if (ctx.mode === "tui" && ctx.hasUI) {
          if (kind === "select") {
            const choice = await ctx.ui.select(`Gate ${id}`, ["approve", "iterate"]);
            // A dismissed/cancelled dialog must NOT count as approval — leave the gate pending.
            if (choice !== "approve" && choice !== "iterate") {
              const pending = markGatePending(state, id, now);
              saveState(ctx.cwd, pending);
              writeInbox(ctx.cwd, id, summary, now);
              return text(`Gate ${id} not decided (dialog dismissed); still pending. Resolve with: /forge-approve ${id} approve|iterate`);
            }
            const verdict: Verdict = choice;
            const next = recordGateDecision(state, id, { status: "approved", verdict, channel: "terminal" }, now);
            saveState(ctx.cwd, next);
            clearInbox(ctx.cwd, id);
            return text(`Gate ${id} approved with verdict: ${verdict}.`);
          }
          const ok = await ctx.ui.confirm(`Gate ${id}`, summary);
          const next = recordGateDecision(
            state, id, { status: ok ? "approved" : "rejected", channel: "terminal" }, now,
          );
          saveState(ctx.cwd, next);
          clearInbox(ctx.cwd, id);
          return text(`Gate ${id} ${ok ? "approved" : "rejected"}.`);
        }

        // Headless: queue and pause.
        const pending = markGatePending(state, id, now);
        saveState(ctx.cwd, pending);
        writeInbox(ctx.cwd, id, summary, now);
        return text(`Gate ${id} is pending approval. Resolve with: /forge-approve ${id} approve`);
      },
    },
    {
      name: "forge_checkpoint",
      description: "Write a labelled snapshot of the current state and commit it.",
      parameters: Type.Object({ label: Type.String({ description: "Checkpoint label." }) }),
      async execute(_id, params, _s, _u, ctx) {
        const state = loadState(ctx.cwd);
        const file = writeCheckpoint(ctx.cwd, state, params.label as string, now);
        deps.git(`forge: checkpoint ${params.label}`);
        return text(`Checkpoint written: ${file}`);
      },
    },
    {
      name: "forge_note",
      description: "Append an ADR-style decision to decisions.md.",
      parameters: Type.Object({ text: Type.String({ description: "Decision to record." }) }),
      async execute(_id, params, _s, _u, ctx) {
        appendDecision(ctx.cwd, params.text as string, now);
        return text("Decision recorded.");
      },
    },
    {
      name: "forge_metric",
      description: "Merge a metric key/value into metrics.json.",
      parameters: Type.Object({
        key: Type.String({ description: "Metric key, e.g. 'test' or 'eval'." }),
        value: Type.Any({ description: "Metric value (object or scalar)." }),
      }),
      async execute(_id, params, _s, _u, ctx) {
        writeMetric(ctx.cwd, params.key as string, params.value);
        return text(`Metric '${params.key}' written.`);
      },
    },
    {
      name: "forge_route",
      description: "Return the model id to use for a given phase per the routing policy.",
      parameters: Type.Object({ phase: Type.String({ description: "Phase to route." }) }),
      async execute(_id, params, _s, _u, ctx) {
        const state = loadState(ctx.cwd);
        const config = loadConfig(ctx.cwd);
        const model = routeFor(config, params.phase as string, state.routing.overrides);
        return text(model);
      },
    },
    {
      name: "forge_artifact",
      description: "Register an artifact pointer (key -> path) in state.artifacts.",
      parameters: Type.Object({
        key: Type.String({ description: "Artifact key, e.g. 'brief' or 'plan'." }),
        path: Type.String({ description: "Repo-relative path, e.g. 'artifacts/brief.md'." }),
      }),
      async execute(_id, params, _s, _u, ctx) {
        const state = loadState(ctx.cwd);
        const next = setArtifact(state, params.key as string, params.path as string);
        saveState(ctx.cwd, next);
        return text(`Artifact '${params.key}' registered -> ${params.path}`);
      },
    },
  ];
}
