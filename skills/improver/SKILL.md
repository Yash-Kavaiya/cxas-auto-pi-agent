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
5. Return control to the orchestrator, which advances Improve->Build to re-enter the build loop (the extension enforces the maxIterations bound). Do not advance yourself.

## Rules
- Prioritize ruthlessly; address the evaluator's top risks first.
- Each backlog item must be concrete enough that tdd-builder can pick it up directly.
