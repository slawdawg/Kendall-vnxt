import {
  buildManagerCoordinationHealthHandoffRequest,
  resolveLoopbackCoordinationHealthHandoffEndpoint,
  syncManagerSupervisorCoordinationHealth,
} from "./manager-supervisor-coordination-health-sync.mjs";

const MAX_ATTEMPTS = 2;

export async function publishManagerCycleCoordinationHealth(coordinationHealth, options = {}, context = {}) {
  const supervisorUrl = String(options.laneClaritySupervisorUrl || "").trim();
  if (!supervisorUrl) return receipt("disabled");
  let endpoint;
  try {
    endpoint = resolveLoopbackCoordinationHealthHandoffEndpoint(supervisorUrl);
  } catch {
    return receipt("rejected", { failureCode: "loopback_endpoint_rejected" });
  }
  let request;
  try {
    request = buildManagerCoordinationHealthHandoffRequest(coordinationHealth);
  } catch {
    return receipt("unavailable", { failureCode: "canonical_coordination_health_unavailable" });
  }
  const sync = context.sync || syncManagerSupervisorCoordinationHealth;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const persisted = await sync(coordinationHealth, supervisorUrl);
      return receipt("published", { attemptCount: attempt, endpoint, sourceSequence: request.sourceSequence, handoffId: request.handoffId, idempotencyKey: request.idempotencyKey, persisted: persisted?.handoffId === request.handoffId });
    } catch (error) {
      const failure = classifyFailure(error);
      if (!failure.retryable || attempt === MAX_ATTEMPTS) return receipt(failure.state, { attemptCount: attempt, endpoint, sourceSequence: request.sourceSequence, handoffId: request.handoffId, idempotencyKey: request.idempotencyKey, failureCode: failure.code });
    }
  }
  return receipt("unavailable", { failureCode: "loopback_transport_unavailable" });
}

function classifyFailure(error) {
  const message = String(error?.message || "");
  const status = Number(message.match(/\bHTTP\s+(\d{3})\b/i)?.[1]);
  if ((Number.isInteger(status) && status >= 400 && status < 500) || /conflict|canonical|must be|requires/i.test(message)) return { state: "rejected", code: "supervisor_handoff_rejected", retryable: false };
  return { state: "unavailable", code: "loopback_transport_unavailable", retryable: true };
}

function receipt(state, details = {}) {
  return { schemaVersion: "manager-cycle-coordination-health-publication/v0", state, attemptCount: details.attemptCount || 0, endpoint: details.endpoint || null, sourceSequence: details.sourceSequence || null, handoffId: details.handoffId || null, idempotencyKey: details.idempotencyKey || null, persisted: details.persisted === true, failureCode: details.failureCode || null, metadataOnly: true, rawPayloadRetained: false };
}
