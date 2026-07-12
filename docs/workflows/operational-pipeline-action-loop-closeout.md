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

Status: accepted for the bounded integrated-local slice; full Gate 4 integrated MVP remains open. Evidence level: `integrated_local`.

Completion note (2026-07-12): PR #515 merged at `c82f290b46bccb0fd335038738497175fa3b0802`. The post-merge smoke passed with `status=passed`, `evidenceLevel=integrated_local`, `runtimeMode=local_proof`, `missingApprovalRejected=true`, `staleApprovalRejected=true`, `happyLocalProofVerified=true`, `canonicalPacketWorkItemStateAgreementVerified=true`, `engineSessionReloadVerified=true`, `eventReconstructionReplayVerified=true`, `serverBoundLocalProofAuthorityVerified=true`, `trustedDeliveryReadinessBlockedForPublicForgery=true`, and `rawPayloadRetained=false`; focused tests: `4 passed, 45 deselected`.

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
and metadata-only redaction assertions. Authoritative packet titles and source
reference titles reject secret, token, and raw-provider-shaped values before
packet/event persistence while safe source titles remain unchanged. The smoke
also sends 1,001 shallow metadata entries (node limit 1,000) and 500 individually
safe short strings totaling more than 64 KiB (aggregate limit 65,536 bytes),
asserting typed 422 responses and zero WorkItem/workflow-event persistence.
Queued WorkItem title, requested outcome, source, and details scalars use the
same safe metadata policy before the queued row/event is created. Accepted
requeue and reject actions append source-backed canonical lifecycle snapshots;
each is replayed after materialized packet/WorkItem deletion and must preserve
the resulting status, operator-test decision, stage, root lineage, and single
successful execution attempt.
Credential signatures are detected inside scalar strings at token boundaries,
including prefixed `ghp_`, `sk-proj-`, `AKIA`, `glpat-`, `npm_`, `ASIA`, and
related forms, while ordinary prose remains allowed. Smoke HTTP cases cover
WorkItem title/request/source/details, nested metadata, packet title, and
source-reference title, with typed 422 responses and zero durable rows/events.
Public callers cannot mint `local-proof` execution attempts or record the
special no-op verification command: the accepted path requires the server
local-proof capability, linked source packet, local-proof attestation event,
active queue lease, and matching fencing token. Capability-off/unattested
projection reports `unavailable` or `read_only`, never `local_proof`. The
untracked-source smoke fixture uses an exclusive collision-resistant temporary
file and removes only the file it created, preserving pre-existing paths.
Engine/session reload is separately labeled from event reconstruction. For event
reconstruction, the disposable packet and linked WorkItem materialized rows are
deleted and verified absent while lifecycle/workflow events remain; the rebuild
then reconstructs packet and WorkItem state from preserved events without
duplicating the execution attempt, with the authoritative packet id restored in
the database column under its unique constraint.

Exact bounded proof command and result:

```text
timeout 180s uv run --directory services/supervisor python scripts/pipeline_operational_smoke.py
exit 0; emitted status=passed, evidenceLevel=integrated_local, rawPayloadRetained=false, canonicalSourcePacketLifecycleVerified=true, canonicalPacketWorkItemStateAgreementVerified=true, serverCapabilityBoundaryVerified=true, sourceAuthorityDigestVerified=true, sourceIndexDigestBoundaryVerified=true, metadataDepthAndSizeBoundsVerified=true, metadataNodeLimit=1000, metadataNodeLimitVerified=true, metadataAggregateSizeBytesLimit=65536, metadataAggregateSizeLimitVerified=true, metadataRejectionPersistenceVerified=true, workItemScalarMetadataSafetyVerified=true, workItemScalarRejectionPersistenceVerified=true, prefixedCredentialSignatureRejectionVerified=true, authoritativePacketTitleSafetyVerified=true, authoritativePacketSourceTitleSafetyVerified=true, authoritativePacketRejectionPersistenceVerified=true, localProofVerificationAttestationEnforced=true, publicLocalProofForgeryRejected=true, trustedDeliveryReadinessBlockedForPublicForgery=true, disabledLocalProofProjectionVerified=true, untrackedSourceFixtureIsolationVerified=true, leaseActionIdempotencyVerified=true, completionFencingRejected=true, eventReconstructionReplayVerified=true, eventReconstructionRowsAbsentBeforeRebuildVerified=true, eventReconstructionDatabaseLinkageVerified=true, authoritativePacketLinkUniquenessVerified=true, acceptedRequeueReplayVerified=true, acceptedRejectReplayVerified=true, replayedWorkItemSnapshotVerified=true, heldWorkItemReplaySnapshotVerified=true, engineSessionReloadVerified=true
```

