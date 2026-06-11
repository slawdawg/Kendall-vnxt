# Story 3.21: Dashboard Detail E2E Runner

Date: 2026-06-08
Status: done

## Goal

Make focused work-item detail browser verification reliable from Windows Codex sessions without relying on fragile raw Playwright arguments or web-server teardown behavior.

## Scope

- Add `pnpm run test:e2e:dashboard:detail`.
- Add `scripts/run-detail-e2e.mjs` with owned supervisor and dashboard server lifecycle.
- Use repo-local Playwright, uv, and temp cache defaults.
- Run the work-item detail/runtime-export Playwright slice with stable test-file and grep arguments.
- Surface the focused command in the verification readiness report and controls-page coverage.
- Update story and architecture indexes.

## Safety Boundary

This story is verification infrastructure only. It does not approve local provider/model calls, launch subscription-agent processes, enable premium execution, run worker commands, mutate worker source, grant network access, or read credentials.

## Acceptance Criteria

- The detail e2e package script exists.
- The runner starts supervisor and dashboard locally, waits for readiness, runs the focused detail test, and tears down child process trees.
- The verification readiness report lists the focused detail command.
- Dashboard controls e2e coverage shows the detail command in the verification readiness panel.
- `pnpm run test:e2e:dashboard:detail` passes.
- `pnpm run check` passes.

## Verification

- `pnpm run test:e2e:dashboard:detail`
- `pnpm run test:e2e:dashboard:controls`
- `pnpm run check`
