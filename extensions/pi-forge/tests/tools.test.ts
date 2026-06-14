import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initState, saveState, loadState } from "../src/state.js";
import { buildForgeTools, type ForgeToolDeps, type ForgeToolResult } from "../src/tools.js";

const fixedNow = () => "2026-06-14T18:30:00.000Z";

function firstText(r: ForgeToolResult): string {
  return r.content[0]?.text ?? "";
}

interface FakeUi {
  confirmReturn: boolean;
  selectReturn: string | null;
  notes: string[];
  confirm(title: string, message: string): Promise<boolean>;
  select(title: string, items: string[]): Promise<string | null>;
  notify(message: string, type: string): void;
}
function fakeCtx(cwd: string, mode: "tui" | "json", ui: Partial<FakeUi> = {}) {
  const u: FakeUi = {
    confirmReturn: true,
    selectReturn: "approve",
    notes: [],
    async confirm() { return u.confirmReturn; },
    async select() { return u.selectReturn; },
    notify(m) { u.notes.push(m); },
    ...ui,
  };
  return { ctx: { cwd, mode, hasUI: mode === "tui", ui: u }, ui: u };
}

let root: string;
let deps: ForgeToolDeps;
let gitCalls: string[];
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "forge-tools-"));
  gitCalls = [];
  deps = { now: fixedNow, git: (msg) => gitCalls.push(msg), channels: [] };
  saveState(root, initState({ name: "Tool Test" }, fixedNow));
});
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

function tool(name: string) {
  const t = buildForgeTools(deps).find((x) => x.name === name);
  if (!t) throw new Error(`tool ${name} not found`);
  return t;
}

describe("forge_status", () => {
  it("returns the current phase", async () => {
    const { ctx } = fakeCtx(root, "tui");
    const r = await tool("forge_status").execute("id", {}, undefined, undefined, ctx);
    expect(firstText(r)).toContain("intake");
  });
});

describe("forge_advance", () => {
  it("advances a legal ungated transition and checkpoints + commits", async () => {
    const { ctx } = fakeCtx(root, "tui");
    const r = await tool("forge_advance").execute("id", { toPhase: "clarify" }, undefined, undefined, ctx);
    expect(r.isError).toBeUndefined();
    expect(loadState(root).phase.current).toBe("clarify");
    expect(gitCalls.length).toBe(1);
  });
  it("refuses an ungated illegal/blocked advance with isError", async () => {
    const { ctx } = fakeCtx(root, "tui");
    saveState(root, { ...loadState(root), phase: { current: "clarify", status: "in_progress", enteredAt: fixedNow() } });
    const r = await tool("forge_advance").execute("id", { toPhase: "build" }, undefined, undefined, ctx);
    expect(r.isError).toBe(true);
    expect(firstText(r)).toMatch(/gate G1 not approved/);
    expect(loadState(root).phase.current).toBe("clarify"); // unchanged
  });
});

describe("forge_gate", () => {
  it("approves a confirm gate in tui mode", async () => {
    saveState(root, { ...loadState(root), phase: { current: "clarify", status: "in_progress", enteredAt: fixedNow() } });
    const { ctx } = fakeCtx(root, "tui", { confirmReturn: true });
    const r = await tool("forge_gate").execute("id", { id: "G1", summary: "Ready?", kind: "confirm" }, undefined, undefined, ctx);
    expect(firstText(r)).toMatch(/approved/i);
    expect(loadState(root).gates.G1.status).toBe("approved");
  });
  it("records a select-gate verdict in tui mode", async () => {
    saveState(root, { ...loadState(root), phase: { current: "evaluate", status: "in_progress", enteredAt: fixedNow() } });
    const { ctx } = fakeCtx(root, "tui", { selectReturn: "iterate" });
    await tool("forge_gate").execute("id", { id: "G2", summary: "Verdict?", kind: "select" }, undefined, undefined, ctx);
    const g = loadState(root).gates.G2;
    expect(g.status).toBe("approved");
    expect(g.verdict).toBe("iterate");
  });
  it("queues to the inbox in headless (json) mode", async () => {
    saveState(root, { ...loadState(root), phase: { current: "clarify", status: "in_progress", enteredAt: fixedNow() } });
    const { ctx } = fakeCtx(root, "json");
    const r = await tool("forge_gate").execute("id", { id: "G1", summary: "Ready?", kind: "confirm" }, undefined, undefined, ctx);
    expect(firstText(r)).toMatch(/forge-approve G1/);
    expect(loadState(root).gates.G1.status).toBe("pending");
  });
});

describe("forge_note / forge_metric / forge_route", () => {
  it("notes a decision", async () => {
    const { ctx } = fakeCtx(root, "tui");
    await tool("forge_note").execute("id", { text: "decided X" }, undefined, undefined, ctx);
    expect(loadState(root)).toBeTruthy(); // state intact
  });
  it("writes a metric", async () => {
    const { ctx } = fakeCtx(root, "tui");
    await tool("forge_metric").execute("id", { key: "test", value: { passRate: 1 } }, undefined, undefined, ctx);
    const r = await tool("forge_metric").execute("id", { key: "test", value: { passRate: 1 } }, undefined, undefined, ctx);
    expect(r.isError).toBeUndefined();
  });
  it("routes a phase to the policy model", async () => {
    const { ctx } = fakeCtx(root, "tui");
    const r = await tool("forge_route").execute("id", { phase: "build" }, undefined, undefined, ctx);
    expect(firstText(r)).toContain("claude-opus-4-8");
  });
});
