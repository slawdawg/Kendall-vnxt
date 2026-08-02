import http from "node:http";

export const PACKET_DETAIL_PATH_PREFIX = "/api/packet-detail/";
export const PACKET_DETAIL_TIMEOUT_MS = 2000;
export const PACKET_DETAIL_MAX_BYTES = 256 * 1024;
export const PACKET_DETAIL_MAX_IN_FLIGHT = 8;

const PACKET_DETAIL_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/;
const DENIED_BODY = JSON.stringify({ state: "sign_in_required" });
const UNAVAILABLE_BODY = JSON.stringify({ state: "unavailable", message: "Attestation readback unavailable" });
const UNSAFE_METADATA_TEXT = /\b(raw[\s_-]*(prompts?|completions?|transcripts?)|reasoning[\s_-]*traces?|provider[\s_-]*payloads?|secrets?([\s_-]*(key|token|value|id))?|credentials?([\s_-]*(key|token|value|id))?|(terminal|tmux|pane)[\s_-]*(scrollbacks?|texts?|outputs?|stdouts?|stderrs?))\b/i;
const EXECUTABLE_METADATA_TEXT = /\b(tmux\s+(kill|send|capture|new|attach)|git(hub)?\s+(push|merge|checkout|reset|clean|branch|pr)|gh\s+(pr|repo|api)|curl\s+|bash\s+|sh\s+|python\s+|node\s+|pnpm\s+|uv\s+run|provider\s+(call|request|payload))\b/i;
const PACKET_DETAIL_LEGACY_PACKET_KEYS = ["packetId", "title", "currentStage", "status", "truthLabel", "evidence"];
const PACKET_DETAIL_CURRENT_PACKET_KEYS = [...PACKET_DETAIL_LEGACY_PACKET_KEYS, "workGraph"];
const PACKET_DETAIL_EVIDENCE_KEYS = ["schemaVersion", "evidenceClass", "checkedAt", "expiresAt", "freshnessState", "effectiveDecision", "typedBlockers"];
const UTC_TIMESTAMP = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?Z$/;

function sendJson(response, statusCode, body) {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  response.writeHead(statusCode, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
  });
  response.end(payload);
}

function safeHostHeader(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 255 && !/[\s/\\]/.test(value);
}

function isSafeReference(value) {
  return typeof value === "string" && value.trim() === value && value.length > 0 && value.length <= 255 && !/[\s/\\\x00-\x1f\x7f]/.test(value) && !UNSAFE_METADATA_TEXT.test(value);
}

