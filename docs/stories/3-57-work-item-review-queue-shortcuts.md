# Story 3.57: Work-Item Review Queue Shortcuts

Date: 2026-06-09
Status: done

## Goal

Surface the current work item's runtime evidence review queue position in the existing evidence overview panel so operators can jump from a work-item detail page to the controls-page runtime review index without treating the queue as approval.

## Scope

- Fetch the existing runtime evidence review report on work-item detail pages.
- Match the current work item to its `RuntimeEvidenceReviewWorkItemView` entry.
- Render read-only review queue priority, reason, evidence counts, recommended action, runtime export link, and controls-page review-index link in `EvidenceOverviewPanel`.
- Extend dashboard e2e and runtime-review static drift coverage for the detail-page shortcut.
- Refresh architecture and story indexes through Story 3.57.

## Safety Boundary

This is evidence navigation only. It does not approve:

- local or remote provider/model calls,
- subscription-agent process launch,
- premium execution,
- worker shell commands,
- worker source mutation,
- worker network access,
- credential access,
- worker remote delivery automation.

## Acceptance Criteria

- Work-item detail pages pass the current item's runtime review queue entry into the evidence overview panel.
- The evidence overview panel renders `Review queue position` and links to `/controls#runtime-evidence-review-report`.
- The panel repeats that review queue shortcuts are not execution-authority approvals.
- `pnpm run check:runtime-review` fails if the detail-page or overview shortcut integration is removed.
- Focused dashboard detail e2e coverage asserts the new shortcut surface.

## Verification

- `pnpm run check:runtime-review`
- `pnpm run check:docs`
- `pnpm run test:e2e:dashboard:detail`
- `pnpm run check`
