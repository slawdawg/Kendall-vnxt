---
baseline_commit: afc62fc7
---

# Story 10.3: Plan Safe Cleanup With Evidence Preservation And Worktree Residue Classification

Status: done

## Story

As Bob,
I want cleanup eligibility to distinguish real Git worktrees from leftover filesystem residue,
so that safe cleanup can remove only approved targets after delivery evidence is preserved.

## Acceptance Criteria

1. Given a delivered work item is cleanup-eligible, when Kendall creates a cleanup plan, then the plan lists retained evidence, branch target, Git worktree registration state, filesystem path state, cache and virtualenv residue, blocked paths, and recovery path, and cleanup remains dry-run/report-only unless exact cleanup approval or low-risk cleanup policy is present.
2. Given a worktree path exists but is no longer Git-registered, when Kendall evaluates cleanup, then it classifies the path as filesystem residue, and it does not treat residue classification as proof that a Git worktree is still active.
3. Given caches, virtual environments, temp outputs, or test artifacts remain under an approved disposable worktree path, when cleanup is planned, then Kendall reports them separately from source files and retained evidence, and it blocks cleanup if deletion would cross outside the approved target path.
4. Given retained evidence has not been preserved or the cleanup target is ambiguous, when cleanup eligibility is evaluated, then cleanup is blocked, and the plan reports the smallest safe next action.
5. Given Story 10.3 is complete, then no provider expansion, credential/session access, source mutation by workers, subscription-agent process launch, failed-check bypass, issue sync, destructive cleanup, remote mutation, branch deletion, worktree deletion, or broad autonomy is introduced.

## Tasks / Subtasks

- [x] Define the cleanup plan contract. (AC: 1-5)
  - [x] Reuse `LowRiskDeliveryPlanReportView`, local worktree plan, local cleanup readiness, remote cleanup readiness, and delivery execution evidence vocabulary instead of creating a parallel cleanup lifecycle.
  - [x] Include retained evidence refs, branch target, cleanup target path, Git registration classification, filesystem classification, residue classes, blocked paths, dry-run effects, required approval/policy, and recovery path.
  - [x] Keep cleanup actions separate from PR and merge actions, with stable statuses and blocked reasons.
- [x] Implement read-only cleanup plan construction. (AC: 1-5)
  - [x] Add supervisor service logic that evaluates cleanup from current work item metadata and delivery execution evidence.
  - [x] Classify target state as Git-registered worktree, filesystem residue, missing target, ambiguous target, or unsafe/out-of-scope target.
  - [x] Report cache/temp/virtualenv residue separately from source files and retained evidence.
  - [x] Preserve report-only behavior unless exact cleanup approval or policy evidence is present; even with approval, this story must not execute deletion.
- [x] Add deterministic supervisor tests. (AC: 1-5)
  - [x] Cover cleanup-eligible delivered metadata with retained evidence.
  - [x] Cover filesystem residue when a path exists without Git worktree registration.
  - [x] Cover cache, `.pytest_cache`, `.mypy_cache`, `.ruff_cache`, temp output, and disposable `.venv` residue as separate residue classes.
  - [x] Cover blocked cleanup for ambiguous target, missing retained evidence, unsafe path crossing, failed/stale delivery evidence, missing approval/policy, and unexpected source files.
  - [x] Assert no worktree removal, branch deletion, file deletion, Git command execution, GitHub mutation, provider call, credential/session access, issue sync, or failed-check bypass occurs.
- [x] Extend focused drift checks. (AC: 1-5)
  - [x] Extend `check:delivery-readiness` or add a narrowly named cleanup-plan check that guards contracts, schemas, route/service wiring, blocked reasons, tests, and story index evidence.
  - [x] Keep dashboard rendering for Story 10.4 unless a minimal report shortcut is required for discoverability.
- [x] Update story evidence. (AC: 1-5)
  - [x] Record focused and full verification commands in the Dev Agent Record.
  - [x] Update Completion Notes, File List, and Change Log during implementation.

### Review Findings

