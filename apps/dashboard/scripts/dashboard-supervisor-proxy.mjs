import http from "node:http";

const PREFIX = "/api/supervisor/";
const DISABLED_MEMORY_INBOX_UPLOAD_PATH = `${PREFIX}memory-inbox/upload`;
const MAX_BODY_BYTES = 256 * 1024;
const MAX_CONTROLS_RESPONSE_BYTES = 1024 * 1024;
const PROXY_TIMEOUT_MS = 2000;
// AI-draft and LLM-Wiki writes copy and fsync a complete configured vault.
// Keep their UDS response deadline distinct from the short dashboard-read
// deadline so an honest completed write is never reported as an unconfirmed
// 503 solely because backup durability exceeded two seconds.
const MEMORY_PROPOSAL_ARTIFACT_WRITE_TIMEOUT_MS = 15 * 60 * 1000;
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const UNSAFE_CANONICAL_METADATA_TEXT_RE = /\b(raw[\s_-]*(prompts?|completions?|transcripts?)|reasoning[\s_-]*traces?|provider[\s_-]*payloads?|secrets?([\s_-]*(key|token|value|id))?|credentials?([\s_-]*(key|token|value|id))?|(terminal|tmux|pane)[\s_-]*(scrollbacks?|texts?|outputs?|stdouts?|stderrs?))\b/i;
const TOKEN_LIKE_CANONICAL_METADATA_RE = /(?<![A-Za-z0-9])(?:sk-(?:proj-)?[A-Za-z0-9][A-Za-z0-9_-]{7,}|gh[pousr]_[A-Za-z0-9]{12,}|github_pat_[A-Za-z0-9_]{12,}|xox[baprs]-[A-Za-z0-9-]{8,}|AIza[A-Za-z0-9_-]{8,}|AKIA[A-Z0-9]{8,}|ASIA[A-Z0-9]{8,}|glpat-[A-Za-z0-9_-]{8,}|npm_[A-Za-z0-9]{8,}|Bearer\s+[A-Za-z0-9._~+/=-]{20,}|eyJ[A-Za-z0-9_-]{20,})(?![A-Za-z0-9_-])/i;
const EXECUTABLE_CANONICAL_METADATA_TEXT_RE = /\b(tmux\s+(kill|send|capture|new|attach)|git(hub)?\s+(push|merge|checkout|reset|clean|branch|pr)|gh\s+(pr|repo|api)|curl\s+|bash\s+|sh\s+|python\s+|node\s+|pnpm\s+|uv\s+run|provider\s+(call|request|payload))\b/i;
const MEMORY_INBOX_PROPOSAL_DECISION_PATH = /^\/memory-inbox\/proposals\/[A-Za-z0-9._:%-]+\/(?:return|deny|approve)$/;
const LLM_WIKI_ARTIFACT_PATH = /^\/work-items\/[A-Za-z0-9._:%-]+\/memory-proposals\/[A-Za-z0-9._:%-]+\/llm-wiki-artifact$/;
const MEMORY_PROPOSAL_MUTATION_PATH = /^\/work-items\/[A-Za-z0-9._:%-]+\/memory-proposals\/[A-Za-z0-9._:%-]+(?:\/(?:ai-draft|llm-wiki-rebuild))?$/;
const MEMORY_PROPOSAL_WRITE_RECOVERY_PATH = /^\/work-items\/[A-Za-z0-9._:%-]+\/memory-proposals\/[A-Za-z0-9._:%-]+\/recover-abandoned-write$/;
const READ_ONLY_SUPERVISOR_PATHS = [
  /^\/memory-inbox\/shell$/,
  /^\/memory-inbox\/projection$/,
  /^\/memory-inbox\/proposals\/[A-Za-z0-9._:%-]+\/revisions\/[1-9][0-9]*\/reader$/,
  /^\/pipeline-control-plane\/(?:projection|canonical-operational-projection|work-packets(?:\/[A-Za-z0-9._:%-]+)?|work-items\/[A-Za-z0-9._:%-]+\/(?:packet|memory-review))$/,
  LLM_WIKI_ARTIFACT_PATH,
];
const CANONICAL_PACKET_READ_PATH = /^\/pipeline-control-plane\/(?:work-packets(?:\/[A-Za-z0-9._:%-]+)?|work-items\/[A-Za-z0-9._:%-]+\/packet)$/;
const CLIENT_SAFE_PROJECTION_METADATA_KEYS = new Set(`schemaVersion projectionId generatedAt sourceUpdatedAt sourceLabel freshnessState staleAfterSeconds backendReachability fixtureMode truthSummary stageSummaries sourceStates workPackets selectedPacketDetails managerSummary activeManagerLaneClarity coordinationHealth workerSummary reliabilityProblems gatedControls runtimeReadiness actionCapabilities actionCapabilitiesV1 executeAdmission queueSummary evidenceRefs packetId title currentStage status truthLabel sourceRef canonicalContract productModeMapping blocker nextAction unblocker readyToTest workItemId queueLease executionAttempts correlationIds updatedAt metadataOnly sourceRefs latestTransitionEventRef recentTransitionEventRefs latestMovementSummary canSatisfyLiveMovementProof parentPacketId lineageKind operatorTestState operatorTestNote actionResults actionResultsV1 reviewRoute workGraph refId sourceType pathOrUrl contentSha256 readyId userFacingSummary testableSurface verificationRefs rawPayloadRetained leaseId attemptCount heartbeatAt leaseExpiresAt fencingToken active state attemptId routeDecisionId workerId lane eventRefs availability routeState reasonCode reason safeFallback exactIdentity issuanceState findingSummary count highestSeverity dataClass execution deliveryEvidenceEligible retention sourceSchemaVersion executionJobId reportIdentity waveMembership dependencyState reservation capacity posture owner nextSafeAction label emptyReason backendEmpty backendUnavailable fixtureBacked stale summary stage packetCount sourceId sourceKind runId observedAt source freshness activeWorkCount staleOwnerTargetCount staleOwnerProjectedCount dirtyPreserveCount missingWorktreeJournalHold reliabilityState checkedAt enabled allowedForEnvironment visibleLabelRequired canSatisfyLiveProof activeLeaseCount activeWorkerCount warmWorkerCount blockedQueueCount dispatchableQueueCount closedQueueCount healthySourceCount exhaustedSourceCount blockedSourceCount gatedSourceCount staleSourceCount unavailableSourceCount refillingSourceCount unknownSourceCount sourceExhausted inactivityReason warmCount waitingCount stalledCount failedCount drainingCount killedCount completeCount unavailableCount unknownCount workerRefs problemId kind severity likelyIssue controlId operation authorityFamily stopLine blockedCount gatedCount limits observed blockingDimensions policyVersion capacityAvailable actionId targetType targetId capabilityState authorityState riskTier typedReason expectedResultSummary correlationRequired idempotencyRequired actionContext actionContextDigestSha256 sourceMode serverBound expectedRuntimeMode expectedRuntimeRevision expectedActiveWorkCount expectedActiveLeaseCount expectedRunningAttemptCount expectedPacketCurrentEventId expectedCurrentOwnerId newOwnerId expectedWorkItemState expectedWorkItemUpdatedAt expectedActiveLeaseId expectedRunningAttemptId expectedOriginalAttemptId expectedRetryIntentId expectedLinkedWorkItemId expectedLinkedPacketId outcome resultingStage resultingStatus actionRecordId approvalId childPacketId idempotencyKey successEvidence replayed originalAttemptId retryIntentId linkedWorkItemId linkedPacketId resultingPacketCurrentEventId originalAttemptPreserved providerOrWorkerLaunched resultingRuntimeMode resultingRuntimeRevision runningAttemptCount intakeStopped activeWorkPreserved activeWorkAllowedToConverge workersKilled intakeResumed previousOwnerId activeLeaseTransferred workerLaunched`.split(" "));
[
  "executionAttemptId", "expectedAttemptStatus", "expectedAttemptUpdatedAt", "expectedLeaseId", "expectedLeaseFencingToken", "expectedLeaseActive",
  "stateSource", "activeCount", "closedCount", "staleCount", "refillingCount",
].forEach((key) => CLIENT_SAFE_PROJECTION_METADATA_KEYS.add(key));
// This is deliberately smaller than the operator read surface. It is the
// complete browser-to-supervisor capability of the fixed verification account.
const TEST_VIEWER_READ_PATHS = [
  // Target IDs are decoded exactly once before this check. `%` is excluded so
  // a second decoder in an upstream library can never reinterpret a permitted
  // viewer packet ID as a path separator or dot segment.
  /^\/pipeline-control-plane\/(?:projection|canonical-operational-projection|work-packets(?:\/[A-Za-z0-9._:-]+)?|work-items\/[A-Za-z0-9._:-]+\/packet)$/,
];
const ALLOWED_SUPERVISOR_PATHS = [
  /^\/memory-inbox\/shell$/,
  /^\/memory-inbox\/projection$/,
  /^\/memory-inbox\/proposals\/[A-Za-z0-9._:%-]+\/revisions\/[1-9][0-9]*\/reader$/,
  MEMORY_INBOX_PROPOSAL_DECISION_PATH,
  /^\/supervisor\/status$/,
  /^\/supervisor\/runtime-evidence-review-report$/,
  /^\/events$/,
  /^\/audit-events$/,
  /^\/work-items(?:\/[A-Za-z0-9._:%-]+(?:\/[A-Za-z0-9._:%?-]+)*)?$/,
  /^\/candidate-work(?:\/[A-Za-z0-9._:%-]+)?(?:\/promote|\/import-bmad|\/import-obsidian-metadata)?$/,
  /^\/pipeline-control-plane\/(?:projection|canonical-operational-projection|work-packets(?:\/[A-Za-z0-9._:%-]+)?|work-items\/[A-Za-z0-9._:%-]+\/(?:packet|memory-review)|actions(?:\/v1(?:\/capability)?)?|approvals(?:\/v1)?)$/,
  /^\/operator-views(?:\/[A-Za-z0-9._:%-]+(?:\/default)?)?$/,
];
export const MEMORY_INBOX_MUTATION_PATHS = new Set([
  "/memory-inbox/text-capture",
]);
const MEMORY_INBOX_LIFECYCLE_PATH = /^\/memory-inbox\/sources\/inbox-source:[A-Za-z0-9_-]+\/lifecycle$/;
// Controls has a separate exact browser capability. These paths deliberately
// have no parameters and no query contract.
export const CONTROLS_READ_PATHS = new Set([
  "/supervisor/status", "/work-items", "/routing/worker-registry", "/routing/lane-profiles",
  "/supervisor/execution-readiness-report", "/supervisor/documentation-authority-report", "/supervisor/legacy-planning-artifact-inventory", "/supervisor/verification-readiness-report", "/supervisor/authority-readiness-matrix-report", "/supervisor/dashboard-e2e-report", "/supervisor/report-catalog", "/supervisor/maintenance-readiness-report", "/supervisor/maintenance-action-plan-report", "/supervisor/development-runway-report", "/supervisor/runtime-evidence-review-report", "/supervisor/safe-development-backlog", "/supervisor/runner-assignment-status-report", "/supervisor/managed-recipe-policy-report", "/supervisor/github-workflow-policy-report", "/supervisor/github-delivery-authority-report", "/supervisor/git-hygiene-report", "/supervisor/local-cleanup-readiness-report", "/supervisor/remote-cleanup-sync-readiness-report", "/supervisor/trusted-delivery-eligibility-report", "/supervisor/trusted-autonomy-readiness-report", "/supervisor/epic-6-mvp-proof-trial-report", "/supervisor/codex-readiness-report", "/supervisor/codex-implementation-approval-report", "/supervisor/claude-review-readiness-report", "/supervisor/claude-review-approval-report", "/supervisor/review-resource-policy-report", "/supervisor/delivery-readiness-policy-report", "/execution-recipes",
]);
export const CONTROLS_MUTATION_PATHS = new Set([
  "/pipeline-control-plane/actions/v1/capability",
  "/pipeline-control-plane/approvals/v1",
  "/pipeline-control-plane/actions/v1",
]);
const SAVED_VIEW_SCOPES = new Set(["active-work", "attention", "queue", "audit"]);
const LLM_WIKI_ARTIFACT_QUERY_PATH = new RegExp(`^${PREFIX}work-items/[A-Za-z0-9._:%-]+/memory-proposals/[A-Za-z0-9._:%-]+/llm-wiki-artifact$`);

