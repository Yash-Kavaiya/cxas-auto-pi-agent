# pi-forge #2 — Phase Skills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the orchestrator's skeleton phase-stubs with six real general-path phase skills (clarifier, planner, tdd-builder, tester, evaluator, improver), add a `forge_artifact` tool, and add structural skill-lint conformance tests.

**Architecture:** Markdown `SKILL.md` files under `skills/` drive each phase; they act only through the existing `forge_*` tools and write artifacts under `.pi-forge/artifacts/`. One small extension addition (`forge_artifact` + a `setArtifact` state helper) lets skills register artifact pointers. A pure `lintSkill()` helper + a vitest conformance test enforce skill structure in CI.

**Tech Stack:** TypeScript (ESM, NodeNext), typebox, vitest — same `extensions/pi-forge` package as Foundation. Markdown skills at repo-root `skills/`.

**Reference spec:** [docs/superpowers/specs/2026-06-15-pi-forge-phase-skills-design.md](../specs/2026-06-15-pi-forge-phase-skills-design.md).

**Build order note:** Code tasks (1–3, 11) are TDD. Markdown skill tasks (4–10) are content; their verification is the conformance test in Task 11 (which must run after all skills exist).

---

## Task 1: `setArtifact` state helper

**Files:**
- Modify: `extensions/pi-forge/src/state.ts`
- Test: `extensions/pi-forge/tests/state.test.ts`

- [ ] **Step 1: Add the failing test** (append inside `tests/state.test.ts`)

```ts
describe("setArtifact", () => {
  it("registers an artifact pointer immutably", async () => {
    const { setArtifact } = await import("../src/state.js");
    const s = initState({ name: "T" }, fixedNow);
    const next = setArtifact(s, "brief", "artifacts/brief.md");
    expect(s.artifacts).toEqual({}); // original unchanged
    expect(next.artifacts).toEqual({ brief: "artifacts/brief.md" });
  });
});
```

- [ ] **Step 2: Run it, watch it fail**

Run: `cd extensions/pi-forge && npx vitest run tests/state.test.ts`
Expected: FAIL — `setArtifact is not a function`.

- [ ] **Step 3: Implement** (append to `src/state.ts`)

```ts
export function setArtifact(state: ForgeState, key: string, path: string): ForgeState {
  const next = structuredClone(state);
  next.artifacts[key] = path;
  return next;
}
```

- [ ] **Step 4: Run it, watch it pass**

Run: `cd extensions/pi-forge && npx vitest run tests/state.test.ts` → PASS. Then `npm run typecheck` → clean.

- [ ] **Step 5: Commit**

```bash
git add extensions/pi-forge/src/state.ts extensions/pi-forge/tests/state.test.ts
git commit -m "feat(pi-forge): add setArtifact state helper"
```

---

## Task 2: `forge_artifact` tool

**Files:**
- Modify: `extensions/pi-forge/src/tools.ts`
- Test: `extensions/pi-forge/tests/tools.test.ts`

- [ ] **Step 1: Add the failing test** (append inside `tests/tools.test.ts`, in a new describe)

```ts
describe("forge_artifact", () => {
  it("registers an artifact pointer in state", async () => {
    const { ctx } = fakeCtx(root, "tui");
    const r = await tool("forge_artifact").execute("id", { key: "brief", path: "artifacts/brief.md" }, undefined, undefined, ctx);
    expect(r.isError).toBeUndefined();
    expect(loadState(root).artifacts).toEqual({ brief: "artifacts/brief.md" });
  });
});
```

- [ ] **Step 2: Run it, watch it fail**

Run: `cd extensions/pi-forge && npx vitest run tests/tools.test.ts`
Expected: FAIL — `tool forge_artifact not found`.

- [ ] **Step 3: Implement** — in `src/tools.ts`, add `setArtifact` to the state import and add the tool to the array returned by `buildForgeTools` (after `forge_route`):

Change the state import line to include `setArtifact`:
```ts
import { loadState, saveState, setArtifact } from "./state.js";
```
Add this tool object to the returned array (after the `forge_route` entry):
```ts
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
```

- [ ] **Step 4: Run it, watch it pass**

