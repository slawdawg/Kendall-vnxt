# Manager Control Plane Backend Proof

This folder is the script composition root for Manager Control Plane backend proof.

Authority stage: `backend_proof`. This stage may prove contract, lifecycle,
in-memory adapter, fixture, and bounded-summary behavior only. It does not
authorize live worker orchestration, delivery, durable queue adoption, cleanup,
or supervisor integration.

Real in this slice:

- deterministic contract objects
- workflow-core lifecycle helpers
- in-memory dispatcher proof adapter
- fixture-backed candidates and evidence refs
- bounded summary JSON
- local tests
- source-boundary tests that classify forbidden operations before execution

Fake in this slice:

- worker execution is simulated by the memory adapter
- state is in memory or fixture-backed
- completion evidence is metadata-only
- proof output is bounded and may name capabilities, ids, stop lines, and
  evidence refs only

Forbidden in `backend_proof`:

- live tmux mutation
- real Codex worker launch
- GitHub mutation, PR creation, merge, or cleanup
- provider calls
- Redis/BullMQ, SQLite, Hatchet, or durable queue infrastructure
- supervisor runtime dependency
- dashboard write controls
- raw prompt, completion, reasoning trace, provider payload, secret, or unbounded log retention

Verification:

- `pnpm run test:manager-control-plane-forbidden-boundary`
- `pnpm run test:manager-control-plane-dispatcher-port`
- `pnpm run check:manager-control-plane`
