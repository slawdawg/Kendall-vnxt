# Story 3.65: Runtime Review Evidence Links

Ready for Review

## Goal

Render runtime evidence review related reports, related docs, and dashboard anchors for each queued work item so review decisions can jump directly to supporting read-only evidence.

## Scope

- Add related report, related doc, and dashboard anchor fields to runtime evidence review work-item entries.
- Add report-level related docs to the runtime evidence review report.
- Render runtime review report links through shared controls-page report shortcuts.
- Render related docs and dashboard anchors in runtime review queue cards.
- Extend supervisor integration, controls-page browser, runtime review drift, runtime export drift, documentation, and story evidence coverage.

## Acceptance

- `RuntimeEvidenceReviewWorkItemView` exposes `relatedReports`, `relatedDocs`, and `dashboardAnchors`.
- `RuntimeEvidenceReviewReportView` exposes `relatedDocs`.
- The controls page renders `Related reports`, `Related docs`, and supporting dashboard anchors for runtime review evidence.
- `pnpm run check:runtime-review` fails if contract, service, panel, browser assertion, supervisor assertion, or story evidence drifts.
- Runtime evidence export story evidence includes Story 3.65.

## Verification

- `pnpm run check:runtime-review`
- `pnpm run check:runtime-export`
- `pnpm run check:docs`
- `pnpm run test:supervisor -- tests/integration/test_routing_preview.py -k "runtime_evidence_review"`
- `pnpm run test:e2e:dashboard:controls`
- `pnpm run check`
