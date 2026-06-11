# Story 3.39: Report Shortcut Anchor Polish

Date: 2026-06-09
Status: done

## Goal

Make work-item evidence overview report shortcuts land on the specific controls-page report sections instead of only opening the top of the controls page.

## Scope

- Add stable controls-page anchors for read-only supervisor report panels.
- Map runtime evidence export related report endpoints to the best report anchor in the work-item evidence overview.
- Keep unknown report endpoints falling back to the supervisor report catalog anchor.
- Extend browser coverage and static report-catalog drift checks for the anchor mapping.
- Track the story in safe backlog evidence, runtime evidence export git-backed evidence, story index, and architecture reconciliation.

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

- The controls page exposes stable anchors for report panels.
- Evidence overview report shortcuts link to report-specific `/controls#...` anchors.
- Unknown report endpoints fall back to `/controls#supervisor-report-catalog`.
- Browser coverage asserts report shortcut anchor targets.
- `pnpm run check:reports` protects the mapping and story reference.
- `pnpm run check` passes.

## Verification

- `pnpm run check:reports`
- `pnpm run check:runtime-export`
- `pnpm run check:safe-backlog`
- `pnpm run test:e2e:dashboard:detail`
- `pnpm run test:e2e:dashboard:controls`
- `pnpm run check`
