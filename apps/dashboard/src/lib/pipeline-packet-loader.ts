import type { PipelineOperationalActionResultV0 } from "@kendall/contracts";
import type {
  DashboardCanonicalActiveBoardProjectionV1,
  DashboardCanonicalOperationalProjectionTruthV1,
  DashboardCanonicalOperationalProjectionV1,
} from "./pipeline/canonical-operational-projection";

import {
  getDashboardCanonicalOperationalProjection,
  getWorkPacket,
  getWorkPackets,
  type DashboardCanonicalPresentationV1,
  type DashboardCanonicalWorkPacketV1,
} from "./pipeline-supervisor-runtime";

/** The only canonical form that is allowed to cross the dashboard client boundary. */
export type DashboardCanonicalWorkPacketClientV1 = {
  presentation: DashboardCanonicalPresentationV1;
};

function projectDashboardCanonicalPacketForClient(
  packet: DashboardCanonicalWorkPacketV1,
): DashboardCanonicalWorkPacketClientV1 {
  return {
    presentation: packet.presentation,
  };
}
export type PipelineCockpitPacketLoad = {
  fixtureMode: PipelineRuntimeSourceState;
  /** Client-safe canonical source state for the dashboard cockpit. */
  canonicalPackets: DashboardCanonicalWorkPacketClientV1[];
  /** Versioned dashboard-owned truth used to gate operational actions. */
  operationalTruth?: DashboardCanonicalOperationalProjectionTruthV1 | null;
  /** Strict dashboard-owned board model; the upstream V0 envelope stays server-side. */
  operationalProjection: DashboardCanonicalOperationalProjectionV1 | null;
  /** Independently reconstructed client-safe model for normal/LAN active-board rendering. */
  activeBoardProjection: DashboardCanonicalActiveBoardProjectionV1 | null;
  projectionError: string | null;
};

export type PipelineCockpitPacketDetailLoad = {
  fixtureMode: PipelineRuntimeSourceState;
  /** Canonical source state; PacketDetailPage owns the remaining presentation adapter. */
  canonicalPacket: DashboardCanonicalWorkPacketV1 | null;
  /** Independently reconstructed client-safe V1 work-graph evidence. */
  workGraph: DashboardCanonicalOperationalProjectionV1["selectedPacketDetails"][number]["workGraph"] | null;
};

export type PipelineRuntimeSourceState = {
  kind: "runtime" | "stale" | "empty" | "unavailable" | "invalid" | "demo";
  label: string;
  summary: string;
  matrixRows: number;
  fixtureCatalogEntries: number;
  canSatisfyLiveProof: boolean;
};

async function readWorkPackets() {
  return getWorkPackets();
}

async function readWorkPacket(packetId: CanonicalRuntimePacketId) {
  return getWorkPacket(packetId);
}

async function readPipelineDashboardProjection() {
  return getDashboardCanonicalOperationalProjection();
}

export async function loadPipelineCockpitPackets(): Promise<PipelineCockpitPacketLoad> {
  const projectionResult = await loadPipelineDashboardProjection();
  if (projectionResult.error) {
    return {
      fixtureMode: projectionReadErrorSourceState(projectionResult.error),
      canonicalPackets: [],
      operationalProjection: null,
      activeBoardProjection: null,
      projectionError: projectionResult.error,
    };
  }
  const projectionRuntimeError = runtimeProjectionError(projectionResult.projection, "list");
  if (projectionRuntimeError) {
    return {
      fixtureMode: runtimeSourceState(
        projectionRuntimeError.kind,
        projectionRuntimeError.kind === "invalid" ? "Supervisor invalid" : "Supervisor unavailable",
        projectionRuntimeError.summary,
      ),
      canonicalPackets: [],
      operationalProjection: null,
      activeBoardProjection: null,
      projectionError: projectionRuntimeError.summary,
    };
  }
  const verifiedProjection = projectionResult.projection;
  if (!verifiedProjection) {
    return {
      fixtureMode: runtimeSourceState("invalid", "Supervisor invalid", "Supervisor projection is missing after runtime validation; no runtime or demo packets are shown."),
      canonicalPackets: [],
      operationalProjection: null,
      activeBoardProjection: null,
      projectionError: "Supervisor projection is missing after runtime validation.",
    };
  }
  try {
    const canonicalPackets = await readWorkPackets();
    if (canonicalPackets.length === 0) {
      const emptyContradiction = emptyRuntimeContradiction(projectionResult.projection);
      if (emptyContradiction) {
        return {
          fixtureMode: runtimeSourceState("invalid", "Supervisor invalid", `${emptyContradiction} No runtime or demo packets are shown.`),
          canonicalPackets: [],
          operationalProjection: null,
          activeBoardProjection: null,
          projectionError: emptyContradiction,
        };
      }
      return {
        fixtureMode: runtimeSourceState("empty", "Supervisor empty", emptyRuntimeSummary(projectionResult.projection)),
        canonicalPackets: canonicalPackets.map(projectDashboardCanonicalPacketForClient),
        operationalTruth: clientSafeOperationalTruth(verifiedProjection),
        operationalProjection: clientSafeOperationalProjection(verifiedProjection),
        activeBoardProjection: clientSafeActiveBoardProjection(verifiedProjection),
        projectionError: projectionResult.error,
      };
    }
    const packetIds = canonicalPackets.map((packet) => packet.authoritativeLifecycle.packetId);
    if (new Set(packetIds).size !== packetIds.length) {
      return {
        fixtureMode: runtimeSourceState("invalid", "Supervisor invalid", "Canonical supervisor packet identities are duplicated; no runtime or demo packets are shown."),
        canonicalPackets: [],
        operationalProjection: null,
        activeBoardProjection: null,
        projectionError: "Canonical supervisor packet identities are duplicated.",
      };
    }
    const packetContradiction = canonicalStaleProjectionTruth(verifiedProjection)
      ? staleRuntimeContradiction(verifiedProjection) ?? packetIdentityContradiction(verifiedProjection, packetIds)
      : populatedRuntimeContradiction(verifiedProjection, packetIds);
    if (packetContradiction) {
      return {
        fixtureMode: runtimeSourceState("invalid", "Supervisor invalid", `${packetContradiction} No runtime or demo packets are shown.`),
        canonicalPackets: [],
        operationalProjection: null,
        activeBoardProjection: null,
        projectionError: packetContradiction,
      };
    }
    return {
      fixtureMode: runtimeSourceState(
        canonicalStaleProjectionTruth(verifiedProjection) ? "stale" : "runtime",
        canonicalStaleProjectionTruth(verifiedProjection) ? "Supervisor stale read-only" : "Supervisor runtime",
        canonicalStaleProjectionTruth(verifiedProjection)
          ? "Persisted supervisor canonical packet rows are stale and read-only; no provider, worker, GitHub, or Obsidian calls are made by this route."
          : "Persisted supervisor canonical packet rows only. No provider, worker, GitHub, or Obsidian calls are made by this route.",
      ),
      canonicalPackets: canonicalPackets.map(projectDashboardCanonicalPacketForClient),
      operationalTruth: clientSafeOperationalTruth(verifiedProjection),
      operationalProjection: clientSafeOperationalProjection(verifiedProjection),
      activeBoardProjection: clientSafeActiveBoardProjection(verifiedProjection),
      projectionError: projectionResult.error,
    };
  } catch (error) {
    const workPacketError = error && typeof error === "object" && "message" in error
      ? String(error.message)
      : "Supervisor canonical packet state could not be read.";
    return {
      fixtureMode: runtimeSourceState("unavailable", "Supervisor unavailable", "Supervisor canonical packet state could not be read; no demo packets are substituted."),
      canonicalPackets: [],
      operationalProjection: null,
      activeBoardProjection: null,
      projectionError: workPacketError,
    };
  }
}

function clientSafeOperationalTruth(projection: DashboardCanonicalOperationalProjectionV1): DashboardCanonicalOperationalProjectionTruthV1 {
  return {
    schemaVersion: "dashboard-canonical-operational-projection/v1",
    sourceUpdatedAt: projection.sourceUpdatedAt,
    staleAfterSeconds: projection.staleAfterSeconds,
    sourceLabel: projection.sourceLabel,
    freshnessState: projection.freshnessState,
    truthSummary: {
      label: projection.truthSummary.label,
      backendEmpty: projection.truthSummary.backendEmpty,
      backendUnavailable: projection.truthSummary.backendUnavailable,
      fixtureBacked: projection.truthSummary.fixtureBacked,
      stale: projection.truthSummary.stale,
    },
    backendReachability: { state: projection.backendReachability.state },
    fixtureMode: {
      enabled: projection.fixtureMode.enabled,
      canSatisfyLiveProof: projection.fixtureMode.canSatisfyLiveProof,
    },
    workPackets: projection.workPackets.map((packet) => ({ packetId: packet.packetId })),
  };
}

