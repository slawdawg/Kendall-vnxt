# Story 3.33: Evidence Overview Review Shortcuts

Date: 2026-06-09
Status: ready for review

## Goal

Surface runtime evidence review navigator shortcuts in the work-item evidence overview so operators can begin read-only review from the top of the detail page.

## Scope

- Render runtime export `reviewNavigator` items inside `EvidenceOverviewPanel`.
- Keep the shortcuts read-only and anchored to existing evidence sections.
- Assert the shortcuts in focused dashboard detail e2e coverage.
- Extend the runtime evidence export drift check to require navigator coverage in both the runtime export panel and the overview panel.
- Surface this story in safe backlog evidence and runtime export git-backed evidence.

## Safety Boundary

This is dashboard review polish only. It does not approve:

- local provider or model calls,
- subscription-agent process launch,
- premium execution,
- worker shell commands,
- worker source mutation,
- network access,
- credential access.

## Acceptance Criteria

- The work-item evidence overview renders runtime export review shortcuts.
- The overview shows the navigator count and the runtime state, authority boundary, and git-backed evidence shortcuts.
- Detail-page browser coverage asserts the shortcuts.
- `pnpm run check:runtime-export` protects overview rendering of runtime navigator items.
- Runtime evidence export references this story as git-backed evidence.
- `pnpm run check` passes.

## Verification

- `pnpm run check:runtime-export`
- `pnpm run check:safe-backlog`
- `pnpm run test:supervisor -- tests/integration/test_routing_preview.py -k "safe_development_backlog or runtime_evidence_export"`
- `pnpm run test:e2e:dashboard:detail`
- `pnpm run check`
