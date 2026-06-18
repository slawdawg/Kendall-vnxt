---
title: Kendall_Nxt Linux Install Architecture Input
status: draft
created: 2026-06-18
updated: 2026-06-18
source_recovery:
  - docs/linux-install/install-contract.md
  - docs/linux-install/one-command-bootstrap-plan.md
  - docs/linux-install/validation-matrix.md
  - docs/linux-install/goal-run-contract.md
  - docs/linux-install/release-gate-traceability.md
---

# Kendall_Nxt Linux Install Architecture Input

## Technical Boundary

The Linux install MVP uses a single local bootstrap path. The user runs a shell bootstrap script from inside the Ubuntu session as an existing non-root sudo-capable user. The repo-owned Node controller supports planning and verification, but v1 mutation is limited to the shell bootstrap script.

Unsupported architecture paths include SSH-driven orchestration, Windows-to-Linux remote execution, staged remote scripts, manual fallback install sequences, provider login, browser/device-code auth automation, Tailscale enrollment, persistent service launch, reboot, and destructive cleanup.

## Entry Points

- `scripts/bootstrap-linux.sh --install-kendall-vnxt`: only mutating install command.
- `pnpm run linux:bootstrap --plan`: local non-mutating plan.
- `pnpm run linux:bootstrap --verify-only`: local non-mutating readiness verification, with approved evidence writes where configured.
- `scripts/validate-linux-install.sh --verify-only`: toolchain, repo, and agent CLI validation.
- `scripts/check-linux-bootstrap-evidence.mjs`: evidence packet validator.

## Implementation Components

- `scripts/linux-bootstrap.mjs`: repo-owned controller entry point for plan and verify behavior.
- `scripts/lib/linux-bootstrap/args.mjs`: argument parsing and unsupported mode rejection.
- `scripts/lib/linux-bootstrap/gates.mjs`: local identity, OS, sudo, disk, DNS, evidence path, repo, and verification gates.
- `scripts/lib/linux-bootstrap/executor.mjs`: bounded local command execution and redacted command summaries.
- `scripts/lib/linux-bootstrap/evidence.mjs`: schema-compliant evidence packet creation.
- `tests/linux-bootstrap/*.test.mjs`: parser, gate, executor, evidence, idempotency, and auth-boundary tests.

## Gate Architecture

The implementation uses ordered gates:

- `local-preflight`
- `local-identity`
- `evidence-path`
- `base-tools`
- `repo-state`
- `install-script`
- `full-verify`
- `evidence-write`
- `manual-auth-summary`

Every gate emits an id, status, summary, recovery guidance, timestamp, and evidence-safe command or context summary.

## Evidence Architecture

Evidence is stored under `docs/linux-install/evidence/`, must follow `docs/linux-install/evidence/schema.md`, and must never overwrite an existing packet. After the repo evidence directory is validated, success and failure outcomes write evidence files. Repo-access blockers before evidence directory availability emit schema-compliant stdout evidence while progress logs stay on stderr.

Evidence must include command mode, redacted command, host identity, OS/version, architecture, repo path/state, gate outcomes, tool versions, changed versus pre-existing tools, manual auth tasks, auth-boundary proof, result, rerun guidance, and recovery instructions.

## Authority And Auth Architecture

Allowed unattended work includes docs/scripts/tests edits, local non-mutating checks, and redacted repo evidence writes. Package install, global tool install, reboot, cleanup, PR creation, merge, and workspace cleanup require matching bounded authority where applicable.

Manual auth and provider boundaries are never automated by bootstrap. GitHub repo auth may be a user-performed pre-clone step when private repo access is required. Codex, Claude, Tailscale, and provider auth remain post-deployment user tasks.

## Autonomous Goal Run Architecture

Autonomous `/goal` implementation uses `docs/linux-install/goal-run-contract.md` as the durable control plane. Each task has a state, mapped PRD requirements, dependencies, authority class, allowed mode, command contract, evidence paths, completion condition, blocked condition, and resume command.

The Goal Run Contract requires:

- bounded authority ledger entries,
- command contracts for runnable story commands,
- blocker packets for gated operations,
- deterministic safe continuation,
- completion reports generated from state and evidence,
- PR creation, merge, and cleanup only as terminal delivery operations.

## Release Gate Architecture

`docs/linux-install/release-gate-traceability.md` maps the product requirements to release gates LG-01 through LG-16. Stories must add pre-execution traceability rows before execution, including task id, story, FRs, Linux acceptance criteria, authority class, command ids, expected evidence, and release gates.

## Additional Requirements For Story Creation

- Include a story for public command/source reachability before the GitHub `main` command is treated as feature-complete.
- Include a story for first-install fresh Ubuntu 26.04+ evidence capture and validation.
- Include a story for idempotent rerun evidence capture and validation.
- Include a story for evidence, docs, troubleshooting, lessons learned, and validation matrix refresh after real-host execution.
- Include a story for release packaging refresh only after implementation and evidence are ready for PR.
- Include a story for code review and findings resolution before delivery.
- Preserve provider-login, Tailnet, reboot, destructive cleanup, PR creation, merge, and workspace cleanup as explicit authority-gated or terminal-delivery boundaries.