/**
 * Rebuild the active-board surface independently from the compatibility
 * operational projection.  This keeps V0-labelled payload shapes out of the
 * active-board contract and intentionally leaves detail-only evidence behind.
 */
function clientSafeActiveBoardProjection(
  projection: DashboardCanonicalOperationalProjectionV1,
): DashboardCanonicalActiveBoardProjectionV1 {
  return {
    schemaVersion: "dashboard-canonical-active-board/v1",
    projectionId: projection.projectionId,
    generatedAt: projection.generatedAt,
    sourceUpdatedAt: projection.sourceUpdatedAt,
    sourceLabel: projection.sourceLabel,
    freshnessState: projection.freshnessState,
    staleAfterSeconds: projection.staleAfterSeconds,
    backendReachability: {
      state: projection.backendReachability.state,
      checkedAt: projection.backendReachability.checkedAt,
      reason: projection.backendReachability.reason ?? null,
      summary: projection.backendReachability.summary,
    },
    fixtureMode: {
      enabled: projection.fixtureMode.enabled,
      reason: projection.fixtureMode.reason ?? null,
      allowedForEnvironment: projection.fixtureMode.allowedForEnvironment,
      visibleLabelRequired: true,
      canSatisfyLiveProof: false,
    },
    truthSummary: {
      label: projection.truthSummary.label,
      emptyReason: projection.truthSummary.emptyReason ?? null,
      backendEmpty: projection.truthSummary.backendEmpty,
      backendUnavailable: projection.truthSummary.backendUnavailable,
      fixtureBacked: projection.truthSummary.fixtureBacked,
      stale: projection.truthSummary.stale,
      summary: projection.truthSummary.summary,
    },
    stageSummaries: projection.stageSummaries.map((stage) => ({
      stage: stage.stage,
      label: stage.label,
      packetCount: stage.packetCount,
      sourceLabel: stage.sourceLabel,
      freshnessState: stage.freshnessState,
      emptyReason: stage.emptyReason ?? null,
    })),
    sourceStates: projection.sourceStates.map((source) => ({
      sourceId: source.sourceId,
      sourceRef: source.sourceRef,
      sourceKind: source.sourceKind,
      state: source.state,
      summary: source.summary,
      evidenceRefs: [...source.evidenceRefs],
      updatedAt: source.updatedAt,
      metadataOnly: true,
    })),
    workPackets: projection.workPackets.map((packet) => ({
      packetId: packet.packetId,
      title: packet.title,
      currentStage: packet.currentStage,
      status: packet.status,
      truthLabel: packet.truthLabel,
      sourceRef: clientSafeSourceRef(packet.sourceRef),
      canonicalContract: null,
      productModeMapping: null,
      blocker: packet.blocker,
      nextAction: packet.nextAction,
      unblocker: packet.unblocker,
      readyToTest: packet.readyToTest ? {
        readyId: packet.readyToTest.readyId,
        userFacingSummary: packet.readyToTest.userFacingSummary,
        testableSurface: packet.readyToTest.testableSurface,
        verificationRefs: [...packet.readyToTest.verificationRefs],
        evidenceRefs: [...packet.readyToTest.evidenceRefs],
        metadataOnly: true,
        rawPayloadRetained: false,
      } : null,
      evidenceRefs: [...packet.evidenceRefs],
      updatedAt: packet.updatedAt,
      metadataOnly: true,
    })),
    selectedPacketDetails: projection.selectedPacketDetails.flatMap((detail) => {
      // Detail-only evidence is not needed to render a board card. Omit an
      // incomplete legacy detail rather than making the active-board read
      // permissive or failing the complete canonical packet list.
      if (!isCompleteActiveBoardDetail(detail)) return [];
      return [{
      packetId: detail.packetId,
      sourceRefs: (detail.sourceRefs ?? []).map(clientSafeSourceRef),
      canonicalContract: null,
      productModeMapping: null,
      evidenceRefs: [...detail.evidenceRefs],
      currentStage: detail.currentStage,
      status: detail.status,
      truthLabel: detail.truthLabel,
      blocker: detail.blocker,
      nextAction: detail.nextAction,
      unblocker: detail.unblocker,
      readyToTest: detail.readyToTest ? {
        readyId: detail.readyToTest.readyId,
        userFacingSummary: detail.readyToTest.userFacingSummary,
        testableSurface: detail.readyToTest.testableSurface,
        verificationRefs: [...detail.readyToTest.verificationRefs],
        evidenceRefs: [...detail.readyToTest.evidenceRefs],
        metadataOnly: true,
        rawPayloadRetained: false,
      } : null,
      recentTransitionEventRefs: [...(detail.recentTransitionEventRefs ?? [])],
      latestTransitionEventRef: detail.latestTransitionEventRef ?? null,
      latestMovementSummary: detail.latestMovementSummary ?? null,
      canSatisfyLiveMovementProof: detail.canSatisfyLiveMovementProof === true,
      actionCapabilitiesV1: clientSafeActionCapabilitiesV1(detail.actionCapabilitiesV1) ?? [],
      actionCapabilities: clientSafeActiveBoardLegacyActionCapabilities(detail.actionCapabilities),
      reviewRoute: {
        schemaVersion: detail.reviewRoute.schemaVersion,
        availability: detail.reviewRoute.availability,
        packetId: detail.reviewRoute.packetId,
        routeState: detail.reviewRoute.routeState,
        reasonCode: detail.reviewRoute.reasonCode,
        reason: detail.reviewRoute.reason,
        safeFallback: detail.reviewRoute.safeFallback,
        exactIdentity: detail.reviewRoute.exactIdentity,
        issuanceState: detail.reviewRoute.issuanceState,
        findingSummary: {
          count: detail.reviewRoute.findingSummary.count,
          highestSeverity: detail.reviewRoute.findingSummary.highestSeverity,
          evidenceRefs: [...detail.reviewRoute.findingSummary.evidenceRefs],
        },
        dataClass: "metadata_only",
        execution: "none",
        deliveryEvidenceEligible: false,
        metadataOnly: true,
        rawPayloadRetained: false,
        retention: "metadata_only_evidence_references",
      },
      metadataOnly: true,
      }];
    }),
    managerSummary: {
      stateSource: projection.managerSummary.stateSource,
      reliabilityState: projection.managerSummary.reliabilityState,
      freshnessState: projection.managerSummary.freshnessState,
      activeLeaseCount: projection.managerSummary.activeLeaseCount,
      activeWorkerCount: projection.managerSummary.activeWorkerCount,
      dispatchableQueueCount: projection.managerSummary.dispatchableQueueCount,
      exhaustedSourceCount: projection.managerSummary.exhaustedSourceCount,
      sourceExhausted: projection.managerSummary.sourceExhausted,
      inactivityReason: projection.managerSummary.inactivityReason ?? null,
      summary: projection.managerSummary.summary,
      metadataOnly: true,
    },
    workerSummary: {
      freshnessState: projection.workerSummary.freshnessState,
      activeCount: projection.workerSummary.activeCount,
      stalledCount: projection.workerSummary.stalledCount,
      failedCount: projection.workerSummary.failedCount,
      unavailableCount: projection.workerSummary.unavailableCount,
      summary: projection.workerSummary.summary,
      metadataOnly: true,
    },
    reliabilityProblems: projection.reliabilityProblems.map((problem) => ({
      problemId: problem.problemId,
      kind: problem.kind,
      severity: problem.severity,
      likelyIssue: problem.likelyIssue,
      summary: problem.summary,
      evidenceRefs: [...problem.evidenceRefs],
      metadataOnly: true,
    })),
    gatedControls: projection.gatedControls.map((control) => ({
      controlId: control.controlId,
      operation: control.operation,
      status: control.status,
      authorityFamily: control.authorityFamily,
      stopLine: control.stopLine,
      nextAction: control.nextAction,
      packetId: control.packetId ?? null,
      evidenceRefs: [...control.evidenceRefs],
      metadataOnly: true,
    })),
    runtimeReadiness: projection.runtimeReadiness ? {
      schemaVersion: "dashboard-canonical-runtime-readiness/v1",
      readinessState: projection.runtimeReadiness.readinessState,
      operationalMode: projection.runtimeReadiness.operationalMode,
      freshnessState: projection.runtimeReadiness.freshnessState,
      capabilityState: projection.runtimeReadiness.capabilityState,
      typedReason: projection.runtimeReadiness.typedReason ?? null,
      checkedAt: projection.runtimeReadiness.checkedAt,
      expiresAt: projection.runtimeReadiness.expiresAt,
      summary: projection.runtimeReadiness.summary,
      actionCapabilitiesV1: clientSafeActionCapabilitiesV1(projection.runtimeReadiness.actionCapabilitiesV1) ?? [],
      evidenceRefs: [...projection.runtimeReadiness.evidenceRefs],
      metadataOnly: true,
      rawPayloadRetained: false,
    } : null,
    actionCapabilities: clientSafeActiveBoardLegacyActionCapabilities(projection.actionCapabilities),
    executeAdmission: {
      schemaVersion: "dashboard-canonical-execute-admission/v1",
      policyVersion: projection.executeAdmission.policyVersion ?? "supervisor-wip/v0",
      state: projection.executeAdmission.state ?? "unavailable",
      capacityAvailable: projection.executeAdmission.capacityAvailable ?? false,
      typedReason: projection.executeAdmission.typedReason ?? "runtime_unavailable",
      limits: projection.executeAdmission.limits ? {
        review: projection.executeAdmission.limits.review,
        deliver: projection.executeAdmission.limits.deliver,
        verification: projection.executeAdmission.limits.verification,
        operatorTesting: projection.executeAdmission.limits.operatorTesting,
      } : null,
      observed: projection.executeAdmission.observed ? {
        review: projection.executeAdmission.observed.review,
        deliver: projection.executeAdmission.observed.deliver,
        verification: projection.executeAdmission.observed.verification,
        operatorTesting: projection.executeAdmission.observed.operatorTesting,
      } : null,
      blockingDimensions: [...(projection.executeAdmission.blockingDimensions ?? [])],
      nextSafeAction: projection.executeAdmission.nextSafeAction ?? "Refresh the supervisor operational projection before acting.",
      evidenceRefs: [...(projection.executeAdmission.evidenceRefs ?? [])],
      metadataOnly: true,
      rawPayloadRetained: false,
    },
    queueSummary: {
      activeCount: projection.queueSummary.activeCount,
      blockedCount: projection.queueSummary.blockedCount,
      dispatchableCount: projection.queueSummary.dispatchableCount,
      gatedCount: projection.queueSummary.gatedCount,
      staleCount: projection.queueSummary.staleCount,
      emptyReason: projection.queueSummary.emptyReason ?? null,
      sourceExhausted: projection.queueSummary.sourceExhausted,
      summary: projection.queueSummary.summary,
    },
    evidenceRefs: [...projection.evidenceRefs],
    metadataOnly: true,
    rawPayloadRetained: false,
  };
}

