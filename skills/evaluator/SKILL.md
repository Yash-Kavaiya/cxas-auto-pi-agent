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

## CXAS path (when project.type = cxas)
Incorporate the cxas lint findings (rule severities) and the `cxas run` eval pass/fail (from the test report / metrics) into the holistic judgment and the approve|iterate recommendation.

## Rules
- Be specific and honest: tie every judgment to evidence in the brief, the report, or the code.
- The recommendation is advisory; the human's G2 verdict is authoritative.
