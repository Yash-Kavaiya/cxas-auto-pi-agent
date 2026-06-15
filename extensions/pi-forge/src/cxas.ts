import { Type } from "typebox";
import { loadConfig } from "./config.js";
import type { ForgeToolDef } from "./tools.js";

export interface CxasRun {
  stdout: string;
  stderr: string;
  exitCode: number;
}

const ALLOWED_CXAS = new Set([
  "lint", "run", "run-session", "evals", "export", "push-eval",
  "pull", "push", "create", "branch", "apps", "deployments",
  "conversations", "trace", "insights", "migrate", "ci-test",
  "test-tools", "test-callbacks", "init-github-action",
]);

export function isAllowedCxas(subcommand: string, allowDelete: boolean): { ok: boolean; reason: string } {
  if (subcommand === "delete") {
    return allowDelete
      ? { ok: true, reason: "" }
      : { ok: false, reason: "cxas delete requires allowDelete=true" };
  }
  if (!ALLOWED_CXAS.has(subcommand)) {
    return { ok: false, reason: `cxas subcommand '${subcommand}' is not allow-listed` };
  }
  return { ok: true, reason: "" };
}

export interface CxasResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  json: unknown | null;
}

export function parseCxasResult(stdout: string, stderr: string, exitCode: number): CxasResult {
  let json: unknown | null = null;
  const trimmed = stdout.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      json = JSON.parse(trimmed);
    } catch {
      json = null;
    }
  }
  return { exitCode, stdout, stderr, json };
}

export interface CxasToolDeps {
  run: (bin: string, args: string[]) => CxasRun | Promise<CxasRun>;
}

export function buildCxasTool(deps: CxasToolDeps): ForgeToolDef {
  return {
    name: "forge_cxas",
    description:
      "Run an allow-listed cxas CLI subcommand. args are passed through verbatim " +
      "(resource names like projects/{p}/locations/{l}/apps/{a} carry project/location). " +
      "delete requires allowDelete=true. Returns {exitCode, stdout, stderr, json}.",
    parameters: Type.Object({
      subcommand: Type.String({ description: "cxas subcommand, e.g. 'lint' or 'run'." }),
      args: Type.Optional(Type.Array(Type.String(), { description: "Args passed through to cxas." })),
      allowDelete: Type.Optional(Type.Boolean({ description: "Required true to permit 'delete'." })),
    }),
    async execute(_id, params, _s, _u, ctx) {
      const subcommand = String(params.subcommand ?? "");
      const args: string[] = Array.isArray(params.args) ? params.args.map(String) : [];
      const allowDelete = params.allowDelete === true;
      const gate = isAllowedCxas(subcommand, allowDelete);
      if (!gate.ok) {
        return { content: [{ type: "text", text: `Blocked: ${gate.reason}` }], isError: true };
      }
      const binPath = loadConfig(ctx.cwd).cxas.binPath;
      const run = await deps.run(binPath, [subcommand, ...args]);
      const result = parseCxasResult(run.stdout, run.stderr, run.exitCode);
      const isError = result.exitCode !== 0;
      const summary = `cxas ${subcommand} exited ${result.exitCode}`;
      return {
        content: [{ type: "text", text: isError ? `${summary}\n${result.stderr}`.trim() : summary }],
        details: { exitCode: result.exitCode, json: result.json, stdout: result.stdout, stderr: result.stderr },
        ...(isError ? { isError: true } : {}),
      };
    },
  };
}
