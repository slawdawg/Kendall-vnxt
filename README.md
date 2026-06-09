# Kendall_Nxt

Codex-first BMAD supervisor prototype with:

- `apps/dashboard` for the operator control plane
- `services/supervisor` for queue/state/orchestration
- `packages/contracts` for shared transport vocabulary
- `packages/workflow-core` for workflow semantics support

## Local run

1. Use Node `22.13.0+` by default (`.node-version` is included for toolchains that honor it).
2. One-time on a fresh machine: `corepack enable`
3. `pnpm run setup`
4. `pnpm run preflight`
5. Copy `.env.example` to `.env` if you want to override defaults.
6. `pnpm run dev:supervisor`
7. `pnpm run dev:dashboard`

Default local URLs:

- dashboard: `http://localhost:3000`
- supervisor API: `http://localhost:8000`

By default, the dev and start commands bind to `0.0.0.0`, so the dashboard is reachable from the VM's LAN IP and Tailscale IP as well as localhost.

Important environment variables:

- `NEXT_PUBLIC_SUPERVISOR_URL`: browser-visible supervisor base URL
- `SUPERVISOR_INTERNAL_URL`: server-side dashboard fetch URL for the supervisor
- `SUPERVISOR_DATABASE_URL`: SQLite by default for local use, PostgreSQL supported via `asyncpg`
- `SUPERVISOR_CORS_ORIGINS`: comma-separated allowed dashboard origins for browser calls and SSE
- `SUPERVISOR_CORS_ORIGIN_REGEX`: regex fallback for browser origins such as LAN IPs or Tailscale hostnames on port `3000`

## Verification

- `pnpm run check` builds the dashboard and runs supervisor integration tests
- `pnpm run check:docs` verifies documentation indexes and blocked execution-authority story references
- `pnpm run test:e2e:dashboard` runs browser coverage for intake drafts, workflow actions, and detail navigation
- `pnpm run test:e2e:dashboard:controls` runs the focused controls-page browser slice with repo-local Playwright cache defaults
- `pnpm run lint:dashboard` runs the dashboard lint pass
- `pnpm run preflight` checks that shared JS deps and the supervisor virtualenv are ready
- `pnpm run doctor` is an alias for `preflight`

Playwright starts the dashboard with `next dev` for faster browser-test startup. `pnpm run check` remains the production-build gate.

## Planning

- Current architecture index: [docs/architecture/index.md](docs/architecture/index.md)
- Current PRD index: [docs/prds/index.md](docs/prds/index.md)
- Current story index: [docs/stories/index.md](docs/stories/index.md)
- Current implementation checkpoint: [docs/implementation-checkpoint-2026-06-08-supervisor-dynamic-routing-follow-on.md](docs/implementation-checkpoint-2026-06-08-supervisor-dynamic-routing-follow-on.md)

## Why pnpm

This repo uses a `pnpm` workspace so JS dependencies come from a shared global store instead of being re-downloaded per worktree. Fresh worktrees still need `pnpm run setup`, but the JS install is mostly local linking and reuse rather than a full reinstall.

## Setup Commands

- `pnpm run setup` installs workspace dependencies and syncs the supervisor virtualenv
- `pnpm run setup:js` installs the JS workspace only
- `pnpm run setup:py` syncs the supervisor virtualenv only
- `pnpm run setup:e2e` installs the Chromium browser used by Playwright
- `pnpm run doctor` confirms the local Node/dependency/runtime setup is usable

## Windows startup

- `scripts/windows/Install-KendallNxtStartup.ps1` registers per-user logon tasks for the dashboard, supervisor, and an interactive Codex session.
- `scripts/windows/Start-KendallNxtDashboard.ps1` serves the built dashboard on `0.0.0.0:3000`.
- `scripts/windows/Start-KendallNxtSupervisor.ps1` serves the supervisor API on `0.0.0.0:8000`.
- `scripts/windows/Start-KendallNxtCodex.ps1` starts Codex from the repo root and points the terminal at `docs/handoffs/current.md`.
- `scripts/windows/Launch-KendallNxtAtLogon.vbs` is suitable for the Windows Startup folder when you want a hidden per-user logon launcher.
- Logs are written to `.data/logs/`.

## Container stack

`docker compose up --build` starts:

- PostgreSQL on `localhost:5432`
- supervisor on `localhost:8000`
- dashboard on `localhost:3000`
