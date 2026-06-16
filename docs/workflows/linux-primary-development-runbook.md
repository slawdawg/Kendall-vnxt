# Linux Primary Development Runbook

Date: 2026-06-16
Status: active primary-development baseline

## Purpose

Use the full Linux VM as the primary Kendall_Nxt development platform. The
Windows machine remains the current operator host for SSH access and private-key
storage, not the planned development fallback.

This runbook is based on `docs/platform-evaluation-sprint.md` and the fresh
Linux install evidence under `docs/linux-install/evidence/`.

For repeatable Linux provisioning work, use
`docs/linux-install/implementation-plan.md` as the governing plan. That plan
requires contract-first, verify-only-first implementation and gates remote VM
mutation behind explicit Bob approval.

## Current Target

| Field | Value |
| --- | --- |
| VM hostname / display name | `Kendall_vNxt` |
| SSH target | `kendall-linux` alias for `slaw_dawg@192.168.1.8` |
| Address stability | `192.168.1.8` is the current observed address; prefer the SSH alias in commands |
| SSH key | `%USERPROFILE%\.ssh\kendall_linux_vm_eval_ed25519` |
| OS | Ubuntu 26.04 LTS |
| Repo path | `/home/slaw_dawg/Kendall_Nxt` |
| Branch | `main...origin/main` |
| Node | `v22.22.1` |
| pnpm | `11.5.2` |
| uv | `0.11.21`, system-visible through `/usr/local/bin/uv` |
| gh | `2.46.0`; authentication is user-configured post-deployment when needed |
| Codex CLI | `codex-cli 0.140.0` |
| Claude Code | `2.1.178` |
| BMAD Method CLI | `6.8.0` |

## Connect

From the current operator host:

```powershell
ssh kendall-linux
```

For one-off non-interactive checks:

```powershell
ssh kendall-linux 'cd /home/slaw_dawg/Kendall_Nxt && pnpm run preflight'
```

If the VM IP changes, update the `HostName` for `kendall-linux` in the host
SSH config. Do not change routine commands to raw IP addresses.

If the Linux OS reports a normalized hostname such as `kendallvnxt`, record it
as the OS hostname while keeping `Kendall_vNxt` as the VM/display identity.

Avoid complex nested quoting from the host shell into SSH. Prefer simple
commands or checked-in scripts. If a command needs pipes, variables, regexes,
or inline JavaScript, put it in a Linux-side script or run it from an
interactive SSH session.

## Daily Readiness Check

Run this at the start of a Linux VM work session:

```bash
cd /home/slaw_dawg/Kendall_Nxt
git status --short --branch
node --version
pnpm --version
uv --version
gh --version
codex --version
claude --version
bmad-method --version
pnpm run preflight
node ./scripts/codex-workspace.mjs doctor
```

Expected:

- Git reports `main...origin/main` or an intentional task branch.
- Node is in the repo-supported range `>=22 <25`.
- pnpm resolves to `11.5.2` in the repo.
- uv resolves without a PATH override.
- gh is installed. Authentication is not required for base readiness.
- Codex CLI, Claude Code, and BMAD Method are installed. Provider login/use is
  post-deployment and governed by `docs/linux-install/provider-login-policy.md`.
- preflight passes.
- workspace doctor passes. A missing state root warning is acceptable before
  the first workspace start.

## Full Verification

Use the full check before promoting Linux-only workflow changes or declaring
the VM ready after maintenance:

```bash
cd /home/slaw_dawg/Kendall_Nxt
pnpm run check
```

Current Linux VM evidence:

- Full `pnpm run check` passed after clean VM creation, toolchain install,
  GitHub auth, repo clone, and setup.
- Supervisor tests passed as `205 passed, 1 warning`.
- Reboot proof passed.
- Real work-cycle proof passed.
- VM snapshot was taken after proof.
- Codex CLI, Claude Code, and BMAD Method CLI were installed and verified after
  gap reviews.
- Playwright browser/e2e proof passed after updating `@playwright/test` to
  `1.61.0`, installing browser dependencies interactively, and fixing brittle
  dashboard assertions. Current evidence: `25 passed`.
  See `docs/linux-install/evidence/fresh-vm-playwright-e2e-2026-06-16.md`.

## Development Servers

Supervisor:

```bash
cd /home/slaw_dawg/Kendall_Nxt
pnpm run dev:supervisor
```

Dashboard:

```bash
cd /home/slaw_dawg/Kendall_Nxt
pnpm run dev:dashboard
```

Default URLs:

- Dashboard: `http://<current-kendall-linux-address>:3000`
- Supervisor API: `http://<current-kendall-linux-address>:8000`

The repo commands bind to `0.0.0.0` by default, so LAN access should work when
the VM firewall allows the ports. Resolve `<current-kendall-linux-address>`
from the `kendall-linux` SSH alias or the approved stable DNS/Tailscale name;
do not hardcode the observed DHCP address into new docs or scripts.

## Process Cleanup

Check for stale development processes:

```bash
pgrep -x node || true
pgrep -x pnpm || true
pgrep -x python || true
```

Use exact process-name probes first. Avoid broad `pgrep -af` regexes through
host-to-SSH command strings because nested quoting has already produced
misleading results during the platform evaluation.

