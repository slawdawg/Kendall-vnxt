# Kendall vNxt Phase 2 Lifecycle Convergence Contract

Date: 2026-08-17
Status: active Phase 2 contract and consumer inventory
Scope: lifecycle read-model convergence and retirement preparation. The first
slice authorizes one bounded read-only supervisor mapping endpoint for
URL-preserving WorkItem detail reads; it makes no schema, action, legacy-write,
or runtime-authority change.

## Decision

The supervisor is the sole authoritative owner of product work-packet
lifecycle truth. The canonical boundary is the typed
`/pipeline-control-plane/work-packets` list/detail family and its associated
transition and local-proof routes. Its source contract is
`AuthoritativeWorkPacketLifecycleView` and its event history; a packet's
`currentEventId` must identify the one history event that agrees with its
current stage, status, truth label, and source reference.

`/work-packets` and `WorkPacketV0View` are compatibility surfaces, not peer
lifecycle authorities. They remain live in the current baseline because
dashboard, fixture, test, and legacy caller migration has not yet completed.
They must not gain fields, routes, or new consumers during Phase 2.

This is a contract decision, not an execution grant. The canonical contract is
metadata-only and continues to prohibit source mutation, provider calls,
worker launch, GitHub mutation, cleanup, raw-payload retention, and a new
orchestration ledger. Existing authority checkpoints still govern any action
represented by lifecycle metadata.

## Current authoritative contract

The shared TypeScript lifecycle core lives in
[`packages/contracts/src/pipeline-control-plane/index.ts`](../../packages/contracts/src/pipeline-control-plane/index.ts).
The supervisor's canonical API schema and routes live in
[`services/supervisor/src/supervisor/api/schemas.py`](../../services/supervisor/src/supervisor/api/schemas.py)
and [`services/supervisor/src/supervisor/api/main.py`](../../services/supervisor/src/supervisor/api/main.py).
They are intentionally not a complete field-for-field mirror today: the Python
`AuthoritativeWorkPacketLifecycleView` adds optional `canonicalContract`,
`evidenceChain`, and `productModeMapping` extensions that are absent from the
TypeScript lifecycle-core interface. These extensions are part of the live
canonical supervisor response and must be explicitly inventoried and reconciled
before a dashboard DTO is declared canonical or a compatibility surface is
retired.

| Concern | Canonical requirement | Current evidence |
| --- | --- | --- |
| Identity and source | `packetId`, title, a bounded `sourceRef`, and a current event identify one supervisor packet. | `AuthoritativeWorkPacketLifecycleView` and `AuthoritativePacketLifecycleEvent` are shared typed contracts. |
| Lifecycle state | `currentStage`, status, truth label, timestamps, and `currentEventId` are backed by a nonempty lifecycle history. | Dashboard and manager validators reject a current state that does not agree with the selected event. |
| Evidence and retention | Events carry bounded summaries and evidence references with `metadataOnly: true`. | The dashboard projector redacts unsafe lifecycle text and retains metadata references only. |
| Writes | Creation, transitions, local proof, lease, and replay are members of the pipeline-control-plane route family. | The FastAPI router exposes canonical list/detail, create, transition, local-proof, lease, and replay routes under `/pipeline-control-plane/work-packets`. |
| Read model | Canonical list/detail envelopes contain authoritative lifecycle views rather than a V0-shaped compatibility projection. | `AuthoritativeWorkPacketListApiEnvelope` and `AuthoritativeWorkPacketApiEnvelope` own the canonical response shape. |
| Python-only extensions | `canonicalContract`, `evidenceChain`, and `productModeMapping` are optional supervisor response fields beyond the shared lifecycle core. | They have no corresponding fields in the TypeScript `AuthoritativeWorkPacketLifecycleView`; Phase 2 must make an explicit inclusion, projection, or bounded-omission decision for each. |

The stage vocabulary is `capture`, `classify`, `route`, `shape`,
`needs_approval`, `execute`, `review`, `promote`, `deliver`, and
`learn`. The allowed statuses are `waiting`, `active`, `blocked`, `failed`,
`complete`, and `deferred`. A future compatibility adapter may map this
vocabulary for a bounded consumer, but it may not invent a second current-state
or transition history.

## Compatibility boundary that Phase 2 must remove

The pre-slice dashboard runtime made the compatibility boundary concrete in
[`apps/dashboard/src/lib/pipeline-supervisor-runtime.ts`](../../apps/dashboard/src/lib/pipeline-supervisor-runtime.ts):

1. Canonical detail is validated as an authoritative lifecycle view and then
   projected into `WorkPacketV0View`. Only a 404 for the explicit legacy
   `work_item:*` or `candidate_work:*` identities falls back to
   `/work-packets/{id}`.
2. Canonical list accepts either authoritative rows or a V0-shaped collection.
   A 404 or malformed/legacy-shaped canonical list falls back to
   `/work-packets`.
