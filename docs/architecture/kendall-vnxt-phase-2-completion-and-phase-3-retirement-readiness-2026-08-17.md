# Phase 2 Completion and Phase 3 Retirement Readiness

Date: 2026-08-17  
Status: Phase 2 completion evidence; Phase 3 deletion plan

## Decision

Phase 2 lifecycle convergence is complete at `origin/dev` commit
`db7d9606f4acfd6425bd7716ef57c4b7b1a0f280` (PRs #852, #853, #854, and
#855). It established one supervisor-owned authoritative packet lifecycle read
model, moved normal dashboard and manager reads to it, and preserved V0 only at
named compatibility boundaries. This is not a declaration that legacy
`/work-packets` data or routes are disposable today.

Phase 3 owns deletion. It must remove only the entries in the inventory below
after the stated replacement and rollback proof. No Phase 2 cleanup deletes a
legacy route, persisted compatibility mapping, proxy allowance, or fixture.

## Completion evidence

| Phase 2 gate | Exact evidence |
| --- | --- |
| Canonical lifecycle contract | The supervisor exposes authoritative list/detail under `/pipeline-control-plane/work-packets`; shared lifecycle event types include `packet.parallel_work_graph_refreshed`. The dashboard uses a reviewed core-plus-extension DTO and validates the Python-only contract, evidence-chain, and product-mode extensions. |
| Dashboard without legacy packet fallback | The runtime/loader reads canonical packet list/detail and the persisted work-item-to-packet lookup. It also reads the separately inventoried `PipelineDashboardProjectionV0` for cockpit operational context. Canonical packet 404 or malformed responses surface unavailable/invalid state; they do not request `/work-packets` or substitute fixture data. |
| Manager is an adapter | PR #855 moved manager source intake and local proof to the authenticated private UDS route. The supervisor mints, binds, persists, backfills, and idempotently reuses manager canonical truth; public callers cannot forge the manager provenance. |
| Persistence and restart | The supervisor integration coverage exercises persisted WorkItem linkage, verified pre-upgrade manager metadata backfill, original-key replay, concurrent initial creation, restart readback, and durable packet-bound evidence references. |
| Browser data boundary | Normal and LAN cockpit rows receive only a client-safe canonical lifecycle subset plus the named V0 compatibility projection. Raw lifecycle summaries, evidence refs, and Python-only extension records do not cross to client components. |
| Exact delivery evidence | #855 reviewed head `9918963cc11ed764659adcac98bb72cd8110373c` merged as `db7d9606`. CI run `32031578545` passed `changes`, `fast`, `supervisor`, `static`, and `check`; `full` and `javascript` were documented planner skips. The governed audit had no unresolved or pending review state. |

## Current compatibility inventory

The search boundary for this inventory is repository source, tests, contracts,
proxy/UDS allowlists, readiness scripts, and architecture documents. Canonical
`/pipeline-control-plane/work-packets` matches are not legacy entries.

| Surface | Current owner and use | Phase 3 replacement / removal proof |
| --- | --- | --- |
| Supervisor `GET /work-packets` and `GET /work-packets/{packet_id}` | `services/supervisor/src/supervisor/api/main.py` returns materialized `WorkPacketV0View` for legacy WorkItem and candidate-work identities. Integration tests exercise this durable projection. | Migrate every V0-only WorkItem/candidate-work reader to a canonical packet or a separately versioned read model. Prove a supported-data migration and canonical replacement for each synthetic identity, then remove route tests and handlers together. |
| Legacy learn-follow-up mutation | Retired in the Phase 3 source-zero slice: it had no live dashboard or manager caller, and its only browser admission was the legacy proxy exception. Historical `candidate_work` records with `learn-follow-up:` metadata remain listable after a supervisor restart. | The legacy action handler, request contract, unused dashboard helper, and proxy mutation admission are removed together. Retain the legacy read routes until their own synthetic-reader migration and persisted-data proof land. |
| Dashboard proxy and UDS legacy allowlists | `apps/dashboard/scripts/dashboard-supervisor-proxy.mjs` and `apps/dashboard/src/lib/pipeline-supervisor-uds.ts` retain only legacy packet reads. The retired learn-follow-up action has no transport admission; the normal canonical dashboard reads do not use either legacy path. | Remove each remaining legacy read allowlist only after its corresponding caller is migrated and proxy/UDS deny tests replace the current permit tests. Keep canonical work-item lookup and canonical packet reads. |
| `WorkPacketV0View` shared contract and envelopes | `packages/contracts/src/work-packet.ts` remains the type for legacy API envelopes, compatibility projection, fixture data, and tests. | First migrate the two named dashboard adapters and any remaining non-dashboard consumers to a versioned canonical UI/read DTO. Remove V0 exports/envelopes only in the same reviewed change as the final server route removal. |
| Dashboard cockpit and direct packet detail adapters | `PacketDetailPage` retains its named direct-detail holds; normal `PipelineCockpit` rendering consumes canonical packet identities and the dashboard-owned V1 active-board model. | Slice5A removes the normal V1-to-V0-shaped cockpit adapter. Keep the V0 projector only for explicit fixture/direct-detail evidence holds until those separately reviewed surfaces migrate. |
| WorkItem detail and demo/fixture boundaries | The two WorkItem detail consumers use canonical presentation data; `pipeline-fixtures.ts` is an explicit `/pipeline/demo` source backed by the strict `dashboard-pipeline-fixture/v1` DTO and its fixture-only detail extension. Named nested V0 contracts remain detail/schema holds. | Preserve demo isolation and the no-V0-import normal-route boundary while retaining the explicit V0 service/schema/projector/database holds. |
| Live dashboard V0 projection and related readiness/tests | Normal `pipeline-packet-loader` and cockpit callers use `/pipeline-control-plane/canonical-operational-projection` and the V1 active-board model; the V0 validator/projector remain only in explicit compatibility tests and direct-detail evidence holds. | Continue dependency-ordered retirement of the remaining V0 service/schema/projector/database holds. Keep readiness and fixture coverage explicit about those holds rather than reintroducing a normal-route adapter. |

## Phase 3 deletion order and rollback

1. Introduce canonical presentation and operational-projection models for
   cockpit, detail, WorkItem, and demo fixtures. Migrate the live
   `PipelineDashboardProjectionV0` cockpit read as well as
   `compatibilityProjection`, then prove the visual model does not depend on
   either V0 shape.
2. Migrate/retire the legacy learn-follow-up action and all remaining synthetic
   WorkItem/candidate-work reads. Preserve a route-by-route compatibility
   mapping and supported persisted-data readback proof.
3. Remove legacy proxy/UDS allowlist entries and add explicit deny coverage.
4. Remove the supervisor legacy routes, V0 envelopes/contracts, projectors,
   fixtures, readiness references, and legacy-only tests in one or more small,
   dependency-ordered PRs. Each PR must search for residual references and run
   canonical supervisor, dashboard, manager, persistence/upgrade, and E2E
   coverage.

Rollback for every deletion PR is a bounded revert of that PR before deleting
its remote branch. It must restore the exact server route/contract and the
matching proxy or UI compatibility boundary together; it must not reconstruct
or mutate packet history.

## Phase boundary

Phase 2 is therefore closed as a convergence and retirement-readiness phase.
Phase 3 begins with the presentation-model migration above. It is a separate
delivery decision because it deletes live compatibility behavior rather than
merely proving the canonical replacement.
