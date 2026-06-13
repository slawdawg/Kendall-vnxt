---
baseline_commit: 51e3c24
---

# Story 11.4: Show Reconciliation And Next-Lane Readiness In Dev Console

Status: done

## Story

As Bob,
I want the Dev Console to show current-state reconciliation and next-lane authority readiness,
so that I can see stale-doc risk, blocked authority, and next safe work without reading every planning file.

## Acceptance Criteria

1. Given reconciliation or authority readiness evidence exists, when Bob opens the Dev Console, then the relevant controls or work-item surface shows stale artifact findings, current authority status, required approval, related docs, and next safe action.
2. Given a lane remains blocked, when the UI renders it, then the UI does not show execution controls or imply autonomous authority and it uses disabled/blocked or approval-required language rather than approved/executable language.
3. Given reconciliation report fields change, when dashboard/report regression checks run, then they prove the report remains visible, bounded, and aligned with current stop lines.
4. Given Story 11.3 created a next-lane authority decision packet, when the Dev Console shows next-lane readiness, then it links or summarizes the packet without treating the recommendation as approval.
5. Given PR #103 remains externally review-gated, when current-state reconciliation is shown, then the UI distinguishes green CI, blocked merge state, local story completion, stacked-branch merge, and merged-to-main state.

## Tasks / Subtasks

- [x] Add or extend read-only supervisor report data for current-state reconciliation and next-lane readiness. (AC: 1, 4, 5)
  - [x] Prefer extending an existing read-only report if a suitable surface already exists.
  - [x] If a new report is needed, add shared contract, supervisor schema, API route, report catalog entry, and dashboard client function.
  - [x] Include stale artifact findings, current authority status, required approvals, related docs/reports, PR #103 state language, next safe action, and stop lines.
  - [x] Include Story 11.3 decision-packet reference and state that it is decision-only and no lane is selected or authorized.
- [x] Render the Dev Console surface. (AC: 1-5)
  - [x] Add a Controls page panel or extend an existing panel to show reconciliation status and next-lane readiness.
  - [x] Keep blocked/approval-required lanes visually and textually distinct from approved or executable states.
  - [x] Do not add execution controls for provider calls, process launch, premium execution, adaptive scoring, GitHub delivery, cleanup, source mutation, credentials, issue sync, or failed-check bypass.
  - [x] Keep the panel compact enough for repeated scanning; link to the packet and related reports/docs.
- [x] Add regression coverage. (AC: 1-5)
  - [x] Add or update supervisor integration tests for the report data and read-only/no-mutation behavior.
  - [x] Add or update dashboard e2e assertions proving the panel is visible and shows blocked/approval-required language, related docs, next safe action, and decision-only stop lines.
  - [x] Add or update a drift check if a new report or stable dashboard surface is introduced.
- [x] Update docs and story evidence. (AC: 1-5)
  - [x] Add Story 11.4 to `docs/stories/index.md`.
  - [x] Update architecture reconciliation if a new report or panel becomes the current Dev Console surface for next-lane readiness.
  - [x] Record verification commands in the Dev Agent Record.
  - [x] Update Completion Notes, File List, and Change Log when implementation is complete.

## Dev Notes

### Source Context

- Story 11.1 reconciled stale planning/status claims.
- Story 11.2 refreshed the authority readiness matrix and added `evidence_ready_approval_required` wording for GitHub delivery to avoid implying permission.
- Story 11.3 created `docs/goals/epic-11-next-lane-authority-decision-packet-2026-06-13.md` as a decision-only comparison packet. It recommends adaptive scoring decision preparation only as a lane for Bob to consider approving; no lane is selected or authorized.
- PR #103 is the outer Epic 10 delivery PR to `main`. After Story 11.3 merged into its branch, PR #103 CI passed on 2026-06-13, but GitHub still reported `mergeStateStatus=BLOCKED` with only a COMMENTED Codex review. Re-check before showing current PR state.

### Existing Implementation To Reuse

- Controls page:
  - `apps/dashboard/src/app/controls/page.tsx`
  - `apps/dashboard/src/lib/supervisor.ts`
  - `apps/dashboard/src/lib/report-shortcuts.ts`
- Authority readiness matrix:
  - `packages/contracts/src/api.ts`
  - `services/supervisor/src/supervisor/api/schemas.py`
  - `services/supervisor/src/supervisor/application/service.py`
  - `apps/dashboard/src/components/authority-readiness-matrix-report-panel.tsx`
  - `scripts/check-authority-readiness-matrix-report.mjs`
- Report catalog and runtime evidence patterns:
  - `scripts/check-supervisor-report-catalog.mjs`
  - `scripts/check-runtime-evidence-export.mjs`
  - `services/supervisor/tests/integration/test_routing_preview.py`
  - `tests/e2e/dashboard.spec.ts`
- Story 11.3 packet:
  - `docs/goals/epic-11-next-lane-authority-decision-packet-2026-06-13.md`

### Architecture And Safety Boundaries

- This story is read-only visibility and regression coverage. It must not execute provider calls, launch subscription-agent processes, perform premium execution, compute adaptive scores, mutate GitHub, merge PRs, delete worktrees, delete branches, sync issues, access credentials, mutate source by workers, bypass failed checks, or grant broad autonomy.
- The UI must not present action buttons that start an authority lane.
- Decision-packet links must be labelled as decision-only or approval-required.
- Evidence remains metadata-only. Do not add raw prompts, completions, reasoning traces, provider payloads, secrets, raw stdout/stderr, or unbounded command output.

