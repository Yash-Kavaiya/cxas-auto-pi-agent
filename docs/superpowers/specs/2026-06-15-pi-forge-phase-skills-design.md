# pi-forge #2 — Phase Skills

**Design specification (sub-project #2 of 6)**

| | |
|---|---|
| **Status** | Draft — pending user review |
| **Date** | 2026-06-15 |
| **Author** | Yash Kavaiya + Claude |
| **Builds on** | Foundation (#1, merged) — see [platform design](2026-06-14-pi-forge-platform-design.md) §8 |
| **Next step** | `writing-plans` → subagent-driven implementation |

---

## 1. Context

The Foundation (#1) shipped the deterministic state machine: the `pi-forge` extension (state machine + code-enforced gates + checkpoints + notifier + the `forge_*` tools + four operator commands) and a **skeleton** `project-orchestrator` skill whose per-phase work is one-line stubs.

Sub-project #2 replaces those stubs with the six real **phase skills** so the pipeline actually clarifies, plans, builds, tests, evaluates, and improves a project. This is the **general path** only — CXAS-specific evaluation/lint (via `cxas-wrapper`) is sub-project #3, and `prod-deployer` (the Deliver phase) is sub-project #6, so **Deliver remains the skeleton stub** this round.

Everything the skills need already exists: the `forge_*` tools, the `.pi-forge/` state/artifacts/checkpoints layer, and the gate mechanism. Skills write artifact files with pi's native Write tool and drive transitions only through `forge_*` tools.

## 2. Decision log (#2 brainstorming)

| # | Decision | Choice |
|---|---|---|
| D2.1 | tdd-builder test discipline | **Delegate to `superpowers:test-driven-development`** (DRY, consistent, battle-tested) |
| D2.2 | Clarifier interaction | **Conversational batched Q&A**; the existing **G1** gate is the formal approval |
| D2.3 | Evaluator verdict | **Freeform LLM judgment** — holistic `approve`\|`iterate` recommendation + justification + risks; no fixed numeric rubric |
| D2.4 | Skill verification | **Structural/lint tests per skill** (vitest) + **manual runbook** |

## 3. Phase → skill mapping

| Phase | Skill(s), in order | Artifact(s) | Then |
|---|---|---|---|
| clarify | requirements-clarifier | `artifacts/brief.md`, `artifacts/brief.json` | orchestrator opens **G1** → build |
| build | project-planner → tdd-builder | `artifacts/plan.md`; source + tests + commits | → test |
| test | tester | `artifacts/test-report.md` (+ `forge_metric test`) | → evaluate |
| evaluate | evaluator | `artifacts/scorecard.md` (+ `forge_metric eval`) | orchestrator opens **G2** (select) → deliver \| improve |
| improve | improver | `artifacts/backlog.md` (+ `forge_note`) | → build (bounded by `maxIterations`) |
| deliver | *(skeleton stub until #6)* | `artifacts/handover.md` (stub) | opens **G3** → done |

A phase may use more than one skill (Build = planner then tdd-builder). The orchestrator sequences them.

## 4. Skill contracts

Each skill is `skills/<name>/SKILL.md` with YAML frontmatter (`name` = directory name, lowercase/hyphen ≤64; `description` ≤1024) and a body that the model follows. **Rules common to all phase skills:** never edit `.pi-forge/state.json` directly; write artifacts under `.pi-forge/artifacts/` via Write; register each artifact with `forge_artifact`; record significant decisions with `forge_note` and metrics with `forge_metric`; do the work for the **current** phase only and return control to the orchestrator (which performs `forge_advance`).

### 4.1 requirements-clarifier (Clarify)
- **Reads:** the raw request / charter (`artifacts/charter.md`).
- **Does:** scans for ambiguity across categories — functional, non-functional (performance, security, scalability, compliance), integrations, data, users/personas, edge cases, success metrics/KPIs, scope boundaries, technical constraints. Asks **batched, categorized questions conversationally**, looping until a confidence threshold is met or the user says "proceed with these assumptions."
- **Writes:** `artifacts/brief.md` + `artifacts/brief.json` — clarified requirements, MoSCoW prioritization, user stories / acceptance criteria, assumptions & open risks, recommended stack + rationale, high-level architecture sketch, and eval criteria for later phases.
- **Then:** signals readiness; the orchestrator opens **G1**.

### 4.2 project-planner (Build, step 1)
- **Reads:** `brief.json`.
- **Writes:** `artifacts/plan.md` — approach, module/feature breakdown (WBS), build sequence, stack choices with rationale, and which acceptance criteria each module satisfies.

### 4.3 tdd-builder (Build, step 2)
- **Reads:** `plan.md`, `brief.json`.
- **Does:** for each acceptance criterion / feature, **invokes `superpowers:test-driven-development`** (red → green → refactor). Conventional commits. `forge_note` on significant decisions. Works greenfield **and** brownfield (follow existing patterns).
- **Note:** if `superpowers:test-driven-development` is unavailable in the environment, the skill says so and falls back to explicit test-first instructions inline (documented in the skill body) — it must not silently skip tests.

### 4.4 tester (Test)
- **Does:** runs unit / integration / contract / E2E suites (general path; CXAS evals come in #3). Captures pass/fail, coverage where available.
- **Writes:** `artifacts/test-report.md`; records `forge_metric test {passRate, coverage, suites}`.

### 4.5 evaluator (Evaluate)
- **Reads:** `brief.json` (acceptance + eval criteria), `test-report.md`, `metrics.json`, the diff/code.
- **Does:** a **holistic, freeform judgment** across correctness, alignment-to-brief, code quality, security, maintainability, UX (if applicable), and estimated cost. Pulls quantitative inputs (test pass rate, coverage) into the reasoning but the verdict is qualitative.
- **Writes:** `artifacts/scorecard.md` containing a clear **recommendation (`approve` | `iterate`)**, a justification, and the top risks/gaps. Records `forge_metric eval {recommendation, summary}`.
- **Then:** the orchestrator opens **G2** (select); the human's verdict — informed by the recommendation — routes to `deliver` (approve) or `improve` (iterate).

### 4.6 improver (Improve)
- **Reads:** `scorecard.md`, human feedback, `decisions.md`.
- **Does:** root-cause analysis → prioritized fix/enhancement backlog.
- **Writes:** `artifacts/backlog.md`; `forge_note` on the chosen focus.
- **Then:** orchestrator advances improve→build (the extension enforces the `maxIterations` bound).

## 5. Extension addition: `forge_artifact`

A small tool added to `tools.ts` (and registered in `index.ts`), matching the existing `forge_*` style:

- **`forge_artifact(key, path)`** → sets `state.artifacts[key] = path` and saves. Lets `forge_status` and resume see what each phase produced.
- Pure-logic seam: a `setArtifact(state, key, path)` immutable helper (in `state.ts` or `artifacts.ts`) is unit-tested; the tool wraps it with `loadState`/`saveState`.
- Schema: `Type.Object({ key: Type.String(), path: Type.String() })`.

This is the only runtime code change in #2; everything else is Markdown skills + tests.

## 6. Skill verification (D2.4)

- **`src/skilllint.ts`** — a pure `lintSkill(name, content): string[]` returning a list of problems (empty = clean). Checks:
  1. valid YAML frontmatter with `name` and `description`;
  2. `name` matches the expected (directory) name and is lowercase/hyphen, ≤64 chars;
  3. `description` non-empty, ≤1024 chars;
  4. the body references **only real** `forge_*` tool names (allowed set: `forge_status`, `forge_advance`, `forge_gate`, `forge_checkpoint`, `forge_note`, `forge_metric`, `forge_route`, `forge_artifact`) — any `forge_<x>` token outside this set is flagged;
  5. any `artifacts/...` path mentioned is well-formed (no leading slash / traversal).
- **`tests/skilllint.test.ts`** — unit tests for `lintSkill` (good frontmatter passes; missing description fails; unknown `forge_zzz` reference fails; over-length description fails).
- **`tests/skills.test.ts`** — discovers every `skills/*/SKILL.md` (the 6 new + `project-orchestrator`), runs `lintSkill`, and asserts **zero problems** for each. This is CI-enforced structural conformance without faking model behavior.
- **Runbook** (`docs/RUNBOOK-pi-forge.md`) updated so the live walkthrough exercises the real skills end-to-end (clarify produces a brief, build plans+implements, etc.).

## 7. Orchestrator update

`skills/project-orchestrator/SKILL.md` is updated to dispatch the real skills (replacing the skeleton stubs): Build = `project-planner` then `tdd-builder`; Evaluate reads the evaluator's recommendation to drive the **G2** verdict; Deliver remains the stub. The loop, gate handling, and "never edit state.json directly" rules are unchanged.

## 8. File structure (what #2 creates / changes)

```
skills/
  requirements-clarifier/SKILL.md   (new)
  project-planner/SKILL.md          (new)
  tdd-builder/SKILL.md              (new)
  tester/SKILL.md                   (new)
  evaluator/SKILL.md                (new)
  improver/SKILL.md                 (new)
  project-orchestrator/SKILL.md     (updated)
extensions/pi-forge/
  src/artifacts.ts or state.ts      (add setArtifact)
  src/tools.ts                      (add forge_artifact tool)
  src/skilllint.ts                  (new)
  index.ts                          (no change needed beyond tool auto-registration)
  tests/artifacts.test.ts|state.test.ts (add setArtifact test)
  tests/tools.test.ts               (add forge_artifact test)
  tests/skilllint.test.ts           (new)
  tests/skills.test.ts              (new)
docs/RUNBOOK-pi-forge.md            (updated)
```

## 9. Out of scope (deferred)

- CXAS evaluation/lint via `cxas-wrapper` → **#3**.
- `prod-deployer` / real Deliver phase → **#6**.
- `self-reflector`, long-term memory, routing **enforcement** → **#5**.
- Behavioral simulation of skill execution (we verify structure, not model output) — intentional per D2.4.

## 10. Risks

| Risk | Mitigation |
|---|---|
| Markdown skills can't be unit-tested for behavior | Structural lint + conformance tests catch malformed/incorrect-reference skills; live runbook covers behavior. |
| Skill references a `forge_*` tool that doesn't exist | `lintSkill` rule 4 fails the build. |
| tdd-builder bypasses tests | Skill delegates to `superpowers:test-driven-development`; explicit no-silent-skip rule (§4.3). |
| Planner/clarifier overlap (who owns the plan?) | Clarifier owns the *brief* (what/why); planner owns the *plan* (how) at the head of Build. |
| Scope creep into #3/#6 | Deliver stays a stub; tester/evaluator are general-path only. |
