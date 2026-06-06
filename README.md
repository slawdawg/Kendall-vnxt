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

Important environment variables:

- `NEXT_PUBLIC_SUPERVISOR_URL`: browser-visible supervisor base URL
- `SUPERVISOR_INTERNAL_URL`: server-side dashboard fetch URL for the supervisor
- `SUPERVISOR_DATABASE_URL`: SQLite by default for local use, PostgreSQL supported via `asyncpg`
- `SUPERVISOR_CORS_ORIGINS`: comma-separated allowed dashboard origins for browser calls and SSE

## Verification

- `pnpm run check` builds the dashboard and runs supervisor integration tests
- `pnpm run test:e2e:dashboard` runs browser coverage for intake drafts, workflow actions, and detail navigation
- `pnpm run lint:dashboard` runs the dashboard lint pass
- `pnpm run preflight` checks that shared JS deps and the supervisor virtualenv are ready
- `pnpm run doctor` is an alias for `preflight`

## Planning

- Current implementation checkpoint: [docs/implementation-checkpoint-2026-06-06.md](docs/implementation-checkpoint-2026-06-06.md)

## Why pnpm

This repo uses a `pnpm` workspace so JS dependencies come from a shared global store instead of being re-downloaded per worktree. Fresh worktrees still need `pnpm run setup`, but the JS install is mostly local linking and reuse rather than a full reinstall.

## Setup Commands

- `pnpm run setup` installs workspace dependencies and syncs the supervisor virtualenv
- `pnpm run setup:js` installs the JS workspace only
- `pnpm run setup:py` syncs the supervisor virtualenv only
- `pnpm run doctor` confirms the local Node/dependency/runtime setup is usable

## Container stack

`docker compose up --build` starts:

- PostgreSQL on `localhost:5432`
- supervisor on `localhost:8000`
- dashboard on `localhost:3000`
