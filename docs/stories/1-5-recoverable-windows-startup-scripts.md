# Story 1.5: Recoverable Windows Startup Scripts

Status: done

## Story

As a Kendall_vNxt operator,
I want the Windows startup helpers to be tracked and repo-relative,
so that the local environment remains recoverable without machine-specific hardcoded paths.

## Acceptance Criteria

1. The Windows startup scripts under `scripts/windows/` are tracked in Git.
2. The scripts derive `RepoRoot` from their own location when it is not explicitly provided.
3. The launcher scripts avoid hardcoded absolute repo paths.
4. The PowerShell scripts remain syntactically valid after the portability changes.
5. Existing checks remain green.

## Tasks / Subtasks

- [x] Make the Windows startup scripts repo-relative and portable. (AC: 2, 3)
- [x] Track the scripts in Git as part of the recoverable environment boundary. (AC: 1)
- [x] Run syntax checks and full project checks. (AC: 4, 5)

## Dev Notes

This is a recovery/support slice rather than routing behavior. It closes the gap between the tracked README/docs and the currently untracked Windows startup helpers.

## Verification

- PowerShell parser validation for each `.ps1` script
- `pnpm run check`
- `git diff --check`

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- PowerShell parser validation passed for the tracked `.ps1` startup scripts.
- `pnpm run check` passed after the portability updates.
- `git diff --check` passed.

### Completion Notes List

- Removed hardcoded absolute repo paths from the Windows launcher chain and made `RepoRoot` derive from script location when omitted.
- Kept the existing startup behavior and logging shape while making the scripts recoverable from a fresh checkout path.
- Tracked the startup helpers in Git so the README and recovery boundary docs now point at real committed assets.

### File List

- scripts/windows/Install-KendallNxtStartup.ps1
- scripts/windows/Start-KendallNxtDashboard.ps1
- scripts/windows/Start-KendallNxtSupervisor.ps1
- scripts/windows/Launch-KendallNxtAtLogon.cmd
- scripts/windows/Launch-KendallNxtAtLogon.vbs
- docs/stories/1-5-recoverable-windows-startup-scripts.md

## Change Log

- 2026-06-08: Story created for Windows startup script recoverability.
- 2026-06-08: Implemented repo-relative startup scripts and tracked them as recoverable assets; status moved to done.
