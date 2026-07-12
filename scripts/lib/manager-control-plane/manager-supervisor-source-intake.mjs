import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

const SOURCE_INTAKE_PATH = "/pipeline-control-plane/work-packets";
const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_TIMEOUT_MS = 30_000;
const MAX_PACKET_BYTES = 256 * 1024;
const FORBIDDEN_METADATA = /\b(raw[ _-]?(prompt|completion|payload|transcript)|provider[ _-]?payload|reasoning[ _-]?trace|terminal[ _-]?scrollback|tmux[ _-]?scrollback|pane[ _-]?scrollback|secret|credential|api[ _-]?key|access[ _-]?token)\b/i;
const FORBIDDEN_FIELD = /(raw(?!payloadretained)|prompt|completion|provider.*payload|reasoning|secret|credential|token|scrollback|transcript)/i;
const STAGES = new Set(["capture", "classify", "route", "shape", "needs_approval", "execute", "review", "promote", "deliver", "learn"]);
const STATUSES = new Set(["waiting", "active", "blocked", "failed", "done"]);

export class ManagerSupervisorSourceIntakeError extends Error {
  constructor(code, message, packet, options = {}) {
    super(message, options);
    this.name = "ManagerSupervisorSourceIntakeError";
    this.code = code;
    this.packet = failClosedPacket(packet, code, message);
  }
}

export function deriveAuthoritativePacketId(candidateWorkPacketId) {
  const candidateId = requiredSafeMetadata(candidateWorkPacketId, "candidateWorkPacketId", 120);
  return `manager-source-${digest(candidateId, 40)}`;
}

export function resolveLoopbackSourceIntakeEndpoint(supervisorUrl) {
  let parsed;
  try {
    parsed = new URL(requiredString(supervisorUrl, "supervisorUrl", 2048));
  } catch (error) {
    throw new TypeError("supervisorUrl must be an absolute loopback HTTP(S) URL.", { cause: error });
  }
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!["localhost", "127.0.0.1", "::1"].includes(hostname)) {
    throw new TypeError("supervisorUrl must use a loopback host: localhost, 127.0.0.1, or ::1.");
  }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new TypeError("supervisorUrl must be an uncredentialed loopback HTTP(S) base URL.");
  }
  if (parsed.pathname !== "/" && parsed.pathname !== "") {
    throw new TypeError("supervisorUrl must not include an application path.");
  }
  return new URL(SOURCE_INTAKE_PATH, parsed).href;
}