- [x] [Review][Patch] Rejected delivery evidence events retained raw boundary-violating fields; fixed by redacting rejected event payload fields when retention-boundary or size blockers are present.
- [x] [Review][Patch] Delivery evidence recording accepted the policy string alone; fixed by requiring exact policy plus non-empty approval evidence before event or metadata recording.
- [x] [Review][Patch] Delivery evidence always reported `remoteMutationPerformed=false` without distinguishing externally completed action evidence; fixed by adding `externalMutationRecorded` while keeping service-side mutation false.
- [x] [Review][Patch] PR evidence was blocked on merge readiness; fixed by applying merge-status and merge-result blockers only to merge evidence.
- [x] [Review][Patch] Delivery evidence could mark `completed` with nonzero exit code; fixed with terminal-status and exit-code consistency blockers.
- [x] [Review][Patch] Cleanup safety classification trusted caller-supplied residue containment; fixed by resolving residue paths against the cleanup target and treating explicit false as unsafe.
- [x] [Review][Patch] Cleanup could become approval-ready on PR-only or non-merged delivery evidence; fixed by requiring recorded approved merge evidence with merged state.
- [x] [Review][Patch] Cleanup plan policy naming diverged from low-risk delivery plan cleanup action; fixed by using `low-risk-cleanup-policy-v1` for cleanup actions.
- [x] [Review][Patch] Cleanup target field names diverged between delivery plan and cleanup plan; fixed by normalizing `cleanupTargetPath` into the delivery evidence cleanup target.
- [x] [Review][Patch] Cleanup plan did not expose source-file state/details separately; fixed by adding `sourceFileState` and `sourceFiles`.
- [x] [Review][Patch] Ambiguous cleanup target and related blockers lacked smallest safe next actions; fixed by adding targeted next safe actions for ambiguous target, unknown Git worktree state, source files, and unsafe residue.
- [x] [Review][Patch] Cleanup-plan deterministic coverage missed named residue/source/stale/ambiguous cases; fixed by adding focused regression tests.

## Dev Notes

### Source Context

- Epic 10 turns already-computed green-gate evidence into bounded, auditable PR, merge, and cleanup planning without granting broad autonomy. Cleanup must preserve retained evidence first and distinguish active Git worktrees from filesystem residue, caches, virtual environments, and leftover paths. [Source: `_bmad-output/planning-artifacts/epics.md#Epic 10: Policy-Approved Green-Gate Delivery And Cleanup`]
- Story 10.1 added read-only low-risk delivery plan reports for PR, merge, and cleanup, including separate action status, eligibility, blocked reasons, evidence refs, dry-run effects, required approval/policy evidence, and `allowedOperations=[]` when policy is missing. [Source: `docs/stories/10-1-define-low-risk-delivery-policy-and-dry-run-plan-contract.md#Completion Notes List`]
- Story 10.2 added metadata-only delivery execution evidence for PR and merge actions, exact policy identity checks, required binding fields, retention-boundary enforcement, stale rejection, and failed-action evidence. Cleanup remains blocked after failed or stale PR/merge evidence. [Source: `docs/stories/10-2-record-delivery-execution-evidence-for-approved-pr-and-merge-actions.md#Review Findings`]
- The product brief says Git/GitHub hygiene is visible and progressively automated, but autonomous merge and cleanup require staged evidence and explicit approval. [Source: `docs/product/kendall-vnxt-orchestrator-product-brief-2026-06-10.md#Maturity Review Notes`]
- The approval checkpoint document says generic words such as "continue", "do the next item", or "cleanup" do not approve new execution authority; safe planning, tests, dashboards, non-executing control-plane work, and repo hygiene remain allowed. [Source: `docs/architecture/kendall-vnxt-execution-authority-approval-checkpoints-2026-06-08.md#Language That Is Not Approval`]

### Existing Implementation To Reuse

- Shared contracts already define adjacent cleanup and delivery surfaces:
  - `LowRiskDeliveryPlanActionView`
  - `LowRiskDeliveryPlanReportView`
  - `DeliveryExecutionEvidenceView`
  - `LocalWorktreePlanView`
  - `LocalCleanupReadinessReportView`
  - `RemoteCleanupSyncReadinessReportView`
  [Source: `packages/contracts/src/api.ts`]
- Supervisor routes and service methods already expose:
  - `GET /work-items/{work_item_id}/low-risk-delivery-plan`
  - `POST /work-items/{work_item_id}/delivery-execution-evidence`
  - `GET /work-items/{work_item_id}/local-worktree-plan`
  - `GET /supervisor/local-cleanup-readiness-report`
  - `GET /supervisor/remote-cleanup-sync-readiness-report`
  [Source: `services/supervisor/src/supervisor/api/main.py`; `services/supervisor/src/supervisor/application/service.py`]
- Story 6.15 established local worktree planning as read-only: it reports intended branch, base branch, planned folder, commands, safety checks, evidence, and blockers while keeping create, cleanup, and remote operations false. [Source: `docs/stories/6-15-local-worktree-management.md#Implementation Notes`]
- Story 6.21 established local cleanup readiness as read-only policy: it names cleanup target classes, required evidence, blocked targets, stop conditions, next safe actions, and explicitly performs no worktree removal, branch deletion, file deletion, Git command, shell command, remote operation, or evidence deletion. [Source: `docs/stories/6-21-local-cleanup-readiness.md#Implementation Notes`]
- Story 6.22 established remote cleanup/sync readiness as read-only policy and blocks remote branch deletion, GitHub issue/PR mutation, story sync, auth changes, and token storage. [Source: `docs/stories/6-22-remote-cleanup-sync-readiness.md#Authority Boundary`]