function allowedReadQuery(url, method) {
  if (!url.search) return true;
  // Saved-view scopes are the only authenticated dashboard reads that need a
  // query. Preserve a one-key, one-value contract instead of allowing a
  // generic query pass-through to the private supervisor.
  if (method !== "GET" || [...url.searchParams].length !== 1) return false;
  if (url.pathname === `${PREFIX}operator-views`) {
    return url.searchParams.getAll("scope").length === 1 && SAVED_VIEW_SCOPES.has(url.searchParams.get("scope"));
  }
  return LLM_WIKI_ARTIFACT_QUERY_PATH.test(url.pathname)
    && url.searchParams.getAll("query").length === 1
    && url.searchParams.get("query").length <= 120;
}

function sendJson(response, statusCode, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
  });
  response.end(body);
}

function rejectDisabledUpload(request, response) {
  // This route is intentionally not a dashboard capability. Close after the
  // denial so bytes supplied on a query-bearing or bodied attempt cannot be
  // treated as a later request on a reusable connection.
  request.resume();
  response.shouldKeepAlive = false;
  response.setHeader("connection", "close");
  sendJson(response, 404, { state: "unavailable" });
}

function readBody(request) {
  return new Promise((resolve) => {
    const chunks = [];
    let total = 0;
    let settled = false;
    const deadline = setTimeout(() => { request.destroy(); finish(null); }, PROXY_TIMEOUT_MS);
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      resolve(value);
    };
    request.on("data", (chunk) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) { request.destroy(); finish(null); return; }
      chunks.push(chunk);
    });
    request.on("end", () => finish(Buffer.concat(chunks)));
    request.on("error", () => finish(null));
  });
}

