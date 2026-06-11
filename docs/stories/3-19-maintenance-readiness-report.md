# Story 3.19: Maintenance Readiness Report

Date: 2026-06-08
Status: done

## Goal

Expose a read-only maintenance map that helps future work continue safely while explicit execution-authority stories remain blocked.

## Scope

- Add `GET /supervisor/maintenance-readiness-report`.
- Add contract types and a controls-page `MaintenanceReadinessReportPanel`.
- Track documentation hygiene, verification hygiene, report surface alignment, and authority blocker watch.
- Add the report to the supervisor report catalog and runtime evidence export references.
- Cover the endpoint and controls-page panel with focused tests.

## Safety Boundary

This story is reporting-only. It does not approve local provider/model calls, launch subscription-agent processes, enable premium execution, run worker commands, mutate worker source, grant network access, or read credentials.

## Acceptance Criteria

- The maintenance report returns read-only tracks with evidence, related reports, related docs, and next actions.
- The authority blocker track keeps Ollama and subscription-agent launch work blocked pending explicit approval.
- Reading the report does not add workflow events or mutate work items.
- The controls page shows the maintenance readiness map and stop lines.
- The report catalog and runtime evidence exports reference the new report.
- Focused supervisor and dashboard e2e tests cover the new behavior.

## Verification

- `pnpm run check:docs`
- `services\supervisor\.venv\Scripts\python.exe -m pytest services\supervisor\tests\integration\test_routing_preview.py -k "maintenance_readiness_report or report_catalog or runtime_evidence_export"`
- `pnpm --filter @kendall/dashboard build`
- `pnpm run test:e2e:dashboard:controls`
- `pnpm run check`
