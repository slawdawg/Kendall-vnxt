---
baseline_commit: afc62fc7
---

# Story 10.4: Show Delivery And Cleanup Plans In Dev Console

Status: done

## Story

As Bob,
I want the Dev Console to show PR, merge, and cleanup plans from retained evidence,
so that I can approve, inspect, or defer delivery actions without reconstructing state from terminal output.

## Acceptance Criteria

1. Given a work item has a delivery or cleanup plan, when Bob opens the Dev Console work-item detail page, then the UI shows PR readiness, merge readiness, and cleanup readiness as separate states, and each state shows eligible, blocked, approved, executed, failed, or cleaned-up status.
2. Given a delivery or cleanup action is blocked, when Bob views the plan, then the panel shows the exact blocked reason, evidence used, and smallest safe next action, and it does not imply autonomous execution when approval or policy evidence is missing.
3. Given a dry-run plan exists, when the Dev Console renders the plan, then it shows what would be pushed, merged, deleted, retained, or blocked, and it distinguishes Git-registered worktrees from filesystem residue.
4. Given a delivery or cleanup plan changes, when dashboard/report regression checks run, then static and browser checks prove the plan remains visible, bounded, and aligned with current stop lines.
5. Given Story 10.4 is complete, then no provider expansion, credential/session access, source mutation by workers, subscription-agent process launch, failed-check bypass, issue sync, destructive cleanup, remote mutation, branch deletion, worktree deletion, or broad autonomy is introduced.

## Tasks / Subtasks

- [x] Add dashboard contract/client support. (AC: 1-5)
  - [x] Export client methods for `GET /work-items/{work_item_id}/low-risk-delivery-plan` and `GET /work-items/{work_item_id}/cleanup-plan`.
  - [x] Reuse shared `LowRiskDeliveryPlanReportView`, `LowRiskDeliveryPlanActionView`, `CleanupPlanView`, and `CleanupPlanResidueView` contracts.
  - [x] Preserve read-only fetch semantics; do not add buttons or client calls that push, merge, delete, sync issues, or record approvals.
- [x] Build the Dev Console panel. (AC: 1-5)
  - [x] Add a focused panel component that displays PR, merge, and cleanup readiness as separate scan-friendly states.
  - [x] Show status, eligibility, blocked reasons, evidence, dry-run effects, required approval/policy, and next safe action for each delivery action.
  - [x] Show cleanup target path, Git worktree state, filesystem/source-file state, retained evidence, residue classes, blocked paths, dry-run effects, blocked reasons, and recovery path.
  - [x] Use existing dashboard visual patterns; keep cards shallow and compact, and avoid implying automation authority.
- [x] Wire the work-item detail page. (AC: 1-5)
  - [x] Fetch delivery and cleanup plans for the selected work item.
  - [x] Render the panel near the green-gate, local-worktree, and delivery-readiness evidence surfaces.
  - [x] Add navigation anchor text for delivery and cleanup plans without crowding the sticky action bar.
- [x] Add deterministic dashboard regression coverage. (AC: 1-5)
  - [x] Extend dashboard/static drift checks or e2e coverage so the panel remains visible and bounded.
  - [x] Assert the UI includes PR readiness, merge readiness, cleanup readiness, blocked reasons, retained evidence, dry-run effects, cleanup target state, filesystem residue, and stop-line copy.
  - [x] Assert no UI text implies autonomous push, merge, cleanup, issue sync, provider expansion, or failed-check bypass.
- [x] Update story evidence. (AC: 1-5)
  - [x] Record focused and full verification commands in the Dev Agent Record.
  - [x] Update Completion Notes, File List, and Change Log during implementation.

### Review Findings

- [x] [Review][Patch] Missing eligibility stages can 500 the delivery plan endpoint [services/supervisor/src/supervisor/application/service.py] -- fixed with blocked placeholder stages.
- [x] [Review][Patch] Delivery actions lacked action-specific next safe action [services/supervisor/src/supervisor/application/service.py] -- fixed with `nextSafeAction` on each action and dashboard rendering from that field.
- [x] [Review][Patch] Plan statuses did not use the AC readiness vocabulary [services/supervisor/src/supervisor/application/service.py] -- fixed by normalizing plan status to blocked/eligible/executed/failed/cleaned_up vocabulary.
- [x] [Review][Patch] Cleanup residue trusted metadata-supplied containment flags [services/supervisor/src/supervisor/application/service.py] -- fixed by always computing containment server-side from the cleanup target path.
- [x] [Review][Patch] Merge evidence could be recorded before an actual merged status [services/supervisor/src/supervisor/application/service.py] -- fixed by requiring `mergeStatus == "merged"` for approved merge evidence.
- [x] [Review][Patch] Dashboard silently omitted missing PR/merge/cleanup actions [apps/dashboard/src/components/delivery-cleanup-plan-panel.tsx] -- fixed with explicit blocked placeholder cards for missing actions.
- [x] [Review][Patch] Read-only was displayed as approval authority [apps/dashboard/src/components/delivery-cleanup-plan-panel.tsx] -- fixed with yes/no state badges instead of approved/blocked wording for read-only.
- [x] [Review][Defer] Delivery execution approval IDs need a trusted approval ledger binding [services/supervisor/src/supervisor/application/service.py] -- deferred, larger authority-ledger hardening beyond Story 10.4 display scope.