function sessionRole(body) {
  try {
    const payload = JSON.parse(body.toString("utf8"));
    return payload?.authenticated === true && (payload.role === "operator" || payload.role === "test_viewer")
      ? payload.role
      : null;
  } catch {
    return null;
  }
}

function cookieValue(cookie, name) {
  return (cookie || "").split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1) || "";
}

function encodedSupervisorPath(targetPath) {
  // Validate decoded path segments, then encode each segment exactly once for
  // the UDS request.  This preserves a canonical opaque ID containing a
  // literal percent without permitting the proxy to pass a second-decoded
  // separator or dot segment upstream.
  return targetPath.split("/").map((segment) => encodeURIComponent(segment)).join("/");
}

export function createSupervisorProxy({ supervisorUdsPath, expectedOrigin, timeoutMs = PROXY_TIMEOUT_MS, memoryProposalArtifactWriteTimeoutMs = MEMORY_PROPOSAL_ARTIFACT_WRITE_TIMEOUT_MS }) {
  if (typeof supervisorUdsPath !== "string" || !supervisorUdsPath.startsWith("/")) throw new Error("Supervisor proxy requires a fixed absolute UDS path.");
  if (
    !Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > MEMORY_PROPOSAL_ARTIFACT_WRITE_TIMEOUT_MS
    || !Number.isInteger(memoryProposalArtifactWriteTimeoutMs) || memoryProposalArtifactWriteTimeoutMs < timeoutMs || memoryProposalArtifactWriteTimeoutMs > MEMORY_PROPOSAL_ARTIFACT_WRITE_TIMEOUT_MS
  ) {
    throw new Error("Supervisor proxy timeouts must be positive bounded integers.");
  }
  return async function proxy(request, response) {
    let url;
    try { url = new URL(request.url || "/", "https://dashboard.invalid"); } catch { return false; }
    if (url.pathname === DISABLED_MEMORY_INBOX_UPLOAD_PATH) {
      rejectDisabledUpload(request, response);
      return true;
    }
    if (!url.pathname.startsWith(PREFIX) || !allowedReadQuery(url, request.method)) return false;
    let targetPath;
    try { targetPath = `/${decodeURIComponent(url.pathname.slice(PREFIX.length))}`; } catch { sendJson(response, 400, { state: "unavailable" }); return true; }
    if (!targetPath.startsWith("/") || targetPath.includes("?") || targetPath.includes("#") || targetPath.includes("\\") || targetPath.includes("/../") || targetPath.includes("/./")) { sendJson(response, 400, { state: "unavailable" }); return true; }
    // A once-decoded traversal escape must never reach a second parser. Other
    // literal percent signs are valid in opaque canonical packet identifiers
    // and are normalized by encodedSupervisorPath before forwarding.
    if (/%(?:2f|5c|2e)/i.test(targetPath) || (MUTATING_METHODS.has(request.method) && targetPath.includes("%"))) { sendJson(response, 400, { state: "unavailable" }); return true; }
    if (!ALLOWED_SUPERVISOR_PATHS.some((pattern) => pattern.test(targetPath)) && !CONTROLS_READ_PATHS.has(targetPath) && !CONTROLS_MUTATION_PATHS.has(targetPath) && !MEMORY_INBOX_MUTATION_PATHS.has(targetPath) && !MEMORY_INBOX_LIFECYCLE_PATH.test(targetPath)) { sendJson(response, 404, { state: "unavailable" }); return true; }
    const controlsRead = CONTROLS_READ_PATHS.has(targetPath);
    const controlsMutation = CONTROLS_MUTATION_PATHS.has(targetPath);
    const memoryInboxMutation = MEMORY_INBOX_MUTATION_PATHS.has(targetPath) || MEMORY_INBOX_LIFECYCLE_PATH.test(targetPath) || MEMORY_INBOX_PROPOSAL_DECISION_PATH.test(targetPath) || MEMORY_PROPOSAL_WRITE_RECOVERY_PATH.test(targetPath);
    const memoryProposalMutation = MEMORY_PROPOSAL_MUTATION_PATH.test(targetPath);
    // These operations may copy/fsync an entire configured vault. Recovery
    // can also remove or reconcile a full interrupted backup, so it shares
    // the write durability deadline rather than returning an ambiguous 503
    // under the normal dashboard read deadline.
    const memoryProposalArtifactWrite = /\/(?:ai-draft|llm-wiki-rebuild)$/.test(targetPath) || MEMORY_PROPOSAL_WRITE_RECOVERY_PATH.test(targetPath);
    if (controlsRead && (!['GET', 'HEAD'].includes(request.method) || url.search)) {
      sendJson(response, ['GET', 'HEAD'].includes(request.method) ? 404 : 405, { state: "unavailable" });
      return true;
    }
    if (controlsMutation && (request.method !== "POST" || url.search)) {
      sendJson(response, request.method === "POST" ? 404 : 405, { state: "unavailable" });
      return true;
    }
    if (memoryInboxMutation && (request.method !== "POST" || url.search)) {
      sendJson(response, request.method === "POST" ? 404 : 405, { state: "unavailable" });
      return true;
    }
    const expectedMemoryProposalMethod = targetPath.endsWith("/ai-draft") || targetPath.endsWith("/llm-wiki-rebuild") ? "POST" : "PATCH";
    if (memoryProposalMutation && (request.method !== expectedMemoryProposalMethod || url.search)) {
      sendJson(response, request.method === expectedMemoryProposalMethod ? 404 : 405, { state: "unavailable" });
      return true;
    }
    if (!request.headers.cookie) { sendJson(response, 401, { state: "sign_in_required" }); return true; }
    if (["forwarded", "x-forwarded-for", "x-forwarded-host", "x-forwarded-proto", "x-forwarded-port"].some((name) => request.headers[name])) {
      sendJson(response, 400, { state: "unavailable" });
      return true;
    }
    try {
      const session = await requestSupervisor(supervisorUdsPath, "/auth/session", "GET", { cookie: request.headers.cookie }, Buffer.alloc(0), timeoutMs);
      const role = session.statusCode === 200 ? sessionRole(session.body) : null;
      if (!role) { sendJson(response, 401, { state: "sign_in_required" }); return true; }
      // Controls method denial is intentionally evaluated before the generic
      // mutation origin guard, so a non-POST never becomes an origin oracle.
      if (MUTATING_METHODS.has(request.method) && (!request.headers.origin || request.headers.origin !== expectedOrigin)) {
        sendJson(response, 403, { state: "unavailable" });
        return true;
      }
      if (role === "test_viewer" && (controlsRead || controlsMutation || memoryInboxMutation || memoryProposalMutation)) {
        sendJson(response, 404, { state: "unavailable" });
        return true;
      }
      if (role === "test_viewer" && (!TEST_VIEWER_READ_PATHS.some((pattern) => pattern.test(targetPath)) || !["GET", "HEAD"].includes(request.method))) {
        sendJson(response, ["GET", "HEAD"].includes(request.method) ? 404 : 405, { state: "unavailable" });
        return true;
      }
      if (controlsMutation && (role !== "operator" || request.headers.origin !== expectedOrigin || !request.headers["x-csrf-token"] || request.headers["x-csrf-token"] !== cookieValue(request.headers.cookie, "kendall_operator_csrf"))) {
        sendJson(response, 403, { state: "unavailable" });
        return true;
      }
      if (memoryInboxMutation && (role !== "operator" || request.headers.origin !== expectedOrigin || !request.headers["x-csrf-token"] || request.headers["x-csrf-token"] !== cookieValue(request.headers.cookie, "kendall_operator_csrf"))) {
        sendJson(response, 403, { state: "unavailable" });
        return true;
      }
      if (memoryProposalMutation && (role !== "operator" || request.headers.origin !== expectedOrigin || !request.headers["x-csrf-token"] || request.headers["x-csrf-token"] !== cookieValue(request.headers.cookie, "kendall_operator_csrf"))) {
        sendJson(response, 403, { state: "unavailable" });
        return true;
      }
      if (READ_ONLY_SUPERVISOR_PATHS.some((pattern) => pattern.test(targetPath)) && !["GET", "HEAD"].includes(request.method)) {
        sendJson(response, 405, { state: "unavailable" });
        return true;
      }
      const body = await readBody(request);
      if (body === null) { sendJson(response, 413, { state: "unavailable" }); return true; }
      if (targetPath === "/events") {
        await streamSupervisor(supervisorUdsPath, targetPath, request.headers, response, timeoutMs);
        return true;
      }
      const encodedTargetPath = encodedSupervisorPath(targetPath);
      const upstreamPath = url.search ? `${encodedTargetPath}?${url.searchParams.toString()}` : encodedTargetPath;
      const upstreamTimeoutMs = memoryProposalArtifactWrite ? memoryProposalArtifactWriteTimeoutMs : timeoutMs;
      const upstream = await requestSupervisor(supervisorUdsPath, upstreamPath, request.method, request.headers, body, upstreamTimeoutMs, controlsRead ? MAX_CONTROLS_RESPONSE_BYTES : Infinity);
      // A viewer revocation concurrent with an in-flight read must win before
      // the browser receives data. Operator requests retain existing behavior.
      if (role === "test_viewer") {
        const confirmation = await requestSupervisor(supervisorUdsPath, "/auth/session", "GET", { cookie: request.headers.cookie }, Buffer.alloc(0), timeoutMs);
        if (confirmation.statusCode !== 200 || sessionRole(confirmation.body) !== "test_viewer") {
          sendJson(response, 401, { state: "sign_in_required" });
          return true;
        }
      }
      const browserSafeBody = request.method === "GET"
        ? CANONICAL_PACKET_READ_PATH.test(targetPath)
          ? redactCanonicalPacketResponse(upstream.body)
          : targetPath === "/pipeline-control-plane/canonical-operational-projection"
            ? redactCanonicalOperationalProjectionResponse(upstream.body)
            : targetPath === "/pipeline-control-plane/projection"
              ? redactPipelineProjectionResponse(upstream.body)
            : upstream.body
        : upstream.body;
      const headers = { "cache-control": "no-store", "content-type": upstream.contentType || "application/json; charset=utf-8" };
      if (upstream.setCookie) headers["set-cookie"] = upstream.setCookie;
      response.writeHead(upstream.statusCode, headers);
      response.end(browserSafeBody);
    } catch {
      if (response.headersSent) response.destroy();
      else sendJson(response, 503, { state: "unavailable" });
    }
    return true;
  };
}