If a process must be stopped, inspect it first:

```bash
ps -fp <pid>
```

Then stop the specific process only when it belongs to the current repo task.

## Codex Workspaces

Use the repo-owned workspace protocol from the Linux clone:

```bash
cd /home/slaw_dawg/Kendall_Nxt
node ./scripts/codex-workspace.mjs doctor
node ./scripts/codex-workspace.mjs list
```

For temporary smoke tests, use isolated `/tmp` state and worktree roots so
durable task state is not polluted:

```bash
node ./scripts/codex-workspace.mjs start "linux vm platform eval smoke" \
  --mode experiment \
  --no-fetch \
  --task-id linux-vm-platform-eval-smoke \
  --branch codex/linux-vm-platform-eval-smoke \
  --worktree /tmp/kendall-linux-vm-eval-worktrees/linux-vm-platform-eval-smoke \
  --state-root /tmp/kendall-linux-vm-eval-state
```

Clean temporary smoke worktrees explicitly after verification:

```bash
git worktree remove /tmp/kendall-linux-vm-eval-worktrees/linux-vm-platform-eval-smoke
git branch -D codex/linux-vm-platform-eval-smoke
rm -rf /tmp/kendall-linux-vm-eval-state /tmp/kendall-linux-vm-eval-worktrees
```

Do not use the temporary cleanup commands for durable task workspaces.

## Credentials

Current GitHub state:

- `gh auth status` passes as `slawdawg`.
- HTTPS Git operations are usable non-interactively.
- Private repo probe passed:

```bash
env GIT_TERMINAL_PROMPT=0 git ls-remote https://github.com/slawdawg/Kendall-vnxt.git HEAD
```

This is post-deployment user auth state, not part of base VM bootstrap. Do not
store raw tokens in the repo, shell history, handoff docs, or evidence records.
If a workflow needs private GitHub access and auth is absent or expired, Bob
refreshes it interactively with `gh auth login`, then rerun:

```bash
gh auth status
env GIT_TERMINAL_PROMPT=0 git ls-remote https://github.com/slawdawg/Kendall-vnxt.git HEAD
```

## Provider CLIs

Codex CLI, Claude Code, and BMAD Method are required for the Linux baseline.

Version checks:

```bash
codex --version
claude --version
bmad-method --version
```

Provider login and usage policy is governed by:

```text
docs/linux-install/provider-login-policy.md
```

Do not automate OpenAI or Anthropic login, token handling, provider calls, paid
usage, or agent execution without separate approval.

## Startup And Session Checks

Inspect VM health:

```bash
uptime -s
systemctl is-system-running
systemctl --user is-system-running
loginctl show-user slaw_dawg -p State -p Linger -p Sessions -p RuntimePath
```

Current evidence:

- System systemd reports `running`.
- User systemd reports `running`.
- `loginctl show-user` reports an active user runtime path.
- Linger is currently `no`.

Do not add automatic startup services until there is an explicit need. Prefer
interactive user-login startup for Codex and development servers unless Bob
approves a service-managed workflow.

## Snapshot And Backup Policy

Baseline snapshot state:

- Bob confirmed a VM snapshot was taken after toolchain, GitHub auth, repo
  setup, full check, reboot proof, real work-cycle proof, and agent CLI
  verification.

Ongoing policy:

- Take a VMware snapshot after the repo, toolchain, GitHub auth, and preflight
  are known good.
- Ensure all intentional work is pushed or otherwise recoverable from Git.
- Do not share live repo files through host-mounted folders for primary work.
  Keep the active repo on the Linux native filesystem.
- Treat `/home/slaw_dawg/Kendall_Nxt`, `/home/slaw_dawg/.config/gh`, and SSH
  key material as sensitive VM state.

## Recovery And Continuity

Use recovery procedures if Linux VM has:

- SSH outage or unknown host-key change.
- GitHub auth failure that cannot be recovered safely.
- Repeated `pnpm run check` failures caused by platform/tooling rather than
  product code.
- Ambiguous worktree state or failed cleanup.
- VM snapshot, disk, or network instability.

Fallback path:

1. Stop active Linux dev servers.
2. Confirm Linux `git status --short --branch`.
3. Push or preserve any intentional Linux work.
4. Restore from Git, VM snapshot, or a fresh Linux install path as appropriate.
5. Record the Linux blocker in `docs/platform-evaluation-sprint.md` before
   retrying migration.

## Cutover Checklist

- [x] SSH key login works.
- [x] Toolchain installed.
- [x] Native clone exists.
- [x] GitHub auth works.
- [x] `pnpm run setup` passes.
- [x] `pnpm run preflight` passes without PATH override.
- [x] `pnpm run check` passes on the fresh VM.
- [x] Reboot proof passes.
- [x] Real Linux work-cycle proof passes.
- [x] Codex CLI installed and verified.
- [x] Claude Code installed and verified.
- [x] BMAD Method CLI installed and verified.
- [x] Dashboard Playwright e2e suite passes on the VM.
- [x] No stale process residue observed after checks.
- [x] Snapshot/backup policy confirmed.
- [x] First normal development task completed from Linux.

Decision: `kendall-linux` is the primary Kendall_Nxt development baseline.
