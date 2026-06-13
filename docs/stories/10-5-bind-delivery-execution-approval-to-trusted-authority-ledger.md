---
baseline_commit: 7cdbcac
---

# Story 10.5: Bind Delivery Execution Approval To Trusted Authority Ledger

Status: done

## Story

As Bob,
I want delivery execution approval IDs validated against a trusted authority ledger,
so that PR and merge evidence cannot be recorded as approved unless the approval is current, scoped, and bound to the exact delivery action.

## Acceptance Criteria

1. Given a delivery execution evidence request includes an approval id and policy id, when Kendall validates the request, then the approval must bind to authority family, work item, action id, branch, base branch, head revision, PR URL, CI state, review state, merge state where applicable, retained evidence, operator identity, expiry or review point, rollback plan, and stop lines, and unrecognized, stale, expired, mismatched, or underspecified approval ids are rejected without recording approved execution evidence.
2. Given no trusted ledger approval exists for the requested PR or merge action, when delivery execution evidence is submitted with a non-empty arbitrary approval id, then Kendall records report-only or rejected metadata according to the request state, and it does not mark the action as approved, executed, externally mutated, merge-ready, cleanup-ready, or cleanup-eligible.
3. Given a trusted approval ledger entry exactly matches the requested delivery action, when delivery execution evidence is recorded, then Kendall records bounded metadata-only evidence with the matched approval reference, and raw tokens, secrets, provider payloads, raw prompts, raw completions, unbounded command output, and unnecessary source copies are not retained.
4. Given approval, branch, PR, CI, review, merge, retained evidence, or work-item state changes after approval, when the same approval id is reused, then Kendall rejects the request as stale, and the blocked reason names the mismatched or stale field.
5. Given the approval ledger validator is added, when dashboard/report regression checks run, then they prove delivery evidence still remains metadata-only, report-only without exact approval, and bounded by Epic 10 stop lines.

## Tasks / Subtasks

- [x] Add trusted delivery approval ledger contract support. (AC: 1-5)
  - [x] Define a metadata-only delivery approval ledger entry shape in shared contracts and supervisor schemas.
  - [x] Include authority family, action id, work item id, branch/base/head binding, PR URL, CI/review/merge binding, retained evidence refs, operator identity, expiry or review point, rollback plan, and stop lines.
  - [x] Keep the contract local and deterministic; do not add external approval services, secret access, GitHub mutation, provider calls, or broad autonomy.
- [x] Implement delivery approval validation. (AC: 1-4)
  - [x] Add a supervisor validator that resolves approval ids from trusted work-item metadata or retained ledger evidence.
  - [x] Reject missing, unknown, expired, stale, mismatched, or underspecified approvals with stable blocked reason ids.
  - [x] Preserve report-only behavior when exact approval is absent.
  - [x] Accept approved PR and merge evidence only when every required binding matches current payload and plan evidence.
- [x] Harden delivery execution evidence recording. (AC: 1-5)
  - [x] Replace the current `bool(payload.approvalId)` approval check with trusted ledger validation.
  - [x] Ensure rejected approval attempts do not append approved `deliveryExecutionEvidence` metadata.
  - [x] Ensure accepted evidence includes the matched approval reference while remaining metadata-only.
- [x] Add deterministic regression coverage. (AC: 1-5)
  - [x] Add supervisor tests for arbitrary approval id rejection, missing ledger rejection, exact PR approval acceptance, exact merge approval acceptance, stale/expired approval rejection, field mismatch rejection, and metadata-only retention boundaries.
  - [x] Extend drift checks so approval-ledger contract fields, blocked reasons, and report-only stop lines remain pinned.
  - [x] Run the smallest relevant supervisor subset plus `pnpm.cmd run check:delivery-readiness`, `pnpm.cmd run check:docs`, and full `pnpm.cmd run check`.
- [x] Update story evidence. (AC: 1-5)
  - [x] Record verification commands in the Dev Agent Record.
  - [x] Update Completion Notes, File List, and Change Log.

## Dev Notes

### Source Context