const ACTIVE_BOARD_REVIEW_ROUTE_KEYS = new Set([
  "schemaVersion", "availability", "packetId", "routeState", "reasonCode", "reason", "safeFallback", "exactIdentity", "issuanceState",
  "findingSummary", "dataClass", "execution", "deliveryEvidenceEligible", "metadataOnly", "rawPayloadRetained", "retention",
]);
const ACTIVE_BOARD_REVIEW_FINDING_KEYS = new Set(["count", "highestSeverity", "evidenceRefs"]);

function isRecordWithOnlyKeys(value: unknown, keys: ReadonlySet<string>): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.keys(value).every((key) => keys.has(key));
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isCompleteActiveBoardReviewRoute(value: unknown): boolean {
  if (!isRecordWithOnlyKeys(value, ACTIVE_BOARD_REVIEW_ROUTE_KEYS)
    || value.schemaVersion !== "pipeline-review-route-evidence/v0"
    || !["available", "stale", "unavailable"].includes(String(value.availability))
    || typeof value.packetId !== "string"
    || !["report_only", "simulated", "blocked", "unavailable"].includes(String(value.routeState))
    || !["report_only", "simulated_completed", "immutable_identity_stale", "policy_vetoed", "review_blocked", "issuance_expired", "issuance_revoked", "issuance_cancelled", "review_evidence_unavailable"].includes(String(value.reasonCode))
    || typeof value.reason !== "string"
    || typeof value.safeFallback !== "string"
    || !["current", "changed", "unavailable"].includes(String(value.exactIdentity))
    || !["active", "expired", "revoked", "cancelled", "unavailable"].includes(String(value.issuanceState))
    || value.dataClass !== "metadata_only"
    || value.execution !== "none"
    || value.deliveryEvidenceEligible !== false
    || value.metadataOnly !== true
    || value.rawPayloadRetained !== false
    || value.retention !== "metadata_only_evidence_references"
    || !isRecordWithOnlyKeys(value.findingSummary, ACTIVE_BOARD_REVIEW_FINDING_KEYS)) {
    return false;
  }
  return typeof value.findingSummary.count === "number"
    && (value.findingSummary.highestSeverity === null || ["info", "low", "medium", "high"].includes(String(value.findingSummary.highestSeverity)))
    && isStringArray(value.findingSummary.evidenceRefs);
}

function isCompleteActiveBoardDetail(detail: DashboardCanonicalOperationalProjectionV1["selectedPacketDetails"][number]): boolean {
  const value = detail as unknown as Record<string, unknown>;
  if (typeof value.packetId !== "string"
    || !isStringArray(value.evidenceRefs)
    || !isStringArray(value.recentTransitionEventRefs)
    || !Array.isArray(value.sourceRefs)
    || !Array.isArray(value.actionCapabilities)
    || !Array.isArray(value.actionCapabilitiesV1)
    || typeof value.currentStage !== "string"
    || typeof value.status !== "string"
    || typeof value.truthLabel !== "string"
    || !["operator", "manager", "worker", "source", "system", "unknown"].includes(String(value.unblocker))
    || !(value.blocker === null || typeof value.blocker === "string")
    || !(value.nextAction === null || typeof value.nextAction === "string")
    || !(value.latestMovementSummary === null || typeof value.latestMovementSummary === "string")
    || !(value.latestTransitionEventRef === null || typeof value.latestTransitionEventRef === "string")
    || typeof value.canSatisfyLiveMovementProof !== "boolean"
    || value.canonicalContract !== null
    || value.productModeMapping !== null
    || value.metadataOnly !== true
    || !isCompleteActiveBoardReviewRoute(value.reviewRoute)) {
    return false;
  }
  const reviewRoute = value.reviewRoute as Record<string, unknown>;
  if (reviewRoute.packetId !== value.packetId) return false;
  if (value.readyToTest !== null && !isCompleteActiveBoardReadyToTest(value.readyToTest)) return false;
  return value.sourceRefs.every(isCompleteActiveBoardSourceRef)
    && value.actionCapabilities.every(isCompleteActiveBoardLegacyActionCapability)
    && value.actionCapabilitiesV1.every(isCompleteActiveBoardV1ActionCapability);
}

function isCompleteActiveBoardSourceRef(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const source = value as Record<string, unknown>;
  return typeof source.refId === "string" && typeof source.sourceType === "string"
    && (source.pathOrUrl === null || typeof source.pathOrUrl === "string")
    && (source.title === null || typeof source.title === "string")
    && (source.contentSha256 === null || typeof source.contentSha256 === "string");
}

function isCompleteActiveBoardReadyToTest(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const ready = value as Record<string, unknown>;
  return typeof ready.readyId === "string"
    && typeof ready.userFacingSummary === "string"
    && typeof ready.testableSurface === "string"
    && isStringArray(ready.verificationRefs)
    && isStringArray(ready.evidenceRefs)
    && ready.metadataOnly === true
    && ready.rawPayloadRetained === false;
}