function redactCanonicalPacketResponse(body) {
  let payload;
  try {
    payload = JSON.parse(body.toString("utf8"));
  } catch {
    return Buffer.from(JSON.stringify({ state: "unavailable" }));
  }
  const redact = (packet) => redactCanonicalPacket(packet);
  const safePayload = Array.isArray(payload)
    ? payload.map(redact)
    : payload && typeof payload === "object" && Array.isArray(payload.data)
      ? { data: payload.data.map(redact) }
      : payload && typeof payload === "object" && payload.data && typeof payload.data === "object"
        ? { data: redact(payload.data) }
        : redact(payload);
  return Buffer.from(JSON.stringify(safePayload));
}

/** The V1 board-read contract deliberately omits browser action-result history. */
function redactCanonicalOperationalProjectionResponse(body) {
  return redactPipelineProjectionResponse(body, { includeActionResultsV1: false });
}

/** Rebuild the compact V1 Lane Clarity DTO; the generic projection scrubber has no nested schema for it. */
function redactCanonicalManagerLaneClarity(clarity) {
  const record = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : null;
  const goal = record(clarity?.goal);
  const posture = record(clarity?.posture);
  const canonicalState = record(clarity?.canonicalState);
  const nextGate = record(clarity?.nextGate);
  if (!record(clarity) || !goal || !posture || !canonicalState || !nextGate
    || typeof goal.summary !== "string" || typeof goal.sourceRef !== "string"
    || typeof posture.state !== "string" || typeof posture.reason !== "string" || typeof posture.nextSafeAction !== "string"
    || !(posture.decisionRef === null || typeof posture.decisionRef === "string")
    || !(posture.qualification === null || typeof posture.qualification === "string")
    || typeof canonicalState.phase !== "string" || typeof canonicalState.freshness !== "string" || typeof canonicalState.evidenceFreshness !== "string"
    || typeof nextGate.summary !== "string" || typeof nextGate.nextSafeAction !== "string"
    || !Array.isArray(clarity.criteria)
    || !clarity.criteria.every((criterion) => {
      const item = record(criterion);
      return item && typeof item.criterionId === "string" && typeof item.summary === "string"
        && typeof item.disposition === "string" && Array.isArray(item.evidenceRefs)
        && item.evidenceRefs.every((ref) => typeof ref === "string");
    })) return null;
  const criteria = clarity.criteria.map((criterion) => ({
    criterionId: criterion.criterionId,
    summary: criterion.summary,
    disposition: criterion.disposition,
    evidenceRefs: criterion.evidenceRefs,
  }));
  return {
    goal: { summary: goal.summary, sourceRef: goal.sourceRef },
    posture: {
      state: posture.state,
      reason: posture.reason,
      nextSafeAction: posture.nextSafeAction,
      decisionRef: posture.decisionRef,
      qualification: posture.qualification,
    },
    canonicalState: {
      phase: canonicalState.phase,
      freshness: canonicalState.freshness,
      evidenceFreshness: canonicalState.evidenceFreshness,
    },
    nextGate: { summary: nextGate.summary, nextSafeAction: nextGate.nextSafeAction },
    criteria,
  };
}

