# Phase 3 Canonical Presentation Preparation

Date: 2026-08-17  
Status: in progress; legacy deletion remains gated

## Delivery progress

The canonical packet-presentation slice merged in PR #858 at
`36b8f8942356b10a3933aacc6a73bd6b5dede529`. Normal cockpit and direct packet
detail reads now carry the independently shaped
`DashboardCanonicalPresentationV1`; they do not delegate their validation or
projection to `WorkPacketV0View`. The WorkItem memory-review panel now uses
its own canonical, work-item-scoped memory DTO with an opaque action route key
and persisted decision fence.

The active operational-truth sub-slice moves the normal and LAN action-gating
path and projection-truth helpers onto the read-only
`GET /pipeline-control-plane/canonical-operational-projection` boundary. The
supervisor explicitly reconstructs its versioned
`DashboardCanonicalOperationalProjectionV1` response from its internal V0
board read; it does not relabel or forward the V0 envelope. Its nested legacy
action and board-detail values remain explicit compatibility holds while their
canonical replacements are delivered. The old
`GET /pipeline-control-plane/projection` endpoint remains a separately
inventoried compatibility read until source-zero and persisted-readback
retirement gates pass.

The direct packet-detail work graph is now a separately reconstructed
`DashboardCanonicalWorkGraphEvidenceV1`; it no longer passes a
`PipelineDashboardProjectionV0` work-graph object into the detail component.
Normal `/pipeline/packets/[packetId]` detail rendering now consumes the
canonical presentation/lifecycle and that V1 work graph directly; its former
V0 packet renderer is isolated to the explicit demo route as
`PacketDetailFixturePage`. The supervisor projection transport and its other
explicitly inventoried V0 board values remain compatibility surfaces until
their own replacement and readback proofs land.
Authenticated LAN packet detail now uses the same canonical-boundary posture:
its private UDS mediator emits the fixed
`dashboard-canonical-lan-packet-detail/v1` envelope, with a lifecycle-derived
presentation, bounded evidence metadata, and the reconstructed
`dashboard-canonical-work-graph/v1`. The browser validates the requested packet
identity and renders no raw lifecycle, provider, or V0 packet fields. The
private mediated route remains retained until the later source-zero and
persisted-readback retirement gate, but it accepts and emits only the canonical
v2 envelope; it does not import the demo fixture renderer.
The readiness inventory therefore validates canonical lifecycle/history and
boundary content on the normal detail component, while fixture-only worker,
gate, and legacy memory evidence remains attached to `PacketDetailFixturePage`.

## Starting point

Phase 2 closed at `origin/dev` commit
`8f6e02354a7dca5e76ca5239f4b7aefbe2c1f8fd`. It moved normal packet reads to
the supervisor-owned lifecycle contract, but the cockpit still consumes two V0
forms:

1. `DashboardCanonicalWorkPacketV1.compatibilityProjection`, projected into
   `PipelineDashboardPacket` by
   `apps/dashboard/src/lib/pipeline-supervisor-projector.ts`; and
2. the internal supervisor `PipelineDashboardProjectionV0` board read and its
   public `/pipeline-control-plane/projection` compatibility endpoint. Normal
   and LAN cockpit loaders now use the separate canonical operational endpoint;
   the V0 endpoint remains for named compatibility consumers only.

These are active compatibility surfaces, not dead code. Phase 3 must replace
them before removing `WorkPacketV0View`, the legacy supervisor routes, or their
proxy/UDS allowances.

## First delivery slice

Create a versioned, dashboard-facing canonical presentation model and a
versioned client-safe operational projection model. Keep all server routes and
legacy contracts in place during this slice.

### Contract boundary

Add a canonical dashboard presentation type that is derived from
`DashboardCanonicalWorkPacketV1.authoritativeLifecycle`, rather than from
`WorkPacketV0View`. It must contain only fields the cockpit/detail UI actually
renders and must preserve the current metadata-only and redaction rules.

Add a client-safe canonical operational projection type that has an explicit
field whitelist for stage summaries, source state, manager/worker/queue
summaries, gated controls, execute admission, and V1 action capabilities. It
must not spread raw supervisor objects, lifecycle payload summaries, evidence
references beyond the current safe contract, or Python-only extension records.
Source references, runtime readiness, and V1 action contexts must each use
shape-specific reconstruction, so a key that is valid elsewhere cannot cross
one of those nested boundaries by name collision.

The new types need distinct versioned names and schema literals. They must not
reuse `PipelineDashboardProjectionV0` or `PipelineDashboardPacket` aliases,
even if their first field set is intentionally isomorphic.

### Migration path

1. Define the new presentation and operational-projection validators in the
   dashboard/shared-contract boundary and add exact malformed/unknown-field
   rejection tests.
