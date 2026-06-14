# pi-forge — Long-Running Project-Delivery Agent Platform

**Design specification (v1)**

| | |
|---|---|
| **Status** | Draft — pending user review |
| **Date** | 2026-06-14 |
| **Author** | Yash Kavaiya (yash.kavaiya3@gmail.com) + Claude |
| **Repo** | `cxas-auto-pi-agent` |
| **Deliverable** | Complete platform design for all six subsystems (no code yet) |
| **Next step** | `writing-plans` per sub-project, in the build-roadmap order |

---

## 1. Context & purpose

We are building **pi-forge**: a persistent, stateful, self-improving long-running agent that takes a raw business requirement and drives it — with human-in-the-loop gates — through **Intake → Clarify → Build → Test → Evaluate → Improve → Deliver**, reliably, over days or weeks, for real production projects.

The platform is built on two existing tools:

- **pi.dev** ([Pi Coding Agent](https://github.com/earendil-works/pi), npm `@earendil-works/pi-coding-agent`) — an open-source, terminal-first, extremely extensible AI coding harness. Four run modes (interactive / print-json / RPC / SDK), TypeScript extensions, on-demand skills (Agent Skills standard), Handlebars prompt templates, themes, npm/git packages, 25+ model providers, and JSONL session trees with branching + compaction. This is the general-purpose runtime/orchestration brain.
- **cxas-go** ([`cxas-scrapi-go`](https://github.com/GoogleCloudPlatform/cxas-go), local at `c:/Users/yashk/Downloads/cxas-scrapi-go`) — the **Go** port of `cxas-scrapi`, a production-grade SDK + Cobra CLI for Google Cloud **CX Agent Studio**. Provides apps/agents/tools/sessions CRUD, **TurnEvals** (YAML, 7 operators), **SimulationEvals** (parallel LLM), a **Linter** (CXL001–005), **DFCX→CXAS migration**, and a `pkg/github` CI-template generator. This is the specialized powerhouse for conversational-agent projects.

> **Correction captured during brainstorming:** the original vision referenced the Python `uv run cxas`. The local SDK is the **Go** port; its binary is also named `cxas` (`go install github.com/GoogleCloudPlatform/cxas-go/cmd/cxas@latest`). **The Go `cxas` CLI is the integration target.**

### 1.1 Goals

1. One pipeline that delivers **both** general software projects and **CXAS conversational-agent** projects.
2. **Reliable over long horizons** — survives disconnects/crashes, resumes intelligently, checkpoints state.
3. **Human-in-the-loop at gates** — pauses and notifies on terminal + webhook (Slack/Discord) + email; explicit approval to proceed.
4. **Self-improving but safe** — reflects after each cycle and *proposes* skill/prompt changes (never auto-applies).
5. **Local-first & secure** — everything runs on the user's machine (or their GCP project); no mandatory cloud dependency in v1.
6. **Observable & auditable** — git history + structured state + metrics + logs.

### 1.2 Non-goals (v1)

- No standalone always-on **daemon/supervisor** process in v1 (the design is *daemon-ready*; the daemon is sub-project #4).
- No **cloud memory** (Firestore/BigQuery) in v1 (interface present, local implementation only).
- No **external tracing** vendor (Phoenix/Arize/LangSmith) in v1 (a hook interface exists; no dependency).
- No **remote reply-to-approve** in v1 (remote channels *notify*; approval is via terminal / `/forge-approve`; an approval-inbox file is designed for the future daemon to service).
- No multi-user / RBAC. Single operator.

---

## 2. Decision log (from brainstorming)

| # | Decision | Choice | Rationale |
|---|---|---|---|
| D1 | Orchestration engine location | **Hybrid: pi extension + skill** | Deterministic guardrails (gates, checkpoints) in TypeScript; orchestration logic in a model-driven skill. No separate daemon to babysit; clean upgrade path. |
| D2 | Long-running persistence | **tmux now, daemon-ready design** | Simplest local-first runner; state/gate/notifier code written mode-agnostic so a supervisor can drive `pi --mode rpc` later without rework. |
| D3 | Long-term memory | **Local-first, GCP-ready interface** | `MemoryStore` interface; SQLite + local files now; `GcpMemoryStore` (Firestore + BigQuery) slot for later. |
| D4 | Model providers available | **Anthropic + Gemini/Vertex + OpenAI + Ollama** | Enables full multi-model routing policy. |
| D5 | HITL notification channels | **Terminal + Slack/Discord webhook + Email** | Outbound notify on all three; approve via terminal/`/forge-approve` in v1. |
| D6 | Self-improvement autonomy | **Propose-only, human-approved** | `self-reflector` emits diffs / a PR branch; nothing changes until approved. |
| D7 | v1 breadth | **Both general + CXAS path** | One pipeline, two specializations; CXAS path activated by `project.type`. |
| D8 | Observability depth | **Git + structured logs + state** | Auditable via git, `state.json`, `metrics.json`, `decisions.md`, `logs/`; tracing-hook interface, no external dep. |

---

## 3. Glossary

- **Phase** — one stage of the delivery lifecycle (Intake…Deliver).
- **Gate** — a human-in-the-loop checkpoint between phases; blocks forward progress until approved.
- **`.pi-forge/`** — per-project state directory (git-tracked).
- **pi-forge extension** — the TypeScript pi.dev extension that owns the deterministic state machine.
- **Skill** — a `SKILL.md`-based capability package the model loads on demand.
- **Phase skill** — a skill that performs the work of one phase.
- **Routing** — choosing which model/provider runs a given phase.
- **Approval-inbox** — a file-based queue of pending gate decisions, for headless/daemon approval.

---

## 4. Architecture overview

```
┌──────────────────────────────────────────────────────────────────────┐
│ tmux session                                                           │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ pi.dev  (interactive TUI; or `pi --mode rpc` when daemon-driven) │  │
│  │                                                                  │  │
│  │  EXTENSION  .pi/extensions/pi-forge/        ← DETERMINISTIC (TS) │  │
│  │   • state machine + gate enforcement                            │  │
│  │   • durable checkpoints (appendEntry + git)                     │  │
│  │   • notifier: terminal / webhook / email                       │  │
│  │   • mode-aware: tui prompts ↔ rpc/json approval-inbox          │  │
│  │   • tools:  forge.status/advance/gate/checkpoint/note/          │  │
│  │             metric/route                                         │  │
│  │   • commands: /forge-status /forge-resume /forge-approve        │  │
│  │               /forge-new                                         │  │
│  │                                                                  │  │
│  │  SKILLS  .pi/skills/                          ← MODEL-DRIVEN     │  │
│  │   project-orchestrator → requirements-clarifier · project-      │  │
│  │   planner · tdd-builder · tester · evaluator · improver ·       │  │
│  │   cxas-wrapper · prod-deployer · self-reflector                 │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                          │ reads/writes                                │
│                          ▼                                             │
│   PROJECT REPO/.pi-forge/  state.json · config.json · metrics.json ·  │
│                            decisions.md · artifacts/ · checkpoints/ ·  │
│                            logs/ · inbox/                              │
│                                                                        │
│   ~/.pi-forge/memory/  (cross-project: SQLite + local vectors)        │
└──────────────────────────────────────────────────────────────────────┘
                          │ (CXAS projects only)
                          ▼
            Go `cxas` CLI  →  Google Cloud CX Agent Studio
            (run · eval run · lint · push · branch · versions)
```

**The central principle — deterministic vs. model-driven split:**

- **What** must happen, in what order, and **whether a gate is satisfied** → the **extension** (code). Not negotiable by the model.
- **How** to perform each phase well → **skills** (prompts). Full model intelligence applied within a phase.

This is what keeps multi-day runs reliable: the model can be creative inside a phase, but it cannot skip a gate, lose state, or jump phases, because the extension blocks the tool call that would do so.

---

## 5. The state machine

### 5.1 Phases & transitions

```
                ┌─────────────────────── improve loop (bounded) ──────────────┐
                │                                                              │
0 Intake ──► 1 Clarify ──▣G1──► 2 Build ──► 3 Test ──► 4 Evaluate ──▣G2──► 5 Improve
                                  ▲                                    │
                                  └────────── re-enter Build ◄─────────┘ (if "iterate")
                                                                       │
                                            (if "approve") ────────────┴──▣G3──► 6 Deliver ──► done
```

| Phase | Produces | Driven by skill |
|---|---|---|
| 0 Intake | Project Charter, repo init, `.pi-forge/` scaffolding, `project.type` (general\|cxas) | project-orchestrator |
| 1 Clarify | Project Brief (md + json): clarified reqs, MoSCoW, acceptance criteria, assumptions/risks, recommended stack, eval criteria | requirements-clarifier |
| 2 Build | Working implementation; conventional commits; `decisions.md` updates | tdd-builder (+ cxas-wrapper for CXAS) |
| 3 Test | Test reports + coverage (unit/integration/E2E; CXAS evals) | tester |
| 4 Evaluate | Weighted multi-criteria scorecard + metrics; **gate verdict** | evaluator |
| 5 Improve | RCA, prioritized backlog; re-loop into Build (bounded by `maxIterations`) | improver |
| 6 Deliver | Productionization + docs + handover package | prod-deployer |

### 5.2 Gates

| Gate | Between | Question | Default channels |
|---|---|---|---|
| **G1** | Clarify → Build | "Requirements clear — ready to build?" | terminal + webhook + email |
| **G2** | Evaluate → (Improve \| Deliver) | "Scorecard reviewed — approve / iterate?" | terminal + webhook + email |
| **G3** | Improve/Build → Deliver | "Deploy / hand over to production?" | terminal + webhook + email |

A lightweight **charter acknowledgement** at the end of Intake is recorded but is not a blocking gate.

### 5.3 Gate enforcement mechanism (the linchpin — D1)

pi.dev emits a **blockable `tool_call` event** and a **modifiable `tool_result` event**. The extension uses this to make gates impossible to bypass:

1. A phase skill calls the LLM-callable tool **`forge.advance(toPhase)`**.
2. The extension's `pi.on("tool_call", …)` handler intercepts it. It reads `state.json`:
   - If the gate guarding `toPhase` is `approved` → allow.
   - Else → **block** the tool call and return a result instructing the model to open the gate (`forge.gate(...)`) and stop.
3. `forge.gate(id, summary)`:
   - Renders the summary, **notifies** all configured channels.
   - In **`tui`** mode: prompts via `ctx.ui.confirm` / `ctx.ui.select` and records the decision.
   - In **`rpc`/`json`** mode (`ctx.mode`): writes a pending entry to `.pi-forge/inbox/` and pauses; the operator (or future daemon) resolves it via `/forge-approve` or by servicing the inbox.
4. On approval, the gate status flips to `approved`; the next `forge.advance` succeeds.

Because the *guard* lives in code keyed off persisted state, the model literally cannot advance a phase without a recorded human decision — in any run mode.

---

## 6. The `.pi-forge/` state layer

Per-project, git-tracked, lives at `<project-repo>/.pi-forge/`.

| Path | Purpose | Writer |
|---|---|---|
| `state.json` | Single source of truth for the state machine | extension |
| `config.json` | Per-project config: channels, routing policy, bounds | operator / Intake |
| `metrics.json` | Quantitative metrics across phases | `forge.metric` |
| `decisions.md` | ADR-style decision log | `forge.note` |
| `artifacts/` | charter.md, brief.md, brief.json, plan.md, test-report.md, scorecard.md, handover.md | phase skills |
| `checkpoints/` | `NNNN-<label>.json` snapshots | `forge.checkpoint` |
| `logs/` | `phase-<n>-<ts>.log` run logs | extension |
| `inbox/` | `<gate-id>.json` pending approvals (headless) | `forge.gate` |

### 6.1 `state.json` (schema by example)

```json
{
  "schemaVersion": 1,
  "project": {
    "id": "prj_2026_06_14_acme_support",
    "name": "Acme Support Assistant",
    "slug": "acme-support-assistant",
    "type": "cxas",
    "created": "2026-06-14T18:00:00Z",
    "repoRoot": "."
  },
  "phase": { "current": "build", "status": "in_progress", "enteredAt": "2026-06-14T19:10:00Z" },
  "gates": {
    "G1": { "status": "approved", "decidedBy": "yash", "channel": "terminal", "at": "2026-06-14T19:05:00Z", "note": "assumptions accepted" },
    "G2": { "status": "pending" },
    "G3": { "status": "not_reached" }
  },
  "improve": { "iteration": 0, "maxIterations": 3 },
  "routing": { "overrides": {} },
  "artifacts": {
    "charter": "artifacts/charter.md",
    "brief": "artifacts/brief.json",
    "plan": "artifacts/plan.md"
  },
  "history": [
    { "from": "intake", "to": "clarify", "at": "2026-06-14T18:30:00Z" },
    { "from": "clarify", "to": "build", "at": "2026-06-14T19:10:00Z", "gate": "G1" }
  ]
}
```

**Gate status enum:** `not_reached | pending | approved | rejected`.
**Phase status enum:** `not_started | in_progress | blocked_on_gate | done`.

### 6.2 `config.json` (schema by example)

```json
{
  "channels": {
    "terminal": { "enabled": true },
    "webhook":  { "enabled": true, "url": "${FORGE_WEBHOOK_URL}", "format": "slack" },
    "email":    { "enabled": true, "to": "yash.kavaiya3@gmail.com", "via": "smtp" }
  },
  "routing": {
    "policy": {
      "clarify":   "gemini/gemini-2.0-flash",
      "intake":    "gemini/gemini-2.0-flash",
      "build":     "anthropic/claude-opus-4-8",
      "test":      "anthropic/claude-sonnet-4-6",
      "evaluate":  "gemini/gemini-2.0-pro",
      "improve":   "anthropic/claude-opus-4-8",
      "deliver":   "anthropic/claude-sonnet-4-6",
      "fallback":  "openai/gpt-4o",
      "sensitive": "ollama/llama3.1"
    }
  },
  "bounds": { "maxIterations": 3, "gateTimeoutHours": 72 }
}
```

Secrets (`${FORGE_WEBHOOK_URL}`, SMTP creds) resolve from environment variables; the design leaves a slot for GCP Secret Manager (cxas-go already ships `pkg/secretmanager`).

### 6.3 `metrics.json` (schema by example)

```json
{
  "test": { "passRate": 0.97, "coverage": 0.84, "suites": { "unit": "pass", "e2e": "pass" } },
  "cxas": { "turnEvals": { "passed": 18, "total": 20 }, "simEvals": { "successRate": 0.9 }, "lint": { "errors": 0, "warnings": 2 } },
  "eval": { "scorecard": 0.88, "weights": { "correctness": 0.4, "quality": 0.2, "alignment": 0.2, "security": 0.2 } },
  "perf": { "p95LatencyMs": 1300 },
  "cost": { "estMonthlyUsd": 42.0 }
}
```

---

## 7. The pi-forge extension (deterministic core)

**Location:** `.pi/extensions/pi-forge/index.ts` (project-local; auto-discovered). A global install at `~/.pi/agent/extensions/pi-forge/` is also supported.

**Shape (per pi's real extension API):**

```ts
export default function (pi: ExtensionAPI) {
  // 1. Rehydrate state on session start
  pi.on("session_start", async (_e, ctx) => loadOrInitState(ctx.cwd));

  // 2. Enforce gates by blocking phase-advance tool calls
  pi.on("tool_call", (e) => {
    if (e.tool === "forge.advance" && !gatePassed(e.args.toPhase)) {
      return { block: true, result: "Gate not approved. Call forge.gate(...) and stop." };
    }
  });

  // 3. Autosave + checkpoint at end of each turn / phase
  pi.on("agent_end", async () => persistState());
  pi.on("session_before_compact", async () => persistState()); // survive compaction

  // 4. Register tools + commands (see tables below)
  pi.registerTool(forgeStatusTool);
  pi.registerTool(forgeAdvanceTool);
  // … forge.gate / checkpoint / note / metric / route
  pi.registerCommand("forge-status", { /* … */ });
  pi.registerCommand("forge-approve", { /* … */ });
  pi.registerCommand("forge-resume", { /* … */ });
  pi.registerCommand("forge-new", { /* … */ });
}
```

### 7.1 Tools (LLM-callable; Typebox schemas)

| Tool | Params | Effect |
|---|---|---|
| `forge.status` | — | Returns full `state.json` (the orchestrator's primary read). |
| `forge.advance` | `toPhase` | Request transition; **blocked by `tool_call` hook** unless guarding gate is `approved`. On success, updates phase + history + checkpoints. |
| `forge.gate` | `id`, `summary`, `options?` | Opens a gate: notify all channels; `tui` → `ctx.ui.confirm/select`; headless → write `inbox/<id>.json`, pause. Records decision. |
| `forge.checkpoint` | `label` | Snapshot to `checkpoints/`, `appendEntry`, git commit. |
| `forge.note` | `text` | Append ADR entry to `decisions.md`. |
| `forge.metric` | `key`, `value` | Merge into `metrics.json`. |
| `forge.route` | `phase` | Returns the model id for a phase per `config.routing` (+ overrides). |

`appendEntry(customType, data)` persists extension state into the session **without** sending it to the LLM — used for checkpoints and gate records, keeping context lean.

### 7.2 Commands (operator-facing slash commands)

| Command | Effect |
|---|---|
| `/forge-status` | Pretty-print current phase, gate states, metrics, next action. |
| `/forge-approve <gate> <approve\|reject> [note]` | Resolve a pending gate (services `inbox/` too). |
| `/forge-resume` | Re-hydrate and continue from last checkpoint. |
| `/forge-new` | Scaffold a new project: repo, `.pi-forge/`, charter intake. |

### 7.3 Events consumed

`session_start` (rehydrate), `tool_call` (gate enforcement — blockable), `tool_result` (capture artifact pointers — modifiable), `agent_end` (autosave), `session_before_compact` (persist before lossy summarization), `model_select` (record routing actually used).

### 7.4 Mode-awareness (daemon-ready, D2)

Every UI interaction branches on `ctx.mode`:

| `ctx.mode` | Gate behaviour | Notifications |
|---|---|---|
| `tui` | `ctx.ui.confirm/select` inline | terminal + webhook + email |
| `rpc` / `json` | write `inbox/<gate>.json`, pause; resolved by `/forge-approve` or daemon | webhook + email (no terminal UI) |
| `print` | non-interactive: auto-block at gate, exit non-zero with gate id | webhook + email |

This is the single most important forward-compatibility decision: the same gate/notifier/state code runs unchanged when sub-project #4 introduces a Python supervisor driving `pi --mode rpc`.

---

## 8. Skill suite (model-driven logic)

Each skill is a directory with `SKILL.md` (YAML frontmatter: `name` [lowercase/hyphen, ≤64], `description` [≤1024], optional `allowed-tools`, `metadata`) plus `references/` and `scripts/`. Discovered from `.pi/skills/` (project) and `~/.pi/agent/skills/` (global). Loaded automatically (descriptions in system prompt) or manually via `/skill:name`.

| Skill | Reads | Writes | Contract (one-line) |
|---|---|---|---|
| **project-orchestrator** | `forge.status` | phase transitions, gate openings | The loop: inspect state → load the right phase skill → on phase completion call `forge.advance` (which opens the gate if needed). Never does phase work itself. |
| **requirements-clarifier** | charter, raw request | `artifacts/brief.{md,json}` | Ambiguity scan across functional / non-functional / integrations / data / users / edge cases / metrics / scope; **batched** categorized questions; loop to confidence threshold; emit MoSCoW + acceptance + eval criteria. |
| **project-planner** | brief | `artifacts/plan.md` (PRD, user stories, tech spec, WBS, architecture sketch) | Turn the brief into an executable plan; recommend stack with rationale. CXAS: foundry-style PRD→agent/tools/guardrails. |
| **tdd-builder** | plan | source + tests + commits | Acceptance criteria → tests → implementation → run → fix; conventional commits; `forge.note` on significant decisions. Supports greenfield + brownfield. |
| **tester** | source | `artifacts/test-report.md`, `forge.metric` | Unit / integration / contract / E2E (Playwright for UIs). CXAS: TurnEvals + SimulationEvals + Linter via cxas-wrapper. |
| **evaluator** | reports, metrics | `artifacts/scorecard.md`, gate verdict | Weighted multi-criteria scorecard (correctness, quality, alignment-to-brief, security, UX, cost); produce G2 recommendation. |
| **improver** | scorecard, feedback | backlog, re-loop | RCA → prioritized fixes → re-enter Build→Test→Evaluate (bounded by `maxIterations`). |
| **cxas-wrapper** | — | parsed CXAS results | Safe subprocess bridge to the Go `cxas` CLI; argument allow-listing; parse table/json/yaml output; surface errors structurally. (See §10.) |
| **prod-deployer** | approved build | Dockerfile, CI, monitoring, `artifacts/handover.md` | Productionization + docs + handover. CXAS: `cxas push`/`branch`/versions/deployments + `pkg/github` CI templates. |
| **self-reflector** | history, metrics, decisions | proposed diffs / PR branch | After each cycle: critique process (delays? wrong assumptions?) → **propose** skill/prompt edits as a git diff or PR branch. Never auto-applies (D6). |

> **`state-manager` note:** the vision listed a `state-manager` skill. Its responsibilities (checkpoint/resume/rehydrate) are owned by the **extension** in the hybrid model, so it does not exist as a separate skill — this removes a redundant, error-prone model-driven path. State management is deterministic, by design.

### 8.1 Prompt templates (`.pi/prompts/`, Handlebars `{{var}}`)

| Template | Use |
|---|---|
| `/charter` | Intake → render a Project Charter from the raw request. |
| `/clarification-batch` | Clarify → produce one batched, categorized question set. |
| `/scorecard` | Evaluate → render the weighted scorecard from metrics. |
| `/reflection` | Self-improve → structured post-cycle critique. |

---

## 9. Cross-cutting concerns

### 9.1 Multi-model routing (D4)

Policy lives in `config.routing.policy` and is read via `forge.route(phase)`:

| Phase / task | Model class | Why |
|---|---|---|
| Intake, Clarify, Summarize, Lint, Eval-judge | **Gemini Flash/Pro** | Fast, cheap, high-volume. Also matches cxas-go's Vertex Gemini client. |
| Build, Improve, deep reasoning | **Claude Opus / Sonnet** | Strongest coding + reasoning. |
| Fallback | **OpenAI GPT** | Provider redundancy. |
| Sensitive / offline review | **Ollama (local)** | Local-first, no data egress. |

**Enforcement:**
- **Headless** (`pi --mode rpc/print`, future daemon): the driver invokes each phase with the policy's `--model`.
- **Interactive:** the extension switches model at phase boundaries where the API allows (`model_select` is observable; `/model` and `--model` are the switching surfaces); otherwise the orchestrator instructs a `/model` switch. `forge.route` always returns the intended model so behaviour is explicit and logged.

### 9.2 Notifications & HITL (D5)

A `notifier` module inside the extension fans out gate events to enabled channels:

- **terminal** — `ctx.ui.notify` (+ inline `confirm/select` for approval).
- **webhook** — POST to a Slack/Discord-compatible incoming webhook (`config.channels.webhook.url`), via `fetch` or `pi.exec("curl", …)`.
- **email** — SMTP send via a small `scripts/notify-email` helper; subject carries gate id + project slug.

**Approval (v1):** remote channels are **notify-only**; approval is via terminal `ctx.ui` or `/forge-approve`. Headless gates persist to `inbox/<gate>.json` with a summary + the exact `/forge-approve` command to run. **Future (sub-project #4):** the daemon watches `inbox/` and an inbound webhook endpoint to enable true reply-to-approve.

### 9.3 Memory (D3)

```
MemoryStore (interface)
 ├─ LocalMemoryStore   (v1)  ~/.pi-forge/memory/ : SQLite + JSON + optional local vector index
 └─ GcpMemoryStore     (later): Firestore (state/memory) + BigQuery (metrics/analytics)
```

- **Per-project** memory = `.pi-forge/` (state, decisions, metrics, artifacts).
- **Cross-project** memory = `~/.pi-forge/memory/`: lessons, reusable patterns, prior scorecards, prompt/skill improvement history — queried during Clarify/Plan/Improve.
- Metrics export to BigQuery is a later, additive step behind the same interface.

### 9.4 Observability (D8)

- **Git** — conventional commits per significant change; the design doc and `.pi-forge/` are tracked → full audit trail.
- **State** — `state.json` (phase/gate history), `metrics.json`, `decisions.md`.
- **Logs** — `.pi-forge/logs/phase-<n>-<ts>.log`.
- **Tracing hook** — a `Tracer` interface with a no-op default; a Phoenix/Arize/LangSmith implementation can be dropped in later (non-goal for v1).

### 9.5 Self-improvement (D6)

After each Improve cycle (and at project end), `self-reflector`:
1. Reads `history`, `metrics.json`, `decisions.md`, and cross-project memory.
2. Produces a structured critique (`/reflection` template): what caused delays, which assumptions were wrong, where prompts/skills underperformed.
3. **Proposes** concrete edits to skills/prompts as a **git diff on a `forge/reflect-<date>` branch** (or a PR). Nothing merges without human approval. Accepted lessons also persist to cross-project memory.

---

## 10. CXAS specialization path

Activated when `state.project.type === "cxas"`. The general pipeline is unchanged; specific phase skills delegate to **cxas-wrapper**, which shells the Go `cxas` CLI.

| Phase | CXAS action (via cxas-wrapper) |
|---|---|
| Plan | foundry-style PRD → agents / tools / toolsets / guardrails design. |
| Build | scaffold app via SDK/CLI; `cxas push` to import; `cxas lint` (CXL001–005) on sub-agent instructions. |
| Test | `cxas eval run --file evals.yaml` (TurnEvals: `contains`, `equals`, `tool_called`, `no_tools_called`, `agent_transfer`, `tool_input`, `tool_output`); SimulationEvals for multi-turn; `cxas run` for single-turn smoke checks. |
| Evaluate | fold TurnEval pass rate, SimEval success rate, latency, lint counts into the scorecard. |
| Deliver | `cxas branch`/versions/deployments for promotion; `pkg/github` to generate the CI workflow; trace search for prod signals. |

**cxas-wrapper safety contract:** command allow-list (`run`, `eval`, `lint`, `pull`, `push`, `branch`, `apps`, `create`, `delete` — `delete` requires an explicit confirm flag); `--project`/`--location` always passed; `-o json` preferred and parsed; non-zero exits surfaced as structured errors; credentials via the cxas-go 5-path chain (ADC by default). Migration (DFCX→CXAS) is available via the same wrapper for migration-type projects.

> **Known cxas-go limits to design around:** `callbacks.ExecuteCallback` returns `ErrNotSupported` (use external callback testing); CES gRPC unavailable (REST only). These don't affect the v1 pipeline.

---

## 11. Persistence & long-running execution (D2)

**v1 (tmux):**
- pi runs in a named tmux session (e.g. `forge:<slug>`); detaching/SSH-drop doesn't kill it.
- State lives in `.pi-forge/` and pi's own JSONL session tree (`~/.pi/agent/sessions/`), so a crash loses at most the current turn.
- **Resume** = re-attach tmux, or `pi --continue` / `/forge-resume`; the extension rehydrates from `state.json` + last checkpoint on `session_start`.
- Compaction is safe: `session_before_compact` persists state first; pointers (not full artifacts) live in context.

**Daemon-ready (sub-project #4):**
- A Python (or TS) supervisor drives `pi --mode rpc` (LF-delimited JSONL over stdin/stdout), one invocation per phase, selecting the routed `--model`.
- It services `inbox/` for approvals, watches an inbound webhook for remote reply-to-approve, and can manage **multiple projects** concurrently.
- Because the extension is already mode-aware (§7.4), **no state/gate/notifier code changes** are required to add the daemon.

---

## 12. Security & safety

- **Local-first:** no mandatory cloud calls; CXAS/Vertex calls only for CXAS projects, using the user's GCP creds (ADC by default).
- **Secrets** via env vars; `${...}` placeholders in `config.json`; GCP Secret Manager slot for later.
- **Subprocess safety:** cxas-wrapper allow-lists commands; destructive ops (`delete`) require explicit confirmation; all shelled commands logged.
- **Self-improvement is propose-only** — no autonomous edits to its own skills/prompts.
- **Gates are code-enforced** — the model cannot deploy (G3) or skip Clarify (G1) without a recorded human decision.

---

## 13. Testing strategy for the platform itself

- **Extension (TypeScript):** unit tests for the state machine (transition legality), the gate guard (advance blocked until approved), checkpoint/rehydrate round-trips, and mode-branching (tui vs rpc gate paths).
- **Skills:** golden-transcript tests — given a fixture `state.json` + inputs, assert the skill produces the expected artifacts and calls the expected `forge.*` tools.
- **cxas-wrapper:** mock the `cxas` binary; assert allow-listing, json parsing, and structured error surfacing; one live smoke test against a throwaway CXAS app (gated, manual).
- **End-to-end:** a "toy project" fixture run through Intake→Deliver in `--mode json`, asserting the full transition history and that all three gates were hit.

---

## 14. Build roadmap

Each sub-project gets its own `spec → plan → implement` cycle. Recommended order (build skeleton first, prove the loop cheaply):

1. **Foundation** — pi-forge extension (state machine + gate enforcement + checkpoint + terminal notifier) + `project-orchestrator` skill + a thin end-to-end run on a toy project. *Proves D1.*
2. **Phase skills** — requirements-clarifier, project-planner, tdd-builder, tester, evaluator, improver + the four prompt templates.
3. **CXAS bridge** — cxas-wrapper + CXAS path wired into planner/tester/evaluator/deployer.
4. **Long-running + remote HITL** — webhook + email notifier, approval-inbox, tmux runbook, daemon-ready mode handling (and optionally the supervisor).
5. **Self-improvement + memory + routing** — self-reflector (propose-only), LocalMemoryStore, routing policy enforcement.
6. **Productionization** — prod-deployer (Docker, CI via `pkg/github`, monitoring, docs, handover).

---

## 15. Open questions / future work

- **Remote reply-to-approve** transport (Slack interactive endpoint vs. a small inbound HTTP listener) — decide in sub-project #4.
- **GcpMemoryStore** schema (Firestore collections, BigQuery tables) — design when cross-project learning is needed at scale.
- **Cost accounting** precision (`metrics.cost`) — start with rough per-model token estimates; refine later.
- **Multi-project concurrency** UX in tmux before the daemon exists — likely one tmux session per project.
- **Interactive model auto-switch** — confirm the exact pi API for programmatic per-phase model switching in `tui` mode (vs. instructing `/model`).

---

## 16. Risks

| Risk | Mitigation |
|---|---|
| Model skips a gate / phase | Code-enforced gate guard on `forge.advance` (cannot be bypassed in any mode). |
| Context loss over long runs | State in `.pi-forge/` + checkpoints + persist-before-compact; resume rehydrates. |
| Improve loop runs forever | `maxIterations` bound; G2 verdict required to continue. |
| pi API drift | Extension isolates pi API usage; skills depend only on `forge.*` tools, not pi internals. |
| CXAS CLI changes | cxas-wrapper isolates all `cxas` calls behind one parsed interface. |
| Scope creep back into a monolith | Strict sub-project decomposition; one spec→plan→build per piece. |
```
