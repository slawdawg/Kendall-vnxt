import { resolveLoopbackSourceIntakeEndpoint } from "./manager-supervisor-source-intake.mjs";
import { normalizeSupervisorTimeoutMs, SUPERVISOR_MAX_TIMEOUT_MS } from "./supervisor-timeout.mjs";

const SAFE_METADATA = /^[a-zA-Z0-9._:/@ -]{1,160}$/;
const UNSAFE_ERROR_DETAIL = /raw|prompt|completion|provider|reasoning|secret|credential|token|scrollback|transcript/i;

export class ManagerSupervisorLocalProofError extends Error {
  constructor(code, message, packet, options = {}) {
    super(message, options);
    this.name = "ManagerSupervisorLocalProofError";
    this.code = code;
    this.packet = failClosedPacket(packet, code, message);
  }
}

export function resolveLoopbackLocalProofEndpoint(supervisorUrl, packetId) {
  const sourceIntakeEndpoint = resolveLoopbackSourceIntakeEndpoint(supervisorUrl);
  const safePacketId = requiredMetadata(packetId, "supervisorIntake.packetId");
  return new URL(`/pipeline-control-plane/work-packets/${encodeURIComponent(safePacketId)}/local-proof`, sourceIntakeEndpoint).href;
}

export function buildManagerLocalProofRequest(packet, options = {}) {
  const intake = persistedSupervisorIntake(packet);
  const idempotencyKey = requiredMetadata(options.idempotencyKey, "localProof.idempotencyKey");
  const correlationId = requiredMetadata(options.correlationId || `manager-local-proof:${intake.packetId}`, "localProof.correlationId", 80);
  return {
    packetId: intake.packetId,
    proofMode: "integrated_local",
    idempotencyKey,
    correlationId,
    scenario: "happy",
    actorId: "manager-source-intake-local-proof",
    actorLabel: "Manager source intake local proof",
  };
}

export async function continueManagerSourcePacketWithLocalProof(packet, supervisorUrl, options = {}, context = {}) {
  let sourcePacket;
  let request;
  let endpoint;
  try {
    sourcePacket = structuredClone(packet);
    request = buildManagerLocalProofRequest(sourcePacket, options);
    endpoint = resolveLoopbackLocalProofEndpoint(supervisorUrl, request.packetId);
  } catch (error) {
    throw localProofError("manager_supervisor_local_proof_input_invalid", error, packet);
  }
  const fetchImpl = context.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new ManagerSupervisorLocalProofError(
      "manager_supervisor_local_proof_network_unavailable",
      "Supervisor local proof requires an available fetch implementation.",
      sourcePacket,
    );
  }
  let response;
  try {
    response = await fetchImpl(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        proofMode: request.proofMode,
        idempotencyKey: request.idempotencyKey,
        correlationId: request.correlationId,
        scenario: request.scenario,
        actorId: request.actorId,
        actorLabel: request.actorLabel,
      }),
      redirect: "error",
      signal: AbortSignal.timeout(normalizeSupervisorTimeoutMs(context.timeoutMs, `timeoutMs must be an integer between 1 and ${SUPERVISOR_MAX_TIMEOUT_MS}.`)),
    });
  } catch (error) {
    throw new ManagerSupervisorLocalProofError(
      "manager_supervisor_local_proof_network_error",
      "Supervisor local proof could not reach the loopback supervisor.",
      sourcePacket,
      { cause: error },
    );
  }
  if (!response || typeof response.ok !== "boolean" || !Number.isInteger(response.status)) {
    throw new ManagerSupervisorLocalProofError(
      "manager_supervisor_local_proof_response_malformed",
      "Supervisor local proof returned a malformed HTTP response.",
      sourcePacket,
    );
  }
  if (!response.ok || response.status < 200 || response.status >= 300) {
    const failureCode = await safeSupervisorFailureCode(response);
    throw new ManagerSupervisorLocalProofError(
      "manager_supervisor_local_proof_http_error",
      `Supervisor local proof failed with HTTP ${response.status}${failureCode ? ` (${failureCode})` : ""}.`,
      sourcePacket,
    );
  }
  let proof;
  try {
    proof = (await response.json())?.data;
    validateProofResponse(proof, request);
  } catch (error) {
    throw localProofError("manager_supervisor_local_proof_response_malformed", error, sourcePacket);
  }
  const integrated = structuredClone(sourcePacket);
  integrated.summary.workerResultLocalProof = {
    status: "persisted",
    packetId: request.packetId,
    workItemId: proof.workItem.id,
    attemptId: proof.attempt.attemptId,
    attemptStatus: proof.attempt.status,
    leaseId: proof.queueLease?.leaseId ?? null,
    fencingToken: proof.queueLease?.fencingToken ?? null,
    evidenceRef: `evidence:local-proof:${request.idempotencyKey}`,
    correlationId: request.correlationId,
    metadataOnly: true,
    rawPayloadRetained: false,
  };
  integrated.summary.workerResultPersistence = "persisted; supervisor-owned local-proof worker result recorded";
  return integrated;
}

