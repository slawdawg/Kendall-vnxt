# Story 3.18: Supervisor Report Catalog

Date: 2026-06-08
Status: ready for review

## Goal

Provide a single read-only catalog that maps supervisor report endpoints, dashboard report surfaces, related documentation, and execution-authority stop lines.

## Scope

- Add `GET /supervisor/report-catalog`.
- Add contract types and a controls-page `SupervisorReportCatalogPanel`.
- Index execution readiness, documentation authority, verification readiness, disabled provider proof, execution state boundary, threat boundary, and disabled configuration report endpoints.
- Link runtime evidence exports to the report catalog and newer report endpoints.
- Cover the endpoint and dashboard panel with focused tests.

## Safety Boundary

This story is reporting-only. It does not approve execution authority, start worker processes, call local or remote providers, enable premium execution, run commands through workers, mutate worker source, grant network access, or read credentials.

## Acceptance Criteria

- The catalog endpoint returns all current supervisor report endpoints as read-only entries.
- Every catalog entry reports `executionAuthorityApproved=false`.
- Reading the catalog does not add workflow events or mutate work items.
- The controls page shows a concise supervisor evidence map with report endpoints and stop lines.
- Runtime evidence exports reference the catalog and current read-only report endpoints.
- Focused supervisor and dashboard e2e tests cover the new behavior.

## Verification

- `pnpm run check:docs`
- `services\supervisor\.venv\Scripts\python.exe -m pytest services\supervisor\tests\integration\test_routing_preview.py -k "report_catalog or runtime_evidence_export"`
- `pnpm --filter @kendall/dashboard build`
- `pnpm run test:e2e:dashboard:controls`
- `pnpm run check`
