# Story 3.3: Fresh VM Acceptance Checklist And Current Handoff

## Status

Ready for Review

## Story

As an operator,
I want a stable Codex handoff pointer and fresh VM acceptance checklist,
so that a clean Windows 11 VM can be accepted for work without guessing which dated handoff or bootstrap output is authoritative.

## Acceptance Criteria

1. The repo has a stable `docs/handoffs/current.md` entry point for new Codex sessions.
2. The fresh VM bootstrap flow points Codex at `docs/handoffs/current.md`.
3. The bootstrap script prints the current handoff path and acceptance checklist path after successful local or remote readiness.
4. The repo includes a fresh VM acceptance checklist covering VMware, Windows, repo, BMAD/KNX, Git/GCM/GitHub, verification, and Codex connector orientation.
5. Existing date-specific handoff remains available and is referenced by the stable current handoff.
6. Workspace verification remains green.

## Implementation Notes

- Added `docs/handoffs/current.md`.
- Added `docs/fresh-vm-acceptance-checklist.md`.
- Updated `docs/bootstrap-windows-vm.md` to use the current handoff pointer.
- Updated `scripts/bootstrap-windows.ps1` to print the current handoff and checklist paths.
- Updated `docs/handoffs/codex-fresh-vm-orientation-2026-06-08.md` to point fresh Codex sessions through the stable handoff path.

## Verification

- `powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap-windows.ps1 -LocalOnly`
- `pnpm run check`

## Safety Gates Upheld

- No local GitHub CLI token is created.
- No external sends are added.
- No worker execution authority is enabled.
- No credential access is introduced.
