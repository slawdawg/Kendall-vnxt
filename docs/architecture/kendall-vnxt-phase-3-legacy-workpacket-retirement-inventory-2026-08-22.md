# Phase 3 Legacy WorkPacket Retirement Inventory

Date: 2026-08-22
Status: active retirement plan; deletion not yet authorized by this document

## Scope and current evidence

The canonical dashboard no longer requests the legacy `GET /work-packets`
family. The remaining production route definitions are
`services/supervisor/src/supervisor/api/main.py` list/detail handlers; the
remaining dashboard transport admissions are the exact legacy-read patterns in
`dashboard-supervisor-proxy.mjs` and `pipeline-supervisor-uds.ts`.

The route is nevertheless not source-zero. Integration coverage currently uses
it to materialize three different persisted identities. The route must not be
removed until each identity has a native, versioned readback proof after a
supervisor restart.

| Legacy identity | Current legacy behavior | Replacement boundary | Required persisted proof |
| --- | --- | --- | --- |
| Authoritative packet ID | List/detail materializes `WorkPacketV0View` from `authoritative_work_packets` and lifecycle events. | `GET /pipeline-control-plane/work-packets` and `GET /pipeline-control-plane/work-packets/{packet_id}`. | Create, restart, list and detail readback preserve packet ID, lifecycle history, source metadata, and metadata-only posture. |
| Linked WorkItem (`work_item:<id>`) | Detail assembles a synthetic V0 packet from a WorkItem and related CandidateWork/events. | `GET /work-items/{id}` plus the existing canonical work-item-to-packet lookup only when the persisted authoritative link exists; WorkItem-specific read models remain the source for unlinked records. | Persist both linked and unlinked WorkItems, restart, and prove the link is read only from `authoritative_packet_id`; an unlinked record remains readable through its WorkItem route without a synthetic packet. |
| CandidateWork (`candidate_work:<id>`) | Detail assembles a synthetic V0 packet for unpromoted or promoted CandidateWork. | Native CandidateWork list/read model, with a versioned exact-detail route only if an external precise-ID reader remains after the source audit. | Persist unpromoted and promoted CandidateWork, restart, and prove native CandidateWork/WorkItem reads retain their IDs and promotion linkage without a synthetic packet. |

## Ordered retirement

1. Move each legacy integration assertion to its replacement boundary. Add the
   CandidateWork exact-detail read only if the source inventory proves that
   list filtering is not a sufficient native replacement. Keep all
   authoritative lifecycle checks on the canonical control-plane route.
2. Add one restart-backed mixed-data regression covering every required state:
   one authoritative packet, linked and unlinked WorkItems, and unpromoted and
   promoted CandidateWork. Include a 404 assertion for both legacy route forms
   after removal. This is the persistence/readback proof; a pure source search
   is insufficient.
3. Remove the two supervisor handlers, their Python and TypeScript legacy
   envelopes, and the proxy/UDS legacy allowlist entries in one bounded change.
   Replace permit tests with exact GET and mutation denial tests. Do not remove
   canonical packet, WorkItem, or CandidateWork routes.
4. Establish source-zero for the deleted routes and envelopes outside archived
   migration fixtures. Update readiness and E2E scripts to canonical/native
   reads before deleting their legacy assertions.
5. Retire the remaining `WorkPacketV0View`, V0 projector, fixtures, and
   `PipelineDashboardProjectionV0` only in later dependency-ordered slices.
   Those types still back explicitly isolated demo fixtures and internal
   compatibility projection materialization; deleting the HTTP route alone
   does not prove that broader retirement.

## Current caller classification

| Caller class | Current disposition |
| --- | --- |
| Normal dashboard runtime, cockpit, direct detail, WorkItem detail, and LAN canonical reads | Already canonical; must retain no legacy fallback. |
| Dashboard proxy and UDS | Legacy read admission only; remove after the API route and replace with deny coverage. |
| Supervisor integration tests | Migrate by identity using the table above; do not preserve synthetic V0 assertions behind a helper. |
| Manager intake and Gate 4 external verification scripts | Replace authoritative legacy list/detail checks with canonical control-plane list/detail checks and retain restart readback. |
| Demo fixtures and V0 projector | Explicit later holds, not evidence that the legacy HTTP route remains needed. |

The existing Gate 4 runner currently stops at its manager source-resolution
precondition before it reaches its legacy parity reads. Repair and rerun that
owned fixture before changing its recorded passed-proof digest or treating its
caller as migrated; the manager-adapter integration proof is independently
canonical in this slice.

## Rollback and stop lines

Each deletion PR is reverted as one unit if canonical/native readback regresses:
the revert restores both route handlers and the matching proxy/UDS admission;
it never alters persisted packet, WorkItem, CandidateWork, or event history.

Stop before deletion if any persisted identity lacks an exact native readback,
an active non-test caller remains, or the canonical replacement changes an
authorization or metadata-retention boundary. A new compatibility adapter is
not an acceptable substitute for a native or canonical replacement.
