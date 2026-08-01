import {
  buildManagerLaneClarityHandoffRequest,
  resolveLaneClarityHandoffTransport,
  syncManagerSupervisorLaneClarity,
} from "./manager-supervisor-lane-clarity-sync.mjs";
import { isSafeMetadataOnlyText } from "./forbidden-boundary.mjs";

const MAX_ATTEMPTS = 2;

export async function publishManagerCycleLaneClarity(summary = {}, options = {}, context = {}) {
  const supervisorUrl = String(options.laneClaritySupervisorUrl || "").trim();
  const privateUds = (context.supervisorTransport ?? process.env.KENDALL_SUPERVISOR_TRANSPORT) === "private_uds";
  if (!supervisorUrl && !privateUds) return receipt("disabled");

  let endpoint;
  try {
    endpoint = resolveLaneClarityHandoffTransport(supervisorUrl, context).endpoint;
  } catch {
    return receipt("rejected", { failureCode: privateUds ? "private_uds_transport_rejected" : "loopback_endpoint_rejected" });
  }

  const requestContext = buildRequestContext(summary);
  if (!requestContext) return receipt("unavailable", { failureCode: "coherent_lane_clarity_unavailable" });

  let request;
  try {
    request = buildManagerLaneClarityHandoffRequest(summary, requestContext);
  } catch {
    return receipt("unavailable", { failureCode: "coherent_lane_clarity_unavailable" });
  }

  const sync = context.sync || syncManagerSupervisorLaneClarity;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const persisted = await sync(summary, supervisorUrl, { ...context, ...requestContext });
      return receipt("published", {
        attemptCount: attempt,
        endpoint,
        selectedLaneId: request.selectedLaneId,
        sourceSequence: request.sourceSequence,
        handoffId: request.handoffId,
        idempotencyKey: request.idempotencyKey,
        persisted: persisted?.handoffId === request.handoffId,
      });
    } catch (error) {
      const failure = classifyFailure(error, privateUds);
      if (!failure.retryable || attempt === MAX_ATTEMPTS) {
        return receipt(failure.state, {
          attemptCount: attempt,
          endpoint,
          selectedLaneId: request.selectedLaneId,
          sourceSequence: request.sourceSequence,
          handoffId: request.handoffId,
          idempotencyKey: request.idempotencyKey,
          failureCode: failure.code,
        });
      }
    }
  }
  return receipt("unavailable", { failureCode: privateUds ? "private_uds_transport_unavailable" : "loopback_transport_unavailable" });
}

function buildRequestContext(summary = {}) {
  const clarity = summary?.laneClarity;
  const runId = text(clarity?.runId, 120);
  const sourceCursor = text(clarity?.sourceCursor, 160);
  const observedAt = text(summary?.lastObservedAt || summary?.observedAt, 64);
  const sourceSequence = /^[1-9]\d*$/.test(sourceCursor) ? Number(sourceCursor) : NaN;
  if (!runId || !isCoherentCurrentLaneClarity(clarity) ||
    clarity?.metadataOnly !== true || clarity?.rawPayloadRetained !== false || !Number.isSafeInteger(sourceSequence) || sourceSequence <= 0 || Number.isNaN(Date.parse(observedAt))) {
    return null;
  }
  const selectedLaneId = text(summary?.selectedLaneId, 160) || `manager-run:${runId}`;
  return {
    selectedLaneId,
    sourceSequence,
    observedAt,
    idempotencyKey: `manager-lane-clarity:${selectedLaneId}:${runId}:${text(clarity.eventWatermark, 160)}:${sourceCursor}:${sourceSequence}`,
  };
}

function isCoherentCurrentLaneClarity(clarity = {}) {
  const posture = clarity?.posture || {};
  const pivot = posture.state === "pivot_required";
  const coherentPosture = posture.state === "on_scope" || pivot;
  return clarity?.schemaVersion === "manager-lane-clarity/v0" &&
    isSafeMetadataOnlyText(clarity?.runId, { maxLength: 120, token: true }) &&
    isSafeMetadataOnlyText(clarity?.eventWatermark, { maxLength: 160, token: true }) &&
    isSafeMetadataOnlyText(clarity?.sourceCursor, { maxLength: 160, token: true }) &&
    isSafeMetadataOnlyText(clarity?.goal?.summary, { maxLength: 240 }) &&
    isSafeMetadataOnlyText(clarity?.goal?.sourceRef, { maxLength: 255, token: true }) &&
    Array.isArray(clarity?.criteria) && clarity.criteria.length > 0 && clarity.criteria.length <= 24 &&
    clarity.criteria.every((criterion) =>
      isSafeMetadataOnlyText(criterion?.criterionId, { maxLength: 255, token: true }) &&
      isSafeMetadataOnlyText(criterion?.summary, { maxLength: 240 }) &&
      ["met", "in_progress", "blocked", "not_assessed"].includes(criterion?.disposition) &&
      Array.isArray(criterion?.evidenceRefs) && criterion.evidenceRefs.length > 0 && criterion.evidenceRefs.length <= 20 &&
      criterion.evidenceRefs.every((ref) => isSafeMetadataOnlyText(ref, { maxLength: 255, token: true }))
    ) &&
    isSafeMetadataOnlyText(clarity?.canonicalState?.phase, { maxLength: 120, token: true }) &&
    clarity?.canonicalState?.freshness === "fresh" && clarity?.canonicalState?.evidenceFreshness === "fresh" &&
    isSafeMetadataOnlyText(clarity?.nextGate?.summary, { maxLength: 240 }) &&
    isSafeMetadataOnlyText(clarity?.nextGate?.nextSafeAction, { maxLength: 240 }) &&
    coherentPosture && isSafeMetadataOnlyText(posture.reason, { maxLength: 240 }) &&
    isSafeMetadataOnlyText(posture.nextSafeAction, { maxLength: 240 }) &&
    (!pivot || (isSafeMetadataOnlyText(posture.decisionRef, { maxLength: 255, token: true }) &&
      ["operator_drift_concern", "second_qualified_recovery_detour"].includes(posture.qualification)));
}

function classifyFailure(error, privateUds) {
  const message = String(error?.message || "");
  const status = Number(message.match(/\bHTTP\s+(\d{3})\b/i)?.[1]);
  if ((Number.isInteger(status) && status >= 400 && status < 500) || /conflict|canonical|must be|requires/i.test(message)) {
    return { state: "rejected", code: "supervisor_handoff_rejected", retryable: false };
  }
  return { state: "unavailable", code: privateUds ? "private_uds_transport_unavailable" : "loopback_transport_unavailable", retryable: true };
}

function receipt(state, details = {}) {
  return {
    schemaVersion: "manager-cycle-lane-clarity-publication/v0",
    state,
    attemptCount: details.attemptCount || 0,
    endpoint: details.endpoint || null,
    selectedLaneId: details.selectedLaneId || null,
    sourceSequence: details.sourceSequence || null,
    handoffId: details.handoffId || null,
    idempotencyKey: details.idempotencyKey || null,
    persisted: details.persisted === true,
    failureCode: details.failureCode || null,
    metadataOnly: true,
    rawPayloadRetained: false,
  };
}

function text(value, maxLength) {
  return typeof value === "string" && value.trim() && value === value.trim() && value.length <= maxLength ? value : "";
}
