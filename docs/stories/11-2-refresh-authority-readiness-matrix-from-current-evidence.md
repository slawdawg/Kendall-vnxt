---
baseline_commit: 9601d08
---

# Story 11.2: Refresh Authority Readiness Matrix From Current Evidence

Status: done

## Story

As Bob,
I want the authority readiness matrix to reflect the latest delivery, cleanup, provider, process, premium, and scoring evidence,
so that every blocked or ready authority family has a current next safe action.

## Acceptance Criteria

1. Given authority readiness data is generated, when the report includes provider, process-launch, premium execution, adaptive scoring, GitHub delivery, and cleanup authority families, then each family shows current status, required approval, required evidence, related stories/docs, stop lines, rollback path, and next safe action.
2. Given Epic 10 added delivery and cleanup approval-ledger evidence, when the authority matrix is refreshed, then delivery and cleanup rows link to the low-risk delivery plan, cleanup plan, delivery execution evidence, approval ledger, and PR #103 state.
3. Given any authority family remains disabled, when the report renders, then disabled remains visually and contractually distinct from ready, approved, executed, or policy-approved.
4. Given the authority readiness contract changes, when supervisor, dashboard, e2e, and static drift checks run, then they prove required evidence, related docs/reports, rollback paths, and disabled status styling stay visible.
5. Given Story 11.2 completes, when documentation and story navigation are reviewed, then story index, architecture reconciliation, and authority readiness drift checks cite this story without implying that any new execution authority has been granted.

## Tasks / Subtasks

- [x] Extend the authority readiness data contract. (AC: 1, 4)
  - [x] Add a `rollbackPath` field to `AuthorityReadinessFamilyView` in `packages/contracts/src/api.ts`.
  - [x] Add the matching `rollbackPath` field to `services/supervisor/src/supervisor/api/schemas.py`.
  - [x] Keep `AuthorityReadinessMatrixReportView.readOnly` defaulting to `true` and `executionAuthorityApproved` defaulting to `false`.
- [x] Refresh supervisor authority families from current evidence. (AC: 1-3)
  - [x] Update `get_authority_readiness_matrix_report` in `services/supervisor/src/supervisor/application/service.py`.
  - [x] Preserve existing families for local provider execution, subscription-agent launch, premium execution, worker command/source/network/credential authority, and remote delivery automation.
  - [x] Add an adaptive scoring family that remains disabled until exact scoring-policy approval exists.
  - [x] Add a GitHub delivery family that points to Epic 10 low-risk delivery planning, delivery execution evidence, trusted approval-ledger validation, and PR #103 current state.
  - [x] Add a cleanup family that points to the safe cleanup plan, evidence preservation, worktree residue classification, and cleanup approval requirements.
  - [x] Make every family include status, required approvals, required evidence, related reports, related docs/stories, dashboard anchors, stop lines, rollback path, and next safe action.
- [x] Preserve disabled versus ready/approved semantics. (AC: 3)
  - [x] Use status values and copy that distinguish `blocked_by_default`, `blocked_pending_explicit_approval`, `ready_for_human_delivery`, or similar review-only states from approved/executed/policy-approved states.
  - [x] Do not mark provider expansion, process launch, premium execution, adaptive scoring, worker authority, automated remote delivery, destructive cleanup, or broad autonomy approved.
  - [x] Keep PR #103 described as current-state evidence only; re-check GitHub before claiming it is merged to `main`.
- [x] Update dashboard rendering. (AC: 1, 3, 4)
  - [x] Update `apps/dashboard/src/components/authority-readiness-matrix-report-panel.tsx` to render required evidence, related reports/docs, rollback path, and next safe action for every family.
  - [x] Keep blocked/disabled status visually distinct from ready/review-only statuses without showing execution controls.
  - [x] Keep the controls page anchor `/controls#authority-readiness-matrix-report` stable.
- [x] Update regression and drift coverage. (AC: 1-5)
  - [x] Update `services/supervisor/tests/integration/test_routing_preview.py` to assert the expanded family set and `rollbackPath` data.
  - [x] Update `tests/e2e/dashboard.spec.ts` to prove the new family rows and visible evidence fields render.
  - [x] Update `scripts/check-authority-readiness-matrix-report.mjs` to require the new families, rollback path field, evidence/doc/report rendering, and Story 11.2 reference.
  - [x] Update any affected report catalog/runtime evidence checks only if Story 11.2 changes their asserted story references.
