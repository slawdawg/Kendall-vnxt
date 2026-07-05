import {
  createLocalProofRuntimeAdapters,
  normalizeApprovedWorkspaceRootsForProof,
  normalizeProofRunIdForProof
} from "./adapters/local-proof-runtime-adapters.mjs";
import { buildBackendProofEvidencePacket, classifyBackendProofOperation } from "./forbidden-boundary.mjs";
import { toManagerSummaryJson } from "./summary-json.mjs";

export async function runBackendProofHarness({
  lifecycle,
  clock,
  candidates,
  workerId,
  approvedWorkspaceRoots,
  policyProofInput,
  claimLiveWorkerExecution = false
}) {
  const candidateArray = Array.isArray(candidates) ? candidates : null;
  const firstCandidate = candidateArray?.[0] ?? null;
  const proofRunId = normalizeProofRunIdForProof(firstCandidate?.runId);

  if (claimLiveWorkerExecution) {
    const decision = classifyBackendProofOperation("codex_worker.launch");
    return toManagerSummaryJson({
      ok: false,
      status: "blocked",
      blockers: [decision.authorityStopReason],
      warnings: ["backend_proof_simulated_no_live_worker_execution"],
      next_actions: ["remove_live_worker_claim_or_promote_authority_stage"],
      proof_boundary: buildBackendProofEvidencePacket({
        runId: proofRunId,
        result: "blocked",
        evidenceRefs: ["backend-proof-live-worker-claim"]
      })
    });
  }

  if (!candidateArray) {
    return toManagerSummaryJson({
      ok: false,
      status: "blocked",
      blockers: ["backend_proof_requires_candidates_array"],
      warnings: ["backend_proof_simulated_no_live_worker_execution"],
      next_actions: ["provide_fixture_candidates_array"],
      proof_boundary: buildBackendProofEvidencePacket({
        runId: "unknown-run",
        result: "blocked",
        evidenceRefs: ["backend-proof-invalid-candidates"]
      })
    });
  }

  if (proofRunId === "unknown-run") {
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

  const normalizedWorkspaceRoots = normalizeApprovedWorkspaceRootsForProof(approvedWorkspaceRoots);
  if (!normalizedWorkspaceRoots) {
    return toManagerSummaryJson({
      ok: false,
      status: "blocked",
      blockers: ["backend_proof_requires_approved_workspace_roots"],
      warnings: ["backend_proof_simulated_no_live_worker_execution"],
      next_actions: ["provide_explicit_safe_approved_workspace_roots"],
      proof_boundary: buildBackendProofEvidencePacket({
        runId: proofRunId,
        result: "blocked",
        evidenceRefs: ["runtime-port:approved-workspace-roots-invalid"],
        runtimeProof: {
          status: "blocked",
          blocker: "approved_workspace_roots_invalid",
          raw_payload_retained: false
        }
      })
    });
  }

  const runtimePorts = createLocalProofRuntimeAdapters({
    lifecycle,
    clock,
    runId: proofRunId,
    approvedWorkspaceRoots: normalizedWorkspaceRoots
  });
  const adapter = runtimePorts.queue;
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
        runId: proofRunId,
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
        runId: proofRunId,
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
        runId: proofRunId,
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
        runId: proofRunId,
        result: "blocked",
        evidenceRefs: ["evidence-heartbeat"]
      })
    });
  }

  const claimedVerificationTarget = heartbeat.value.workItem.verificationTargets[0];
  const verification = await runtimePorts.verification.verify({
    target: claimedVerificationTarget,
    workItemId: heartbeat.value.workItem.workItemId,
    attemptId: heartbeat.value.lease.attemptId,
    evidenceRefs: ["runtime-port:verification-metadata-proof"]
  });
  const approvedWorkspaceRoot = normalizedWorkspaceRoots[0];
  const session = await runtimePorts.session.prepareSession({
    workItemId: heartbeat.value.workItem.workItemId,
    branchName: "codex/backend-proof-harness",
    worktreePath: `${approvedWorkspaceRoot}backend-proof-harness-${proofRunId}`,
    evidenceRefs: ["runtime-port:session-metadata-proof"]
  });
  const policy = await runtimePorts.policy.evaluate(policyProofInput ?? {
    authorityFamily: "dispatcher_lifecycle",
    operation: "claim",
    scope: "backend-proof queue",
    evidenceRefs: ["runtime-port:policy-simulated-proof"]
  });
  const runtimeProof = buildRuntimePortProof({ runtimePorts, verification, session, policy });
  if (!verification.ok || !session.ok || !policy.ok || policy.value.wouldAllowIfAuthoritative !== true) {
    await adapter.fail({
      leaseId: heartbeat.value.lease.leaseId,
      workerId,
      attemptId: heartbeat.value.lease.attemptId,
      idempotencyKey: heartbeat.value.lease.idempotencyKey,
      authorityDecisionId: heartbeat.value.lease.authorityDecisionId,
      evidenceRefs: ["runtime-port:metadata-proof-failed"],
      failureReason: "runtime port metadata proof failed"
    });
    return toManagerSummaryJson({
      ok: false,
      status: "blocked",
      blockers: ["runtime_port_metadata_proof_failed"],
      warnings: ["backend_proof_simulated_no_live_worker_execution"],
      next_actions: ["inspect_runtime_port_metadata_proof_inputs"],
      proof_boundary: buildBackendProofEvidencePacket({
        runId: proofRunId,
        result: "blocked",
        evidenceRefs: [
          ...runtimeProofEvidenceRefs({ verification, session, policy }),
          "runtime-port:metadata-proof-failed"
        ],
        runtimeProof
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
        runId: proofRunId,
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
      runId: proofRunId,
      result: "completed",
      evidenceRefs: [
        ...summary.evidenceRefs,
        ...runtimeProofEvidenceRefs({ verification, session, policy })
      ],
      runtimeProof
    })
  });
}

