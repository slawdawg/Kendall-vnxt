# Story 3.23: Dashboard E2E Runner Lifecycle Helper

Date: 2026-06-09
Status: done

## Goal

Centralize the owned supervisor/dashboard lifecycle used by focused dashboard browser runners so controls and detail verification stay aligned.

## Scope

- Add `scripts/dashboard-e2e-runner.mjs` as the shared focused dashboard e2e lifecycle helper.
- Reduce `scripts/run-controls-e2e.mjs` and `scripts/run-detail-e2e.mjs` to slice declarations.
- Preserve repo-local temp, uv cache, Playwright browser cache, database path, readiness polling, pass detection, and process-tree cleanup behavior.
- Surface the shared helper in the dashboard e2e report evidence and runtime evidence export references.
- Update story and architecture indexes.

## Safety

This is verification infrastructure only. It does not approve:

- local provider or model calls,
- subscription-agent process launch,
- premium execution,
- worker shell commands,
- worker source mutation,
- network access,
- credential access.

## Acceptance

- Focused controls and detail runners both call the shared helper.
- Both focused runners keep owned local server lifecycle and repo-local cache behavior.
- The dashboard e2e report names the shared lifecycle helper as runner evidence.
- Runtime evidence export references this story as git-backed verification evidence.
- Focused controls/detail browser checks pass after the refactor.
- `pnpm run check` passes.

## Verification

- `pnpm run check:docs`
- focused supervisor integration test for `dashboard_e2e_report`
- `pnpm run test:e2e:dashboard:controls`
- `pnpm run test:e2e:dashboard:detail`
- `pnpm run check`