Run: `cd extensions/pi-forge && npx vitest run tests/tools.test.ts` → PASS. Then `npm run test && npm run typecheck` → all green, clean. (`index.ts` needs no change — it registers every tool from `buildForgeTools`.)

- [ ] **Step 5: Commit**

```bash
git add extensions/pi-forge/src/tools.ts extensions/pi-forge/tests/tools.test.ts
git commit -m "feat(pi-forge): add forge_artifact tool"
```

---

## Task 3: `skilllint.ts` helper + unit tests

**Files:**
- Create: `extensions/pi-forge/src/skilllint.ts`
- Test: `extensions/pi-forge/tests/skilllint.test.ts`

- [ ] **Step 1: Write the failing test** at `tests/skilllint.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { lintSkill } from "../src/skilllint.js";

const good = `---
name: demo-skill
description: A valid demo skill that references forge_advance and writes artifacts/brief.md.
---

# Demo

Use forge_status then forge_advance. Write artifacts/brief.md.
`;

describe("lintSkill", () => {
  it("passes a well-formed skill", () => {
    expect(lintSkill("demo-skill", good)).toEqual([]);
  });
  it("flags missing frontmatter", () => {
    expect(lintSkill("x", "# no frontmatter")).toContain("missing YAML frontmatter");
  });
  it("flags a name mismatch", () => {
    const out = lintSkill("other-name", good);
    expect(out.some((p) => /name/.test(p))).toBe(true);
  });
  it("flags an empty description", () => {
    const c = `---\nname: demo-skill\ndescription:\n---\n\nbody`;
    expect(lintSkill("demo-skill", c).some((p) => /description/.test(p))).toBe(true);
  });
  it("flags an over-long description", () => {
    const long = "d".repeat(1025);
    const c = `---\nname: demo-skill\ndescription: ${long}\n---\n\nbody forge_advance`;
    expect(lintSkill("demo-skill", c).some((p) => /1024/.test(p))).toBe(true);
  });
  it("flags an unknown forge_ tool reference", () => {
    const c = `---\nname: demo-skill\ndescription: ok\n---\n\nuse forge_teleport now`;
    expect(lintSkill("demo-skill", c).some((p) => /forge_teleport/.test(p))).toBe(true);
  });
  it("flags a traversal in an artifact path", () => {
    const c = `---\nname: demo-skill\ndescription: ok\n---\n\nwrite artifacts/../secret`;
    expect(lintSkill("demo-skill", c).some((p) => /artifact path/.test(p))).toBe(true);
  });
});
```

- [ ] **Step 2: Run it, watch it fail**

Run: `cd extensions/pi-forge && npx vitest run tests/skilllint.test.ts`
Expected: FAIL — `Cannot find module '../src/skilllint.js'`.

- [ ] **Step 3: Implement** at `src/skilllint.ts`

