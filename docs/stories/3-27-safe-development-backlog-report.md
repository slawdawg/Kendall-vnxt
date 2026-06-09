# Story 3.27: Safe Development Backlog Report

Date: 2026-06-09
Status: ready for review

## Goal

Expose a read-only safe development backlog that helps future work choose larger coherent slices while execution-authority stories remain blocked.

## Scope

- Add `GET /supervisor/safe-development-backlog`.
- Add shared contract types for prioritized safe backlog items.
- Add a controls-page safe backlog panel.
- Add the report to the supervisor report catalog and runtime evidence export references.
- Track ready maintenance/report/verification/evidence-polish items separately from blocked execution-authority work.
- Surface recommended slice size so future PRs batch API, dashboard, docs, and tests when related.

## Safety Boundary

This report is planning and maintenance guidance only. It does not approve:

- local provider or model calls,
- subscription-agent process launch,
- premium execution,
- worker shell commands,
- worker source mutation,
- network access,
- credential access.

## Acceptance Criteria

- The safe backlog report returns read-only prioritized items with evidence, related reports, related docs, blockers, and next actions.
- Ready items recommend medium-to-large or large slices.
- Blocked execution-authority work stays marked `blocked_pending_explicit_approval` and `do_not_start`.
- Reading the report does not add workflow events or mutate work items.
- The report catalog, runtime evidence exports, and controls page reference the new report.
- Focused supervisor and dashboard e2e tests cover the new behavior.

## Verification

- `pnpm run check:docs`
- `pnpm run test:supervisor -- tests/integration/test_routing_preview.py -k "safe_development_backlog or report_catalog or runtime_evidence_export"`
- `pnpm run test:e2e:dashboard:controls`
- `pnpm run check`
