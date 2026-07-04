export function toManagerSummaryJson({ ok, status, summary = null, blockers = [], warnings = [], next_actions = [], proof_boundary = null }) {
  const boundedSummary = summary ? pickManagerSummaryFields(summary) : null;
  return {
    ok,
    status,
    summary: boundedSummary,
    blockers,
    warnings,
    next_actions,
    proof: {
      ...(boundedSummary
        ? {
          mode: boundedSummary.proofMode,
          state_source: boundedSummary.stateSource,
          event_watermark: boundedSummary.eventWatermark,
          source_cursor: boundedSummary.sourceCursor,
          evidence_refs: boundedSummary.evidenceRefs,
          evidence_links: boundedSummary.evidenceLinks,
          metadata_only: true,
          raw_payload_retained: false
        }
        : {
          mode: "unknown",
          state_source: "unknown",
          event_watermark: null,
          source_cursor: null,
          evidence_refs: [],
          metadata_only: true,
          raw_payload_retained: false
        }),
      boundary: proof_boundary
    }
  };
}

function pickManagerSummaryFields(summary) {
  return {
    runId: summary.runId,
    proofMode: summary.proofMode,
    stateSource: summary.stateSource,
    lastObservedAt: summary.lastObservedAt,
    lastMeaningfulProgressAt: summary.lastMeaningfulProgressAt ?? null,
    freshness: summary.freshness,
    unknownReason: summary.unknownReason ?? null,
    authorityBlockedReason: summary.authorityBlockedReason ?? null,
    authorityStopReason: summary.authorityStopReason ?? null,
    currentPhase: summary.currentPhase,
    nextAction: summary.nextAction,
    operatorAttentionRequired: summary.operatorAttentionRequired,
    attentionReason: summary.attentionReason ?? null,
    recoveryStatus: summary.recoveryStatus,
    recoveryAttemptCount: summary.recoveryAttemptCount,
    lastRecoveryAt: summary.lastRecoveryAt ?? null,
    safeWorkAvailableCount: summary.safeWorkAvailableCount,
    unsafeOrGatedWorkCount: summary.unsafeOrGatedWorkCount,
    evidenceFreshness: summary.evidenceFreshness,
    eventWatermark: summary.eventWatermark,
    sourceCursor: summary.sourceCursor,
    authorityStage: summary.authorityStage,
    authorityClass: summary.authorityClass,
    queuedWorkItemIds: summary.queuedWorkItemIds,
    activeWorkItemIds: summary.activeWorkItemIds,
    evidenceRefs: summary.evidenceRefs,
    evidenceLinks: summary.evidenceLinks ?? [],
    stateCounts: summary.stateCounts,
    rawStateLabels: summary.rawStateLabels,
    blockers: summary.blockers,
    warnings: summary.warnings,
    feedbackRoutes: summary.feedbackRoutes ?? [],
    affectedDeliveryGates: summary.affectedDeliveryGates ?? [],
    feedbackRecordPolicy: "metadata_only_feedback_record",
    feedbackUnrelatedLanePolicy: "continue_unrelated_safe_lanes",
    feedbackRetention: "metadata_only",
    feedbackRawPayloadRetained: false
  };
}