- [x] Update docs and story evidence. (AC: 5)
  - [x] Add Story 11.2 to `docs/stories/index.md`.
  - [x] Update `docs/architecture/kendall-vnxt-implementation-gap-reconciliation-2026-06-08.md` only if needed to reflect the refreshed matrix.
  - [x] Record verification commands in the Dev Agent Record.
  - [x] Update Completion Notes, File List, and Change Log when implementation is complete.

### Review Findings

- [x] [Review][Patch] Require non-blank rollback paths and non-empty review evidence for authority families.
- [x] [Review][Patch] Render missing-data signals for authority family evidence/report/doc sections instead of empty headings.
- [x] [Review][Patch] Add complete Epic 10 evidence cross-links to both GitHub delivery and cleanup authority rows.
- [x] [Review][Patch] Make blocked and approval-required status styling testable through stable dashboard attributes.
- [x] [Review][Patch] Rename GitHub delivery status to approval-required wording so readiness evidence is not confused with delivery permission.

## Dev Notes

### Source Context

- Epic 11 is current-state reconciliation and next-lane authority planning. Its cross-story invariant forbids granting provider expansion, credential/session access, source mutation by workers, subscription-agent process launch, premium execution, adaptive scoring, failed-check bypass, issue sync, destructive cleanup, remote mutation, branch deletion, worktree deletion, or broad autonomy.
- Story 11.1 reconciled stale planning and documentation claims after Epic 10. Carry forward its distinction between local story completion, PR CI green, stacked-branch merge, and merged-to-main delivery.
- PR #103 is the Epic 10 delivery branch. As of Story 11.1 evidence on 2026-06-13, CI was green but the PR was externally review-gated. Re-check PR #103 before making any current PR-state claim.
- Epic 10 delivered low-risk delivery and cleanup planning, delivery execution evidence for approved PR/merge actions, safe cleanup planning, Dev Console plan visibility, and trusted approval-ledger validation.
- The existing matrix was introduced by Story 3.53 as a read-only authority readiness matrix. Story 11.2 refreshes that surface from current evidence; it does not create a new authority mechanism.

### Existing Implementation To Reuse

- Shared contracts:
  - `packages/contracts/src/api.ts`
- Supervisor schemas and API:
  - `services/supervisor/src/supervisor/api/schemas.py`
  - `services/supervisor/src/supervisor/api/main.py`
- Supervisor report construction:
  - `services/supervisor/src/supervisor/application/service.py`
  - Existing function: `get_authority_readiness_matrix_report`
- Dashboard:
  - `apps/dashboard/src/lib/supervisor.ts`
  - `apps/dashboard/src/app/controls/page.tsx`
  - `apps/dashboard/src/components/authority-readiness-matrix-report-panel.tsx`
  - `apps/dashboard/src/lib/report-shortcuts.ts`
- Regression checks and tests:
  - `scripts/check-authority-readiness-matrix-report.mjs`
  - `services/supervisor/tests/integration/test_routing_preview.py`
  - `tests/e2e/dashboard.spec.ts`
- Evidence and documentation references:
  - `docs/stories/3-53-authority-readiness-matrix-report.md`
  - `docs/stories/10-1-define-low-risk-delivery-policy-and-dry-run-plan-contract.md`
  - `docs/stories/10-2-record-delivery-execution-evidence-for-approved-pr-and-merge-actions.md`
  - `docs/stories/10-3-plan-safe-cleanup-with-evidence-preservation-and-worktree-residue-classification.md`
  - `docs/stories/10-4-show-delivery-and-cleanup-plans-in-dev-console.md`
  - `docs/stories/10-5-bind-delivery-execution-approval-to-trusted-authority-ledger.md`
  - `docs/architecture/kendall-vnxt-implementation-gap-reconciliation-2026-06-08.md`

### Current Implementation Snapshot

- `AuthorityReadinessFamilyView` currently has `familyId`, `label`, `status`, `summary`, `blockedStories`, `requiredApprovals`, `requiredEvidence`, `relatedReports`, `relatedDocs`, `dashboardAnchors`, `stopLines`, and `nextAction`. It does not yet have a dedicated rollback path field.
- `get_authority_readiness_matrix_report` currently returns five families:
  - `local-provider-execution`
  - `subscription-agent-launch`
  - `premium-execution`
  - `worker-command-source-network-credentials`
  - `remote-delivery-automation`
- The integration test `test_authority_readiness_matrix_report_maps_blocked_authority_without_mutation` currently asserts exactly those five family IDs. It must be updated when adding adaptive scoring, GitHub delivery, and cleanup families.
- The dashboard panel currently renders required approvals, blocked stories, dashboard anchors, stop lines, and next action. It does not yet render required evidence, related reports, related docs, or a rollback path.
- `scripts/check-authority-readiness-matrix-report.mjs` currently checks the original five-family surface and must be expanded to catch Story 11.2 regressions.

