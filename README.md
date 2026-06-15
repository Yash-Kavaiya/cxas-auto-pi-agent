# cxas-auto-pi-agent

A persistent, self-improving long-running agent that takes a business requirement through
**Intake → Clarify → Build → Test → Evaluate → Improve → Deliver** with code-enforced
human-in-the-loop gates. Built as a [pi.dev](https://github.com/earendil-works/pi) extension
(**pi-forge**), with a specialized path for Google Cloud CX Agent Studio projects via the
Go [`cxas`](https://github.com/GoogleCloudPlatform/cxas-go) CLI.

## Status

**Sub-project #1 (Foundation) — implemented.** The deterministic walking skeleton: a state
machine whose phase gates cannot be bypassed by the model (enforced in code via a blocked
`tool_call`), durable `.pi-forge/` state + checkpoints, a notifier, and the
`project-orchestrator` skill. 56 tests, typecheck clean.

## Documentation

- **Design spec (all 6 subsystems):** [docs/superpowers/specs/2026-06-14-pi-forge-platform-design.md](docs/superpowers/specs/2026-06-14-pi-forge-platform-design.md)
- **Foundation implementation plan:** [docs/superpowers/plans/2026-06-14-pi-forge-foundation.md](docs/superpowers/plans/2026-06-14-pi-forge-foundation.md)
- **Smoke-test runbook:** [docs/RUNBOOK-pi-forge.md](docs/RUNBOOK-pi-forge.md)

## The pi-forge extension

```
extensions/pi-forge/        # TypeScript pi.dev extension (ESM, vitest)
  index.ts                  # wires tools + gate guard + commands to pi
  src/                      # pure, tested core: types, machine, gates, guard,
                            # state, config, checkpoint, notifier, inbox, artifacts, tools
  tests/                    # unit + full-lifecycle integration tests
skills/project-orchestrator/ # the skill that drives the lifecycle loop
```

Develop & test:
```bash
cd extensions/pi-forge
npm install
npm run test        # 56 tests
npm run typecheck   # strict, clean
```

To run it live, see the [runbook](docs/RUNBOOK-pi-forge.md).

## Roadmap

Foundation is sub-project #1 of six (phase skills, CXAS bridge, long-running persistence,
self-improvement + memory, productionization). See the design spec §14 for the build order.
