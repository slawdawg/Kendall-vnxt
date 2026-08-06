# Manager Control Plane Backend Proof

This folder is the script composition root for Manager Control Plane backend proof.

Authority stage: `backend_proof`. This stage may prove contract, lifecycle,
in-memory adapter, fixture, and bounded-summary behavior only. It does not
authorize live worker orchestration, delivery, durable queue adoption, cleanup,
or supervisor integration.

The `manager-source-intake-cycle.mjs` command and its
`manager-supervisor-source-intake.mjs` adapter are not generic `backend_proof`
operations. Refill and cycle may project that command only for one eligible
metadata-only source seed plus an explicit loopback URL. Continuous dry-run
validates without fetch; continuous apply requires exact target pairing and the
distinct `sourceIntake` capability/continuation gates. This does not change the
authority of dispatcher or worker operations. See
`docs/architecture/manager-supervisor-source-intake-boundary.md`.

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

## Codex allowance telemetry

The manager reads the existing local `fetch_codex_usage.py` helper first for
metadata-only current account allowance and provider-reported reset metadata.
It does not treat the provider field as a public five-hour or weekly promise.
When the direct reading succeeds, its bounded percent and reset fields are the
governor source. A non-zero status-bar result can remain a lower-confidence
compatibility fallback only if the direct reading fails.

The status-bar helper emits `0% 00:00` when its own fetch fails. If that
sentinel follows a direct-read failure, the manager reports `unknown` and keeps
the conservative worker policy; it must not enter manager-only mode. Recover by
restoring the read-only direct helper or waiting for its next provider-reported
sample. Summaries retain source, confidence, bounded allowance/reset metadata,
and policies only—never provider responses, headers, or credentials. Reliable
weekly policy remains a separate optional input.

Verification:

- `pnpm run test:manager-control-plane-forbidden-boundary`
- `pnpm run test:manager-control-plane-dispatcher-port`
- `pnpm run test:manager-source-intake`
- `pnpm run check:manager-control-plane`