/** Rebuild the compact dashboard Coordination Health DTO; never forward the V0 receipt. */
function redactCanonicalCoordinationHealth(health) {
  const record = health && typeof health === "object" && !Array.isArray(health) ? health : null;
  const safeText = (value) => typeof value === "string"
    && value.trim() === value
    && value.length > 0
    && value.length <= 500
    && !/[\x00-\x1f\x7f]/.test(value)
    && !UNSAFE_CANONICAL_METADATA_TEXT_RE.test(value)
    && !TOKEN_LIKE_CANONICAL_METADATA_RE.test(value)
    && !EXECUTABLE_CANONICAL_METADATA_TEXT_RE.test(value);
  const safeRef = (value) => typeof value === "string"
    && value.trim() === value
    && value.length > 0
    && value.length <= 255
    && !/[\x00-\x1f\x7f]/.test(value)
    && !UNSAFE_CANONICAL_METADATA_TEXT_RE.test(value)
    && !TOKEN_LIKE_CANONICAL_METADATA_RE.test(value);
  if (!record || record.schemaVersion !== "manager-coordination-health/v0"
    || !safeRef(record.runId) || typeof record.observedAt !== "string" || !Number.isFinite(Date.parse(record.observedAt))
    || record.source !== "manager_workspace_inventory"
    || !(record.freshness === "fresh" || record.freshness === "unavailable")
    || !(record.availability === "available" || record.availability === "incomplete" || record.availability === "unavailable")
    || ![record.activeWorkCount, record.staleOwnerTargetCount, record.staleOwnerProjectedCount, record.dirtyPreserveCount]
      .every((count) => Number.isSafeInteger(count) && count >= 0)
    || record.staleOwnerProjectedCount > record.staleOwnerTargetCount
    || (record.staleOwnerProjectedCount !== record.staleOwnerTargetCount && record.availability !== "incomplete")
    || typeof record.missingWorktreeJournalHold !== "boolean"
    || !safeText(record.nextSafeAction)
    || !Array.isArray(record.evidenceRefs) || record.evidenceRefs.length > 8 || !record.evidenceRefs.every(safeRef)
    || record.metadataOnly !== true || record.rawPayloadRetained !== false) return null;
  return {
    observedAt: record.observedAt,
    source: "manager_workspace_inventory",
    freshness: record.freshness,
    availability: record.availability,
    activeWorkCount: record.activeWorkCount,
    staleOwnerTargetCount: record.staleOwnerTargetCount,
    staleOwnerProjectedCount: record.staleOwnerProjectedCount,
    dirtyPreserveCount: record.dirtyPreserveCount,
    missingWorktreeJournalHold: record.missingWorktreeJournalHold,
    nextSafeAction: record.nextSafeAction,
    metadataOnly: true,
  };
}