## Dev Notes

### Source Context

- Epic 10 requires the Dev Console to expose PR, merge, and cleanup plan state with exact blocked reasons and smallest safe next action, while preserving cleanup evidence and distinguishing Git worktrees from filesystem residue. [Source: `_bmad-output/planning-artifacts/epics.md#Story 10.4: Show Delivery And Cleanup Plans In Dev Console`]
- UX requirements for Epic 10 require separate PR, merge, and cleanup states; visible evidence for local verification, CI, review, merge state, branch head, retained artifacts, and cleanup target; dry-run plans before execution; and clear eligible/blocked/approved/executed/failed/cleaned-up states. [Source: `_bmad-output/planning-artifacts/epics.md#UX Design Requirements`]
- Story 10.1 added `LowRiskDeliveryPlanActionView`, `LowRiskDeliveryPlanReportView`, and work-item/supervisor low-risk delivery plan endpoints. Missing policy must remain a hard block with `eligible=false` and `allowedOperations=[]`. [Source: `docs/stories/10-1-define-low-risk-delivery-policy-and-dry-run-plan-contract.md#Review Findings`]
- Story 10.2 added `DeliveryExecutionEvidencePayload` and `DeliveryExecutionEvidenceView`, exact approval/policy checks, metadata-only retention boundaries, failed-action evidence, and stale rejection. [Source: `docs/stories/10-2-record-delivery-execution-evidence-for-approved-pr-and-merge-actions.md#Review Findings`]
- Story 10.3 added `CleanupPlanView`, `CleanupPlanResidueView`, `GET /work-items/{work_item_id}/cleanup-plan`, read-only cleanup classification, source-file reporting, merge-evidence gating, residue path containment, and targeted next safe actions. [Source: `docs/stories/10-3-plan-safe-cleanup-with-evidence-preservation-and-worktree-residue-classification.md#Completion Notes List`]

### Existing Implementation To Reuse

- Work-item detail route: `apps/dashboard/src/app/work-items/[work-item-id]/page.tsx`.
- API client: `apps/dashboard/src/lib/supervisor.ts`.
- Existing dashboard panels to match:
  - `apps/dashboard/src/components/green-gate-readiness-panel.tsx`
  - `apps/dashboard/src/components/local-worktree-plan-panel.tsx`
  - `apps/dashboard/src/components/delivery-readiness-panel.tsx`
  - `apps/dashboard/src/components/delivery-readiness-policy-report-panel.tsx`
  - `apps/dashboard/src/components/local-cleanup-readiness-report-panel.tsx`
- Existing dashboard regression coverage lives in `tests/e2e/dashboard.spec.ts` and static drift checks such as `scripts/check-dashboard-e2e-report.mjs` and `scripts/check-delivery-readiness-policy-report.mjs`.

### Architecture And Safety Boundaries

- This story is display-only plus read-only API fetches. It must not add mutation buttons, action submission, approval recording, GitHub calls, cleanup commands, provider calls, credential/session access, issue sync, failed-check bypass, branch deletion, worktree deletion, or autonomous delivery.
- UI copy must not imply autonomous execution when approval or policy evidence is missing. Prefer language like "would", "blocked", "requires approval", "read-only", and "dry-run".
- Evidence remains metadata-only. Do not display raw prompts, raw completions, raw stdout/stderr, provider payloads, secrets, tokens, reasoning traces, unbounded command output, or source copies.
- Frontend style should stay dense, operational, and consistent with existing Dev Console panels. Avoid landing-page styling, nested cards, decorative gradients, or large hero treatment.

### Implementation Guidance

- Prefer a new `delivery-cleanup-plan-panel.tsx` or similarly focused component with:
  - Action rows for PR, merge, and cleanup from `LowRiskDeliveryPlanReportView.actions`.
  - Compact badges for status/read-only/eligible.
  - Blocked reasons and next safe action visible without expanding.
  - Evidence and dry-run effects in short lists.
  - Cleanup plan subsection showing `gitWorktreeState`, `filesystemState`, `sourceFileState`, `retainedEvidence`, `residue`, `blockedPaths`, and `recoveryPath`.
- Work-item detail page should fetch both plans in the existing `Promise.all` area and render the panel near Green Gate and Local Worktree evidence.
- If adding static drift coverage, keep it narrow: assert contract/client/component/route/test strings that prove the panel and stop-line copy exist.

### Testing

Minimum focused verification:

