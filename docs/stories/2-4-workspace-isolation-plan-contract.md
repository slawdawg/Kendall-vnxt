---
baseline_commit: 8f6082b
---

# Story 2.4: Workspace Isolation Plan Contract

Status: done

## Story

As the Kendall_vNxt operator,
I want every execution attempt to carry a non-executing workspace isolation plan,
so that future source mutation can only be considered after read roots, write roots, artifact roots, forbidden paths, cleanup, rollback, and diff capture boundaries are explicit and reviewable.

## Acceptance Criteria

1. Shared API vocabulary includes a workspace isolation plan view on execution attempts.
2. Supervisor persistence stores a JSON-compatible workspace isolation plan for each execution attempt.
3. Planned attempts include read roots derived from current route/recipe allowed paths where available.
4. Rejected attempts include an isolation plan even though execution is disabled.
5. The plan identifies read roots, write roots, artifact root, forbidden paths, cleanup rule, rollback rule, and diff capture rule.
6. The plan explicitly records that writes, source mutation, commands, network access, and credential access are not allowed in this phase.
7. Attempt creation events include workspace isolation plan evidence.
8. Attempt history returns workspace isolation plan evidence.
9. Existing attempt lifecycle and approval behavior remains non-executing.
10. Focused tests prove no process launch, provider HTTP call, model API call, shell execution, premium execution, or source mutation is enabled by the isolation plan.

## Tasks / Subtasks

- [x] Add shared workspace isolation plan contract. (AC: 1, 5, 6)
  - [x] Add supervisor API schema for the plan.
  - [x] Add TypeScript contract for the plan.
  - [x] Add plan field to execution attempt views.
- [x] Add supervisor persistence. (AC: 2, 8)
  - [x] Add JSON-compatible plan storage to `ExecutionAttempt`.
  - [x] Add lightweight DB compatibility alters for existing SQLite/Postgres stores.
  - [x] Provide legacy fallback view data for older attempt rows without plans.
- [x] Add plan generation. (AC: 3, 4, 5, 6)
  - [x] Derive read roots from route profile allowed paths or default to repo root read visibility.
  - [x] Keep write roots empty and all execution/mutation permissions false.
  - [x] Add artifact root, forbidden paths, cleanup, rollback, and diff capture rules.
- [x] Add event evidence. (AC: 7, 9, 10)
  - [x] Include workspace plan evidence on attempt creation/rejection events.
  - [x] Preserve plan evidence on lifecycle transition events.
- [x] Add focused tests. (AC: 3, 4, 5, 6, 7, 8, 10)
  - [x] Planned utility attempt includes route-derived plan.
  - [x] Rejected local read-only attempt includes disabled plan.
  - [x] Attempt creation events include plan evidence.
- [x] Verify and update story trail. (AC: all)
  - [x] Run focused supervisor compile and execution-attempt tests.
  - [x] Run routing preview suite.
  - [x] Run workspace check.
  - [x] Update Dev Agent Record, File List, and Change Log.

## Dev Notes

Source artifacts:

- `docs/goals/bmad-architecture-completion-github-progress-goal-2026-06-08.md`
- `docs/prds/supervisor-execution-authority-expansion.md`
- `docs/stories/2-1-execution-attempt-contract-and-state-model.md`
- `docs/stories/2-2-attempt-lifecycle-events-and-history-api.md`
- `docs/stories/2-3-approval-binding-and-stale-decision-rejection.md`

Current implementation context:

- Execution attempts are already first-class supervisor state.
- Lifecycle and approval transitions remain control-plane only.
- This story adds the workspace isolation contract only; it does not create workspaces, branches, patches, diffs, or cleanup routines.

GitHub progress context:

- Local branch `main` is clean at the start of this story.
- `git rev-list --left-right --count origin/main...HEAD` reported `0 3`.
- Remote fetch/push remains gated by non-interactive GitHub credentials and external remote approval.

Implementation constraints:

- Do not spawn Codex, Claude, Gemini, Antigravity, or any CLI/subscription agent.
- Do not call Ollama, LM Studio, vLLM, llama.cpp, OpenAI-compatible local endpoints, or any model API.
- Do not add premium execution.
- Do not add arbitrary shell command execution.
- Do not mutate source files as part of execution attempts.
- Do not create workspaces, branches, patch files, or cleanup jobs in this story.
- Do not add background runtime assistant behavior.

## Dev Agent Record

### Implementation Plan

- Add workspace isolation plan contracts to supervisor and shared API types.
- Persist a JSON-compatible plan on each execution attempt.
- Generate conservative non-executing plans at attempt creation.
- Include plan evidence in attempt events and history.
- Add focused integration assertions and run broad verification.

### Debug Log References

- `git status --short` - clean before Story 2.4 work.
- `git rev-list --left-right --count origin/main...HEAD` - reported `0 3`, local branch three commits ahead of `origin/main`.
- `uv run --directory services/supervisor python -m compileall src/supervisor` - passed.
- First `uv run --directory services/supervisor pytest tests/integration/test_routing_preview.py -q -k execution_attempt` - failed on an overly narrow test expectation for recipe allowed paths; assertion was corrected to verify required roots are included.
- `uv run --directory services/supervisor pytest tests/integration/test_routing_preview.py -q -k mock_local_readonly_worker_preview -vv` - initially failed, revealing existing local evidence packet timestamp non-determinism; fixed by anchoring packet timestamps to the work item `updated_at`.
- `uv run --directory services/supervisor pytest tests/integration/test_routing_preview.py -q -k mock_local_readonly_worker_preview -vv` - passed after timestamp fix.
- `uv run --directory services/supervisor pytest tests/integration/test_routing_preview.py -q -k execution_attempt` - passed, 7 selected / 34 deselected, 1 existing aiosqlite warning.
- `uv run --directory services/supervisor pytest tests/integration/test_routing_preview.py -q` - passed, 41 tests.
- `pnpm run check` - passed, dashboard build plus 74 supervisor tests.

### Completion Notes List

- Added `WorkspaceIsolationPlanView` to supervisor and shared contracts.
- Execution attempt history now includes a workspace isolation plan.
- New attempts persist JSON-compatible workspace isolation metadata.
- Planned attempts derive read roots from route/recipe allowed paths when available.
- Rejected attempts also include isolation plans, while writes, source mutation, commands, network, and credential access remain false.
- Attempt creation/rejection and lifecycle events include workspace isolation evidence.
- Existing SQLite/Postgres stores receive lightweight compatibility columns.
- Local read-only worker preview packets now use stable work-item timestamps, fixing deterministic preview behavior.

### File List

- `packages/contracts/src/api.ts`
- `services/supervisor/src/supervisor/api/schemas.py`
- `services/supervisor/src/supervisor/application/service.py`
- `services/supervisor/src/supervisor/infrastructure/db/database.py`
- `services/supervisor/src/supervisor/infrastructure/db/models.py`
- `services/supervisor/tests/integration/test_routing_preview.py`
- `docs/stories/2-4-workspace-isolation-plan-contract.md`

## Change Log

- 2026-06-08: Created story from the architecture completion goal and Execution Authority Expansion PRD Slice 4.
- 2026-06-08: Implemented workspace isolation plan contract, persistence, event/history evidence, deterministic local evidence packet timestamps, focused tests, and verification; status moved to done.