export function buildManagerSourceIntakeRequest(packet) {
  const candidate = eligibleSeedCandidate(packet);
  const candidateId = requiredSafeMetadata(candidate.candidateWorkPacketId || candidate.candidateId, "seedPacket.candidateWorkPacketId", 120);
  const title = requiredSafeMetadata(candidate.title, "seedPacket.title", 180);
  if (!Array.isArray(candidate.sourceRefs) || candidate.sourceRefs.length !== 1) {
    throw new TypeError("Eligible manager seed packet must have exactly one authoritative sourceRef.");
  }
  if (!Array.isArray(candidate.acceptanceCriteria) || candidate.acceptanceCriteria.length === 0 || candidate.acceptanceCriteria.length > 8) {
    throw new TypeError("Eligible manager seed packet must retain bounded acceptance-criteria metadata.");
  }
  if (!Array.isArray(candidate.verificationTargets) || candidate.verificationTargets.length === 0 || candidate.verificationTargets.length > 8) {
    throw new TypeError("Eligible manager seed packet must retain bounded verification-target metadata.");
  }
  if (candidate.rawPayloadRetained !== false) {
    throw new TypeError("Eligible manager seed packet must prohibit raw payload retention.");
  }
  if (candidate.authorityClass !== "allowed_unattended") {
    throw new TypeError("Eligible manager seed packet must retain allowed_unattended authority.");
  }
  if (!["low", "medium"].includes(candidate.riskClass)) {
    throw new TypeError("Eligible manager seed packet must retain a bounded low or medium risk class.");
  }
  const sourceProvenance = managerBmadSourceProvenance(candidate);
  const sourceRef = authoritativeSourceRef(candidate.sourceRefs[0], sourceProvenance ? title : null);
  const packetId = deriveAuthoritativePacketId(candidateId);
  const identityDigest = digest(JSON.stringify({
    candidateId,
    sourceRef,
    sourceProvenance,
    dedupeKey: requiredSafeMetadata(candidate.dedupeKey, "seedPacket.dedupeKey", 180),
    title,
  }), 40);
  const provenanceEvidence = sourceProvenance
    ? [
        `manager-bmad-story:${sourceProvenance.storyKey}`,
        `manager-bmad-source-key:${sourceProvenance.sourceKey}`,
        `manager-bmad-bundle:${sourceProvenance.bundleRef}`,
        `manager-bmad-sprint-status:${sourceProvenance.sprintStatusRef}`,
        `manager-bmad-prd-status:${sourceProvenance.prd.status}`,
        `manager-bmad-architecture:${sourceProvenance.architecture.ref}`,
        `manager-bmad-architecture-status:${sourceProvenance.architecture.status}`,
        `manager-bmad-epics:${sourceProvenance.epics.ref}`,
        `manager-bmad-epics-status:${sourceProvenance.epics.status}`,
        `manager-bmad-readiness:${sourceProvenance.implementationReadiness.ref}`,
        `manager-bmad-readiness-status:${sourceProvenance.implementationReadiness.status}`,
        ...Object.entries({
          prd: sourceProvenance.prd,
          architecture: sourceProvenance.architecture,
          epics: sourceProvenance.epics,
          readiness: sourceProvenance.implementationReadiness,
          sprint: sourceProvenance.sprint,
          story: sourceProvenance.story,
        }).map(([kind, member]) => `manager-bmad-${kind}-metadata-${member.metadataDigest}`),
      ]
    : [];
  return {
    packetId,
    title,
    initialStage: "capture",
    status: "waiting",
    truthLabel: "source_owned",
    sourceRef,
    actor: {
      actorType: "manager",
      actorId: "manager-source-intake",
      actorLabel: "Manager source intake adapter",
    },
    idempotencyKey: `manager-source-intake:${identityDigest}`,
    correlationId: `manager-source:${identityDigest.slice(0, 24)}`,
    payloadSummary: `Eligible manager source candidate ${candidateId} accepted as metadata-only intake.`,
    evidenceRefs: [
      `manager-candidate:${candidateId}`,
      "manager-eligibility:eligible",
      ...provenanceEvidence,
      `manager-source-metadata:sha256:${identityDigest}`,
    ],
  };
}

export function planManagerSourcePacketIntake(packet, supervisorUrl) {
  validateBoundedMetadataOnlyValue(packet, "managerPacket");
  const endpoint = resolveLoopbackSourceIntakeEndpoint(supervisorUrl);
  const request = buildManagerSourceIntakeRequest(packet);
  const targetComponents = [
    `candidate:${requiredSafeMetadata(packet.summary.seedPacket.candidateWorkPacketId, "seedPacket.candidateWorkPacketId", 120)}`,
    `packet:${request.packetId}`,
    `source:${request.sourceRef.refId}`,
    `supervisor:${endpoint}`,
  ].sort();
  return {
    endpoint,
    request,
    continuousSelection: {
      code: "continuous-source-intake",
      mutationClass: "source_backed_supervisor_intake",
      target: targetComponents.join("|"),
      targetComponents,
      allowed: true,
      status: "ready",
    },
  };
}

