# Kendall Vnxt Ubuntu Deployment Playbook

Status: delivered
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
- [Release delivery record](release-delivery-record.md)
- [Goal run fixtures](fixtures/goal-run/)
- [Global tool manifest](global-tool-manifest.json)

## Release Boundary

The source-owned Linux Install MVP boundary is tracked in the product
requirements boundary. BMAD planning artifacts, stories, lane status, review
drafts, and next-goal prompts are local workspace state and must not be
published as part of the GitHub clean-install surface.

- [Linux Install MVP product boundary](../workflows/product-requirements-boundary.md#linux-install-mvp)
- [Linux Install MVP release delivery record](release-delivery-record.md)

## Operational Boundaries

Local lab notes, raw VM transcripts, remote-operation templates, SSH policy
history, and instance-specific evidence packets are local workspace state. They
must not be published as clean-install source. Use the source-owned records
below instead:

- [Linux primary-development runbook](../workflows/linux-primary-development-runbook.md)
- [Platform decision boundary](../workflows/platform-decision-boundary.md)
- [Linux Install MVP release delivery record](release-delivery-record.md)

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
