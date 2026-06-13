---
baseline_commit: afc62fc7
---

# Story 10.2: Record Delivery Execution Evidence For Approved PR And Merge Actions

Status: done

## Story

As Bob,
I want approved PR and merge actions to leave bounded metadata-only evidence,
so that delivery can be audited, recovered, or blocked without relying on chat history.

## Acceptance Criteria

1. Given a low-risk delivery plan is approved for PR or merge execution, when Kendall records the action result, then evidence includes command shape, target branch or PR, local verification summary, CI summary, review state, merge result, terminal status, retained artifact refs, and recovery path, and raw tokens, secrets, provider payloads, raw prompts, raw completions, unbounded command output, and unnecessary source copies are not retained.
2. Given branch head, PR head, base branch, merge state, CI state, review state, retained evidence, or approval/policy evidence changes after plan creation, when execution evidence is evaluated, then the action is rejected as stale and a non-mutating event records the mismatched field.
3. Given PR or merge execution fails, when Kendall records the terminal state, then evidence preserves enough metadata for inspect, retry, resume, or rollback, and cleanup remains blocked until delivery state is safe.
4. Given no exact approval or policy grants execution, when delivery evidence is requested, then Kendall records report-only readiness and does not push, merge, delete branches, delete worktrees, mutate issues, or bypass failed checks.
5. Given Story 10.2 is complete, then no provider expansion, credential/session access, source mutation by workers, subscription-agent process launch, issue sync, failed-check bypass, destructive cleanup, or broad autonomy is introduced.

## Tasks / Subtasks

- [x] Define the delivery execution evidence contract. (AC: 1-5)
  - [x] Reuse `LowRiskDeliveryPlanReportView`, `WorkItemDeliveryReadinessView`, trusted delivery stage evidence, and workflow-event patterns from Story 10.1.
  - [x] Define separate evidence modes for report-only readiness, approved PR action, approved merge action, stale rejection, and terminal failure.
  - [x] Include metadata-only fields for command shape, target branch, PR URL, expected head, base branch, CI summary, review state, merge state/result, terminal status, artifact refs, and recovery path.
- [x] Implement report-only and stale-rejection evidence recording. (AC: 1-4)
  - [x] Preserve current behavior when no exact execution approval or policy evidence exists.
  - [x] Add a non-mutating stale rejection path for branch/head/PR/CI/review/merge/evidence mismatches.
  - [x] Do not call `_remote_delivery_commands(...)`, `gh`, `git push`, `gh pr merge`, branch deletion, worktree deletion, issue sync, provider/model calls, credential/session access, or cleanup routines in this story.
- [x] Add deterministic supervisor tests. (AC: 1-5)
  - [x] Cover report-only readiness with no execution approval.
  - [x] Cover approved-action evidence recording with synthetic local metadata only.
  - [x] Cover stale PR head, stale branch head, failing CI, missing review, unsafe merge state, and missing retained evidence.
  - [x] Cover terminal failure evidence and cleanup remaining blocked.
  - [x] Assert raw tokens, secrets, prompts, completions, provider payloads, unbounded command output, and source copies are not retained.
- [x] Extend focused drift checks. (AC: 1-5)
  - [x] Extend `check:delivery-readiness` or a narrowly adjacent check so delivery evidence contracts, routes/service wiring, tests, and story evidence cannot drift silently.
  - [x] Keep dashboard rendering work for Story 10.4 unless a minimal report shortcut is required for discoverability.
- [x] Update story evidence. (AC: 1-5)
  - [x] Record focused and full verification commands in the Dev Agent Record.
  - [x] Update this story's Completion Notes and File List during implementation.

## Review Findings

- [x] High: exact approval/policy evidence must be enforced; arbitrary `approvalId` values no longer unlock event or metadata recording.
- [x] High: approved PR and merge evidence now requires explicit binding fields, including command shape, branch/head/base branch, PR URL/head, terminal status, summary, recovery path, and retained artifact refs.
- [x] High: metadata-only retention is enforced with bounded strings and forbidden raw-output, secret, token, prompt, completion, provider payload, and source-copy markers.
- [x] Medium: PR action evidence uses the same required binding, CI, review, merge-state, and retained-evidence checks as merge evidence.
- [x] Medium: failed terminal delivery evidence records `delivery_action_failed` and `delivery_execution.failed` while keeping cleanup blocked and remote mutation false.

## Dev Notes

### Source Context

