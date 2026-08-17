# Phase 3 Canonical Presentation Preparation

Date: 2026-08-17  
Status: implementation-ready planning record; no legacy deletion authorized

## Starting point

Phase 2 closed at `origin/dev` commit
`8f6e02354a7dca5e76ca5239f4b7aefbe2c1f8fd`. It moved normal packet reads to
the supervisor-owned lifecycle contract, but the cockpit still consumes two V0
forms:

1. `DashboardCanonicalWorkPacketV1.compatibilityProjection`, projected into
   `PipelineDashboardPacket` by
   `apps/dashboard/src/lib/pipeline-supervisor-projector.ts`; and
2. the live `/pipeline-control-plane/projection` response,
   `PipelineDashboardProjectionV0`, carried by
   `apps/dashboard/src/lib/pipeline-packet-loader.ts` into `PipelineCockpit`.

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
   explicit demo fixtures as a separate input; do not silently coerce a fixture
   into a runtime row.
4. Remove the V0 transitional adapter from normal cockpit, direct packet detail,
   and LAN paths only when those paths have no `WorkPacketV0View`,
   `PipelineDashboardPacket`, or `PipelineDashboardProjectionV0` import. The
   WorkItem memory-review hold below is a separate subsequent Phase 3 slice.

## File and test map

| Area | First-slice files | Required evidence |
| --- | --- | --- |
| Canonical packet presentation | `apps/dashboard/src/lib/pipeline-supervisor-runtime.ts`, `apps/dashboard/src/lib/pipeline-supervisor-projector.ts`, `apps/dashboard/src/lib/pipeline-packet-loader.ts` | Canonical lifecycle fields map to the new presentation; malformed lifecycle and unknown fields fail closed; no legacy request is issued. |
| Operational projection | `apps/dashboard/src/lib/pipeline-packet-loader.ts`, `apps/dashboard/src/lib/pipeline-supervisor-projection.ts`, `apps/dashboard/src/lib/supervisor.ts`, and the dashboard proxy | Whitelist preserves required V1 action-context fences and active-board fields while stripping unknown root and nested fields in normal and LAN paths. |
| Cockpit and direct packet detail consumers | `apps/dashboard/src/components/pipeline/pipeline-cockpit.tsx`, `packet-detail-page.tsx`, `apps/dashboard/src/lib/pipeline/active-board-view-model.ts`, normal/LAN route components | Runtime rows use canonical presentation; demo remains explicit; direct packet detail preserves URL behavior. |
| WorkItem memory review (subsequent hold) | `apps/dashboard/src/components/work-item-detail-page.tsx`, `apps/dashboard/src/components/memory-proposal-review-panel.tsx` | The panel directly requires `WorkPacketV0View.memoryProposals` and `alphaMemorySourceStatus.llmWikiReadiness`. It remains a named V0 hold until a canonical, work-item-scoped memory-review DTO and its PATCH/LLM-Wiki read regression coverage are delivered. |
| Tests | `tests/dashboard-pipeline-packet-loader.test.mjs`, `tests/dashboard-lan-pipeline-routing.test.mjs`, proxy/fixture/boundary tests | Normal/LAN no-V0 import or adapter assertions, extension/privacy tests, V1 action-context preservation, render/typecheck/build coverage. |

## Deletion holds

The first Phase 3 slice must not remove any item below:

- `GET /work-packets`, `GET /work-packets/{packet_id}`, or the legacy
  learn-follow-up mutation;
- proxy or UDS legacy allowlist entries;
- `WorkPacketV0View` exports/envelopes or legacy projection schemas;
- WorkItem/candidate-work synthetic identity compatibility; or
- demo fixtures and their isolation boundary; or
- the WorkItem memory-review V0 adapter (`memoryProposals` and
  `alphaMemorySourceStatus.llmWikiReadiness`).

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
