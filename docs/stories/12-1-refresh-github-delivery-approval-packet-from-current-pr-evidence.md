---
baseline_commit: 5b121772c13d4dd113dd95657f52077fcb19dcff
---

# Story 12.1: Refresh GitHub Delivery Approval Packet From Current PR Evidence

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As Bob,
I want the GitHub delivery approval packet refreshed from current PR #103 evidence,
so that the next merge or delivery decision is based on current facts and exact approval rather than stale planning state.

## Acceptance Criteria

1. Given PR #103 is the selected delivery target, when the story refreshes delivery evidence, then the packet records PR URL, branch, base, head revision if available, CI state, review state, mergeability, update timestamp, retained evidence, rollback path, and stop lines, and it marks the packet as approval-required rather than approved.
2. Given PR state, CI, review, mergeability, branch, base, or head revision is stale, unavailable, or contradictory, when the packet is generated, then the packet blocks delivery action and names the exact stale or missing field and the smallest safe refresh step.
3. Given Bob later approves a GitHub delivery operation, when delivery execution evidence is recorded, then the approval must bind to the exact PR URL, branch, base, head revision, CI state, review state, merge state, retained evidence, operator, rollback path, stop lines, and expiry or review point, and arbitrary or stale approval IDs are rejected.
4. Given the packet is only a readiness artifact, when this story is implemented, then it does not push, merge, deploy, delete branches, delete worktrees, resolve comments, mutate GitHub state, sync issues, or bypass failed checks.

## Tasks / Subtasks

- [x] Create or refresh the GitHub delivery approval packet for PR #103. (AC: 1, 2, 4)
  - [x] Include the current PR URL, head branch, base branch, merge state, CI state, review decision, and last update timestamp from the latest PR refresh.
  - [x] Include retained-evidence references from Epic 10 delivery evidence and Story 11.3 next-lane decision evidence.
  - [x] Mark the packet as approval-required and non-executing.
- [x] Define stale-evidence blockers. (AC: 2, 3)
  - [x] Block delivery if PR state, CI, review decision, mergeability, branch/base, head revision, approval-ledger binding, retained evidence, rollback path, or stop lines are missing or stale.
  - [x] Name the smallest safe refresh step for each blocker.
- [x] Preserve delivery approval-ledger requirements. (AC: 3)
  - [x] Require exact binding to authority family `github-delivery`, PR URL, branch, base, head revision, CI state, review state, merge state, retained evidence, operator, rollback path, stop lines, and expiry or review point.
  - [x] Keep arbitrary approval IDs rejected.
- [x] Verify documentation or drift checks. (AC: 1-4)
  - [x] Run `pnpm.cmd run check:docs`.
  - [x] If implementation touches delivery readiness code, approval-ledger contracts, dashboard fields, report generation, or scripts, also run the smallest relevant delivery-readiness or approval-ledger check.

## Dev Notes

This story is the first successor story after selecting the deferred `github-delivery` lane from the deferred authority backlog map. It prepares a current approval packet only. It does not perform the delivery action.

Current PR evidence refreshed on 2026-06-13:

- PR: `https://github.com/slawdawg/Kendall-vnxt/pull/103`
- State: `OPEN`
- Head branch: `codex/epic-10-delivery-cleanup-plans`
- Base branch: `main`
- Merge state: `CLEAN`
- Review decision: empty / not reported by `gh pr view`
- CI: `check` completed with `SUCCESS`
- Last PR update: `2026-06-13T22:25:41Z`

The developer must re-check PR state on the implementation day before claiming current delivery readiness. GitHub state is intentionally treated as stale unless refreshed close to execution.

Do not create a second delivery-readiness model. Reuse or align with the existing delivery surfaces:

- FastAPI routes in `services/supervisor/src/supervisor/api/main.py`:
  - `POST /work-items/{work_item_id}/delivery-readiness`
  - `GET /supervisor/github-delivery-authority-report`
  - `GET /work-items/{work_item_id}/delivery-execution-evidence`
  - `GET /supervisor/delivery-readiness-policy-report`
- Supervisor construction and blockers in `services/supervisor/src/supervisor/application/service.py`.
- Existing integration coverage in `services/supervisor/tests/integration/test_routing_preview.py`, especially delivery execution evidence, approval-ledger, current PR state mismatch, and cleanup-plan cases.
- Existing dashboard surfaces:
  - `apps/dashboard/src/components/delivery-cleanup-plan-panel.tsx`
  - `apps/dashboard/src/components/delivery-readiness-panel.tsx`
  - `apps/dashboard/src/components/delivery-readiness-policy-report-panel.tsx`
  - `apps/dashboard/src/components/github-delivery-authority-report-panel.tsx`
  - `apps/dashboard/src/lib/supervisor.ts`