- Story 10.2 follows Story 10.1. Story 10.1 added read-only low-risk delivery plan reports and review patches that make missing policy a hard block, add stale PR/head binding blockers, and split cleanup dry-run effects into worktree and branch operations. [Source: `docs/stories/10-1-define-low-risk-delivery-policy-and-dry-run-plan-contract.md#Completion Notes List`]
- Epic 10 requires delivery or cleanup actions to bind to current work item, branch, PR, verification, CI, merge-state, review-state, retained evidence, and approval or policy evidence. [Source: `_bmad-output/planning-artifacts/epics.md#Epic 10: Policy-Approved Green-Gate Delivery And Cleanup`]
- The product brief says Git/GitHub operations must progress through report-only, local checks, human-approved push/PR actions, human-approved merge, and only later policy-approved automation. [Source: `docs/product/kendall-vnxt-orchestrator-product-brief-2026-06-10.md#Git And GitHub Hygiene`]

### Existing Implementation To Reuse

- Story 10.1 introduced:
  - `LowRiskDeliveryPlanActionView`
  - `LowRiskDeliveryPlanReportView`
  - `GET /supervisor/low-risk-delivery-plan`
  - `GET /work-items/{work_item_id}/low-risk-delivery-plan`
  - `SupervisorService.get_low_risk_delivery_plan_report(...)`
  - `SupervisorService._low_risk_delivery_plan_action(...)`
  - `SupervisorService._low_risk_delivery_binding_blockers(...)`
  [Source: `packages/contracts/src/api.ts`; `services/supervisor/src/supervisor/api/schemas.py`; `services/supervisor/src/supervisor/api/main.py`; `services/supervisor/src/supervisor/application/service.py`]
- Existing delivery readiness metadata flows through `record_delivery_readiness(...)`, `_normalize_delivery_readiness_payload(...)`, `_recipe_delivery_gate_payload(...)`, and workflow events such as `recipe.delivery_readiness_updated` and `recipe.delivery_gate_recorded`. Extend or compose these patterns rather than creating a parallel store. [Source: `services/supervisor/src/supervisor/application/service.py`]
- Existing execution/verification evidence uses `ExecutionAttempt.artifact_refs_json` and metadata-only artifact refs such as `verification_result`. Use this pattern for retained delivery evidence when a specific execution attempt exists. [Source: `services/supervisor/src/supervisor/application/service.py`; `docs/stories/9-3-restore-provider-raw-output-ui-regression-coverage.md#Completion Notes List`]
- `_remote_delivery_commands(...)` currently contains live remote behavior. Story 10.2 may record synthetic/approved evidence but must not call this executor unless a later exact authority story grants it. [Source: `services/supervisor/src/supervisor/application/service.py`]

### Architecture And Safety Boundaries

- This story may define and record metadata evidence. It must not perform live remote delivery, merge, branch deletion, worktree deletion, issue sync, provider calls, credential/session access, failed-check bypass, or cleanup execution.
- Generic continuation language is not approval for GitHub mutation, cleanup, secrets, providers, or broad autonomy. Any evidence record that represents approved execution must name the exact approval or policy evidence used. [Source: `docs/architecture/kendall-vnxt-execution-authority-approval-checkpoints-2026-06-08.md#Language That Is Not Approval`]
- Evidence retention remains metadata-only. Do not store raw tokens, secrets, raw stdout/stderr, prompts, completions, provider payloads, unbounded command output, or unnecessary source copies. [Source: `docs/architecture/kendall-vnxt-worker-threat-boundary-2026-06-08.md#Artifact Boundary`]
- Cleanup must remain blocked after failed or stale PR/merge evidence. Story 10.3 owns cleanup planning and worktree residue classification.

### Implementation Guidance

- Prefer a small evidence contract or endpoint that records delivery execution evidence only when the request is explicitly report-only or carries an exact approval/policy reference.
- Suggested evidence modes:
  - `report_only_readiness`
  - `approved_pr_action_recorded`
  - `approved_merge_action_recorded`
  - `delivery_action_rejected_stale`
  - `delivery_action_failed`
- Suggested stable blocked/stale reasons:
  - `policy-missing`
  - `delivery-target-mismatch`
  - `stale-pr-head`
  - `branch-head-mismatch`
  - `ci-failed`
  - `review-missing`
  - `merge-not-clean`
  - `retained-evidence-missing`
  - `cleanup-blocked-delivery-unsafe`
- If a request shape is added, include `recordEvent` or equivalent explicit mutation control so default/read-only calls cannot mutate state accidentally.
- When in doubt, expose a report-only view first and record a non-mutating rejection event only when the request explicitly asks to record evidence.

### Testing

Minimum focused verification:

- `pnpm.cmd run test:supervisor -- tests/integration/test_routing_preview.py -q -k "delivery_evidence or low_risk_delivery_plan"`
- `pnpm.cmd run check:delivery-readiness`
- `pnpm.cmd run check:docs` when story/docs/index artifacts change.

Broaden before review when shared contracts, schemas, API routes, runtime export, dashboard report surfaces, or package check wiring changes:

- `pnpm.cmd run check`

### Project Structure Notes

