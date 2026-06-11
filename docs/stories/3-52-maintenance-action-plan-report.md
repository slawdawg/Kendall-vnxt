# Story 3.52: Maintenance Action Plan Report

Date: 2026-06-09
Status: done

## Goal

Add a read-only maintenance action plan report that consolidates the next safe work steps, related evidence links, verification commands, dashboard anchors, and authority stop lines so future development can proceed in larger coherent slices without enabling execution authority.

## Scope

- Add `GET /supervisor/maintenance-action-plan-report`.
- Add shared contracts, supervisor schemas, and service construction for action plan steps.
- Render the report on the controls page.
- Add report catalog, runtime evidence export, report-shortcut, supervisor test, browser test, and static drift-check coverage.
- Add `pnpm run check:maintenance-action-plan` to the full verification chain.

## Safety Boundary

This is read-only planning and evidence navigation. It does not approve:

- subscription-agent process launch,
- local or remote provider/model calls,
- premium execution,
- arbitrary worker shell commands,
- worker source mutation,
- worker network access,
- credential access.

## Acceptance Criteria

- The API exposes `maintenance-action-plan-report-v1` without mutating work items or workflow events.
- The report includes steps for selecting larger safe slices, verifying evidence surfaces, running verification, and preserving authority stop lines.
- The controls page renders the report with verification commands and dashboard anchors.
- Runtime evidence export and report catalog include the new report.
- Verification readiness lists `pnpm run check:maintenance-action-plan`.
- Full `pnpm run check` includes the new static drift check.

## Verification

- `pnpm run check:maintenance-action-plan`
- `pnpm run check:verification-readiness`
- `pnpm run check:reports`
- `pnpm run check:runtime-export`
- `pnpm run check:runbooks`
- `pnpm run test:supervisor -- tests/integration/test_routing_preview.py -k "maintenance_action_plan or supervisor_report_catalog or verification_readiness or runtime_evidence_export"`
- `pnpm run test:e2e:dashboard:controls`
- `pnpm run check`