- Epic 10 FR35 requires every delivery or cleanup action to bind to current work item, branch, PR, verification, CI, merge-state, review-state, retained evidence, and approval or policy evidence. [Source: `_bmad-output/planning-artifacts/epics.md#Functional Requirements`]
- Epic 10 delivery invariant states every action must be bound to current branch, PR, verification, CI, review, merge-state, retained evidence, and approval or policy evidence, and missing or stale evidence blocks execution. [Source: `_bmad-output/planning-artifacts/epics.md#Epic 10: Policy-Approved Green-Gate Delivery And Cleanup`]
- Story 10.4 BMAD review deferred a real finding: delivery execution approval IDs need trusted approval ledger binding. [Source: `docs/stories/10-4-show-delivery-and-cleanup-plans-in-dev-console.md#Review Findings`]
- The execution authority checkpoint document says generic continuation language is not approval and acceptable approval must name authority family, approved slice, allowed target/settings, expiry or review point, and rollback expectation. [Source: `docs/architecture/kendall-vnxt-execution-authority-approval-checkpoints-2026-06-08.md#Approval Language Required`]
- The authority ledger says approvals are specific to authority family, operation, scope, and evidence, and every approval request should include authority family, exact operation, target work item/story, allowed paths or resources, expected command/tool shape, evidence to retain, rollback or cleanup plan, stop conditions, and whether approval is one-time, story-scoped, or policy-scoped. [Source: `docs/architecture/kendall-vnxt-epic-6-authority-ledger-2026-06-10.md#Approval Request Format`]

### Existing Implementation To Reuse

- Delivery execution evidence contract and endpoint:
  - `packages/contracts/src/api.ts`
  - `services/supervisor/src/supervisor/api/schemas.py`
  - `services/supervisor/src/supervisor/api/main.py`
  - `services/supervisor/src/supervisor/application/service.py`
- Existing delivery evidence tests:
  - `services/supervisor/tests/integration/test_routing_preview.py`
- Existing Epic 10 drift guard:
  - `scripts/check-delivery-readiness-policy-report.mjs`
- Story 10.2 added delivery execution evidence recording and metadata-only retention enforcement.
- Story 10.4 review already hardened merge evidence to require `mergeStatus == "merged"` and added action-level next safe actions.

### Architecture And Safety Boundaries

- This story may validate and record metadata-only approval evidence. It must not execute PR creation, merge, branch deletion, worktree deletion, issue sync, provider expansion, subscription-agent launch, source mutation by workers, credential/session access, failed-check bypass, or broad autonomy.
- Approval validation must fail closed. Unknown approval ids, stale approvals, expired approvals, field mismatches, missing retained evidence, or insufficient stop-line/rollback evidence must block approved recording.
- Evidence remains metadata-only. Do not retain raw prompts, completions, reasoning traces, provider payloads, secrets, raw stdout/stderr, unbounded command output, or unnecessary source copies.
- Prefer work-item metadata or existing retained supervisor evidence for the ledger source. Do not introduce a new database table unless the existing metadata/event model cannot satisfy deterministic tests.

### Implementation Guidance

- A pragmatic ledger shape can live under work-item metadata, for example `deliveryApprovalLedger` as a list of entries keyed by `approvalId`.
- The validator should return both `approved: bool` and stable blocked reason ids. Suggested blockers:
  - `approval-ledger-missing`
  - `approval-id-unknown`
  - `approval-policy-mismatch`
  - `approval-action-mismatch`
  - `approval-work-item-mismatch`
  - `approval-branch-mismatch`
  - `approval-base-branch-mismatch`
  - `approval-head-mismatch`
  - `approval-pr-url-mismatch`
  - `approval-ci-state-mismatch`
  - `approval-review-state-mismatch`
  - `approval-merge-state-mismatch`
  - `approval-retained-evidence-mismatch`
  - `approval-expired`
  - `approval-rollback-missing`
  - `approval-stop-lines-missing`
- Keep existing report-only behavior when no valid approval exists. A request with arbitrary `approvalId` should not be enough to record `approved_pr_action_recorded` or `approved_merge_action_recorded`.
- Accepted evidence should include the matched approval id/reference in the metadata-only view or event payload.

### Testing

Minimum focused verification:

- `pnpm.cmd run test:supervisor -- tests/integration/test_routing_preview.py -q -k "delivery_execution_evidence or low_risk_delivery_plan"`
- `pnpm.cmd run check:delivery-readiness`
- `pnpm.cmd run check:docs`

