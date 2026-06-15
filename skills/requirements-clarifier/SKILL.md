---
name: requirements-clarifier
description: Clarify-phase skill for pi-forge. Use during the Clarify phase to turn a raw request into a high-quality Project Brief. Scans for ambiguity across functional, non-functional, integration, data, user, edge-case, metric, and scope dimensions, asks batched categorized questions, and writes artifacts/brief.md + brief.json.
---

# Requirements Clarifier (Clarify phase)

Turn the raw request into a high-quality Project Brief. Drive transitions only through forge_* tools; never edit state.json directly.

## Steps
1. Read the raw request / `artifacts/charter.md`.
2. Scan for ambiguity across: functional; non-functional (performance, security, scalability, compliance); integrations; data; users/personas; edge cases; success metrics/KPIs; scope boundaries; technical constraints/preferences.
3. Ask the human **batched, categorized** questions (not a flood — group by category). Loop until the answers are clear or the user says "proceed with these assumptions."
4. Write `artifacts/brief.md` (human-readable) and `artifacts/brief.json` (machine-readable) containing: clarified requirements; MoSCoW prioritization; user stories / acceptance criteria; assumptions & open risks; recommended tech stack + rationale; high-level architecture sketch; eval criteria for later phases.
5. Register both: `forge_artifact brief artifacts/brief.json` and `forge_artifact brief_md artifacts/brief.md`.
6. Record key assumptions with `forge_note`.
7. Tell the orchestrator the brief is ready. The orchestrator opens **G1** (forge_gate) — do not advance yourself.

## Rules
- Batch questions; don't overwhelm.
- Capture every assumption explicitly in the brief.
- One phase only: produce the brief and stop. Do not start building.