```ts
const ALLOWED_FORGE_TOOLS = new Set([
  "forge_status",
  "forge_advance",
  "forge_gate",
  "forge_checkpoint",
  "forge_note",
  "forge_metric",
  "forge_route",
  "forge_artifact",
]);

/**
 * Structural lint for a SKILL.md. Returns a list of problems (empty = clean).
 * Validates frontmatter (name/description), name match + format, and that the
 * body references only real forge_* tools and well-formed artifact paths.
 */
export function lintSkill(expectedName: string, content: string): string[] {
  const problems: string[] = [];

  const fm = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) {
    problems.push("missing YAML frontmatter");
    return problems;
  }
  const block = fm[1] ?? "";
  const body = content.slice(fm[0].length);

  const nameMatch = block.match(/^name:[ \t]*(.*)$/m);
  const name = nameMatch?.[1]?.trim() ?? "";
  if (!name) {
    problems.push("frontmatter: missing name");
  } else {
    if (name !== expectedName) problems.push(`frontmatter: name '${name}' != directory '${expectedName}'`);
    if (!/^[a-z0-9-]{1,64}$/.test(name)) problems.push(`frontmatter: name '${name}' must be lowercase/hyphen, <=64 chars`);
  }

  const descMatch = block.match(/^description:[ \t]*(.*)$/m);
  const desc = descMatch?.[1]?.trim() ?? "";
  if (!desc) {
    problems.push("frontmatter: missing description");
  } else if (desc.length > 1024) {
    problems.push(`frontmatter: description exceeds 1024 chars (${desc.length})`);
  }

  for (const m of body.matchAll(/\bforge_[a-z_]+/g)) {
    const tool = m[0];
    if (!ALLOWED_FORGE_TOOLS.has(tool)) {
      problems.push(`body: references unknown tool '${tool}'`);
    }
  }

  for (const m of body.matchAll(/artifacts\/[^\s)`'"]*/g)) {
    const path = m[0];
    if (path.includes("..") || path.includes("//")) {
      problems.push(`body: malformed artifact path '${path}'`);
    }
  }

  // de-duplicate
  return [...new Set(problems)];
}
```

- [ ] **Step 4: Run it, watch it pass**

Run: `cd extensions/pi-forge && npx vitest run tests/skilllint.test.ts` → PASS (7 tests). Then `npm run typecheck` → clean.

- [ ] **Step 5: Commit**

```bash
git add extensions/pi-forge/src/skilllint.ts extensions/pi-forge/tests/skilllint.test.ts
git commit -m "feat(pi-forge): add skilllint structural validator"
```

---

## Task 4: requirements-clarifier skill

**Files:** Create `skills/requirements-clarifier/SKILL.md`

- [ ] **Step 1: Write the file**

````markdown
---
name: requirements-clarifier
description: Clarify-phase skill for pi-forge. Use during the Clarify phase to turn a raw request into a high-quality Project Brief. Scans for ambiguity across functional, non-functional, integration, data, user, edge-case, metric, and scope dimensions, asks batched categorized questions, and writes artifacts/brief.md + brief.json.
---

# Requirements Clarifier (Clarify phase)

Turn the raw request into a high-quality Project Brief. Drive transitions only through forge_* tools; never edit state.json directly.

## Steps
1. Read the raw request / `artifacts/charter.md`.
2. Scan for ambiguity across: functional; non-functional (performance, security, scalability, compliance); integrations; data; users/personas; edge cases; success metrics/KPIs; scope boundaries; technical constraints/preferences.
3. Ask the human **batched, categorized** questions (not a flood — group by category). Loop until the answers are clear or the user says "proceed with these assumptions."
4. Write `artifacts/brief.md` (human-readable) and `artifacts/brief.json` (machine-readable) containing: clarified requirements; MoSCoW prioritization; user stories / acceptance criteria; assumptions & open risks; recommended tech stack + rationale; high-level architecture sketch; eval criteria for later phases.
5. Register both: `forge_artifact brief artifacts/brief.json` and `forge_artifact brief_md artifacts/brief.md`.
6. Record key assumptions with `forge_note`.
7. Tell the orchestrator the brief is ready. The orchestrator opens **G1** (forge_gate) — do not advance yourself.

## Rules
- Batch questions; don't overwhelm.
- Capture every assumption explicitly in the brief.
- One phase only: produce the brief and stop. Do not start building.
````

- [ ] **Step 2: Self-check**

Confirm frontmatter has `name: requirements-clarifier` and a `description`; body references only `forge_*` tools from the allowed set. (Definitive check is Task 11.)

- [ ] **Step 3: Commit**

```bash
git add skills/requirements-clarifier/SKILL.md
git commit -m "feat(pi-forge): add requirements-clarifier skill"
```

---

## Task 5: project-planner skill

**Files:** Create `skills/project-planner/SKILL.md`

- [ ] **Step 1: Write the file**

````markdown
---
name: project-planner
description: First Build-phase skill for pi-forge. Use at the start of the Build phase to turn the approved brief into an executable plan. Reads artifacts/brief.json and writes artifacts/plan.md with the approach, module/feature breakdown (WBS), build sequence, and stack rationale.
---

# Project Planner (Build phase, step 1)

Turn the approved brief into an executable plan. Run before tdd-builder. Drive transitions only through forge_* tools.

## Steps
1. Read `artifacts/brief.json` (clarified requirements + acceptance criteria).
2. Write `artifacts/plan.md` containing: the chosen approach; a module/feature breakdown (WBS) with a build sequence; which acceptance criteria each module satisfies; and the stack choice with rationale (consistent with the brief's recommendation).
3. Register it: `forge_artifact plan artifacts/plan.md`.
4. Record any significant design decision with `forge_note`.
5. Return control to the orchestrator (which will run tdd-builder next). Do not advance the phase yourself.

## Rules
- The brief owns *what/why*; the plan owns *how*. Don't re-litigate requirements — if the brief is ambiguous, note it and proceed with a stated assumption.
- Keep modules small and independently testable.
````

- [ ] **Step 2: Self-check** — frontmatter + allowed tool references.

- [ ] **Step 3: Commit**

```bash
git add skills/project-planner/SKILL.md
git commit -m "feat(pi-forge): add project-planner skill"
```

---

## Task 6: tdd-builder skill

**Files:** Create `skills/tdd-builder/SKILL.md`

- [ ] **Step 1: Write the file**

````markdown
---
name: tdd-builder
description: Second Build-phase skill for pi-forge. Use to implement the plan with strict test-first discipline by delegating to superpowers:test-driven-development. Reads artifacts/plan.md and brief.json, implements each acceptance criterion red-green-refactor, and makes conventional commits.
---

# TDD Builder (Build phase, step 2)

Implement the plan with test-first discipline. Drive transitions only through forge_* tools.

## Steps
1. Read `artifacts/plan.md` and `artifacts/brief.json`.
2. For each acceptance criterion / feature in build-sequence order, **invoke the `superpowers:test-driven-development` skill** and follow it: write the failing test, watch it fail, implement minimally, watch it pass, refactor.
3. Make a conventional commit per coherent change.
4. Record significant implementation decisions with `forge_note`.
5. When all planned features are implemented and their tests pass, return control to the orchestrator (which advances to the Test phase). Do not advance yourself.

## Rules
- If `superpowers:test-driven-development` is unavailable in this environment, say so explicitly and fall back to manual test-first: write the failing test, see it fail, implement, see it pass. **Never silently skip tests.**
- Support greenfield and brownfield: in existing code, follow established patterns; only refactor what serves the task.
- Keep files focused; one clear responsibility each.
````

- [ ] **Step 2: Self-check** — frontmatter + allowed tool references.

- [ ] **Step 3: Commit**

```bash
git add skills/tdd-builder/SKILL.md
git commit -m "feat(pi-forge): add tdd-builder skill"
```

---

## Task 7: tester skill

**Files:** Create `skills/tester/SKILL.md`

- [ ] **Step 1: Write the file**

````markdown
---
name: tester
description: Test-phase skill for pi-forge. Use during the Test phase to run the project's test suites (unit, integration, contract, E2E for the general path), capture results and coverage, write artifacts/test-report.md, and record metrics via forge_metric.
---

# Tester (Test phase)

Run the project's tests and report results. General path only (CXAS evals are handled elsewhere). Drive transitions only through forge_* tools.

## Steps
1. Identify and run the available test layers: unit, integration, contract, and end-to-end (e.g. Playwright for UIs). Capture pass/fail counts and coverage where the tooling provides it.
2. Write `artifacts/test-report.md` summarizing what ran, results, failures (with the actual output), and coverage.
3. Record metrics: `forge_metric test {"passRate": <0..1>, "coverage": <0..1 or null>, "suites": {...}}`.
4. Register the report: `forge_artifact test_report artifacts/test-report.md`.
5. Return control to the orchestrator (which advances to Evaluate). Do not advance yourself.

## Rules
- Report failures honestly with the real output; do not claim green without evidence.
- If a layer doesn't exist for this project, say so in the report rather than fabricating it.
````

- [ ] **Step 2: Self-check** — frontmatter + allowed tool references.

- [ ] **Step 3: Commit**

```bash
git add skills/tester/SKILL.md
git commit -m "feat(pi-forge): add tester skill"
```

---

## Task 8: evaluator skill

**Files:** Create `skills/evaluator/SKILL.md`

- [ ] **Step 1: Write the file**

````markdown
---
name: evaluator
description: Evaluate-phase skill for pi-forge. Use during the Evaluate phase to make a holistic, freeform judgment of the work against the brief, write artifacts/scorecard.md with an approve|iterate recommendation plus justification and risks, and record the verdict via forge_metric to inform the G2 gate.
---

# Evaluator (Evaluate phase)

Make a holistic judgment of the work. The output recommendation informs the human's G2 decision. Drive transitions only through forge_* tools.

## Steps
1. Read `artifacts/brief.json` (acceptance + eval criteria), `artifacts/test-report.md`, `metrics.json`, and the implemented code/diff.
2. Judge holistically across: correctness; alignment to the brief; code quality; security; maintainability; UX (if applicable); estimated cost. Use the quantitative inputs (test pass rate, coverage) as evidence, but the verdict is qualitative.
3. Write `artifacts/scorecard.md` with: a clear **recommendation — `approve` or `iterate`**; a justification; and the top risks/gaps. If `iterate`, list the specific things to fix.
4. Record it: `forge_metric eval {"recommendation": "approve|iterate", "summary": "<one line>"}` and `forge_artifact scorecard artifacts/scorecard.md`.
5. Return control to the orchestrator, which opens **G2** (forge_gate, select). The human's verdict — guided by your recommendation — routes to deliver (approve) or improve (iterate). Do not advance yourself.

## Rules
- Be specific and honest: tie every judgment to evidence in the brief, the report, or the code.
- The recommendation is advisory; the human's G2 verdict is authoritative.
````

- [ ] **Step 2: Self-check** — frontmatter + allowed tool references.

- [ ] **Step 3: Commit**

```bash
git add skills/evaluator/SKILL.md
git commit -m "feat(pi-forge): add evaluator skill"
```

---

## Task 9: improver skill

**Files:** Create `skills/improver/SKILL.md`

- [ ] **Step 1: Write the file**

````markdown
---
name: improver
description: Improve-phase skill for pi-forge. Use during the Improve phase after an iterate verdict to root-cause the scorecard findings, write a prioritized artifacts/backlog.md, and hand back so the orchestrator re-enters the Build phase (bounded by maxIterations).
---

# Improver (Improve phase)

Turn an iterate verdict into a prioritized plan of fixes. Drive transitions only through forge_* tools.

## Steps
1. Read `artifacts/scorecard.md`, any human feedback, and `decisions.md`.
2. Do root-cause analysis on the findings — why did each gap occur?
3. Write `artifacts/backlog.md`: a prioritized list of fixes/enhancements, highest-impact first, each with the root cause and the acceptance check that will prove it fixed.
4. Register it: `forge_artifact backlog artifacts/backlog.md`. Record the chosen focus with `forge_note`.
5. Return control to the orchestrator, which advances Improve→Build to re-enter the build loop (the extension enforces the maxIterations bound). Do not advance yourself.

## Rules
- Prioritize ruthlessly; address the evaluator's top risks first.
- Each backlog item must be concrete enough that tdd-builder can pick it up directly.
````

- [ ] **Step 2: Self-check** — frontmatter + allowed tool references.

- [ ] **Step 3: Commit**

```bash
git add skills/improver/SKILL.md
git commit -m "feat(pi-forge): add improver skill"
```

---

## Task 10: update project-orchestrator skill

**Files:** Modify `skills/project-orchestrator/SKILL.md`

- [ ] **Step 1: Replace the "Phase → next phase" table and surrounding guidance** so the orchestrator dispatches the real skills. Replace the existing table section with:

````markdown
## Phase → skill(s) → next phase

| Current | Run skill(s) | Advance to | Gate first? |
|---|---|---|---|
| intake | (orchestrator) confirm name/type; write `artifacts/charter.md` | clarify | no |
| clarify | `requirements-clarifier` | build | **G1** (`forge_gate G1 … confirm`) |
| build | `project-planner`, then `tdd-builder` | test | no |
| test | `tester` | evaluate | no |
| evaluate | `evaluator` | deliver **or** improve | **G2** (`forge_gate G2 … select`) — verdict picks the target |
| improve | `improver` | build | no |
| deliver | (skeleton stub until #6) write `artifacts/handover.md` | done | **G3** (`forge_gate G3 … confirm`) |

For each phase: load the listed skill(s) (e.g. `/skill:requirements-clarifier`) and let them do the work; they write artifacts and register them with `forge_artifact`. Then call `forge_advance`; if it reports a gate is required, call `forge_gate` and retry.

For **evaluate**: after `evaluator` writes the scorecard, open **G2**. The human's verdict (`approve`|`iterate`), informed by the evaluator's recommendation, determines whether you `forge_advance` to `deliver` or `improve` — read it back with `forge_status`.
````

Keep the existing **Loop**, **Gate handling**, and **Rules** sections; only the phase table/dispatch guidance changes. Ensure the body still references only allowed `forge_*` tools (now including `forge_artifact`).

- [ ] **Step 2: Self-check** — frontmatter unchanged & valid; body references only allowed tools.

- [ ] **Step 3: Commit**

```bash
git add skills/project-orchestrator/SKILL.md
git commit -m "feat(pi-forge): orchestrator dispatches real phase skills"
```

---

## Task 11: skills conformance test

**Files:** Create `extensions/pi-forge/tests/skills.test.ts`

- [ ] **Step 1: Write the test** (this is a conformance test over real files; it should PASS once all skills from Tasks 4–10 exist)

```ts
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { lintSkill } from "../src/skilllint.js";