function isCompleteActiveBoardLegacyActionCapability(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const capability = value as Record<string, unknown>;
  return typeof capability.actionId === "string"
    && typeof capability.targetType === "string"
    && (capability.targetId === null || typeof capability.targetId === "string")
    && typeof capability.capabilityState === "string"
    && typeof capability.authorityState === "string"
    && typeof capability.riskTier === "string"
    && (capability.typedReason === null || typeof capability.typedReason === "string")
    && typeof capability.expectedResultSummary === "string"
    && capability.correlationRequired === true
    && capability.idempotencyRequired === true
    && isStringArray(capability.evidenceRefs)
    && capability.metadataOnly === true
    && capability.rawPayloadRetained === false;
}

function isCompleteActiveBoardV1ActionCapability(value: unknown): boolean {
  if (!isCompleteActiveBoardLegacyActionCapability(value)) return false;
  const capability = value as Record<string, unknown>;
  return capability.schemaVersion === "pipeline-operational-action/v1"
    && capability.actionContext !== null
    && typeof capability.actionContext === "object"
    && typeof capability.actionContextDigestSha256 === "string"
    && typeof capability.sourceMode === "string"
    && capability.serverBound === true;
}

/**
 * Projection extensions are useful to server-side read assembly, but the
 * cockpit client receives a bounded operational board model. Do not serialize
 * contracts or mode mappings (including any permissive upstream extension
 * keys) over this boundary.
 */
function clientSafeOperationalProjection(projection: DashboardCanonicalOperationalProjectionV1): DashboardCanonicalOperationalProjectionV1 {
  return clientSafeProjectionMetadata({
    schemaVersion: "dashboard-canonical-operational-projection/v1",
    projectionId: projection.projectionId,
    generatedAt: projection.generatedAt,
    sourceUpdatedAt: projection.sourceUpdatedAt,
    sourceLabel: projection.sourceLabel,
    freshnessState: projection.freshnessState,
    staleAfterSeconds: projection.staleAfterSeconds,
    backendReachability: projection.backendReachability,
    fixtureMode: projection.fixtureMode,
    truthSummary: projection.truthSummary,
    stageSummaries: projection.stageSummaries,
    sourceStates: projection.sourceStates,
    workPackets: projection.workPackets.map((packet) => ({
      packetId: packet.packetId,
      title: packet.title,
      currentStage: packet.currentStage,
      status: packet.status,
      truthLabel: packet.truthLabel,
      sourceRef: clientSafeSourceRef(packet.sourceRef),
      canonicalContract: null,
      productModeMapping: null,
      blocker: packet.blocker,
      nextAction: packet.nextAction,
      unblocker: packet.unblocker,
      readyToTest: packet.readyToTest,
      evidenceRefs: packet.evidenceRefs,
      workItemId: packet.workItemId,
      queueLease: packet.queueLease,
      executionAttempts: packet.executionAttempts,
      correlationIds: packet.correlationIds,
      updatedAt: packet.updatedAt,
      metadataOnly: packet.metadataOnly,
    })),
    selectedPacketDetails: projection.selectedPacketDetails.map((detail) => ({
      packetId: detail.packetId,
      sourceRefs: detail.sourceRefs?.map(clientSafeSourceRef) ?? [],
      canonicalContract: null,
      productModeMapping: null,
      evidenceRefs: detail.evidenceRefs,
      currentStage: detail.currentStage,
      status: detail.status,
      truthLabel: detail.truthLabel,
      blocker: detail.blocker,
      nextAction: detail.nextAction,
      unblocker: detail.unblocker,
      readyToTest: detail.readyToTest,
      latestTransitionEventRef: detail.latestTransitionEventRef,
      recentTransitionEventRefs: detail.recentTransitionEventRefs,
      latestMovementSummary: detail.latestMovementSummary,
      canSatisfyLiveMovementProof: detail.canSatisfyLiveMovementProof,
      parentPacketId: detail.parentPacketId,
      lineageKind: detail.lineageKind,
      operatorTestState: detail.operatorTestState,
      operatorTestNote: detail.operatorTestNote,
      actionCapabilities: clientSafeLegacyActionCapabilities(detail.actionCapabilities),
      actionCapabilitiesV1: clientSafeActionCapabilitiesV1(detail.actionCapabilitiesV1),
      actionResults: clientSafeLegacyActionResults(detail.actionResults),
      workItemId: detail.workItemId,
      queueLease: detail.queueLease,
      executionAttempts: detail.executionAttempts,
      correlationIds: detail.correlationIds,
      reviewRoute: detail.reviewRoute,
      workGraph: clientSafeWorkGraph(detail.workGraph, detail.packetId),
      metadataOnly: detail.metadataOnly,
    })),
    managerSummary: projection.managerSummary,
    activeManagerLaneClarity: projection.activeManagerLaneClarity,
    coordinationHealth: projection.coordinationHealth,
    workerSummary: projection.workerSummary,
    reliabilityProblems: projection.reliabilityProblems,
    gatedControls: projection.gatedControls,
    runtimeReadiness: clientSafeRuntimeReadiness(projection.runtimeReadiness),
    actionCapabilities: clientSafeLegacyActionCapabilities(projection.actionCapabilities),
    actionCapabilitiesV1: clientSafeActionCapabilitiesV1(projection.actionCapabilitiesV1),
    executeAdmission: projection.executeAdmission,
    queueSummary: projection.queueSummary,
    evidenceRefs: projection.evidenceRefs,
  });
}

/** Build the independent dashboard V1 graph shape; never pass the V0 object through. */
function clientSafeWorkGraph(
  workGraph: DashboardCanonicalOperationalProjectionV1["selectedPacketDetails"][number]["workGraph"] | undefined,
  packetId: string,
): DashboardCanonicalOperationalProjectionV1["selectedPacketDetails"][number]["workGraph"] {
  if (!workGraph) {
    return {
      schemaVersion: "dashboard-canonical-work-graph/v1",
      sourceSchemaVersion: "parallel-execution-graph-reservation/v1",
      availability: "unavailable",
      packetId,
      executionJobId: null,
      reportIdentity: null,
      generatedAt: null,
      freshnessState: "unavailable",
      waveMembership: "unavailable",
      dependencyState: "unavailable",
      reservation: { status: "unavailable", owner: null, reasonCode: "work_graph_unavailable" },
      capacity: { posture: "unavailable", reasonCode: "work_graph_unavailable" },
      reason: "Supervisor work-graph evidence is unavailable.",
      nextSafeAction: "Refresh the supervisor-backed packet detail before acting.",
      evidenceRefs: [],
      metadataOnly: true,
      rawPayloadRetained: false,
      retention: "metadata_only_evidence_references",
    };
  }
  return {
    schemaVersion: "dashboard-canonical-work-graph/v1",
    sourceSchemaVersion: workGraph.sourceSchemaVersion,
    availability: workGraph.availability,
    packetId: workGraph.packetId,
    executionJobId: workGraph.executionJobId,
    reportIdentity: workGraph.reportIdentity,
    generatedAt: workGraph.generatedAt,
    freshnessState: workGraph.freshnessState,
    waveMembership: workGraph.waveMembership,
    dependencyState: workGraph.dependencyState,
    reservation: {
      status: workGraph.reservation.status,
      owner: workGraph.reservation.owner,
      reasonCode: workGraph.reservation.reasonCode,
    },
    capacity: {
      posture: workGraph.capacity.posture,
      reasonCode: workGraph.capacity.reasonCode,
    },
    reason: workGraph.reason,
    nextSafeAction: workGraph.nextSafeAction,
    evidenceRefs: [...workGraph.evidenceRefs],
    metadataOnly: true,
    rawPayloadRetained: false,
    retention: "metadata_only_evidence_references",
  };
}

