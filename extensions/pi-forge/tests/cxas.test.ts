import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isAllowedCxas, parseCxasResult, buildCxasTool, type CxasRun } from "../src/cxas.js";
import type { ForgeCtx } from "../src/tools.js";

let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), "forge-cxas-")); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

function ctxFor(cwd: string): ForgeCtx {
  return { cwd, mode: "json", hasUI: false, ui: { confirm: async () => true, select: async () => null, notify: () => {} } };
}

describe("isAllowedCxas", () => {
  it("allows a known subcommand", () => { expect(isAllowedCxas("lint", false).ok).toBe(true); });
  it("rejects an unknown subcommand", () => {
    const r = isAllowedCxas("frobnicate", false);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/not allow-listed/);
  });
  it("blocks delete without allowDelete and permits with it", () => {
    expect(isAllowedCxas("delete", false).ok).toBe(false);
    expect(isAllowedCxas("delete", true).ok).toBe(true);
  });
});

describe("parseCxasResult", () => {
  it("parses JSON stdout", () => {
    expect(parseCxasResult('{"a":1}', "", 0).json).toEqual({ a: 1 });
  });
  it("returns null json for non-JSON stdout", () => {
    expect(parseCxasResult("plain text", "", 0).json).toBeNull();
  });
});

describe("buildCxasTool", () => {
  function fakeRun(out: { stdout?: string; stderr?: string; exitCode?: number }) {
    const calls: { bin: string; args: string[] }[] = [];
    const run = (bin: string, args: string[]): CxasRun => {
      calls.push({ bin, args });
      return { stdout: out.stdout ?? "", stderr: out.stderr ?? "", exitCode: out.exitCode ?? 0 };
    };
    return { run, calls };
  }

  it("builds <subcommand> ...args and returns parsed json on success", async () => {
    const { run, calls } = fakeRun({ stdout: '{"rules":3}', exitCode: 0 });
    const tool = buildCxasTool({ run });
    const r = await tool.execute("id", { subcommand: "lint", args: ["--list-rules"] }, undefined, undefined, ctxFor(root));
    expect(calls[0]?.bin).toBe("cxas");
    expect(calls[0]?.args).toEqual(["lint", "--list-rules"]);
    expect(r.isError).toBeUndefined();
    expect((r.details as { json: unknown }).json).toEqual({ rules: 3 });
  });

  it("blocks a non-allow-listed subcommand without running", async () => {
    const { run, calls } = fakeRun({});
    const tool = buildCxasTool({ run });
    const r = await tool.execute("id", { subcommand: "rm-rf", args: [] }, undefined, undefined, ctxFor(root));
    expect(r.isError).toBe(true);
    expect(calls.length).toBe(0);
  });

  it("surfaces a non-zero exit as isError with stderr", async () => {
    const { run } = fakeRun({ stdout: "", stderr: "boom", exitCode: 2 });
    const tool = buildCxasTool({ run });
    const r = await tool.execute("id", { subcommand: "run", args: ["--app-name", "x"] }, undefined, undefined, ctxFor(root));
    expect(r.isError).toBe(true);
    expect((r.details as { exitCode: number }).exitCode).toBe(2);
    expect(r.content[0]?.text ?? "").toMatch(/boom/);
  });

  it("blocks delete unless allowDelete is set", async () => {
    const { run, calls } = fakeRun({});
    const tool = buildCxasTool({ run });
    const blocked = await tool.execute("id", { subcommand: "delete", args: ["--app-name", "x"] }, undefined, undefined, ctxFor(root));
    expect(blocked.isError).toBe(true);
    expect(calls.length).toBe(0);
    const ok = await tool.execute("id", { subcommand: "delete", args: ["--app-name", "x"], allowDelete: true }, undefined, undefined, ctxFor(root));
    expect(ok.isError).toBeUndefined();
    expect(calls.length).toBe(1);
  });
});
