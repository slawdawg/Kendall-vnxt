---
baseline_commit: 992c689
---

# Story 2.3: Approval Binding And Stale Decision Rejection

Status: done

## Story

As the Kendall_vNxt operator,
I want execution-attempt approvals to bind to the specific route decision, attempt, worker, lane, and authority mode being approved,
so that stale or mismatched approvals cannot accidentally grant authority to the wrong execution path.

## Acceptance Criteria

1. Shared API vocabulary allows attempt lifecycle approval requests to include `routeDecisionId`, `workerId`, lane, and authority mode binding fields.
2. Approving an execution attempt requires the binding fields and rejects missing approval bindings.
3. Approving an execution attempt rejects stale or mismatched `routeDecisionId` values.
4. Approving an execution attempt rejects mismatched worker, lane, or authority mode values.
5. Successful approval records an `execution_attempt.approved` workflow event linked to the attempt.
6. Approval events include `attemptId`, `workItemId`, `routeDecisionId`, `workerId`, lane, authority mode, previous status, current status, and approval binding evidence.
7. Approval evidence states what remains disabled after approval, including process launch, provider/model calls, premium execution, source mutation, and arbitrary shell execution.
8. Rejected approval attempts do not mutate attempt status and do not record approval events.
9. Existing lifecycle transitions that are not approvals continue to work without approval binding fields.
10. Focused tests prove no process launch, provider HTTP call, model API call, shell execution, premium execution, or source mutation is enabled by approval.

## Tasks / Subtasks

- [x] Add shared approval binding request vocabulary. (AC: 1)
  - [x] Extend supervisor transition request schema.
  - [x] Extend shared TypeScript transition request contract.
- [x] Add supervisor approval binding validation. (AC: 2, 3, 4, 8, 9)
  - [x] Require binding fields only for `approved` lifecycle transitions.
  - [x] Reject stale route decision IDs.
  - [x] Reject mismatched worker, lane, and authority mode.
  - [x] Preserve non-approval lifecycle transitions.
- [x] Add approval event evidence. (AC: 5, 6, 7, 10)
  - [x] Record `execution_attempt.approved`.
  - [x] Include explicit approval binding evidence.
  - [x] Include remaining-disabled safety evidence.
- [x] Add focused tests. (AC: 2, 3, 4, 5, 7, 8, 9, 10)
  - [x] Successful route-bound approval.
  - [x] Missing approval binding rejection.
  - [x] Stale route decision rejection.
  - [x] Worker mismatch rejection.
  - [x] No approval event on rejected approval.
- [x] Verify and update story trail. (AC: all)
  - [x] Run focused supervisor compile and approval-binding tests.
  - [x] Run routing preview suite.
  - [x] Run workspace check.
  - [x] Update Dev Agent Record, File List, and Change Log.

## Dev Notes

Source artifacts:

- `docs/goals/bmad-architecture-completion-github-progress-goal-2026-06-08.md`
- `docs/prds/supervisor-execution-authority-expansion.md`
- `docs/architecture/kendall-vnxt-implementation-gap-reconciliation-2026-06-08.md`
- `docs/stories/2-1-execution-attempt-contract-and-state-model.md`
- `docs/stories/2-2-attempt-lifecycle-events-and-history-api.md`

Current implementation context:

- Execution attempts already persist `routeDecisionId`, `workerId`, lane, authority mode, status, timestamps, reasons, artifact refs, and event refs.
- Lifecycle transitions already record workflow events and remain non-executing.
- This story treats approval as the `approved` lifecycle status and adds binding validation before that transition may be recorded.

GitHub progress context:

- Local branch `main` is clean at the start of this story.
- `git rev-list --left-right --count origin/main...HEAD` reported `0 2`.
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
- Approval is control-plane evidence only; it does not grant real worker launch authority in this phase.

## Dev Agent Record

### Implementation Plan

- Extend lifecycle transition contracts with approval binding fields.
- Validate `approved` transitions against the attempt's stored route, worker, lane, and authority fields.
- Enrich approval workflow events with binding and remaining-disabled evidence.
- Add focused integration tests for successful and rejected approval flows.
- Run focused and broad verification, then commit.

### Debug Log References

- `git status --short` - clean before Story 2.3 work.
- `git remote -v` - origin is `https://github.com/slawdawg/Kendall-vnxt.git`.
- `git fetch origin` - failed because GitHub credentials cannot be read non-interactively.
- `git rev-list --left-right --count origin/main...HEAD` - reported `0 2`, local branch two commits ahead of `origin/main`.
- `uv run --directory services/supervisor python -m compileall src/supervisor` - passed.
- `uv run --directory services/supervisor pytest tests/integration/test_routing_preview.py -q -k "execution_attempt and approval"` - passed, 2 selected / 39 deselected.
- `uv run --directory services/supervisor pytest tests/integration/test_routing_preview.py -q -k execution_attempt` - passed, 7 selected / 34 deselected, 1 existing aiosqlite warning.
- `uv run --directory services/supervisor pytest tests/integration/test_routing_preview.py -q` - passed, 41 tests.
- `pnpm run check` - passed, dashboard build plus 74 supervisor tests.

### Completion Notes List

- Added approval binding fields to the execution attempt lifecycle transition contract.
- Approval transitions now require `routeDecisionId`, `workerId`, lane, and authority mode.
- Approval transitions reject stale route decision IDs and mismatched worker, lane, or authority values before mutating attempt state.
- Successful approval records `execution_attempt.approved` with binding evidence and remaining-disabled safety evidence.
- Rejected approval requests do not append approval events and leave the attempt in its previous status.
- Non-approval lifecycle transitions continue to work without binding fields.

### File List

- `packages/contracts/src/api.ts`
- `services/supervisor/src/supervisor/api/schemas.py`
- `services/supervisor/src/supervisor/application/service.py`
- `services/supervisor/tests/integration/test_routing_preview.py`
- `docs/stories/2-3-approval-binding-and-stale-decision-rejection.md`

## Change Log

- 2026-06-08: Created story from the architecture completion goal and Execution Authority Expansion PRD Slice 3.
- 2026-06-08: Implemented approval binding validation, event evidence, focused tests, and verification; status moved to done.
