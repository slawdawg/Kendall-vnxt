# Story 3.66: Epic 6 MVP Proof Done Evidence

Date: 2026-06-11
Status: Epic 6 MVP proof trial in progress; bounded implementation not approved

## Goal

Prove the Epic 6 MVP lifecycle with one low-risk real BMAD story by carrying this story through Candidate Work, Active Work, lane decision, local evidence, bounded implementation, verification, delivery, cleanup, and Dev Console done evidence.

## Source Slice

Safe backlog item: `read-only-evidence-polish`

This story is selected because it exercises the real Dev Console and evidence surfaces without enabling provider expansion, subscription-agent launch, unbounded process execution, secrets access, remote cleanup, or issue/story sync.

## Scope

- Import this story as Candidate Work from the local BMAD/story markdown artifact.
- Promote it to Active Work through the Dev Console Candidate Work flow.
- Record the Task Packet, routing preview, safe local/Ollama-boundary evidence, and execution-attempt evidence needed for the proof.
- Add the smallest implementation needed to show Epic 6 proof completion evidence in the Dev Console and retained runtime evidence.
- Verify with focused checks first, then `pnpm.cmd run check`.
- Deliver through one GitHub PR after explicit approval.
- Mark the WorkItem done only after verification, delivery, merge, cleanup, and retained evidence are recorded.

## Out Of Scope

- Claude launch unless Bob separately approves one review-only attempt.
- Provider or model expansion beyond the currently approved Ollama endpoint/model boundary.
- Auto-merge, automatic cleanup, remote cleanup, issue/story sync, or trusted autonomy expansion.
- Source changes outside the selected proof scope.
- Raw prompt, completion, reasoning trace, secret, or unnecessary source-copy retention.

## Acceptance Criteria

1. This story is imported as Candidate Work with source artifact metadata preserved.
2. The Candidate Work record is approved and promoted to an Active WorkItem.
3. The WorkItem has a Task Packet, routing preview, safe local evidence, and retained runtime evidence.
4. The implementation diff is limited to the approved proof scope.
5. `pnpm.cmd run check` passes after focused verification.
6. A GitHub PR, CI result, merge evidence, and cleanup evidence are retained after separate approvals.
7. The WorkItem reaches `done` state with final Dev Console evidence.
8. `docs/goals/epic-6-progress-and-kickoff-2026-06-10.md` and `docs/architecture/kendall-vnxt-epic-6-authority-ledger-2026-06-10.md` are updated with proof evidence.

## Verification

- Focused supervisor tests for the changed evidence/report/workflow surface.
- Focused dashboard build or e2e coverage if Dev Console rendering changes.
- `pnpm.cmd run check`

## Approval Required Before Implementation

Approve one Epic 6 MVP proof trial for `docs/stories/3-66-epic-6-mvp-proof-done-evidence.md`: create/use one isolated local Codex worktree from `main`, launch one bounded Codex implementation for this story only, limit changes to the approved proof scope, run `pnpm.cmd run check` for verification, and do not launch Claude, push, open/update a PR, merge, delete branches/worktrees, sync issues, or perform cleanup without separate approval.

## Current Proof Evidence

- Candidate Work: `8afea99f-bb79-4f51-a66c-f1b02dff9005`.
- Active WorkItem: `a8e43bba-a2dd-4b2e-b995-22fecea85611`.
- Local proof-selection commit: `1c79711` on `codex/epic-6-proof-selection-evidence`.
- Draft PR: `https://github.com/slawdawg/Kendall-vnxt/pull/96`.
- PR #96 CI `check` passed on 2026-06-11.
- Task packet/routing preview selected `local_readonly`, preview-only authority, no provider calls, and no command execution.
- Local evidence explanation: `local-evidence-route-a8e43bba-a2dd-4b2e-b995-22fecea85611-epic-6-mvp-proof-local-evidence-task_classification`.
- Runtime export: `runtime-evidence-export-a8e43bba-a2dd-4b2e-b995-22fecea85611`.
- Current WorkItem state reached `implementing` after the repo was cleaned, but runtime evidence still shows zero execution attempts and all process/provider/command/source-mutation authority flags disabled.
- The proof supervisor instance was stopped before any bounded Codex implementation, Claude review, GitHub delivery, merge, cleanup, or done-state completion.
- The bounded implementation scope, allowed paths, blocked operations, verification, and rollback plan are defined in `docs/goals/epic-6-real-story-trial-approval-packet-2026-06-11.md`.

## Implementation Design Notes

The smallest useful implementation is to update existing Epic 6 report content rather than introduce new workflow machinery.

Target behavior:

- `GET /supervisor/epic-6-mvp-proof-trial-report` names Story 3.66 as the selected story.
- The MVP proof report shows the proof has completed selection, Candidate Work import, Active Work promotion, local-readonly routing evidence, runtime export, PR #96 delivery preparation, and is stopped before bounded implementation.
- `GET /supervisor/epic-6-completion-audit-report` reflects the same progress while keeping `epicComplete=false`.
- Controls page continues using the existing `MvpProofTrialReportPanel` and `EpicCompletionAuditReportPanel`; no new component should be needed unless the report contract changes.
- Report catalog/runtime export drift checks include any new Story 3.66 evidence references.

Likely code changes:

- Update `get_epic_6_mvp_proof_trial_report` in `services/supervisor/src/supervisor/application/service.py`.
- Update `get_epic_6_completion_audit_report` in `services/supervisor/src/supervisor/application/service.py`.
- Update focused supervisor assertions in `services/supervisor/tests/integration/test_routing_preview.py`.
- Update controls-page e2e assertions in `tests/e2e/dashboard.spec.ts` only if the rendered text changes.
- Update drift checks only if new story references or report evidence references require static coverage.

Implementation should not add process launch, provider calls, direct GitHub mutation, cleanup execution, issue sync, or new persistence tables.
