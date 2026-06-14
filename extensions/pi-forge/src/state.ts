import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { nowIso, slugify } from "./util.js";
import type { ForgeState, GateId, GateRecord, ProjectType } from "./types.js";

export function forgeDir(root: string): string {
  return join(root, ".pi-forge");
}

export function statePath(root: string): string {
  return join(forgeDir(root), "state.json");
}

export interface InitOptions {
  name: string;
  type?: ProjectType;
  maxIterations?: number;
  repoRoot?: string;
}

export function initState(opts: InitOptions, now: () => string = nowIso): ForgeState {
  const ts = now();
  const slug = slugify(opts.name);
  const gates: Record<GateId, GateRecord> = {
    G1: { status: "not_reached" },
    G2: { status: "not_reached" },
    G3: { status: "not_reached" },
  };
  return {
    schemaVersion: 1,
    project: {
      id: `prj_${slug}_${ts.slice(0, 10).replace(/-/g, "")}`,
      name: opts.name,
      slug,
      type: opts.type ?? "general",
      created: ts,
      repoRoot: opts.repoRoot ?? ".",
    },
    phase: { current: "intake", status: "in_progress", enteredAt: ts },
    gates,
    improve: { iteration: 0, maxIterations: opts.maxIterations ?? 3 },
    routing: { overrides: {} },
    artifacts: {},
    history: [],
  };
}

export function saveState(root: string, state: ForgeState): void {
  mkdirSync(forgeDir(root), { recursive: true });
  writeFileSync(statePath(root), JSON.stringify(state, null, 2));
}

export function loadState(root: string): ForgeState {
  const path = statePath(root);
  if (!existsSync(path)) {
    throw new Error(`No pi-forge state found at ${path}. Run /forge-new first.`);
  }
  return JSON.parse(readFileSync(path, "utf8")) as ForgeState;
}
