# WSL GitHub Credential Options

Date: 2026-06-15
Status: applied for current WSL evaluation

## Purpose

Use this note before treating WSL2 as delivery-ready for Kendall_Nxt.

WSL2 local build and test checks can pass without GitHub credentials, but
primary development also needs non-interactive private-repo Git operations:

- `git ls-remote origin HEAD`
- fresh clone into the WSL filesystem
- fetch/pull checks
- PR delivery tooling when explicitly requested

## Current Finding

The evaluated Ubuntu WSL2 environment has Git, Node, pnpm, uv, and GitHub CLI.
After Bob approved authentication on 2026-06-15, the evaluated WSL user
context has an authenticated GitHub credential path:

- `gh` is installed from Ubuntu packages.
- `gh auth status` reports `slawdawg` logged into `github.com`.
- `gh auth setup-git` has configured Git HTTPS credential integration.
- `GIT_TERMINAL_PROMPT=0 git ls-remote https://github.com/slawdawg/Kendall-vnxt.git HEAD`
  succeeds for the private repo.
- Public GitHub smart HTTP works, so the remaining private-repo blocker is
  cleared for the current WSL environment.

The current evidence was collected from the WSL user context used by
`wsl.exe -d Ubuntu -- ...`, which stored GitHub CLI state under
`/root/.config/gh/hosts.yml` during the evaluation. Treat that as root-context
WSL evidence. It is not proof that a later non-root WSL user is authenticated.

## Candidate Strategies

Use one of these strategies if WSL auth expires or a different WSL user/distro
needs setup:

1. Authenticate the installed GitHub CLI inside WSL.
2. Configure a Git credential helper in WSL, such as Git Credential Manager, if
   Bob wants credentials shared or managed consistently with Windows.
3. Use SSH keys inside WSL with an explicit key storage and passphrase policy.

Do not store raw tokens in repo files, shell history, handoff docs, or evidence
records.

## Approval Boundary

Installing a credential tool mutates the WSL environment. Authenticating stores
or brokers credentials. Treat future setup as separate approvals:

- Setup approval: install the selected WSL credential tool.
- Credential approval: authenticate or configure the selected credential path.

After approval or credential refresh, rerun:

```powershell
wsl.exe -d Ubuntu --user root -- git config --global --get-all credential.helper
wsl.exe -d Ubuntu --user root -- gh auth status
wsl.exe -d Ubuntu --user root -- env GIT_TERMINAL_PROMPT=0 git ls-remote https://github.com/slawdawg/Kendall-vnxt.git HEAD
```

If evaluating a non-root WSL user, replace `--user root` with that exact user
and record the credential path separately.
