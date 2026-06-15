# pi-forge #3 — CXAS Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add a deterministic `forge_cxas` tool (allow-listed bridge to the Python `cxas` CLI), a `cxas-wrapper` skill, and a CXAS path in tester/evaluator/project-planner.

**Architecture:** `forge_cxas` enforces a subcommand allow-list in code, passes skill-supplied args through verbatim (resource names carry project/location), runs the binary via an injectable runner, and returns `{exitCode, stdout, stderr, json}`. Verified by mock unit tests + an offline real-binary `lint --list-rules` test that skips when the binary is absent.

**Tech Stack:** TypeScript (ESM/NodeNext), typebox, vitest, Node `child_process` (`execFileSync`). Target: Python `cxas` on PATH (`config.cxas.binPath`, default `"cxas"`).

**Reference spec:** [docs/superpowers/specs/2026-06-15-pi-forge-cxas-bridge-design.md](../specs/2026-06-15-pi-forge-cxas-bridge-design.md).

---

## Task 1: config — `cxas.binPath`

**Files:** Modify `extensions/pi-forge/src/config.ts`; Test `extensions/pi-forge/tests/config.test.ts`

- [ ] **Step 1: Add failing test** (append a describe to `config.test.ts`)

```ts
describe("cxas config", () => {
  it("defaults binPath to 'cxas'", () => {
    expect(DEFAULT_CONFIG.cxas.binPath).toBe("cxas");
    expect(loadConfig(root).cxas.binPath).toBe("cxas");
  });
  it("merges an override", () => {
    mkdirSync(join(root, ".pi-forge"), { recursive: true });
    writeFileSync(join(root, ".pi-forge", "config.json"), JSON.stringify({ cxas: { binPath: "/opt/cxas" } }));
    expect(loadConfig(root).cxas.binPath).toBe("/opt/cxas");
  });
});
```

- [ ] **Step 2: Run → fail** (`cxas` missing on `ForgeConfig`/`DEFAULT_CONFIG`).
Run: `cd extensions/pi-forge && npx vitest run tests/config.test.ts`

- [ ] **Step 3: Implement** — in `src/config.ts`:
  - Add to the `ForgeConfig` interface: `cxas: { binPath: string };`
  - Add to `DEFAULT_CONFIG`: `cxas: { binPath: "cxas" },`
  - In `loadConfig`'s returned object, add: `cxas: { ...DEFAULT_CONFIG.cxas, ...(raw.cxas ?? {}) },`

- [ ] **Step 4: Run → pass.** Then `npm run typecheck` → clean.

- [ ] **Step 5: Commit**

```bash
git add extensions/pi-forge/src/config.ts extensions/pi-forge/tests/config.test.ts
git commit -m "feat(pi-forge): add cxas.binPath config"
```

---

## Task 2: `cxas.ts` — allow-list, parse, tool factory

**Files:** Create `extensions/pi-forge/src/cxas.ts`; Test `extensions/pi-forge/tests/cxas.test.ts`

- [ ] **Step 1: Write the failing test** at `tests/cxas.test.ts`

```ts
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
```

- [ ] **Step 2: Run → fail** (`Cannot find module '../src/cxas.js'`).

- [ ] **Step 3: Implement** at `src/cxas.ts`

```ts
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
```

- [ ] **Step 4: Run → pass** (`npx vitest run tests/cxas.test.ts`, 9 tests). Then `npm run typecheck` → clean.

- [ ] **Step 5: Commit**

```bash
git add extensions/pi-forge/src/cxas.ts extensions/pi-forge/tests/cxas.test.ts
git commit -m "feat(pi-forge): add forge_cxas bridge (allow-list, parse, tool)"
```

---

## Task 3: register `forge_cxas` in the extension

**Files:** Modify `extensions/pi-forge/index.ts`

- [ ] **Step 1: Wire it.** In `index.ts`:
  - Add import: `import { buildCxasTool, type CxasRun } from "./src/cxas.js";`
  - After the `for (const tool of buildForgeTools(deps))` loop, add a real runner + registration:

```ts
  // CXAS bridge: run the cxas binary, capturing stdout/stderr/exit code.
  const cxasRun = (bin: string, args: string[]): CxasRun => {
    try {
      const stdout = execFileSync(bin, args, { encoding: "utf8" });
      return { stdout, stderr: "", exitCode: 0 };
    } catch (err) {
      const e = err as { stdout?: Buffer | string; stderr?: Buffer | string; status?: number; message?: string };
      return {
        stdout: e.stdout?.toString() ?? "",
        stderr: e.stderr?.toString() ?? e.message ?? String(err),
        exitCode: typeof e.status === "number" ? e.status : 1,
      };
    }
  };
  pi.registerTool(buildCxasTool({ run: cxasRun }) as Parameters<typeof pi.registerTool>[0]);
```