- `pnpm.cmd --filter @kendall/dashboard build`
- `pnpm.cmd run check:delivery-readiness` if the existing drift guard is extended.
- `pnpm.cmd run check:docs` when story/docs/index artifacts change.

Broaden before review:

- `pnpm.cmd run check`

### Project Structure Notes

- Story record location: `docs/stories/`.
- Shared API contracts: `packages/contracts/src/api.ts`.
- Dashboard API client: `apps/dashboard/src/lib/supervisor.ts`.
- Dashboard panel components: `apps/dashboard/src/components/`.
- Work-item detail page: `apps/dashboard/src/app/work-items/[work-item-id]/page.tsx`.
- Dashboard e2e tests: `tests/e2e/dashboard.spec.ts`.
- Drift checks: `scripts/check-delivery-readiness-policy-report.mjs`, `scripts/check-dashboard-e2e-report.mjs`.

## References

- `_bmad-output/planning-artifacts/epics.md`
- `docs/stories/10-1-define-low-risk-delivery-policy-and-dry-run-plan-contract.md`
- `docs/stories/10-2-record-delivery-execution-evidence-for-approved-pr-and-merge-actions.md`
- `docs/stories/10-3-plan-safe-cleanup-with-evidence-preservation-and-worktree-residue-classification.md`
- `apps/dashboard/src/app/work-items/[work-item-id]/page.tsx`
- `apps/dashboard/src/lib/supervisor.ts`
- `apps/dashboard/src/components/green-gate-readiness-panel.tsx`
- `apps/dashboard/src/components/local-worktree-plan-panel.tsx`
- `tests/e2e/dashboard.spec.ts`

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- Story created through `bmad-create-story` workflow after loading Epic 10 story context, UX requirements, completed Stories 10.1-10.3, and current dashboard work-item detail surfaces.
- Verified Story 10.4 focused dashboard build with `pnpm.cmd --filter @kendall/dashboard build`.
- Verified deterministic Epic 10 dashboard/report guard with `pnpm.cmd run check:delivery-readiness`.
- Verified browser coverage with focused Playwright grep through `runFocusedDashboardE2E({ testFile: "dashboard.spec.ts", grep: "shows delivery readiness controls for managed recipe work" })`.
- Verified docs with `pnpm.cmd run check:docs`.
- Verified full regression with `pnpm.cmd run check` (189 supervisor tests passed; existing aiosqlite deprecation warning only).
- BMAD code review ran Blind Hunter, Edge Case Hunter, and Acceptance Auditor agents; patch findings were accepted and verified.
- Post-review focused verification passed: `pnpm.cmd run test:supervisor -- tests/integration/test_routing_preview.py -q -k "cleanup_plan or delivery_execution_evidence or low_risk_delivery_plan"`.
- Post-review dashboard verification passed: `pnpm.cmd --filter @kendall/dashboard build`.
- Post-review browser verification passed on fresh ports with focused Playwright grep for `shows delivery readiness controls for managed recipe work`.
- Post-review full regression passed: `pnpm.cmd run check` (189 supervisor tests passed; existing aiosqlite deprecation warning only).

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Added read-only dashboard client methods for work-item low-risk delivery plans and cleanup plans.
- Added Dev Console delivery/cleanup plan panel showing separate PR, merge, and cleanup readiness states, blocked reasons, retained evidence, dry-run effects, cleanup target state, Git worktree state, filesystem residue classification, required policy/approval, recovery path, and next safe actions.
- Wired the panel into the work-item detail page with a `Delivery plans` sticky nav anchor near Green Gate evidence.
- Extended deterministic drift checks and browser coverage to prove the panel remains visible, bounded, and does not imply autonomous push, merge, cleanup, issue sync, provider expansion, or failed-check bypass.
- Accepted code review findings by adding action-level next safe action, blocked fallback cards for missing delivery actions, AC vocabulary statuses, server-computed residue containment, merged-only approved merge evidence, and non-authority read-only badge wording.

### File List

- `apps/dashboard/src/app/work-items/[work-item-id]/page.tsx`
- `apps/dashboard/src/components/delivery-cleanup-plan-panel.tsx`
- `apps/dashboard/src/lib/supervisor.ts`
- `docs/stories/10-4-show-delivery-and-cleanup-plans-in-dev-console.md`
- `packages/contracts/src/api.ts`
- `scripts/check-delivery-readiness-policy-report.mjs`
- `services/supervisor/src/supervisor/api/schemas.py`
- `services/supervisor/src/supervisor/application/service.py`
- `services/supervisor/tests/integration/test_routing_preview.py`
- `tests/e2e/dashboard.spec.ts`

## Change Log

- 2026-06-13: Created Story 10.4 and moved it to ready-for-dev.
- 2026-06-13: Implemented Story 10.4 Dev Console delivery/cleanup plan surface and moved story to review.
- 2026-06-13: Accepted BMAD code review findings, verified regression gates, and moved story to done.