3. When the canonical list itself is V0-shaped, the runtime loads the legacy
   list and merges by `packetId`, with canonical rows overwriting legacy rows.

This explains why route or type deletion is unsafe today. The first Phase 2
read-model slice replaces normal dashboard list and packet-detail reads with a
dashboard-owned `DashboardCanonicalWorkPacketV1`: it requests only canonical
list/detail data, carries the Python-only extensions under explicit validation,
and exposes the named, read-only `compatibilityProjection` adapter for current
V0 visual consumers. It does not remove `/work-packets` or its transports for
unmigrated callers.

To preserve existing `/work-items/{id}` URLs without a synthetic legacy
identity, this slice also admits exactly
`GET /pipeline-control-plane/work-items/{work_item_id}/packet`. The supervisor
resolves that read through the persisted unique
`WorkItem.authoritative_packet_id`; absent item/link/packet or metadata-link
disagreement is unavailable. This narrow lookup is not a new lifecycle action,
schema, write path, or general work-item-to-packet query surface.

## Consumer inventory

This inventory is the retirement baseline. It names source families that must
be migrated, isolated as explicitly supported fixtures, or removed before the
V0 route/type can be retired. It is a source inventory, not a claim that every
reference is a runtime authority.

| Consumer or owner | Current use | Phase 2 disposition and proof |
| --- | --- | --- |
| Shared contracts: [`pipeline-control-plane/index.ts`](../../packages/contracts/src/pipeline-control-plane/index.ts) and [`work-packet.ts`](../../packages/contracts/src/work-packet.ts) | The shared TypeScript lifecycle core coexists with `WorkPacketV0View`, V0 envelopes, lifecycle-state, evidence, and dashboard types; it does not yet contain the Python-only canonical extensions. | Define the dashboard/manager canonical consumer DTO from a reviewed core-plus-extension mapping. Retain only an explicitly isolated compatibility adapter until all V0 imports are gone. Add compile-time and runtime contract coverage for every included, projected, or intentionally omitted extension. |
| Supervisor API and application: [`main.py`](../../services/supervisor/src/supervisor/api/main.py), [`schemas.py`](../../services/supervisor/src/supervisor/api/schemas.py), and [`service.py`](../../services/supervisor/src/supervisor/application/service.py) | Canonical create/list/detail/transition/local-proof routes coexist with `GET /work-packets`, legacy detail, and the legacy learn follow-up route. Application service still materializes V0 views. | Keep canonical routes stable while a bounded migration maps each legacy read/action. Do not remove a legacy route until its request/response, caller, persisted-data, and rollback proof are recorded. |
| Supervisor persistence: [`models.py`](../../services/supervisor/src/supervisor/infrastructure/db/models.py), frozen [`models_baseline.py`](../../services/supervisor/src/supervisor/infrastructure/db/models_baseline.py), and [`migrations.py`](../../services/supervisor/src/supervisor/infrastructure/db/migrations.py) | `authoritative_work_packets` and `authoritative_work_packet_lifecycle_events` are durable tables; frozen `0001_model_baseline` and additive `0002_legacy_compatibility` preserve existing installations. | Any canonical read-model or V0-retirement persistence change is a new ordered migration. Prove clean install, legacy upgrade, restart/idempotence, data retention, and capability rollback; never edit the frozen baseline or introduce startup-only schema mutation. |
| Manager source intake: [`manager-supervisor-source-intake.mjs`](../../scripts/lib/manager-control-plane/manager-supervisor-source-intake.mjs) and [`manager-supervisor-local-proof.mjs`](../../scripts/lib/manager-control-plane/manager-supervisor-local-proof.mjs) | The manager posts bounded metadata only through the same-user private supervisor UDS intake. For the exact manager-intake actor, the supervisor mints and persists the canonical contract, then returns the authoritative history plus usable extensions; refreshes reuse that verified server contract. A legacy record lacking that contract is backfilled only from an exact persisted manager-create event with matching source identity; malformed or caller-supplied legacy contracts remain unavailable. The manager records only returned supervisor references. Its worker/receipt/checkpoint ledgers still model manager session and delivery coordination. | Keep manager state adapter/session-only. Migrate any lifecycle presentation to supervisor references and prove the manager neither reconstructs a peer product lifecycle nor accepts a legacy lifecycle fallback or legacy packet read. |
| Dashboard runtime and pages: [`pipeline-supervisor-runtime.ts`](../../apps/dashboard/src/lib/pipeline-supervisor-runtime.ts), [`pipeline-packet-loader.ts`](../../apps/dashboard/src/lib/pipeline-packet-loader.ts), and work-item pages/components | `DashboardCanonicalWorkPacketV1` carries the validated authoritative lifecycle plus the Python-only `canonicalContract`, `evidenceChain`, and `productModeMapping` extensions. Its named `compatibilityProjection` is a temporary read-only `WorkPacketV0View` adapter for existing visual components. Work-item detail URLs resolve through the persisted `WorkItem.authoritative_packet_id` canonical lookup, never a synthetic `work_item:` legacy read. | Prove list, direct detail, and WorkItem lookup issue no legacy request. An absent WorkItem mapping or malformed canonical lookup is displayed as an unavailable packet state; malformed present extensions fail closed. Retire `compatibilityProjection` only after every remaining V0 UI consumer is migrated. |
| Dashboard V0 projections and UI: [`pipeline-supervisor-projector.ts`](../../apps/dashboard/src/lib/pipeline-supervisor-projector.ts), [`active-board-view-model.ts`](../../apps/dashboard/src/lib/pipeline/active-board-view-model.ts), [`memory-proposal-review-panel.tsx`](../../apps/dashboard/src/components/memory-proposal-review-panel.tsx), and [`pipeline-fixtures.ts`](../../apps/dashboard/src/lib/pipeline-fixtures.ts) | These import or manufacture V0-shaped data for cockpit, review, and fixture views. | Classify each as canonical consumer, fixture-only adapter, or removable projection. Fixture support stays explicitly fixture-only and cannot be used as a production fallback. |
| Dashboard transport and allowlists: [`dashboard-supervisor-proxy.mjs`](../../apps/dashboard/scripts/dashboard-supervisor-proxy.mjs), [`pipeline-supervisor-uds.ts`](../../apps/dashboard/src/lib/pipeline-supervisor-uds.ts), and [`dashboard-page-read-manifest.json`](../../apps/dashboard/src/lib/dashboard-page-read-manifest.json) | The proxy/UDS/read manifest still permit legacy packet paths beside canonical paths. The current work-item detail caller additionally needs only the exact canonical `/pipeline-control-plane/work-items/{id}/packet` read. | Admit that exact canonical lookup with focused tests while retaining legacy paths for unmigrated callers. Remove legacy paths only after their callers are migrated and their replacement/rollback proof is recorded. |
| Operational scripts and tests: [`pipeline_operational_smoke.py`](../../services/supervisor/scripts/pipeline_operational_smoke.py), [`test_work_packets.py`](../../services/supervisor/tests/integration/test_work_packets.py), [`gate4-bmad-dashboard-e2e.mjs`](../../scripts/gate4-bmad-dashboard-e2e.mjs), and [`check-dashboard-pipeline-import-boundary.mjs`](../../scripts/check-dashboard-pipeline-import-boundary.mjs) | Canonical lifecycle behavior is heavily exercised, but integration/E2E/readiness coverage also calls or expects legacy V0 routes. | Split canonical contract proof from bounded legacy compatibility proof. Retirement requires replacement assertions for every legacy call, not deletion of coverage. |

