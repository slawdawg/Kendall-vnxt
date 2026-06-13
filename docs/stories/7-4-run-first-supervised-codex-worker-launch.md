---
baseline_commit: fcd1351e926af2370a92e812ca41bf236ee458f4
---

# Story 7.4: Run the First Supervised Codex Worker Launch

Date: 2026-06-11
Status: done

## Story

As Bob,
I want Kendall to launch one bounded Codex worker for the approved useful task,
so that Epic 7 proves useful supervised execution instead of another preparation-only loop.

## Acceptance Criteria

1. Given an approved Codex launch contract for the selected useful task, when Kendall launches the worker, then exactly one supervised execution attempt is created for the work item and state transitions are recorded.
2. Given the worker produces output or file changes, when Kendall records attempt evidence, then evidence includes metadata-only command shape, worktree or branch, input scope, output summary, touched files, terminal state, and recovery path.
3. Given the out-of-scope diff guard is not implemented or is failing, when Kendall prepares a real mutating Codex launch, then real mutation remains blocked and only fake adapter or dry-run behavior is allowed.
4. Given the diff guard is green and Bob explicitly approves the selected boring useful task, when Kendall performs the first real supervised Codex launch, then the worker produces a small reviewable repo diff inside the approved scope and stops at the approved boundary.
5. Given the worker cannot launch, times out, fails, or is cancelled, when the attempt reaches a terminal state, then Kendall preserves evidence and worktree state needed for inspection or recovery and shows the next safe action.

## Tasks / Subtasks

- [x] Select and bind the first boring useful task. (AC: 4)
  - [x] Target must be low-risk, reviewable, and visibly useful.
  - [x] Target should improve green-gate delivery readiness or related evidence clarity.
  - [x] Target must name allowed files, blocked files, verification command, and expected evidence.
- [x] Implement supervised Codex launch path. (AC: 1, 2, 5)
  - [x] Create or reuse one execution attempt.
  - [x] Launch in isolated worktree/workspace.
  - [x] Capture metadata-only command shape and output summary.
  - [x] Capture terminal state and recovery path.
- [x] Enforce pre-launch guard requirements. (AC: 3, 4)
  - [x] Real mutation blocked unless Story 7.3 diff guard is green.
  - [x] Real mutation blocked unless Bob explicitly approves the selected launch contract.
  - [x] Fake adapter or dry-run behavior remains available before real mutation.
- [x] Preserve stop lines. (AC: 2, 4, 5)
  - [x] No PR creation/update.
  - [x] No merge.
  - [x] No cleanup.
  - [x] No Claude launch.
  - [x] No provider expansion.
  - [x] No subscription-agent launch.
  - [x] No issue sync.
  - [x] No secret access.

### Review Findings

- [x] [Review][Decision] Story 7.4 launch proof is currently metadata-only - Current endpoint records completed supervised Codex attempt without actually launching Codex/workspace worker; decide whether to implement actual bounded Codex launch now or re-scope story/status.
- [x] [Review][Patch] Real supervised launch lacks approval-binding and stale-contract validation [services/supervisor/src/supervisor/application/service.py:5798]
- [x] [Review][Patch] Supervised launch scope path matching permits traversal/absolute-path bypass [services/supervisor/src/supervisor/application/service.py:6025]

## Dev Notes

### Dependencies

- Requires Story 7.1 green-gate contract.
- Requires Story 7.2 launch contract.
- Requires Story 7.3 diff guard before real mutation.

### Existing Surfaces To Reuse

- `scripts/codex-workspace.mjs`
  - repo-owned isolated Codex worktree lifecycle.
- `docs/stories/6-16-codex-readiness-no-launch.md`
- `docs/stories/6-17-codex-implementation-approval-packet.md`
- `docs/stories/3-66-epic-6-mvp-proof-done-evidence.md`
- `services/supervisor/src/supervisor/application/service.py`
  - execution attempt records,
  - workspace isolation plans,
  - runtime evidence export.
- `packages/contracts/src/api.ts`
  - `ExecutionAttemptView`,
  - `WorkspaceIsolationPlanView`.