export async function intakeManagerSourcePacket(packet, supervisorUrl, context = {}) {
  let sourcePacket;
  try {
    validateBoundedMetadataOnlyValue(packet, "managerPacket");
    sourcePacket = structuredClone(packet);
  } catch (error) {
    throw intakeError("manager_supervisor_source_intake_input_invalid", error, null);
  }
  let endpoint;
  let request;
  try {
    ({ endpoint, request } = planManagerSourcePacketIntake(sourcePacket, supervisorUrl));
  } catch (error) {
    const code = /supervisorUrl/.test(String(error?.message || ""))
      ? "manager_supervisor_source_intake_non_loopback_url"
      : "manager_supervisor_source_intake_input_invalid";
    throw intakeError(code, error, sourcePacket);
  }

  const fetchImpl = context.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new ManagerSupervisorSourceIntakeError(
      "manager_supervisor_source_intake_network_unavailable",
      "Supervisor source intake requires an available fetch implementation.",
      sourcePacket,
    );
  }

  let response;
  let timeoutMs;
  try {
    timeoutMs = normalizeTimeoutMs(context.timeoutMs);
  } catch (error) {
    throw intakeError("manager_supervisor_source_intake_input_invalid", error, sourcePacket);
  }
  try {
    response = await fetchImpl(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", "accept": "application/json" },
      body: JSON.stringify(request),
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new ManagerSupervisorSourceIntakeError(
      "manager_supervisor_source_intake_network_error",
      "Supervisor source intake could not reach the loopback supervisor.",
      sourcePacket,
      { cause: error },
    );
  }

  if (!response || typeof response.ok !== "boolean" || !Number.isInteger(response.status)) {
    throw new ManagerSupervisorSourceIntakeError(
      "manager_supervisor_source_intake_response_malformed",
      "Supervisor source intake returned a malformed HTTP response.",
      sourcePacket,
    );
  }
  if (!response.ok || response.status < 200 || response.status >= 300) {
    throw new ManagerSupervisorSourceIntakeError(
      "manager_supervisor_source_intake_http_error",
      `Supervisor source intake failed with HTTP ${response.status}.`,
      sourcePacket,
    );
  }

  let lifecycle;
  try {
    lifecycle = (await response.json())?.data;
  } catch (error) {
    throw new ManagerSupervisorSourceIntakeError(
      "manager_supervisor_source_intake_response_malformed",
      "Supervisor source intake returned non-JSON success data.",
      sourcePacket,
      { cause: error },
    );
  }
  try {
    validateBoundedMetadataOnlyValue(lifecycle, "supervisorLifecycle", 64 * 1024);
    validateLifecycleIdentity(lifecycle, request);
  } catch (error) {
    const code = error?.identityConflict === true
      ? "manager_supervisor_source_intake_identity_conflict"
      : "manager_supervisor_source_intake_response_malformed";
    throw new ManagerSupervisorSourceIntakeError(code, error.message, sourcePacket, { cause: error });
  }

  const integrated = structuredClone(sourcePacket);
  integrated.summary.seedPacket = {
    ...structuredClone(integrated.summary.seedPacket),
    supervisorIntake: {
      status: "persisted",
      packetId: lifecycle.packetId,
      currentStage: lifecycle.currentStage,
      lifecycleStatus: lifecycle.status,
      currentEventId: lifecycle.currentEventId,
      persistedAt: new Date(lifecycle.updatedAt).toISOString(),
      evidenceRef: `supervisor-work-packet:${lifecycle.packetId}`,
      metadataOnly: true,
      rawPayloadRetained: false,
    },
  };
  integrated.summary.supervisorPersistence = "persisted; supervisor authoritative WorkPacket lifecycle recorded";
  return integrated;
}

