---
baseline_commit: 3bd8e08
---

# Story 2.5: Dashboard Attempt Evidence Panel

Status: done

## Story

As the Kendall_vNxt operator,
I want execution attempt state and safety evidence visible on the work-item detail page,
so that route binding, worker choice, lifecycle status, cancellation/rejection state, and workspace isolation boundaries are reviewable without implying real autonomous execution is enabled.

## Acceptance Criteria

1. Dashboard data access can retrieve execution attempt history for a work item.
2. Work-item detail pages include an execution attempt evidence panel near routing evidence.
3. The panel distinguishes planned, approved, starting, running, cancel requested, cancelled, timed out, failed, completed, and rejected states.
4. The panel shows route decision ID, selected worker, lane, authority mode, and relevant timestamps.
5. The panel surfaces cancellation, rejection, or failure reasons when present.
6. The panel displays workspace isolation evidence: read roots, write roots, artifact root, forbidden paths, rollback rule, and disabled permission flags.
7. Dashboard copy makes clear that process launch, provider/model calls, commands, and source mutation remain disabled in this phase.
8. The work-item sticky anchors include a direct Attempts target.
9. E2E coverage proves the panel is visible after a non-executing attempt is created.
10. Existing dashboard routing, recipe, delivery, and workflow behavior continues to pass.

## Tasks / Subtasks

- [x] Add dashboard data access. (AC: 1)
  - [x] Add `getExecutionAttempts` supervisor client helper.
  - [x] Fetch attempts on the work-item detail page.
- [x] Add attempt evidence panel. (AC: 2, 3, 4, 5, 6, 7)
  - [x] Show latest attempt summary.
  - [x] Show per-attempt route, worker, lane, authority, status, and timestamps.
  - [x] Show cancellation/rejection/failure reason when present.
  - [x] Show workspace isolation plan and disabled permission flags.
- [x] Add navigation surface. (AC: 8)
  - [x] Add sticky Attempts anchor link.
  - [x] Place panel near routing context.
- [x] Add dashboard coverage. (AC: 9, 10)
  - [x] Add Playwright coverage for created non-executing attempts.
- [x] Verify and update story trail. (AC: all)
  - [x] Run focused dashboard checks.
  - [x] Run broader workspace check.
  - [x] Update Dev Agent Record, File List, and Change Log.

## Dev Notes

Source artifacts:

- `docs/goals/bmad-architecture-completion-github-progress-goal-2026-06-08.md`
- `docs/prds/supervisor-execution-authority-expansion.md`
- `docs/stories/2-1-execution-attempt-contract-and-state-model.md`
- `docs/stories/2-2-attempt-lifecycle-events-and-history-api.md`
- `docs/stories/2-3-approval-binding-and-stale-decision-rejection.md`
- `docs/stories/2-4-workspace-isolation-plan-contract.md`

Current implementation context:

- The supervisor already exposes `GET /work-items/{work_item_id}/execution-attempts`.
- Execution attempt views include lifecycle status, route binding, worker/lane evidence, reasons, event refs, and workspace isolation plans.
- This story adds dashboard visibility only; it does not add attempt creation controls or real worker execution.

GitHub progress context:

- Local branch `main` is clean at the start of this story.
- `git rev-list --left-right --count origin/main...HEAD` reported `0 4`.
- Remote fetch/push remains gated by non-interactive GitHub credentials and external remote approval.

Implementation constraints:

- Do not spawn Codex, Claude, Gemini, Antigravity, or any CLI/subscription agent.
- Do not call Ollama, LM Studio, vLLM, llama.cpp, OpenAI-compatible local endpoints, or any model API.
- Do not add premium execution.
- Do not add arbitrary shell command execution.
- Do not mutate source files as part of execution attempts.
- Do not add dashboard controls that imply autonomous execution is available.
- Do not add background runtime assistant behavior.

## Dev Agent Record

### Implementation Plan

- Add a dashboard API client helper for execution attempt history.
- Add a server-rendered work-item attempt evidence panel.
- Wire the panel and anchor into the work-item detail page.
- Add Playwright coverage for visible attempt evidence.
- Run dashboard and broader workspace verification, then commit.

### Debug Log References

- `git status --short` - clean before Story 2.5 work.
- `git rev-list --left-right --count origin/main...HEAD` - reported `0 4`, local branch four commits ahead of `origin/main`.
- `git fetch origin` - failed because GitHub credentials cannot be read non-interactively.
- `pnpm run build:dashboard` - passed.
- `pnpm run lint:dashboard` - passed.
- `pnpm exec playwright test tests/e2e/dashboard.spec.ts -g "execution attempt evidence"` - initially failed on a strict locator duplicate for `utility.internal`; assertion was narrowed to `.first()`.
- `pnpm exec playwright test tests/e2e/dashboard.spec.ts -g "execution attempt evidence"` - passed.
- `pnpm run check` - passed, dashboard build plus 74 supervisor tests.
- In-app Browser visual check was attempted after starting temporary local supervisor/dashboard servers and seeding a local work item/attempt, but the Browser Node runtime failed twice with the Windows sandbox pipe timeout. Temporary ports `8101` and `3101` were verified closed afterward.
- `pnpm run test:e2e:dashboard` - 14 passed / 1 failed; the new execution attempt evidence test passed, while the existing managed triage test timed out waiting for `ready` after observing `triaged`.
- `pnpm exec playwright test tests/e2e/dashboard.spec.ts -g "runs the supervisor-approved managed triage action"` - passed in isolation.

### Completion Notes List

- Added dashboard API access for execution attempt history.
- Added a work-item execution attempt evidence panel near routing evidence.
- The panel shows latest status, worker, lane, authority mode, route decision ID, timestamps, reasons, and workspace isolation boundaries.
- The panel explicitly surfaces disabled writes, source mutation, commands, network, and credential access.
- Added a sticky Attempts anchor on the work-item detail page.
- Added Playwright coverage for a work item with a non-executing planned attempt.
- No execution controls, provider calls, process launch, command execution, premium execution, or source mutation were added.

### File List

- `apps/dashboard/src/app/work-items/[work-item-id]/page.tsx`
- `apps/dashboard/src/components/execution-attempt-evidence-panel.tsx`
- `apps/dashboard/src/lib/supervisor.ts`
- `tests/e2e/dashboard.spec.ts`
- `docs/stories/2-5-dashboard-attempt-evidence-panel.md`

## Change Log

- 2026-06-08: Created story from the architecture completion goal and Execution Authority Expansion PRD Slice 5.
- 2026-06-08: Implemented dashboard attempt evidence panel, API client access, sticky anchor, e2e coverage, and verification; status moved to done.