## Phase 2 manager-supervisor terminal-event sync

Status: merged as PR #518 at
`06527e7291b1ca716add302c7f9ca09251bf31b0`; bounded manager terminal-event
persistence is implemented behind explicit loopback sync. Full Gate 4 integrated
MVP remains open.

Manager refill planning remains deterministic and network-free. A normal
`buildRefillPlan` or `scripts/manager-refill-plan.mjs` invocation may emit an
`authoritative_backlog_exhausted` terminal disposition, but it retains
`canonicalEventIntegration=missing_supervisor_contract` and does not contact the
supervisor or claim canonical persistence. Persistence requires a separate,
explicit operator invocation with a previously built JSON packet:

```bash
pnpm run manager:supervisor-terminal-event-sync -- \
  --input /path/to/refill-packet.json \
  --supervisor-url http://127.0.0.1:8000
```

That command accepts only an uncredentialed loopback supervisor URL
(`localhost`, `127.0.0.1`, or `::1`) and POSTs allowlisted
`authoritative_backlog_exhausted` metadata to
`/manager-control-plane/terminal-events`. It does not forward the enclosing
packet, raw payloads, provider output, commands, or work-creation/dispatch
instructions. The input packet is not mutated. Only a 2xx response with the
exact expected event identity and a bounded persistence timestamp produces a
cloned packet marked `supervisor_canonical_event`; network, HTTP, response, or
identity failures retain or restore the missing-contract blocker and fail
closed. Deterministic event identity makes replay idempotent at the supervisor
contract boundary.

The merged evidence covers the explicit command/contract boundary: exact
metadata projection, success-only transformation, deterministic replay identity,
loopback enforcement before fetch, fail-closed unavailable/malformed/conflicting
supervisor responses, refill dry-run network isolation, and manager summary
distinction between missing and integrated terminal events. It does not prove
that source intake automatically invokes this terminal-event side effect: the
terminal-event sync remains a separate explicit loopback command. The later PR
#523 evidence below closes a different bounded gap by connecting one eligible
source-backed seed from manager refill/cycle/run-loop selection to supervisor
WorkPacket persistence. It does not turn terminal-event sync into an automatic
side effect or prove broader BMAD source resolution/intake.

Post-merge focused verification for this closeout:

```text
pnpm run test:manager-control-plane:focused
19 passed, 0 failed
```

## Bounded continuous manager source-intake

Status: the explicit cycle landed as PR #521 at
`2dabb26143ca95a0f57f3595bc8d7ff1490d142c`; continuous manager integration
then merged as PR #523 at
`0dc2c2036edd80f23bea18d1c82033303414b449`. One bounded eligible
source-backed seed can now flow from refill/cycle/run-loop action selection to
a supervisor-owned WorkPacket. Full Gate 4 integrated MVP remains open.

The exact proof boundary is planner eligibility first, then explicit loopback
supervisor persistence. `manager:source-intake-cycle` calls the existing pure
source-backed seed planner before any adapter call and requires both the
planner packet state and seed eligibility decision to be exactly `eligible`.
Only then does it call the loopback-only adapter, POST allowlisted metadata to
`/pipeline-control-plane/work-packets`, validate the exact packet and
`packet.created` event identity, and annotate the cloned manager packet with
the persisted supervisor WorkPacket identity. Blocked, needs-review, and
dedupe/skipped states fail closed as typed blocked evidence with no fetch.

PR #523 wires that bounded action into the long-lived manager path without
making the defaults networked. Refill and cycle planning project the action
only when exactly one seed is eligible and an explicit uncredentialed loopback
supervisor URL is supplied. `continuous_dry_run` validates and selects the
canonical candidate/packet/source/supervisor target without fetching.
`continuous_apply` may invoke the cycle dry-run and then apply only when the
dry-run/apply command family and target pair agree and the distinct
`sourceIntake` capability and continuation gates remain open. Omitted URLs and
default seed/refill/cycle/run-loop operation remain network-free. Ineligible,
ambiguous, needs-review, dedupe/skipped, blocked, non-loopback, malformed, and
identity-conflicting states stop before fetch or fail closed.

The persisted boundary remains deliberately narrow: allowlisted metadata for
one source-backed seed is POSTed to the real loopback supervisor WorkPacket
route, exact `packet.created` identity is checked, and supervisor lifecycle and
pipeline projection truth are read back from disposable local SQLite. It does
not create CandidateWork, WorkItems, attempts, queue leases, workers, dispatch
actions, provider calls, or source mutations, and it does not automatically run
the separate terminal-event sync.

