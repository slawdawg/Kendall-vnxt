---
baseline_commit: fcd1351e926af2370a92e812ca41bf236ee458f4
---

# Story 7.3: Block Out-of-Scope Diffs Before Worker Mutation

Date: 2026-06-11
Status: done

## Story

As Bob,
I want Kendall to detect whether Codex touched files outside the approved scope before any real mutation is eligible for delivery,
so that unsafe or surprising changes cannot proceed to PR, merge, or cleanup.

## Acceptance Criteria

1. Given a supervised worker attempt with approved files, allowed globs, forbidden paths, generated-file rules, and user-owned dirty-file rules, when Kendall inspects the resulting diff, then it classifies changed files as allowed, blocked, or unexpected.
2. Given the diff only includes approved paths, when Kendall evaluates the diff guard, then the guard reports in-scope and retains the changed-file inventory as evidence.
3. Given a worker attempt produces any diff outside the declared allowed paths, when Kendall evaluates delivery readiness, then the attempt is marked blocked, evidence is preserved, PR/merge/cleanup eligibility is prevented, and exact offending paths are reported.
4. Given a diff contains out-of-scope changes, when Bob views the readiness evidence, then the result shows which files violated scope and recommends inspect, revise scope, revert, or abandon.
5. The diff guard must pass before Story 7.4 can perform a real mutating Codex launch.

## Tasks / Subtasks

- [x] Define diff-guard contract fields. (AC: 1)
  - [x] Approved files.
  - [x] Allowed globs.
  - [x] Forbidden paths.
  - [x] Generated-file rules.
  - [x] User-owned dirty-file rules.
  - [x] Changed-file inventory and classification.
- [x] Implement read-only diff inspection. (AC: 1, 2, 3)
  - [x] Use Git metadata/diff commands only.
  - [x] Avoid shell execution beyond existing safe command patterns.
  - [x] Do not mutate files, branches, worktrees, or GitHub.
- [x] Feed guard result into green-gate readiness. (AC: 2, 3, 4)
  - [x] In-scope diff contributes a green input.
  - [x] Out-of-scope diff blocks delivery and cleanup eligibility.
  - [x] Missing diff evidence remains blocked/not recorded, not eligible.
- [x] Add negative fixtures and assertions. (AC: 1-5)
  - [x] Unexpected file.
  - [x] Forbidden path.
  - [x] Deletion outside scope.
  - [x] Generated churn outside allowed generated paths.
  - [x] Untracked file.
  - [x] Dirty user-owned file.

### Review Findings

- [x] [Review][Patch] Diff guard misses ordinary tracked dirty files outside scope [services/supervisor/src/supervisor/application/service.py:3731]
- [x] [Review][Patch] Diff guard ignores rename/copy source paths [services/supervisor/src/supervisor/application/service.py:3777]
- [x] [Review][Patch] Diff guard uses broad hardcoded path families instead of selected attempt scope [services/supervisor/src/supervisor/application/service.py:3739]

## Dev Notes

### Dependencies

- Builds on Story 7.1 readiness contract and Story 7.2 launch contract.
- Must be implemented before any real mutating Codex launch in Story 7.4.

### Existing Surfaces To Reuse

- `services/supervisor/src/supervisor/application/service.py`
  - trusted delivery eligibility Git inspection patterns
  - `_git_output(...)`
  - `_eligibility_check(...)`
- `packages/contracts/src/api.ts`
  - `TrustedDeliveryEligibilityCheckView`
  - `TrustedDeliveryEligibilityStageEvaluationView`
  - green-gate additions from Story 7.1
- `docs/stories/6-26-trusted-delivery-eligibility-evaluator.md`
- `docs/architecture/kendall-vnxt-orchestrator-spec-2026-06-10.md`

### Implementation Guidance

- Do not rely only on `git diff --stat`; the guard needs file-level classification.
- Treat untracked files as attention/blocked unless explicitly allowed.
- Treat deleted files outside scope as blocked.
- Keep the result machine-checkable and suitable for later Dev Console rendering.
- Do not hide out-of-scope changes behind generic "dirty tree" text; report exact offending paths.

### Testing Requirements

- Focused supervisor tests should use temporary Git fixtures or equivalent deterministic file lists.
- Required focused command:
  - `pnpm.cmd run test:supervisor -- tests/integration/test_routing_preview.py -q -k "diff_guard or green_gate"`
- Broader verification:
  - `pnpm.cmd run check:docs`
  - `pnpm.cmd run check`

### Authority Boundary

This story only inspects diffs and computes readiness impact. It does not approve or perform Codex launch, PR creation/update, merge, cleanup, issue sync, provider calls, Claude launch, subscription-agent launch, or broad autonomy.

## Dev Agent Record

### Agent Model Used

Codex GPT-5

### Debug Log References

- Red test: `pnpm.cmd run test:supervisor -- tests/integration/test_routing_preview.py -q -k "diff_guard or green_gate"` failed before implementation because `diffGuard` was absent from the trusted delivery eligibility report.
- Focused verification: `pnpm.cmd run test:supervisor -- tests/integration/test_routing_preview.py -q -k "diff_guard or green_gate"` passed, 1 passed / 89 deselected.
- Routing integration verification: `pnpm.cmd run test:supervisor -- tests/integration/test_routing_preview.py -q` passed, 90 passed with 1 existing aiosqlite warning.
- Full verification: `pnpm.cmd run check` passed, including dashboard build and 145 supervisor tests with 1 existing aiosqlite warning.

### Completion Notes List

- Added a trusted delivery `diffGuard` contract with approved files, allowed globs, forbidden paths, generated-file rules, user-owned dirty-file rules, changed-file inventory, classifications, blocked paths, and operator recommendation.
- Implemented read-only file-level inspection using existing Git metadata command patterns: `git diff --name-status main...HEAD` and `git status --porcelain=v1`.
- Classified allowed source/story/test/script changes separately from forbidden paths, unexpected paths, generated churn, untracked files, and user-owned dirty files.
- Fed the diff guard into the green-gate push/PR eligibility stage through a `diff-guard` check so out-of-scope changes block delivery and cleanup eligibility.
- Added deterministic positive and negative fixtures for approved paths, unexpected file, forbidden path, out-of-scope deletion, generated churn, untracked file, and user-owned dirty file.
- Preserved read-only behavior: no file mutation, branch/worktree mutation, GitHub operation, worker launch, or cleanup action.

### File List

- `docs/stories/7-3-block-out-of-scope-diffs-before-worker-mutation.md`
- `packages/contracts/src/api.ts`
- `services/supervisor/src/supervisor/api/schemas.py`
- `services/supervisor/src/supervisor/application/service.py`
- `services/supervisor/tests/integration/test_routing_preview.py`

### Change Log

- 2026-06-11: Implemented Story 7.3 trusted delivery diff guard, file-level classification, green-gate blocking check, negative fixtures, and verification evidence; status moved to review.
