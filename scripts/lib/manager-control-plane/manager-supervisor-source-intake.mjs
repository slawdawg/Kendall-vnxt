import { createHash } from "node:crypto";
import { request as httpRequest } from "node:http";
import { isDeepStrictEqual } from "node:util";

import { projectCanonicalSupervisorPacket } from "./operational-readiness.mjs";
import { parseLoopbackSupervisorUrl } from "./loopback-supervisor.mjs";
import { normalizeSupervisorTimeoutMs } from "./supervisor-timeout.mjs";

const SOURCE_INTAKE_PATH = "/pipeline-control-plane/work-packets";
const PRIVATE_SOURCE_INTAKE_PATH = "/internal/manager-source-intake/work-packets";
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
  const parsed = parseLoopbackSupervisorUrl(supervisorUrl);
  return new URL(SOURCE_INTAKE_PATH, parsed).href;
}

export function buildManagerSourceIntakeRequest(packet, options = {}) {
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
  const parallelWorkGraphEvidence = options.allowPrivateGraph === true ? managerParallelWorkGraphEvidence(packet, packetId) : null;
  const identityDigest = digest(JSON.stringify({
    candidateId,
    sourceRef,
    sourceProvenance,
    dedupeKey: requiredSafeMetadata(candidate.dedupeKey, "seedPacket.dedupeKey", 180),
    title,
    parallelWorkGraphEvidence,
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
    ...(parallelWorkGraphEvidence ? { parallelWorkGraphEvidence } : {}),
  };
}

export function planManagerSourcePacketIntake(packet, supervisorUrl, context = {}) {
  validateBoundedMetadataOnlyValue(packet, "managerPacket");
  const privateUdsPath = resolvePrivateUdsPath(context.supervisorUdsPath);
  const endpoint = privateUdsPath ? `private-uds:${privateUdsPath}${PRIVATE_SOURCE_INTAKE_PATH}` : resolveLoopbackSourceIntakeEndpoint(supervisorUrl);
  const request = buildManagerSourceIntakeRequest(packet, { allowPrivateGraph: Boolean(privateUdsPath) });
  const targetComponents = [
    `candidate:${requiredSafeMetadata(packet.summary.seedPacket.candidateWorkPacketId, "seedPacket.candidateWorkPacketId", 120)}`,
    `packet:${request.packetId}`,
    `source:${request.sourceRef.refId}`,
    `supervisor:${endpoint}`,
  ].sort();
  return {
    endpoint,
    request,
    privateUdsPath,
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
  let privateUdsPath;
  try {
    ({ endpoint, request, privateUdsPath } = planManagerSourcePacketIntake(sourcePacket, supervisorUrl, context));
  } catch (error) {
    const code = /supervisorUrl/.test(String(error?.message || ""))
      ? "manager_supervisor_source_intake_non_loopback_url"
      : "manager_supervisor_source_intake_input_invalid";
    throw intakeError(code, error, sourcePacket);
  }

  const fetchImpl = context.fetchImpl ?? globalThis.fetch;
  if (!privateUdsPath && typeof fetchImpl !== "function") {
    throw new ManagerSupervisorSourceIntakeError(
      "manager_supervisor_source_intake_network_unavailable",
      "Supervisor source intake requires an available fetch implementation.",
      sourcePacket,
    );
  }

  let response;
  let timeoutMs;
  try {
    timeoutMs = normalizeSupervisorTimeoutMs(context.timeoutMs);
  } catch (error) {
    throw intakeError("manager_supervisor_source_intake_input_invalid", error, sourcePacket);
  }
  try {
    response = privateUdsPath
      ? await postPrivateUds(privateUdsPath, PRIVATE_SOURCE_INTAKE_PATH, request, timeoutMs)
      : await fetchImpl(endpoint, {
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

  const canonicalSupervisor = projectCanonicalSupervisorPacket(lifecycle, { now: context.now });
  if (canonicalSupervisor.present && !canonicalSupervisor.valid) {
    const stale = canonicalSupervisor.blockers.some((blocker) => blocker.code === "evidence_stale");
    throw new ManagerSupervisorSourceIntakeError(
      stale ? "manager_supervisor_canonical_fields_stale" : "manager_supervisor_canonical_fields_invalid",
      canonicalSupervisor.blockers[0]?.message || "Supervisor source intake returned unusable canonical packet truth.",
      sourcePacket,
    );
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
      truthSource: canonicalSupervisor.present ? "supervisor_canonical" : "legacy_lifecycle_fallback",
      canonicalSource: canonicalSupervisor.source,
      readinessComponents: canonicalSupervisor.readinessComponents,
      productModeMapping: canonicalSupervisor.productModeMapping,
      retentionEvidence: canonicalSupervisor.retentionEvidence,
      qualityEvidence: canonicalSupervisor.qualityEvidence,
      deliveryEvidence: canonicalSupervisor.deliveryEvidence,
      typedCapabilityTruth: canonicalSupervisor.typedCapabilityTruth,
      metadataOnly: true,
      rawPayloadRetained: false,
    },
  };
  integrated.summary.supervisorPersistence = "persisted; supervisor authoritative WorkPacket lifecycle recorded";
  return integrated;
}

function resolvePrivateUdsPath(value = process.env.KENDALL_SUPERVISOR_UDS_PATH) {
  if (value === undefined || value === null || value === "") return null;
  const path = requiredString(value, "supervisorUdsPath", 512);
  if (!path.startsWith("/") || path.includes("\0") || path.split("/").includes("..")) throw new TypeError("supervisorUdsPath must be an absolute private UDS path.");
  return path;
}

function postPrivateUds(socketPath, path, body, timeoutMs) {
  return new Promise((resolve, reject) => {
    const request = httpRequest({ socketPath, path, method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, timeout: timeoutMs }, (response) => {
      const chunks = [];
      let receivedBytes = 0;
      response.on("data", (chunk) => {
        receivedBytes += chunk.length;
        if (receivedBytes > MAX_PACKET_BYTES) {
          response.destroy(new Error("private supervisor UDS source intake response exceeds the metadata limit"));
          return;
        }
        chunks.push(chunk);
      });
      response.once("error", reject);
      response.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve({ ok: (response.statusCode ?? 500) >= 200 && (response.statusCode ?? 500) < 300, status: response.statusCode ?? 500, json: async () => JSON.parse(text) });
      });
    });
    request.once("error", reject);
    request.once("timeout", () => request.destroy(new Error("private supervisor UDS source intake timed out")));
    request.end(JSON.stringify(body));
  });
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

function managerParallelWorkGraphEvidence(packet, packetId) {
  const evidence = packet?.summary?.parallelWorkGraphEvidence;
  if (evidence === undefined || evidence === null) return null;
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    throw new TypeError("Manager parallel work graph evidence must be a typed metadata object.");
  }
  const required = new Set([
    "schemaVersion", "sourceSchemaVersion", "availability", "packetId", "executionJobId", "reportIdentity", "generatedAt", "freshnessState",
    "waveMembership", "dependencyState", "reservation", "capacity", "reason", "nextSafeAction", "evidenceRefs",
    "metadataOnly", "rawPayloadRetained", "retention",
  ]);
  if (Object.keys(evidence).length !== required.size || Object.keys(evidence).some((key) => !required.has(key))) {
    throw new TypeError("Manager parallel work graph evidence must use the exact typed contract.");
  }
  if (
    evidence.schemaVersion !== "parallel-work-graph-evidence/v0" ||
    evidence.sourceSchemaVersion !== "parallel-execution-graph-reservation/v1" ||
    evidence.packetId !== packetId ||
    !((evidence.availability === "available" && evidence.freshnessState === "live") || (evidence.availability === "stale" && evidence.freshnessState === "stale")) ||
    !["selected", "deferred", "blocked"].includes(evidence.waveMembership) ||
    !["clear", "declared", "blocked"].includes(evidence.dependencyState) ||
    evidence.metadataOnly !== true || evidence.rawPayloadRetained !== false || evidence.retention !== "metadata_only_evidence_references"
  ) {
    throw new TypeError("Manager parallel work graph evidence is not a valid metadata-only advisory projection.");
  }
  if (!validTimestamp(evidence.generatedAt) || !safeGraphIdentifier(evidence.executionJobId) || !/^sha256:[0-9a-f]{64}$/.test(evidence.reportIdentity) || !safeGraphText(evidence.reason) || !safeGraphText(evidence.nextSafeAction)) {
    throw new TypeError("Manager parallel work graph evidence has unsafe identity or text.");
  }
  if (!Array.isArray(evidence.evidenceRefs) || evidence.evidenceRefs.length > 20 || !evidence.evidenceRefs.every(safeGraphIdentifier)) {
    throw new TypeError("Manager parallel work graph evidence refs must be bounded metadata identifiers.");
  }
  if (!evidence.reservation || typeof evidence.reservation !== "object" || Array.isArray(evidence.reservation) ||
      !evidence.capacity || typeof evidence.capacity !== "object" || Array.isArray(evidence.capacity) ||
      Object.keys(evidence.reservation).length !== 3 || Object.keys(evidence.capacity).length !== 2 ||
      !["advisory_reserved", "deferred", "blocked", "not_recommended"].includes(evidence.reservation.status) ||
      !(evidence.reservation.owner === null || safeGraphText(evidence.reservation.owner, 160)) ||
      !safeGraphCode(evidence.reservation.reasonCode) ||
      !["normal", "degraded", "blocked"].includes(evidence.capacity.posture) || !safeGraphCode(evidence.capacity.reasonCode)) {
    throw new TypeError("Manager parallel work graph reservation or capacity metadata is invalid.");
  }
  return structuredClone(evidence);
}

function safeGraphIdentifier(value) {
  return typeof value === "string" && value.trim() === value && value.length > 0 && value.length <= 255 && !/[\s/\x00-\x1f\x7f]/.test(value) && !FORBIDDEN_METADATA.test(value);
}

function safeGraphCode(value) {
  return typeof value === "string" && /^[a-z][a-z0-9_:-]{1,120}$/.test(value);
}

function safeGraphText(value, maxLength = 500) {
  return typeof value === "string" && value.trim() === value && value.length > 0 && value.length <= maxLength &&
    !FORBIDDEN_METADATA.test(value) && !/[\u0000-\u001f\u007f]/.test(value) && !/(?:^|[\s"'])\/(?:home|tmp|var|etc)\//i.test(value);
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

  const persisted = lifecycle.history.find((event) =>
    ["packet.created", "packet.parallel_work_graph_refreshed"].includes(event?.eventType) && event?.idempotencyKey === request.idempotencyKey,
  );
  if (!persisted || persisted.metadataOnly !== true || !validTimestamp(persisted.occurredAt)) {
    throw new TypeError("Supervisor source intake lifecycle is missing the exact persisted manager source event.");
  }
  const persistedIdentity = {
    packetId: persisted.packetId,
    eventType: persisted.eventType,
    targetStage: persisted.targetStage,
    status: persisted.status,
    truthLabel: persisted.truthLabel,
    sourceRef: persisted.sourceRef,
    actor: persisted.actor,
    correlationId: persisted.correlationId,
    idempotencyKey: persisted.idempotencyKey,
    payloadSummary: persisted.payloadSummary,
    evidenceRefs: persisted.evidenceRefs,
    metadataOnly: persisted.metadataOnly,
  };
  const expectedPersistedIdentity = {
    packetId: request.packetId,
    eventType: persisted.eventType,
    targetStage: persisted.eventType === "packet.parallel_work_graph_refreshed" ? lifecycle.currentStage : request.initialStage,
    status: persisted.eventType === "packet.parallel_work_graph_refreshed" ? lifecycle.status : request.status,
    truthLabel: request.truthLabel,
    sourceRef: request.sourceRef,
    actor: request.actor,
    correlationId: request.correlationId,
    idempotencyKey: request.idempotencyKey,
    payloadSummary: request.payloadSummary,
    evidenceRefs: request.evidenceRefs,
    metadataOnly: true,
  };
  if (!isDeepStrictEqual(persistedIdentity, expectedPersistedIdentity)) throw identityConflict("Supervisor source intake returned conflicting manager-source event identity.");
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
      } else if (key !== "rawPayloadRetentionAllowed" && FORBIDDEN_FIELD.test(key)) {
        throw new TypeError(`${path}.${key} is forbidden non-metadata input.`);
      }
      walk(nested, `${path}.${key}`, depth + 1);
    }
  };
  walk(value, field, 0);
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