async function safeSupervisorFailureCode(response) {
  try {
    const error = (await response.json())?.detail?.error;
    const code = error?.code;
    const message = error?.message;
    if (typeof code !== "string" || !SAFE_METADATA.test(code)) return null;
    const boundedMessage = typeof message === "string"
      ? message.replace(/[^a-zA-Z0-9._:/@ -]/g, " ").replace(/\s+/g, " ").trim().slice(0, 160)
      : "";
    return boundedMessage && SAFE_METADATA.test(boundedMessage) && !UNSAFE_ERROR_DETAIL.test(boundedMessage) ? `${code}: ${boundedMessage}` : code;
  } catch {
    return null;
  }
}

function persistedSupervisorIntake(packet) {
  const intake = packet?.summary?.seedPacket?.supervisorIntake;
  if (!intake || typeof intake !== "object" || intake.status !== "persisted" || intake.metadataOnly !== true || intake.rawPayloadRetained !== false) {
    throw new TypeError("Manager local proof requires a persisted metadata-only supervisor source intake.");
  }
  return { packetId: requiredMetadata(intake.packetId, "supervisorIntake.packetId") };
}

function validateProofResponse(proof, request) {
  if (!proof || typeof proof !== "object" || Array.isArray(proof)) throw new TypeError("Supervisor local proof response must contain an object.");
  if (proof.evidenceLevel !== "integrated_local" || proof.metadataOnly !== true || proof.rawPayloadRetained !== false) {
    throw new TypeError("Supervisor local proof response must retain integrated-local metadata-only evidence.");
  }
  if (proof.correlationId !== request.correlationId || proof.scenario !== "happy") {
    throw new TypeError("Supervisor local proof response identity does not match the manager continuation.");
  }
  if (!proof.workItem || typeof proof.workItem !== "object" || !requiredMetadata(proof.workItem.id, "proof.workItem.id")) {
    throw new TypeError("Supervisor local proof response is missing its server-owned WorkItem.");
  }
  if (!proof.attempt || typeof proof.attempt !== "object" || !requiredMetadata(proof.attempt.attemptId, "proof.attempt.attemptId") || proof.attempt.status !== "completed") {
    throw new TypeError("Supervisor local proof response is missing its completed worker result attempt.");
  }
  if (!proof.authoritativePacket || proof.authoritativePacket.packetId !== request.packetId || proof.authoritativePacket.metadataOnly !== true) {
    throw new TypeError("Supervisor local proof response is not bound to the persisted authoritative WorkPacket.");
  }
}

function requiredMetadata(value, name, maxLength = 160) {
  if (typeof value !== "string" || value.length > maxLength || !SAFE_METADATA.test(value)) throw new TypeError(`${name} must be bounded safe metadata-only text.`);
  return value;
}

function localProofError(code, error, packet) {
  return new ManagerSupervisorLocalProofError(code, error instanceof Error ? error.message : String(error), packet, { cause: error });
}

function failClosedPacket(packet, code, message) {
  const failed = packet && typeof packet === "object" ? structuredClone(packet) : { summary: {} };
  failed.ok = false;
  failed.status = "blocked";
  failed.blockers = Array.isArray(failed.blockers) ? failed.blockers : [];
  failed.blockers.push({
    code,
    message,
    nextAction: "Do not infer a worker result; inspect the persisted supervisor packet and local-proof authority gate before retrying.",
  });
  return failed;
}