const here = dirname(fileURLToPath(import.meta.url));
const skillsDir = resolve(here, "..", "..", "..", "skills");

const skillNames = readdirSync(skillsDir).filter((d) =>
  existsSync(join(skillsDir, d, "SKILL.md")),
);

describe("skill conformance", () => {
  it("includes all expected skills", () => {
    expect(skillNames.sort()).toEqual([
      "evaluator",
      "improver",
      "project-orchestrator",
      "project-planner",
      "requirements-clarifier",
      "tdd-builder",
      "tester",
    ]);
  });

  for (const name of skillNames) {
    it(`${name}/SKILL.md passes lint`, () => {
      const content = readFileSync(join(skillsDir, name, "SKILL.md"), "utf8");
      expect(lintSkill(name, content)).toEqual([]);
    });
  }
});
```

- [ ] **Step 2: Run it**

Run: `cd extensions/pi-forge && npx vitest run tests/skills.test.ts`
Expected: PASS — the expected-set check + one passing lint per skill (8 assertions). If any skill fails lint, FIX THE SKILL (not the test) until clean.

- [ ] **Step 3: Full suite + typecheck**

Run: `cd extensions/pi-forge && npm run test && npm run typecheck`
Expected: all green; typecheck clean.

- [ ] **Step 4: Commit**

```bash
git add extensions/pi-forge/tests/skills.test.ts
git commit -m "test(pi-forge): skill structural conformance over all SKILL.md"
```

---

## Task 12: runbook update + final verification

**Files:** Modify `docs/RUNBOOK-pi-forge.md`

- [ ] **Step 1: Update the runbook** so the live walkthrough exercises the real skills. Replace the "Run the toy project" step 2 line with guidance that the orchestrator now dispatches real skills, and add an expectation that artifacts appear:

Add to the **Verify** section:
```markdown
- `.pi-forge/artifacts/` contains: `brief.md`/`brief.json` (clarify), `plan.md` (build),
  `test-report.md` (test), `scorecard.md` (evaluate); and on an iterate loop, `backlog.md`.
