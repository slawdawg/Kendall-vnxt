# Story 3.44: Delivery Readiness Policy Report

Date: 2026-06-09
Status: done

## Goal

Expose a read-only supervisor report for the managed recipe delivery readiness gate so operators can review PR, CI, merge, and waiver rules without triggering remote delivery or mutating work-item readiness metadata.

## Scope

- Add `GET /supervisor/delivery-readiness-policy-report`.
- Add shared contract and supervisor schema types for the report.
- Render the report on the controls page.
- Add the report to the supervisor report catalog, runtime evidence export references, safe backlog references, and stable report shortcuts.
- Extend report catalog, runtime export, safe backlog, supervisor integration, and controls-page browser checks.
- Refresh architecture status through Story 3.44.

## Safety Boundary

This report is read-only. It does not approve:

- remote delivery automation,
- GitHub writes,
- worker execution,
- local provider or model calls,
- subscription-agent process launch,
- premium execution,
- worker shell commands,
- worker source mutation,
- worker network access,
- credential access.

## Acceptance Criteria

- The report documents PR, CI, merge, and local-only waiver rules.
- The report states delivery readiness must be recorded through the work-item checkpoint form.
- The report states local-only waiver evidence is not remote PR, CI, or merge evidence.
- Reading the report does not mutate work-item events.
- The report appears in the supervisor report catalog and controls page.
- Runtime evidence export references the report endpoint and Story 3.44.
- Static drift checks require the report endpoint, dashboard fetch, controls anchor, and story evidence.
- `pnpm run check` passes.

## Verification

- `pnpm run check:reports`
- `pnpm run check:runtime-export`
- `pnpm run check:safe-backlog`
- `pnpm run check:docs`
- `pnpm run test:supervisor -- tests/integration/test_routing_preview.py -k "report_catalog or runtime_evidence_export or safe_development_backlog or delivery_readiness_policy_report"`
- `pnpm run test:e2e:dashboard:controls`
- `pnpm run check`
