# pi-forge Foundation (Sub-project #1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the deterministic walking skeleton of pi-forge — a TypeScript pi.dev extension whose state machine drives a project through Intake→…→Deliver with **code-enforced human gates**, plus a minimal `project-orchestrator` skill, proven end-to-end on a toy project.

**Architecture:** Pure, dependency-free core modules (`types`, `config`, `state`, `machine`, `gates`, `guard`, `checkpoint`, `notifier`, `inbox`, `artifacts`) hold all logic and are unit-tested with vitest against temp directories. A thin `index.ts` wires them to pi's `ExtensionAPI` (`registerTool`, `registerCommand`, `on("tool_call")`, `pi.exec`). Gate enforcement lives in a single pure function `guardToolCall()` that the `tool_call` event handler returns from — the model literally cannot call `forge_advance` across a gate that isn't approved.

**Tech Stack:** TypeScript (ESM, NodeNext), `typebox@1.1.38` (runtime, for tool parameter schemas), `vitest` (tests), `@earendil-works/pi-coding-agent@0.79.3` (type-only, for `ExtensionAPI`), Node ≥18 (`structuredClone`), git.

**Reference spec:** [docs/superpowers/specs/2026-06-14-pi-forge-platform-design.md](../specs/2026-06-14-pi-forge-platform-design.md) — see §5 (state machine), §6 (state schemas), §7 (extension).

---

## Concrete gate model (refines spec §5.2 into one-gate-per-transition)

| Transition | Gate | Kind | Meaning |
|---|---|---|---|
| `intake → clarify` | — | — | automatic |
| `clarify → build` | **G1** | confirm | "Requirements clear — ready to build?" |
| `build → test` | — | — | automatic |
| `test → evaluate` | — | — | automatic |
| `evaluate → improve` | **G2** (verdict `iterate`) | select | iterate verdict; only if `iteration < maxIterations` |
| `evaluate → deliver` | **G2** (verdict `approve`) | select | approve verdict |
| `improve → build` | — | — | bounded re-loop (increments iteration on `evaluate→improve`) |
| `deliver → done` | **G3** | confirm | "Deploy / hand over to production?" |

`maxIterations` defaults to 3. G2 is a single *select* gate at the end of evaluate whose verdict (`approve`|`iterate`) selects which outgoing transition is legal.

---

## File structure

```
extensions/pi-forge/
  package.json            # ESM; deps: typebox; devDeps: vitest, typescript, @types/node, @earendil-works/pi-coding-agent
  tsconfig.json
  vitest.config.ts
  index.ts                # thin pi wiring (smoke-tested manually)
  src/
    types.ts              # Phase/GateId/GateStatus/PhaseStatus, ForgeState, GateRecord, TransitionDef, PHASES, TRANSITIONS, GATE_IDS
    util.ts               # nowIso(), slugify()
    config.ts             # ForgeConfig, DEFAULT_CONFIG, loadConfig(), resolveEnv(), routeFor()
    state.ts              # forgeDir(), statePath(), initState(), loadState(), saveState()
    machine.ts            # findTransition(), canAdvance(), advance()
    gates.ts              # recordGateDecision(), markGatePending()
    guard.ts              # guardToolCall()  ← the linchpin
    checkpoint.ts         # writeCheckpoint()
    notifier.ts           # NotifyChannel, formatGateMessage(), terminalChannel(), fanOut()
    inbox.ts              # writeInbox(), readInbox(), clearInbox()
    artifacts.ts          # appendDecision(), writeMetric()
    tools.ts              # buildForgeTools(deps) → ToolDef[]
  tests/
    util.test.ts
    config.test.ts
    state.test.ts
    machine.test.ts
    gates.test.ts
    guard.test.ts
    checkpoint.test.ts
    notifier.test.ts
    inbox.test.ts
    artifacts.test.ts
    tools.test.ts
    integration.test.ts   # full toy lifecycle, gate enforcement proven
skills/project-orchestrator/SKILL.md
docs/RUNBOOK-pi-forge.md  # manual smoke test
```

> Note: the extension is developed at `extensions/pi-forge/` (clean, testable). The manual runbook (Task 14) loads it into pi via the settings `extensions` array. Per-project runtime state (`.pi-forge/`) is created in whichever directory pi runs — for the smoke test, `sandbox/toy/`.

---

## Task 0: Scaffold the extension package

**Files:**
- Create: `extensions/pi-forge/package.json`
- Create: `extensions/pi-forge/tsconfig.json`
- Create: `extensions/pi-forge/vitest.config.ts`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "@cxas/pi-forge",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "pi-forge — deterministic project-delivery state machine for pi.dev",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "typebox": "1.1.38"
  },
  "devDependencies": {
    "@earendil-works/pi-coding-agent": "0.79.3",
    "@types/node": "^22.0.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["node"],
    "outDir": "dist"
  },
  "include": ["index.ts", "src/**/*.ts", "tests/**/*.ts"]
}
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
```

- [ ] **Step 4: Install and verify the toolchain runs**

Run: `cd extensions/pi-forge && npm install && npm run test`
Expected: vitest reports `No test files found` (exit 0) — toolchain works, no tests yet.

- [ ] **Step 5: Commit**

```bash
git add extensions/pi-forge/package.json extensions/pi-forge/tsconfig.json extensions/pi-forge/vitest.config.ts extensions/pi-forge/package-lock.json
git commit -m "chore(pi-forge): scaffold extension package + vitest"
```

---

## Task 1: `util.ts` — timestamps and slugify

**Files:**
- Create: `extensions/pi-forge/src/util.ts`
- Test: `extensions/pi-forge/tests/util.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/util.test.ts
import { describe, it, expect } from "vitest";
import { slugify, nowIso } from "../src/util.js";

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Acme Support Assistant")).toBe("acme-support-assistant");
  });
  it("collapses non-alphanumerics and trims hyphens", () => {
    expect(slugify("  Hello,  World!! ")).toBe("hello-world");
  });
  it("handles empty-ish input", () => {
    expect(slugify("***")).toBe("untitled");
  });
});

