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
