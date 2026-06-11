# Story 3.14: Dashboard Evidence Overview Polish

Status: done
## Status

Ready for Review

## Story

As the Kendall_vNxt operator,
I want a compact evidence overview on work-item detail pages,
so that routing, attempt, runtime export, and workflow history evidence is faster to review without adding execution controls.

## Acceptance Criteria

1. Work-item detail pages include a read-only evidence overview panel.
2. The panel links to existing routing, attempts, runtime export, and workflow history sections.
3. The panel summarizes selected lane, attempt count/latest status, export event count, disabled authority flags, workflow event count, and related report count.
4. The panel clearly states that it has no execution controls.
5. Existing detailed evidence panels remain available.
6. E2E coverage asserts the overview renders on the work-item detail page.
7. No provider calls, process launch, command execution, source mutation, network access, credential access, premium execution, adaptive scoring, or background runtime assistant behavior is enabled.

## Implementation Notes

- Added `EvidenceOverviewPanel`.
- Rendered it on work-item detail pages before detailed routing/attempt/export panels.
- Extended existing Playwright detail-page coverage.

## Verification

- Dashboard build.
- Full workspace check.
- `git diff --check`.

## Safety Gates Upheld

- Read-only dashboard polish only.
- No supervisor execution behavior changed.