function eligibleSeedCandidate(packet) {
  if (!packet || typeof packet !== "object" || Array.isArray(packet)) {
    throw new TypeError("Manager source intake requires a source-backed manager packet object.");
  }
  const summary = packet.summary;
  const candidate = summary?.seedPacket;
  if (!summary || typeof summary !== "object" || !candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new TypeError("Manager source intake requires summary.seedPacket metadata.");
  }
  if (summary.packetState !== "eligible" || candidate.eligibilityDecision !== "eligible") {
    throw new TypeError("Manager source intake accepts only an explicitly eligible source-backed seed packet.");
  }
  if (summary.rawPayloadRetained !== false || candidate.rawPayloadRetained !== false) {
    throw new TypeError("Manager source intake requires metadata-only source and candidate state.");
  }
  if (summary.mutationMode !== "none; read-only source-backed packet seed") {
    throw new TypeError("Manager source intake requires the read-only source-backed seed mutation mode.");
  }
  const eligibility = summary.sourceWorkEligibility;
  if (
    !eligibility ||
    eligibility.rawPayloadRetained !== false ||
    eligibility.eligibleCount !== 1 ||
    eligibility.needsReviewCount !== 0 ||
    eligibility.blockedCount !== 0 ||
    !Array.isArray(eligibility.candidateWorkPackets) ||
    eligibility.candidateWorkPackets.length !== 1 ||
    !isDeepStrictEqual(eligibility.candidateWorkPackets[0], candidate) ||
    !isDeepStrictEqual(eligibility.sourceArtifactDiscovery, summary.sourceArtifactDiscovery)
  ) {
    throw new TypeError("Manager source intake requires one exact authoritative eligibility projection.");
  }
  const discovery = summary.sourceArtifactDiscovery;
  if (
    !discovery ||
    discovery.rawPayloadRetained !== false ||
    discovery.artifactCount !== 1 ||
    discovery.rejectedCount !== 0 ||
    !Array.isArray(discovery.artifacts) ||
    discovery.artifacts.length !== 1 ||
    discovery.artifacts[0]?.ref !== candidate.sourceRefs?.[0]
  ) {
    throw new TypeError("Manager source intake requires one exact source-artifact discovery projection.");
  }
  return candidate;
}

function authoritativeSourceRef(value, title = null) {
  const source = requiredSafeMetadata(value, "seedPacket.sourceRefs[0]", 255);
  const separator = source.indexOf(":");
  if (separator <= 0 || separator === source.length - 1) {
    throw new TypeError("Manager sourceRef must use an explicit supported source prefix.");
  }
  const prefix = source.slice(0, separator).toLowerCase();
  const pathOrIdentity = requiredSafeMetadata(source.slice(separator + 1), "sourceRef identity", 500);
  const sourceType = {
    prd: "prd",
    story: "bmad_story",
    doc: "repo_doc",
    runway: "workflow",
    workflow: "workflow",
    operator: "operator_input",
  }[prefix];
  if (!sourceType) throw new TypeError(`Unsupported manager sourceRef prefix: ${prefix}`);
  const pathBacked = new Set(["prd", "story", "doc"]);
  if (pathBacked.has(prefix)) validateRelativeMetadataPath(pathOrIdentity);
  return {
    refId: source,
    sourceType,
    pathOrUrl: pathBacked.has(prefix) ? pathOrIdentity : null,
    title: title ? requiredSafeMetadata(title, "sourceRef.title", 180) : null,
  };
}