/** Strip unknown nested extension keys as well as the explicit root/row allowlists. */
const CLIENT_SAFE_PROJECTION_METADATA_KEYS = new Set([
  "schemaVersion", "projectionId", "generatedAt", "sourceUpdatedAt", "sourceLabel", "freshnessState", "staleAfterSeconds", "backendReachability", "fixtureMode", "truthSummary", "stageSummaries", "sourceStates", "workPackets", "selectedPacketDetails", "managerSummary", "activeManagerLaneClarity", "coordinationHealth", "workerSummary", "reliabilityProblems", "gatedControls", "runtimeReadiness", "actionCapabilities", "actionCapabilitiesV1", "executeAdmission", "queueSummary", "evidenceRefs",
  "packetId", "title", "currentStage", "status", "truthLabel", "sourceRef", "canonicalContract", "productModeMapping", "blocker", "nextAction", "unblocker", "readyToTest", "workItemId", "queueLease", "executionAttempts", "correlationIds", "updatedAt", "metadataOnly", "sourceRefs", "latestTransitionEventRef", "recentTransitionEventRefs", "latestMovementSummary", "canSatisfyLiveMovementProof", "parentPacketId", "lineageKind", "operatorTestState", "operatorTestNote", "actionResults", "reviewRoute", "workGraph",
  "refId", "sourceType", "pathOrUrl", "contentSha256", "readyId", "userFacingSummary", "testableSurface", "verificationRefs", "rawPayloadRetained", "leaseId", "attemptCount", "heartbeatAt", "leaseExpiresAt", "fencingToken", "active", "state", "attemptId", "routeDecisionId", "workerId", "lane", "eventRefs", "availability", "routeState", "reasonCode", "reason", "safeFallback", "exactIdentity", "issuanceState", "findingSummary", "count", "highestSeverity", "dataClass", "execution", "deliveryEvidenceEligible", "retention", "sourceSchemaVersion", "executionJobId", "reportIdentity", "waveMembership", "dependencyState", "reservation", "capacity", "posture", "owner", "nextSafeAction",
  "label", "emptyReason", "backendEmpty", "backendUnavailable", "fixtureBacked", "stale", "summary", "stage", "packetCount", "sourceId", "sourceKind", "runId", "observedAt", "source", "freshness", "availability", "activeWorkCount", "staleOwnerTargetCount", "staleOwnerProjectedCount", "dirtyPreserveCount", "missingWorktreeJournalHold", "reliabilityState", "activeLeaseCount", "activeWorkerCount", "warmWorkerCount", "blockedQueueCount", "dispatchableQueueCount", "closedQueueCount", "healthySourceCount", "exhaustedSourceCount", "blockedSourceCount", "gatedSourceCount", "staleSourceCount", "unavailableSourceCount", "refillingSourceCount", "unknownSourceCount", "sourceExhausted", "inactivityReason", "warmCount", "waitingCount", "stalledCount", "failedCount", "drainingCount", "killedCount", "completeCount", "unavailableCount", "unknownCount", "workerRefs", "problemId", "kind", "severity", "likelyIssue", "controlId", "operation", "authorityFamily", "stopLine", "dispatchableCount", "blockedCount", "gatedCount", "limits", "observed", "blockingDimensions", "policyVersion", "capacityAvailable", "checkedAt", "enabled", "allowedForEnvironment", "visibleLabelRequired", "canSatisfyLiveProof",
  "actionId", "targetType", "targetId", "capabilityState", "authorityState", "riskTier", "typedReason", "expectedResultSummary", "correlationRequired", "idempotencyRequired", "actionContext", "actionContextDigestSha256", "sourceMode", "serverBound", "executionAttemptId", "expectedRuntimeMode", "expectedRuntimeRevision", "expectedActiveWorkCount", "expectedActiveLeaseCount", "expectedRunningAttemptCount", "expectedPacketCurrentEventId", "expectedCurrentOwnerId", "newOwnerId", "expectedWorkItemState", "expectedWorkItemUpdatedAt", "expectedAttemptStatus", "expectedAttemptUpdatedAt", "expectedLeaseId", "expectedLeaseFencingToken", "expectedLeaseActive", "expectedActiveLeaseId", "expectedRunningAttemptId", "expectedOriginalAttemptId", "expectedRetryIntentId", "expectedLinkedWorkItemId", "expectedLinkedPacketId", "outcome", "resultingStage", "resultingStatus", "actionRecordId", "approvalId", "childPacketId", "idempotencyKey", "successEvidence", "replayed", "originalAttemptId", "retryIntentId", "linkedWorkItemId", "linkedPacketId", "resultingPacketCurrentEventId", "originalAttemptPreserved", "providerOrWorkerLaunched", "resultingRuntimeMode", "resultingRuntimeRevision", "runningAttemptCount", "intakeStopped", "activeWorkPreserved", "activeWorkAllowedToConverge", "workersKilled", "intakeResumed", "previousOwnerId", "activeLeaseTransferred", "workerLaunched",
]);
[
  "executionAttemptId", "expectedAttemptStatus", "expectedAttemptUpdatedAt", "expectedLeaseId", "expectedLeaseFencingToken", "expectedLeaseActive",
  "stateSource", "activeCount", "closedCount", "staleCount", "refillingCount", "readinessState", "operationalMode", "actionSchemaVersion", "expiresAt", "correlationId",
].forEach((key) => CLIENT_SAFE_PROJECTION_METADATA_KEYS.add(key));

function clientSafeProjectionMetadata<T>(value: T): T {
  if (Array.isArray(value)) return value.map(clientSafeProjectionMetadata) as T;
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => CLIENT_SAFE_PROJECTION_METADATA_KEYS.has(key))
      .map(([key, nested]) => [key, clientSafeProjectionMetadata(nested)]),
  ) as T;
}

/** Source refs are a distinct schema: never apply the broad projection key list here. */
function clientSafeSourceRef<T extends { refId: string; sourceType: string; pathOrUrl?: string | null; title?: string | null; contentSha256?: string | null } | null>(sourceRef: T): T {
  if (!sourceRef) return sourceRef;
  return {
    refId: sourceRef.refId,
    sourceType: sourceRef.sourceType,
    pathOrUrl: sourceRef.pathOrUrl ?? null,
    title: sourceRef.title ?? null,
    contentSha256: sourceRef.contentSha256 ?? null,
  } as T;
}

const CLIENT_SAFE_ACTION_CONTEXT_KEYS: Record<string, readonly string[]> = {
  retry_verification: ["kind", "executionAttemptId", "linkedWorkItemId", "linkedPacketId", "expectedWorkItemState", "expectedWorkItemUpdatedAt", "expectedAttemptStatus", "expectedAttemptUpdatedAt", "expectedPacketCurrentEventId", "expectedLeaseId", "expectedLeaseFencingToken", "expectedLeaseActive"],
  pause: ["kind", "expectedRuntimeMode", "expectedRuntimeRevision"],
  drain: ["kind", "expectedRuntimeMode", "expectedRuntimeRevision", "expectedActiveWorkCount", "expectedActiveLeaseCount", "expectedRunningAttemptCount"],
  resume: ["kind", "expectedRuntimeMode", "expectedRuntimeRevision"],
  reassign: ["kind", "linkedWorkItemId", "expectedPacketCurrentEventId", "expectedCurrentOwnerId", "newOwnerId", "expectedWorkItemState", "expectedWorkItemUpdatedAt", "expectedActiveLeaseId", "expectedRunningAttemptId"],
};

function clientSafeActionContext<T>(context: T): T {
  if (!context || typeof context !== "object") return context;
  const record = context as Record<string, unknown>;
  const keys = typeof record.kind === "string" ? CLIENT_SAFE_ACTION_CONTEXT_KEYS[record.kind] : undefined;
  if (!keys) return context;
  return Object.fromEntries(keys.map((key) => [key, record[key]])) as T;
}

type V1ActionCapability = NonNullable<DashboardCanonicalOperationalProjectionV1["actionCapabilitiesV1"]>[number];

function clientSafeActionCapabilitiesV1(capabilities: readonly V1ActionCapability[] | undefined): V1ActionCapability[] | undefined {
  return capabilities?.map((capability) => ({
    schemaVersion: capability.schemaVersion,
    actionId: capability.actionId,
    targetType: capability.targetType,
    targetId: capability.targetId,
    actionContext: clientSafeActionContext(capability.actionContext),
    actionContextDigestSha256: capability.actionContextDigestSha256,
    sourceMode: capability.sourceMode,
    capabilityState: capability.capabilityState,
    authorityState: capability.authorityState,
    riskTier: capability.riskTier,
    typedReason: capability.typedReason,
    expectedResultSummary: capability.expectedResultSummary,
    correlationRequired: capability.correlationRequired,
    idempotencyRequired: capability.idempotencyRequired,
    serverBound: capability.serverBound,
    evidenceRefs: [...capability.evidenceRefs],
    metadataOnly: capability.metadataOnly,
    rawPayloadRetained: capability.rawPayloadRetained,
  })) as V1ActionCapability[];
}

