# WSL Command Boundary Notes

Date: 2026-06-15
Status: evaluation guidance

## Purpose

Use this note when a Windows-hosted Codex session needs to run small WSL2
diagnostics for Kendall_Nxt platform evaluation.

The goal is to avoid handcrafting complex nested PowerShell-to-Bash quoting.
If a command needs quotes, variables, pipes, JavaScript snippets, or multiple
shell statements, prefer a checked-in script, a WSL-side shell script, or a
single-purpose command that does not depend on nested escaping.

## Known Failure Pattern

These shapes are fragile from Windows PowerShell through `wsl.exe`:

- `wsl.exe ... bash -lc 'node -e ...'`
- `wsl.exe ... bash -lc 'pgrep -af "git|vim|nvim|node"'`
- Inline JavaScript or POSIX commands that require both PowerShell and Bash
  quoting to preserve the same argument.

Observed failures included PowerShell parser errors, lost argument quotes, and
accidental pipeline interpretation.

## Safer Probe Pattern

Prefer one command per process name or tool:

```powershell
wsl.exe -d Ubuntu -- bash -lc 'command -v node || true'
wsl.exe -d Ubuntu -- bash -lc 'pgrep -af git || true'
wsl.exe -d Ubuntu -- bash -lc 'pgrep -af node || true'
```

Prefer direct tool/version checks:

```powershell
wsl.exe -d Ubuntu --cd /root/src/Kendall_Nxt_eval -- node --version
wsl.exe -d Ubuntu --cd /root/src/Kendall_Nxt_eval -- pnpm --version
wsl.exe -d Ubuntu --cd /root/src/Kendall_Nxt_eval -- uv --version
```

For anything more complex, write or reuse a script inside the WSL filesystem
and invoke the script by path. Do not keep retrying inline quoting variants.

## Stop Line

After two failed PowerShell-to-WSL quoting attempts, stop and route through
`docs/workflows/tool-churn-rca.md`.