### Architecture And Safety Boundaries

- This story is cleanup planning only. It must not remove worktrees, delete branches, delete files, delete retained evidence, prune Git state, mutate GitHub, close issues, update stories, call providers, read credentials, bypass failed checks, or execute cleanup commands.
- Evidence remains metadata-only. Do not retain raw tokens, secrets, raw stdout/stderr, prompts, completions, provider payloads, unbounded command output, reasoning traces, or unnecessary source copies. [Source: `docs/architecture/kendall-vnxt-worker-threat-boundary-2026-06-08.md#Prompt And Evidence Redaction`]
- Cleanup must fail closed when delivery evidence is failed or stale, retained evidence is missing, cleanup target is ambiguous, target path is outside the approved disposable worktree root, Git registration is uncertain, source files are unexpected, or branch/head evidence is stale.
- Windows worktree cleanup must treat `.pytest_cache`, `.mypy_cache`, `.ruff_cache`, temp test output, disposable `.venv`, Git worktree registration, and leftover filesystem paths as separate evidence classes. Classification is not deletion.
- Prefer structured contract fields over parsing command strings. If filesystem classification is needed in tests, use deterministic temp directories and injected/fixture metadata rather than live repo mutation.

### Implementation Guidance

- Prefer a read-only work-item scoped route such as `GET /work-items/{work_item_id}/cleanup-plan` if the existing low-risk delivery plan cannot express the richer cleanup classification.
- Recommended contract shape:
  - `planId`, `generatedAt`, `workItemId`, `branchTarget`, `cleanupTargetPath`, `baseBranch`, `expectedHeadRevision`
  - `deliveryEvidenceRefs[]`, `retainedEvidence[]`, `recoveryPath`
  - `gitWorktreeState`: `registered`, `not_registered`, `unknown`, or `not_applicable`
  - `filesystemState`: `exists`, `missing`, `residue_only`, `unsafe_outside_target`, or `unknown`
  - `residue[]` entries with `kind`, `path`, `insideApprovedTarget`, `safeToRemoveAfterApproval`
  - `sourceFileState`, `blockedPaths[]`, `dryRunEffects[]`, `blockedReasons[]`
  - `cleanupAllowed=false`, `readOnly=true`, `requiredApproval`, `requiredPolicy`
- Suggested stable blocked reasons:
  - `policy-missing`
  - `cleanup-target-ambiguous`
  - `cleanup-target-outside-approved-root`
  - `retained-evidence-missing`
  - `delivery-evidence-failed`
  - `delivery-evidence-stale`
  - `git-worktree-state-unknown`
  - `source-files-present`
  - `blocked-path-present`
  - `unsafe-residue-path`
- Do not call `git worktree remove`, `git branch -d`, `Remove-Item`, `gh`, `_remote_delivery_commands(...)`, cleanup scripts, provider/model calls, or credential/session APIs from this story.

### Testing

Minimum focused verification:

- `pnpm.cmd run test:supervisor -- tests/integration/test_routing_preview.py -q -k "cleanup_plan or low_risk_delivery_plan or delivery_execution_evidence"`
- `pnpm.cmd run check:delivery-readiness` if the existing drift guard is extended.
- `pnpm.cmd run check:docs` when story/docs/index artifacts change.

Broaden before review when shared contracts, schemas, API routes, service logic, dashboard report surfaces, or package check wiring changes:

- `pnpm.cmd run check`

### Project Structure Notes

- Story record location: `docs/stories/`.
- Shared API contracts: `packages/contracts/src/api.ts`.
- Supervisor schemas: `services/supervisor/src/supervisor/api/schemas.py`.
- Supervisor routes: `services/supervisor/src/supervisor/api/main.py`.
- Supervisor cleanup/delivery logic: `services/supervisor/src/supervisor/application/service.py`.
- Existing integration tests: `services/supervisor/tests/integration/test_routing_preview.py`.
- Existing delivery/cleanup drift guards: `scripts/check-delivery-readiness-policy-report.mjs`, `scripts/check-maintenance-readiness-report.mjs`, and report catalog checks.
- Story 10.4 owns Dev Console rendering. Keep UI work out of Story 10.3 unless a tiny route/client hook is required for future rendering.

## References