The dashboard supervisor proxy is a transport allowlist, not evidence that a
legacy route is canonical. Similarly, the manager's session ledgers are not a
license for a second product lifecycle: they must continue to point at
supervisor identity, event, and evidence references.

## Ownership and migration constraints

| Concern | Authoritative owner | Adapter or consumer constraint |
| --- | --- | --- |
| Product work-packet identity, current state, transitions, evidence, and terminal outcome | Supervisor authoritative packet and event records | Manager and dashboard may retain bounded display/session metadata, but must not independently decide or persist the same product lifecycle state. |
| Candidate intake | Manager may submit one eligible, bounded source-backed candidate; supervisor records the resulting authoritative packet. | Intake is loopback-only/metadata-only and validates the returned persisted identity. It is not a manager-owned lifecycle write model. |
| Dashboard read model | Supervisor canonical list/detail envelope | `pipeline-packet-loader` keeps `DashboardCanonicalWorkPacketV1` server-side, then carries deliberately client-safe lifecycle metadata and a named `compatibilityProjection` through normal and LAN cockpit source state. Raw lifecycle payload summaries, evidence refs, Python-only extension records, and projection `canonicalContract`/`productModeMapping` values do not cross the client boundary. The cockpit consumes its named compatibility adapter only at the remaining V0 projection boundary; it does not initiate a legacy fallback. |
| Canonical response extensions | Supervisor Python schema owns `canonicalContract`, `evidenceChain`, and `productModeMapping` until a cross-language decision is recorded. | A dashboard/manager DTO must either carry, safely project, or deliberately omit each extension with a test and documented reason; it may not accidentally lose fields by treating the TypeScript core as the whole response. |
| WorkItem-to-packet identity | `WorkItem.authoritative_packet_id` is the unique persisted canonical mapping. | Dashboard work-item detail reads use the canonical lookup backed by that column. Missing link, missing packet, or metadata/link disagreement is unavailable rather than a legacy assembly fallback. |
| Legacy V0 data | Transitional compatibility only | The remaining dashboard V0-only boundaries are `pipeline-supervisor-projector.ts`, explicit demo fixtures and their focused tests, and the two WorkItem detail consumers (`app/work-items/[work-item-id]/page.tsx` and `components/work-item-detail-page.tsx`). Direct pipeline packet detail now carries its canonical DTO to `PacketDetailPage`, which owns its named read-only adapter. Normal cockpit callers carry canonical DTOs to the cockpit before its named adapter. No new V0 field, route, fixture-backed production fallback, or parallel parity logic is allowed. |
| Schema history | Ordered supervisor migrations | The migration table and frozen baseline preserve prior schemas; data migration must be additive and recoverable before any V0 persistence retirement. |

