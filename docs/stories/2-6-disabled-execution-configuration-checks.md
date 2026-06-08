---
baseline_commit: c12a1aa
---

# Story 2.6: Disabled Execution Configuration Checks

Status: done

## Story

As the Kendall_vNxt operator,
I want the supervisor to expose disabled-by-default execution configuration checks,
so that subscription-agent launch, local provider calls, premium execution, shell execution, source mutation, network access, and credential access are visibly denied before any future real worker execution is considered.

## Acceptance Criteria

1. Supervisor settings include explicit disabled-default gates for subscription-agent launch, local provider calls, premium execution, arbitrary shell execution, worker source mutation, worker network access, and worker credential access.
2. The supervisor exposes a health/config API surface for execution configuration checks.
3. The check surface reports disabled reasons and affected workers for subscription-agent launch, local provider calls, and premium execution.
4. The check surface reports that process launch, provider calls, model calls, premium execution, command execution, source mutation, network access, and credential access are not allowed by default.
5. The check surface is deterministic enough for dashboard/API display and does not mutate work items or workflow events.
6. Existing worker registry disabled reasons remain intact.
7. Focused tests assert disabled providers do not gain process launch, HTTP/model call, premium execution, command execution, source mutation, network, or credential permission.
8. Existing routing, attempt, dashboard, and supervisor checks continue to pass.

## Tasks / Subtasks

- [x] Add disabled-default settings. (AC: 1)
  - [x] Add subscription-agent launch gate.
  - [x] Add local provider call gate.
  - [x] Add premium execution gate.
  - [x] Add shell/source/network/credential worker gates.
- [x] Add supervisor config check contract. (AC: 2, 3, 4)
  - [x] Add supervisor API schema.
  - [x] Add shared TypeScript contract.
  - [x] Add aggregate execution configuration checks view.
- [x] Add supervisor API behavior. (AC: 2, 3, 4, 5, 6)
  - [x] Add `/supervisor/execution-configuration-checks`.
  - [x] Include affected workers and disabled reasons.
  - [x] Keep the endpoint read-only.
- [x] Add focused tests. (AC: 3, 4, 5, 6, 7)
  - [x] Assert default gates are disabled.
  - [x] Assert no launch/call/mutation/network/credential flags are allowed.
  - [x] Assert endpoint does not mutate workflow events.
- [x] Verify and update story trail. (AC: all)
  - [x] Run focused supervisor compile and config tests.
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
- `docs/stories/2-4-workspace-isolation-plan-contract.md`
- `docs/stories/2-5-dashboard-attempt-evidence-panel.md`

Current implementation context:

- Worker registry already lists disabled local providers, subscription-agent launch stub, subscription handoff target, and premium approval lane.
- Attempt creation, lifecycle, approval binding, workspace isolation, and dashboard panels remain control-plane only.
- This story exposes configuration evidence; it does not add behavior that can execute workers.

GitHub progress context:

- Local branch `main` is clean at the start of this story.
- `git rev-list --left-right --count origin/main...HEAD` reported `0 5`.
- `git fetch origin` failed because GitHub credentials cannot be read non-interactively:
  - `fatal: Unable to persist credentials with the 'wincredman' credential store.`
  - `fatal: could not read Username for 'https://github.com': No such file or directory`
- Push remains gated until GitHub auth and external remote approval are handled.

Implementation constraints:

- Do not spawn Codex, Claude, Gemini, Antigravity, or any CLI/subscription agent.
- Do not call Ollama, LM Studio, vLLM, llama.cpp, OpenAI-compatible local endpoints, or any model API.
- Do not add premium execution.
- Do not add arbitrary shell command execution.
- Do not mutate source files as part of execution attempts.
- Do not add background runtime assistant behavior.

## Dev Agent Record

### Implementation Plan

- Add explicit disabled-default settings gates.
- Add shared and supervisor API contract views for execution configuration checks.
- Add a read-only supervisor endpoint derived from settings and worker registry metadata.
- Add focused integration tests proving default-deny behavior and no event mutation.
- Run focused and broad verification, then commit.

### Debug Log References

- `git status --short` - clean before Story 2.6 work.
- `git rev-list --left-right --count origin/main...HEAD` - reported `0 5`, local branch five commits ahead of `origin/main`.
- `git fetch origin` - failed because GitHub credentials cannot be read non-interactively.
- `uv run --directory services/supervisor python -m compileall src/supervisor` - passed.
- `uv run --directory services/supervisor pytest tests/integration/test_routing_preview.py -q -k "configuration_checks or worker_registry"` - passed, 2 selected / 40 deselected, 1 existing aiosqlite warning.
- `uv run --directory services/supervisor pytest tests/integration/test_routing_preview.py -q` - passed, 42 tests.
- `pnpm run check` - passed, dashboard build plus 75 supervisor tests.

### Completion Notes List

- Added explicit disabled-default supervisor settings for subscription-agent launch, local provider calls, premium execution, arbitrary shell execution, worker source mutation, worker network access, and worker credential access.
- Added shared and supervisor API contracts for execution configuration checks.
- Added read-only `GET /supervisor/execution-configuration-checks`.
- The endpoint reports disabled reasons, affected workers, evidence, and default-denied authority flags.
- Focused tests assert all real execution authority flags remain false by default and the endpoint does not mutate workflow events.

### File List

- `packages/contracts/src/api.ts`
- `services/supervisor/src/supervisor/api/main.py`
- `services/supervisor/src/supervisor/api/schemas.py`
- `services/supervisor/src/supervisor/application/service.py`
- `services/supervisor/src/supervisor/config/settings.py`
- `services/supervisor/tests/integration/test_routing_preview.py`
- `docs/stories/2-6-disabled-execution-configuration-checks.md`

## Change Log

- 2026-06-08: Created story from the architecture completion goal and Execution Authority Expansion PRD Slice 6.
- 2026-06-08: Implemented disabled execution configuration checks, focused tests, and verification; status moved to done.
