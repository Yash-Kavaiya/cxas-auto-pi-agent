import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initState, saveState, loadState } from "../src/state.js";
import { buildForgeTools, type ForgeToolDeps, type ForgeCtx, type ForgeToolResult } from "../src/tools.js";
import { guardToolCall } from "../src/guard.js";
import type { Phase, Verdict } from "../src/types.js";

const fixedNow = () => "2026-06-14T18:00:00.000Z";

let root: string;
let deps: ForgeToolDeps;

function makeCtx(opts: { confirm?: boolean; verdict?: Verdict } = {}): ForgeCtx {
  return {
    cwd: root,
    mode: "tui",
    hasUI: true,
    ui: {
      async confirm() { return opts.confirm ?? true; },
      async select() { return opts.verdict ?? "approve"; },
      notify() {},
    },
  };
}
function getTool(name: string) {
  const t = buildForgeTools(deps).find((x) => x.name === name);
  if (!t) throw new Error(`no tool ${name}`);
  return t;
}
// Simulates pi's runtime: enforce the gate guard, then run execute if allowed.
async function callAdvance(
  toPhase: Phase,
  ctx: ForgeCtx,
): Promise<{ blocked?: string; result?: ForgeToolResult }> {
  const state = loadState(root);
  const blocked = guardToolCall(state, { toolName: "forge_advance", input: { toPhase } });
  if (blocked) return { blocked: blocked.reason };
  return { result: await getTool("forge_advance").execute("id", { toPhase }, undefined, undefined, ctx) };
}
async function openGate(id: "G1" | "G2" | "G3", kind: "confirm" | "select", ctx: ForgeCtx) {
  return getTool("forge_gate").execute("id", { id, summary: `gate ${id}`, kind }, undefined, undefined, ctx);
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "forge-e2e-"));
  deps = { now: fixedNow, git: () => {}, channels: [] };
  saveState(root, initState({ name: "Toy Project", maxIterations: 2 }, fixedNow));
});
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

describe("full lifecycle — approve path", () => {
  it("walks intake -> done, blocking every gate until approved", async () => {
    const ctx = makeCtx({ confirm: true, verdict: "approve" });

    // intake -> clarify (ungated)
    expect((await callAdvance("clarify", ctx)).blocked).toBeUndefined();
    expect(loadState(root).phase.current).toBe("clarify");

    // clarify -> build BLOCKED until G1
    expect((await callAdvance("build", ctx)).blocked).toMatch(/gate G1 not approved/);
    await openGate("G1", "confirm", ctx);
    expect((await callAdvance("build", ctx)).blocked).toBeUndefined();
    expect(loadState(root).phase.current).toBe("build");

    // build -> test -> evaluate (ungated)
    await callAdvance("test", ctx);
    await callAdvance("evaluate", ctx);
    expect(loadState(root).phase.current).toBe("evaluate");

    // evaluate -> deliver BLOCKED until G2 with approve verdict
    expect((await callAdvance("deliver", ctx)).blocked).toMatch(/gate G2 not approved/);
    await openGate("G2", "select", ctx); // verdict approve
    expect((await callAdvance("improve", ctx)).blocked).toMatch(/verdict is approve, requires iterate/);
    expect((await callAdvance("deliver", ctx)).blocked).toBeUndefined();
    expect(loadState(root).phase.current).toBe("deliver");

    // deliver -> done BLOCKED until G3
    expect((await callAdvance("done", ctx)).blocked).toMatch(/gate G3 not approved/);
    await openGate("G3", "confirm", ctx);
    expect((await callAdvance("done", ctx)).blocked).toBeUndefined();

    const final = loadState(root);
    expect(final.phase.current).toBe("done");
    expect(final.phase.status).toBe("done");
    expect(final.history.map((h) => h.to)).toEqual([
      "clarify", "build", "test", "evaluate", "deliver", "done",
    ]);
    expect(final.gates.G1.status).toBe("approved");
    expect(final.gates.G2.verdict).toBe("approve");
    expect(final.gates.G3.status).toBe("approved");
  });
});

describe("iterate path + bound", () => {
  it("loops evaluate->improve->build and enforces maxIterations", async () => {
    // Drive to evaluate first.
    const approveCtx = makeCtx({ confirm: true, verdict: "approve" });
    await callAdvance("clarify", approveCtx);
    await openGate("G1", "confirm", approveCtx);
    await callAdvance("build", approveCtx);
    await callAdvance("test", approveCtx);
    await callAdvance("evaluate", approveCtx);

    // Iteration 1: verdict iterate -> improve -> build
    const iterateCtx = makeCtx({ verdict: "iterate" });
    await openGate("G2", "select", iterateCtx);
    expect((await callAdvance("improve", iterateCtx)).blocked).toBeUndefined();
    expect(loadState(root).improve.iteration).toBe(1);
    await callAdvance("build", iterateCtx);
    await callAdvance("test", iterateCtx);
    await callAdvance("evaluate", iterateCtx);

    // Iteration 2: verdict iterate -> improve (reaches the bound of 2)
    await openGate("G2", "select", iterateCtx);
    expect((await callAdvance("improve", iterateCtx)).blocked).toBeUndefined();
    expect(loadState(root).improve.iteration).toBe(2);
    await callAdvance("build", iterateCtx);
    await callAdvance("test", iterateCtx);
    await callAdvance("evaluate", iterateCtx);

    // Iteration 3 attempt: bound reached -> blocked even with iterate verdict
    await openGate("G2", "select", iterateCtx);
    expect((await callAdvance("improve", iterateCtx)).blocked).toMatch(/max iterations \(2\) reached/);
  });
});
