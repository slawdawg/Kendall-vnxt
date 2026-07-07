import { createHash } from "node:crypto";
import { resolve } from "node:path";

import { createMemoryDispatcherAdapter } from "./memory-dispatcher-adapter.mjs";

const BACKEND_PROOF_EVIDENCE = Object.freeze(["runtime-port:local-proof-adapter"]);
const SAFE_TOKEN_PATTERN = /^[A-Za-z0-9._:/#-]{1,160}$/;
const SAFE_POLICY_TOKEN_PATTERN = /^[A-Za-z0-9._:-]{1,80}$/;
const SAFE_POLICY_SCOPE_PATTERN = /^[A-Za-z0-9._:/ -]{1,120}$/;
const SAFE_BRANCH_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,119}$/;
const MANAGED_BRANCH_PREFIX = "codex/";
const MAX_METADATA_TEXT_LENGTH = 240;
const MAX_VERIFICATION_FIELD_LENGTH = 2_000;
const MAX_QUEUE_CANDIDATES = 32;
const SAFE_RISK_CLASSES = Object.freeze(["low", "medium", "high", "extreme"]);
const SAFE_CANDIDATE_STATUSES = Object.freeze(["eligible", "needs_review", "blocked"]);
const SAFE_SOURCE_TYPES = Object.freeze(["prd", "bmad_artifact", "research", "repo_source", "runtime_state", "manual"]);
const SAFE_AUTHORITY_STAGES = Object.freeze(["backend_proof"]);
const SAFE_AUTHORITY_CLASSES = Object.freeze(["allowed_unattended", "requires_preauthorization", "block_and_record", "forbidden"]);
const CANDIDATE_INPUT_KEYS = new Set([
  "candidateWorkPacketId",
  "runId",
  "sourceRefs",
  "proposedSlice",
  "acceptanceCriteria",
  "verificationTargets",
  "riskClass",
  "dependencyHints",
  "dedupeKey",
  "authorityClass",
  "authorityStage",
  "status",
  "policyId",
  "evidenceRefs",
  "createdAt",
  "updatedAt"
]);
const SOURCE_REF_INPUT_KEYS = new Set(["sourceRefId", "sourceType", "label", "pathOrUrl", "sourceSpan", "summaryOnly"]);
const VERIFICATION_TARGET_INPUT_KEYS = new Set(["verificationTargetId", "commandId", "command", "expectedResult"]);
const RAW_PAYLOAD_PATTERN = /\b(rawProviderPayload|providerPayload|providerMetadata|providerResponse|provider_response|rawPayload|raw_payload|raw[-_\s]?payload|raw[-_\s]?prompt|raw[-_\s]?completion|provider_payload|provider_metadata|provider[-_\s]?payload|retainedPayload|retained_payload|raw payload|provider payload|provider response|payload|transcript|secret|token|credential|scrollback|api_key|api-key|apikey|client_secret|clientSecret|private_key|privateKey|sshPrivateKey|access_key|accessKey|secret_key|secretKey|secretAccessKey|awsSecretAccessKey|password)\b|\b[A-Z0-9_]*(?:API_KEY|ACCESS_TOKEN|REFRESH_TOKEN|ID_TOKEN|TOKEN|SECRET)\b\s*=?|\bprovider\s*[:=]|\bresponse_id\s*[:=]|"provider"\s*:|"response_id"\s*:|\bauthorization\s*:\s*bearer\b|\bbearer\s+[A-Za-z0-9._~+/-]+=*\b|\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b|\bsk-[A-Za-z0-9_-]{8,}|\b(?:git(?:hub)_pat|gh[opusr])_[A-Za-z0-9_]{8,}|\bAKIA[0-9A-Z]{12,}\b|-----BEGIN [A-Z ]*PRIVATE KEY-----/i;
const UNSAFE_EVIDENCE_REF_PATTERN = /(payload|secret|token|credential|transcript|api[_-]?key|access[_-]?key|private[_-]?key|bearer|password|rawpayload|raw_payload|raw-payload|providerpayload|provider_payload|provider-payload)/i;
const UNSAFE_METADATA_TEXT_PATTERN = /raw|provider|payload|secret|token|credential|transcript|api[_-]?key|access[_-]?key|private[_-]?key|bearer|password/i;
const KNOWN_AUTHORITY_FAMILIES = Object.freeze([
  "contract_definition",
  "safe_work_eligibility",
  "dispatcher_lifecycle",
  "summary_projection",
  "runtime_state",
  "live_worker_execution",
  "delivery_stewardship",
  "cleanup_stewardship",
  "provider_access",
  "secret_access",
  "destructive_operation",
  "external_service_installation"
]);
const ALLOWED_POLICY_RULES = Object.freeze([
  Object.freeze({ authorityFamily: "contract_definition", operation: "define-runtime-port", scope: "workflow-core runtime ports" }),
  Object.freeze({ authorityFamily: "dispatcher_lifecycle", operation: "claim", scope: "backend-proof queue" }),
  Object.freeze({ authorityFamily: "runtime_state", operation: "prepare-local-proof-session", scope: "approved workspace metadata" }),
  Object.freeze({ authorityFamily: "safe_work_eligibility", operation: "evaluate-candidate", scope: "fixture-backed candidate" }),
  Object.freeze({ authorityFamily: "summary_projection", operation: "emit-summary", scope: "bounded manager summary" })
]);

