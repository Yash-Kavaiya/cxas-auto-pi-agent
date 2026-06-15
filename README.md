# cxas-auto-pi-agent

A persistent, self-improving long-running agent that takes a business requirement through
**Intake → Clarify → Build → Test → Evaluate → Improve → Deliver** with code-enforced
human-in-the-loop gates. Built as a [pi.dev](https://github.com/earendil-works/pi) extension
(**pi-forge**), with a specialized path for Google Cloud CX Agent Studio projects via the
Go [`cxas`](https://github.com/GoogleCloudPlatform/cxas-go) CLI.

## Status

**Sub-projects #1–#2 — implemented.**
- **#1 Foundation:** the deterministic walking skeleton — a state machine whose phase gates
  cannot be bypassed by the model (enforced in code via a blocked `tool_call`), durable
  `.pi-forge/` state + checkpoints, a notifier, and the `forge_*` tools.
- **#2 Phase skills:** the six general-path skills (requirements-clarifier, project-planner,
  tdd-builder, tester, evaluator, improver) the orchestrator dispatches per phase, a
  `forge_artifact` tool, and structural skill-lint conformance tests.

75 tests, typecheck clean. (Deliver remains a stub until #6; CXAS evals land in #3.)

## Documentation

- **Design spec (all 6 subsystems):** [docs/superpowers/specs/2026-06-14-pi-forge-platform-design.md](docs/superpowers/specs/2026-06-14-pi-forge-platform-design.md)
- **#1 Foundation plan:** [docs/superpowers/plans/2026-06-14-pi-forge-foundation.md](docs/superpowers/plans/2026-06-14-pi-forge-foundation.md)
- **#2 Phase-skills spec:** [docs/superpowers/specs/2026-06-15-pi-forge-phase-skills-design.md](docs/superpowers/specs/2026-06-15-pi-forge-phase-skills-design.md) · **plan:** [docs/superpowers/plans/2026-06-15-pi-forge-phase-skills.md](docs/superpowers/plans/2026-06-15-pi-forge-phase-skills.md)
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
npm run test        # 75 tests
npm run typecheck   # strict, clean
```

To run it live, see the [runbook](docs/RUNBOOK-pi-forge.md).

## Roadmap

Six sub-projects total. Done: **#1 Foundation**, **#2 Phase skills**. Next: **#3 CXAS bridge**,
then #4 long-running + remote HITL, #5 self-improvement + memory + routing, #6 productionization.
See the design spec §14 for the build order.