(`execFileSync` is already imported for git in #1.)

- [ ] **Step 2: Typecheck + full suite.** `npm run typecheck` clean; `npm run test` still green (index isn't imported by tests but is typechecked).

- [ ] **Step 3: Commit**

```bash
git add extensions/pi-forge/index.ts
git commit -m "feat(pi-forge): register forge_cxas in extension wiring"
```

---

## Task 4: skilllint allows `forge_cxas`

**Files:** Modify `extensions/pi-forge/src/skilllint.ts`; Test `extensions/pi-forge/tests/skilllint.test.ts`

- [ ] **Step 1: Add failing test** (append to `skilllint.test.ts`)

```ts
it("allows the forge_cxas tool reference", () => {
  const c = `---\nname: demo-skill\ndescription: ok\n---\n\nuse forge_cxas to lint`;
  expect(lintSkill("demo-skill", c)).toEqual([]);
});
```

- [ ] **Step 2: Run → fail** (`forge_cxas` flagged as unknown).

- [ ] **Step 3: Implement** — add `"forge_cxas",` to the `ALLOWED_FORGE_TOOLS` set in `src/skilllint.ts`.

- [ ] **Step 4: Run → pass.** `npm run typecheck` clean.

- [ ] **Step 5: Commit**

```bash
git add extensions/pi-forge/src/skilllint.ts extensions/pi-forge/tests/skilllint.test.ts
git commit -m "feat(pi-forge): skilllint allows forge_cxas reference"
```

---

## Task 5: `cxas-wrapper` skill

**Files:** Create `skills/cxas-wrapper/SKILL.md`

- [ ] **Step 1: Write the file**

````markdown
---
name: cxas-wrapper
description: Safe bridge to the cxas CLI for pi-forge CXAS projects. Use whenever a CX Agent Studio project needs to lint an app directory, run evaluations, manage apps/deployments, or migrate from Dialogflow CX. Always go through the forge_cxas tool (never raw shell); it enforces an allow-list and returns structured results.
---

# cxas-wrapper

The safe path to the `cxas` CLI. Always call the **forge_cxas** tool; never run `cxas` via raw shell.

## Using forge_cxas
- Call `forge_cxas` with `subcommand` (allow-listed) and `args` (an array passed through verbatim).
- It returns `{exitCode, stdout, stderr, json}` in the result details. `exitCode !== 0` is an error.
- `delete` is refused unless you pass `allowDelete: true` — only do so on explicit human approval.

## Offline vs deployed
- **Offline (no GCP needed):** `lint` over a local app directory — e.g. `subcommand:"lint", args:["--app-dir","./app","--json"]`, or `args:["--list-rules"]` to see rule ids (config A*, callbacks C*, evals E*, …).
- **Deployed (needs a GCP project + auth):** `run` evaluates a deployed app — `subcommand:"run", args:["--app-name","projects/{p}/locations/{l}/apps/{a}","--wait"]` (exit 0 = pass, 1 = fail). `apps`, `deployments`, `trace`, `insights` also hit the live project. Auth comes from `--oauth-token` / `CXAS_OAUTH_TOKEN` / ADC — pi-forge does not manage tokens.

## Resource names
Project and location are encoded in resource names, not flags: `projects/{project}/locations/{location}/apps/{app}` (and `.../evaluations/{id}`). Build these from the project's config/brief.

## Rules
- Always forge_cxas, never raw `cxas` shell.
- Read `exitCode` before trusting output; prefer `--json` where the subcommand supports it.
- Treat `delete` and any destructive op as gated — require explicit human approval.
````

- [ ] **Step 2: Commit**

```bash
git add skills/cxas-wrapper/SKILL.md
git commit -m "feat(pi-forge): add cxas-wrapper skill"
```

---

## Task 6: CXAS path in tester / evaluator / project-planner

**Files:** Modify `skills/tester/SKILL.md`, `skills/evaluator/SKILL.md`, `skills/project-planner/SKILL.md`

- [ ] **Step 1: tester** — append before its `## Rules` section:

```markdown
## CXAS path (when project.type = cxas)
Use the cxas-wrapper skill / forge_cxas:
- Offline structural lint: `forge_cxas lint --app-dir <dir> --json`; record error/warning counts.
- Deployed eval (if an app is deployed): `forge_cxas run --app-name <resource> --wait` (exit 0 pass / 1 fail).
Fold both into `artifacts/test-report.md` and `forge_metric test {"cxas": {"lint": {...}, "eval": {...}}}`.
```

- [ ] **Step 2: evaluator** — append before its `## Rules` section:

```markdown
## CXAS path (when project.type = cxas)
Incorporate the cxas lint findings (rule severities) and the `cxas run` eval pass/fail (from the test report / metrics) into the holistic judgment and the approve|iterate recommendation.
```

- [ ] **Step 3: project-planner** — append before its `## Rules` section:

```markdown
## CXAS path (when project.type = cxas)
Plan the app as CX Agent Studio resources: agents (instructions), tools/toolsets, guardrails, and evaluations. Use the cxas lint rule categories (config, callbacks, tools, evals, structure, schema) as quality targets the build must satisfy.
```

- [ ] **Step 4: Commit**

```bash
git add skills/tester/SKILL.md skills/evaluator/SKILL.md skills/project-planner/SKILL.md
git commit -m "feat(pi-forge): add CXAS path to tester/evaluator/planner"
```

---

## Task 7: conformance — add `cxas-wrapper`

**Files:** Modify `extensions/pi-forge/tests/skills.test.ts`

- [ ] **Step 1: Update expected list** — add `"cxas-wrapper",` (keep sorted) to the `toEqual([...])` array in the "includes all expected skills" test (now 8 skills).

- [ ] **Step 2: Run → pass.** `npx vitest run tests/skills.test.ts` — 9 assertions (expected-set + 8 lints), all green. The `cxas-wrapper` skill lints clean (references `forge_cxas`, allowed in Task 4).

- [ ] **Step 3: Commit**

```bash
git add extensions/pi-forge/tests/skills.test.ts
git commit -m "test(pi-forge): conformance includes cxas-wrapper"
```

---

## Task 8: offline real-binary integration test

**Files:** Create `extensions/pi-forge/tests/cxas.integration.test.ts`

- [ ] **Step 1: Write the test**

```ts
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
```

- [ ] **Step 2: Run.** `npx vitest run tests/cxas.integration.test.ts` — passes if `cxas` is on PATH; otherwise the suite reports the describe as skipped (still exit 0). `npm run typecheck` clean.

- [ ] **Step 3: Commit**

```bash
git add extensions/pi-forge/tests/cxas.integration.test.ts
git commit -m "test(pi-forge): offline real-binary cxas lint integration (skipIf absent)"
```

---

## Task 9: runbook + final verification

**Files:** Modify `docs/RUNBOOK-pi-forge.md`

- [ ] **Step 1: Add a CXAS section** to the runbook:

```markdown
## CXAS bridge (project.type = cxas)
- Offline smoke (no GCP): in a CXAS app dir, the agent runs `forge_cxas lint --app-dir . --json`;
  `forge_cxas lint --list-rules` lists rule ids. Verify the tool returns `{exitCode, json}` and
  rejects non-allow-listed subcommands.
- Deployed eval (needs a GCP project + `gcloud auth`/`CXAS_OAUTH_TOKEN`): the tester runs
  `forge_cxas run --app-name projects/{p}/locations/{l}/apps/{a} --wait`.
- Set `config.cxas.binPath` if `cxas` is not the intended binary on PATH.
```

- [ ] **Step 2: Final verification.** `cd extensions/pi-forge && npm run test && npm run typecheck` — all green; typecheck clean.

- [ ] **Step 3: Commit**

```bash
git add docs/RUNBOOK-pi-forge.md
git commit -m "docs(pi-forge): runbook covers the cxas bridge"
```

---

## Self-review (plan author)

**Spec coverage:** forge_cxas tool incl. allow-list + parse + delete-gate (T2), config binPath (T1), index wiring (T3), skilllint allowance (T4), cxas-wrapper skill (T5), CXAS path in 3 skills (T6), conformance (T7), mock + offline real-binary tests (T2, T8), runbook (T9). All §3–§7 covered. Deployer/Deliver CXAS absent (correct, →#6).

**Placeholder scan:** complete code in each code step; complete markdown in each skill step. No TBD/TODO.

**Type/name consistency:** `CxasRun` defined in `cxas.ts` (T2), reused in `index.ts` (T3) and the integration test (T8). `buildCxasTool({ run })` signature consistent across T2/T3/T8. `forge_cxas` added to skilllint allow-set (T4) before the conformance test lints the cxas-wrapper skill that references it (T7). `ForgeToolDef`/`ForgeCtx` imported from `tools.js` into `cxas.ts` and tests. `config.cxas.binPath` defined T1, read in T2's tool.

**Order:** config (T1) → tool (T2) → wiring (T3) → lint allowance (T4) → skill (T5) → CXAS path (T6) → conformance (T7, after cxas-wrapper exists + forge_cxas allowed) → integration (T8) → runbook (T9).
