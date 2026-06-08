---
baseline_commit: 4c49b9d
---

# Story 2.7: Runtime Evidence Export Strategy

Status: done

## Story

As the Kendall_vNxt operator,
I want a reviewable runtime evidence export for each work item,
so that attempt state, lifecycle history, and workflow events can be backed up and compared with Git-backed story evidence without granting real worker execution authority.

## Acceptance Criteria

1. A work item can expose a durable, reviewable JSON-compatible runtime evidence export.
2. The export includes the work item snapshot, execution attempts, workspace isolation metadata, and workflow events.
3. The export identifies what is local runtime state versus Git-backed evidence.
4. The export identifies excluded state, including credentials, provider payloads, prompts/completions from external providers, and filesystem snapshots outside recorded artifact references.
5. The export is read-only and does not mutate work items, events, attempts, source files, or provider state.
6. The export safety section keeps process launch, provider/model calls, premium execution, command execution, source mutation, network access, and credential access disabled.
7. Missing work items return the existing work item not found error shape.
8. Focused tests prove the export contains attempt/event evidence and remains non-mutating.

## Tasks / Subtasks

- [x] Add runtime evidence export contracts. (AC: 1, 2, 3, 4, 6)
  - [x] Add supervisor API schema.
  - [x] Add shared TypeScript contract.
  - [x] Represent local runtime state, Git-backed evidence, excluded state, and safety flags.
- [x] Add read-only export behavior. (AC: 1, 2, 3, 4, 5, 6, 7)
  - [x] Add per-work-item export service method.
  - [x] Add `GET /work-items/{work_item_id}/runtime-evidence-export`.
  - [x] Reuse existing work item, execution attempt, and workflow event views.
- [x] Add focused tests. (AC: 2, 3, 4, 5, 6, 7, 8)
  - [x] Assert export includes attempt and event evidence.
  - [x] Assert export names local runtime and Git-backed boundaries.
  - [x] Assert safety flags remain disabled.
  - [x] Assert export does not add workflow events.
- [x] Verify and update story trail. (AC: all)
  - [x] Run focused supervisor compile and runtime evidence tests.
  - [x] Run routing preview suite.
  - [x] Run workspace check.
  - [x] Update Dev Agent Record, File List, Change Log, and goal trail.

## Dev Notes

Source artifacts:

- `docs/goals/bmad-architecture-completion-github-progress-goal-2026-06-08.md`
- `docs/prds/supervisor-execution-authority-expansion.md`
- `docs/stories/2-1-execution-attempt-contract-and-state-model.md`
- `docs/stories/2-2-attempt-lifecycle-events-and-history-api.md`
- `docs/stories/2-3-approval-binding-and-stale-decision-rejection.md`
- `docs/stories/2-4-workspace-isolation-plan-contract.md`
- `docs/stories/2-5-dashboard-attempt-evidence-panel.md`
- `docs/stories/2-6-disabled-execution-configuration-checks.md`

Current implementation context:

- Work item, workflow event, and execution attempt persistence already provide the runtime evidence source.
- Execution attempts already include route, worker, authority, status, event refs, artifact refs, and workspace isolation metadata.
- This story exports existing control-plane evidence only; it does not add new attempt execution, provider calls, process launch, or filesystem mutation.

GitHub progress context:

- Local branch `main` was clean at the start of this story.
- `git rev-list --left-right --count origin/main...HEAD` reported `0 6`, local branch six commits ahead of `origin/main`.
- GitHub fetch/push remain blocked by non-interactive credential failure and remote/default-branch policy approval.

Implementation constraints:

- Do not spawn Codex, Claude, Gemini, Antigravity, or any CLI/subscription agent.
- Do not call Ollama, LM Studio, vLLM, llama.cpp, OpenAI-compatible local endpoints, or any model API.
- Do not add premium execution.
- Do not add arbitrary shell command execution.
- Do not mutate source files as part of execution attempts.
- Do not include credentials, raw environment values, or external provider prompt/completion payloads in export state.
- Do not add background runtime assistant behavior.

## Dev Agent Record

### Implementation Plan

- Add runtime evidence export schemas to the supervisor API and shared contracts.
- Aggregate existing work item, attempt, and workflow event views in a read-only service method.
- Add a per-work-item API route returning the export or the existing not-found error.
- Add focused tests for evidence content, boundary documentation, disabled safety flags, and no event mutation.
- Run focused and broad verification, then commit.

### Debug Log References

- `git status --short` - clean before Story 2.7 work.
- `git rev-list --left-right --count origin/main...HEAD` - reported `0 6`, local branch six commits ahead of `origin/main`.
- Sandbox file reads timed out; repository reads were rerun with escalation.
- `uv run --directory services/supervisor python -m compileall src/supervisor` - passed.
- `uv run --directory services/supervisor pytest tests/integration/test_routing_preview.py -q -k "runtime_evidence_export"` - passed, 1 selected.
- `uv run --directory services/supervisor pytest tests/integration/test_routing_preview.py -q` - passed, 43 tests.
- `pnpm run check` - passed, dashboard build plus 76 supervisor tests.

### Completion Notes List

- Added `RuntimeEvidenceExportView` with boundary and safety sections.
- Added shared TypeScript runtime evidence export contracts.
- Added read-only `GET /work-items/{work_item_id}/runtime-evidence-export`.
- The export includes work item, execution attempt, workspace isolation, artifact/event refs, and workflow event evidence.
- The export explicitly separates local supervisor DB state from Git-backed source/story evidence and excluded sensitive/runtime-only state.
- Focused tests assert no workflow events are added by export reads and all real execution authority flags remain false.

### File List

- `packages/contracts/src/api.ts`
- `services/supervisor/src/supervisor/api/main.py`
- `services/supervisor/src/supervisor/api/schemas.py`
- `services/supervisor/src/supervisor/application/service.py`
- `services/supervisor/tests/integration/test_routing_preview.py`
- `docs/stories/2-7-runtime-evidence-export-strategy.md`
- `docs/goals/bmad-architecture-completion-github-progress-goal-2026-06-08.md`

## Change Log

- 2026-06-08: Created story from the architecture completion goal and Execution Authority Expansion PRD Slice 7.
- 2026-06-08: Implemented runtime evidence export strategy, focused tests, and verification; status moved to done.