function clientSafeRuntimeReadiness<T extends NonNullable<DashboardCanonicalOperationalProjectionV1["runtimeReadiness"]> | undefined>(readiness: T): T {
  if (!readiness) return readiness;
  return {
    schemaVersion: readiness.schemaVersion,
    actionSchemaVersion: readiness.actionSchemaVersion,
    readinessState: readiness.readinessState,
    operationalMode: readiness.operationalMode,
    freshnessState: readiness.freshnessState,
    capabilityState: readiness.capabilityState,
    typedReason: readiness.typedReason,
    checkedAt: readiness.checkedAt,
    expiresAt: readiness.expiresAt,
    summary: readiness.summary,
    actionCapabilities: readiness.actionCapabilities.map((capability) => ({
      actionId: capability.actionId,
      targetType: capability.targetType,
      targetId: capability.targetId ?? null,
      capabilityState: capability.capabilityState,
      authorityState: capability.authorityState,
      riskTier: capability.riskTier,
      typedReason: capability.typedReason,
      expectedResultSummary: capability.expectedResultSummary,
      correlationRequired: capability.correlationRequired,
      idempotencyRequired: capability.idempotencyRequired,
      evidenceRefs: [...capability.evidenceRefs],
      metadataOnly: capability.metadataOnly,
      rawPayloadRetained: capability.rawPayloadRetained,
    })),
    actionCapabilitiesV1: clientSafeActionCapabilitiesV1(readiness.actionCapabilitiesV1) ?? [],
    evidenceRefs: [...readiness.evidenceRefs],
    metadataOnly: readiness.metadataOnly,
    rawPayloadRetained: readiness.rawPayloadRetained,
  } as T;
}

type LegacyActionCapability = NonNullable<DashboardCanonicalOperationalProjectionV1["actionCapabilities"]>[number];
type LegacyActionResult = PipelineOperationalActionResultV0;

function clientSafeLegacyActionCapabilities(capabilities: readonly LegacyActionCapability[] | undefined): LegacyActionCapability[] | undefined {
  return capabilities?.map((capability) => ({
    actionId: capability.actionId,
    targetType: capability.targetType,
    targetId: capability.targetId ?? null,
    capabilityState: capability.capabilityState,
    authorityState: capability.authorityState,
    riskTier: capability.riskTier,
    typedReason: capability.typedReason,
    expectedResultSummary: capability.expectedResultSummary,
    correlationRequired: capability.correlationRequired,
    idempotencyRequired: capability.idempotencyRequired,
    evidenceRefs: [...capability.evidenceRefs],
    metadataOnly: capability.metadataOnly,
    rawPayloadRetained: capability.rawPayloadRetained,
  }));
}

function clientSafeActiveBoardLegacyActionCapabilities(capabilities: readonly LegacyActionCapability[] | undefined) {
  return (capabilities ?? []).map((capability) => ({
    actionId: capability.actionId,
    targetType: capability.targetType,
    targetId: capability.targetId ?? null,
    capabilityState: capability.capabilityState,
    authorityState: capability.authorityState,
    riskTier: capability.riskTier,
    typedReason: capability.typedReason,
    expectedResultSummary: capability.expectedResultSummary,
    correlationRequired: true as const,
    idempotencyRequired: true as const,
    evidenceRefs: [...capability.evidenceRefs],
    metadataOnly: true as const,
    rawPayloadRetained: false as const,
  }));
}

function clientSafeLegacyActionResults(results: readonly LegacyActionResult[] | undefined): LegacyActionResult[] | undefined {
  return results?.map((result) => ({
    schemaVersion: result.schemaVersion,
    actionId: result.actionId,
    targetType: result.targetType,
    targetId: result.targetId,
    outcome: result.outcome,
    resultingStage: result.resultingStage,
    resultingStatus: result.resultingStatus,
    capabilityState: result.capabilityState,
    authorityState: result.authorityState,
    riskTier: result.riskTier,
    typedReason: result.typedReason,
    evidenceRefs: [...result.evidenceRefs],
    correlationId: result.correlationId,
    idempotencyKey: result.idempotencyKey,
    actionRecordId: result.actionRecordId,
    approvalId: result.approvalId ?? null,
    childPacketId: result.childPacketId ?? null,
    metadataOnly: result.metadataOnly,
    rawPayloadRetained: result.rawPayloadRetained,
  })) as LegacyActionResult[];
}

export async function loadPipelineCockpitPacket(packetId: unknown): Promise<PipelineCockpitPacketDetailLoad> {
  const canonicalPacketId = toCanonicalRuntimePacketId(packetId);
  if (!canonicalPacketId) {
    return {
      fixtureMode: runtimeSourceState("invalid", "Supervisor packet invalid", "Malformed runtime packet identity; no supervisor lookup or demo packet substitution was attempted."),
      canonicalPacket: null,
      workGraph: null,
    };
  }
  const projectionResult = await loadPipelineDashboardProjection();
  if (projectionResult.error) {
    return { fixtureMode: projectionReadErrorSourceState(projectionResult.error), canonicalPacket: null, workGraph: null };
  }
  const projectionRuntimeError = runtimeProjectionError(projectionResult.projection, "detail");
  if (projectionRuntimeError) {
    return {
      fixtureMode: runtimeSourceState(
        projectionRuntimeError.kind,
        projectionRuntimeError.kind === "invalid" ? "Supervisor packet invalid" : "Supervisor unavailable",
        `${projectionRuntimeError.summary} No demo packet was substituted.`,
      ),
      canonicalPacket: null,
      workGraph: null,
    };
  }
  try {
    const canonicalPacket = await readWorkPacket(canonicalPacketId);
    if (canonicalPacket.authoritativeLifecycle.packetId !== canonicalPacketId) {
      return { fixtureMode: runtimeSourceState("invalid", "Supervisor packet invalid", "Supervisor returned a packet that did not match the requested runtime identity; no demo packet was substituted."), canonicalPacket: null, workGraph: null };
    }
    const detailProjectionContradictionMessage = detailProjectionContradiction(projectionResult.projection, canonicalPacketId, canonicalPacket);
    if (detailProjectionContradictionMessage) {
      return { fixtureMode: runtimeSourceState("invalid", "Supervisor packet invalid", `${detailProjectionContradictionMessage} No demo packet was substituted.`), canonicalPacket: null, workGraph: null };
    }
    const selectedDetail = projectionResult.projection?.selectedPacketDetails.find((detail) => detail.packetId === canonicalPacketId);
    return {
      fixtureMode: runtimeSourceState(
        projectionResult.projection && canonicalStaleProjectionTruth(projectionResult.projection) ? "stale" : "runtime",
        projectionResult.projection && canonicalStaleProjectionTruth(projectionResult.projection) ? "Supervisor stale read-only" : "Supervisor runtime",
        projectionResult.projection && canonicalStaleProjectionTruth(projectionResult.projection)
          ? "This detail is a stale, read-only canonical supervisor packet resolved by packet identity."
          : "This detail is a read-only canonical supervisor packet resolved by packet identity.",
      ),
      canonicalPacket,
      workGraph: selectedDetail ? clientSafeWorkGraph(selectedDetail.workGraph, selectedDetail.packetId) : null,
    };
  } catch (error) {
    const errorMessage = error && typeof error === "object" && "message" in error
      ? String(error.message)
      : String(error);
    const missing = /\(404\)/.test(errorMessage);
    return {
      fixtureMode: runtimeSourceState(missing ? "invalid" : "unavailable", missing ? "Supervisor packet missing" : "Supervisor unavailable", missing
        ? "Supervisor has no canonical packet detail for this packet identity; no demo packet was substituted."
        : "Supervisor canonical packet detail could not be read; no demo packet was substituted."),
      canonicalPacket: null,
      workGraph: null,
    };
  }
}

function runtimeSourceState(kind: PipelineRuntimeSourceState["kind"], label: string, summary: string): PipelineRuntimeSourceState {
  return { kind, label, summary, matrixRows: 0, fixtureCatalogEntries: 0, canSatisfyLiveProof: false };
}

function projectionReadErrorSourceState(error: string): PipelineRuntimeSourceState {
  const invalid = /invalid|malformed/i.test(error);
  return runtimeSourceState(
    invalid ? "invalid" : "unavailable",
    invalid ? "Supervisor invalid" : "Supervisor unavailable",
    `Supervisor projection could not be read; ${invalid ? "the returned state was invalid" : "the supervisor may be unavailable"}. No runtime or demo packets are shown.`,
  );
}

