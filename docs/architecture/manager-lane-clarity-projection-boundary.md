# Manager Lane Clarity Projection Boundary

Date: 2026-07-29
Status: source-owned contract boundary

## Decision

`ManagerExecutionLaneSummary.laneClarity` is the canonical typed definition of
the Lane Clarity record. It is materialized only by
`scripts/lib/manager-control-plane/summary-projection.mjs` and retains
metadata-only goal, criterion/evidence, state, next-gate, and posture data.
The production `PipelineDashboardProjectionV0.activeManagerLaneClarity` field
is a nullable typed carrier for one selected lane; it is not a second tracker,
classifier, or action surface.

The carrier is intentionally `null` until a source-owned manager-to-supervisor
adapter supplies one coherent current record. The supervisor must never read a
manager ledger file opportunistically, spawn a manager process, derive posture
from queue state, or substitute `/pipeline/demo` fixtures. `null` is the
truthful production value when that adapter is unavailable.

## Posture and recovery

The record uses exactly `on_scope`, `pivot_required`, and `not_assessed`.
`on_scope` requires current coherent goal, criteria/evidence, run ID,
watermark, cursor, and freshness. `pivot_required` requires a current
`scope_pivot_required` manager event for the same run and watermark, with safe
decision/source/evidence references and a qualification of either
`operator_drift_concern` or `second_qualified_recovery_detour`. All absent,
stale, malformed, cross-run, or unrecognized metadata is `not_assessed` with a
non-mutating recovery action.

No browser, dashboard projection builder, or supervisor response may count
detours or infer a posture. No Lane Clarity path stores raw prompts,
completions, reasoning, provider payloads, or source copies.

## Transport stop line

Existing manager-to-supervisor loopback contracts carry bounded source-intake
and terminal-event data, not a manager execution summary. A future adapter may
add an explicit, loopback-only, typed handoff only after it specifies exact
identity, freshness, idempotency, and failure semantics. Until then, production
returns the nullable carrier unchanged and the future UI must remain absent or
`not_assessed`; it cannot make a live claim.

This boundary adds no dashboard control, POST route, persistence, worker
launch, provider call, delivery action, or cleanup authority.
