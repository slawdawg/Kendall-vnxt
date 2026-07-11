# BMAD Gate 4B: Canonical Integrated-Local Lifecycle Proof

Status: review

This ignored story is review/closeout evidence for Gate 4B. It is intentionally metadata-only and is not a source authority record or production authority record. The proof uses the tracked source-owned workflow authority below; this story is not used to seed the authoritative packet.

The proof uses one authoritative source-backed WorkPacket created through the supervisor FastAPI backend with disposable SQLite. The supervisor creates the linked WorkItem and drives that same packet through capture, queue/lease, utility adapter execution, verification evidence, review/Ready-to-Test, server-bound approval/pass, and projection. The WorkItem route is private; the packet route owns the lifecycle. The server capability is disabled by default and enabled in smoke only through a test-only server dependency identity, never from caller proofMode. The proof also exercises tracked source digest/path validation, canonical packet/WorkItem state agreement, durable accepted/rejected lease-action idempotency, completion fencing rejection, metadata redaction, a real engine/session reload, and a separate event-reconstruction rebuild from preserved lifecycle/workflow events.

Evidence level: integrated_local.

The proof does not exercise providers, external workers, process launch, shell execution, network, credentials, GitHub, tmux, source mutation, or raw output retention. It does not claim live or production evidence, and does not claim full Gate 4 evidence.

Source authority:

```text
docs/workflows/latest-prd-autonomous-bmad-loop-goal.md
```

## Closeout evidence

Exact proof command and result:

```text
timeout 180s uv run --directory services/supervisor python scripts/pipeline_operational_smoke.py
exit 0; emitted status=passed, evidenceLevel=integrated_local, canonicalSourcePacketLifecycleVerified=true, canonicalPacketWorkItemStateAgreementVerified=true, authoritativePacketApprovalPassVerified=true, serverBoundLocalProofAuthorityVerified=true, serverCapabilityBoundaryVerified=true, sourceAuthorityDigestVerified=true, sourceTraversalRejected=true, leaseAttemptFencingVerified=true, leaseActionIdempotencyVerified=true, completionFencingRejected=true, engineSessionReloadVerified=true, engineReloadLineageVerified=true, eventReconstructionReplayVerified=true, happyLocalProofVerified=true, workerFailureHeldVerified=true, verificationFailureHeldVerified=true, leaseHeartbeatFencingExpiryVerified=true, persistedDatabaseStateVerified=true, projectionLifecycleLineageVerified=true, rawPayloadRetained=false
```

Focused verification:

```text
timeout 120s uv run --directory services/supervisor pytest tests/integration/test_work_packets.py -q -k 'execution_attempt or pipeline_operational or operational_action'
2 passed, 46 deselected
timeout 120s uv run --directory services/supervisor pytest tests/integration/test_routing_preview.py -q -k 'execution_attempt or verification_evidence or utility'
13 passed, 153 deselected
node --test tests/pipeline-gate3-approval.test.mjs tests/pipeline-control-plane-lifecycle.test.mjs tests/dashboard-pipeline-fixtures.test.mjs
3 passed
timeout 60s uv run --directory services/supervisor python -m compileall -q src scripts/pipeline_operational_smoke.py
exit 0
timeout 120s pnpm --filter @kendall/dashboard exec tsc --noEmit
exit 0
timeout 120s apps/dashboard/node_modules/.bin/tsc -p packages/contracts/tsconfig.json --noEmit
exit 0
git diff --check
exit 0
```

The sandbox cannot complete `aiosqlite.connect()`; the exact SQLite proof was therefore run outside the sandbox with the bounded timeout above. Event reconstruction is limited to the authoritative packet and linked WorkItem materialized rows; queue leases, attempts, and metadata-only evidence rows remain durable lineage records. This is integrated-local supervisor evidence only. It does not prove external workers, providers, process launch, shell execution, network, credentials, GitHub, tmux, source mutation, or live/production authority, and does not claim full Gate 4.
