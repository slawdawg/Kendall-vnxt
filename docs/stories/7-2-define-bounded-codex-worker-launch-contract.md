---
baseline_commit: fcd1351e926af2370a92e812ca41bf236ee458f4
---

# Story 7.2: Define the Bounded Codex Worker Launch Contract

Date: 2026-06-11
Status: review

## Story

As Bob,
I want each Codex worker launch to have a concrete authority envelope,
so that useful work can start without opening broad source mutation, provider, secret, or cleanup authority.

## Acceptance Criteria

1. Given a selected Active Work item, when Kendall prepares a Codex worker launch, then the launch contract includes target work item, route decision, attempt id, worker id, lane, authority mode, workspace plan, allowed paths, blocked paths, verification command, stop conditions, evidence to retain, and approval expiry.
2. Given the work item, route decision, worker target, workspace plan, permission envelope, or evidence changes after approval, when Kendall attempts launch, then launch is rejected as stale and a non-executing event records the mismatch.
3. Given the launch contract is approved, when Kendall evaluates blocked authorities, then Claude launch, subscription-agent launch, provider expansion, issue sync, secret access, merge, cleanup, and broad autonomy remain blocked unless separately approved.
4. Given a negative launch fixture with stale route decision, changed permission envelope, forbidden path, missing verification command, or expired approval, when Kendall evaluates the launch contract, then the machine-checkable result rejects launch and records the exact stale or unsafe field.
5. This story uses fake-adapter or no-launch evaluation only. It must not launch Codex or mutate source.

## Tasks / Subtasks

- [x] Define the Codex launch contract shape. (AC: 1)
  - [x] Extend existing Codex readiness/approval surfaces instead of creating a disconnected worker model.
  - [x] Include approval binding fields: work item, route decision, attempt, worker id, lane, authority mode, workspace plan, policy id, approved scope, and expiry.
  - [x] Include permission envelope fields: allowed paths, blocked paths, allowed command shape, timeout/budget, evidence outputs, and stop conditions.
- [x] Add stale/mismatch rejection logic. (AC: 2, 4)
  - [x] Reject stale route decisions.
  - [x] Reject changed permission envelopes.
  - [x] Reject expired approvals.
  - [x] Reject missing verification command or forbidden path scope.
- [x] Keep blocked authorities explicit. (AC: 3, 5)
  - [x] Ensure any approval result still reports blocked Claude, subscription-agent, provider expansion, issue sync, secrets, merge, cleanup, and broad autonomy.
  - [x] Preserve read-only/no-launch behavior.
- [x] Add focused tests. (AC: 1-5)
  - [x] Add positive contract fixture.
  - [x] Add negative fixtures for stale route, changed permission envelope, forbidden path, missing verification command, and expired approval.
  - [x] Assert no Codex process launches and no workflow state mutates unless the story explicitly records a non-executing rejection event.

## Dev Notes

### Dependencies

- Builds on Story 7.1 green-gate readiness contract.
- Enables Story 7.3 diff guard and Story 7.4 first supervised launch.

### Existing Surfaces To Reuse

- `packages/contracts/src/api.ts`
  - `CodexImplementationApprovalReportView`
  - `CodexImplementationApprovalRequirementView`
  - `ExecutionAttemptView`
  - `WorkspaceIsolationPlanView`
- `services/supervisor/src/supervisor/application/service.py`
  - `get_codex_readiness_report()`
  - `get_codex_implementation_approval_report()`
  - execution attempt and workspace isolation helpers
- `services/supervisor/tests/integration/test_routing_preview.py`
  - existing Codex readiness/approval tests
- `docs/stories/6-16-codex-readiness-no-launch.md`
- `docs/stories/6-17-codex-implementation-approval-packet.md`
- `docs/architecture/kendall-vnxt-execution-authority-approval-checkpoints-2026-06-08.md`
- `docs/architecture/kendall-vnxt-worker-threat-boundary-2026-06-08.md`

### Implementation Guidance

- Prefer extending the existing Codex approval packet into a launch-contract evaluator.
- Do not implement process launch in this story.
- Do not treat an approved contract as permission to merge, cleanup, sync issues, call providers, or launch Claude.
- If a non-executing rejection event is recorded, make it stable and explicit so later stories can use it as evidence.
- Keep contract output machine-checkable for Story 7.3 and Story 7.4.

### Testing Requirements

- Focused supervisor test command:
  - `pnpm.cmd run test:supervisor -- tests/integration/test_routing_preview.py -q -k "codex_implementation_approval or codex_launch_contract"`
- Broader verification:
  - `pnpm.cmd run check:docs`
  - `pnpm.cmd run check`

### Authority Boundary

This story does not approve or perform Codex launch, Claude launch, subscription-agent launch, provider expansion, GitHub issue sync, PR creation/update, CI wait, merge, branch deletion, worktree deletion, remote cleanup, secret access, or broad autonomy.

## Dev Agent Record

### Agent Model Used

Codex GPT-5

### Debug Log References

- Red test: `pnpm.cmd run test:supervisor -- tests/integration/test_routing_preview.py -q -k "codex_implementation_approval or codex_launch_contract"` failed before implementation because `launchContract` was absent from the Codex implementation approval report.
- Focused verification: `pnpm.cmd run test:supervisor -- tests/integration/test_routing_preview.py -q -k "codex_implementation_approval or codex_launch_contract"` passed, 2 passed / 87 deselected.
- Routing integration verification: `pnpm.cmd run test:supervisor -- tests/integration/test_routing_preview.py -q` passed, 89 passed with 1 existing aiosqlite warning.
- Full verification: `pnpm.cmd run check` passed, including dashboard build and 144 supervisor tests with 1 existing aiosqlite warning.

### Completion Notes List

- Extended the existing Codex implementation approval report with a bounded no-launch `launchContract` instead of adding a disconnected worker model.
- Added approval binding fields for work item, route decision, attempt, worker id, lane, authority mode, workspace plan, policy id, approved scope, and expiry.
- Added a permission envelope covering allowed paths, blocked paths, allowed command shape, verification command, timeout, budget, evidence outputs, and stop conditions.
- Added machine-checkable positive and negative launch contract fixtures for stale route decision, changed permission envelope, forbidden path scope, missing verification command, and expired approval.
- Kept Story 7.2 fake-adapter/no-launch: report evaluation never approves launch, never attempts process start, and the report remains read-only with no workflow event mutation.
- Added explicit blocked authorities for Claude launch, subscription-agent launch, provider expansion, issue sync, secret access, merge, cleanup, and broad autonomy.

### File List

- `docs/stories/7-2-define-bounded-codex-worker-launch-contract.md`
- `packages/contracts/src/api.ts`
- `services/supervisor/src/supervisor/api/schemas.py`
- `services/supervisor/src/supervisor/application/service.py`
- `services/supervisor/tests/integration/test_routing_preview.py`

### Change Log

- 2026-06-11: Implemented Story 7.2 bounded Codex launch contract fields, no-launch evaluation fixtures, blocked authority reporting, focused integration tests, and verification evidence; status moved to review.
