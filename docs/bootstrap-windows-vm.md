# Windows 11 VM Bootstrap

Use this flow to resume Kendall_Nxt work on a fresh Windows 11 VM without relying on local GitHub CLI auth or plaintext tokens.

## Fresh VM Flow

1. Install or confirm Git.
2. Clone the repo:

```powershell
git clone https://github.com/slawdawg/Kendall-vnxt.git C:\Users\slaw_dawg\Kendall_Nxt
cd C:\Users\slaw_dawg\Kendall_Nxt
```

3. Run local setup first:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap-windows.ps1 -InstallMissing -ConfigureGit -SetupDeps -WriteReport
```

4. Prove live Git remote readiness from a visible interactive PowerShell session:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap-windows.ps1 -VerifyRemote -RunCheck -WriteReport
```

5. Start Codex from the repo root and orient it with:

```text
Read docs/handoffs/current.md and continue from it. Use the repo state as source of truth.
```

To start the Kendall_Nxt services and Codex automatically whenever this Windows user logs in, run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows\Install-KendallNxtStartup.ps1
```

This creates per-user logon tasks for the dashboard, supervisor, and a visible Codex terminal. Codex is interactive, so the supported automatic launch point is Windows logon rather than pre-login boot.

If required tools are already installed and you only want to verify the machine:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap-windows.ps1 -VerifyRemote
```