### Implementation Guidance

- Start with inventory:
  - `rg -n "reconciliation|authority-readiness-matrix-report|decision packet|report catalog|controls#|nextSafeActions|Story 11.3" services apps scripts tests docs`
- Prefer a small read-only report/panel slice over broad dashboard refactoring.
- If adding a new report, keep report ID, endpoint, dashboard anchor, report shortcut, report catalog, e2e, integration, and drift check aligned.
- If extending the existing authority readiness matrix, avoid overloading it with stale artifact findings unless the data remains clear and testable.

### Testing

Minimum focused verification:

- `pnpm.cmd --filter @kendall/dashboard build`
- `pnpm.cmd run check:docs`

Run any touched drift check, likely one or more of:

- `pnpm.cmd run check:authority-readiness`
- `pnpm.cmd run check:reports`
- `pnpm.cmd run check:runtime-export`
- `pnpm.cmd run check:e2e-report`

Run targeted supervisor tests if API/report data changes:

- `services\supervisor\.venv\Scripts\python.exe -m pytest services\supervisor\tests\integration\test_routing_preview.py -k reconciliation -p no:cacheprovider`

Broaden before PR:

- `pnpm.cmd run check`

## References

- `_bmad-output/planning-artifacts/epics.md`
- `docs/stories/11-1-reconcile-planning-status-after-epic-10-delivery.md`
- `docs/stories/11-2-refresh-authority-readiness-matrix-from-current-evidence.md`
- `docs/stories/11-3-create-next-lane-authority-decision-packet.md`
- `docs/goals/epic-11-next-lane-authority-decision-packet-2026-06-13.md`
- `docs/architecture/kendall-vnxt-implementation-gap-reconciliation-2026-06-08.md`

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- Story created through `bmad-create-story` from Epic 11 backlog after Story 11.3 merged via PR #107 into the Epic 10 delivery branch.
- Focused authority readiness drift check passed: `pnpm.cmd run check:authority-readiness`.
- Focused supervisor report integration passed: `services\supervisor\.venv\Scripts\python.exe -m pytest services\supervisor\tests\integration\test_routing_preview.py -k authority_readiness_matrix_report -p no:cacheprovider`. Pytest emitted a Windows temp cleanup permission warning after success.
- Dashboard build passed: `pnpm.cmd --filter @kendall/dashboard build`.
- Documentation verification passed: `pnpm.cmd run check:docs`.
- Full regression passed: `pnpm.cmd run check`, including dashboard build and 195 supervisor tests with one existing aiosqlite deprecation warning.
- Post-review focused authority readiness drift check passed: `pnpm.cmd run check:authority-readiness`.
- Post-review focused supervisor report integration passed: `services\supervisor\.venv\Scripts\python.exe -m pytest services\supervisor\tests\integration\test_routing_preview.py -k authority_readiness_matrix_report -p no:cacheprovider`. Pytest emitted the known Windows temp cleanup permission warning after success.
- Post-review dashboard build passed: `pnpm.cmd --filter @kendall/dashboard build`.
- Post-review documentation verification passed: `pnpm.cmd run check:docs`.
- Post-review full regression passed: `pnpm.cmd run check`, including dashboard build and 195 supervisor tests with one existing aiosqlite deprecation warning.

### Completion Notes List

- Extended the existing authority readiness matrix report instead of creating a second authority-state source of truth.
- Added current-state reconciliation findings for planning reconciliation and PR #103 CI-green/external-review-blocked state.
- Added next-lane decision packet metadata to the report, including decision-only status, approval-required flag, no-authority-granted flag, freshness requirement, related docs, stop lines, and next action.
- Updated the Dev Console authority readiness panel to show current-state reconciliation and next-lane authority packet sections without adding execution controls.
- Expanded authority readiness drift, supervisor integration, and dashboard e2e assertions for the new report fields and UI text.
- Patched BMAD code-review findings by adding stale-payload UI fallback, blocked execution wording, packet boolean invariant validation, explicit PR #103 local/stacked/main-state evidence, and report catalog scope alignment.

### Review Findings

- BMAD code review accepted and patched stale-payload UI fallback, approval/blocked wording, explicit PR #103 local/stacked/main-state evidence, matching regression assertions, and report catalog scope alignment.
- Deferred generic string-scan brittleness for the existing authority readiness drift checker; this story tightened the concrete Story 11.4 literals and semantic assertions without replacing the checker framework.

### File List

- `apps/dashboard/src/components/authority-readiness-matrix-report-panel.tsx`
- `docs/stories/11-4-show-reconciliation-and-next-lane-readiness-in-dev-console.md`
- `docs/stories/index.md`
- `packages/contracts/src/api.ts`
- `scripts/check-authority-readiness-matrix-report.mjs`
- `services/supervisor/src/supervisor/api/schemas.py`
- `services/supervisor/src/supervisor/application/service.py`
- `services/supervisor/tests/integration/test_routing_preview.py`
- `tests/e2e/dashboard.spec.ts`

## Change Log

- 2026-06-13: Created Story 11.4 and moved it to ready-for-dev.
- 2026-06-13: Implemented Dev Console reconciliation and next-lane readiness visibility, verified full regression, and moved Story 11.4 to review.
- 2026-06-13: Completed BMAD code review remediation, verified full regression, and moved Story 11.4 to done.
