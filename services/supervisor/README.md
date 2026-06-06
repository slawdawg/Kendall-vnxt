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

`uv sync --directory services/supervisor` keeps the local virtualenv aligned with `services/supervisor/uv.lock`.