Broaden before review:

- `pnpm.cmd run check`

## References

- `_bmad-output/planning-artifacts/epics.md`
- `_bmad-output/planning-artifacts/sprint-change-proposal-2026-06-13-approval-ledger-hardening.md`
- `docs/stories/10-2-record-delivery-execution-evidence-for-approved-pr-and-merge-actions.md`
- `docs/stories/10-4-show-delivery-and-cleanup-plans-in-dev-console.md`
- `docs/architecture/kendall-vnxt-execution-authority-approval-checkpoints-2026-06-08.md`
- `docs/architecture/kendall-vnxt-epic-6-authority-ledger-2026-06-10.md`

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- Story created through `bmad-create-story` after Story 10.4 code review surfaced the approval-ledger hardening gap and `bmad-correct-course` added Story 10.5 to Epic 10.
- Focused verification passed: `pnpm.cmd run test:supervisor -- tests/integration/test_routing_preview.py -q -k "delivery_execution_evidence or low_risk_delivery_plan"`.
- Drift verification passed: `pnpm.cmd run check:delivery-readiness`.
- Docs verification passed: `pnpm.cmd run check:docs`.
- Full regression passed: `pnpm.cmd run check` (191 supervisor tests passed; existing aiosqlite deprecation warning only).
- BMAD code review accepted and patched duplicate approval-id ambiguity, exact retained-evidence matching, actor/operator binding, approval timestamp validation, required expiry, stale trusted-current PR evidence rejection, and broader drift-guard coverage.
- Full regression command reached the supervisor test leg and timed out at 180s after all preceding checks and dashboard build passed; the final leg was rerun directly and passed with `195 passed, 1 warning`.

### Completion Notes List

- Added metadata-only `DeliveryApprovalLedgerEntryView` contract/schema and `approvalReference` on delivery execution evidence.
- Implemented trusted delivery approval validation from work-item `deliveryApprovalLedger` metadata, including authority family, policy, action, work item, branch/base/head, PR URL/head, CI, review, merge, exact retained evidence, operator, approved-at, expiry, rollback, and stop-line checks.
- Replaced arbitrary non-empty approval id acceptance with fail-closed ledger validation while preserving report-only behavior for missing policy/no approval.
- Added deterministic supervisor tests for unknown approval id rejection, ambiguous approval id rejection, expired approval rejection, retained-evidence mismatch, operator mismatch, trusted-current PR mismatch, accepted PR evidence, accepted failed PR evidence, accepted merge evidence, nonzero exit rejection, and existing metadata-only retention boundaries.
- Extended the Epic 10 drift guard to pin ledger contracts, approval blocked reasons, approval references, Story 10.5, and ledger tests.

### Review Findings

- [x] Duplicate approval ids are rejected with `approval-id-ambiguous`.
- [x] Retained evidence must match exactly rather than by subset.
- [x] Accepted actions bind actor identity to the ledger `approvedBy` value.
- [x] Approval timestamps must be parseable, not future-dated, and not later than expiry.
- [x] Execution approvals require `expiresAt`; review point alone is not treated as execution approval.
- [x] Reused approvals compare against retained current delivery evidence when available, not only the caller payload.

### File List

- `_bmad-output/planning-artifacts/epics.md`
- `_bmad-output/planning-artifacts/sprint-change-proposal-2026-06-13-approval-ledger-hardening.md`
- `docs/stories/10-5-bind-delivery-execution-approval-to-trusted-authority-ledger.md`
- `docs/stories/index.md`
- `packages/contracts/src/api.ts`
- `scripts/check-delivery-readiness-policy-report.mjs`
- `services/supervisor/src/supervisor/api/schemas.py`
- `services/supervisor/src/supervisor/application/service.py`
- `services/supervisor/tests/integration/test_routing_preview.py`

## Change Log

- 2026-06-13: Created Story 10.5 and moved it to ready-for-dev.
- 2026-06-13: Implemented trusted delivery approval ledger validation and moved story to review.
- 2026-06-13: Patched BMAD code-review findings, verified focused and broad checks, and moved story to done.
