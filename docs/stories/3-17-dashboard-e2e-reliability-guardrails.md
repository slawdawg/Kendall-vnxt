# Story 3.17: Dashboard E2E Reliability Guardrails

Status: ready for review
Date: 2026-06-08

## Goal

Make focused dashboard browser verification easier to run from Windows Codex sessions without relying on user-level uv cache state or fragile ad hoc Playwright arguments.

## Scope

- Configure Playwright web servers with repo-local uv and temp cache defaults.
- Configure Playwright with a repo-local browser cache under `.data/ms-playwright`.
- Launch the supervisor Playwright web server through the repo virtualenv Python on Windows.
- Add `pnpm run setup:e2e` for explicit Chromium installation.
- Start the dashboard Playwright web server through the Next dev server; production build remains covered by `pnpm run check`.
- Launch the dashboard Playwright web server from the app directory with the app-local Next shim on Windows.
- Add `pnpm run test:e2e:dashboard:controls` for the controls-page evidence-report slice with owned server lifecycle management.
- Add `pnpm run test:e2e:dashboard:detail` for the work-item detail/runtime-export slice with owned server lifecycle management.
- Surface the focused command in the verification readiness report.
- Update README verification guidance.
- Keep this as verification infrastructure only.

## Safety Boundary

This story does not change runtime authority. It does not approve:

- local provider/model calls,
- subscription-agent process launch,
- premium execution,
- arbitrary shell execution,
- worker source mutation,
- worker network access,
- worker credential access.

## Acceptance Criteria

- Playwright web servers receive repo-local `UV_CACHE_DIR`, `TEMP`, and `TMP` defaults.
- Playwright browser binaries can be installed under `.data/ms-playwright`.
- Windows Playwright runs supervisor uvicorn without the `uv run` wrapper.
- The setup script for Playwright Chromium exists.
- Playwright browser checks no longer run a production dashboard build during web-server startup.
- Windows Playwright starts the dashboard from `apps/dashboard` instead of a root-level `pnpm exec` wrapper.
- The focused controls-page e2e script exists, manages its own server lifecycle, and is listed by the verification readiness report.
- The focused work-item detail e2e script exists, manages its own server lifecycle, and is listed by the verification readiness report.
- The dashboard controls-page browser test can be invoked through the package script.
- The dashboard detail-page browser test can be invoked through the package script.
- `pnpm run check` continues to pass.