- `_bmad-output/planning-artifacts/epics.md`
- `docs/stories/10-1-define-low-risk-delivery-policy-and-dry-run-plan-contract.md`
- `docs/stories/10-2-record-delivery-execution-evidence-for-approved-pr-and-merge-actions.md`
- `docs/stories/6-15-local-worktree-management.md`
- `docs/stories/6-21-local-cleanup-readiness.md`
- `docs/stories/6-22-remote-cleanup-sync-readiness.md`
- `docs/product/kendall-vnxt-orchestrator-product-brief-2026-06-10.md`
- `docs/architecture/kendall-vnxt-execution-authority-approval-checkpoints-2026-06-08.md`
- `docs/architecture/kendall-vnxt-worker-threat-boundary-2026-06-08.md`
- `packages/contracts/src/api.ts`
- `services/supervisor/src/supervisor/api/main.py`
- `services/supervisor/src/supervisor/api/schemas.py`
- `services/supervisor/src/supervisor/application/service.py`
- `services/supervisor/tests/integration/test_routing_preview.py`

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- Story created through `bmad-create-story` workflow after loading sprint status, Epic 10 planning context, previous Stories 10.1 and 10.2, cleanup/worktree stories, and cleanup authority architecture.
- Red phase: `pnpm.cmd run test:supervisor -- tests/integration/test_routing_preview.py -q -k "cleanup_plan"` failed with 4 expected 404 failures before the cleanup-plan route existed.
- Focused cleanup regression: `pnpm.cmd run test:supervisor -- tests/integration/test_routing_preview.py -q -k "cleanup_plan"` passed with 4 tests and 1 existing aiosqlite warning.
- Static drift: `pnpm.cmd run check:delivery-readiness` passed after extending delivery-readiness drift coverage for cleanup-plan contracts, route, service blockers, tests, and story index evidence.
- Focused Story 10 regression: `pnpm.cmd run test:supervisor -- tests/integration/test_routing_preview.py -q -k "cleanup_plan or delivery_execution_evidence or low_risk_delivery_plan"` passed with 14 tests and 1 existing aiosqlite warning.
- Documentation verification: `pnpm.cmd run check:docs` passed.
- Full regression: `pnpm.cmd run check` passed, including dashboard build and 182 supervisor tests with 1 existing aiosqlite warning.
- BMAD code review party-mode findings accepted from Blind Hunter, Edge Case Hunter, and Acceptance Auditor; review patches added for delivery evidence redaction/approval/exit-code/action-specific validation and cleanup plan merge evidence, path containment, source-file reporting, policy naming, target normalization, and next-action coverage.
- Review patch focused regression: `pnpm.cmd run test:supervisor -- tests/integration/test_routing_preview.py -q -k "cleanup_plan or delivery_execution_evidence or low_risk_delivery_plan"` passed with 21 tests and 1 existing aiosqlite warning.
- Review patch static drift: `pnpm.cmd run check:delivery-readiness` passed.
- Review patch documentation verification: `pnpm.cmd run check:docs` passed.
- Review patch full regression: `pnpm.cmd run check` passed, including dashboard build and 189 supervisor tests with 1 existing aiosqlite warning.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Added shared TypeScript and Pydantic contracts for `CleanupPlanResidueView` and `CleanupPlanView`.
- Added `GET /work-items/{work_item_id}/cleanup-plan` for read-only cleanup planning.
- Implemented `get_cleanup_plan(...)` with metadata-only classification for Git worktree registration state, filesystem state, residue, blocked paths, retained evidence, dry-run effects, required approval/policy, recovery path, and next safe actions.
- Added fail-closed cleanup blockers for missing policy, ambiguous target, target outside approved root, missing retained evidence, failed/stale delivery evidence, unknown Git worktree state, source files, blocked paths, and unsafe residue paths.
- Added deterministic cleanup-plan supervisor tests for filesystem residue, missing retained evidence, unsafe path crossing, and failed delivery evidence.
- Extended `check:delivery-readiness` drift coverage for cleanup-plan route, contracts, service blockers, tests, and story index evidence.
- No worktree removal, branch deletion, file deletion, GitHub mutation, provider call, credential/session access, issue sync, failed-check bypass, or destructive cleanup execution was introduced.
- Accepted and patched BMAD review findings for rejected-event redaction, exact approval evidence, external mutation evidence labeling, action-specific PR validation, terminal/exit consistency, cleanup merge-evidence gating, residue path containment, cleanup policy naming, cleanup target normalization, source-file reporting, and targeted next safe actions.

### File List

- `docs/stories/10-3-plan-safe-cleanup-with-evidence-preservation-and-worktree-residue-classification.md`
- `docs/stories/index.md`
- `packages/contracts/src/api.ts`
- `scripts/check-delivery-readiness-policy-report.mjs`
- `services/supervisor/src/supervisor/api/main.py`
- `services/supervisor/src/supervisor/api/schemas.py`
- `services/supervisor/src/supervisor/application/service.py`
- `services/supervisor/tests/integration/test_routing_preview.py`

## Change Log

- 2026-06-13: Created Story 10.3 and moved it to ready-for-dev.
- 2026-06-13: Implemented read-only cleanup planning and moved Story 10.3 to review.
- 2026-06-13: Patched accepted BMAD code-review findings and moved Story 10.3 to done.