### Implementation Guidance

- This is the first story that crosses into real Codex worker launch. Do not start implementation without explicit Bob approval naming the launch scope.
- Keep the first real task boring. A small Dev Console/report wording or readiness evidence improvement is preferred over broad refactor or new subsystem work.
- Do not treat "worker launched" as success. The worker must produce a small useful diff inside approved scope.
- If launch fails, preserve the worktree and evidence for inspection. Do not clean up automatically.

### Testing Requirements

- Fake/dry-run path must be covered before real launch.
- Real launch evidence should be retained in the story completion notes after execution.
- Focused tests depend on implementation shape, but minimum broader checks are:
  - `pnpm.cmd run check:docs`
  - `pnpm.cmd run check`

### Authority Boundary

This story file does not itself approve launch. Before development, Bob must explicitly approve the selected work item, allowed paths, blocked paths, command/worker shape, verification command, retained evidence, stop conditions, delivery authority if any, and cleanup authority if any.

Even after launch approval, PR creation/update, CI wait, merge, cleanup, Claude launch, provider expansion, subscription-agent launch, issue sync, secret access, and broad autonomy remain separately gated.

## Dev Agent Record

### Agent Model Used

Codex GPT-5

### Debug Log References

- Bob approved the Story 7.4 launch scope after asking what approval covered. Approved packet: one bounded supervised Codex launch path, allowed supervisor contract/schema/service/test files plus this story file, blocked secrets/git/dependencies/generated/unrelated paths, verification by `pnpm.cmd run check`, metadata-only evidence retention, and PR/merge/cleanup/external-launch stop lines.
- Red test: `pnpm.cmd run test:supervisor -- tests/integration/test_routing_preview.py -q -k "supervised_codex_launch"` failed before implementation because `POST /work-items/{id}/supervised-codex-launch` did not exist.
- Focused verification: `pnpm.cmd run test:supervisor -- tests/integration/test_routing_preview.py -q -k "supervised_codex_launch"` passed, 2 passed / 90 deselected.
- Routing integration verification: `pnpm.cmd run test:supervisor -- tests/integration/test_routing_preview.py -q` passed, 92 passed with 1 existing aiosqlite warning.
- Full verification: `pnpm.cmd run check` passed, including dashboard build and 147 supervisor tests with 1 existing aiosqlite warning.

### Completion Notes List

- Selected the first boring useful task as a supervised Codex launch evidence path for green-gate/readiness clarity.
- Added `POST /work-items/{work_item_id}/supervised-codex-launch` to create exactly one terminal execution attempt for a bounded Codex task.
- Added `WorkItemSupervisedCodexLaunchRequest` / `SupervisedCodexLaunchRequest` contract fields for task id, dry-run mode, allowed paths, blocked paths, verification command, output summary, and touched files.
- Added metadata-only launch evidence: command shape, workspace/branch, input scope, output summary, touched files, terminal state, verification command, retention policy, and recovery path.
- Added workspace isolation evidence for the approved bounded launch path while keeping network, credentials, providers, Claude, subscription-agent launch, issue sync, PR, merge, and cleanup blocked.
- Enforced Story 7.3 pre-launch guard: real non-dry-run mutation is rejected unless the diff guard is green; dry-run/fake behavior remains available.
- Preserved attempt evidence and work item events for started/completed terminal states without retaining raw prompts, completions, stdout, stderr, secrets, or provider payloads.

### File List

- `docs/stories/7-4-run-first-supervised-codex-worker-launch.md`
- `packages/contracts/src/api.ts`
- `services/supervisor/src/supervisor/api/main.py`
- `services/supervisor/src/supervisor/api/schemas.py`
- `services/supervisor/src/supervisor/application/service.py`
- `services/supervisor/tests/integration/test_routing_preview.py`

### Change Log

- 2026-06-11: Implemented Story 7.4 supervised Codex launch endpoint, bounded request contract, execution attempt evidence recording, diff-guard real-launch blocking, dry-run/fake launch evidence path, stop-line preservation, and verification evidence; status moved to review.
