---
baseline_commit: fcd1351e926af2370a92e812ca41bf236ee458f4
---

# Story 7.5: Record Verification Results And Recovery Evidence

Date: 2026-06-11
Status: review

## Story

As Bob,
I want Kendall to run and retain the approved verification result for the worker output,
so that failed checks preserve recovery options and passed checks can feed green-gate delivery.

## Acceptance Criteria

1. Given a supervised Codex attempt has completed with in-scope changes, when Kendall runs the approved verification command, then the command result, exit status, duration metadata, and summary are retained as evidence.
2. Given verification fails, when Kendall updates delivery readiness, then PR, merge, and cleanup eligibility are blocked and the worktree/evidence are preserved for inspect, retry, resume, or rollback.
3. Given verification passes, when delivery readiness is evaluated, then verification contributes a green input and does not bypass diff guard, CI, merge-state, evidence-retention, or authority checks.
4. Verification evidence must distinguish passed, failed, timed out, could not run, and not recorded states.
5. Verification evidence must not retain secrets, raw prompts, provider payloads, or unnecessary source copies.

## Tasks / Subtasks

- [x] Define verification evidence shape. (AC: 1, 4, 5)
  - [x] command id/label,
  - [x] command shape,
  - [x] status,
  - [x] exit code,
  - [x] duration metadata,
  - [x] bounded summary,
  - [x] artifact reference if output is retained,
  - [x] recovery action.
- [x] Connect verification to green-gate readiness. (AC: 2, 3)
  - [x] Failed verification blocks PR/merge/cleanup eligibility.
  - [x] Passed verification contributes only one green input.
  - [x] Missing verification remains not recorded/blocked.
- [x] Preserve recovery evidence. (AC: 2)
  - [x] Worktree path.
  - [x] branch/head revision.
  - [x] failed command summary.
  - [x] recommended inspect/retry/resume/rollback action.
- [x] Add focused tests. (AC: 1-5)
  - [x] passing command fixture,
  - [x] failing command fixture,
  - [x] timeout/could-not-run fixture,
  - [x] missing verification fixture,
  - [x] read-only/no-secret retention assertion.

### Review Findings

- [x] [Review][Patch] Verification evidence is caller-supplied instead of produced by approved command execution [services/supervisor/src/supervisor/application/service.py:5882]
- [x] [Review][Patch] Verification evidence accepts arbitrary or stale results without command/status consistency [services/supervisor/src/supervisor/application/service.py:5882]
- [x] [Review][Patch] Green-gate readiness ignores persisted work-item verification evidence [services/supervisor/src/supervisor/application/service.py:3426]

## Dev Notes

### Dependencies

- Builds on Story 7.1 readiness contract.
- Consumes in-scope result from Story 7.3 diff guard.
- Consumes attempt evidence from Story 7.4 first launch.
- Feeds Story 7.6 Dev Console and Story 7.7 eligibility.

### Existing Surfaces To Reuse

- `packages/contracts/src/api.ts`
  - `VerificationCommandView`
  - `VerificationReadinessReportView`
  - green-gate additions from Story 7.1
- `services/supervisor/src/supervisor/application/service.py`
  - verification readiness report patterns,
  - runtime evidence export patterns,
  - trusted delivery eligibility checks.
- `docs/stories/3-16-verification-readiness-report.md`
- `docs/stories/3-56-verification-execution-plan-groups.md`
- `docs/stories/3-58-verification-handoff-checkpoints.md`

### Implementation Guidance

- Do not run arbitrary commands. Run only the approved verification command for the selected worker task.
- If the command cannot run, report `could_not_run` rather than pretending failure or success.
- Keep output bounded and redacted. Prefer summaries and artifact references.
- Preserve worktree state on failure. Do not clean up automatically.

### Testing Requirements

- Focused command:
  - `pnpm.cmd run test:supervisor -- tests/integration/test_routing_preview.py -q -k "verification_evidence or green_gate"`
- Broader verification:
  - `pnpm.cmd run check:docs`
  - `pnpm.cmd run check`

### Authority Boundary

This story may run only the approved verification command for the bounded task. It does not approve PR creation/update, CI wait, merge, cleanup, issue sync, Claude launch, provider expansion, subscription-agent launch, secret access, or broad autonomy.

## Dev Agent Record

### Agent Model Used

Codex GPT-5

### Debug Log References

- Red test: `pnpm.cmd run test:supervisor -- tests/integration/test_routing_preview.py -q -k "verification_evidence or green_gate"` failed before implementation because the verification-evidence endpoint and green-gate verification fixtures were absent.
- Focused verification: `pnpm.cmd run test:supervisor -- tests/integration/test_routing_preview.py -q -k "verification_evidence or green_gate"` passed, 3 passed / 91 deselected with 1 existing aiosqlite warning.
- Routing integration verification: `pnpm.cmd run test:supervisor -- tests/integration/test_routing_preview.py -q` passed, 94 passed with 1 existing aiosqlite warning.
- Full verification: `pnpm.cmd run check` passed, including dashboard build and 149 supervisor tests with 1 existing aiosqlite warning.

### Completion Notes List

- Added verification evidence request contracts for command id/label, command shape, status, exit code, duration, bounded summary, artifact reference, and recovery action.
- Added `POST /work-items/{work_item_id}/execution-attempts/{attempt_id}/verification-evidence` to retain approved verification results on an execution attempt.
- Preserved recovery evidence including worktree/workspace reference, branch, head revision, failed-command summary, and inspect/retry/resume/rollback guidance.
- Added green-gate verification evidence fixtures for passed, failed, timed out, could-not-run, and not-recorded states.
- Kept passed verification as one green input only; diff guard, CI, merge-state, evidence-retention, authority, PR, merge, and cleanup checks remain separate.
- Kept verification retention metadata-only: no raw output, secrets, prompts, provider payloads, or source copies are retained.

### File List

- `docs/stories/7-5-record-verification-results-and-recovery-evidence.md`
- `packages/contracts/src/api.ts`
- `services/supervisor/src/supervisor/api/main.py`
- `services/supervisor/src/supervisor/api/schemas.py`
- `services/supervisor/src/supervisor/application/service.py`
- `services/supervisor/tests/integration/test_routing_preview.py`

### Change Log

- 2026-06-11: Implemented Story 7.5 verification evidence recording, recovery metadata retention, green-gate verification fixtures, no-secret retention assertions, and verification evidence; status moved to review.