This is not evidence that arbitrary or broader BMAD source hierarchy is
resolved, selected, or ingested end to end. At this point the dashboard UI had
not yet been exercised as part of the source-intake path, so this evidence did
not claim `integrated_local` acceptance for that named path or full Gate 4
integrated MVP completion. The later, explicitly scoped closeout below records
the additional proof; it does not broaden the claim beyond that path.

PR #521 post-merge focused verification for the bounded cycle:

```text
pnpm run test:manager-source-intake
28 passed, 0 failed (Node); 1 passed (supervisor integration)
```

Current focused verification on PR #523 merge `0dc2c203`:

```text
pnpm run test:manager-source-intake
33 passed, 0 failed, 0 skipped (Node); 1 passed (supervisor integration)
pnpm run test:manager-control-plane:focused
19 passed, 0 failed
```

## Gate 4 named bounded source-intake path closeout

Status: `integrated_local` is accepted only for the named path below. The
canonical local worker-result continuation is proven by PR #531; this is not an
unaccepted worker-result path. Broader product requirements outside this named
path remain deferred.

The named path is: default local BMAD story-and-bundle resolution in the
manager, metadata-only manager intake of one eligible seed through the loopback
supervisor, canonical local worker-result continuation, authoritative
`WorkPacketV0` list/detail parity, and the matching dashboard `/pipeline` list
and packet-detail projection.

- PR #525 merged as `d3a27aa9e588ca23118ab984ec0ea979963d1cd9`. Its default,
  local-only resolver selects one ready BMAD story and its matching PRD bundle
  only when there are no explicit refill or source-work candidates. The manager
  preserves story, sprint-status, source-key, and bundle references as
  metadata-only provenance (`rawPayloadRetained=false`); story bodies,
  acceptance text, verification commands, prompts, and raw bundles do not
  cross the manager-to-supervisor intake boundary.
- PR #526 merged as `86418bae99b2bc41c438ccd1ffe47dbe90278ecd` from reviewed
  head `14423d4e11483fb051978366b63cc737c758f2df`. It makes the
  supervisor-owned authoritative `WorkPacketV0` visible with identical list
  and detail identities.
- PR #528, full metadata-only BMAD hierarchy, merged as
  `43f1309004f683a9c68db3878bd68e7402942eed`; CI 1014 was green.
- PR #529, real dashboard process proof, merged as
  `e4bd044f59bde7864155c88cb553a2a76915924d`; CI 1016 was green.
- PR #530, restart persistence, merged as
  `2a842eaadd29586f399f6a180a9da7520e8bfff6`; CI 1017 was green. It stops the
  first real supervisor and dashboard, restarts a fresh supervisor against the
  same disposable SQLite, reads the same authoritative lifecycle history and
  `WorkPacketV0` projection by exact packet ID, and reruns the real dashboard
  `/pipeline` list and packet-detail assertions without fixture substitution.
- PR #531, canonical worker-result continuation, merged as
  `59c3a5229b7ee1c1d1f6515e8b023ebfb787a755` from reviewed head
  `2fca4c49a7cb019e1f5797331f5666d52f43e209`; CI 1018 was green. Its 65
  manager tests plus the real worker-result/dashboard restart integration ran
  with zero skips. The server owns the WorkItem, attempt, lease, and evidence;
  stale fencing and duplicate idempotency are proven.

The accepted `integrated_local` label applies only to the reconciled
BMAD → manager → supervisor → local worker-result → dashboard path above, with
restart and persistence evidence. It does not imply `bounded_live` or
`production_observed`, provider/model calls, external workers, dispatch,
source mutation, or unattended execution. Any broader product requirement
outside this named path is deferred rather than a reason to call the path
unaccepted.

## Gate 4 canonical worker-result continuation evidence

The focused `pnpm run test:gate4-worker-result-loop` command proves the bounded
continuation through disposable loopback processes: reconciled manager
intake persists one supervisor packet, the explicit manager local-proof
continuation invokes only that packet's supervisor route, and the supervisor
records one linked WorkItem, completed attempt, verification evidence, queue
lease, and packet-ready-to-test evidence. The proof rejects stale lease fencing
and duplicate local-proof idempotency without a second attempt, restarts the
supervisor and dashboard against the same SQLite file, and reprojects the same
review packet and attempt lineage. It retains metadata only and proves no
provider, GitHub, Obsidian, source mutation, worker-process, or external-network
side effect.

Queue leases, attempts, evidence, and workflow/lifecycle events remain durable
metadata-only lineage; replay rebuilds the packet and linked WorkItem
materialized projections from preserved events.

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