export function createLocalProofRuntimeAdapters({
  lifecycle,
  clock,
  runId = "run-1",
  leaseTtlMs,
  maxAttempts,
  summaryStaleAfterMs,
  approvedWorkspaceRoots
}) {
  const queue = createLocalProofQueueRuntime({
    lifecycle,
    clock,
    runId,
    leaseTtlMs,
    maxAttempts,
    summaryStaleAfterMs
  });
  return Object.freeze({
    queue,
    verification: createLocalProofVerificationRuntime({ clock }),
    session: createLocalProofSessionRuntime({ clock, approvedWorkspaceRoots }),
    policy: createLocalProofPolicyRuntime({ clock })
  });
}

export function createLocalProofQueueRuntime({
  lifecycle,
  clock,
  runId = "run-1",
  leaseTtlMs,
  maxAttempts,
  summaryStaleAfterMs
}) {
  const normalizedRunId = normalizeWorkItemId(runId);
  if (!normalizedRunId) {
    throw new Error("local proof queue runtime requires a metadata-safe runId");
  }
  const adapter = createMemoryDispatcherAdapter({
    lifecycle,
    clock,
    runId: normalizedRunId,
    leaseTtlMs,
    maxAttempts,
    summaryStaleAfterMs
  });
  return Object.freeze({
    mode: "backend_proof",
    clock,
    descriptor: descriptor("queue", "local-proof-queue-runtime"),
    refill(input) {
      if (!isRecord(input)) return Promise.resolve(failResult("invalid_input", "Queue proof refill requires an input object.", []));
      const normalized = normalizeQueueEvidenceInput(input);
      if (!normalized.ok) return Promise.resolve(failResult("missing_evidence", "Queue proof requires valid bounded evidence refs.", []));
      if (!Array.isArray(input?.candidates)) {
        return Promise.resolve(failResult("invalid_input", "Queue proof refill requires an explicit candidates array.", normalized.evidenceRefs));
      }
      if (input.candidates.length > MAX_QUEUE_CANDIDATES) {
        return Promise.resolve(failResult("invalid_input", "Queue proof refill candidate batch exceeds local proof bounds.", normalized.evidenceRefs));
      }
      const candidates = normalizeQueueCandidates(input.candidates);
      if (!candidates) {
        return Promise.resolve(failResult("invalid_input", "Queue proof refill requires bounded candidate work packet metadata.", normalized.evidenceRefs));
      }
      const policyReason = normalizeMetadataText(input?.policyReason);
      if (!policyReason) {
        return Promise.resolve(failResult("invalid_input", "Queue proof refill requires bounded policy reason metadata.", normalized.evidenceRefs));
      }
      return adapter.refill({
        candidates,
        evidenceRefs: normalized.evidenceRefs,
        policyReason: digestMetadataText(policyReason, "policy-reason")
      }).then(freezeLifecycleResult);
    },
    claim(input) {
      if (!isRecord(input)) return Promise.resolve(failResult("invalid_input", "Queue proof claim requires an input object.", []));
      const normalized = normalizeQueueEvidenceInput(input);
      if (!normalized.ok) return Promise.resolve(failResult("missing_evidence", "Queue proof requires valid bounded evidence refs.", []));
      const workerId = normalizeWorkItemId(input?.workerId);
      if (!workerId) return Promise.resolve(failResult("invalid_input", "Queue proof claim requires bounded worker id metadata.", normalized.evidenceRefs));
      return adapter.claim({ workerId, evidenceRefs: normalized.evidenceRefs }).then(freezeLifecycleResult);
    },
    heartbeat(input) {
      if (!isRecord(input)) return Promise.resolve(failResult("invalid_input", "Queue proof heartbeat requires an input object.", []));
      const normalized = normalizeQueueEvidenceInput(input);
      if (!normalized.ok) return Promise.resolve(failResult("missing_evidence", "Queue proof requires valid bounded evidence refs.", []));
      const leaseInput = normalizeLeaseLifecycleInput(input, normalized.evidenceRefs, { requireTtl: true });
      if (!leaseInput) return Promise.resolve(failResult("invalid_input", "Queue proof heartbeat requires bounded lease metadata.", normalized.evidenceRefs));
      return adapter.heartbeat(leaseInput).then(freezeLifecycleResult);
    },
    complete(input) {
      if (!isRecord(input)) return Promise.resolve(failResult("invalid_input", "Queue proof complete requires an input object.", []));
      const normalized = normalizeQueueEvidenceInput(input);
      if (!normalized.ok) return Promise.resolve(failResult("missing_evidence", "Queue proof requires valid bounded evidence refs.", []));
      const leaseInput = normalizeLeaseLifecycleInput(input, normalized.evidenceRefs);
      const resultSummary = normalizeMetadataText(input?.resultSummary);
      if (!leaseInput || !resultSummary) return Promise.resolve(failResult("invalid_input", "Queue proof complete requires bounded closeout metadata.", normalized.evidenceRefs));
      return adapter.complete({
        ...leaseInput,
        resultSummary: digestMetadataText(resultSummary, "result-summary")
      }).then(freezeLifecycleResult);
    },
    fail(input) {
      if (!isRecord(input)) return Promise.resolve(failResult("invalid_input", "Queue proof fail requires an input object.", []));
      const normalized = normalizeQueueEvidenceInput(input);
      if (!normalized.ok) return Promise.resolve(failResult("missing_evidence", "Queue proof requires valid bounded evidence refs.", []));
      const leaseInput = normalizeLeaseLifecycleInput(input, normalized.evidenceRefs);
      const failureReason = normalizeMetadataText(input?.failureReason);
      if (!leaseInput || !failureReason) return Promise.resolve(failResult("invalid_input", "Queue proof fail requires bounded failure metadata.", normalized.evidenceRefs));
      return adapter.fail({
        ...leaseInput,
        failureReason: digestMetadataText(failureReason, "failure-reason")
      }).then(freezeLifecycleResult);
    },
    recoverExpiredLeases(input) {
      if (!isRecord(input)) return Promise.resolve(failResult("invalid_input", "Queue proof recoverExpiredLeases requires an input object.", []));
      const normalized = normalizeQueueEvidenceInput(input);
      if (!normalized.ok) return Promise.resolve(failResult("missing_evidence", "Queue proof requires valid bounded evidence refs.", []));
      return adapter.recoverExpiredLeases({ evidenceRefs: normalized.evidenceRefs }).then(freezeLifecycleResult);
    },
    summarize() {
      return adapter.summarize().then(deepFreeze);
    },
    snapshot() {
      return deepFreeze(adapter.snapshot());
    }
  });
}