`-Full` is available as a one-shot setup when VM credentials are already healthy:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap-windows.ps1 -Full
```

On an already bootstrapped machine, the pnpm alias is also available:

```powershell
pnpm run bootstrap:windows -- -VerifyRemote
```

## What The Bootstrap Does

- checks Git, Node.js, pnpm/Corepack, and uv,
- prints OS, PowerShell, architecture, execution policy, and tool versions,
- reports VMware Workstation posture, VMware Tools status, memory, free disk, Windows long-path support, and Developer Mode posture,
- verifies the BMAD method runtime files and required BMAD/KNX modules are installed from the repo,
- optionally installs missing required tools with winget when `-InstallMissing` or `-Full` is used,
- attempts to update App Installer/winget before installing missing tools,
- falls back to direct official installers for Git, Node.js 24, and uv when winget is broken or unavailable,
- installs and verifies the OpenAI Codex CLI with npm,
- refreshes PATH after winget/Corepack setup attempts,
- persists known Git, uv, NVM, and Node shim directories to the user PATH when present,
- prefers Windows `.cmd` shims for Node tools so PowerShell execution policy does not block pnpm/npm/Corepack,
- sets the CurrentUser PowerShell execution policy to `RemoteSigned` when no Group Policy controls it, so local pnpm/npm/Corepack `.ps1` shims run in normal shells,
- configures Git Credential Manager with Windows DPAPI when `-ConfigureGit` or `-Full` is used,
- configures Git `core.longpaths=true` when `-ConfigureGit` or `-Full` is used,
- warns when Git commit identity is not configured,
- checks GitHub CLI posture without requiring local `gh` auth,
- installs JavaScript dependencies and syncs the supervisor Python virtualenv when `-SetupDeps` or `-Full` is used,
- verifies the supervisor Python runtime through uv,
- runs `pnpm run preflight`,
- runs `pnpm run doctor:github`, with live remote checks when `-VerifyRemote` or `-Full` is used,
- optionally runs `pnpm run check` when `-RunCheck` or `-Full` is used,
- writes a redacted readiness report under `.data/bootstrap/` when `-WriteReport` or `-Full` is used.

## Readiness Reports

Use `-WriteReport` when preparing a new VM or debugging a suspect one. Reports are written under `.data/bootstrap/` and include machine metadata, tool versions, readiness level, command labels, exit codes, warnings, and failures.

The report intentionally excludes GitHub tokens, credential values, environment variable values, and command output that could contain secrets.

Readiness levels:

- `local-ready`: dependencies and local checks passed, but live Git remote checks were not proven.
- `remote-ready`: local checks and live Git/GCM remote checks passed.
- `not-ready`: bootstrap stopped before local readiness.

## VMware And Windows Posture

The bootstrap is designed for a Windows 11 guest under VMware Workstation. It reports, and may warn on:

- non-Windows-11 OS version,
- 32-bit PowerShell process,
- low VM memory,
- low system-drive free space,
- VMware Tools missing or stopped,
- Windows long paths disabled,
- Developer Mode disabled,
- missing Git user identity,
- Git `core.longpaths` disabled.

Low disk space below 10 GB and 32-bit PowerShell are hard failures. The other findings are warnings because they may not block immediate local work, but they are signals that the VM is not fully comfortable or reproducible yet.

## Required BMAD And KNX Modules

Fresh VM readiness requires the tracked BMAD method files and required local modules to be present. The bootstrap fails before dependency setup if these are missing or partial.

Required BMAD surface:

- `_bmad/config.yaml`
- `_bmad/config.user.yaml`
- `_bmad/core`
- `_bmad/bmb`
- `_bmad/bmm`
- `_bmad/tea`
- `_bmad/module-help.csv`
- `bmad-brainstorming`
- `bmad-create-story`
- `bmad-dev-story`
- `bmad-module-builder`
- core BMAD agent skills for analyst, architect, dev, and PM

Required KNX surface:

- `knx-setup`
- `knx-agent-governance-coordinator`
- `knx-data-boundary-plan`
- `knx-execution-policy`
- `knx-mature-tool-review`
- `knx-module-strategy`
- `knx-profile-setup`
- `knx-safety-validation-review`
- `knx-source-evidence-contract`
- `knx-source-evidence-validator`

## Auth Policy

The preferred setup is:

- Git Credential Manager with Windows DPAPI for `git fetch`, `git pull`, and `git push`.
- GitHub connector/app for Codex PR inspection, PR metadata updates, and merge actions.
- Local GitHub CLI auth only when a workflow explicitly shells out to `gh`.

Do not use `gh auth login --insecure-storage` as a persistent setup. It stores a GitHub CLI token in the local filesystem. If it is ever used as a temporary diagnostic workaround, run `gh auth logout` immediately afterward.

## Useful Commands

```powershell
pnpm run doctor:github -- --remote
pnpm run check:docs
pnpm run check:e2e-report
pnpm run check:reports
pnpm run check:runbooks
pnpm run check:runtime-export
pnpm run check:safe-backlog
pnpm run check:managed-recipes
pnpm run check
git status --short --branch
```

If a shell was already open before bootstrap repaired PATH, refresh it or open a new PowerShell window before testing plain `git`, `uv`, or `pnpm` commands:

```powershell
$env:Path = [Environment]::GetEnvironmentVariable('Path','User') + ';' + [Environment]::GetEnvironmentVariable('Path','Machine')
```

## Codex Orientation

Fresh Codex sessions should read:

```text
docs/handoffs/current.md
```

The current handoff points at the active date-specific orientation file. It summarizes current commits, auth policy, BMAD/KNX requirements, safety gates, verification commands, and the connector-backed GitHub workflow expectation.

For connector-backed PR inspection or creation, use:

```text
docs/github-connector-workflow.md
```

## Acceptance Checklist

Before doing product work on a fresh VM, complete:

```text
docs/fresh-vm-acceptance-checklist.md
```

## DPAPI Or Credential Store Failure

If live remote checks fail with a message like `Key not valid for use in specified state`, `ProtectedData`, `DPAPI`, or `Access is denied`, the Windows credential store is not usable from that execution context. Run the bootstrap from a normal visible PowerShell session after signing into the VM, or run:

```powershell
git credential-manager diagnose
powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap-windows.ps1 -VerifyRemote
```

Do not work around this by keeping a persistent `gh auth login --insecure-storage` token. The preferred fix is a healthy Windows user session with Git Credential Manager using DPAPI.

## GitHub CLI

Local `gh` auth is optional. Bootstrap checks the GitHub CLI posture but does not require login. If `gh` auth is present, the bootstrap warns so the operator remembers that any file-backed GitHub CLI token is sensitive and should not be kept as a workaround for GCM/DPAPI problems.
