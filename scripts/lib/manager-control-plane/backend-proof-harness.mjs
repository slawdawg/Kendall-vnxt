import { createMemoryDispatcherAdapter } from "./adapters/memory-dispatcher-adapter.mjs";
import { buildBackendProofEvidencePacket, classifyBackendProofOperation } from "./forbidden-boundary.mjs";
import { toManagerSummaryJson } from "./summary-json.mjs";

export async function runBackendProofHarness({
  lifecycle,
  clock,
  candidates,
  workerId,
  claimLiveWorkerExecution = false
}) {
  if (claimLiveWorkerExecution) {
    const decision = classifyBackendProofOperation("codex_worker.launch");
    return toManagerSummaryJson({
      ok: false,
      status: "blocked",
      blockers: [decision.authorityStopReason],
      warnings: ["backend_proof_simulated_no_live_worker_execution"],
      next_actions: ["remove_live_worker_claim_or_promote_authority_stage"],
      proof_boundary: buildBackendProofEvidencePacket({
        runId: candidates[0]?.runId ?? "unknown-run",
        result: "blocked",
        evidenceRefs: ["backend-proof-live-worker-claim"]
      })
    });
  }

  if (!candidates[0]?.runId) {
    return toManagerSummaryJson({
      ok: false,
      status: "blocked",
      blockers: ["backend_proof_requires_explicit_run_id"],
      warnings: ["backend_proof_simulated_no_live_worker_execution"],
      next_actions: ["provide_fixture_candidate_with_run_id"],
      proof_boundary: buildBackendProofEvidencePacket({
        runId: "unknown-run",
        result: "blocked",
        evidenceRefs: ["backend-proof-missing-run-id"]
      })
    });
  }

  const adapter = createMemoryDispatcherAdapter({ lifecycle, clock, runId: candidates[0].runId });
  const refill = await adapter.refill({
    candidates,
    evidenceRefs: ["evidence-refill"],
    policyReason: "fixture-backed backend proof source"
  });
  if (!refill.ok) {
    return toManagerSummaryJson({
      ok: false,
      status: "blocked",
      blockers: [refill.message],
      warnings: ["backend_proof_simulated_no_live_worker_execution"],
      next_actions: ["inspect_refill_evidence"],
      proof_boundary: buildBackendProofEvidencePacket({
        runId: candidates[0].runId,
        result: "blocked",
        evidenceRefs: ["evidence-refill"]
      })
    });
  }
  if (refill.value.queuedWorkItems.length === 0) {
    const summary = await adapter.summarize();
    return toManagerSummaryJson({
      ok: true,
      status: "no_safe_work",
      summary,
      blockers: [],
      warnings: summary.warnings,
      next_actions: ["await_safe_backlog"],
      proof_boundary: buildBackendProofEvidencePacket({
        runId: candidates[0].runId,
        result: "no_safe_work",
        evidenceRefs: summary.evidenceRefs
      })
    });
  }

  const claim = await adapter.claim({ workerId, evidenceRefs: ["evidence-claim"] });
  if (!claim.ok) {
    return toManagerSummaryJson({
      ok: false,
      status: "blocked",
      blockers: [claim.message],
      warnings: ["backend_proof_simulated_no_live_worker_execution"],
      next_actions: ["inspect_claim_evidence"],
      proof_boundary: buildBackendProofEvidencePacket({
        runId: candidates[0].runId,
        result: "blocked",
        evidenceRefs: ["evidence-claim"]
      })
    });
  }

  const heartbeat = await adapter.heartbeat({
    leaseId: claim.value.lease.leaseId,
    workerId,
    attemptId: claim.value.lease.attemptId,
    idempotencyKey: claim.value.lease.idempotencyKey,
    authorityDecisionId: claim.value.lease.authorityDecisionId,
    evidenceRefs: ["evidence-heartbeat"],
    ttlMs: 300_000
  });
  if (!heartbeat.ok) {
    return toManagerSummaryJson({
      ok: false,
      status: "blocked",
      blockers: [heartbeat.message],
      warnings: ["backend_proof_simulated_no_live_worker_execution"],
      next_actions: ["inspect_heartbeat_evidence"],
      proof_boundary: buildBackendProofEvidencePacket({
        runId: candidates[0].runId,
        result: "blocked",
        evidenceRefs: ["evidence-heartbeat"]
      })
    });
  }

  const complete = await adapter.complete({
    leaseId: claim.value.lease.leaseId,
    workerId,
    attemptId: claim.value.lease.attemptId,
    idempotencyKey: claim.value.lease.idempotencyKey,
    authorityDecisionId: claim.value.lease.authorityDecisionId,
    evidenceRefs: ["evidence-complete"],
    resultSummary: "fake worker completed backend proof lease"
  });
  if (!complete.ok) {
    return toManagerSummaryJson({
      ok: false,
      status: "blocked",
      blockers: [complete.message],
      warnings: ["backend_proof_simulated_no_live_worker_execution"],
      next_actions: ["inspect_completion_evidence"],
      proof_boundary: buildBackendProofEvidencePacket({
        runId: candidates[0].runId,
        result: "blocked",
        evidenceRefs: ["evidence-complete"]
      })
    });
  }

  const summary = await adapter.summarize();
  return toManagerSummaryJson({
    ok: true,
    status: "completed",
    summary,
    blockers: [],
    warnings: summary.warnings,
    next_actions: ["continue_to_summary_projection_story"],
    proof_boundary: buildBackendProofEvidencePacket({
      runId: candidates[0].runId,
      result: "completed",
      evidenceRefs: summary.evidenceRefs
    })
  });
}
