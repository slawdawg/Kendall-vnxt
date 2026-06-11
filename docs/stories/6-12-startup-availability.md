# Story 6.12: Startup Availability

Date: 2026-06-10
Status: done

## Story

As Bob,
I want the supervisor backend and Dev Console to be available after VM logon,
so that Mission Control is ready without manually starting services.

## Context

The repo already tracks Windows startup helpers that register per-user logon tasks for Dashboard, Supervisor, and an interactive Codex terminal. This story hardens the availability proof by adding a verifier for registered tasks and live endpoints.

## Acceptance Criteria

1. Startup verification checks that Dashboard, Supervisor, and Codex startup scripts exist in the repo.
2. Startup verification checks that per-user Windows logon tasks are registered and point at the current repo.
3. Startup verification checks Supervisor `/health` and the Dev Console URL unless endpoint checks are explicitly skipped.
4. Startup verification can write a redacted readiness report under `.data/startup/`.
5. Bootstrap/runbook docs tell Bob how to install startup tasks and verify them.
6. The story does not create provider calls, worker launch authority, source mutation by workers, Git operations, GitHub operations, or cleanup automation.

## Authority

Allowed:

- Windows startup verification script,
- local endpoint health checks,
- documentation updates,
- script syntax validation.

Blocked:

- remote operations,
- provider/model calls,
- Codex/Claude worker launch,
- arbitrary command execution beyond verification scripts,
- Git/GitHub mutation,
- cleanup automation.

## Verification

Required focused checks:

- PowerShell parser validation for Windows startup scripts,
- docs index check,
- full local check if shared docs or scripts affect drift checks.