export function createLocalProofVerificationRuntime({ clock }) {
  requireClock(clock, "verification");
  return Object.freeze({
    mode: "backend_proof",
    clock,
    descriptor: descriptor("verification", "local-proof-verification-runtime"),
    verify(input) {
      const evidenceRefs = normalizeEvidenceRefs(input?.evidenceRefs);
      if (!evidenceRefs) {
        return Promise.resolve(failResult("missing_evidence", "Verification proof requires valid bounded evidence refs.", []));
      }
      const target = normalizeVerificationTarget(input?.target);
      if (!target) {
        return Promise.resolve(failResult("invalid_input", "Verification proof requires target id, command id, command, and expected result.", evidenceRefs));
      }
      const evidenceRecords = evidenceRefs.map((evidenceRefId) => evidenceRecordFor({
        evidenceRefId,
        evidenceType: "verification",
        label: `metadata-only verification proof for ${target.proof.commandId}`,
        createdAt: clock.nowIso()
      }));
      const workItemId = normalizeOptionalId(input.workItemId);
      const attemptId = normalizeOptionalId(input.attemptId);
      if (workItemId === null || attemptId === null) {
        return Promise.resolve(failResult("invalid_input", "Verification proof optional ids must be bounded metadata tokens.", evidenceRefs));
      }
      return Promise.resolve(okResult(deepFreeze({
        status: "metadata_proof_only",
        target: target.proof,
        workItemId,
        attemptId,
        evidenceRecords,
        fixtureBackedExpectedEvidencePresent: false,
        commandExecutionAttempted: false,
        rawPayloadRetained: false
      }), evidenceRefs));
    }
  });
}