type CanonicalRuntimePacketId = string & { readonly __canonicalRuntimePacketId: unique symbol };

function toCanonicalRuntimePacketId(packetId: unknown): CanonicalRuntimePacketId | null {
  if (typeof packetId !== "string") {
    return null;
  }
  const normalizedPacketId = packetId.trim().toLowerCase();
  if (normalizedPacketId.startsWith("fixture:") || normalizedPacketId.startsWith("demo:")) {
    return null;
  }
  return packetId.trim() === packetId &&
    packetId.length > 0 &&
    packetId.length <= 200 &&
    !/[\s/\\\0]/.test(packetId)
    ? packetId as CanonicalRuntimePacketId
    : null;
}

function runtimeProjectionError(projection: DashboardCanonicalOperationalProjectionV1 | null, mode: "list" | "detail"): { kind: "invalid" | "unavailable"; summary: string } | null {
  if (!hasProjectionProofShape(projection)) {
    return { kind: "invalid", summary: "Supervisor projection is missing or malformed; no runtime or demo packets are shown." };
  }
  const freshness = projectionFreshnessState(projection);
  if (freshness?.kind === "invalid") {
    return { kind: "invalid", summary: freshness.summary };
  }
  if (freshness?.kind === "stale" && !canonicalStaleProjectionTruth(projection)) {
    return { kind: "invalid", summary: freshness.summary };
  }
  if (canonicalStaleProjectionTruth(projection) && freshness?.kind !== "stale") {
    return { kind: "invalid", summary: "Supervisor projection stale flags contradict fresh timestamps; no packets are shown." };
  }
  if (projection.fixtureMode?.enabled === true || projection.truthSummary?.fixtureBacked === true || projection.sourceLabel === "fixture") {
    return { kind: "invalid", summary: "Supervisor projection is fixture-backed; normal runtime mode refuses fixture truth." };
  }
  if (projection.backendReachability?.state === "unavailable" || projection.truthSummary?.backendUnavailable === true) {
    return { kind: "unavailable", summary: "Supervisor projection reports unavailable runtime state; no packets are shown." };
  }
  if (projection.backendReachability?.state !== "reachable") {
    return { kind: "unavailable", summary: "Supervisor projection reachability is not proven reachable; no packets are shown." };
  }
  if (mode === "detail" && projection.truthSummary?.backendEmpty === true) {
    return { kind: "invalid", summary: "Supervisor detail projection claims the backend is empty; no detail packet is trusted." };
  }
  if (mode === "detail" && !canonicalLiveProjectionTruth(projection) && !canonicalStaleProjectionTruth(projection)) {
    return { kind: "invalid", summary: "Supervisor detail requires canonical live or stale projection truth and proven reachability." };
  }
  return null;
}

function staleRuntimeContradiction(projection: DashboardCanonicalOperationalProjectionV1): string | null {
  if (!canonicalStaleProjectionTruth(projection)) {
    return "Supervisor projection stale state is contradictory.";
  }
  if (projection.fixtureMode?.enabled === true || projection.truthSummary?.fixtureBacked === true || projection.sourceLabel === "fixture") {
    return "Supervisor projection is both stale and fixture-backed; no packets are shown.";
  }
  if (projection.backendReachability?.state !== "reachable" || projection.truthSummary?.backendUnavailable === true) {
    return "Supervisor stale projection does not prove backend reachability; no packets are shown.";
  }
  return null;
}

function projectionFreshnessState(projection: DashboardCanonicalOperationalProjectionV1): { kind: "invalid" | "stale"; summary: string } | null {
  const generatedAt = Date.parse(projection.generatedAt);
  const sourceUpdatedAt = Date.parse(projection.sourceUpdatedAt);
  if (!Number.isFinite(generatedAt) || !Number.isFinite(sourceUpdatedAt) || !Number.isFinite(projection.staleAfterSeconds) || projection.staleAfterSeconds <= 0) {
    return { kind: "invalid", summary: "Supervisor projection freshness timestamps are malformed; normal runtime mode refuses stale packet truth." };
  }
  if (projection.staleAfterSeconds > Number.MAX_SAFE_INTEGER / 1000) {
    return { kind: "invalid", summary: "Supervisor projection freshness window is overflowed; normal runtime mode refuses stale packet truth." };
  }
  const now = Date.now();
  if (generatedAt - now > 1000 || sourceUpdatedAt - now > 1000) {
    return { kind: "invalid", summary: "Supervisor projection freshness timestamps are future-dated; normal runtime mode refuses contradictory packet truth." };
  }
  if (sourceUpdatedAt - generatedAt > 1000) {
    return { kind: "invalid", summary: "Supervisor projection source timestamp is newer than the projection timestamp; normal runtime mode refuses contradictory packet truth." };
  }
  if (now - sourceUpdatedAt > projection.staleAfterSeconds * 1000) {
    return { kind: "stale", summary: "Supervisor projection timestamps are stale; normal runtime mode refuses stale packet truth unless canonical stale flags agree." };
  }
  return null;
}

function canonicalStaleProjectionTruth(projection: DashboardCanonicalOperationalProjectionV1): boolean {
  return projection.sourceLabel === "stale" &&
    projection.freshnessState === "stale" &&
    projection.truthSummary.label === "stale" &&
    projection.truthSummary.stale === true &&
    projection.truthSummary.backendEmpty === false &&
    projection.truthSummary.fixtureBacked === false &&
    projection.truthSummary.backendUnavailable === false &&
    projection.backendReachability.state === "reachable" &&
    projection.fixtureMode.enabled === false &&
    projection.fixtureMode.canSatisfyLiveProof === false;
}

function canonicalLiveProjectionTruth(projection: DashboardCanonicalOperationalProjectionV1): boolean {
  return projection.sourceLabel === "live" &&
    projection.freshnessState === "live" &&
    projection.truthSummary.label === "live" &&
    projection.truthSummary.fixtureBacked === false &&
    projection.truthSummary.stale === false &&
    projection.truthSummary.backendUnavailable === false &&
    projection.backendReachability.state === "reachable" &&
    projection.fixtureMode.enabled === false &&
    projection.fixtureMode.canSatisfyLiveProof === false;
}

function emptyRuntimeContradiction(projection: DashboardCanonicalOperationalProjectionV1 | null): string | null {
  if (!projection) {
    return "Supervisor WorkPacket list returned zero rows without a canonical live projection.";
  }
  if (!canonicalEmptyProjectionTruth(projection)) {
    return "Supervisor WorkPacket list returned zero rows without canonical live empty-runtime truth and proven reachability.";
  }
  const emptyReasonContradiction = emptyRuntimeReasonContradiction(projection);
  if (emptyReasonContradiction) {
    return emptyReasonContradiction;
  }
  if (projection.workPackets.length > 0 || projection.selectedPacketDetails.length > 0) {
    return "Supervisor WorkPacket list returned zero rows while projection still contains packet identities.";
  }
  const stagePacketCount = projection.stageSummaries.reduce((sum, summary) => sum + summary.packetCount, 0);
  if (stagePacketCount > 0) {
    return "Supervisor WorkPacket list returned zero rows while projection stage summaries still count runtime packets.";
  }
  const queuePacketCount = projectionQueuePacketCount(projection);
  if (queuePacketCount > 0) {
    return "Supervisor WorkPacket list returned zero rows while queue summary still counts runtime packets.";
  }
  if (projection.truthSummary.backendUnavailable === true || projection.backendReachability.state !== "reachable") {
    return "Supervisor WorkPacket list returned zero rows but projection reachability is unavailable.";
  }
  if (projection.truthSummary.backendEmpty !== true) {
    return "Supervisor WorkPacket list returned zero rows but projection did not prove an empty runtime.";
  }
  return null;
}

function emptyRuntimeSummary(projection: DashboardCanonicalOperationalProjectionV1 | null): string {
  if (!projection) {
    return "Supervisor returned zero persisted WorkPacketV0 rows; no demo packets are substituted.";
  }
  const reason = canonicalEmptyReason(projection.truthSummary.emptyReason ?? projection.queueSummary.emptyReason);
  if (reason === "healthy_empty") {
    return projection.truthSummary.summary || projection.queueSummary.summary || "Supervisor returned zero persisted WorkPacketV0 rows; no demo packets are substituted.";
  }
  return "Supervisor returned zero persisted WorkPacketV0 rows; no demo packets are substituted.";
}

