# Kendall_Nxt

Codex-first BMAD supervisor prototype with:

- `apps/dashboard` for the operator control plane
- `services/supervisor` for queue/state/orchestration
- `packages/contracts` for shared transport vocabulary
- `packages/workflow-core` for workflow semantics support

## Local run

1. `npm install`
2. `uv sync --directory services/supervisor`
3. Copy `.env.example` to `.env` if you want to override defaults.
4. `npm run dev:supervisor`
5. `npm run dev:dashboard`

Default local URLs:

- dashboard: `http://localhost:3000`
- supervisor API: `http://localhost:8000`

Important environment variables:

- `NEXT_PUBLIC_SUPERVISOR_URL`: browser-visible supervisor base URL
- `SUPERVISOR_INTERNAL_URL`: server-side dashboard fetch URL for the supervisor
- `SUPERVISOR_DATABASE_URL`: SQLite by default for local use, PostgreSQL supported via `asyncpg`
- `SUPERVISOR_CORS_ORIGINS`: comma-separated allowed dashboard origins for browser calls and SSE

## Verification

- `npm run check` builds the dashboard and runs supervisor integration tests
- `npm run lint:dashboard` runs the dashboard lint pass

## Container stack

`docker compose up --build` starts:

- PostgreSQL on `localhost:5432`
- supervisor on `localhost:8000`
- dashboard on `localhost:3000`