export function createLocalProofSessionRuntime({ clock, approvedWorkspaceRoots }) {
  requireClock(clock, "session");
  const workspaceRoots = normalizeWorkspaceRoots(approvedWorkspaceRoots);
  return Object.freeze({
    mode: "backend_proof",
    clock,
    descriptor: descriptor("session", "local-proof-session-runtime"),
    prepareSession(input) {
      const evidenceRefs = normalizeEvidenceRefs(input?.evidenceRefs);
      if (!evidenceRefs) {
        return Promise.resolve(failResult("missing_evidence", "Session proof requires valid bounded evidence refs.", []));
      }
      if (!workspaceRoots) {
        return Promise.resolve(failResult("invalid_input", "Session proof requires approved managed workspace roots.", evidenceRefs));
      }
      const workItemId = normalizeWorkItemId(input?.workItemId);
      const branchName = normalizeBranchName(input?.branchName);
      const worktreePath = normalizeWorktreePath(input?.worktreePath, workspaceRoots);
      if (!workItemId || !branchName || !worktreePath.path) {
        return Promise.resolve(failResult("invalid_input", "Session proof requires safe work item, branch, and approved worktree metadata.", evidenceRefs));
      }
      const sessionIdentity = stableDigest(`${workItemId}|${branchName}|${worktreePath.path}|${worktreePath.approvedRoot}`);
      return Promise.resolve(okResult(deepFreeze({
        sessionId: `local-proof-session:${workItemId}:${sessionIdentity}`,
        workItemId,
        branchName,
        worktreePath: worktreePath.path,
        approvedWorkspaceRoot: worktreePath.approvedRoot,
        processLaunchAttempted: false,
        filesystemMutationAttempted: false,
        credentialAccessAttempted: false,
        networkAccessAttempted: false,
        rawPayloadRetained: false
      }), evidenceRefs));
    }
  });
}

export function createLocalProofPolicyRuntime({ clock }) {
  requireClock(clock, "policy");
  return Object.freeze({
    mode: "backend_proof",
    clock,
    descriptor: descriptor("policy", "local-proof-policy-runtime"),
    evaluate(input) {
      const evidenceRefs = normalizeEvidenceRefs(input?.evidenceRefs);
      if (!evidenceRefs) {
        return Promise.resolve(failResult("missing_evidence", "Policy proof requires valid bounded evidence refs.", []));
      }
      const authorityFamily = normalizeAuthorityFamily(input?.authorityFamily);
      const operation = normalizePolicyOperation(input?.operation);
      const scope = normalizePolicyScope(input?.scope);
      if (!authorityFamily || !operation || !scope) {
        return Promise.resolve(failResult("invalid_input", "Policy proof requires authority family, operation, and scope.", evidenceRefs));
      }
      const allowed = policyAllowed({ authorityFamily, operation, scope });
      const authorityDecisionId = deterministicDecisionId({ authorityFamily, operation, scope, evidenceRefs });
      const decision = deepFreeze({
        authorityDecisionId,
        authorityStage: "backend_proof",
        decision: "block_and_record",
        authorityFamily,
        operation,
        policyId: "local-proof-runtime-policy",
        scope,
        allowedTargets: [],
        requiredEvidenceRefs: evidenceRefs,
        stopReason: allowed ? "local_proof_policy_non_authoritative" : `backend_proof_denies_${authorityFamily}:${operation}:${scope}`,
        createdAt: clock.nowIso()
      });
      return Promise.resolve(okResult(deepFreeze({
        decision,
        allowed: false,
        simulatedOnly: true,
        wouldAllowIfAuthoritative: allowed,
        blockers: [decision.stopReason],
        rawPayloadRetained: false
      }), evidenceRefs));
    }
  });
}

