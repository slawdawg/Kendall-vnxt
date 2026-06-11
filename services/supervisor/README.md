# Supervisor Service

FastAPI service for work-item intake, workflow state transitions, audit routing, and operator-facing event history.

## Run

From the repo root:

```bash
pnpm run setup
pnpm run dev:supervisor
```

## Verification

```bash
pnpm run test:supervisor
```

Use `pnpm run test:supervisor -- <pytest args>` for focused checks. The wrapper and pytest config disable pytest cache writes and default collection to `tests`, which keeps generated temp/cache paths from blocking Windows worktree cleanup.

`uv sync --directory services/supervisor` keeps the local virtualenv aligned with `services/supervisor/uv.lock`.
