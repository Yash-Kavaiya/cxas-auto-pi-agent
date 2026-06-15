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
