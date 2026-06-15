# pi-forge Foundation — Manual Smoke Test

Proves the gate mechanism end-to-end in a live pi session. (The automated proof lives in
`extensions/pi-forge/tests/integration.test.ts`; this runbook exercises the *real* pi runtime.)

## Prerequisites
- `pi` installed: `npm i -g @earendil-works/pi-coding-agent`
- A model provider configured for pi (`/login` or an API key) so the agent can run.
- From repo root: `cd extensions/pi-forge && npm install && npm run test && npm run typecheck` (all green).

## Load the extension
Add the extension to pi settings (`~/.pi/agent/settings.json`):
```json
{ "extensions": ["<ABS_PATH>/extensions/pi-forge/index.ts"] }
```
(Replace `<ABS_PATH>` with the absolute repo path. Also make the `project-orchestrator`
skill discoverable, e.g. symlink or copy `skills/project-orchestrator/` into
`~/.pi/agent/skills/` or `<project>/.pi/skills/`.)

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
Start a fresh `sandbox/toy2`, `/forge-new X`, advance to `clarify`, then ask the agent to advance
straight to `build` WITHOUT approving G1. The `forge_advance` tool call must be **blocked** with
"gate G1 not approved". This is the core guarantee.
