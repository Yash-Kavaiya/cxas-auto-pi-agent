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

## CXAS path (when project.type = cxas)
Use the cxas-wrapper skill / forge_cxas:
- Offline structural lint: call `forge_cxas` with `subcommand: "lint", args: ["--app-dir", "<dir>", "--json"]`; record error/warning counts.
- Deployed eval (if an app is deployed): call `forge_cxas` with `subcommand: "run", args: ["--app-name", "<resource>", "--wait"]` (exit 0 pass / 1 fail).
Fold both into `artifacts/test-report.md` and `forge_metric test {"cxas": {"lint": {...}, "eval": {...}}}`.

## Rules
- Report failures honestly with the real output; do not claim green without evidence.
- If a layer doesn't exist for this project, say so in the report rather than fabricating it.