function redactPipelineProjectionResponse(body, { includeActionResultsV1 = true } = {}) {
  let payload;
  try {
    payload = JSON.parse(body.toString("utf8"));
  } catch {
    return Buffer.from(JSON.stringify({ state: "unavailable" }));
  }
  const redactWorkPacket = (packet) => packet && typeof packet === "object" && !Array.isArray(packet)
    ? {
        packetId: packet.packetId,
        title: packet.title,
        currentStage: packet.currentStage,
        status: packet.status,
        truthLabel: packet.truthLabel,
        sourceRef: packet.sourceRef,
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
      }
    : packet;
  const redactSelectedPacketDetail = (detail) => detail && typeof detail === "object" && !Array.isArray(detail)
    ? {
        packetId: detail.packetId,
        sourceRefs: detail.sourceRefs,
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
        actionCapabilities: detail.actionCapabilities,
        actionCapabilitiesV1: detail.actionCapabilitiesV1,
        actionResults: detail.actionResults,
        ...(includeActionResultsV1 ? { actionResultsV1: detail.actionResultsV1 } : {}),
        workItemId: detail.workItemId,
        queueLease: detail.queueLease,
        executionAttempts: detail.executionAttempts,
        correlationIds: detail.correlationIds,
        reviewRoute: detail.reviewRoute,
        workGraph: detail.workGraph,
        metadataOnly: detail.metadataOnly,
      }
    : detail;
  const redact = (projection) => {
    if (!projection || typeof projection !== "object" || Array.isArray(projection)) return { state: "unavailable" };
    const safeProjection = redactNestedProjectionMetadata({
      schemaVersion: projection.schemaVersion,
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
      workPackets: Array.isArray(projection.workPackets) ? projection.workPackets.map(redactWorkPacket) : projection.workPackets,
      selectedPacketDetails: Array.isArray(projection.selectedPacketDetails) ? projection.selectedPacketDetails.map(redactSelectedPacketDetail) : projection.selectedPacketDetails,
      managerSummary: projection.managerSummary,
      // Reinserted below by the dedicated strict V1 DTO reconstruction.
      activeManagerLaneClarity: null,
      // Reinserted below by the dedicated strict V1 DTO reconstruction.
      coordinationHealth: null,
      workerSummary: projection.workerSummary,
      reliabilityProblems: projection.reliabilityProblems,
      gatedControls: projection.gatedControls,
      runtimeReadiness: projection.runtimeReadiness,
      actionCapabilities: projection.actionCapabilities,
      actionCapabilitiesV1: projection.actionCapabilitiesV1,
      executeAdmission: projection.executeAdmission,
      queueSummary: projection.queueSummary,
      evidenceRefs: projection.evidenceRefs,
    });
    return {
      ...safeProjection,
      activeManagerLaneClarity: redactCanonicalManagerLaneClarity(projection.activeManagerLaneClarity),
      coordinationHealth: redactCanonicalCoordinationHealth(projection.coordinationHealth),
    };
  };
  const safePayload = payload && typeof payload === "object" && payload.data && typeof payload.data === "object"
    ? { data: redact(payload.data) }
    : redact(payload);
  return Buffer.from(JSON.stringify(safePayload));
}

