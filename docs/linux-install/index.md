# Kendall Vnxt Ubuntu Deployment Playbook

Status: planned
Target v1: Ubuntu 26.04 LTS or later, existing non-root Linux user

## Purpose

Create a repeatable, validated path to deploy Kendall Vnxt from GitHub onto
Ubuntu 26.04 or later without moving secrets or relying on one-off operator
memory.

## Generic Install Path

- [Install playbook](install-playbook.md)
- [Install contract](install-contract.md)
- [Implementation plan](implementation-plan.md)
- [Validation matrix](validation-matrix.md)
- [SSH key policy](ssh-key-policy.md)
- [Provider login policy](provider-login-policy.md)
- [Remote approval template](remote-approval-template.md)
- [Troubleshooting](troubleshooting.md)
- [Lessons learned](lessons-learned.md)
- [Evidence schema](evidence/schema.md)

## Current Instance Notes And Evidence

- [Bob next steps](bob-next-steps.md) - current lab host notes, not the generic
  installer entry point.
- [Remaining gaps](remaining-gaps.md) - current Linux host gaps and policy
  follow-ups, not the generic installer entry point.
- [Fresh VM toolchain evidence](evidence/fresh-vm-toolchain-2026-06-16.md)
- [Fresh VM repo setup evidence](evidence/fresh-vm-repo-setup-2026-06-16.md)
- [Fresh VM full check evidence](evidence/fresh-vm-full-check-2026-06-16.md)
- [Fresh VM reboot proof evidence](evidence/fresh-vm-reboot-proof-2026-06-16.md)
- [Fresh VM real work-cycle evidence](evidence/fresh-vm-work-cycle-2026-06-16.md)
- [Fresh VM snapshot evidence](evidence/fresh-vm-snapshot-2026-06-16.md)
- [Fresh VM agent CLI evidence](evidence/fresh-vm-agent-clis-2026-06-16.md)
- [Fresh VM BMAD Method evidence](evidence/fresh-vm-bmad-method-2026-06-16.md)
- [Fresh VM Playwright e2e evidence](evidence/fresh-vm-playwright-e2e-2026-06-16.md)
- [Current VM sync and base verification evidence](evidence/current-vm-sync-base-verify-2026-06-16.md)
- [Fresh Ubuntu post-merge validation evidence](evidence/fresh-ubuntu-validation-20260617T145338Z.json)
- [Existing Linux primary-development runbook](../workflows/linux-primary-development-runbook.md)
- [Platform evaluation evidence](../platform-evaluation-sprint.md)

## v1 Boundary

Version 1 is intentionally narrow:

- Ubuntu 26.04 LTS or later.
- Existing non-root Linux user.
- Public SSH key installation only.
- Provider authentication is post-deployment only. Private GitHub repo access
  auth is manual and allowed before clone when needed.
- Verify-only and dry-run behavior before any installer apply mode.
- Remote mutation only after the operator approves a named operation scope.
