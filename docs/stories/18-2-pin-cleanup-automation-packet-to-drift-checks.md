---
baseline_commit: 5bcd868d9a0d574028e5fba7dde0f9aca639480b
---

# Story 18.2: Pin Cleanup Automation Packet To Drift Checks

Status: review

## Story

As Bob,
I want the cleanup automation approval packet pinned to code and test drift checks,
so that future cleanup readiness work cannot quietly drift away from exact target-specific approval, approved-root proof, retained evidence, dry-run effects, rollback, and no-deletion boundaries.

## Acceptance Criteria

1. Given cleanup automation remains approval-required, when cleanup checks run, then they verify the cleanup approval packet still states it is non-executing and cannot delete anything by itself.
2. Given cleanup can destroy source, branches, worktrees, refs, residue, or retained evidence, when checks run, then they verify the packet still requires target id, target type/classification, target path/ref, approved cleanup root, retained evidence, delivery/merge evidence, Git worktree state, filesystem state, source file state, residue classification, blocked-path check, dry-run effects, operation shape, operator, approval timestamp, rollback/recovery path, stop lines, and expiry or review point.
3. Given cleanup must remain target-specific, when checks run, then they verify the packet still blocks source checkout root deletion, main/protected branch deletion, retained evidence deletion, ambiguous paths, paths outside approved roots, stale evidence, string-built shell deletion, local-to-remote authority crossover, and failed-check bypass.
4. Given existing cleanup surfaces are read-only, when checks run, then they verify service/tests preserve cleanup target path, retained evidence, blocked paths, dry-run effects, and exact cleanup approval before deletion.
5. Given this story is non-executing, when verification runs, then it does not delete files, remove worktrees, delete branches, delete remote refs, remove retained evidence, run cleanup commands, or bypass failed checks.

## Tasks / Subtasks

- [x] Add cleanup automation approval-packet drift check. (AC: 1, 2, 3, 4)
  - [x] Verify approval packet status, authority family, operation shape, target classifications, preconditions, and stop lines.
  - [x] Verify service cleanup planning keeps target path, retained evidence, blocked paths, dry-run effects, and exact approval before deletion.
  - [x] Verify tests preserve blocked worktree removal, branch deletion, residue classification, source-root blocking, failed/stale delivery blocking, and retained evidence.
  - [x] Verify delivery-readiness drift checks preserve cleanup stop lines and Story 10.3/10.4 evidence references.
- [x] Wire focused cleanup verification into package scripts. (AC: 1, 2, 3, 4)
  - [x] Add `check:cleanup-automation`.
  - [x] Add `check:cleanup-automation` to the full `check` chain.
- [x] Verify scoped cleanup checks. (AC: 5)
  - [x] Run `pnpm.cmd run check:cleanup-automation`.

## Dev Notes

This story is a readiness guardrail only. It makes the cleanup automation approval packet/code/test relationship machine-checkable, but it does not approve or perform cleanup.

Relevant existing context:

- `docs/goals/cleanup-automation-approval-packet-2026-06-14.md`
- `docs/stories/18-1-refresh-cleanup-automation-approval-packet.md`
- `docs/stories/10-3-plan-safe-cleanup-with-evidence-preservation-and-worktree-residue-classification.md`
- `docs/stories/10-4-show-delivery-and-cleanup-plans-in-dev-console.md`
- `docs/stories/12-2-record-post-merge-delivery-and-cleanup-evidence.md`
- `services/supervisor/src/supervisor/application/service.py`
- `services/supervisor/tests/integration/test_routing_preview.py`
- `scripts/check-delivery-readiness-policy-report.mjs`

### Guardrails

- Do not delete files or directories.
- Do not remove worktrees.
- Do not delete local branches, remote branches, or refs.
- Do not delete retained evidence.
- Do not clean source checkout roots.
- Do not operate on ambiguous or unclassified paths.
- Do not use string-built shell deletion commands.
- Do not cross from local cleanup to remote cleanup without exact remote target approval.
- Do not bypass failed checks.

### References

- [Source: `docs/goals/cleanup-automation-approval-packet-2026-06-14.md`]
- [Source: `docs/stories/18-1-refresh-cleanup-automation-approval-packet.md`]
- [Source: `docs/stories/10-3-plan-safe-cleanup-with-evidence-preservation-and-worktree-residue-classification.md`]
- [Source: `docs/stories/10-4-show-delivery-and-cleanup-plans-in-dev-console.md`]
- [Source: `docs/stories/index.md#draft-epic-18-story-map`]
- [Source: `services/supervisor/src/supervisor/application/service.py`]
- [Source: `services/supervisor/tests/integration/test_routing_preview.py`]
- [Source: `scripts/check-delivery-readiness-policy-report.mjs`]

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- `Get-Content -Raw docs/goals/cleanup-automation-approval-packet-2026-06-14.md`
- `rg -n "cleanup-automation|cleanup automation|cleanup readiness|cleanup plan|cleanupPlan|delete worktree|delete branches|approved cleanup root|dry-run effects|cleanup:|check:delivery-readiness|check:maintenance-readiness" package.json scripts services\supervisor docs\stories docs\goals apps\dashboard\src`
- `rg -n "cleanupTargetPath|dryRunEffects|retainedEvidence|approvedRoot|blockedPaths|worktreeRegistration|residueClassification|cleanup remains|must not remove|delete branches|delete worktrees|cleanup plan" services\supervisor\src\supervisor\application\service.py services\supervisor\tests\integration\test_routing_preview.py scripts\check-delivery-readiness-policy-report.mjs docs\stories\18-1-refresh-cleanup-automation-approval-packet.md`
- `pnpm.cmd run check:cleanup-automation`

### Completion Notes List

- Added `scripts/check-cleanup-automation-approval-packet.mjs`.
- Added `pnpm.cmd run check:cleanup-automation`.
- Added `check:cleanup-automation` to the full `pnpm.cmd run check` chain.
- Confirmed scoped cleanup verification passes without deleting anything.

### File List

- `package.json`
- `scripts/check-cleanup-automation-approval-packet.mjs`
- `docs/stories/18-2-pin-cleanup-automation-packet-to-drift-checks.md`
- `docs/stories/index.md`

### Change Log

- 2026-06-14: Added cleanup automation approval-packet drift check and scoped verification evidence.