function redactNestedProjectionMetadata(value) {
  if (Array.isArray(value)) return value.map(redactNestedProjectionMetadata);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => CLIENT_SAFE_PROJECTION_METADATA_KEYS.has(key))
    .map(([key, nested]) => [key, redactNestedProjectionMetadata(nested)]));
}

function redactCanonicalPacket(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { state: "unavailable" };
  const packet = value;
  const packetId = typeof packet.packetId === "string" ? packet.packetId : null;
  if (!packetId) return { state: "unavailable" };
  const sourceRef = { refId: `authoritative:${packetId}`, sourceType: "workflow", pathOrUrl: null, title: "Authoritative lifecycle metadata", contentSha256: null };
  const rawHistory = Array.isArray(packet.history) ? packet.history : [];
  const currentIndex = rawHistory.findIndex((event) => event && typeof event === "object" && event.eventId === packet.currentEventId);
  const history = rawHistory.map((event, index) => {
    const rawEvent = event && typeof event === "object" ? event : {};
    return {
      eventId: `event:${index + 1}`,
      packetId,
      schemaVersion: 1,
      eventType: rawEvent.eventType,
      previousStage: rawEvent.previousStage ?? null,
      targetStage: rawEvent.targetStage,
      status: rawEvent.status,
      truthLabel: rawEvent.truthLabel,
      sourceRef,
      actor: { actorType: rawEvent.actor?.actorType },
      occurredAt: rawEvent.occurredAt,
      payloadSummary: "Redacted metadata-only lifecycle event.",
      evidenceRefs: [],
      metadataOnly: true,
    };
  });
  return {
    packetId,
    title: "Canonical supervisor packet",
    currentStage: packet.currentStage,
    status: packet.status,
    truthLabel: packet.truthLabel,
    sourceRef,
    createdAt: packet.createdAt,
    updatedAt: packet.updatedAt,
    currentEventId: currentIndex >= 0 ? `event:${currentIndex + 1}` : null,
    parentPacketId: null,
    lineageKind: "root",
    readyToTest: null,
    operatorTestState: "not_ready",
    operatorTestNote: null,
    history,
    metadataOnly: true,
  };
}