describe("nowIso", () => {
  it("returns an ISO-8601 UTC string", () => {
    expect(nowIso()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/util.test.ts`
Expected: FAIL — `Cannot find module '../src/util.js'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/util.ts
export function nowIso(): string {
  return new Date().toISOString();
}

export function slugify(input: string): string {
  const s = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s.length > 0 ? s : "untitled";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/util.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add extensions/pi-forge/src/util.ts extensions/pi-forge/tests/util.test.ts
git commit -m "feat(pi-forge): add util (nowIso, slugify)"
```

---

## Task 2: `types.ts` — domain types, phases, transitions

**Files:**
- Create: `extensions/pi-forge/src/types.ts`
- Test: `extensions/pi-forge/tests/types.test.ts`

> `types.ts` is mostly type declarations plus two runtime constants (`PHASES`, `TRANSITIONS`). We test the constants.

- [ ] **Step 1: Write the failing test**

```ts
// tests/types.test.ts
import { describe, it, expect } from "vitest";
import { PHASES, TRANSITIONS, GATE_IDS } from "../src/types.js";

describe("PHASES", () => {
  it("is the ordered lifecycle", () => {
    expect(PHASES).toEqual([
      "intake", "clarify", "build", "test", "evaluate", "improve", "deliver", "done",
    ]);
  });
});

describe("TRANSITIONS", () => {
  it("gates clarify->build with G1 (confirm)", () => {
    const t = TRANSITIONS.find((x) => x.from === "clarify" && x.to === "build");
    expect(t?.gate).toBe("G1");
    expect(t?.kind).toBe("confirm");
  });
  it("gates both evaluate exits with G2 and distinct verdicts", () => {
    const imp = TRANSITIONS.find((x) => x.from === "evaluate" && x.to === "improve");
    const del = TRANSITIONS.find((x) => x.from === "evaluate" && x.to === "deliver");
    expect(imp?.gate).toBe("G2");
    expect(imp?.requiresVerdict).toBe("iterate");
    expect(del?.gate).toBe("G2");
    expect(del?.requiresVerdict).toBe("approve");
  });
  it("gates deliver->done with G3", () => {
    const t = TRANSITIONS.find((x) => x.from === "deliver" && x.to === "done");
    expect(t?.gate).toBe("G3");
  });
  it("has no gate on the improve->build re-loop", () => {
    const t = TRANSITIONS.find((x) => x.from === "improve" && x.to === "build");
    expect(t?.gate).toBeUndefined();
  });
});

describe("GATE_IDS", () => {
  it("lists the three gates", () => {
    expect(GATE_IDS).toEqual(["G1", "G2", "G3"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/types.test.ts`
Expected: FAIL — `Cannot find module '../src/types.js'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/types.ts
export type Phase =
  | "intake" | "clarify" | "build" | "test" | "evaluate" | "improve" | "deliver" | "done";

export const PHASES: Phase[] = [
  "intake", "clarify", "build", "test", "evaluate", "improve", "deliver", "done",
];

export type GateId = "G1" | "G2" | "G3";
export const GATE_IDS: GateId[] = ["G1", "G2", "G3"];

export type GateStatus = "not_reached" | "pending" | "approved" | "rejected";
export type Verdict = "approve" | "iterate";
export type PhaseStatus = "not_started" | "in_progress" | "blocked_on_gate" | "done";
export type GateKind = "confirm" | "select";
export type ProjectType = "general" | "cxas";

export interface GateRecord {
  status: GateStatus;
  verdict?: Verdict;
  decidedBy?: string;
  channel?: string;
  at?: string;
  note?: string;
}

export interface TransitionDef {
  from: Phase;
  to: Phase;
  gate?: GateId;
  kind?: GateKind;
  requiresVerdict?: Verdict;
}

export const TRANSITIONS: TransitionDef[] = [
  { from: "intake",   to: "clarify" },
  { from: "clarify",  to: "build",   gate: "G1", kind: "confirm" },
  { from: "build",    to: "test" },
  { from: "test",     to: "evaluate" },
  { from: "evaluate", to: "improve", gate: "G2", kind: "select", requiresVerdict: "iterate" },
  { from: "evaluate", to: "deliver", gate: "G2", kind: "select", requiresVerdict: "approve" },
  { from: "improve",  to: "build" },
  { from: "deliver",  to: "done",    gate: "G3", kind: "confirm" },
];

export interface HistoryEntry {
  from: Phase;
  to: Phase;
  at: string;
  gate?: GateId;
  verdict?: Verdict;
}

export interface ForgeState {
  schemaVersion: number;
  project: {
    id: string;
    name: string;
    slug: string;
    type: ProjectType;
    created: string;
    repoRoot: string;
  };
  phase: { current: Phase; status: PhaseStatus; enteredAt: string };
  gates: Record<GateId, GateRecord>;
  improve: { iteration: number; maxIterations: number };
  routing: { overrides: Record<string, string> };
  artifacts: Record<string, string>;
  history: HistoryEntry[];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/types.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add extensions/pi-forge/src/types.ts extensions/pi-forge/tests/types.test.ts
git commit -m "feat(pi-forge): add domain types, phases, and transition table"
```

---

## Task 3: `config.ts` — config defaults, loading, routing, env

**Files:**
- Create: `extensions/pi-forge/src/config.ts`
- Test: `extensions/pi-forge/tests/config.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/config.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_CONFIG, loadConfig, resolveEnv, routeFor } from "../src/config.js";

let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), "forge-cfg-")); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

describe("loadConfig", () => {
  it("returns defaults when no config file exists", () => {
    expect(loadConfig(root)).toEqual(DEFAULT_CONFIG);
  });
  it("merges a partial config file over defaults", () => {
    mkdirSync(join(root, ".pi-forge"), { recursive: true });
    writeFileSync(
      join(root, ".pi-forge", "config.json"),
      JSON.stringify({ bounds: { maxIterations: 5 } }),
    );
    const cfg = loadConfig(root);
    expect(cfg.bounds.maxIterations).toBe(5);
    expect(cfg.bounds.gateTimeoutHours).toBe(DEFAULT_CONFIG.bounds.gateTimeoutHours);
    expect(cfg.routing.policy.build).toBe(DEFAULT_CONFIG.routing.policy.build);
  });
});

describe("resolveEnv", () => {
  it("substitutes ${VAR} from process.env", () => {
    process.env.FORGE_TEST_VAR = "https://hooks.example/abc";
    expect(resolveEnv("${FORGE_TEST_VAR}")).toBe("https://hooks.example/abc");
    delete process.env.FORGE_TEST_VAR;
  });
  it("leaves plain strings untouched and blanks unknown vars", () => {
    expect(resolveEnv("plain")).toBe("plain");
    expect(resolveEnv("${FORGE_DOES_NOT_EXIST}")).toBe("");
  });
});

describe("routeFor", () => {
  it("prefers an override, then policy, then fallback", () => {
    expect(routeFor(DEFAULT_CONFIG, "build", {})).toBe(DEFAULT_CONFIG.routing.policy.build);
    expect(routeFor(DEFAULT_CONFIG, "build", { build: "ollama/llama3.1" })).toBe("ollama/llama3.1");
    expect(routeFor(DEFAULT_CONFIG, "nonexistent-phase", {})).toBe(DEFAULT_CONFIG.routing.policy.fallback);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/config.test.ts`
Expected: FAIL — `Cannot find module '../src/config.js'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/config.ts
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface ChannelConfig {
  terminal: { enabled: boolean };
  webhook: { enabled: boolean; url: string; format: "slack" | "discord" };
  email: { enabled: boolean; to: string; via: "smtp" };
}

export interface ForgeConfig {
  channels: ChannelConfig;
  routing: { policy: Record<string, string> };
  bounds: { maxIterations: number; gateTimeoutHours: number };
}

export const DEFAULT_CONFIG: ForgeConfig = {
  channels: {
    terminal: { enabled: true },
    webhook: { enabled: false, url: "${FORGE_WEBHOOK_URL}", format: "slack" },
    email: { enabled: false, to: "", via: "smtp" },
  },
  routing: {
    policy: {
      intake: "gemini/gemini-2.0-flash",
      clarify: "gemini/gemini-2.0-flash",
      build: "anthropic/claude-opus-4-8",
      test: "anthropic/claude-sonnet-4-6",
      evaluate: "gemini/gemini-2.0-pro",
      improve: "anthropic/claude-opus-4-8",
      deliver: "anthropic/claude-sonnet-4-6",
      fallback: "openai/gpt-4o",
      sensitive: "ollama/llama3.1",
    },
  },
  bounds: { maxIterations: 3, gateTimeoutHours: 72 },
};

function configPath(root: string): string {
  return join(root, ".pi-forge", "config.json");
}

export function loadConfig(root: string): ForgeConfig {
  const path = configPath(root);
  if (!existsSync(path)) return DEFAULT_CONFIG;
  const raw = JSON.parse(readFileSync(path, "utf8")) as Partial<ForgeConfig>;
  return {
    channels: { ...DEFAULT_CONFIG.channels, ...(raw.channels ?? {}) },
    routing: {
      policy: { ...DEFAULT_CONFIG.routing.policy, ...(raw.routing?.policy ?? {}) },
    },
    bounds: { ...DEFAULT_CONFIG.bounds, ...(raw.bounds ?? {}) },
  };
}

export function resolveEnv(value: string): string {
  return value.replace(/\$\{([A-Z0-9_]+)\}/g, (_m, name: string) => process.env[name] ?? "");
}

export function routeFor(
  config: ForgeConfig,
  phase: string,
  overrides: Record<string, string>,
): string {
  return overrides[phase] ?? config.routing.policy[phase] ?? config.routing.policy.fallback;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/config.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add extensions/pi-forge/src/config.ts extensions/pi-forge/tests/config.test.ts
git commit -m "feat(pi-forge): add config defaults, loading, env + routing"
```

---

## Task 4: `state.ts` — init / load / save

**Files:**
- Create: `extensions/pi-forge/src/state.ts`
- Test: `extensions/pi-forge/tests/state.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/state.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { forgeDir, statePath, initState, loadState, saveState } from "../src/state.js";

let root: string;
const fixedNow = () => "2026-06-14T18:00:00.000Z";
beforeEach(() => { root = mkdtempSync(join(tmpdir(), "forge-state-")); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

describe("initState", () => {
  it("starts at intake with three not_reached gates", () => {
    const s = initState({ name: "Acme Support Assistant", type: "cxas" }, fixedNow);
    expect(s.phase.current).toBe("intake");
    expect(s.project.slug).toBe("acme-support-assistant");
    expect(s.project.type).toBe("cxas");
    expect(s.project.created).toBe("2026-06-14T18:00:00.000Z");
    expect(s.gates).toEqual({
      G1: { status: "not_reached" },
      G2: { status: "not_reached" },
      G3: { status: "not_reached" },
    });
    expect(s.improve).toEqual({ iteration: 0, maxIterations: 3 });
  });
  it("defaults type to general and respects maxIterations", () => {
    const s = initState({ name: "X", maxIterations: 5 }, fixedNow);
    expect(s.project.type).toBe("general");
    expect(s.improve.maxIterations).toBe(5);
  });
});

describe("save/load round-trip", () => {
  it("persists to .pi-forge/state.json and reloads identically", () => {
    const s = initState({ name: "Round Trip" }, fixedNow);
    saveState(root, s);
    expect(existsSync(statePath(root))).toBe(true);
    expect(existsSync(forgeDir(root))).toBe(true);
    expect(loadState(root)).toEqual(s);
  });
  it("throws a clear error when no state exists", () => {
    expect(() => loadState(root)).toThrow(/no pi-forge state/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/state.test.ts`
Expected: FAIL — `Cannot find module '../src/state.js'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/state.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/state.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add extensions/pi-forge/src/state.ts extensions/pi-forge/tests/state.test.ts
git commit -m "feat(pi-forge): add state init/load/save"
```

---

## Task 5: `machine.ts` — transition legality and advance

**Files:**
- Create: `extensions/pi-forge/src/machine.ts`
- Test: `extensions/pi-forge/tests/machine.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/machine.test.ts
import { describe, it, expect } from "vitest";
import { initState } from "../src/state.js";
import { findTransition, canAdvance, advance } from "../src/machine.js";
import type { ForgeState, GateId, Verdict } from "../src/types.js";

const fixedNow = () => "2026-06-14T18:00:00.000Z";

function at(phase: ForgeState["phase"]["current"]): ForgeState {
  const s = initState({ name: "T" }, fixedNow);
  s.phase.current = phase;
  return s;
}
function withGate(s: ForgeState, id: GateId, verdict?: Verdict): ForgeState {
  s.gates[id] = { status: "approved", verdict };
  return s;
}

describe("findTransition", () => {
  it("finds a legal edge and returns undefined for illegal ones", () => {
    expect(findTransition("intake", "clarify")?.to).toBe("clarify");
    expect(findTransition("intake", "deliver")).toBeUndefined();
  });
});

describe("canAdvance", () => {
  it("allows ungated transitions", () => {
    expect(canAdvance(at("intake"), "clarify").ok).toBe(true);
    expect(canAdvance(at("build"), "test").ok).toBe(true);
  });
  it("rejects illegal transitions", () => {
    const r = canAdvance(at("intake"), "build");
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/illegal transition/);
  });
  it("blocks clarify->build until G1 is approved", () => {
    expect(canAdvance(at("clarify"), "build").ok).toBe(false);
    expect(canAdvance(withGate(at("clarify"), "G1"), "build").ok).toBe(true);
  });
  it("routes evaluate by G2 verdict", () => {
    expect(canAdvance(withGate(at("evaluate"), "G2", "approve"), "deliver").ok).toBe(true);
    expect(canAdvance(withGate(at("evaluate"), "G2", "approve"), "improve").ok).toBe(false);
    expect(canAdvance(withGate(at("evaluate"), "G2", "iterate"), "improve").ok).toBe(true);
    expect(canAdvance(withGate(at("evaluate"), "G2", "iterate"), "deliver").ok).toBe(false);
  });
  it("blocks evaluate->improve when maxIterations reached", () => {
    const s = withGate(at("evaluate"), "G2", "iterate");
    s.improve = { iteration: 3, maxIterations: 3 };
    const r = canAdvance(s, "improve");
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/max iterations/);
  });
  it("blocks deliver->done until G3 approved", () => {
    expect(canAdvance(at("deliver"), "done").ok).toBe(false);
    expect(canAdvance(withGate(at("deliver"), "G3"), "done").ok).toBe(true);
  });
});

describe("advance", () => {
  it("moves phase, appends history, and is immutable", () => {
    const s = at("intake");
    const next = advance(s, "clarify", fixedNow);
    expect(s.phase.current).toBe("intake"); // original unchanged
    expect(next.phase.current).toBe("clarify");
    expect(next.history.at(-1)).toEqual({
      from: "intake", to: "clarify", at: "2026-06-14T18:00:00.000Z", gate: undefined, verdict: undefined,
    });
  });
  it("records the gate + verdict on gated transitions", () => {
    const s = withGate(at("evaluate"), "G2", "iterate");
    const next = advance(s, "improve", fixedNow);
    expect(next.history.at(-1)?.gate).toBe("G2");
    expect(next.history.at(-1)?.verdict).toBe("iterate");
  });
  it("increments iteration on evaluate->improve only", () => {
    const s = withGate(at("evaluate"), "G2", "iterate");
    expect(advance(s, "improve", fixedNow).improve.iteration).toBe(1);
    const b = at("improve");
    expect(advance(b, "build", fixedNow).improve.iteration).toBe(0);
  });
  it("sets status done when reaching done", () => {
    const s = withGate(at("deliver"), "G3");
    expect(advance(s, "done", fixedNow).phase.status).toBe("done");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/machine.test.ts`
Expected: FAIL — `Cannot find module '../src/machine.js'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/machine.ts
import { nowIso } from "./util.js";
import { TRANSITIONS } from "./types.js";
import type { ForgeState, Phase, TransitionDef } from "./types.js";

export function findTransition(from: Phase, to: Phase): TransitionDef | undefined {
  return TRANSITIONS.find((t) => t.from === from && t.to === to);
}

export interface AdvanceCheck {
  ok: boolean;
  reason: string;
}

export function canAdvance(state: ForgeState, to: Phase): AdvanceCheck {
  const from = state.phase.current;
  const t = findTransition(from, to);
  if (!t) return { ok: false, reason: `illegal transition ${from} -> ${to}` };

  if (t.gate) {
    const g = state.gates[t.gate];
    if (g.status !== "approved") {
      return { ok: false, reason: `gate ${t.gate} not approved (status: ${g.status})` };
    }
    if (t.requiresVerdict && g.verdict !== t.requiresVerdict) {
      return {
        ok: false,
        reason: `gate ${t.gate} verdict is ${g.verdict ?? "none"}, requires ${t.requiresVerdict}`,
      };
    }
  }

  if (from === "evaluate" && to === "improve" && state.improve.iteration >= state.improve.maxIterations) {
    return { ok: false, reason: `max iterations (${state.improve.maxIterations}) reached` };
  }

  return { ok: true, reason: "" };
}

export function advance(state: ForgeState, to: Phase, now: () => string = nowIso): ForgeState {
  const from = state.phase.current;
  const t = findTransition(from, to);
  const ts = now();
  const next: ForgeState = structuredClone(state);
  next.phase = { current: to, status: to === "done" ? "done" : "in_progress", enteredAt: ts };
  next.history.push({
    from,
    to,
    at: ts,
    gate: t?.gate,
    verdict: t?.gate ? state.gates[t.gate].verdict : undefined,
  });
  if (from === "evaluate" && to === "improve") {
    next.improve.iteration += 1;
  }
  return next;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/machine.test.ts`
Expected: PASS (12 tests).

- [ ] **Step 5: Commit**

```bash
git add extensions/pi-forge/src/machine.ts extensions/pi-forge/tests/machine.test.ts
git commit -m "feat(pi-forge): add state machine (canAdvance, advance)"
```

---

## Task 6: `gates.ts` — record gate decisions

**Files:**
- Create: `extensions/pi-forge/src/gates.ts`
- Test: `extensions/pi-forge/tests/gates.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/gates.test.ts
import { describe, it, expect } from "vitest";
import { initState } from "../src/state.js";
import { recordGateDecision, markGatePending } from "../src/gates.js";

const fixedNow = () => "2026-06-14T19:00:00.000Z";

describe("recordGateDecision", () => {
  it("approves a confirm gate immutably", () => {
    const s = initState({ name: "T" }, fixedNow);
    const next = recordGateDecision(s, "G1", { status: "approved", by: "yash", channel: "terminal" }, fixedNow);
    expect(s.gates.G1.status).toBe("not_reached"); // original unchanged
    expect(next.gates.G1).toEqual({
      status: "approved", verdict: undefined, decidedBy: "yash",
      channel: "terminal", at: "2026-06-14T19:00:00.000Z", note: undefined,
    });
  });
  it("records a select-gate verdict", () => {
    const s = initState({ name: "T" }, fixedNow);
    const next = recordGateDecision(s, "G2", { status: "approved", verdict: "iterate", by: "yash" }, fixedNow);
    expect(next.gates.G2.verdict).toBe("iterate");
  });
});

describe("markGatePending", () => {
  it("sets pending status", () => {
    const s = initState({ name: "T" }, fixedNow);
    const next = markGatePending(s, "G3", fixedNow);
    expect(next.gates.G3.status).toBe("pending");
    expect(next.gates.G3.at).toBe("2026-06-14T19:00:00.000Z");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/gates.test.ts`
Expected: FAIL — `Cannot find module '../src/gates.js'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/gates.ts
import { nowIso } from "./util.js";
import type { ForgeState, GateId, Verdict } from "./types.js";

export interface GateDecision {
  status: "approved" | "rejected";
  verdict?: Verdict;
  by?: string;
  channel?: string;
  note?: string;
}

export function recordGateDecision(
  state: ForgeState,
  id: GateId,
  decision: GateDecision,
  now: () => string = nowIso,
): ForgeState {
  const next = structuredClone(state);
  next.gates[id] = {
    status: decision.status,
    verdict: decision.verdict,
    decidedBy: decision.by,
    channel: decision.channel,
    at: now(),
    note: decision.note,
  };
  return next;
}

export function markGatePending(
  state: ForgeState,
  id: GateId,
  now: () => string = nowIso,
): ForgeState {
  const next = structuredClone(state);
  next.gates[id] = { ...next.gates[id], status: "pending", at: now() };
  return next;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/gates.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add extensions/pi-forge/src/gates.ts extensions/pi-forge/tests/gates.test.ts
git commit -m "feat(pi-forge): add gate decision recording"
```

---

## Task 7: `guard.ts` — the gate enforcement linchpin

**Files:**
- Create: `extensions/pi-forge/src/guard.ts`
- Test: `extensions/pi-forge/tests/guard.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/guard.test.ts
import { describe, it, expect } from "vitest";
import { initState } from "../src/state.js";
import { guardToolCall } from "../src/guard.js";
import type { ForgeState } from "../src/types.js";

function at(phase: ForgeState["phase"]["current"]): ForgeState {
  const s = initState({ name: "T" }, () => "2026-06-14T18:00:00.000Z");
  s.phase.current = phase;
  return s;
}

describe("guardToolCall", () => {
  it("ignores non-advance tools", () => {
    expect(guardToolCall(at("clarify"), { toolName: "forge_status", input: {} })).toBeUndefined();
  });
  it("blocks forge_advance across an unapproved gate with a reason", () => {
    const r = guardToolCall(at("clarify"), { toolName: "forge_advance", input: { toPhase: "build" } });
    expect(r).toEqual({ block: true, reason: expect.stringMatching(/gate G1 not approved/) });
  });
  it("allows forge_advance once the gate is approved", () => {
    const s = at("clarify");
    s.gates.G1 = { status: "approved" };
    expect(guardToolCall(s, { toolName: "forge_advance", input: { toPhase: "build" } })).toBeUndefined();
  });
  it("blocks an illegal target phase", () => {
    const r = guardToolCall(at("intake"), { toolName: "forge_advance", input: { toPhase: "deliver" } });
    expect(r?.block).toBe(true);
    expect(r?.reason).toMatch(/illegal transition/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/guard.test.ts`
Expected: FAIL — `Cannot find module '../src/guard.js'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/guard.ts
import { canAdvance } from "./machine.js";
import type { ForgeState, Phase } from "./types.js";

export interface ToolCallLike {
  toolName: string;
  input: { toPhase?: Phase } & Record<string, unknown>;
}

export interface BlockResult {
  block: true;
  reason: string;
}

/**
 * The single gate-enforcement point. Returns a block result for an illegal or
 * un-gated forge_advance; returns undefined to allow the call through.
 */
export function guardToolCall(state: ForgeState, event: ToolCallLike): BlockResult | undefined {
  if (event.toolName !== "forge_advance") return undefined;
  const toPhase = event.input?.toPhase;
  if (!toPhase) return { block: true, reason: "forge_advance requires a toPhase argument" };
  const check = canAdvance(state, toPhase);
  if (!check.ok) return { block: true, reason: check.reason };
  return undefined;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/guard.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add extensions/pi-forge/src/guard.ts extensions/pi-forge/tests/guard.test.ts
git commit -m "feat(pi-forge): add guardToolCall gate enforcement"
```

---

## Task 8: `checkpoint.ts` — snapshot writer

**Files:**
- Create: `extensions/pi-forge/src/checkpoint.ts`
- Test: `extensions/pi-forge/tests/checkpoint.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/checkpoint.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initState } from "../src/state.js";
import { writeCheckpoint } from "../src/checkpoint.js";

let root: string;
const fixedNow = () => "2026-06-14T20:00:00.000Z";
beforeEach(() => { root = mkdtempSync(join(tmpdir(), "forge-ckpt-")); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

describe("writeCheckpoint", () => {
  it("writes a numbered, labelled snapshot and increments the index", () => {
    const s = initState({ name: "T" }, fixedNow);
    const f1 = writeCheckpoint(root, s, "advance->clarify", fixedNow);
    const f2 = writeCheckpoint(root, s, "advance->build", fixedNow);
    expect(f1).toMatch(/0000-advance-clarify\.json$/);
    expect(f2).toMatch(/0001-advance-build\.json$/);
    const dir = join(root, ".pi-forge", "checkpoints");
    expect(readdirSync(dir).sort()).toEqual(["0000-advance-clarify.json", "0001-advance-build.json"]);
    const snap = JSON.parse(readFileSync(f1, "utf8"));
    expect(snap.label).toBe("advance->clarify");
    expect(snap.at).toBe("2026-06-14T20:00:00.000Z");
    expect(snap.state.phase.current).toBe("intake");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/checkpoint.test.ts`
Expected: FAIL — `Cannot find module '../src/checkpoint.js'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/checkpoint.ts
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { nowIso } from "./util.js";
import { forgeDir } from "./state.js";
import type { ForgeState } from "./types.js";

export function writeCheckpoint(
  root: string,
  state: ForgeState,
  label: string,
  now: () => string = nowIso,
): string {
  const dir = join(forgeDir(root), "checkpoints");
  mkdirSync(dir, { recursive: true });
  const count = readdirSync(dir).filter((f) => f.endsWith(".json")).length;
  const idx = String(count).padStart(4, "0");
  const safeLabel = label.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "");
  const file = join(dir, `${idx}-${safeLabel}.json`);
  writeFileSync(file, JSON.stringify({ at: now(), label, state }, null, 2));
  return file;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/checkpoint.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add extensions/pi-forge/src/checkpoint.ts extensions/pi-forge/tests/checkpoint.test.ts
git commit -m "feat(pi-forge): add checkpoint snapshot writer"
```

---

## Task 9: `notifier.ts` — channel fan-out (terminal in v1)

**Files:**
- Create: `extensions/pi-forge/src/notifier.ts`
- Test: `extensions/pi-forge/tests/notifier.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/notifier.test.ts
import { describe, it, expect } from "vitest";
import { initState } from "../src/state.js";
import { formatGateMessage, terminalChannel, fanOut, type NotifyChannel } from "../src/notifier.js";

const fixedNow = () => "2026-06-14T18:00:00.000Z";

describe("formatGateMessage", () => {
  it("includes gate id, project name, phase, and summary", () => {
    const s = initState({ name: "Acme Bot" }, fixedNow);
    s.phase.current = "clarify";
    const msg = formatGateMessage(s, "G1", "Ready to build?");
    expect(msg).toContain("G1");
    expect(msg).toContain("Acme Bot");
    expect(msg).toContain("clarify");
    expect(msg).toContain("Ready to build?");
  });
});

describe("terminalChannel + fanOut", () => {
  it("sends the message through an injected writer", async () => {
    const lines: string[] = [];
    const ch = terminalChannel((s) => lines.push(s));
    await fanOut([ch], "hello");
    expect(lines).toEqual(["hello"]);
  });
  it("fans out to every channel and tolerates one failing", async () => {
    const seen: string[] = [];
    const ok: NotifyChannel = { name: "ok", send: (m) => { seen.push(m); } };
    const bad: NotifyChannel = { name: "bad", send: () => { throw new Error("boom"); } };
    await fanOut([ok, bad, ok], "msg"); // must not throw
    expect(seen).toEqual(["msg", "msg"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/notifier.test.ts`
Expected: FAIL — `Cannot find module '../src/notifier.js'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/notifier.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/notifier.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add extensions/pi-forge/src/notifier.ts extensions/pi-forge/tests/notifier.test.ts
git commit -m "feat(pi-forge): add notifier channel fan-out (terminal)"
```

---

## Task 10: `inbox.ts` — headless gate approval queue

**Files:**
- Create: `extensions/pi-forge/src/inbox.ts`
- Test: `extensions/pi-forge/tests/inbox.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/inbox.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeInbox, readInbox, clearInbox } from "../src/inbox.js";

let root: string;
const fixedNow = () => "2026-06-14T21:00:00.000Z";
beforeEach(() => { root = mkdtempSync(join(tmpdir(), "forge-inbox-")); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

describe("inbox", () => {
  it("writes a pending gate and reads it back", () => {
    const f = writeInbox(root, "G1", "Ready to build?", fixedNow);
    expect(existsSync(f)).toBe(true);
    const entry = readInbox(root, "G1");
    expect(entry).toEqual({
      id: "G1",
      summary: "Ready to build?",
      at: "2026-06-14T21:00:00.000Z",
      resolve: "/forge-approve G1 approve",
    });
  });
  it("returns null for a missing entry and clears existing ones", () => {
    expect(readInbox(root, "G2")).toBeNull();
    writeInbox(root, "G2", "x", fixedNow);
    clearInbox(root, "G2");
    expect(readInbox(root, "G2")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/inbox.test.ts`
Expected: FAIL — `Cannot find module '../src/inbox.js'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/inbox.ts
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { nowIso } from "./util.js";
import { forgeDir } from "./state.js";
import type { GateId } from "./types.js";

export interface InboxEntry {
  id: GateId;
  summary: string;
  at: string;
  resolve: string;
}

function inboxFile(root: string, id: GateId): string {
  return join(forgeDir(root), "inbox", `${id}.json`);
}

export function writeInbox(root: string, id: GateId, summary: string, now: () => string = nowIso): string {
  const dir = join(forgeDir(root), "inbox");
  mkdirSync(dir, { recursive: true });
  const entry: InboxEntry = { id, summary, at: now(), resolve: `/forge-approve ${id} approve` };
  const file = inboxFile(root, id);
  writeFileSync(file, JSON.stringify(entry, null, 2));
  return file;
}

export function readInbox(root: string, id: GateId): InboxEntry | null {
  const file = inboxFile(root, id);
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, "utf8")) as InboxEntry;
}

export function clearInbox(root: string, id: GateId): void {
  const file = inboxFile(root, id);
  if (existsSync(file)) rmSync(file);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/inbox.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add extensions/pi-forge/src/inbox.ts extensions/pi-forge/tests/inbox.test.ts
git commit -m "feat(pi-forge): add headless gate approval inbox"
```

---

## Task 11: `artifacts.ts` — decisions log + metrics

**Files:**
- Create: `extensions/pi-forge/src/artifacts.ts`
- Test: `extensions/pi-forge/tests/artifacts.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/artifacts.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendDecision, writeMetric, readMetrics } from "../src/artifacts.js";

let root: string;
const fixedNow = () => "2026-06-14T22:00:00.000Z";
beforeEach(() => { root = mkdtempSync(join(tmpdir(), "forge-art-")); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

describe("appendDecision", () => {
  it("appends timestamped ADR lines to decisions.md", () => {
    appendDecision(root, "Chose vitest for tests", fixedNow);
    appendDecision(root, "Picked NodeNext modules", fixedNow);
    const md = readFileSync(join(root, ".pi-forge", "decisions.md"), "utf8");
    expect(md).toContain("- 2026-06-14T22:00:00.000Z — Chose vitest for tests");
    expect(md).toContain("- 2026-06-14T22:00:00.000Z — Picked NodeNext modules");
  });
});

describe("metrics", () => {
  it("merges keys into metrics.json and reads them", () => {
    writeMetric(root, "test", { passRate: 0.97 });
    writeMetric(root, "eval", { scorecard: 0.88 });
    expect(readMetrics(root)).toEqual({ test: { passRate: 0.97 }, eval: { scorecard: 0.88 } });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/artifacts.test.ts`
Expected: FAIL — `Cannot find module '../src/artifacts.js'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/artifacts.ts
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { nowIso } from "./util.js";
import { forgeDir } from "./state.js";

export function appendDecision(root: string, text: string, now: () => string = nowIso): void {
  mkdirSync(forgeDir(root), { recursive: true });
  const file = join(forgeDir(root), "decisions.md");
  if (!existsSync(file)) writeFileSync(file, "# Decisions\n\n");
  appendFileSync(file, `- ${now()} — ${text}\n`);
}

export function readMetrics(root: string): Record<string, unknown> {
  const file = join(forgeDir(root), "metrics.json");
  if (!existsSync(file)) return {};
  return JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
}

export function writeMetric(root: string, key: string, value: unknown): void {
  mkdirSync(forgeDir(root), { recursive: true });
  const metrics = readMetrics(root);
  metrics[key] = value;
  writeFileSync(join(forgeDir(root), "metrics.json"), JSON.stringify(metrics, null, 2));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/artifacts.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add extensions/pi-forge/src/artifacts.ts extensions/pi-forge/tests/artifacts.test.ts
git commit -m "feat(pi-forge): add decisions log + metrics writers"
```

---

## Task 12: `tools.ts` — the `forge_*` tool suite

**Files:**
- Create: `extensions/pi-forge/src/tools.ts`
- Test: `extensions/pi-forge/tests/tools.test.ts`

**Design:** `buildForgeTools(deps)` returns an array of pi tool definitions. Each `execute` reads the project root from `ctx.cwd` (so tools work wherever pi runs). `deps` injects side-effects (`git`, `now`) and the notify channel list, making the suite fully testable with a fake `ctx`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/tools.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initState, saveState, loadState } from "../src/state.js";
import { buildForgeTools, type ForgeToolDeps } from "../src/tools.js";

const fixedNow = () => "2026-06-14T18:30:00.000Z";

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
    expect(r.content[0].text).toContain("intake");
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
    expect(r.content[0].text).toMatch(/gate G1 not approved/);
    expect(loadState(root).phase.current).toBe("clarify"); // unchanged
  });
});

describe("forge_gate", () => {
  it("approves a confirm gate in tui mode", async () => {
    saveState(root, { ...loadState(root), phase: { current: "clarify", status: "in_progress", enteredAt: fixedNow() } });
    const { ctx } = fakeCtx(root, "tui", { confirmReturn: true });
    const r = await tool("forge_gate").execute("id", { id: "G1", summary: "Ready?", kind: "confirm" }, undefined, undefined, ctx);
    expect(r.content[0].text).toMatch(/approved/i);
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
    expect(r.content[0].text).toMatch(/forge-approve G1/);
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
    expect(r.content[0].text).toContain("claude-opus-4-8");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/tools.test.ts`
Expected: FAIL — `Cannot find module '../src/tools.js'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/tools.ts
import { Type } from "typebox";
import { loadState, saveState } from "./state.js";
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
    select(title: string, items: string[]): Promise<string | null>;
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
  const channels = (root: string): NotifyChannel[] =>
    deps.channels ?? [terminalChannel()];

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
        await fanOut(channels(ctx.cwd), message);

        if (ctx.mode === "tui" && ctx.hasUI) {
          if (kind === "select") {
            const choice = (await ctx.ui.select(`Gate ${id}`, ["approve", "iterate"])) as Verdict | null;
            const verdict: Verdict = choice === "iterate" ? "iterate" : "approve";
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
  ];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/tools.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add extensions/pi-forge/src/tools.ts extensions/pi-forge/tests/tools.test.ts
git commit -m "feat(pi-forge): add forge_* tool suite"
```

---

## Task 13: `integration.test.ts` — full toy lifecycle, gate enforcement proven

**Files:**
- Test: `extensions/pi-forge/tests/integration.test.ts`

**This is the proof of D1.** It drives the real tools + the real `guardToolCall` through Intake→…→done, asserting that every gate blocks until approved, both G2 verdict branches work, and the iteration bound holds.

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initState, saveState, loadState } from "../src/state.js";
import { buildForgeTools, type ForgeToolDeps, type ForgeCtx } from "../src/tools.js";
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
async function callAdvance(toPhase: Phase, ctx: ForgeCtx) {
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/integration.test.ts`
Expected: FAIL — imports resolve, but assertions fail only if logic is wrong; if all prior tasks are done it should actually PASS. If you are doing this task before others, expect module-not-found. Either way, do not proceed until it is green.

- [ ] **Step 3: Implement (no new code expected)**

This task composes existing modules. If a test fails, fix the underlying module (machine/tools/guard) — do not weaken the test. Common fixes: ensure `advance` increments iteration only on `evaluate->improve`; ensure `forge_gate` select stores `verdict`.

- [ ] **Step 4: Run the FULL suite**

Run: `cd extensions/pi-forge && npm run test && npm run typecheck`
Expected: ALL test files pass; `tsc --noEmit` reports no errors.

- [ ] **Step 5: Commit**

```bash
git add extensions/pi-forge/tests/integration.test.ts
git commit -m "test(pi-forge): full lifecycle integration proving gate enforcement"
```

---

## Task 14: `index.ts` — wire the extension to pi

**Files:**
- Create: `extensions/pi-forge/index.ts`

> `index.ts` is thin glue over already-tested seams (`guardToolCall`, `buildForgeTools`). It is verified by the manual smoke test (Task 16), not by a unit test, because it requires a live `ExtensionAPI`.

- [ ] **Step 1: Write the implementation**

```ts
// index.ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { initState, saveState, loadState, statePath } from "./src/state.js";
import { recordGateDecision } from "./src/gates.js";
import { clearInbox } from "./src/inbox.js";
import { guardToolCall } from "./src/guard.js";
import { buildForgeTools } from "./src/tools.js";
import { terminalChannel } from "./src/notifier.js";
import { existsSync } from "node:fs";
import type { GateId, Verdict } from "./src/types.js";

export default function (pi: ExtensionAPI) {
  // 1. Gate enforcement: block forge_advance unless its gate is approved.
  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "forge_advance") return;
    if (!existsSync(statePath(ctx.cwd))) return;
    const state = loadState(ctx.cwd);
    return guardToolCall(state, { toolName: event.toolName, input: event.input as { toPhase?: any } });
  });

  // 2. Register the forge_* tools.
  const deps = {
    git: (msg: string) => {
      pi.exec("git", ["add", "-A"]);
      pi.exec("git", ["commit", "-m", msg]);
    },
    channels: [terminalChannel()],
  };
  for (const tool of buildForgeTools(deps)) {
    pi.registerTool(tool as Parameters<typeof pi.registerTool>[0]);
  }

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
```

- [ ] **Step 2: Typecheck**

Run: `cd extensions/pi-forge && npm run typecheck`
Expected: no errors. If `pi.registerTool` rejects the cast, confirm the parameter types against `node_modules/@earendil-works/pi-coding-agent/dist/index.d.ts` and adjust the `ForgeToolDef` shape to match (do not loosen to `any` beyond the single documented cast).

- [ ] **Step 3: Commit**

```bash
git add extensions/pi-forge/index.ts
git commit -m "feat(pi-forge): wire extension to pi (tools, gate guard, commands)"
```

---

## Task 15: `project-orchestrator` skill skeleton

**Files:**
- Create: `skills/project-orchestrator/SKILL.md`

> Minimal orchestration logic for the walking skeleton. Per-phase *work* is a stub here (write a one-line artifact); the real phase skills arrive in sub-project #2. This proves the model can drive the loop through `forge_*` tools.

- [ ] **Step 1: Write the skill**

````markdown
---
name: project-orchestrator
description: Drives a project through the pi-forge delivery lifecycle (intake → clarify → build → test → evaluate → improve → deliver). Use when starting or continuing a pi-forge project, or whenever asked to "run the project", "continue the project", or after /forge-new. Reads state via forge_status and advances phases via forge_advance, opening gates with forge_gate.
---

# Project Orchestrator

You drive a project through pi-forge's lifecycle. You NEVER edit `.pi-forge/state.json` directly — you only use the `forge_*` tools. The extension enforces gates; if `forge_advance` is blocked, open the gate.

## Loop

1. Call `forge_status` to read the current phase and gate states.
2. Do the **work for the current phase** (see table). Keep artifacts in `.pi-forge/artifacts/`.
3. Record significant choices with `forge_note`, and metrics with `forge_metric`.
4. Call `forge_advance` with the next phase. If it returns a "Cannot advance: gate …" message, call `forge_gate` for that gate, then retry `forge_advance`.
5. Repeat until phase is `done`.

## Phase → next phase

| Current | Work (skeleton) | Advance to | Gate first? |
|---|---|---|---|
| intake | Confirm project name/type; write `artifacts/charter.md` (one paragraph). | clarify | no |
| clarify | Write `artifacts/brief.md` summarising requirements + assumptions. | build | **G1** (`forge_gate G1 … confirm`) |
| build | Make the minimal change/stub; commit. | test | no |
| test | Write `artifacts/test-report.md`; `forge_metric test {...}`. | evaluate | no |
| evaluate | Write `artifacts/scorecard.md`; `forge_metric eval {...}`. | deliver **or** improve | **G2** (`forge_gate G2 … select`) — verdict picks the target |
| improve | Note fixes in `decisions.md`. | build | no |
| deliver | Write `artifacts/handover.md`. | done | **G3** (`forge_gate G3 … confirm`) |

## Gate handling

- Before advancing across a gate, call `forge_gate` with `id`, a `summary` of what you're asking the human to approve, and `kind`: `confirm` for G1/G3, `select` for G2.
- For G2, the human's verdict (`approve`|`iterate`) determines whether you advance to `deliver` or `improve`. Read it back via `forge_status` and advance to the matching phase.
- If a gate is `pending` (headless), STOP and tell the operator to run `/forge-approve <gate> <decision>`.

## Rules

- One phase at a time. Do not skip phases or fabricate approvals.
- After every advance, call `forge_checkpoint` with a short label.
- If `forge_status` shows phase `done`, report the final summary and stop.
````

- [ ] **Step 2: Verify frontmatter**

Run: `head -4 skills/project-orchestrator/SKILL.md`
Expected: shows `name: project-orchestrator` and a `description:` line (required for the skill to load in pi).

- [ ] **Step 3: Commit**

```bash
git add skills/project-orchestrator/SKILL.md
git commit -m "feat(pi-forge): add project-orchestrator skill skeleton"
```

---

## Task 16: Manual smoke-test runbook + final verification

**Files:**
- Create: `docs/RUNBOOK-pi-forge.md`

- [ ] **Step 1: Write the runbook**

````markdown
# pi-forge Foundation — Manual Smoke Test

Proves the gate mechanism end-to-end in a live pi session.

## Prerequisites
- `pi` installed: `npm i -g @earendil-works/pi-coding-agent`
- From repo root: `cd extensions/pi-forge && npm install && npm run test && npm run typecheck` (all green).

## Load the extension
Add the extension to pi settings (`~/.pi/agent/settings.json`):
```json
{ "extensions": ["<ABS_PATH>/extensions/pi-forge/index.ts"] }
```
(Replace `<ABS_PATH>` with the absolute repo path.)

## Run the toy project
```bash
mkdir -p sandbox/toy && cd sandbox/toy && git init
pi
```
In the pi TUI:
1. `/forge-new Hello World CLI` → notifies "phase: intake".
2. Ask: "Run the project using the project-orchestrator skill." (Or `/skill:project-orchestrator`.)
3. Walk the loop. At **G1**, confirm "yes". At **G2**, choose `approve`. At **G3**, confirm "yes".
4. `/forge-status` → should show `phase=done`.

## Verify
```bash
cat .pi-forge/state.json
```
Expected:
- `phase.current` = `done`
- `history` lists: clarify, build, test, evaluate, deliver, done
- `gates.G1.status` = approved, `gates.G2.verdict` = approve, `gates.G3.status` = approved
- `.pi-forge/checkpoints/` contains numbered snapshots
- `git log` shows the `forge: advance …` commits

## Gate-block proof (negative test)
Start a fresh `sandbox/toy2`, `/forge-new X`, advance to `clarify`, then ask the agent to advance straight to `build` WITHOUT approving G1. The `forge_advance` tool call must be **blocked** with "gate G1 not approved". This is the core guarantee.
````

- [ ] **Step 2: Run the full automated suite one final time**

Run: `cd extensions/pi-forge && npm run test && npm run typecheck`
Expected: all test files PASS; typecheck clean.

- [ ] **Step 3: Execute the manual smoke test**

Follow `docs/RUNBOOK-pi-forge.md`. Confirm `phase=done` and the gate-block negative test. Record the result.

- [ ] **Step 4: Commit**

```bash
git add docs/RUNBOOK-pi-forge.md
git commit -m "docs(pi-forge): add Foundation smoke-test runbook"
```

- [ ] **Step 5: Update README**

Add a "pi-forge" section to the repo `README.md` pointing at the spec, this plan, and the runbook. Commit:
```bash
git add README.md
git commit -m "docs: point README at pi-forge spec, plan, and runbook"
```

---

## Self-review (completed by plan author)

**Spec coverage (Foundation scope only — sub-project #1 of §14):**
- §5 state machine → Tasks 2, 5 (transitions, canAdvance, advance) ✅
- §5.2/§5.3 gates + code-enforced blocking → Tasks 6, 7, 12 (`guardToolCall`, `forge_gate`) ✅
- §6 `.pi-forge/` layer (state.json, config.json, metrics.json, decisions.md, checkpoints, inbox) → Tasks 3, 4, 8, 10, 11 ✅
- §7 extension (tools, commands, `tool_call` guard, `pi.exec` git) → Tasks 12, 14 ✅
- §7.4 mode-awareness (tui vs headless inbox) → Task 12 `forge_gate` + Task 13 ✅
- §9.1 routing (policy read; full enforcement is sub-project #5) → Task 3 `routeFor`, Task 12 `forge_route` ✅
- §9.2 notifications (terminal; webhook/email are sub-project #4) → Task 9 ✅
- project-orchestrator skill → Task 15 ✅
- End-to-end proof → Tasks 13 (automated) + 16 (manual) ✅
- *Deferred by design (not Foundation):* webhook/email channels (#4), self-reflector/memory (#5), cxas-wrapper (#3), full phase skills (#2), prod-deployer (#6). Noted, not gaps.

**Placeholder scan:** No "TBD/TODO/implement later". Every code step shows complete code; every test step shows complete tests. ✅

**Type consistency:** `ForgeState`, `GateRecord`, `GateId`, `Phase`, `Verdict`, `TransitionDef` defined once in `types.ts` and imported everywhere. Tool result shape (`{content:[{type,text}],details?,isError?}`) consistent across `tools.ts` and its tests. `ForgeCtx`/`ForgeToolDeps`/`ForgeToolDef` defined in `tools.ts` and reused in `tests/tools.test.ts` and `tests/integration.test.ts`. `now` injection (`() => string`) consistent across all modules. ✅
```