- `state.json` `artifacts` map has pointers registered via forge_artifact.
```

- [ ] **Step 2: Final full verification**

Run: `cd extensions/pi-forge && npm run test && npm run typecheck`
Expected: all green; typecheck clean.

- [ ] **Step 3: Commit**

```bash
git add docs/RUNBOOK-pi-forge.md
git commit -m "docs(pi-forge): runbook covers real phase skills + artifacts"
```

---

## Self-review (plan author)

**Spec coverage:** clarifier (T4), planner (T5), tdd-builder (T6), tester (T7), evaluator (T8), improver (T9), orchestrator update (T10), forge_artifact + setArtifact (T1–T2), skilllint + conformance (T3, T11), runbook (T12). All §3–§8 items covered. Deliver stub unchanged (correct, →#6); CXAS evals absent (correct, →#3).

**Placeholder scan:** every code step has complete code; every skill task has a complete `SKILL.md` body. No TBD/TODO.

**Type/name consistency:** `setArtifact` (T1) is imported and used by `forge_artifact` (T2). `lintSkill(name, content)` signature consistent across T3 and T11. The conformance expected-set (T11) exactly matches the seven skill directory names created/updated in T4–T10. Allowed `forge_*` set in `skilllint.ts` (T3) includes `forge_artifact` (added T2) so skills referencing it pass.

**Order:** code helpers (T1–T3) before skills reference them conceptually; conformance test (T11) after all skills exist; runbook last.
