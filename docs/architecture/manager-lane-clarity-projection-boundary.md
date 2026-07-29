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

The carrier is intentionally `null` until the source-owned, loopback-only
manager-to-supervisor handoff supplies one coherent current record. The
supervisor must never read a manager ledger file opportunistically, spawn a
manager process, derive posture from queue state, or substitute `/pipeline/demo`
fixtures. `null` is the truthful production value when that handoff is
unavailable or rejected.

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

## Loopback handoff and recovery

`POST /manager-control-plane/lane-clarity-handoffs` accepts only the typed
`manager-lane-clarity-handoff/v0` metadata envelope through the existing local
operational boundary. The manager uses the matching loopback client and then
performs an exact `GET` readback of the supervisor-owned receipt. The request
and nested Lane Clarity record must bind the same run ID, event watermark, and
source cursor. It also carries a selected-lane ID, positive per-lane source
sequence, RFC 3339 observation timestamp, deterministic handoff ID, and
idempotency key.

The supervisor persists receipts only as transport metadata. An exact replay
returns the original receipt; a conflicting handoff ID or idempotency key, or a
non-advancing sequence for the same selected lane, is rejected. The production
projection uses only the most recent receipt whose nested identity is still
coherent and whose observation is neither future-dated nor older than the
normal projection freshness window. Missing, stale, malformed, cross-run, or
unavailable data returns `activeManagerLaneClarity: null` without attempting
repair.

Recovery is non-mutating: inspect the manager summary, submit the next coherent
snapshot through the loopback client, and confirm its exact readback. Do not
edit the supervisor database or reconstruct posture in the browser. This
boundary adds no dashboard control, tracker persistence, worker launch,
provider call, delivery action, or cleanup authority.

## Normal manager-cycle publication

`manager-run-loop` may publish only after a completed, otherwise-successful
cycle and only when `--lane-clarity-supervisor-url` is explicitly supplied. The
option is separate from `--supervisor-url`, which retains its source-intake
meaning. An omitted Lane Clarity URL produces a local `disabled` receipt and
does not create a network request.

The cycle supplies the existing canonical `ManagerExecutionLaneSummary` (or its
equivalent typed Lane Clarity fields) to the publication adapter. The adapter
accepts only a current metadata-only record: fresh canonical/evidence state,
an `on_scope` or `pivot_required` posture, an immutable observation timestamp,
and a strictly positive decimal source cursor. It derives the selected-lane ID,
sequence, and idempotency key from that one snapshot, then reuses the existing
loopback client and its exact supervisor readback. It never compares opaque
watermarks or cursors lexically and it never constructs a summary from manager
files.

Invalid loopback configuration produces a local `rejected` receipt with no
call. A missing, stale, malformed, or incoherent summary produces an
`unavailable` receipt with no call. Eligible local transport failures receive
at most one retry; supervisor rejection and response-identity conflicts do not
retry. These receipts are metadata-only and do not alter the cycle result, so
the supervisor remains fail-closed at `activeManagerLaneClarity: null` until a
later coherent handoff is accepted.

For recovery, inspect the manager cycle's `laneClarityHandoff` receipt, correct
only the explicit loopback configuration or the upstream canonical summary,
then run the next normal manager cycle. Do not edit the supervisor database,
read manager ledger files from the supervisor, or invoke a parallel handoff
runner.