function managerBmadSourceProvenance(candidate = {}) {
  const value = candidate.sourceProvenance;
  if (value === undefined || value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Eligible manager seed sourceProvenance must be an object.");
  }
  const provenance = {
    mode: requiredSafeMetadata(value.mode, "sourceProvenance.mode", 80),
    bundleSelection: requiredSafeMetadata(value.bundleSelection, "sourceProvenance.bundleSelection", 80),
    storyRef: requiredSafeMetadata(value.storyRef, "sourceProvenance.storyRef", 255),
    storyKey: requiredSafeMetadata(value.storyKey, "sourceProvenance.storyKey", 120),
    storyStatus: requiredSafeMetadata(value.storyStatus, "sourceProvenance.storyStatus", 40),
    sprintStatusRef: requiredSafeMetadata(value.sprintStatusRef, "sourceProvenance.sprintStatusRef", 220),
    sourceKey: requiredSafeMetadata(value.sourceKey, "sourceProvenance.sourceKey", 160),
    bundleRef: requiredSafeMetadata(value.bundleRef, "sourceProvenance.bundleRef", 220),
    prd: bmadHierarchyMember(value.prd, "prd", "final"),
    architecture: bmadHierarchyMember(value.architecture, "architecture", "complete"),
    epics: bmadHierarchyMember(value.epics, "epics", "complete"),
    implementationReadiness: bmadHierarchyMember(value.implementationReadiness, "implementationReadiness", "complete"),
    sprint: bmadHierarchyMember(value.sprint, "sprint", null, { sourceKey: value.sourceKey }),
    story: bmadHierarchyMember(value.story, "story", "ready-for-dev", { key: value.storyKey }),
  };
  if (
    provenance.mode !== "default_local_bmad" ||
    !["explicit_source_bundle", "canonical_sprint_source_key"].includes(provenance.bundleSelection) ||
    provenance.storyStatus !== "ready-for-dev" ||
    value.metadataOnly !== true ||
    value.rawPayloadRetained !== false ||
    !/^\d+-\d+-[a-z0-9-]+$/i.test(provenance.storyKey) ||
    provenance.storyRef !== candidate.sourceRefs?.[0] ||
    provenance.storyRef !== `story:_bmad-output/implementation-artifacts/${provenance.storyKey}.md` ||
    provenance.sprintStatusRef !== "_bmad-output/implementation-artifacts/sprint-status.yaml" ||
    provenance.prd.ref !== provenance.bundleRef.slice("prd:".length) ||
    provenance.sprint.ref !== provenance.sprintStatusRef ||
    provenance.sprint.sourceKey !== provenance.sourceKey ||
    provenance.story.ref !== provenance.storyRef.slice("story:".length) ||
    provenance.story.key !== provenance.storyKey
  ) {
    throw new TypeError("Eligible manager seed sourceProvenance is not the exact ready local BMAD story binding.");
  }
  const bundle = authoritativeSourceRef(provenance.bundleRef);
  if (bundle.sourceType !== "prd") {
    throw new TypeError("Eligible manager seed sourceProvenance requires one PRD bundle ref.");
  }
  validateRelativeMetadataPath(provenance.sprintStatusRef);
  return provenance;
}

function bmadHierarchyMember(value, field, expectedStatus = null, identity = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`sourceProvenance.${field} must be metadata.`);
  const member = {
    ref: requiredSafeMetadata(value.ref, `sourceProvenance.${field}.ref`, 220),
    ...(expectedStatus === null ? {} : { status: requiredSafeMetadata(value.status, `sourceProvenance.${field}.status`, 40) }),
    ...Object.fromEntries(Object.keys(identity).map((key) => [key, requiredSafeMetadata(value[key], `sourceProvenance.${field}.${key}`, 160)])),
    metadataDigest: requiredSafeMetadata(value.metadataDigest, `sourceProvenance.${field}.metadataDigest`, 80),
  };
  validateRelativeMetadataPath(member.ref);
  if (expectedStatus !== null && member.status !== expectedStatus) throw new TypeError(`sourceProvenance.${field} is not ${expectedStatus}.`);
  for (const [key, expected] of Object.entries(identity)) {
    if (member[key] !== expected) throw new TypeError(`sourceProvenance.${field}.${key} does not match the hierarchy.`);
  }
  if (!/^sha256:[0-9a-f]{64}$/.test(member.metadataDigest)) throw new TypeError(`sourceProvenance.${field}.metadataDigest is invalid.`);
  return member;
}

