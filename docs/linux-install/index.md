# Kendall Vnxt Ubuntu Deployment Playbook

Status: planned
Target v1: Ubuntu 26.04 LTS or later, existing non-root Linux user

## Purpose

Create a repeatable, validated path to deploy Kendall Vnxt from GitHub onto
Ubuntu 26.04 or later without moving secrets or relying on one-off operator
memory.

## Generic Install Path

- [Install playbook](install-playbook.md)
- [One-command bootstrap plan](one-command-bootstrap-plan.md)
- [Fresh host proof procedure](fresh-host-proof-procedure.md)
- [Install contract](install-contract.md)
- [Validation matrix](validation-matrix.md)
- [Goal run contract](goal-run-contract.md)
- [Release gate traceability](release-gate-traceability.md)
- [Provider login policy](provider-login-policy.md)
- [Troubleshooting](troubleshooting.md)
- [Lessons learned](lessons-learned.md)
- [Evidence schema](evidence/schema.md)
- [Goal run fixtures](fixtures/goal-run/)

## Historical And Instance-Specific Notes

The documents below are historical, lab-instance, or platform-evaluation notes.
They are not the generic installer entry point and must not override the
single-method v1 boundary above.

- [Bob next steps](bob-next-steps.md) - current lab host notes, not the generic
  installer entry point.
- [Remaining gaps](remaining-gaps.md) - current Linux host gaps and policy
  follow-ups, not the generic installer entry point.
- [Historical implementation plan](implementation-plan.md) - superseded remote
  and staged-mode planning notes, not current install instructions.
- [Historical remote approval template](remote-approval-template.md) -
  superseded remote-apply planning notes, not current install instructions.
- [Historical SSH key policy](ssh-key-policy.md) - SSH policy history, not part
  of the supported v1 installer.
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
- Local terminal execution by that Linux user with sudo permissions.
- Provider authentication is post-deployment only. Private GitHub repo access
  auth is manual and allowed before clone when needed.
- Verify-only and dry-run behavior before the single install script.
- Local mutation only through the single bootstrap script.
- No SSH, remote execution, staged script, or manual fallback install method is
  supported in v1.
- Codex `/goal` development uses the Goal Run Contract for unattended
  non-gated work and stops with a blocker packet at missing authority.
- Pull request creation, merge, and workspace cleanup are terminal delivery
  activities, not routine development-loop steps.
