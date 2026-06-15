---
name: cxas-wrapper
description: Safe bridge to the cxas CLI for pi-forge CXAS projects. Use whenever a CX Agent Studio project needs to lint an app directory, run evaluations, manage apps/deployments, or migrate from Dialogflow CX. Always go through the forge_cxas tool (never raw shell); it enforces an allow-list and returns structured results.
---

# cxas-wrapper

The safe path to the `cxas` CLI. Always call the **forge_cxas** tool; never run `cxas` via raw shell.

## Using forge_cxas
- Call `forge_cxas` with `subcommand` (allow-listed) and `args` (an array passed through verbatim).
- It returns `{exitCode, stdout, stderr, json}` in the result details. `exitCode !== 0` is an error.
- `delete` is refused unless you pass `allowDelete: true` — only do so on explicit human approval.

## Offline vs deployed
- **Offline (no GCP needed):** `lint` over a local app directory — e.g. `subcommand:"lint", args:["--app-dir","./app","--json"]`, or `args:["--list-rules"]` to see rule ids (config A*, callbacks C*, evals E*, …).
- **Deployed (needs a GCP project + auth):** `run` evaluates a deployed app — `subcommand:"run", args:["--app-name","projects/{p}/locations/{l}/apps/{a}","--wait"]` (exit 0 = pass, 1 = fail). `apps`, `deployments`, `trace`, `insights` also hit the live project. Auth comes from `--oauth-token` / `CXAS_OAUTH_TOKEN` / ADC — pi-forge does not manage tokens.

## Resource names
Project and location are encoded in resource names, not flags: `projects/{project}/locations/{location}/apps/{app}` (and `.../evaluations/{id}`). Build these from the project's config/brief.

## Rules
- Always forge_cxas, never raw `cxas` shell.
- Read `exitCode` before trusting output; prefer `--json` where the subcommand supports it.
- Treat `delete` and any destructive op as gated — require explicit human approval.