export function normalizeApprovedWorkspaceRootsForProof(approvedWorkspaceRoots) {
  return normalizeWorkspaceRoots(approvedWorkspaceRoots);
}

export function normalizeProofRunIdForProof(value) {
  return normalizeWorkItemId(value) || "unknown-run";
}

function descriptor(kind, adapterId) {
  return Object.freeze({
    kind,
    mode: "backend_proof",
    adapterId,
    authorityStage: "backend_proof",
    productTruthBoundary: "kendall_product_truth",
    localProofOnly: true,
    stateRetention: "kendall_manager_metadata_only",
    toolNativeStateRetained: false,
    nativeQueueStateRetained: false,
    rawPayloadRetained: false,
    evidenceRefs: Object.freeze([...BACKEND_PROOF_EVIDENCE])
  });
}

function evidenceRecordFor({ evidenceRefId, evidenceType, label, createdAt }) {
  return Object.freeze({
    evidenceRefId,
    evidenceType,
    label,
    artifactPath: null,
    retentionClass: "metadata_only",
    rawPayloadRetained: false,
    createdAt
  });
}

function requireClock(clock, adapterName) {
  if (!clock) {
    throw new Error(`local proof ${adapterName} runtime requires injected clock`);
  }
}

function normalizeEvidenceRefs(evidenceRefs) {
  if (!Array.isArray(evidenceRefs) || evidenceRefs.length === 0 || evidenceRefs.length > 8) return null;
  const normalized = evidenceRefs.map((ref) => normalizeRequiredString(ref));
  if (normalized.some((ref) => !isSafeEvidenceRef(ref))) return null;
  return Object.freeze([...normalized]);
}

function normalizeVerificationTarget(target) {
  if (!isRecord(target) || !hasOnlyKeys(target, VERIFICATION_TARGET_INPUT_KEYS)) return null;
  const verificationTargetId = normalizeRequiredString(target?.verificationTargetId);
  const commandId = normalizeRequiredString(target?.commandId);
  const command = typeof target?.command === "string" ? target.command : "";
  const expectedResult = typeof target?.expectedResult === "string" ? target.expectedResult : "";
  if (!verificationTargetId || !commandId || !command.trim() || !expectedResult.trim()) return null;
  if (!isSafeMetadataToken(verificationTargetId, SAFE_TOKEN_PATTERN) || !isSafeMetadataToken(commandId, SAFE_POLICY_TOKEN_PATTERN)) return null;
  if (hasUnsafeVerificationText(command) || hasUnsafeVerificationText(expectedResult)) return null;
  if (command.length > MAX_VERIFICATION_FIELD_LENGTH || expectedResult.length > MAX_VERIFICATION_FIELD_LENGTH) return null;
  return {
    proof: Object.freeze({
      verificationTargetId,
      commandId,
      commandDigest: stableDigest(command),
      expectedResultDigest: stableDigest(expectedResult)
    })
  };
}

function normalizeRequiredString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeWorkItemId(value) {
  const workItemId = normalizeRequiredString(value);
  return isSafeMetadataToken(workItemId, SAFE_TOKEN_PATTERN) ? workItemId : "";
}

function normalizeOptionalId(value) {
  if (value === undefined || value === null) return undefined;
  const normalized = normalizeRequiredString(value);
  return isSafeMetadataToken(normalized, SAFE_TOKEN_PATTERN) ? normalized : null;
}

function normalizeBranchName(value) {
  const branchName = normalizeRequiredString(value);
  if (hasUnsafeMetadataText(branchName)) return "";
  if (!branchName.startsWith(MANAGED_BRANCH_PREFIX)) return "";
  if (!SAFE_BRANCH_PATTERN.test(branchName)) return "";
  if (branchName.includes("..") || branchName.includes("//") || branchName.includes("@{")) return "";
  if (branchName.startsWith("-") || branchName.startsWith("/") || branchName.endsWith("/") || branchName.endsWith(".") || branchName.endsWith(".lock")) return "";
  if (branchName.split("/").some((segment) => segment.startsWith(".") || segment.endsWith(".") || segment.endsWith(".lock"))) return "";
  return branchName;
}