## Phase 2 exit gates

Phase 2 is complete only when all of the following are proven by reviewed,
source-owned tests and documentation. These are gates for convergence, not
permission to delete in the same change.

1. **Canonical contract:** one versioned canonical list/detail contract is
   documented in shared contracts and implemented by the supervisor. It
   preserves packet identity, current-event/history consistency, source and
   evidence references, metadata-only retention, and authority prohibitions.
   It also includes a reviewed field matrix for the Python-only
   `canonicalContract`, `evidenceChain`, and `productModeMapping` extensions:
   each is carried, safely projected, or deliberately omitted with an exact
   compatibility reason and test.
2. **Dashboard without fallback:** dashboard list and detail consume the
   canonical contract directly. Focused transport/E2E tests prove a nonempty
   canonical response never calls `/work-packets`, performs a V0 merge, or
   substitutes a fixture. A canonical contract failure is surfaced as a
   bounded unavailable/invalid state, not silently hidden by legacy data.
   The convergence metric records zero normal dashboard loaders or routes that
   return a bare `WorkPacketV0View`; the temporary cockpit and `PacketDetailPage`
   `compatibilityProjection` adapters, the two WorkItem detail consumers
   (`app/work-items/[work-item-id]/page.tsx` and
   `components/work-item-detail-page.tsx`), and
   the demo/fixture boundary remain explicitly counted until retired.
3. **Manager as adapter:** manager source intake and local-proof flows consume
   and retain supervisor packet/event references. Manager source intake requires
   usable canonical extension truth and fails closed rather than accepting an
   extension-free legacy lifecycle response. The supervisor, not manager,
   mints the exact manager-intake canonical contract and reuses its persisted
   value for idempotent creation and refresh. Tests prove manager ledgers are
   session/delivery coordination only and do not become peer lifecycle truth or
   a legacy read fallback.
4. **Persisted-data evidence:** clean install, upgrade from each supported
   pre-convergence schema (including verified manager-intake contract backfill), restart/idempotence, and data-retention tests prove
   that canonical records and any V0 compatibility mapping survive the
   migration. Every schema change is a new ordered revision with a
   capability-recovery/rollback procedure.
5. **Consumer closure:** the inventory is re-run and every legacy route,
   `WorkPacketV0` import, proxy/UDS allowlist entry, fixture, test, readiness
   script, and manager/dashboard caller is either migrated, explicitly
   time-bounded as a compatibility adapter, or prepared for Phase 3 removal.
6. **Retirement readiness:** a canonical contract suite, supervisor migration
   suite, manager adapter suite, dashboard E2E suite, and repository search
   establish the exact remaining legacy surface. The Phase 3 deletion plan
   names its rollback/recovery path and removes only consumers with a proven
   canonical replacement.

## Phase boundary and next slice

This document does not deprecate or remove `/work-packets`, `WorkPacketV0`,
the dashboard proxy allowlist, fixtures, manager ledgers, or persisted columns.
It establishes the source-owned contract and inventory required before and
during the narrow canonical dashboard read-model slice. That slice owns the
dashboard runtime, focused tests, and the one URL-preservation lookup described
above; route/schema/persistence retirement and all legacy action changes remain
separately reviewed after consumer and migration evidence is fresh.

The governing program remains
[the holistic cleanup program](kendall-vnxt-holistic-cleanup-program-2026-08-13.md)
and its [Phase 0 inventory](kendall-vnxt-cleanup-phase-0-inventory-2026-08-13.md).
The active schema rules are in
[the supervisor migration runbook](../workflows/supervisor-schema-migrations.md).

## Completion record

The Phase 2 gates above were completed by the merged #852, #853, #854, and
#855 delivery sequence. The source-backed closeout inventory and the bounded
Phase 3 deletion/rollback order are recorded in
[Phase 2 Completion and Phase 3 Retirement Readiness](kendall-vnxt-phase-2-completion-and-phase-3-retirement-readiness-2026-08-17.md).
That record retains the distinction between Phase 2 convergence and Phase 3
legacy deletion; it does not authorize a route, contract, or persistence
removal by itself.
