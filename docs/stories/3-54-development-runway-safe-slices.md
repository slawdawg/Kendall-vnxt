# Story 3.54: Development Runway Safe Slices

Date: 2026-06-09
Status: ready for review

## Goal

Add a read-only development runway report that groups safe backlog, maintenance action plan, verification readiness, and authority blocker evidence into larger PR-sized work slices.

## Scope

- Add `GET /supervisor/development-runway-report`.
- Add shared contracts, supervisor schemas, and service construction for development runway slices.
- Render the larger PR slice planner on the controls page.
- Add report catalog, runtime evidence export, report-shortcut, supervisor test, browser test, runbook, and static drift-check coverage.
- Add `pnpm run check:development-runway` to the full verification chain.

## Safety Boundary

This is read-only planning and evidence navigation. It does not approve:

- local or remote provider/model calls,
- subscription-agent process launch,
- premium execution,
- worker shell commands,
- worker source mutation,
- worker network access,
- credential access,
- worker remote delivery automation.

## Acceptance Criteria

- The API exposes `development-runway-report-v1` without mutating work items or workflow events.
- The report includes report/evidence navigation, verification/runbook hardening, and authority-blocker maintenance slices.
- The report states the larger PR planning rule and minimum PR scope.
- The controls page renders runway slices, PR scope rule, verification chain, dashboard anchors, stop lines, and next safe actions.
- Runtime evidence export and report catalog include the new report.
- Verification readiness lists `pnpm run check:development-runway`.
- Full `pnpm run check` includes the new static drift check.

## Verification

- `pnpm run check:development-runway`
- `pnpm run check:verification-readiness`
- `pnpm run check:reports`
- `pnpm run check:runtime-export`
- `pnpm run check:docs`
- `pnpm run check:runbooks`
- `pnpm run test:supervisor -- tests/integration/test_routing_preview.py -k "development_runway or supervisor_report_catalog or verification_readiness or runtime_evidence_export"`
- `pnpm run test:e2e:dashboard:controls`
- `pnpm run check`