function normalizeWorkspaceRoots(roots) {
  if (!Array.isArray(roots) || roots.length === 0) return null;
  const normalized = roots
    .map((root) => normalizeRequiredString(root))
    .map((root) => normalizeWorkspaceRoot(root));
  if (normalized.some((root) => !root)) return null;
  return normalized.length > 0 ? Object.freeze(normalized) : null;
}

function normalizeWorktreePath(value, workspaceRoots) {
  const worktreePath = normalizeRequiredString(value);
  if (hasUnsafeMetadataText(worktreePath)) return "";
  if (!worktreePath.startsWith("/") || !isPrintablePath(worktreePath) || worktreePath.includes("\0") || worktreePath.includes("..")) return "";
  const resolvedPath = resolve(worktreePath);
  if (resolvedPath !== worktreePath) return "";
  const approvedRoot = workspaceRoots.find((root) => worktreePath.startsWith(root) && worktreePath.length > root.length);
  if (!approvedRoot) return "";
  return { path: worktreePath, approvedRoot };
}

function policyAllowed({ authorityFamily, operation, scope }) {
  return ALLOWED_POLICY_RULES.some((rule) =>
    rule.authorityFamily === authorityFamily &&
    rule.operation === operation &&
    rule.scope === scope
  );
}

function deterministicDecisionId({ authorityFamily, operation, scope, evidenceRefs }) {
  const canonical = JSON.stringify({
    authorityFamily,
    operation,
    scope,
    evidenceRefs: [...new Set(evidenceRefs)].sort()
  });
  return `local-proof-policy:${stableDigest(canonical)}`;
}

function normalizeAuthorityFamily(value) {
  const authorityFamily = normalizeRequiredString(value);
  return KNOWN_AUTHORITY_FAMILIES.includes(authorityFamily) ? authorityFamily : "";
}

function normalizePolicyOperation(value) {
  const operation = normalizeRequiredString(value);
  return isSafeMetadataToken(operation, SAFE_POLICY_TOKEN_PATTERN) ? operation : "";
}

function normalizePolicyScope(value) {
  const scope = normalizeRequiredString(value);
  return isSafeMetadataToken(scope, SAFE_POLICY_SCOPE_PATTERN) ? scope : "";
}

function isBroadWorkspaceRoot(root) {
  const normalized = root.endsWith("/") ? root : `${root}/`;
  return normalized === "/" || normalized === "/tmp/" || normalized === "/var/" || normalized === "/home/" || normalized.split("/").filter(Boolean).length < 4;
}

function normalizeWorkspaceRoot(root) {
  const normalizedRoot = normalizeRequiredString(root);
  if (hasUnsafeMetadataText(normalizedRoot)) return "";
  if (!normalizedRoot.startsWith("/") || !isPrintablePath(normalizedRoot) || normalizedRoot.includes("..") || isBroadWorkspaceRoot(normalizedRoot)) return "";
  const resolvedRoot = resolve(normalizedRoot);
  if (resolvedRoot !== normalizedRoot.replace(/\/$/, "")) return "";
  return `${resolvedRoot}/`;
}

function isPrintablePath(value) {
  return /^[\x20-\x7E]+$/.test(value);
}

function stableDigest(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex").slice(0, 32)}`;
}

function isRecord(input) {
  return input !== null && typeof input === "object" && !Array.isArray(input);
}

function hasOnlyKeys(input, allowedKeys) {
  return Object.keys(input).every((key) => allowedKeys.has(key));
}

function normalizeQueueEvidenceInput(input) {
  const evidenceRefs = normalizeEvidenceRefs(input?.evidenceRefs);
  return evidenceRefs ? { ok: true, evidenceRefs } : { ok: false };
}

function normalizeQueueCandidates(candidates) {
  if (!Array.isArray(candidates) || candidates.length > MAX_QUEUE_CANDIDATES) return null;
  const normalized = [];
  for (const candidate of candidates) {
    const sanitized = normalizeQueueCandidate(candidate);
    if (!sanitized) return null;
    normalized.push(sanitized);
  }
  return normalized;
}

