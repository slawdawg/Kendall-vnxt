# Linux Baseline Remaining Gaps

Status: open review list
Date: 2026-06-16

The current Linux host is proven for normal repo setup, full `pnpm run check`, reboot,
workspace lifecycle, Codex CLI, Claude Code, BMAD Method CLI, and dashboard
Playwright e2e execution. Remaining items are either runtime hardening work or
policy-only post-deployment boundaries.

## Completed Proof: Playwright Browser Runtime

Observed:

```text
pnpm exec playwright --version -> 1.60.0
~/.cache/ms-playwright -> missing
```

Impact:

- Dashboard production build is proven.
- Supervisor tests are proven.
- Dashboard e2e browser tests were not proven by the original full check.

Follow-up observed during proof:

- Playwright 1.60.0 cannot install Chromium on Ubuntu 26.04:

```text
Playwright does not support chromium on ubuntu26.04-x64
Cannot install dependencies for ubuntu26.04-x64 with Playwright 1.60.0
```

- Playwright 1.61.0 can download Chromium for Ubuntu 26.04:

```bash
pnpm dlx playwright@1.61.0 install chromium
```

- The repo needed `@playwright/test` updated to `1.61.0`.
- After the update, browser launch still needs system libraries, starting with
  `libatk-1.0.so.0`.
- After the operator ran the Playwright dependency installer interactively, the
  e2e suite launched successfully and reached app assertions.
- The brittle dashboard assertions were fixed to avoid shared-state and strict
  locator ambiguity.
- Latest result: `25 passed`.

Proof command:

```bash
cd "$HOME/Kendall_Nxt"
PLAYWRIGHT_BROWSERS_PATH=$HOME/.cache/ms-playwright pnpm run test:e2e:dashboard
```

Evidence: `docs/linux-install/evidence/fresh-vm-playwright-e2e-2026-06-16.md`.

Maintenance note: browser binary and dependency installation remains a
remote-write operation. Future fresh installs should install Playwright 1.61+
and run the browser dependency step interactively if sudo is required.

## Post-Deployment Provider Login Boundary

Provider and repository-service login is intentionally excluded from base Linux
bootstrap. The user performs login after deployment only when a selected
workflow needs that service.

Current boundary:

- CLI install is verified.
- Missing provider auth is not a bootstrap gap.
- Provider login is manual and post-deployment.
- Provider calls, paid usage, token handling, and agent execution still require
  separate approval.

## BMAD Project Upgrade Policy

BMAD Method CLI is installed and the repo already contains `_bmad`, but no
`bmad-method install` or upgrade command has been run on the VM.

Current boundary:

- `bmad-method --version` is verified.
- Project BMAD files are not rewritten.
- Any BMAD install/upgrade command needs a separate diff preview and approval.

## Global Tool Supply-Chain Hardening

The current bootstrap installs some global tools from package registries or
vendor install scripts:

- `pnpm` through npm, pinned to the repo package-manager version.
- Codex CLI, Claude Code, and BMAD Method through npm using the pinned versions
  in `docs/linux-install/global-tool-manifest.json`.
- `uv` through the Astral install script.

Current boundary:

- The bootstrap proves the tools resolve and reports versions.
- Verify-only fails if pnpm, Codex CLI, Claude Code, or BMAD Method version
  drift is detected. Install mode may reinstall the pinned npm package for
  Codex CLI, Claude Code, or BMAD Method through the single supported bootstrap.
- It does not yet prove package integrity, registry provenance, installer
  checksums, or vendor binary provenance.
- Before claiming supply-chain certification, add installer checksum/provenance
  policy where available and evidence that registry-resolved artifacts match
  that policy.

## Backup Restore Proof

A recovery snapshot exists for the current VM-based host, but restore from
snapshot has not been tested.

Current boundary:

- Snapshot is accepted as a recovery point.
- Restore proof remains optional because it is disruptive.

## Network Stability

The current observed VM address is discovery-only, but the durable target is the
SSH alias or approved stable name.

Remaining hardening:

- DHCP reservation, local DNS, or approved Tailscale name.
- Update only `HostName` in SSH config when the address changes.

Current Tailscale package state:

- `tailscale` is installed at `/usr/bin/tailscale`.
- `tailscaled` is active.
- `tailscale ip -4` reports `NeedsLogin`.

Boundary:

- Tailscale auth/enrollment is a post-install user task, not part of base Linux
  bootstrap.
- `NeedsLogin` is not a bootstrap failure.
- Tailscale/MagicDNS becomes a proven access path only after the user completes
  post-install Tailnet enrollment and the SSH alias is tested through the
  approved stable name.

## Maintenance Policy

The baseline records current versions, but does not yet define update cadence
for:

- Ubuntu packages.
- Node/npm global packages.
- Codex CLI.
- Claude Code.
- BMAD Method.
- Playwright browsers if installed.

Recommended default: update only through a named maintenance window with
preflight before, update evidence, full check after, and snapshot after success.