2. Update `pipeline-packet-loader` to construct only the new client-safe
   presentation and operational-projection objects for normal and LAN
   `/pipeline` routes. Keep the existing V0 values only at a named,
   server-side transitional adapter while the two forms are compared in tests.
3. Update `PipelineCockpit`, active-board view-model helpers, and
   `PacketDetailPage` to consume the new canonical presentation type. Preserve
   explicit demo fixtures as a separate input; normal direct detail must not
   materialize a V0 packet, and the fixture-only renderer must not be imported
   by the normal route.
4. Remove the V0 transitional adapter from normal cockpit, direct packet detail,
   and LAN paths only when those paths have no `WorkPacketV0View`,
   `PipelineDashboardPacket`, or `PipelineDashboardProjectionV0` import. The
   WorkItem memory-review migration is separately complete, but its operator
   action and provenance fences remain part of the Phase 3 readback audit.

### Active-board migration slice

Normal and LAN cockpit active-board calculation and runtime V1 action strips
now receive `DashboardCanonicalActiveBoardProjectionV1`, a dashboard-owned
client DTO reconstructed field-by-field by `pipeline-packet-loader`. It carries
the bounded stage, source-state, manager, worker, queue, admission, control,
and V1-action fields the active-board view model reads; it omits raw lifecycle
extensions and incomplete selected-detail evidence. The older
`DashboardCanonicalOperationalProjectionV1` remains a named temporary hold for
direct-detail inspection, manager-lane/coordination panels, and legacy V0
action compatibility. It must not be used to reintroduce active-board or
runtime-action rendering.

## File and test map

| Area | First-slice files | Required evidence |
| --- | --- | --- |
| Canonical packet presentation | `apps/dashboard/src/lib/pipeline-supervisor-runtime.ts`, `apps/dashboard/src/lib/pipeline-supervisor-projector.ts`, `apps/dashboard/src/lib/pipeline-packet-loader.ts` | Canonical lifecycle fields map to the new presentation; malformed lifecycle and unknown fields fail closed; no legacy request is issued. |
| Operational projection | supervisor canonical operational endpoint, `apps/dashboard/src/lib/pipeline-supervisor-runtime.ts`, `apps/dashboard/src/lib/pipeline-packet-loader.ts`, and the dashboard proxy | The supervisor reconstructs a strict versioned V1 envelope; dashboard and proxy allowlists preserve required V1 action-context fences and active-board fields while stripping unknown root and nested fields in normal and LAN paths. The V0 endpoint is a named compatibility hold. |
| Cockpit and direct packet detail consumers | `apps/dashboard/src/components/pipeline/pipeline-cockpit.tsx`, `packet-detail-page.tsx`, `apps/dashboard/src/lib/pipeline/active-board-view-model.ts`, normal/LAN route components | Runtime rows use canonical presentation; the direct-detail work graph uses `DashboardCanonicalWorkGraphEvidenceV1`; demo remains explicit; direct packet detail preserves URL behavior. |
| WorkItem memory review | `apps/dashboard/src/components/work-item-detail-page.tsx`, `apps/dashboard/src/components/memory-proposal-review-panel.tsx` | The panel uses the canonical, work-item-scoped memory-review DTO. PATCH and every durable proposal action use its opaque route key, persisted revision fence, and the dashboard's operator mutation transport (Origin and CSRF fenced); reserved canonical evidence namespaces are resolved from WorkItem-scoped records before an AI draft or derived rebuild can proceed. |
| Tests | `tests/dashboard-pipeline-packet-loader.test.mjs`, `tests/dashboard-lan-pipeline-routing.test.mjs`, proxy/fixture/boundary tests | Normal/LAN no-V0 import or adapter assertions, extension/privacy tests, V1 action-context preservation, render/typecheck/build coverage. |

## Deletion holds

The first Phase 3 slice must not remove any item below:

- `GET /work-packets`, `GET /work-packets/{packet_id}`, or the legacy
  learn-follow-up mutation;
- proxy or UDS legacy allowlist entries;
- `WorkPacketV0View` exports/envelopes or legacy projection schemas;
- WorkItem/candidate-work synthetic identity compatibility; or
- demo fixtures and their isolation boundary; or
- deprecated WorkItem memory-review V0 fields after the canonical DTO and
  operator-action fences have the required readback coverage.

Those removals require the later route-by-route migration and persisted-data
readback proof recorded in the Phase 2 closeout. A failed replacement is
recovered by reverting only its Phase 3 PR; it must restore the matching UI,
proxy, and server boundary together without altering packet history.

## Readiness gate for implementation

Begin code changes only after a fresh source search attaches each current V0
import/route/allowlist to one of: (a) first-slice replacement, (b) later
legacy-action migration, or (c) explicit fixture/test retention. The first
implementation PR must include the search output, focused dashboard loader and
LAN tests, dashboard typecheck/build, proxy behavior test where sockets are
available, and independent contract review before publishing.
