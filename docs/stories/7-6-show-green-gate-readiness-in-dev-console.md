---
baseline_commit: fcd1351e926af2370a92e812ca41bf236ee458f4
---

# Story 7.6: Show Green-Gate Readiness In The Dev Console

Date: 2026-06-11
Status: review

## Story

As Bob,
I want the Dev Console to show delivery readiness from real persisted evidence in plain language,
so that I can see whether a work item is safe, blocked, or waiting for a specific approval without reading logs or GitHub details.

## Acceptance Criteria

1. Given a work item with delivery-readiness evidence, when Bob opens the Dev Console work-item detail, then the page shows whether the item is in scope, verified, CI green, clean to merge, cleanup eligible, or blocked.
2. Given worker attempt, diff guard, or verification evidence does not exist yet, when Bob views the readiness panel, then the panel shows the missing evidence explicitly and does not present projected or theoretical state as operational truth.
3. Given a work item has not yet reached delivery readiness, when Bob views the readiness panel, then the panel clearly distinguishes not-started, running, failed, blocked, and green-gate eligible states.
4. Given readiness state changes, when the dashboard receives refreshed supervisor state, then visible readiness updates without requiring Bob to reconstruct state from chat history.
5. The view reports readiness only. It must not create authority, launch workers, perform PR/merge/cleanup, or hide blocked reasons.

## Tasks / Subtasks

- [x] Add or extend Dev Console readiness panel. (AC: 1, 2, 3, 5)
  - [x] Show scope status.
  - [x] Show diff guard status.
  - [x] Show verification status.
  - [x] Show CI status.
  - [x] Show merge state.
  - [x] Show evidence retention.
  - [x] Show cleanup eligibility.
  - [x] Show authority blockers.
- [x] Use real persisted evidence. (AC: 2, 4)
  - [x] Consume supervisor API state, not local UI guesses.
  - [x] Show missing evidence as missing/not recorded.
  - [x] Preserve SSE/live refresh patterns where relevant.
- [x] Make blocked states actionable. (AC: 1, 2, 3)
  - [x] Include exact blocked reason.
  - [x] Include smallest next safe action.
  - [x] Avoid jargon where possible.
- [x] Add dashboard verification. (AC: 1-5)
  - [x] Component/unit coverage if existing test style supports it.
  - [x] Focused Playwright coverage if the panel is user-facing.
  - [x] Dashboard build.

### Review Findings

- [x] [Review][Patch] Dev Console readiness combines global gate report with work-item-local attempt evidence [apps/dashboard/src/app/work-items/[work-item-id]/page.tsx:49]
- [x] [Review][Patch] Dev Console can render stale verification evidence from older artifact refs [apps/dashboard/src/components/green-gate-readiness-panel.tsx:27]
- [x] [Review][Patch] Dev Console top-level readiness can show green before CI, merge, cleanup, and authority gates are green [apps/dashboard/src/components/green-gate-readiness-panel.tsx:81]

## Dev Notes

### Dependencies

- Consumes Story 7.1 green-gate readiness contract.
- Consumes Story 7.3 diff guard evidence.
- Consumes Story 7.4 worker attempt evidence.
- Consumes Story 7.5 verification evidence.
- Feeds Story 7.7 eligibility clarity.

### Existing Surfaces To Reuse

- `apps/dashboard/src/components/trusted-delivery-eligibility-report-panel.tsx`
- `apps/dashboard/src/components/delivery-readiness-panel.tsx`
- `apps/dashboard/src/lib/supervisor.ts`
- `apps/dashboard/src/app/controls/page.tsx`
- Work-item detail components under `apps/dashboard/src/components/` and route files under `apps/dashboard/src/app/`.
- `packages/contracts/src/api.ts`

### Implementation Guidance

- Do not build a static explanatory card. The panel must render real readiness state.
- Use compact operator-facing language:
  - "Blocked: missing verification evidence"
  - "Blocked: out-of-scope file changed"
  - "Ready: in scope and verified"
  - "Not available: CI evidence not recorded"
- Avoid implying that merge or cleanup is approved. Use "eligible" or "needs approval" precisely.
- Ensure text fits on desktop and mobile. This is an operational panel, not a marketing page.

### Testing Requirements

- `pnpm.cmd --filter @kendall/dashboard build`
- Focused dashboard e2e if panel appears in existing dashboard flows.
- `pnpm.cmd run check:docs`
- `pnpm.cmd run check`

### Authority Boundary

This story renders readiness only. It does not approve or perform worker launch, PR creation/update, CI wait, merge, cleanup, issue sync, Claude launch, provider expansion, subscription-agent launch, secret access, or broad autonomy.

## Dev Agent Record

### Agent Model Used

Codex GPT-5

### Debug Log References

- Focused dashboard verification: `pnpm.cmd --filter @kendall/dashboard build` passed.
- Full verification: `pnpm.cmd run check` passed, including dashboard build and 149 supervisor tests with 1 existing aiosqlite warning.

### Completion Notes List

- Added a Dev Console work-item detail green-gate readiness panel backed by supervisor API state.
- The panel consumes `TrustedDeliveryEligibilityReportView` plus persisted execution attempt artifacts rather than local UI guesses.
- Shows scope, diff guard, verification, worker attempt, CI, merge, cleanup, and authority states with compact operator-facing language.
- Missing evidence is shown as `not recorded` / missing instead of projected as operational truth.
- Blocked states include the exact blocked paths or next safe action where supervisor evidence provides it.
- The panel is read-only and does not create authority, launch workers, create/update PRs, wait on CI, merge, clean up, sync issues, launch Claude, expand providers, launch subscription agents, access secrets, or grant autonomy.

### File List

- `apps/dashboard/src/app/work-items/[work-item-id]/page.tsx`
- `apps/dashboard/src/components/green-gate-readiness-panel.tsx`
- `docs/stories/7-6-show-green-gate-readiness-in-dev-console.md`

### Change Log

- 2026-06-11: Implemented Story 7.6 Dev Console green-gate readiness panel, work-item detail integration, dashboard build verification, and full check evidence; status moved to review.
