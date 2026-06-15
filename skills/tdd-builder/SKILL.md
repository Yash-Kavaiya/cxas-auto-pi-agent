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