function validateLifecycleIdentity(lifecycle, request) {
  if (!lifecycle || typeof lifecycle !== "object" || Array.isArray(lifecycle)) {
    throw new TypeError("Supervisor source intake success data is missing lifecycle metadata.");
  }
  if (lifecycle.metadataOnly !== true || !validTimestamp(lifecycle.createdAt) || !validTimestamp(lifecycle.updatedAt)) {
    throw new TypeError("Supervisor source intake lifecycle is not bounded metadata-only persisted state.");
  }
  if (!requiredString(lifecycle.currentEventId, "lifecycle.currentEventId", 80) || !STAGES.has(lifecycle.currentStage) || !STATUSES.has(lifecycle.status)) {
    throw new TypeError("Supervisor source intake lifecycle has invalid current-state metadata.");
  }
  if (!Array.isArray(lifecycle.history) || lifecycle.history.length === 0 || lifecycle.history.length > 64) {
    throw new TypeError("Supervisor source intake lifecycle history is missing or unbounded.");
  }
  const eventIds = lifecycle.history.map((event) => event?.eventId);
  if (eventIds.some((eventId) => typeof eventId !== "string") || new Set(eventIds).size !== eventIds.length) {
    throw new TypeError("Supervisor source intake lifecycle event identities are missing or duplicated.");
  }
  const currentEvent = lifecycle.history.find((event) => event?.eventId === lifecycle.currentEventId);
  if (!currentEvent) {
    throw new TypeError("Supervisor source intake current event is absent from lifecycle history.");
  }
  if (
    lifecycle.history.some((event) => event?.metadataOnly !== true || !validTimestamp(event?.occurredAt)) ||
    currentEvent.targetStage !== lifecycle.currentStage ||
    currentEvent.status !== lifecycle.status ||
    currentEvent.truthLabel !== lifecycle.truthLabel ||
    !isDeepStrictEqual(currentEvent.sourceRef, lifecycle.sourceRef)
  ) {
    throw identityConflict("Supervisor source intake current lifecycle identity conflicts with its event history.");
  }
  const topIdentity = {
    packetId: lifecycle.packetId,
    title: lifecycle.title,
    truthLabel: lifecycle.truthLabel,
    sourceRef: lifecycle.sourceRef,
  };
  const expectedTopIdentity = {
    packetId: request.packetId,
    title: request.title,
    truthLabel: request.truthLabel,
    sourceRef: request.sourceRef,
  };
  if (!isDeepStrictEqual(topIdentity, expectedTopIdentity)) throw identityConflict("Supervisor source intake returned conflicting WorkPacket identity.");

  const creation = lifecycle.history.find((event) => event?.eventType === "packet.created" && event?.idempotencyKey === request.idempotencyKey);
  if (!creation || creation.metadataOnly !== true || !validTimestamp(creation.occurredAt)) {
    throw new TypeError("Supervisor source intake lifecycle is missing the exact persisted creation event.");
  }
  const creationIdentity = {
    packetId: creation.packetId,
    eventType: creation.eventType,
    previousStage: creation.previousStage,
    targetStage: creation.targetStage,
    status: creation.status,
    truthLabel: creation.truthLabel,
    sourceRef: creation.sourceRef,
    actor: creation.actor,
    correlationId: creation.correlationId,
    idempotencyKey: creation.idempotencyKey,
    payloadSummary: creation.payloadSummary,
    evidenceRefs: creation.evidenceRefs,
    metadataOnly: creation.metadataOnly,
  };
  const expectedCreationIdentity = {
    packetId: request.packetId,
    eventType: "packet.created",
    previousStage: null,
    targetStage: request.initialStage,
    status: request.status,
    truthLabel: request.truthLabel,
    sourceRef: request.sourceRef,
    actor: request.actor,
    correlationId: request.correlationId,
    idempotencyKey: request.idempotencyKey,
    payloadSummary: request.payloadSummary,
    evidenceRefs: request.evidenceRefs,
    metadataOnly: true,
  };
  if (!isDeepStrictEqual(creationIdentity, expectedCreationIdentity)) throw identityConflict("Supervisor source intake returned conflicting creation-event identity.");
}

