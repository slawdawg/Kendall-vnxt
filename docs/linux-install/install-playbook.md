# Kendall Vnxt Ubuntu Deployment Playbook

Status: draft v1

This playbook deploys Kendall Vnxt from GitHub onto a fresh Ubuntu host. The
host can be a physical machine, VM, or cloud instance.

There is only one supported v1 install method:

1. Log in to Ubuntu as a non-root user with sudo permissions.
2. Run one local Kendall Vnxt bootstrap script from that Ubuntu session.
3. The script installs approved tools, clones or validates the repo, runs setup,
   and verifies the install.

No SSH-driven install, remote operator install, staged script workflow, manual
fallback install, or Windows-to-Linux orchestration is supported.

## 1. Prepare The Ubuntu Host

Prepare or choose an Ubuntu host with:

- Ubuntu 26.04 LTS or later.
- A non-root Linux user with sudo permissions.
- Interactive terminal access as that user.
- Outbound network access for GitHub, Ubuntu packages, npm, and uv.
- At least 5 GB free on the user's home filesystem.

Do not copy private keys, start provider authentication, start Tailscale
enrollment, start agent login flows, start long-running services, or reboot as
part of the base install.

## 2. Confirm Local Identity

Sign in as the intended Linux user and run:

```bash
whoami
id
hostname
cat /etc/os-release
command -v sudo
df -h "$HOME"
getent hosts github.com
```

Expected:

- `whoami` is the intended deployment user.
- The user is not `root`.
- Ubuntu version is 26.04 or later.
- `sudo` exists and can prompt normally in the terminal.
- The home filesystem has at least 5 GB free.
- `github.com` resolves.

## 3. Run The Single Local Bootstrap Script

From the local Ubuntu terminal, run the Kendall Vnxt bootstrap script:

```bash
tmp=/tmp/kendall-vnxt-bootstrap.sh; url=https://raw.githubusercontent.com/slawdawg/Kendall-vnxt/main/scripts/bootstrap-linux.sh; if command -v curl >/dev/null 2>&1; then curl -fsSL "$url" -o "$tmp"; elif command -v wget >/dev/null 2>&1; then wget -qO "$tmp" "$url"; else sudo apt-get update && sudo apt-get install -y curl ca-certificates && curl -fsSL "$url" -o "$tmp"; fi && bash "$tmp" --install-kendall-vnxt
```

This command downloads from GitHub `main`. During pre-merge validation, run the
same script content from the current workspace or an explicitly named test
branch and record that source in evidence. Do not claim the GitHub `main`
command is proven until the installer changes are merged to `main`.
The raw bootstrap URL must be reachable by the intended installer audience. If
the repository is private, publish an equivalent bootstrap script as a public
release asset or complete a separately documented pre-authenticated download
step before using the GitHub README command as final install proof.

The supported script mode performs the full base install:

- verifies the local Ubuntu user and OS;
- prompts for sudo normally when needed;
- installs approved OS packages and toolchain dependencies;
- installs `pnpm@11.5.2` and `uv`;
- installs Codex CLI, Claude Code, and BMAD Method CLI;
- clones Kendall Vnxt to `$HOME/Kendall_Nxt` if the repo is missing;
- validates an existing repo if it is already present;
- runs `pnpm run setup`;
- runs final Linux install validation;
- writes timestamped install evidence under
  `$HOME/Kendall_Nxt/docs/linux-install/evidence/`.

The script is idempotent by design: rerunning after success should validate
existing state instead of making destructive changes.

## 4. Repo Access Boundary

The bootstrap script may clone the repo only when repo access already works for
the local user. If private repo access is missing, the script stops and reports
that the user must complete GitHub auth manually before rerunning.

The script must not start GitHub authentication automatically and must not
capture tokens, credential helper output, device codes, or browser auth URLs.

## 5. Auth Boundary

Base Linux bootstrap is complete without:

- OpenAI/Codex login.
- Anthropic/Claude login.
- Tailscale login or Tailnet enrollment.
- Provider calls, paid usage, or agent execution.
- Long-running development services.

If a later workflow needs one of those services, the user performs that login
interactively after base deployment and records only that it was completed. Do
not paste API keys, device codes, auth URLs, or tokens into scripts, chat,
logs, or evidence.

## 6. Evidence And Verification

After the script completes, verify from the local repo checkout:

```bash
cd "$HOME/Kendall_Nxt"
bash scripts/validate-linux-install.sh --verify-only
pnpm run linux:bootstrap -- --verify-only
```

Bootstrap evidence is valid only if it:

- records local execution, not a remote target;
- records the current Linux user and hostname;
- records OS/version and architecture;
- records repo path and repo state;
- distinguishes pre-existing tools from installed or changed tools;
- records skipped/manual auth tasks;
- proves no provider, Codex, Claude, browser, token, or Tailscale login was
  performed;
- includes rerun guidance.

Validate captured bootstrap evidence with:

```bash
pnpm run check:linux-bootstrap-evidence -- <evidence-file>
```

## 7. Completion Checklist

Base Linux bootstrap is complete when:

- The install was run locally inside Ubuntu as the intended non-root sudo user.
- The single bootstrap script completed successfully.
- The repo exists at `$HOME/Kendall_Nxt`.
- `pnpm run setup` has completed.
- `scripts/validate-linux-install.sh --verify-only` passes.
- Codex CLI, Claude Code, and BMAD Method CLI version checks pass.
- Bootstrap evidence validates.

## 8. Full Check Before Reboot

After setup and verify-only pass, run:

```bash
cd "$HOME/Kendall_Nxt"
pnpm run check
```

This proves documentation checks, dashboard production build, and supervisor
tests before reboot proof.

## 9. Playwright Browser And E2E Proof

The full check does not prove browser runtime readiness. On Ubuntu 26.04,
Playwright 1.60.0 cannot install Chromium, so the repo baseline uses
`@playwright/test` 1.61.0 or newer.

Install browser dependencies from the local Linux terminal if sudo is required:

```bash
cd "$HOME/Kendall_Nxt"
pnpm dlx playwright@1.61.0 install-deps chromium
```

Install or refresh browser binaries:

```bash
cd "$HOME/Kendall_Nxt"
pnpm exec playwright install chromium
```

Run the dashboard e2e proof:

```bash
cd "$HOME/Kendall_Nxt"
PLAYWRIGHT_BROWSERS_PATH=$HOME/.cache/ms-playwright pnpm run test:e2e:dashboard
```

Expected: all dashboard e2e tests pass. Record the result as separate evidence
from `pnpm run check`.

## 10. Reboot Proof

After full check and Playwright e2e pass, reboot the host from the local Linux
session:

```bash
sudo reboot
```

After the system returns, rerun verify-only, preflight, and a small toolchain
probe:

```bash
cd "$HOME/Kendall_Nxt"
pnpm run linux:bootstrap -- --verify-only
pnpm run preflight
node ./scripts/codex-workspace.mjs doctor
codex --version
claude --version
bmad-method --version
```

## 11. Real Work-Cycle Proof

Create, verify, and clean up an isolated Codex workspace experiment from the
Linux clone. Use the runbook command in
`docs/workflows/linux-primary-development-runbook.md` and record the result.

## 12. Snapshot

After the toolchain, any needed post-deployment repo access, repo setup, full
check, Playwright e2e, reboot proof, and real work-cycle proof pass, take a
snapshot or backup appropriate for the host type.

Record:

- Snapshot date.
- Repo branch and commit.
- Tool versions.
- Any remaining policy-only gaps.
