# pi-forge #3 — CXAS Bridge

**Design specification (sub-project #3 of 6)**

| | |
|---|---|
| **Status** | Draft — pending user review |
| **Date** | 2026-06-15 |
| **Author** | Yash Kavaiya + Claude |
| **Builds on** | Foundation (#1) + Phase skills (#2), both merged — see [platform design](2026-06-14-pi-forge-platform-design.md) §10 |
| **Next step** | `writing-plans` → implementation |

---

## 1. Context

#1 shipped the deterministic state machine; #2 shipped the six general-path phase skills. #3 adds the **CXAS specialization**: a safe bridge to the `cxas` CLI so conversational-agent projects can be linted and evaluated, and so the planner/tester/evaluator have a CXAS path.

**Integration target (confirmed during #3 brainstorming): the Python `cxas` CLI on PATH** (`...Python313/Scripts/cxas`), *not* the Go port. This overrides the platform spec's earlier Go assumption. The two CLIs diverge materially:
- Python is argparse-based; only `--oauth-token` is a global flag. There is **no** uniform `-p/--project`, `-l/--location`, or `-o json` global flag.
- Project/location are encoded in **resource names** (`projects/{p}/locations/{l}/apps/{a}`), passed per-subcommand (e.g. `run --app-name ...`).
- Command set: `migrate, init-github-action, evals, test-tools, test-callbacks, export, push-eval, run, run-session, ci-test, delete, pull, push, lint, init, create, branch, apps, conversations, deployments, local, insights, trace`.
- `lint` is **offline/structural** (`--app-dir`, `--json`, `--list-rules`, rule categories A/C/E/… e.g. `A001 config-json-parse`, `C005 callback-hardcoded-phrases`, `E001 eval-yaml-parse`). `run` is the deployed eval runner (`--app-name`, `--evaluation-id`, `--wait` → exit 0 pass / 1 fail).

Because flags are heterogeneous, the bridge's safety guarantee is an **allow-list on the subcommand**, with skill-supplied args passed through — not flag injection.

## 2. Decision log (#3 brainstorming)

| # | Decision | Choice |
|---|---|---|
| D3.1 | Bridge form | **Deterministic `forge_cxas` extension tool** (code-enforced allow-list + parsing) + a guiding `cxas-wrapper` skill |
| D3.2 | cxas target | **Python `cxas` on PATH**; resolved via `config.cxas.binPath` (default `"cxas"`) |
| D3.3 | Verification | **Mock unit tests + an offline real-binary `lint --list-rules` integration test** (skips if binary absent) |

## 3. `forge_cxas` tool contract

Added to `tools.ts` (auto-registered by `index.ts` via `buildForgeTools`).

- **Parameters:** `Type.Object({ subcommand: Type.String(), args: Type.Array(Type.String()) (optional, default []), allowDelete: Type.Optional(Type.Boolean()) })`.
- **Behavior:**
  1. Reject if `subcommand` is not in the allow-list → `{isError:true}` with a clear message. `delete` is allowed only when `allowDelete === true`.
  2. Run `<binPath> <subcommand> ...args` via an injectable runner; capture `{exitCode, stdout, stderr}`.
  3. Best-effort `JSON.parse(stdout)` → `json` (or `null`).
  4. Return a text summary + `details: { exitCode, json, stderr }`; set `isError: true` when `exitCode !== 0`.
- **No project/location/output injection** — resource names and `--json` are part of `args`, supplied by the skill. Auth is left to `--oauth-token`/`CXAS_OAUTH_TOKEN`/ADC; pi-forge never handles tokens.
- **binPath:** from `config.cxas.binPath` (default `"cxas"`).
- **Pure, unit-tested seams:**
  - `isAllowedCxas(subcommand: string, allowDelete: boolean): { ok: boolean; reason: string }`
  - `parseCxasResult(stdout: string, stderr: string, exitCode: number): { exitCode, stdout, stderr, json: unknown | null }`
  - `buildCxasTool(deps: { run: (bin, args) => CxasRun; binPath: string })` returns the tool definition; `CxasRun = { stdout: string; stderr: string; exitCode: number }`.

### Allow-list (v1)
`lint, run, run-session, evals, export, push-eval, pull, push, create, branch, apps, deployments, conversations, trace, insights, migrate, ci-test, test-tools, test-callbacks, init-github-action`. `delete` requires `allowDelete: true`. Everything else is rejected. (Excluded for now: `init`, `local`, `local-test` — scaffolding/Docker, not needed for the eval path; add later if required.)

## 4. config.json addition

```json
{ "cxas": { "binPath": "cxas" } }
```
`loadConfig` merges this over a new default (`DEFAULT_CONFIG.cxas = { binPath: "cxas" }`). Documented: set to the Python `cxas` (default PATH resolution) or override to a specific binary.

## 5. `cxas-wrapper` skill

`skills/cxas-wrapper/SKILL.md` — guidance (not raw shell): always use `forge_cxas`; the allow-list; build resource names `projects/{p}/locations/{l}/apps/{a}`; distinguish **offline** commands (`lint`, `lint --list-rules`) from **deployed** ones (`run --wait`, `apps list`) that need GCP auth; interpret `{exitCode, json}`; `delete` requires `allowDelete`. Used by the phase skills below when `project.type === "cxas"`.

## 6. CXAS path in existing phase skills

Add a short "CXAS path (when project.type = cxas)" section to each (general path otherwise unchanged):
- **tester:** run `cxas lint --app-dir <dir> --json` (offline structural) and, for a deployed app, `cxas run --app-name <res> --wait` (eval pass/fail) via `forge_cxas`; fold lint error/warn counts + eval pass/fail into `test-report.md` and `forge_metric test {... , cxas: {...}}`.
- **evaluator:** incorporate lint findings + eval results into the holistic scorecard and `approve|iterate` recommendation.
- **project-planner:** light CXAS design guidance — agents/tools/toolsets/guardrails structure; use the lint rule categories (config/callbacks/tools/evals/structure/schema) as quality targets.

`prod-deployer` / Deliver-phase CXAS (push/branch/versions/deployments + CI) remains **#6**.

## 7. Verification (D3.3)

- **Unit tests** (`tests/cxas.test.ts`, mock `run`):
  - `isAllowedCxas`: `lint` ok; unknown `frobnicate` rejected; `delete` rejected without `allowDelete`, allowed with it.
  - tool: builds `<bin> <subcommand> ...args`; non-zero exit → `isError` + stderr in details; valid JSON stdout → `details.json` parsed; non-JSON stdout → `json: null`.
- **Offline real-binary integration test** (`tests/cxas.integration.test.ts`): if `cxas` resolves (probe with `--version`/`lint --list-rules`), run `forge_cxas` with `{subcommand:"lint", args:["--list-rules"]}` against the real binary and assert `exitCode === 0` and stdout contains a known rule id (e.g. `A001` or `config-json-parse`). If the binary is not resolvable, the test **skips** (uses `it.skipIf`) so CI without cxas stays green.
- `skilllint.ts`: add `forge_cxas` to `ALLOWED_FORGE_TOOLS`.
- `tests/skills.test.ts`: add `cxas-wrapper` to the expected-skill list.
- **Runbook:** add a CXAS section — offline `forge_cxas lint --list-rules` smoke; note deployed `run` needs a GCP project + auth.

## 8. File structure (#3)

```
extensions/pi-forge/
  src/cxas.ts            (new: isAllowedCxas, parseCxasResult, buildCxasTool, CxasRun)
  src/config.ts          (add cxas.binPath to ForgeConfig + DEFAULT_CONFIG + merge)
  src/tools.ts           (register forge_cxas via buildCxasTool, wired with run+binPath)
  src/skilllint.ts       (add forge_cxas to allowed set)
  index.ts               (provide real run = execFileSync; pass config.cxas.binPath)
  tests/cxas.test.ts             (new, mock runner)
  tests/cxas.integration.test.ts (new, real binary, skipIf absent)
  tests/config.test.ts           (assert cxas default + merge)
  tests/skilllint.test.ts        (assert forge_cxas allowed)
  tests/skills.test.ts           (expected list + cxas-wrapper)
skills/cxas-wrapper/SKILL.md     (new)
skills/tester/SKILL.md           (add CXAS path)
skills/evaluator/SKILL.md        (add CXAS path)
skills/project-planner/SKILL.md  (add CXAS path)
docs/RUNBOOK-pi-forge.md         (CXAS section)
```

## 9. Out of scope (deferred)

- Deployer/Deliver CXAS (push/branch/versions/deployments + CI) → **#6**.
- Automated **deployed-eval** test (needs a live GCP project + auth) — manual only; CI covers offline lint.
- `self-reflector`, memory, routing enforcement → **#5**.
- Go-CLI support — the Go binary exists locally but Python is the chosen target; the `binPath` config makes switching possible later without code change (subcommands/flags would differ, so the skill/allow-list would need revisiting).

## 10. Risks

| Risk | Mitigation |
|---|---|
| Model runs raw `cxas` via shell, bypassing the allow-list | `cxas-wrapper` skill mandates `forge_cxas`; (the allow-list can't stop a raw Bash call, but the skill + the structured tool make it the path of least resistance). |
| Destructive `delete` / write ops (`push`, `create`) | `delete` requires explicit `allowDelete: true` (a non-default opt-in) — the v1 guard. These are not yet *state-backed gate* enforced; full human-gating of destructive GCP mutations is deferred to **#6** (deploy gating). The cxas-wrapper skill mandates explicit human approval. |
| `binPath` runs an arbitrary binary | `binPath` is **operator-controlled config** (trusted), not model input; the allow-list guards the model-controlled subcommand/args. Consistent with §12 (local-first, single operator). Not validated by design — validation would break the legitimate Go-binary override. |
| Subprocess hangs / floods memory | `runCxasBinary` bounds every call with a 5-min `timeout` and a 50 MB `maxBuffer`. |
| CI lacks the cxas binary | Integration test `skipIf`s; unit tests use a mock runner. |
| Python CLI output isn't JSON | `parseCxasResult` returns `json: null` and preserves raw stdout; skills read exitCode + text. |
| Token/credential handling | Out of scope — delegated to `--oauth-token`/env/ADC; pi-forge stores no secrets. |
| Target CLI drift (Python vs Go) | `binPath` is config; allow-list + skill are the only CLI-specific surface, isolated from the rest of pi-forge. |
