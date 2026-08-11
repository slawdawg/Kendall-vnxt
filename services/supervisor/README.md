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

Use `pnpm run test:supervisor -- <pytest args>` for focused checks. The wrapper and pytest config disable pytest cache writes and default collection to `tests`, which keeps generated temp/cache paths from blocking worktree cleanup.

`uv sync --directory services/supervisor` keeps the local virtualenv aligned with `services/supervisor/uv.lock`.

For the default-disabled local attestation issuer, observer, and private-socket
setup, see the [Epic 25 local dogfood attestation setup](../../docs/workflows/epic-25-local-dogfood-attestation-setup.md).

The Memory Inbox proposal reader is a separate default-disabled,
content-bearing capability; its enablement, recovery, and handling constraints
are in the [Memory Inbox lifecycle runbook](../../docs/workflows/memory-inbox-lifecycle-migration.md#proposal-reader-capability).
