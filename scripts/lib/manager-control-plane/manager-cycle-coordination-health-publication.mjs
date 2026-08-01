import {
  buildManagerCoordinationHealthHandoffRequest,
  resolveCoordinationHealthHandoffTransport,
  syncManagerSupervisorCoordinationHealth,
} from "./manager-supervisor-coordination-health-sync.mjs";

const MAX_ATTEMPTS = 2;

export async function publishManagerCycleCoordinationHealth(coordinationHealth, options = {}, context = {}) {
  const supervisorUrl = String(options.laneClaritySupervisorUrl || "").trim();
  const privateUds = (context.supervisorTransport ?? process.env.KENDALL_SUPERVISOR_TRANSPORT) === "private_uds";
  if (!supervisorUrl && !privateUds) return receipt("disabled");
  let endpoint;
  try {
    endpoint = resolveCoordinationHealthHandoffTransport(supervisorUrl, context).endpoint;
  } catch {
    return receipt("rejected", { failureCode: privateUds ? "private_uds_transport_rejected" : "loopback_endpoint_rejected" });
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
      const persisted = await sync(coordinationHealth, supervisorUrl, context);
      return receipt("published", { attemptCount: attempt, endpoint, sourceSequence: request.sourceSequence, handoffId: request.handoffId, idempotencyKey: request.idempotencyKey, persisted: persisted?.handoffId === request.handoffId });
    } catch (error) {
      const failure = classifyFailure(error, privateUds);
      if (!failure.retryable || attempt === MAX_ATTEMPTS) return receipt(failure.state, { attemptCount: attempt, endpoint, sourceSequence: request.sourceSequence, handoffId: request.handoffId, idempotencyKey: request.idempotencyKey, failureCode: failure.code, sandboxBoundary: failure.sandboxBoundary });
    }
  }
  return receipt("unavailable", { failureCode: privateUds ? "private_uds_transport_unavailable" : "loopback_transport_unavailable" });
}

function classifyFailure(error, privateUds) {
  const message = String(error?.message || "");
  const status = Number(message.match(/\bHTTP\s+(\d{3})\b/i)?.[1]);
  if ((Number.isInteger(status) && status >= 400 && status < 500) || /conflict|canonical|must be|requires/i.test(message)) return { state: "rejected", code: "supervisor_handoff_rejected", retryable: false };
  const sandboxBoundary = privateUds && isSandboxBoundaryError(error);
  return {
    state: "unavailable",
    code: privateUds ? "private_uds_transport_unavailable" : "loopback_transport_unavailable",
    retryable: !sandboxBoundary,
    sandboxBoundary,
  };
}

function receipt(state, details = {}) {
  return { schemaVersion: "manager-cycle-coordination-health-publication/v0", state, attemptCount: details.attemptCount || 0, endpoint: details.endpoint || null, sourceSequence: details.sourceSequence || null, handoffId: details.handoffId || null, idempotencyKey: details.idempotencyKey || null, persisted: details.persisted === true, failureCode: details.failureCode || null, sandboxBoundary: details.sandboxBoundary === true, metadataOnly: true, rawPayloadRetained: false };
}

function isSandboxBoundaryError(error) {
  const code = String(error?.code || "").toUpperCase();
  return ["EACCES", "EPERM", "EROFS"].includes(code) || /operation not permitted|permission denied|read-only file system|sandbox/i.test(String(error?.message || ""));
}