function normalizeQueueCandidate(candidate) {
  if (!isRecord(candidate) || !hasOnlyKeys(candidate, CANDIDATE_INPUT_KEYS)) return null;
  const candidateWorkPacketId = normalizeWorkItemId(candidate.candidateWorkPacketId);
  const runId = normalizeWorkItemId(candidate.runId);
  const sourceRefs = normalizeSourceRefs(candidate.sourceRefs);
  const proposedSlice = normalizeMetadataText(candidate.proposedSlice);
  const acceptanceCriteria = normalizeMetadataArray(candidate.acceptanceCriteria, { requireNonEmpty: true });
  const riskClass = normalizeSetMember(candidate.riskClass, SAFE_RISK_CLASSES);
  const dependencyHints = normalizeMetadataArray(candidate.dependencyHints);
  const dedupeKey = normalizeWorkItemId(candidate.dedupeKey);
  const authorityClass = normalizeSetMember(candidate.authorityClass, SAFE_AUTHORITY_CLASSES);
  const authorityStage = normalizeSetMember(candidate.authorityStage, SAFE_AUTHORITY_STAGES);
  const status = normalizeSetMember(candidate.status, SAFE_CANDIDATE_STATUSES);
  const verificationTargets = normalizeVerificationTargets(candidate.verificationTargets, { allowEmpty: status === "needs_review" });
  const policyId = normalizeWorkItemId(candidate.policyId);
  const evidenceRefs = normalizeEvidenceRefs(candidate.evidenceRefs);
  const createdAt = normalizeIsoString(candidate.createdAt);
  const updatedAt = normalizeIsoString(candidate.updatedAt);
  if (
    !candidateWorkPacketId ||
    !runId ||
    !sourceRefs ||
    !proposedSlice ||
    !acceptanceCriteria ||
    !verificationTargets ||
    !riskClass ||
    !dependencyHints ||
    !dedupeKey ||
    !authorityClass ||
    !authorityStage ||
    !status ||
    !policyId ||
    !evidenceRefs ||
    !createdAt ||
    !updatedAt
  ) {
    return null;
  }
  return {
    candidateWorkPacketId,
    runId,
    sourceRefs,
    proposedSlice: digestMetadataText(proposedSlice, "candidate-slice"),
    acceptanceCriteria: acceptanceCriteria.map((value) => digestMetadataText(value, "acceptance")),
    verificationTargets,
    riskClass,
    dependencyHints: dependencyHints.map((value) => digestMetadataText(value, "dependency")),
    dedupeKey: digestMetadataText(dedupeKey, "dedupe"),
    authorityClass,
    authorityStage,
    status,
    policyId,
    evidenceRefs,
    createdAt,
    updatedAt
  };
}

function normalizeSourceRefs(sourceRefs) {
  if (!Array.isArray(sourceRefs) || sourceRefs.length === 0 || sourceRefs.length > 8) return null;
  const normalized = sourceRefs.map((sourceRef) => {
    if (!isRecord(sourceRef) || !hasOnlyKeys(sourceRef, SOURCE_REF_INPUT_KEYS)) return null;
    const sourceRefId = normalizeWorkItemId(sourceRef.sourceRefId);
    const sourceType = normalizeSetMember(sourceRef.sourceType, SAFE_SOURCE_TYPES);
    const label = normalizeMetadataText(sourceRef.label);
    const pathOrUrl = sourceRef.pathOrUrl === undefined || sourceRef.pathOrUrl === null ? null : normalizeMetadataText(sourceRef.pathOrUrl);
    const sourceSpan = sourceRef.sourceSpan === undefined || sourceRef.sourceSpan === null ? null : normalizeMetadataText(sourceRef.sourceSpan);
    if (sourceRef.summaryOnly !== undefined && typeof sourceRef.summaryOnly !== "boolean") return null;
    if (!sourceRefId || !sourceType || !label || pathOrUrl === "" || sourceSpan === "") return null;
    return {
      sourceRefId,
      sourceType,
      label: digestMetadataText(label, "source-label"),
      pathOrUrl: pathOrUrl ? digestMetadataText(pathOrUrl, "source-path") : null,
      sourceSpan: sourceSpan ? digestMetadataText(sourceSpan, "source-span") : null,
      summaryOnly: sourceRef.summaryOnly === true
    };
  });
  if (normalized.some((sourceRef) => !sourceRef)) return null;
  return normalized;
}