function streamSupervisor(socketPath, targetPath, headers, response, timeoutMs) {
  return new Promise((resolve, reject) => {
    const request = http.request({ socketPath, path: targetPath, method: "GET", headers: { accept: "text/event-stream", cookie: headers.cookie } }, (upstream) => {
      response.writeHead(upstream.statusCode || 503, { "cache-control": "no-store", "content-type": upstream.headers["content-type"] || "text/event-stream" });
      upstream.pipe(response);
      upstream.on("end", resolve);
      upstream.on("error", reject);
    });
    const deadline = setTimeout(() => request.destroy(new Error("Supervisor stream startup timed out.")), timeoutMs);
    request.on("error", (error) => { clearTimeout(deadline); reject(error); });
    request.on("response", () => clearTimeout(deadline));
    request.end();
  });
}

function requestSupervisor(socketPath, targetPath, method, headers, body, timeoutMs, maxResponseBytes = Infinity) {
  return new Promise((resolve, reject) => {
    const request = http.request({
      socketPath,
      path: targetPath,
      method,
      headers: {
        accept: headers.accept || "application/json",
        ...(headers.cookie ? { cookie: headers.cookie } : {}),
        ...(headers.origin ? { origin: headers.origin } : {}),
        ...(headers["x-csrf-token"] ? { "x-csrf-token": headers["x-csrf-token"] } : {}),
        ...(body.length ? { "content-type": headers["content-type"] || "application/json", "content-length": body.length } : {}),
      },
    }, (response) => {
      const chunks = [];
      let total = 0;
      response.on("data", (chunk) => {
        total += chunk.length;
        if (total > maxResponseBytes) { response.destroy(new Error("Supervisor response exceeds the allowed size.")); return; }
        chunks.push(chunk);
      });
      response.on("end", () => resolve({ statusCode: response.statusCode || 503, body: Buffer.concat(chunks), contentType: response.headers["content-type"], setCookie: response.headers["set-cookie"] }));
      response.on("error", reject);
    });
    const deadline = setTimeout(() => request.destroy(new Error("Supervisor proxy deadline exceeded.")), timeoutMs);
    request.on("error", reject);
    request.on("close", () => clearTimeout(deadline));
    request.end(body);
  });
}
