# Phase 3 Legacy WorkPacket Retirement Inventory

Date: 2026-08-22
Status: implementation and proof complete; delivery pending

## Scope and current evidence

The canonical dashboard no longer requests the legacy `GET /work-packets`
family. This slice removes those two HTTP handlers, their route-only Python and
TypeScript envelopes, and the dashboard proxy/UDS admissions. It retains the
internal `WorkPacketV0View` projection hold only where the canonical operational
projection is still reconstructed from it; that hold is not an HTTP caller.

The deletion proof covers each persisted identity through native, versioned
readback after a supervisor restart, both removed GET forms return 404 before
and after restart, and operator/test-viewer proxy attempts are denied without
forwarding.

| Legacy identity | Current legacy behavior | Replacement boundary | Required persisted proof |
| --- | --- | --- | --- |
| Authoritative packet ID | List/detail materializes `WorkPacketV0View` from `authoritative_work_packets` and lifecycle events. | `GET /pipeline-control-plane/work-packets` and `GET /pipeline-control-plane/work-packets/{packet_id}`. | Create, restart, list and detail readback preserve packet ID, lifecycle history, source metadata, and metadata-only posture. |
| Linked WorkItem (`work_item:<id>`) | Detail assembles a synthetic V0 packet from a WorkItem and related CandidateWork/events. | `GET /work-items/{id}` plus the existing canonical work-item-to-packet lookup only when the persisted authoritative link exists; WorkItem-specific read models remain the source for unlinked records. | Persist both linked and unlinked WorkItems, restart, and prove the link is read only from `authoritative_packet_id`; an unlinked record remains readable through its WorkItem route without a synthetic packet. |
| CandidateWork (`candidate_work:<id>`) | Detail assembles a synthetic V0 packet for unpromoted or promoted CandidateWork. | Native CandidateWork list/read model, with a versioned exact-detail route only if an external precise-ID reader remains after the source audit. | Persist unpromoted and promoted CandidateWork, restart, and prove native CandidateWork/WorkItem reads retain their IDs and promotion linkage without a synthetic packet. |

## Ordered retirement

1. Completed: move each legacy integration assertion to its replacement boundary. Add the
   CandidateWork exact-detail read only if the source inventory proves that
   list filtering is not a sufficient native replacement. Keep all
   authoritative lifecycle checks on the canonical control-plane route.
2. Completed: add one restart-backed mixed-data regression covering every required state:
   one authoritative packet, linked and unlinked WorkItems, and unpromoted and
   promoted CandidateWork. Include a 404 assertion for both legacy route forms
   after removal. This is the persistence/readback proof; a pure source search
   is insufficient.
3. Completed: remove the two supervisor handlers, their Python and TypeScript legacy
   envelopes, and the proxy/UDS legacy allowlist entries in one bounded change.
   Replace permit tests with exact GET and mutation denial tests. Do not remove
   canonical packet, WorkItem, or CandidateWork routes.
4. Completed: establish source-zero for the deleted routes and envelopes outside archived
   migration fixtures. Update readiness and E2E scripts to canonical/native
   reads before deleting their legacy assertions.
5. Retire the remaining `WorkPacketV0View`, V0 projector, and
   `PipelineDashboardProjectionV0` only in later dependency-ordered slices.
   The demo catalog now uses the strict `dashboard-pipeline-fixture/v1` DTO
   with an explicit fixture-only detail extension, but it retains named nested
   V0 contracts as compatibility/schema holds. Deleting the HTTP route alone
   does not prove broader service, projector, fixture-detail, or database
   retirement.

## Current caller classification

| Caller class | Current disposition |
| --- | --- |
| Normal dashboard runtime, cockpit, direct detail, WorkItem detail, and LAN canonical reads | Already canonical; must retain no legacy fallback. |
| Dashboard proxy and UDS | Legacy read admission retired; exact list/detail denial coverage proves neither transport forwards it. |
| Supervisor integration tests | Migrate by identity using the table above; do not preserve synthetic V0 assertions behind a helper. |
| Manager intake and Gate 4 external verification scripts | Replace authoritative legacy list/detail checks with canonical control-plane list/detail checks and retain restart readback. |
| Demo fixtures and V0 projector | Explicit later holds, not evidence that the legacy HTTP route remains needed. |

Gate 4 now starts the same-user private UDS intake server before its public
canonical-read server, then proves canonical list/detail and dashboard reads
across restart. Its refreshed proof records only canonical `packetId`,
`sourceRef`, stage/status, and metadata-only fields; normal `/pipeline` is
also asserted not to render a fixture fallback.

## Rollback and stop lines

Each deletion PR is reverted as one unit if canonical/native readback regresses:
the revert restores both route handlers and the matching proxy/UDS admission;
it never alters persisted packet, WorkItem, CandidateWork, or event history.

Stop before deletion if any persisted identity lacks an exact native readback,
an active non-test caller remains, or the canonical replacement changes an
authorization or metadata-retention boundary. A new compatibility adapter is
not an acceptable substitute for a native or canonical replacement.