function isSafeMetadataText(value, maxLength = 500) {
  return typeof value === "string" && value.trim() === value && value.length > 0 && value.length <= maxLength && !UNSAFE_METADATA_TEXT.test(value) && !EXECUTABLE_METADATA_TEXT.test(value) && !/(?:^|[\s"'])\/(?:home|tmp|var|etc)\//i.test(value);
}

function hasExactKeys(value, keys) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function parseCanonicalUtcTimestamp(value) {
  if (typeof value !== "string") return null;
  const match = UTC_TIMESTAMP.exec(value);
  if (!match) return null;
  const timestamp = Date.parse(`${match[1]}Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 19) !== match[1]) return null;
  return timestamp * 1_000 + Number((match[2] || "").padEnd(6, "0"));
}

function unavailableWorkGraph(packetId) {
  return {
    schemaVersion: "parallel-work-graph-evidence/v0",
    sourceSchemaVersion: "parallel-execution-graph-reservation/v1",
    availability: "unavailable",
    packetId,
    executionJobId: null,
    reportIdentity: null,
    generatedAt: null,
    freshnessState: "unavailable",
    waveMembership: "unavailable",
    dependencyState: "unavailable",
    reservation: { status: "unavailable", owner: null, reasonCode: "parallel_report_unavailable" },
    capacity: { posture: "unavailable", reasonCode: "parallel_capacity_unavailable" },
    reason: "Parallel work graph evidence is unavailable.",
    nextSafeAction: "Inspect the authoritative packet lifecycle before relying on work graph evidence.",
    evidenceRefs: [],
    metadataOnly: true,
    rawPayloadRetained: false,
    retention: "metadata_only_evidence_references",
  };
}

function isSafePacketEvidence(evidence) {
  if (evidence === null) return true;
  if (!hasExactKeys(evidence, PACKET_DETAIL_EVIDENCE_KEYS)) return false;
  for (const key of ["schemaVersion", "evidenceClass"]) {
    if (!isSafeMetadataText(evidence[key], 160)) return false;
  }
  for (const key of ["freshnessState", "effectiveDecision"]) {
    if (!isSafeReference(evidence[key])) return false;
  }
  const checkedAt = parseCanonicalUtcTimestamp(evidence.checkedAt);
  const expiresAt = parseCanonicalUtcTimestamp(evidence.expiresAt);
  return checkedAt !== null
    && expiresAt !== null
    && expiresAt > checkedAt
    && expiresAt - checkedAt <= 300_000_000
    && Array.isArray(evidence.typedBlockers)
    && evidence.typedBlockers.length <= 20
    && evidence.typedBlockers.every(isSafeReference);
}

function isSafePacketDetailPacket(packet, packetId, keys) {
  return hasExactKeys(packet, keys)
    && packet.packetId === packetId
    && isSafeMetadataText(packet.title, 240)
    && isSafeReference(packet.currentStage)
    && isSafeReference(packet.status)
    && isSafeReference(packet.truthLabel)
    && isSafePacketEvidence(packet.evidence);
}

function normalizeLegacyPacketDetailPayload(payload, packetId) {
  if (
    !hasExactKeys(payload, ["schemaVersion", "state", "packet"])
    || payload.schemaVersion !== "kendall-authenticated-packet-detail/v1"
    || payload.state !== "available"
    || !isSafePacketDetailPacket(payload.packet, packetId, PACKET_DETAIL_LEGACY_PACKET_KEYS)
  ) {
    return payload;
  }
  return { ...payload, packet: { ...payload.packet, workGraph: unavailableWorkGraph(packetId) } };
}

function isSafeWorkGraph(graph, packetId) {
  if (!graph || typeof graph !== "object" || Object.keys(graph).length !== 18 || !isSafeReference(packetId)) return false;
  const unavailable = graph.availability === "unavailable";
  return (
    graph.schemaVersion === "parallel-work-graph-evidence/v0" &&
    graph.sourceSchemaVersion === "parallel-execution-graph-reservation/v1" &&
    ["available", "stale", "unavailable"].includes(graph.availability) &&
    graph.packetId === packetId &&
    (graph.executionJobId === null || isSafeReference(graph.executionJobId)) &&
    (graph.reportIdentity === null || (typeof graph.reportIdentity === "string" && /^sha256:[0-9a-f]{64}$/.test(graph.reportIdentity))) &&
    (graph.generatedAt === null || (typeof graph.generatedAt === "string" && Number.isFinite(Date.parse(graph.generatedAt)))) &&
    ["live", "stale", "unavailable"].includes(graph.freshnessState) &&
    ["selected", "deferred", "blocked", "unavailable"].includes(graph.waveMembership) &&
    ["clear", "declared", "blocked", "unavailable"].includes(graph.dependencyState) &&
    graph.reservation && Object.keys(graph.reservation).length === 3 && ["advisory_reserved", "deferred", "blocked", "not_recommended", "unavailable"].includes(graph.reservation.status) &&
    (graph.reservation.owner === null || isSafeMetadataText(graph.reservation.owner, 160)) &&
    typeof graph.reservation.reasonCode === "string" && /^[a-z][a-z0-9_:-]{1,120}$/.test(graph.reservation.reasonCode) &&
    graph.capacity && Object.keys(graph.capacity).length === 2 && ["normal", "degraded", "blocked", "unavailable"].includes(graph.capacity.posture) &&
    typeof graph.capacity.reasonCode === "string" && /^[a-z][a-z0-9_:-]{1,120}$/.test(graph.capacity.reasonCode) &&
    isSafeMetadataText(graph.reason) && isSafeMetadataText(graph.nextSafeAction) &&
    Array.isArray(graph.evidenceRefs) && graph.evidenceRefs.length <= 20 && graph.evidenceRefs.every(isSafeReference) &&
    graph.metadataOnly === true && graph.rawPayloadRetained === false && graph.retention === "metadata_only_evidence_references" &&
    (unavailable
      ? graph.executionJobId === null && graph.reportIdentity === null && graph.generatedAt === null && graph.freshnessState === "unavailable" && graph.waveMembership === "unavailable" && graph.dependencyState === "unavailable" && graph.reservation.status === "unavailable" && graph.capacity.posture === "unavailable"
      : graph.executionJobId !== null && graph.reportIdentity !== null && graph.generatedAt !== null && graph.freshnessState === (graph.availability === "stale" ? "stale" : "live"))
  );
}

export function parsePacketDetailRequest(request, { expectedHost, expectedOrigin } = {}) {
  let url;
  try {
    url = new URL(request.url || "/", "https://dashboard.invalid");
  } catch {
    return { handled: true, status: 400, body: { state: "unavailable" } };
  }
  if (!url.pathname.startsWith(PACKET_DETAIL_PATH_PREFIX) || url.search) return { handled: false };
  if (request.method !== "GET") return { handled: true, status: 405, body: { state: "unavailable" } };
  const encodedPacketId = url.pathname.slice(PACKET_DETAIL_PATH_PREFIX.length);
  let packetId;
  try { packetId = decodeURIComponent(encodedPacketId); } catch { return { handled: true, status: 404, body: { state: "unavailable" } }; }
  if (!PACKET_DETAIL_ID.test(packetId) || packetId.includes("/")) return { handled: true, status: 404, body: { state: "unavailable" } };
  if (!safeHostHeader(request.headers.host) || (expectedHost && request.headers.host !== expectedHost)) {
    return { handled: true, status: 400, body: { state: "unavailable" } };
  }
  for (const name of ["forwarded", "x-forwarded-for", "x-forwarded-host", "x-forwarded-proto", "x-forwarded-port"]) {
    if (request.headers[name]) return { handled: true, status: 400, body: { state: "unavailable" } };
  }
  const origin = request.headers.origin;
  if (origin && (!expectedOrigin || origin !== expectedOrigin)) return { handled: true, status: 403, body: { state: "unavailable" } };
  return { handled: true, status: 200, packetId };
}

export function createPacketDetailMediator({ supervisorUdsPath, expectedHost, expectedOrigin, timeoutMs = PACKET_DETAIL_TIMEOUT_MS, maxInFlight = PACKET_DETAIL_MAX_IN_FLIGHT }) {
  if (typeof supervisorUdsPath !== "string" || !supervisorUdsPath.startsWith("/")) throw new Error("Packet detail mediator requires a fixed absolute supervisor UDS path.");
  let inFlight = 0;
  return async function mediate(request, response) {
    const parsed = parsePacketDetailRequest(request, { expectedHost, expectedOrigin });
    if (!parsed.handled) return false;
    if (parsed.status !== 200) {
      sendJson(response, parsed.status, parsed.body);
      return true;
    }
    if (!request.headers.cookie) {
      sendJson(response, 401, DENIED_BODY);
      return true;
    }
    if (inFlight >= maxInFlight) {
      sendJson(response, 503, UNAVAILABLE_BODY);
      return true;
    }
    inFlight += 1;
    try {
      const result = await requestSupervisor(supervisorUdsPath, parsed.packetId, request.headers.cookie, timeoutMs);
      const payload = normalizeLegacyPacketDetailPayload(result.payload, parsed.packetId);
      // The supervisor validates the cookie before the packet read. Confirm it
      // again immediately before returning data so a concurrent test-viewer
      // revocation wins over an in-flight mediated response.
      const confirmation = await requestSupervisorSession(supervisorUdsPath, request.headers.cookie, timeoutMs);
      if (confirmation.statusCode !== 200 || !isDashboardReadSession(confirmation.payload)) {
        sendJson(response, 401, DENIED_BODY);
      } else if (result.statusCode === 401 || result.statusCode === 403) {
        sendJson(response, 401, DENIED_BODY);
      } else if (
        result.statusCode !== 200
        || !payload
        || payload.schemaVersion !== "kendall-authenticated-packet-detail/v1"
        || !["available", "unavailable"].includes(payload.state)
        || (payload.state === "unavailable" && Object.keys(payload).length !== 2)
        || (payload.state === "available" && (
          !hasExactKeys(payload, ["schemaVersion", "state", "packet"])
          || !isSafePacketDetailPacket(payload.packet, parsed.packetId, PACKET_DETAIL_CURRENT_PACKET_KEYS)
          || !isSafeWorkGraph(payload.packet.workGraph, parsed.packetId)
        ))
      ) {
        sendJson(response, 503, UNAVAILABLE_BODY);
      } else {
        sendJson(response, 200, payload);
      }
    } catch {
      sendJson(response, 503, UNAVAILABLE_BODY);
    } finally {
      inFlight -= 1;
    }
    return true;
  };
}

function isDashboardReadSession(payload) {
  return payload?.authenticated === true && (payload.role === "operator" || payload.role === "test_viewer");
}

function requestSupervisorSession(socketPath, cookie, timeoutMs) {
  return new Promise((resolve, reject) => {
    const request = http.request({
      socketPath,
      path: "/auth/session",
      method: "GET",
      headers: { accept: "application/json", ...(cookie ? { cookie } : {}) },
    }, (response) => {
      const chunks = [];
      let total = 0;
      response.on("data", (chunk) => {
        total += chunk.length;
        if (total <= PACKET_DETAIL_MAX_BYTES) chunks.push(chunk);
        else request.destroy(new Error("Packet detail session response exceeded limit."));
      });
      response.on("end", () => {
        clearTimeout(deadline);
        if (total > PACKET_DETAIL_MAX_BYTES) return reject(new Error("Packet detail session response exceeded limit."));
        let payload = null;
        try { payload = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { /* stable denial mapping */ }
        resolve({ statusCode: response.statusCode, payload });
      });
    });
    const deadline = setTimeout(() => request.destroy(new Error("Packet detail session deadline exceeded.")), timeoutMs);
    request.setTimeout(timeoutMs, () => request.destroy(new Error("Packet detail session timed out.")));
    request.on("error", (error) => {
      clearTimeout(deadline);
      reject(error);
    });
    request.end();
  });
}

function requestSupervisor(socketPath, packetId, cookie, timeoutMs) {
  return new Promise((resolve, reject) => {
    const request = http.request({
      socketPath,
      path: `/internal/dashboard/packet-detail/${encodeURIComponent(packetId)}`,
      method: "GET",
      headers: {
        accept: "application/json",
        "x-kendall-dashboard-mediator": "packet-detail/v1",
        ...(cookie ? { cookie } : {}),
      },
    }, (response) => {
      const chunks = [];
      let total = 0;
      response.on("data", (chunk) => {
        total += chunk.length;
        if (total <= PACKET_DETAIL_MAX_BYTES) chunks.push(chunk);
        else request.destroy(new Error("Packet detail response exceeded limit."));
      });
      response.on("end", () => {
        clearTimeout(deadline);
        if (total > PACKET_DETAIL_MAX_BYTES) return reject(new Error("Packet detail response exceeded limit."));
        let payload = null;
        try { payload = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { /* stable unavailable mapping */ }
        resolve({ statusCode: response.statusCode, payload });
      });
    });
    const deadline = setTimeout(() => request.destroy(new Error("Packet detail supervisor read deadline exceeded.")), timeoutMs);
    request.setTimeout(timeoutMs, () => request.destroy(new Error("Packet detail supervisor read timed out.")));
    request.on("error", (error) => {
      clearTimeout(deadline);
      reject(error);
    });
    request.end();
  });
}