### Architecture And Safety Boundaries

- This story is read-only reporting, contract, documentation, and regression coverage. It must not execute provider calls, launch subscription-agent processes, perform premium execution, run adaptive scoring, mutate GitHub, merge PRs, delete worktrees, delete branches, sync issues, access credentials, mutate source by workers, bypass failed checks, or grant broad autonomy.
- Delivery and cleanup matrix rows may describe human/connector-backed or approval-ledger-backed evidence, but must not authorize automated worker remote mutation or destructive cleanup.
- Cleanup rows must keep evidence preservation and residue classification visible. Do not imply that filesystem deletion, branch deletion, or worktree deletion is approved by readiness reporting.
- Adaptive scoring must remain disabled unless an exact future approval names scoring authority, score inputs, output usage, evidence retention, rollback, and stop lines.
- Evidence remains metadata-only. Do not add raw prompts, completions, reasoning traces, provider payloads, secrets, raw stdout/stderr, or unbounded command output to reports or docs.

### Implementation Guidance

- Start with a focused inventory:
  - `rg -n "AuthorityReadinessFamilyView|authority-readiness-matrix-report|remote-delivery-automation|delivery-readiness|cleanup|adaptive scoring|rollbackPath" packages services apps scripts tests docs`
- Prefer extending the existing `AuthorityReadinessFamilyView` instead of creating a parallel report model.
- Keep family IDs stable and machine-friendly. Suggested new IDs:
  - `adaptive-scoring`
  - `github-delivery`
  - `cleanup-automation`
- Suggested status semantics:
  - `blocked_by_default` for authority that is structurally disabled without current approval.
  - `blocked_pending_explicit_approval` for authority that needs an exact operator approval packet.
  - `ready_for_human_review` or `ready_for_human_delivery` only for review-only or human/connector-backed evidence surfaces that do not grant worker automation.
- Add rollback paths as short operator-facing recovery guidance, for example:
  - keep disabled settings unchanged,
  - revert to read-only report state,
  - preserve evidence and stop before mutation,
  - re-check PR/cleanup state before acting.
- Keep the readiness ladder read-only. If adding ladder evidence for delivery or cleanup, keep `executionAuthorityApproved` false.

### Previous Story Intelligence

- Story 11.1 review found stale or broad authority wording was the main risk. For Story 11.2, every new row must bind to exact story/report evidence and must not upgrade a lane because it has better visibility.
- Story 10.5 review hardened delivery execution approvals against untrusted authority-looking identifiers. For Story 11.2, delivery rows should reference the trusted approval-ledger requirement rather than treating arbitrary IDs or generic continuation language as approval.
- Story 10.4 added Dev Console visibility for delivery and cleanup plans. For Story 11.2, use those plan/report surfaces as related evidence, not as execution authority.
- Story 3.53 established the matrix as read-only and non-mutating. Preserve the no-mutation behavior and keep the API route side-effect free.

### Testing

Minimum focused verification:

- `pnpm.cmd run check:authority-readiness`
- `pnpm.cmd run check:docs`

Run targeted supervisor tests for the touched report:

- `services\supervisor\.venv\Scripts\python.exe -m pytest services\supervisor\tests\integration\test_routing_preview.py -k authority_readiness_matrix_report -p no:cacheprovider`

Broaden before PR because this story touches shared contracts, dashboard rendering, and supervisor report data:

- `pnpm.cmd --filter @kendall/dashboard build`
- `pnpm.cmd run check`

## References