function normalizeVerificationTargets(targets, { allowEmpty = false } = {}) {
  if (!Array.isArray(targets) || (!allowEmpty && targets.length === 0) || targets.length > 8) return null;
  const normalized = targets.map((target) => {
    const proof = normalizeVerificationTarget(target)?.proof;
    if (!proof) return null;
    return {
      verificationTargetId: proof.verificationTargetId,
      commandId: proof.commandId,
      command: `metadata-only-command:${proof.commandDigest}`,
      expectedResult: `metadata-only-expected:${proof.expectedResultDigest}`
    };
  });
  if (normalized.some((target) => !target)) return null;
  return normalized;
}

function normalizeMetadataArray(values, { requireNonEmpty = false } = {}) {
  if (!Array.isArray(values) || (requireNonEmpty && values.length === 0) || values.length > 16) return null;
  const normalized = values.map((value) => normalizeMetadataText(value));
  if (normalized.some((value) => !value)) return null;
  return normalized;
}

function normalizeMetadataText(value) {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  if (!normalized || normalized.length > MAX_METADATA_TEXT_LENGTH) return "";
  if (!isPrintablePath(normalized) || hasUnsafeMetadataText(normalized)) return "";
  return normalized;
}

function isSafeMetadataToken(value, pattern) {
  return Boolean(value) && pattern.test(value) && !hasUnsafeMetadataText(value);
}

function isSafeEvidenceRef(value) {
  if (!value || !SAFE_TOKEN_PATTERN.test(value)) return false;
  if (/^(raw|provider)$/i.test(value)) return false;
  if (/^(sk-[A-Za-z0-9_-]{8,}|github_pat_|gh[opusr]_|AKIA[0-9A-Z]{12,})/i.test(value)) return false;
  return !UNSAFE_EVIDENCE_REF_PATTERN.test(value);
}

function hasUnsafeMetadataText(value) {
  if (RAW_PAYLOAD_PATTERN.test(value)) return true;
  return UNSAFE_METADATA_TEXT_PATTERN.test(value);
}

function hasUnsafeVerificationText(value) {
  return RAW_PAYLOAD_PATTERN.test(value);
}

function digestMetadataText(value, label) {
  return `${label}:${stableDigest(value)}`;
}

function normalizeSetMember(value, allowedValues) {
  const normalized = normalizeRequiredString(value);
  return allowedValues.includes(normalized) ? normalized : "";
}

function normalizeIsoString(value) {
  const normalized = normalizeRequiredString(value);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(normalized)) return "";
  const parsed = new Date(normalized);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === normalized ? normalized : "";
}

function normalizeLeaseLifecycleInput(input, evidenceRefs, { requireTtl = false } = {}) {
  const leaseId = normalizeWorkItemId(input?.leaseId);
  const workerId = normalizeWorkItemId(input?.workerId);
  const attemptId = normalizeWorkItemId(input?.attemptId);
  const idempotencyKey = normalizeWorkItemId(input?.idempotencyKey);
  const authorityDecisionId = normalizeWorkItemId(input?.authorityDecisionId);
  const ttlMs = input?.ttlMs;
  if (!leaseId || !workerId || !attemptId || !idempotencyKey || !authorityDecisionId) return null;
  if (requireTtl && (!Number.isInteger(ttlMs) || ttlMs <= 0 || ttlMs > 3_600_000)) return null;
  return {
    leaseId,
    workerId,
    attemptId,
    idempotencyKey,
    authorityDecisionId,
    evidenceRefs,
    ...(requireTtl ? { ttlMs } : {})
  };
}

function freezeLifecycleResult(result) {
  return deepFreeze(cloneForProof(result));
}

function okResult(value, evidenceRefs) {
  return deepFreeze({ ok: true, value, evidenceRefs });
}

function failResult(code, message, evidenceRefs = []) {
  return deepFreeze({ ok: false, code, message, evidenceRefs: evidenceRefs ?? [] });
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

function cloneForProof(value) {
  if (typeof globalThis.structuredClone === "function") {
    return globalThis.structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}
