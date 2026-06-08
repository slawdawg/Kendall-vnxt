# Fresh VM Acceptance Checklist

Use this checklist before treating a new Windows 11 VM as a reliable Kendall_Nxt work environment.

## VM Baseline

- Windows 11 Pro guest is installed.
- VMware Tools is installed and running.
- VM has at least 16 GB RAM available.
- System drive has at least 25 GB free after dependency install.
- PowerShell runs as a 64-bit process.
- Windows long paths are enabled.
- Developer Mode is enabled or its absence is accepted as a warning.

## Repo And Bootstrap

- Repo is cloned to `C:\Users\slaw_dawg\Kendall_Nxt`.
- `main` is synced with `origin/main`.
- BMAD method files are present under `_bmad/`.
- Required BMAD and KNX skills are present under `.agents/skills/`.
- Local setup command passes:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap-windows.ps1 -InstallMissing -ConfigureGit -SetupDeps -WriteReport
```

- Remote proof command passes from a visible interactive PowerShell session:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap-windows.ps1 -VerifyRemote -RunCheck -WriteReport
```

- Latest readiness report under `.data/bootstrap/` shows `remote-ready`.

## Auth And GitHub

- Git Credential Manager uses Windows DPAPI.
- `git fetch origin` succeeds.
- `git ls-remote --heads origin main` succeeds.
- Local `gh` auth is not required.
- No persistent `gh auth login --insecure-storage` token is kept.
- If local `gh` is logged in, the operator intentionally approved that for a workflow that shells out to `gh`.
- Codex GitHub connector/app can inspect the repository or recent PRs.

## Verification

- `pnpm run doctor:github -- --remote` passes.
- `pnpm run check` passes.
- Bootstrap local-only smoke check passes:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap-windows.ps1 -LocalOnly
```

## Codex Orientation

- Codex starts from the repo root.
- Codex is oriented with:

```text
Read docs/handoffs/current.md and continue from it. Use the repo state as source of truth.
```

## Acceptance Decision

The VM is accepted only when local setup, remote proof, workspace check, GitHub connector inspection, and Codex orientation have all succeeded.

If any item fails, keep the VM in setup/debug mode and do not start new product work from it yet.
