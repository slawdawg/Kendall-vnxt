# Linux Install Playbook

Status: planned
Target v1: Ubuntu 26.04 LTS, existing `slaw_dawg` user

## Purpose

Create a repeatable, validated Linux installation path for Kendall_Nxt without
moving secrets or relying on one-off operator memory.

## Current Plan

- [Bob next steps](bob-next-steps.md)
- [Implementation plan](implementation-plan.md)
- [Install playbook](install-playbook.md)
- [Install contract](install-contract.md)
- [Validation matrix](validation-matrix.md)
- [SSH key policy](ssh-key-policy.md)
- [Provider login policy](provider-login-policy.md)
- [Remote approval template](remote-approval-template.md)
- [Troubleshooting](troubleshooting.md)
- [Lessons learned](lessons-learned.md)
- [Remaining gaps](remaining-gaps.md)
- [Evidence schema](evidence/schema.md)
- [Fresh VM toolchain evidence](evidence/fresh-vm-toolchain-2026-06-16.md)
- [Fresh VM repo setup evidence](evidence/fresh-vm-repo-setup-2026-06-16.md)
- [Fresh VM full check evidence](evidence/fresh-vm-full-check-2026-06-16.md)
- [Fresh VM reboot proof evidence](evidence/fresh-vm-reboot-proof-2026-06-16.md)
- [Fresh VM real work-cycle evidence](evidence/fresh-vm-work-cycle-2026-06-16.md)
- [Fresh VM snapshot evidence](evidence/fresh-vm-snapshot-2026-06-16.md)
- [Fresh VM agent CLI evidence](evidence/fresh-vm-agent-clis-2026-06-16.md)
- [Fresh VM BMAD Method evidence](evidence/fresh-vm-bmad-method-2026-06-16.md)
- [Fresh VM Playwright e2e evidence](evidence/fresh-vm-playwright-e2e-2026-06-16.md)
- [Existing Linux primary-development runbook](../workflows/linux-primary-development-runbook.md)
- [Platform evaluation evidence](../platform-evaluation-sprint.md)

## v1 Boundary

Version 1 is intentionally narrow:

- Ubuntu 26.04 LTS only.
- Existing `slaw_dawg` user only.
- Public SSH key installation only.
- Manual GitHub authentication only.
- Verify-only and dry-run behavior before any installer apply mode.
- Remote mutation only after Bob approves a named operation scope.