- Story record location: `docs/stories/`.
- Shared API contracts: `packages/contracts/src/api.ts`.
- Supervisor schemas: `services/supervisor/src/supervisor/api/schemas.py`.
- Supervisor routes: `services/supervisor/src/supervisor/api/main.py`.
- Supervisor delivery logic: `services/supervisor/src/supervisor/application/service.py`.
- Existing integration tests: `services/supervisor/tests/integration/test_routing_preview.py`.
- Existing delivery readiness drift guard: `scripts/check-delivery-readiness-policy-report.mjs`.
- Avoid dashboard UI work unless a small report shortcut is required; Story 10.4 owns the Dev Console presentation.

## References

- `_bmad-output/planning-artifacts/epics.md`
- `docs/stories/10-1-define-low-risk-delivery-policy-and-dry-run-plan-contract.md`
- `docs/product/kendall-vnxt-orchestrator-product-brief-2026-06-10.md`
- `docs/architecture/kendall-vnxt-execution-authority-approval-checkpoints-2026-06-08.md`
- `docs/architecture/kendall-vnxt-worker-threat-boundary-2026-06-08.md`
- `packages/contracts/src/api.ts`
- `services/supervisor/src/supervisor/api/main.py`
- `services/supervisor/src/supervisor/api/schemas.py`
- `services/supervisor/src/supervisor/application/service.py`
- `services/supervisor/tests/integration/test_routing_preview.py`
- `scripts/check-delivery-readiness-policy-report.mjs`

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- Focused supervisor regression: `pnpm.cmd run test:supervisor -- tests/integration/test_routing_preview.py -q -k "delivery_execution_evidence or low_risk_delivery_plan"` passed with 7 tests and 1 existing aiosqlite warning.
- Static drift: `pnpm.cmd run check:delivery-readiness` passed after extending delivery-readiness drift coverage for delivery execution evidence contracts, route, service modes, event names, tests, and story index evidence.
- Documentation verification: `pnpm.cmd run check:docs` passed.
- Full regression: `pnpm.cmd run check` passed, including dashboard build and 175 supervisor tests with 1 existing aiosqlite warning.
- Review patch focused regression: `pnpm.cmd run test:supervisor -- tests/integration/test_routing_preview.py -q -k "delivery_execution_evidence or low_risk_delivery_plan"` passed with 10 tests and 1 existing aiosqlite warning.
- Review patch static drift: `pnpm.cmd run check:delivery-readiness` passed.
- Review patch documentation verification: `pnpm.cmd run check:docs` passed.
- Review patch full regression: `pnpm.cmd run check` passed, including dashboard build and 178 supervisor tests with 1 existing aiosqlite warning.

### Completion Notes List

- Added shared TypeScript and Pydantic contracts for `DeliveryExecutionEvidencePayload` and `DeliveryExecutionEvidenceView`.
- Added `POST /work-items/{work_item_id}/delivery-execution-evidence` for metadata-only delivery execution evidence recording.
- Implemented `record_delivery_execution_evidence(...)` with explicit modes for report-only readiness, stale rejection, approved PR action evidence, approved merge action evidence, and failed delivery evidence.
- Preserved report-only behavior when approval/policy evidence is missing: `recordEvent=True` still returns blocked readiness without recording events or mutating metadata.
- Added stale rejection evidence for branch/head/PR/CI/review/merge/evidence mismatches, including stable blocked reasons such as `branch-head-mismatch`, `stale-pr-head`, `ci-failed`, `review-missing`, `merge-not-clean`, and `retained-evidence-missing`.
- Added approved synthetic merge evidence recording that updates metadata and emits `delivery_execution.recorded` without invoking GitHub, merge, branch deletion, cleanup, provider/model calls, credential/session access, issue sync, or failed-check bypass.
- Extended `check:delivery-readiness` drift coverage for the new delivery execution evidence contract, route, service modes, events, tests, and Story 10.2 index evidence.
- Accepted and patched BMAD code-review findings for exact policy identity, required PR/merge binding fields, metadata-only retention boundaries, PR evidence completeness, and failed-action evidence mode.

### File List

- `docs/stories/10-2-record-delivery-execution-evidence-for-approved-pr-and-merge-actions.md`
- `docs/stories/index.md`
- `packages/contracts/src/api.ts`
- `scripts/check-delivery-readiness-policy-report.mjs`
- `services/supervisor/src/supervisor/api/main.py`
- `services/supervisor/src/supervisor/api/schemas.py`
- `services/supervisor/src/supervisor/application/service.py`
- `services/supervisor/tests/integration/test_routing_preview.py`

## Change Log

- 2026-06-13: Implemented metadata-only delivery execution evidence recording and moved Story 10.2 to review.
- 2026-06-13: Patched accepted BMAD code-review findings and moved Story 10.2 to done.