function runtimeProofEvidenceRefs(results) {
  return [
    ...acceptedEvidenceRefs(results.verification),
    ...acceptedEvidenceRefs(results.session),
    ...acceptedEvidenceRefs(results.policy)
  ];
}

function acceptedEvidenceRefs(result) {
  return Array.isArray(result?.evidenceRefs) ? result.evidenceRefs : [];
}

function buildRuntimePortProof({ runtimePorts, verification, session, policy }) {
  return {
    schema_version: "manager_control_plane.runtime_port_proof.v1",
    status: verification.ok && session.ok && policy.ok && policy.value.wouldAllowIfAuthoritative === true
      ? "metadata_proof_only"
      : "blocked",
    adapters: {
      queue: descriptorProof(runtimePorts.queue.descriptor),
      verification: descriptorProof(runtimePorts.verification.descriptor),
      session: descriptorProof(runtimePorts.session.descriptor),
      policy: descriptorProof(runtimePorts.policy.descriptor)
    },
    verification: verification.ok
      ? {
        status: verification.value.status,
        verification_target_id: verification.value.target.verificationTargetId,
        command_id: verification.value.target.commandId,
        command_digest: verification.value.target.commandDigest,
        expected_result_digest: verification.value.target.expectedResultDigest,
        command_execution_attempted: verification.value.commandExecutionAttempted,
        raw_payload_retained: verification.value.rawPayloadRetained,
        evidence_refs: verification.evidenceRefs
      }
      : {
        status: "blocked",
        code: verification.code ?? "verification_proof_failed",
        evidence_refs: acceptedEvidenceRefs(verification)
      },
    session: session.ok
      ? {
        status: "metadata_proof_only",
        session_id: session.value.sessionId,
        approved_workspace_root: session.value.approvedWorkspaceRoot,
        process_launch_attempted: session.value.processLaunchAttempted,
        filesystem_mutation_attempted: session.value.filesystemMutationAttempted,
        credential_access_attempted: session.value.credentialAccessAttempted,
        network_access_attempted: session.value.networkAccessAttempted,
        raw_payload_retained: session.value.rawPayloadRetained,
        evidence_refs: session.evidenceRefs
      }
      : {
        status: "blocked",
        code: session.code ?? "session_proof_failed",
        evidence_refs: acceptedEvidenceRefs(session)
      },
    policy: policy.ok
      ? {
        status: "metadata_proof_only",
        authority_decision_id: policy.value.decision.authorityDecisionId,
        decision: policy.value.decision.decision,
        would_allow_if_authoritative: policy.value.wouldAllowIfAuthoritative,
        allowed: policy.value.allowed,
        simulated_only: policy.value.simulatedOnly,
        raw_payload_retained: policy.value.rawPayloadRetained,
        evidence_refs: policy.evidenceRefs
      }
      : {
        status: "blocked",
        code: policy.code ?? "policy_proof_failed",
        evidence_refs: acceptedEvidenceRefs(policy)
      },
    raw_payload_retained: false
  };
}

function descriptorProof(descriptor) {
  return {
    adapter_id: descriptor.adapterId,
    kind: descriptor.kind,
    mode: descriptor.mode,
    authority_stage: descriptor.authorityStage,
    local_proof_only: descriptor.localProofOnly,
    state_retention: descriptor.stateRetention,
    tool_native_state_retained: descriptor.toolNativeStateRetained,
    native_queue_state_retained: descriptor.nativeQueueStateRetained,
    raw_payload_retained: descriptor.rawPayloadRetained,
    evidence_refs: descriptor.evidenceRefs
  };
}
