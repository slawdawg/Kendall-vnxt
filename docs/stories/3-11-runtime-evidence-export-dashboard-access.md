# Story 3.11: Runtime Evidence Export Dashboard Access

## Status

Ready for Review

## Story

As the Kendall_vNxt operator,
I want runtime evidence export summaries visible on the work-item detail page,
so that attempt, event, boundary, safety, and readiness report evidence is reviewable without leaving the dashboard or adding execution controls.

## Acceptance Criteria

1. Dashboard data access can retrieve a work item's runtime evidence export.
2. Work-item detail pages include a read-only runtime evidence export panel.
3. The panel shows export format, attempt count, event count, generated timestamp, and export-only status.
4. The panel shows disabled safety flags for process launch, provider calls, model calls, premium execution, commands, source mutation, network access, and credentials.
5. The panel shows related supervisor report references.
6. The panel shows git-backed boundary evidence references.
7. Sticky work-item navigation includes an Export anchor.
8. E2E coverage proves the export panel is reachable and shows readiness report references.
9. No execution, provider enablement, command, mutation, network, credential, premium, adaptive scoring, or background controls are added.

## Implementation Notes

- Added dashboard supervisor client access for runtime evidence exports.
- Added `RuntimeEvidenceExportPanel`.
- Rendered the panel on work-item detail pages near routing and attempt evidence.
- Added Playwright coverage to the existing execution attempt evidence test.

## Verification

- Dashboard build.
- Full workspace check.
- `git diff --check`.

## Safety Gates Upheld

- The panel is read-only.
- No supervisor execution behavior changed.
- No worker authority was enabled.
