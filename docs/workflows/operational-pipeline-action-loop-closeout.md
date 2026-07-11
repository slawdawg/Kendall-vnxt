# Operational Pipeline Action Loop Closeout

This source-owned closeout records the implementation boundary for the active
PRD:

`_bmad-output/planning-artifacts/prds/prd-Kendall_Nxt-2026-07-04-operational-pipeline-action-loop/prd.md`

## Delivered

- Versioned backend operational action requests and results at
  `/pipeline-control-plane/actions`.
- Durable action records with correlation ids, idempotency conflict detection,
  authority/risk state, typed reasons, evidence refs, and metadata-only
  retention.
- Projection-owned runtime readiness and per-packet capability flags.
- Ready To Test metadata with pass, fail-to-rework, notes, and explicit rework
  child lineage.
- Parent/child lineage survives packet reload and projection refresh.
- `/pipeline` Ready To Test controls call the backend action endpoint and
  reload backend truth after a successful result.
- Current-PRD source authority recognition, while historical reliability proof
  sources remain compatible for prior evidence.
- Single-command local-proof smoke:
  `pnpm run test:pipeline-operational-smoke`. The smoke seeds the current
  source-owned PRD packet through the real FastAPI route, requests a
  supervisor-issued approval before each gated mutation, binds each apply to
  the approval's returned packet event, and verifies replay, stale approval,
  rework lineage, and backend projection truth.
- The smoke also seeds a separate current-source packet in `needs_approval` /
  `blocked` state and verifies visible typed blocker text, operator next
  action, computed `unblocker`, evidence refs, and gated action capability.
  Operator attribution is restricted to that approval-gated state; a blocked
  `execute` packet retains the truthful `unknown` unblocker representation.

## Intentional gates

The local-proof runtime does not claim substrate support it does not have.
Verification retry, reassignment, worker mutation, source mutation, delivery,
merge, cleanup, credential/provider changes, and unattended execution remain
capability-gated until their selected runtime, ownership, authority, and
evidence contracts are implemented. The dashboard does not present those
actions as live controls.

## Evidence boundary

The smoke's evidence level is `integrated_local`: it proves only the behavior
exercised through the real supervisor routes and disposable local SQLite state.
It does not claim `bounded_live`, production, or full Gate 4 integrated MVP
coverage. Queue/lease fencing, UtilityWorkerAdapter execution, engine/session
reload, and event reconstruction are covered only within this bounded local
proof. External workers/providers/processes, network/credentials, source
mutation, and production recovery remain outside scope. FR-13 blocked
visibility is covered for this packet, while broader unattended execution and
delivery authority remain pending.

## Verification evidence

- `pnpm run test:pipeline-operational-smoke`
- `uv run --directory services/supervisor pytest tests/integration/test_work_packets.py -q`
- `node --test tests/pipeline-gate3-approval.test.mjs tests/dashboard-pipeline-fixtures.test.mjs tests/pipeline-control-plane-lifecycle.test.mjs`
- `pnpm run test:manager-control-plane:contracts`
- `pnpm --filter @kendall/dashboard exec tsc --noEmit`

The smoke and integration proof use disposable local SQLite state, do not call
providers, and retain only bounded metadata. Client-supplied approval evidence
markers are not accepted or emitted; authority comes from the supervisor-issued
approval id and its server-returned expected event id.

## BMAD Gate 4B canonical integrated-local closeout

Status: review. Evidence level: `integrated_local`.

The bounded proof uses the tracked source authority
`docs/workflows/latest-prd-autonomous-bmad-loop-goal.md`, verifies its Git index
membership and SHA-256 digest before packet creation, and drives one
server-created linked WorkItem through the same authoritative packet lifecycle:
capture/queue, lease claim and heartbeat, UtilityWorkerAdapter local proof,
persisted execution attempt, verification evidence, review/Ready-to-Test,
server-bound approval/pass, and `/pipeline` projection. The packet and WorkItem
state agreement is asserted after each local-proof transition. Public independent
WorkItem local-proof/lease mutation routes are absent; generic WorkItem creation
rejects canonical-linkage and secret/token-like metadata.

Adversarial proof coverage includes capability-off and arbitrary-database
rejection, source traversal and untracked-source rejection, forged linkage
rejection, omitted/stale/same-token lease fencing, durable accepted/rejected
lease-action idempotency, completion fencing, worker/verification held paths,
and metadata-only redaction assertions. Engine/session reload is separately
labeled from event reconstruction. For event reconstruction, the disposable
packet and linked WorkItem materialized rows are deleted and verified absent
while lifecycle/workflow events remain; the rebuild then reconstructs packet and
WorkItem state from preserved events without duplicating the execution attempt.

Exact bounded proof command and result:

```text
timeout 180s uv run --directory services/supervisor python scripts/pipeline_operational_smoke.py
exit 0; emitted status=passed, evidenceLevel=integrated_local, rawPayloadRetained=false, canonicalSourcePacketLifecycleVerified=true, canonicalPacketWorkItemStateAgreementVerified=true, serverCapabilityBoundaryVerified=true, sourceAuthorityDigestVerified=true, sourceIndexDigestBoundaryVerified=true, metadataDepthAndSizeBoundsVerified=true, metadataRejectionPersistenceVerified=true, leaseActionIdempotencyVerified=true, completionFencingRejected=true, eventReconstructionReplayVerified=true, replayedWorkItemSnapshotVerified=true, heldWorkItemReplaySnapshotVerified=true, engineSessionReloadVerified=true
```

This closeout does not claim live, bounded-live, production-observed, external
provider/worker/process/shell/network/credential/GitHub/tmux/source-mutation
authority, or full Gate 4 coverage. Queue leases, attempts, evidence, and
workflow/lifecycle events remain durable metadata-only lineage; replay rebuilds
the packet and linked WorkItem materialized projections from preserved events.

Final repair verification:

```text
timeout 120s uv run --directory services/supervisor pytest tests/integration/test_work_packets.py -q -k 'execution_attempt or pipeline_operational or operational_action'
2 passed, 46 deselected, 1 warning
timeout 120s uv run --directory services/supervisor pytest tests/integration/test_routing_preview.py -q -k 'execution_attempt or verification_evidence or utility'
13 passed, 153 deselected, 1 warning
node --test tests/pipeline-gate3-approval.test.mjs tests/pipeline-control-plane-lifecycle.test.mjs tests/dashboard-pipeline-fixtures.test.mjs
3 passed, 0 failed
timeout 120s pnpm --filter @kendall/dashboard exec tsc --noEmit
exit 0
timeout 120s apps/dashboard/node_modules/.bin/tsc -p packages/contracts/tsconfig.json --noEmit
exit 0
timeout 60s uv run --directory services/supervisor python -m compileall -q src scripts/pipeline_operational_smoke.py
exit 0
git diff --check
exit 0
```
