# Story 3.61: Maintenance Action Evidence Links

Date: 2026-06-09
Status: ready for review

## Goal

Render maintenance action plan related reports and related docs so each safe maintenance step links directly to its supporting evidence.

## Scope

- Render step-level related report links through shared controls-page report shortcuts.
- Render step-level related docs in the maintenance action plan panel.
- Extend supervisor integration, dashboard browser, maintenance action drift, runtime export drift, documentation, and story evidence coverage.
- Refresh architecture and story indexes through Story 3.61.

## Safety Boundary

This is read-only evidence navigation. It does not approve:

- local or remote provider/model calls,
- subscription-agent process launch,
- premium execution,
- worker shell commands,
- worker source mutation,
- worker network access,
- credential access,
- worker remote delivery automation.

## Acceptance Criteria

- Maintenance action steps render `Related reports` with links to controls-page report anchors.
- Maintenance action steps render `Related docs` from the existing API data.
- `pnpm run check:maintenance-action-plan` fails if panel links, browser assertions, supervisor assertions, or story evidence drift.
- Runtime evidence export story evidence includes Story 3.61.

## Verification

- `pnpm run check:maintenance-action-plan`
- `pnpm run check:runtime-export`
- `pnpm run check:docs`
- `pnpm run test:supervisor -- tests/integration/test_routing_preview.py -k "maintenance_action_plan"`
- `pnpm run test:e2e:dashboard:controls`
- `pnpm run check`

## Epic 6 MVP Proof Trial Evidence

Approved trial scope: one bounded Codex implementation in an isolated local worktree for this story only.

Trial worktree:

```text
C:\Users\slaw_dawg\.codex-workspaces\slawdawg-kendall-vnxt\worktrees\20260611-epic-6-mvp-proof-trial-for-docs-stories-3-61-mai
```

Trial branch:

```text
codex/epic-6-mvp-proof-trial-for-docs-stories-3-61-mai
```

Pre-implementation drift check:

```text
pnpm.cmd run check:maintenance-action-plan
```

Result: passed. The existing maintenance action evidence-link implementation is aligned with the story acceptance criteria before any remote delivery, Claude review, cleanup, or autonomy authority.
