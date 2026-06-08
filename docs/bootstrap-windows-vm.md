# Windows 11 VM Bootstrap

Use this flow to resume Kendall_Nxt work on a fresh Windows 11 VM without relying on local GitHub CLI auth or plaintext tokens.

## Fresh VM Flow

1. Install or confirm Git.
2. Clone the repo:

```powershell
git clone https://github.com/slawdawg/Kendall-vnxt.git C:\Users\slaw_dawg\Kendall_Nxt
cd C:\Users\slaw_dawg\Kendall_Nxt
```

3. Run the bootstrap:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap-windows.ps1 -Full
```

If required tools are already installed and you only want to verify the machine:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap-windows.ps1 -VerifyRemote
```

On an already bootstrapped machine, the pnpm alias is also available:

```powershell
pnpm run bootstrap:windows -- -VerifyRemote
```

## What The Bootstrap Does

- checks Git, Node.js, pnpm/Corepack, and uv,
- optionally installs missing required tools with winget when `-InstallMissing` or `-Full` is used,
- configures Git Credential Manager with Windows DPAPI when `-ConfigureGit` or `-Full` is used,
- installs JavaScript dependencies and syncs the supervisor Python virtualenv when `-SetupDeps` or `-Full` is used,
- runs `pnpm run preflight`,
- runs `pnpm run doctor:github`, with live remote checks when `-VerifyRemote` or `-Full` is used,
- optionally runs `pnpm run check` when `-RunCheck` or `-Full` is used.

## Auth Policy

The preferred setup is:

- Git Credential Manager with Windows DPAPI for `git fetch`, `git pull`, and `git push`.
- GitHub connector/app for Codex PR inspection, PR metadata updates, and merge actions.
- Local GitHub CLI auth only when a workflow explicitly shells out to `gh`.

Do not use `gh auth login --insecure-storage` as a persistent setup. It stores a GitHub CLI token in the local filesystem. If it is ever used as a temporary diagnostic workaround, run `gh auth logout` immediately afterward.

## Useful Commands

```powershell
pnpm run doctor:github -- --remote
pnpm run check
git status --short --branch
```

## DPAPI Or Credential Store Failure

If live remote checks fail with a message like `Key not valid for use in specified state`, `ProtectedData`, `DPAPI`, or `Access is denied`, the Windows credential store is not usable from that execution context. Run the bootstrap from a normal visible PowerShell session after signing into the VM, or run:

```powershell
git credential-manager diagnose
powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap-windows.ps1 -VerifyRemote
```

Do not work around this by keeping a persistent `gh auth login --insecure-storage` token. The preferred fix is a healthy Windows user session with Git Credential Manager using DPAPI.
