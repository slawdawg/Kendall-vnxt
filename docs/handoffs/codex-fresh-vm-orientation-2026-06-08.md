# Codex Fresh VM Orientation Handoff

Date: 2026-06-08
Repo: `C:\Users\slaw_dawg\Kendall_Nxt`
Remote: `https://github.com/slawdawg/Kendall-vnxt.git`
Expected branch after bootstrap: `main`

## Use This First

In a fresh Windows 11 VM, after cloning the repo and installing Codex, start Codex from the repo root and say:

```text
Read docs/handoffs/current.md and continue from it. Use the repo state as source of truth.
```

If the terminal is not already in the repo:

```powershell
cd C:\Users\slaw_dawg\Kendall_Nxt
```

## Bootstrap Contract

The VM should be bootstrapped with:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap-windows.ps1 -InstallMissing -ConfigureGit -SetupDeps -WriteReport
powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap-windows.ps1 -VerifyRemote -RunCheck -WriteReport
```

For local-only orientation:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap-windows.ps1 -LocalOnly -WriteReport
```

Bootstrap readiness reports are written under:

```text
.data/bootstrap/
```

These reports are intentionally local runtime evidence and should not contain GitHub tokens or credential values.

## Current Project State

As of this handoff, `main` is synced to `origin/main`.

Latest relevant commits:

- `ed08099 Add fresh VM Codex orientation handoff`
- `eaa03ac Harden bootstrap platform readiness checks`
- `9c7b3a6 Require BMAD modules in Windows bootstrap`
- `bc3f139 Harden Windows bootstrap readiness flow`
- `8513ac5 Add Windows VM bootstrap utility`
- `c571412 Add GitHub sync doctor`
- `6c0f5b3 Complete BMad supervisor architecture slices through Story 2.8`

Current checkpoint:

- Architecture slices through Story 2.8 are merged.
- Story 3.1 GitHub sync doctor is merged.
- Story 3.2 Windows bootstrap readiness report and two-phase flow is implemented and pushed.
- Fresh VM bootstrap now checks VMware, Windows, Git, GCM, GitHub CLI posture, BMAD method files, KNX modules, Node/pnpm, uv/Python, and project preflight.
- Fresh VM acceptance should be tracked against `docs/fresh-vm-acceptance-checklist.md`.

## Auth Policy

Preferred:

- Git Credential Manager with Windows DPAPI for `git fetch`, `git pull`, and `git push`.
- GitHub connector/app for Codex PR inspection, metadata updates, and merge operations.
- Local GitHub CLI auth only when a workflow explicitly shells out to `gh`.

Avoid:

- persistent `gh auth login --insecure-storage`,
- storing GitHub tokens in `hosts.yml`,
- treating `gh auth status` failure as a blocker for connector-backed Codex work.

Expected clean posture:

```powershell
gh auth status
```

may report not logged in. That is acceptable when Git/GCM and the GitHub connector are available.

## Required Local BMAD/KNX Surface

Bootstrap must find the tracked BMAD method files and required modules:

- `_bmad/config.yaml`
- `_bmad/config.user.yaml`
- `_bmad/core`
- `_bmad/bmb`
- `_bmad/bmm`
- `_bmad/tea`
- `_bmad/module-help.csv`
- `.agents/skills/bmad-brainstorming`
- `.agents/skills/bmad-create-story`
- `.agents/skills/bmad-dev-story`
- `.agents/skills/bmad-module-builder`
- `.agents/skills/bmad-agent-analyst`
- `.agents/skills/bmad-agent-architect`
- `.agents/skills/bmad-agent-dev`
- `.agents/skills/bmad-agent-pm`
- `.agents/skills/knx-*`
- `.agents/skills/knx-source-evidence-validator`

If these are missing, do not continue implementation. Restore the repo or rerun bootstrap after a clean clone.

## Safety Boundaries

Do not enable without an explicit new decision record:

- real subscription-agent launch,
- local model/provider HTTP calls,
- premium execution,
- arbitrary worker shell execution,
- worker source mutation,
- credential access,
- customer/production access,
- external sends,
- background runtime assistant behavior,
- destructive Git or filesystem actions.

The current supervisor architecture remains control-plane first. Execution attempts remain disabled/mock/non-executing except for existing guarded deterministic utility behavior.

## Verification Commands

Use these after code or bootstrap changes:

```powershell
pnpm run doctor:github
pnpm run doctor:github -- --remote
pnpm run check:docs
pnpm run check:documentation-authority
pnpm run check:verification-readiness
pnpm run check:e2e-report
pnpm run check:reports
pnpm run check:execution-boundary
pnpm run check:runbooks
pnpm run check:runtime-export
pnpm run check:safe-backlog
pnpm run check:managed-recipes
pnpm run check:delivery-readiness
pnpm run check:maintenance-readiness
pnpm run check
powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap-windows.ps1 -LocalOnly
```

`pnpm run check` is expected to run preflight, documentation drift checks, documentation authority report drift checks, verification readiness report drift checks, dashboard e2e report drift checks, supervisor report catalog drift checks, execution boundary report drift checks, runbook verification checks, runtime evidence export drift checks, safe backlog drift checks, managed recipe policy drift checks, delivery readiness policy drift checks, maintenance readiness drift checks, dashboard build, and supervisor integration tests through the repo-local uv cache wrapper. A known intermittent `aiosqlite` event-loop warning may appear after tests pass.

## Connector Check

Local shell bootstrap cannot verify the Codex GitHub connector/app. In Codex, use the GitHub connector to list recent PRs or inspect the repository before relying on connector-backed PR automation.

Use this workflow for the connector probe and PR handoff expectations:

```text
docs/github-connector-workflow.md
```

If the connector is unavailable, do not fall back to plaintext `gh` token storage. Either use Git/GCM for ordinary pushes or pause and ask the operator which GitHub path to use.

## Next Recommended Work

Continue with bootstrap/readiness hardening only if a concrete gap appears from a fresh VM test.

Otherwise, continue safe product work from the safe backlog and architecture gap review: prefer larger coherent slices that improve read-only evidence, documentation freshness, static drift checks, or verification coverage. Do not start blocked Ollama or subscription-agent authority stories without explicit approval naming authority and scope.
