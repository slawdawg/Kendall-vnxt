# Gate 5 and Gate 6 Terminal Readiness Contract

Status: source-owned implementation contract
Evidence retention: metadata only

## Gate 5 — authoritative backlog exhaustion

When the source-owned manager goal resolves to an exhausted sprint with no
dispatchable or active safe lanes, the manager must not invent another story,
epic, successor, or post-slice filler item. If an independently reconciled
authoritative source bundle is absent, the refill plan fails closed and routes
the operator to:

1. final source audit;
2. exact authoritative reconciliation;
3. the required BMAD retrospective; and
4. metadata-only manager housekeeping and recovery-evidence preservation.

A valid reconciled bundle may produce the existing
`authoritative_backlog_exhausted` disposition, but it still exposes those
terminal routes and cannot authorize supervisor persistence, dispatch, worker
mutation, delivery, provider calls, or cleanup.

## Gate 6 — canary and recovery readiness

Canary, ramp, recovery, hardening, and final production-decision packets carry
an evidence provenance class. Fixture-backed evidence is never promotion-grade:
it cannot produce a passing live canary, a passing ramp, or a `go` or
`limited_rollout` production decision. Missing, stale, simulated, ambiguous,
or fixture-backed evidence remains a typed hold/stop state.

These contracts do not launch providers, workers, production traffic, rollout,
deployment, secret access, merge, or cleanup. A future live canary still needs
independently observed backend truth, explicit authority, fresh telemetry,
lease/checkpoint receipts, thresholds, and a tested rollback path.

## Verification

- `node --test --experimental-test-isolation=none tests/manager-control-plane.test.mjs`
- `node --test tests/operational-readiness-contract.test.mjs`
- `pnpm run check:manager-control-plane`
- `git diff --check`

All generated BMAD stories and review artifacts remain local planning state;
this document records only the durable boundary and the safe next actions.