function failClosedPacket(packet, code, message) {
  let failed = { status: "blocked", summary: {} };
  try {
    if (!packet || typeof packet !== "object" || Array.isArray(packet)) throw new TypeError("Failure packet is unavailable.");
    validateBoundedMetadataOnlyValue(packet, "failurePacket");
    failed = structuredClone(packet);
  } catch {
    // Unsafe or uncloneable inputs must not be reflected into failure evidence.
  }
  failed.ok = false;
  failed.status = "blocked";
  failed.blockers = Array.isArray(failed.blockers) ? failed.blockers : [];
  failed.blockers.push({
    code,
    message,
    nextAction: "Do not claim supervisor intake; repair the typed failure and retry the explicit loopback command.",
  });
  return failed;
}

function validateRelativeMetadataPath(value) {
  const path = requiredSafeMetadata(value, "sourceRef.pathOrUrl", 500).replace(/\\/g, "/");
  if (path.startsWith("/") || /^[a-z][a-z0-9+.-]*:/i.test(path) || path.split("/").includes("..")) {
    throw new TypeError("Manager sourceRef path must be a bounded repository-relative metadata path.");
  }
}

function requiredSafeMetadata(value, field, maxLength) {
  const text = requiredString(value, field, maxLength);
  if (FORBIDDEN_METADATA.test(text) || /[\u0000-\u001f\u007f]/.test(text)) throw new TypeError(`${field} contains forbidden non-metadata content.`);
  return text;
}

function validateBoundedMetadataOnlyValue(value, field, maxBytes = MAX_PACKET_BYTES) {
  let serialized;
  try {
    serialized = JSON.stringify(value);
  } catch (error) {
    throw new TypeError(`${field} must be JSON-serializable bounded metadata.`, { cause: error });
  }
  if (typeof serialized !== "string" || Buffer.byteLength(serialized, "utf8") > maxBytes) {
    throw new TypeError(`${field} exceeds the bounded metadata size limit.`);
  }
  const walk = (current, path, depth) => {
    if (depth > 16) throw new TypeError(`${path} exceeds the bounded metadata depth limit.`);
    if (Array.isArray(current)) {
      if (current.length > 128) throw new TypeError(`${path} exceeds the bounded metadata array limit.`);
      current.forEach((item, index) => walk(item, `${path}[${index}]`, depth + 1));
      return;
    }
    if (!current || typeof current !== "object") {
      if (typeof current === "string" && current.length > 4096) throw new TypeError(`${path} contains unbounded text.`);
      return;
    }
    const entries = Object.entries(current);
    if (entries.length > 128) throw new TypeError(`${path} exceeds the bounded metadata field limit.`);
    for (const [key, nested] of entries) {
      if (key === "rawPayloadRetained") {
        if (nested !== false) throw new TypeError(`${path}.${key} must be false.`);
      } else if (FORBIDDEN_FIELD.test(key)) {
        throw new TypeError(`${path}.${key} is forbidden non-metadata input.`);
      }
      walk(nested, `${path}.${key}`, depth + 1);
    }
  };
  walk(value, field, 0);
}

function normalizeTimeoutMs(value) {
  if (value === undefined) return DEFAULT_TIMEOUT_MS;
  if (!Number.isInteger(value) || value < 1 || value > MAX_TIMEOUT_MS) {
    throw new TypeError(`timeoutMs must be an integer from 1 through ${MAX_TIMEOUT_MS}.`);
  }
  return value;
}

function requiredString(value, field, maxLength = Number.MAX_SAFE_INTEGER) {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) {
    throw new TypeError(`${field} must be a non-empty bounded string.`);
  }
  return value.trim();
}

function validTimestamp(value) {
  return typeof value === "string" && value.length <= 64 && Number.isFinite(Date.parse(value));
}

function digest(value, length) {
  return createHash("sha256").update(value).digest("hex").slice(0, length);
}

function identityConflict(message) {
  const error = new TypeError(message);
  error.identityConflict = true;
  return error;
}

function intakeError(code, error, packet) {
  return new ManagerSupervisorSourceIntakeError(code, error instanceof Error ? error.message : String(error), packet, { cause: error });
}
