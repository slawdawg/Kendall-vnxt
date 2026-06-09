# Story 3.34: Report Shortcuts In Evidence Overview

Date: 2026-06-09
Status: ready for review

## Goal

Surface runtime export related supervisor reports in the work-item evidence overview so operators can jump from item-level evidence to the controls-page report catalog without enabling execution authority.

## Scope

- Render a compact report shortcut section in `EvidenceOverviewPanel`.
- Use `RuntimeEvidenceExportBoundaryView.relatedSupervisorReports` as the source of report shortcuts.
- Link shortcuts and the catalog action to the controls page, where the supervisor report catalog is already rendered.
- Extend the supervisor report catalog drift check so it protects evidence-overview report shortcut rendering.
- Add focused dashboard detail e2e assertions.
- Surface this story in safe backlog evidence and runtime export git-backed evidence.

## Safety Boundary

This is read-only navigation polish. It does not approve:

- local provider or model calls,
- subscription-agent process launch,
- premium execution,
- worker shell commands,
- worker source mutation,
- network access,
- credential access.

## Acceptance Criteria

- The work-item evidence overview renders report shortcuts from runtime export related supervisor reports.
- The overview includes an `Open catalog` action to the controls page.
- Detail-page browser coverage asserts representative report shortcuts and the catalog action.
- `pnpm run check:reports` protects the overview shortcut integration.
- Runtime evidence export references this story as git-backed evidence.
- `pnpm run check` passes.

## Verification

- `pnpm run check:reports`
- `pnpm run check:safe-backlog`
- `pnpm run test:supervisor -- tests/integration/test_routing_preview.py -k "safe_development_backlog or runtime_evidence_export"`
- `pnpm run test:e2e:dashboard:detail`
- `pnpm run check`
