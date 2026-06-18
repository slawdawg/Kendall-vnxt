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
- [Goal run fixtures](fixtures/goal-run/)

## Active Planning Artifacts

These tracked artifacts combine the recovered PRD/epic lane with the Linux
install docs and evidence lane delivered through PR #144:

- [Linux Install MVP PRD](../prds/linux-install-mvp.md)
- [Linux Install MVP decision log](../prds/linux-install-mvp-decision-log.md)
- [Linux install architecture input](planning/linux-install-architecture-input.md)
- [Linux install epics and stories](planning/linux-install-epics-and-stories.md)
- [Linux install lane status](planning/lane-status.md)
- [Linux install next goal prompt](planning/next-goal-prompt.md)
- [Linux install implementation readiness report](planning/implementation-readiness-report-2026-06-18.md)
- [Story 1.1: Declare certified Ubuntu target and single install method](planning/stories/1-1-declare-certified-ubuntu-target-and-single-install-method.md)
- [Story 1.2: Enforce local identity and platform preflight gates](planning/stories/1-2-enforce-local-identity-and-platform-preflight-gates.md)
- [Story 1.3: Provide non-mutating plan and verify modes](planning/stories/1-3-provide-non-mutating-plan-and-verify-modes.md)
- [Story 1.4: Reject unsupported remote and apply arguments](planning/stories/1-4-reject-unsupported-remote-and-apply-arguments.md)
- [Story 1.5: Enforce shell bootstrap as the only mutating install path](planning/stories/1-5-enforce-shell-bootstrap-as-the-only-mutating-install-path.md)
- [Story 2.1: Install or verify approved base toolchain](planning/stories/2-1-install-or-verify-approved-base-toolchain.md)
- [Story 2.2: Record existing versus changed tool state](planning/stories/2-2-record-existing-versus-changed-tool-state.md)
- [Story 2.3: Clone or validate Kendall_Nxt repo state](planning/stories/2-3-clone-or-validate-kendall-nxt-repo-state.md)
- [Story 2.4: Block cleanly when private repo access is missing](planning/stories/2-4-block-cleanly-when-private-repo-access-is-missing.md)
- [Story 2.5: Run project setup and final verify from validated checkout](planning/stories/2-5-run-project-setup-and-final-verify-from-validated-checkout.md)
- [Story 2.6: Prove safe rerun behavior across install states](planning/stories/2-6-prove-safe-rerun-behavior-across-install-states.md)
- [Story 3.1: Write schema-compliant success failure and blocked evidence](planning/stories/3-1-write-schema-compliant-success-failure-and-blocked-evidence.md)
- [Story 3.2: Emit pre-repo blocked evidence safely](planning/stories/3-2-emit-pre-repo-blocked-evidence-safely.md)
- [Story 3.3: Enforce evidence redaction and required fields](planning/stories/3-3-enforce-evidence-redaction-and-required-fields.md)
- [Story 3.4: Protect evidence paths from unsafe writes](planning/stories/3-4-protect-evidence-paths-from-unsafe-writes.md)
- [Story 3.5: Deny automated auth and secret handling](planning/stories/3-5-deny-automated-auth-and-secret-handling.md)
- [Story 3.6: Keep troubleshooting and lessons learned current](planning/stories/3-6-keep-troubleshooting-and-lessons-learned-current.md)
- [Story 4.1: Map stories to release gates before execution](planning/stories/4-1-map-stories-to-release-gates-before-execution.md)
- [Story 4.2: Define durable goal run task state and command contracts](planning/stories/4-2-define-durable-goal-run-task-state-and-command-contracts.md)
- [Story 4.3: Enforce bounded authority ledger decisions](planning/stories/4-3-enforce-bounded-authority-ledger-decisions.md)
- [Story 4.4: Record blocker packets for gated operations](planning/stories/4-4-record-blocker-packets-for-gated-operations.md)
- [Story 4.5: Apply safe continuation after blockers](planning/stories/4-5-apply-safe-continuation-after-blockers.md)
- [Story 4.6: Generate completion reports from evidence](planning/stories/4-6-generate-completion-reports-from-evidence.md)
- [Story 5.1: Separate supported install docs from historical notes](planning/stories/5-1-separate-supported-install-docs-from-historical-notes.md)
- [Story 5.2: Prove published bootstrap source reachability](planning/stories/5-2-prove-published-bootstrap-source-reachability.md)
- [Story 5.3: Capture fresh Ubuntu first-install evidence](planning/stories/5-3-capture-fresh-ubuntu-first-install-evidence.md)
- [Story 5.4: Capture idempotent rerun evidence](planning/stories/5-4-capture-idempotent-rerun-evidence.md)
- [Story 5.5: Refresh release docs and Linux install package](planning/stories/5-5-refresh-release-docs-and-linux-install-package.md)
- [Story 5.6: Run final verification and code review before delivery](planning/stories/5-6-run-final-verification-and-code-review-before-delivery.md)
- [Pre-PR code review report](planning/reviews/pre-pr-code-review-2026-06-18.md)
- [PR 144 delivery record](planning/reviews/pr-144-delivery-record.md)
- [Linux Install MVP retrospective](planning/reviews/linux-install-mvp-retrospective-2026-06-18.md)

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
- [Published bootstrap URL reachability evidence](evidence/bootstrap-url-reachability-20260618T200827Z.json)
- [Fresh-host evidence blocker](evidence/goal-runs/20260618T200827Z/blockers/fresh-host-required.json)
- [Fresh install and rerun validation transcript](evidence/goal-runs/20260618T201830Z/fresh-install-and-rerun-validation-transcript.md)
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
