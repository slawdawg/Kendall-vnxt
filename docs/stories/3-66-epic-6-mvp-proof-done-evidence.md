# Story 3.66: Epic 6 MVP Proof Done Evidence

Date: 2026-06-11
Status: selected for Epic 6 MVP proof trial; not implemented

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