- `_bmad-output/planning-artifacts/epics.md`
- `_bmad-output/planning-artifacts/sprint-change-proposal-2026-06-13-epic-11-current-state-reconciliation.md`
- `docs/stories/11-1-reconcile-planning-status-after-epic-10-delivery.md`
- `docs/stories/3-53-authority-readiness-matrix-report.md`
- `docs/stories/10-1-define-low-risk-delivery-policy-and-dry-run-plan-contract.md`
- `docs/stories/10-2-record-delivery-execution-evidence-for-approved-pr-and-merge-actions.md`
- `docs/stories/10-3-plan-safe-cleanup-with-evidence-preservation-and-worktree-residue-classification.md`
- `docs/stories/10-4-show-delivery-and-cleanup-plans-in-dev-console.md`
- `docs/stories/10-5-bind-delivery-execution-approval-to-trusted-authority-ledger.md`
- `docs/architecture/kendall-vnxt-current-gap-review-2026-06-08.md`
- `docs/architecture/kendall-vnxt-implementation-gap-reconciliation-2026-06-08.md`
- `docs/architecture/kendall-vnxt-execution-authority-approval-checkpoints-2026-06-08.md`

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- Story created through `bmad-create-story` from Epic 11 backlog after Story 11.1 completed current-state reconciliation.
- Creation-time source inspection confirmed the authority readiness matrix already exists in contracts, supervisor schema/service, dashboard panel, integration tests, e2e tests, and `check:authority-readiness`.
- Focused authority readiness drift check passed: `pnpm.cmd run check:authority-readiness`.
- Focused supervisor report integration passed: `services\supervisor\.venv\Scripts\python.exe -m pytest services\supervisor\tests\integration\test_routing_preview.py -k authority_readiness_matrix_report -p no:cacheprovider`. Pytest emitted a Windows temp cleanup permission warning after the selected test passed.
- Documentation verification passed: `pnpm.cmd run check:docs`.
- Dashboard build passed: `pnpm.cmd --filter @kendall/dashboard build`.
- Full regression passed: `pnpm.cmd run check`, including dashboard build and 195 supervisor tests with one existing aiosqlite deprecation warning.
- BMAD party-mode code review ran Blind Hunter, Edge Case Hunter, and Acceptance Auditor; accepted findings were patched.
- Post-review focused authority readiness drift check passed: `pnpm.cmd run check:authority-readiness`.
- Post-review focused supervisor report integration passed: `services\supervisor\.venv\Scripts\python.exe -m pytest services\supervisor\tests\integration\test_routing_preview.py -k authority_readiness_matrix_report -p no:cacheprovider`. Pytest emitted the same Windows temp cleanup permission warning after success.
- Post-review dashboard build passed: `pnpm.cmd --filter @kendall/dashboard build`.
- Post-review full regression passed: `pnpm.cmd run check`, including dashboard build and 195 supervisor tests with one existing aiosqlite deprecation warning.

### Completion Notes List

- Added `rollbackPath` to the shared authority readiness family contract and supervisor schema while preserving read-only report defaults.
- Refreshed the supervisor authority readiness matrix to include adaptive scoring, GitHub delivery, and cleanup automation alongside existing provider, process-launch, premium, worker-authority, and remote-delivery rows.
- Bound delivery and cleanup rows to Epic 10 planning/evidence/approval-ledger stories and PR #103 current-state re-check language without granting worker remote automation or destructive cleanup authority.
- Updated the dashboard authority matrix panel to render required evidence, related reports, related docs, rollback paths, and visually distinct blocked versus review-ready statuses without execution controls.
- Expanded static drift, supervisor integration, and e2e assertions for the refreshed family set, rollback paths, evidence visibility, and Story 11.2 references.
- Updated architecture reconciliation to describe the refreshed Story 11.2 matrix shape.
- Patched BMAD review findings by enforcing non-blank rollback paths, surfacing missing list evidence in the UI, adding complete Epic 10 evidence cross-links, making approval-required styling testable, and replacing readiness-permission wording with approval-required wording.

### Review Findings

- [x] Non-blank rollback path enforcement added to the supervisor schema, with integration assertions for trimmed rollback paths and populated family evidence.
- [x] Dashboard now shows explicit missing-data placeholders for empty authority family list sections.
- [x] GitHub delivery and cleanup rows now both link the required Story 10.1, 10.2, 10.3, 10.5, and PR #103 evidence set.
- [x] Dashboard exposes `data-status-kind` for blocked/approval-required family cards, with e2e and drift coverage.
- [x] GitHub delivery status changed from `ready_for_human_delivery` to `evidence_ready_approval_required`.

### File List

- `apps/dashboard/src/components/authority-readiness-matrix-report-panel.tsx`
- `docs/architecture/kendall-vnxt-implementation-gap-reconciliation-2026-06-08.md`
- `docs/stories/11-2-refresh-authority-readiness-matrix-from-current-evidence.md`
- `docs/stories/index.md`
- `packages/contracts/src/api.ts`
- `scripts/check-authority-readiness-matrix-report.mjs`
- `services/supervisor/src/supervisor/api/schemas.py`
- `services/supervisor/src/supervisor/application/service.py`
- `services/supervisor/tests/integration/test_routing_preview.py`
- `tests/e2e/dashboard.spec.ts`

## Change Log

- 2026-06-13: Created Story 11.2 and moved it to ready-for-dev.
- 2026-06-13: Implemented the refreshed authority readiness matrix and moved Story 11.2 to review.
- 2026-06-13: Patched BMAD code-review findings, verified full regression, and moved Story 11.2 to done.