function emptyRuntimeReasonContradiction(projection: DashboardCanonicalOperationalProjectionV1): string | null {
  const truthReason = canonicalEmptyReason(projection.truthSummary.emptyReason);
  const queueReason = canonicalEmptyReason(projection.queueSummary.emptyReason);
  const effectiveReason = truthReason ?? queueReason;
  if (effectiveReason !== "healthy_empty") {
    return `Supervisor WorkPacket list returned zero rows but projection empty reason was ${effectiveReason ?? "missing"} instead of healthy_empty.`;
  }
  if (truthReason && queueReason && truthReason !== queueReason) {
    return `Supervisor WorkPacket list returned zero rows but projection empty reasons disagreed (${truthReason} vs ${queueReason}).`;
  }
  return null;
}

function canonicalEmptyReason(value: DashboardCanonicalOperationalProjectionV1["truthSummary"]["emptyReason"]): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function canonicalEmptyProjectionTruth(projection: DashboardCanonicalOperationalProjectionV1): boolean {
  return projection.sourceLabel === "live" &&
    projection.freshnessState === "live" &&
    projection.truthSummary.label === "live" &&
    projection.truthSummary.backendEmpty === true &&
    projection.truthSummary.fixtureBacked === false &&
    projection.truthSummary.stale === false &&
    projection.truthSummary.backendUnavailable === false &&
    projection.backendReachability.state === "reachable" &&
    projection.fixtureMode.enabled === false &&
    projection.fixtureMode.canSatisfyLiveProof === false;
}

function populatedRuntimeContradiction(projection: DashboardCanonicalOperationalProjectionV1 | null, packetIds: readonly string[]): string | null {
  if (!projection) {
    return "Supervisor returned packets without a canonical live projection.";
  }
  if (!canonicalLiveProjectionTruth(projection)) {
    return "Supervisor returned packets without canonical live projection truth and proven reachability.";
  }
  if (projection.truthSummary.backendEmpty === true) {
    return "Supervisor returned packets while projection claims the backend is empty.";
  }
  return packetIdentityContradiction(projection, packetIds);
}

function packetIdentityContradiction(projection: DashboardCanonicalOperationalProjectionV1, packetIds: readonly string[]): string | null {
  const invalidPacketId = packetIds.find((packetId) => !toCanonicalRuntimePacketId(packetId));
  if (invalidPacketId) {
    return `Supervisor returned malformed runtime packet identity ${invalidPacketId}.`;
  }
  const duplicatePacketId = firstDuplicate(packetIds);
  if (duplicatePacketId) {
    return `Supervisor returned duplicate runtime packet identity ${duplicatePacketId}.`;
  }
  const rawProjectionPacketIds = projection.workPackets.map((packet) => packet.packetId);
  const invalidProjectionPacketId = rawProjectionPacketIds.find((packetId) => !toCanonicalRuntimePacketId(packetId));
  if (invalidProjectionPacketId) {
    return `Supervisor projection contains malformed runtime packet identity ${invalidProjectionPacketId}.`;
  }
  const duplicateProjectionPacketId = firstDuplicate(rawProjectionPacketIds);
  if (duplicateProjectionPacketId) {
    return `Supervisor projection contains duplicate runtime packet identity ${duplicateProjectionPacketId}.`;
  }
  const duplicateProjectionDetailId = firstDuplicate(projection.selectedPacketDetails.map((detail) => detail.packetId));
  if (duplicateProjectionDetailId) {
    return `Supervisor projection contains duplicate detail identity ${duplicateProjectionDetailId}.`;
  }
  const projectionPacketIds = new Set(rawProjectionPacketIds);
  const packetIdSet = new Set(packetIds);
  const missingPacketId = packetIds.find((packetId) => !projectionPacketIds.has(packetId));
  if (missingPacketId) {
    return `Supervisor projection omitted runtime packet identity ${missingPacketId}.`;
  }
  const extraProjectionPacketId = rawProjectionPacketIds.find((packetId) => !packetIdSet.has(packetId));
  if (extraProjectionPacketId) {
    return `Supervisor projection included runtime packet identity ${extraProjectionPacketId} that was absent from the WorkPacket list.`;
  }
  const extraProjectionDetailId = projection.selectedPacketDetails.find((detail) => !packetIdSet.has(detail.packetId))?.packetId;
  if (extraProjectionDetailId) {
    return `Supervisor projection included detail identity ${extraProjectionDetailId} that was absent from the WorkPacket list.`;
  }
  return null;
}

function hasProjectionProofShape(projection: unknown): projection is DashboardCanonicalOperationalProjectionV1 {
  try {
    if (!projection || typeof projection !== "object") return false;
    const candidate = projection as Partial<DashboardCanonicalOperationalProjectionV1>;
    if (!candidate.truthSummary || typeof candidate.truthSummary !== "object") return false;
    if (!candidate.backendReachability || typeof candidate.backendReachability !== "object") return false;
    if (!candidate.fixtureMode || typeof candidate.fixtureMode !== "object") return false;
    if (!candidate.queueSummary || typeof candidate.queueSummary !== "object") return false;
    return Array.isArray(candidate.workPackets)
      && Array.isArray(candidate.selectedPacketDetails)
      && Array.isArray(candidate.stageSummaries);
  } catch {
    return false;
  }
}

function projectionQueuePacketCount(projection: DashboardCanonicalOperationalProjectionV1): number {
  const queueCounts = [
    projection.queueSummary.activeCount,
    projection.queueSummary.dispatchableCount,
    projection.queueSummary.blockedCount,
    projection.queueSummary.gatedCount,
    projection.queueSummary.closedCount,
    projection.queueSummary.staleCount,
    projection.queueSummary.refillingCount,
    projection.queueSummary.unknownCount,
  ];
  return queueCounts.reduce<number>((sum, count) => sum + (typeof count === "number" && count > 0 ? count : 0), 0);
}

function firstDuplicate(values: readonly string[]): string | null {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      return value;
    }
    seen.add(value);
  }
  return null;
}

function detailProjectionContradiction(
  projection: DashboardCanonicalOperationalProjectionV1 | null,
  packetId: CanonicalRuntimePacketId,
  canonicalPacket: DashboardCanonicalWorkPacketV1,
): string | null {
  if (!projection) {
    return "Supervisor detail projection is missing.";
  }
  const projectionPackets = projection.workPackets.filter((packet) => packet.packetId === packetId);
  if (projectionPackets.length !== 1) {
    return "Supervisor projection did not contain exactly one matching runtime packet identity.";
  }
  const projectionPacket = projectionPackets[0];
  const canonicalStage = canonicalPacket.authoritativeLifecycle.currentStage === "needs_approval"
    ? "human_gate"
    : canonicalPacket.authoritativeLifecycle.currentStage;
  if (
    projectionPacket.currentStage !== canonicalStage
    || projectionPacket.status !== canonicalPacket.authoritativeLifecycle.status
  ) {
    return "Supervisor detail disagrees with the verified canonical lifecycle stage or status for the requested runtime identity.";
  }
  const details = projection.selectedPacketDetails.filter((detail) => detail.packetId === packetId);
  if (details.length > 1) {
    return "Supervisor projection contained duplicate selected detail identities.";
  }
  const [detail] = details;
  if (!detail) {
    return null;
  }
  if (detail.currentStage !== projectionPacket.currentStage || detail.status !== projectionPacket.status || detail.truthLabel !== projectionPacket.truthLabel) {
    return "Supervisor selected detail disagrees with the verified projection packet for the requested runtime identity.";
  }
  if (detail.parentPacketId && detail.parentPacketId !== packetId) {
    return "Supervisor selected detail references a different parent packet identity.";
  }
  if (!Array.isArray(detail.sourceRefs) || !Array.isArray(detail.evidenceRefs)) {
    return "Supervisor selected detail is incomplete.";
  }
  return null;
}

async function loadPipelineDashboardProjection(): Promise<{ projection: DashboardCanonicalOperationalProjectionV1 | null; error: string | null }> {
  try {
    const projection = await readPipelineDashboardProjection();
    if (!projection) {
      return {
        projection: null,
        error: "Invalid projection payload",
      };
    }
    return {
      projection,
      error: null,
    };
  } catch (error) {
    return {
      projection: null,
      error: error instanceof Error ? error.message : "Projection fetch failed.",
    };
  }
}
