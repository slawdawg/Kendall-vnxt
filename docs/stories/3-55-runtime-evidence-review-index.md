# Story 3.55: Runtime Evidence Review Index

Date: 2026-06-09
Status: done

## Goal

Add a read-only runtime evidence review report that indexes work-item runtime exports, review priority, evidence counts, related reports, and safe review actions.

## Scope

- Add `GET /supervisor/runtime-evidence-review-report`.
- Add shared contracts, supervisor schemas, and service construction for work-item evidence review entries.
- Render the work-item evidence queue on the controls page.
- Add report catalog, runtime evidence export, report-shortcut, supervisor test, browser test, runbook, and static drift-check coverage.
- Add `pnpm run check:runtime-review` to the full verification chain.

## Safety Boundary

This is read-only review navigation. It does not approve:

- local or remote provider/model calls,
- subscription-agent process launch,
- premium execution,
- worker shell commands,
- worker source mutation,
- worker network access,
- credential access,
- worker remote delivery automation.

## Acceptance Criteria

- The API exposes `runtime-evidence-review-report-v1` without mutating work items or workflow events.
- The report lists work items with runtime export links, attempt counts, event counts, review priority, review reason, and recommended action.
- The report includes a bounded review queue for the highest-priority items.
- The controls page renders the work-item evidence queue, related reports, dashboard anchors, stop lines, and next safe actions.
- Runtime evidence export and report catalog include the new report.
- Verification readiness lists `pnpm run check:runtime-review`.
- Full `pnpm run check` includes the new static drift check.

## Verification

- `pnpm run check:runtime-review`
- `pnpm run check:verification-readiness`
- `pnpm run check:reports`
- `pnpm run check:runtime-export`
- `pnpm run check:docs`
- `pnpm run check:runbooks`
- `pnpm run test:supervisor -- tests/integration/test_routing_preview.py -k "runtime_evidence_review or supervisor_report_catalog or verification_readiness or runtime_evidence_export"`
- `pnpm run test:e2e:dashboard:controls`
- `pnpm run check`
