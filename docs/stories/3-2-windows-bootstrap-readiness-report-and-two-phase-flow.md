# Story 3.2: Windows Bootstrap Readiness Report And Two-Phase Flow

Status: done
## Status

Ready for Review

## Story

As an operator,
I want the Windows VM bootstrap to produce durable readiness evidence and separate local setup from live remote proof,
so that a fresh or suspect Windows 11 VM can be trusted without relying on plaintext GitHub CLI tokens.

## Acceptance Criteria

1. Bootstrap prints OS, PowerShell, architecture, execution policy, Git, Node, pnpm, uv, and supervisor Python runtime evidence.
2. Bootstrap can write a redacted readiness report without secrets.
3. Documentation recommends a two-phase fresh VM flow: local setup/dependency sync first, live remote proof second.
4. `-VerifyRemote` checks Git Credential Manager before live remote checks and gives an interactive-session recovery hint for DPAPI failures.
5. Bootstrap reports VMware Workstation posture, VMware Tools status, memory, disk, Windows long-path support, Developer Mode posture, Git identity, Git long-path posture, GitHub CLI posture, and GitHub network posture before live remote proof.
6. Bootstrap refreshes PATH after winget or Corepack setup attempts.
7. Bootstrap supports local-only verification when live remote proof is intentionally skipped.
8. Bootstrap requires the tracked BMAD method runtime files and required BMAD/KNX modules before declaring local readiness.
9. The full workspace check remains green.

## Implementation Notes

- Added `-LocalOnly`, `-WriteReport`, and `-ReportPath` to `scripts/bootstrap-windows.ps1`.
- Added machine and tool version summaries to bootstrap output.
- Added VMware, Windows feature, Git, GitHub CLI, and network posture checks.
- Added supervisor Python runtime verification through `uv`.
- Added required BMAD method and BMAD/KNX module checks.
- Added redacted JSON readiness reports under `.data/bootstrap/`.
- Kept GitHub CLI auth optional and avoided any token creation or token-file reads.
- Updated `docs/bootstrap-windows-vm.md` with two-phase setup and report guidance.

## Verification

- `powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap-windows.ps1 -LocalOnly -WriteReport`
- `powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap-windows.ps1 -VerifyRemote -WriteReport`
- `pnpm run check`

## Safety Gates Upheld

- No plaintext GitHub CLI token is created.
- No GitHub CLI auth is required.
- No external model/provider setup is added.
- No worker execution authority is enabled.
- No source mutation beyond this scoped script/doc/story update.