- Existing drift guard: `scripts/check-delivery-readiness-policy-report.mjs`.

If the implementation is document-only, keep changes under `docs/goals/` and story evidence only. If it touches runtime/report/dashboard code, update the existing route/report/panel/check chain rather than adding a parallel source of truth.

### Project Structure Notes

- Planning epic entry: `_bmad-output/planning-artifacts/epics.md`
- Sprint tracking: `_bmad-output/implementation-artifacts/sprint-status.yaml`
- Candidate goal artifact location for the approval packet: `docs/goals/`
- API route file: `services/supervisor/src/supervisor/api/main.py`
- Supervisor service file: `services/supervisor/src/supervisor/application/service.py`
- Dashboard API client: `apps/dashboard/src/lib/supervisor.ts`
- Delivery/check drift guard: `scripts/check-delivery-readiness-policy-report.mjs`
- Existing delivery readiness and cleanup story context:
  - `docs/stories/10-1-define-low-risk-delivery-policy-and-dry-run-plan-contract.md`
  - `docs/stories/10-2-record-delivery-execution-evidence-for-approved-pr-and-merge-actions.md`
  - `docs/stories/10-3-plan-safe-cleanup-with-evidence-preservation-and-worktree-residue-classification.md`
  - `docs/stories/10-5-bind-delivery-execution-approval-to-trusted-authority-ledger.md`
- Existing next-lane decision context:
  - `docs/goals/epic-11-next-lane-authority-decision-packet-2026-06-13.md`

### Guardrails

- Do not push.
- Do not merge.
- Do not deploy.
- Do not delete branches.
- Do not delete worktrees.
- Do not clean filesystem residue.
- Do not resolve GitHub comments.
- Do not sync issues.
- Do not access credentials or external sessions.
- Do not store plaintext tokens.
- Do not bypass failed checks.
- Do not treat CI success or `mergeStateStatus=CLEAN` as approval.

### References

- [Source: `_bmad-output/planning-artifacts/deferred-authority-backlog-map-2026-06-13.md#6-github-delivery-operation`]
- [Source: `_bmad-output/planning-artifacts/sprint-change-proposal-2026-06-13-deferred-authority-backlog-reconciliation.md#4-detailed-change-proposals`]
- [Source: `docs/goals/epic-11-next-lane-authority-decision-packet-2026-06-13.md#candidate-lane-comparison`]
- [Source: `docs/stories/10-5-bind-delivery-execution-approval-to-trusted-authority-ledger.md`]
- [Source: `docs/stories/index.md#current-rule`]

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- `gh pr view 103 --json number,state,headRefName,baseRefName,mergeStateStatus,reviewDecision,statusCheckRollup,url,updatedAt`
- `gh pr view 103 --json number,state,headRefName,baseRefName,headRefOid,mergeStateStatus,reviewDecision,statusCheckRollup,url,updatedAt,isDraft`

### Completion Notes List

- Created through BMAD create-story workflow after Bob selected the `github-delivery` lane.
- Current PR evidence was refreshed before story creation; implementation must refresh again before any delivery approval packet is accepted for execution.
- Created `docs/goals/github-delivery-approval-packet-pr-103-2026-06-13.md` with refreshed PR #103 target, branch/base, head SHA, CI, merge-state, review-state, retained-evidence, rollback, and stop-line evidence.
- Documented stale-evidence blockers and approval-ledger binding requirements in the packet.
- Verified with `pnpm.cmd run check:docs`; no runtime/report/dashboard code changed, so no delivery-readiness drift check was required.
- Code review found and fixed stale story-index wording that still described Story 12.1 as ready-for-dev after the story moved to review.

### File List

- `_bmad-output/planning-artifacts/epics.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `docs/goals/github-delivery-approval-packet-pr-103-2026-06-13.md`
- `docs/stories/12-1-refresh-github-delivery-approval-packet-from-current-pr-evidence.md`
- `docs/stories/index.md`

### Change Log

- 2026-06-13: Refreshed PR #103 GitHub delivery approval packet from current evidence and moved Story 12.1 to review.
- 2026-06-13: Code review patch updated Story 12.1 index wording from ready-for-dev to review.
- 2026-06-13: Code review approved Story 12.1; moved story to done.

## Senior Developer Review (AI)

Review date: 2026-06-13
Outcome: Approve

### Findings

- [x] [Review][Patch] Story index used stale ready-for-dev wording after Story 12.1 moved to review. Fixed in `docs/stories/index.md`.
