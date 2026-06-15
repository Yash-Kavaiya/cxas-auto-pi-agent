import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { buildCxasTool, type CxasRun } from "../src/cxas.js";
import type { ForgeCtx } from "../src/tools.js";

function cxasAvailable(): boolean {
  try {
    execFileSync("cxas", ["lint", "--list-rules"], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

const realRun = (bin: string, args: string[]): CxasRun => {
  try {
    return { stdout: execFileSync(bin, args, { encoding: "utf8" }), stderr: "", exitCode: 0 };
  } catch (err) {
    const e = err as { stdout?: Buffer | string; stderr?: Buffer | string; status?: number };
    return {
      stdout: e.stdout?.toString() ?? "",
      stderr: e.stderr?.toString() ?? "",
      exitCode: typeof e.status === "number" ? e.status : 1,
    };
  }
};

const available = cxasAvailable();
const ctx: ForgeCtx = {
  cwd: process.cwd(),
  mode: "json",
  hasUI: false,
  ui: { confirm: async () => true, select: async () => null, notify: () => {} },
};

describe.skipIf(!available)("forge_cxas against the real cxas binary (offline)", () => {
  it("runs lint --list-rules and returns rule ids with exit 0", async () => {
    const tool = buildCxasTool({ run: realRun });
    const r = await tool.execute("id", { subcommand: "lint", args: ["--list-rules"] }, undefined, undefined, ctx);
    const details = r.details as { exitCode: number; stdout: string };
    expect(details.exitCode).toBe(0);
    expect(details.stdout).toMatch(/config-json-parse|A001/);
  });
});
