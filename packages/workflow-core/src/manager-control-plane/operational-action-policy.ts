import { ManagerControlPlane } from "@kendall/contracts";

const MAX_OPERATIONAL_FRESHNESS_TTL_MS = 15 * 60 * 1000;

export interface OperationalActionEvaluationInput {
  actionType: ManagerControlPlane.ManagerOperationalActionType;
  targetStatus?: ManagerControlPlane.ManagerWorkItemStatus | null;
  leaseId?: string | null;
  authorityStage: ManagerControlPlane.ManagerAuthorityStage;
  evidenceRefs: readonly ManagerControlPlane.EvidenceRefId[] | unknown;
  trustedGateRecords?: readonly ManagerControlPlane.ManagerOperationalGateRecord[] | unknown;
  now?: string | number | Date | null;
}

interface NormalizedOperationalActionInput extends OperationalActionEvaluationInput {
  invalidAuthorityStage: boolean;
  leaseId: string | null;
}

const policyByAction = new Map(
  ManagerControlPlane.MANAGER_OPERATIONAL_ACTION_POLICIES.map((policy) => [policy.actionType, policy])
);

export function evaluateOperationalAction(
  workItem: ManagerControlPlane.WorkItem | null | undefined,
  input: OperationalActionEvaluationInput | null | undefined
): ManagerControlPlane.ManagerOperationalActionEvaluation {
  const normalizedInput = normalizeOperationalInput(input);
  const normalizedWorkItem = normalizeWorkItem(workItem);
  const evidenceRefs = sanitizeEvidenceRefs(normalizedInput.evidenceRefs);
  const trustedGateRecords = sanitizeGateRecords(normalizedInput.trustedGateRecords);
  const policy = policyByAction.get(normalizedInput.actionType) ?? policyByAction.get("unknown_action")!;

  if (policy.forbidden) {
    return buildEvaluation({
      policy,
      input: normalizedInput,
      evidenceRefs,
      ok: false,
      decision: "forbidden",
      reasonCode: policy.actionType === "unknown_action" ? "unknown_action" : "forbidden_action",
      needsApproval: policy.needsApprovalWhenBlocked,
      recoveryAction: "block",
      transition: normalizedWorkItem ? buildTransition(normalizedWorkItem.status, normalizedInput.targetStatus ?? null, false) : null
    });
  }

  if (normalizedInput.invalidAuthorityStage) {
    return buildEvaluation({
      policy,
      input: normalizedInput,
      evidenceRefs,
      ok: false,
      decision: "block_and_record",
      reasonCode: "invalid_input",
      needsApproval: policy.needsApprovalWhenBlocked.length > 0 ? policy.needsApprovalWhenBlocked : ["authority"],
      recoveryAction: "inspect",
      transition: normalizedWorkItem ? buildTransition(normalizedWorkItem.status, normalizedInput.targetStatus ?? null, false) : null
    });
  }

  if (isMetadataOnlyAction(policy) && evidenceRefs.length > 0) {
    const allowedAuthorityStages: readonly ManagerControlPlane.ManagerAuthorityStage[] = policy.allowedAuthorityStages;
    if (!allowedAuthorityStages.includes(normalizedInput.authorityStage)) {
      return buildEvaluation({
        policy,
        input: normalizedInput,
        evidenceRefs,
        ok: false,
        decision: "requires_preauthorization",
        reasonCode: "insufficient_authority",
        needsApproval: policy.needsApprovalWhenBlocked,
        recoveryAction: "request_approval",
        transition: null
      });
    }
    return buildEvaluation({
      policy,
      input: normalizedInput,
      evidenceRefs,
      ok: true,
      decision: "allowed_unattended",
      reasonCode: "allowed",
      needsApproval: [],
      recoveryAction: "proceed",
      transition: null
    });
  }

  if (requiresPreauthorizationEvidence(policy) && trustedGateRecords.length === 0) {
    return buildEvaluation({
      policy,
      input: normalizedInput,
      evidenceRefs,
      ok: false,
      decision: "block_and_record",
      reasonCode: "missing_evidence",
      needsApproval: policy.needsApprovalWhenBlocked,
      recoveryAction: "inspect",
      transition: null
    });
  }

  if (!normalizedWorkItem) {
    return buildEvaluation({
      policy,
      input: normalizedInput,
      evidenceRefs,
      ok: false,
      decision: "block_and_record",
      reasonCode: "invalid_input",
      needsApproval: ["safety"],
      recoveryAction: "inspect",
      transition: null
    });
  }

  if (evidenceRefs.length === 0) {
    return buildEvaluation({
      policy,
      input: normalizedInput,
      evidenceRefs,
      ok: false,
      decision: "block_and_record",
      reasonCode: "missing_evidence",
      needsApproval: ["safety"],
      recoveryAction: "inspect",
      transition: buildTransition(normalizedWorkItem.status, normalizedInput.targetStatus ?? null, false)
    });
  }

  if (normalizedInput.actionType === "start_live_worker" && !String(normalizedWorkItem.leaseId || "").trim()) {
    return buildEvaluation({
      policy,
      input: normalizedInput,
      evidenceRefs,
      ok: false,
      decision: "block_and_record",
      reasonCode: "missing_evidence",
      needsApproval: ["resource", "safety"],
      recoveryAction: "inspect",
      transition: buildTransition(normalizedWorkItem.status, normalizedInput.targetStatus ?? null, false)
    });
  }

  if (normalizedInput.actionType === "claim_lease" && !normalizedInput.leaseId) {
    return buildEvaluation({
      policy,
      input: normalizedInput,
      evidenceRefs,
      ok: false,
      decision: "block_and_record",
      reasonCode: "invalid_input",
      needsApproval: ["authority", "safety"],
      recoveryAction: "inspect",
      transition: buildTransition(normalizedWorkItem.status, normalizedInput.targetStatus ?? null, false)
    });
  }

  if (normalizedInput.actionType === "claim_lease" && !hasEvidenceSubjectForWorkItem(evidenceRefs, "lease-owner", normalizedInput.leaseId)) {
    return buildEvaluation({
      policy,
      input: normalizedInput,
      evidenceRefs,
      ok: false,
      decision: "block_and_record",
      reasonCode: "missing_evidence",
      needsApproval: ["authority", "safety"],
      recoveryAction: "inspect",
      transition: buildTransition(normalizedWorkItem.status, normalizedInput.targetStatus ?? null, false)
    });
  }

  if (normalizedInput.actionType === "dispatch_apply" && !hasEvidenceSubjectForWorkItem(evidenceRefs, "work-item", normalizedWorkItem.workItemId)) {
    return buildEvaluation({
      policy,
      input: normalizedInput,
      evidenceRefs,
      ok: false,
      decision: "block_and_record",
      reasonCode: "missing_evidence",
      needsApproval: ["authority", "safety"],
      recoveryAction: "inspect",
      transition: buildTransition(normalizedWorkItem.status, normalizedInput.targetStatus ?? null, false)
    });
  }

  if (requiresLeaseOwnerEvidence(normalizedInput.actionType) && !hasEvidenceSubjectForWorkItem(evidenceRefs, "lease-owner", normalizedWorkItem.leaseId)) {
    return buildEvaluation({
      policy,
      input: normalizedInput,
      evidenceRefs,
      ok: false,
      decision: "block_and_record",
      reasonCode: "missing_evidence",
      needsApproval: ["authority", "safety"],
      recoveryAction: "inspect",
      transition: buildTransition(normalizedWorkItem.status, normalizedInput.targetStatus ?? null, false)
    });
  }

  if (normalizedInput.actionType === "recover_work_item" && !hasEvidenceSubjectForWorkItem(evidenceRefs, "recovery-decision", normalizedWorkItem.workItemId)) {
    return buildEvaluation({
      policy,
      input: normalizedInput,
      evidenceRefs,
      ok: false,
      decision: "block_and_record",
      reasonCode: "missing_evidence",
      needsApproval: ["authority", "safety"],
      recoveryAction: "inspect",
      transition: buildTransition(normalizedWorkItem.status, normalizedInput.targetStatus ?? null, false)
    });
  }

  if (policy.allowedTransitions.length > 0 && !normalizedInput.targetStatus) {
    return buildEvaluation({
      policy,
      input: normalizedInput,
      evidenceRefs,
      ok: false,
      decision: "block_and_record",
      reasonCode: "invalid_input",
      needsApproval: [],
      recoveryAction: "inspect",
      transition: null
    });
  }

  const transition = evaluateTransition(policy, normalizedWorkItem.status, normalizedInput.targetStatus ?? null);
  if (transition && !transition.allowed) {
    return buildEvaluation({
      policy,
      input: normalizedInput,
      evidenceRefs,
      ok: false,
      decision: "block_and_record",
      reasonCode: "invalid_transition",
      needsApproval: [],
      recoveryAction: "inspect",
      transition
    });
  }

  const allowedSourceStatuses: readonly ManagerControlPlane.ManagerWorkItemStatus[] = policy.allowedSourceStatuses;
  if (allowedSourceStatuses.length > 0 && !allowedSourceStatuses.includes(normalizedWorkItem.status)) {
    return buildEvaluation({
      policy,
      input: normalizedInput,
      evidenceRefs,
      ok: false,
      decision: "block_and_record",
      reasonCode: "invalid_transition",
      needsApproval: policy.needsApprovalWhenBlocked,
      recoveryAction: "inspect",
      transition: null
    });
  }

  const allowedAuthorityStages: readonly ManagerControlPlane.ManagerAuthorityStage[] = policy.allowedAuthorityStages;
  if (!allowedAuthorityStages.includes(normalizedInput.authorityStage)) {
    return buildEvaluation({
      policy,
      input: normalizedInput,
      evidenceRefs,
      ok: false,
      decision: "requires_preauthorization",
      reasonCode: "insufficient_authority",
      needsApproval: policy.needsApprovalWhenBlocked,
      recoveryAction: "request_approval",
      transition
    });
  }

  if (requiresPreauthorizationEvidence(policy) && !hasPreauthorizationGate(policy, trustedGateRecords, normalizedWorkItem, evidenceRefs, normalizedInput.now)) {
    return buildEvaluation({
      policy,
      input: normalizedInput,
      evidenceRefs,
      ok: false,
      decision: "block_and_record",
      reasonCode: "missing_evidence",
      needsApproval: policy.needsApprovalWhenBlocked,
      recoveryAction: "inspect",
      transition
    });
  }

  return buildEvaluation({
    policy,
    input: normalizedInput,
    evidenceRefs,
    ok: true,
    decision: "allowed_unattended",
    reasonCode: "allowed",
    needsApproval: [],
    recoveryAction: "proceed",
    transition
  });
}

function evaluateTransition(
  policy: ManagerControlPlane.ManagerOperationalActionPolicy,
  fromStatus: ManagerControlPlane.ManagerWorkItemStatus,
  targetStatus: ManagerControlPlane.ManagerWorkItemStatus | null
): ManagerControlPlane.ManagerOperationalActionTransitionEvaluation | null {
  if (policy.allowedTransitions.length === 0 && !targetStatus) return null;

  const allowed = policy.allowedTransitions.some((rule) => rule.fromStatus === fromStatus && rule.toStatus === targetStatus);
  return buildTransition(fromStatus, targetStatus, allowed);
}

function buildTransition(
  fromStatus: ManagerControlPlane.ManagerWorkItemStatus,
  toStatus: ManagerControlPlane.ManagerWorkItemStatus | null,
  allowed: boolean
): ManagerControlPlane.ManagerOperationalActionTransitionEvaluation | null {
  if (!toStatus) return null;
  return { fromStatus, toStatus, allowed };
}

function buildEvaluation(args: {
  policy: ManagerControlPlane.ManagerOperationalActionPolicy;
  input: OperationalActionEvaluationInput;
  evidenceRefs: readonly ManagerControlPlane.EvidenceRefId[];
  ok: boolean;
  decision: ManagerControlPlane.ManagerAuthorityDecisionClass;
  reasonCode: ManagerControlPlane.ManagerOperationalActionReasonCode;
  needsApproval: readonly ManagerControlPlane.ManagerNeedsApprovalCategory[];
  recoveryAction: ManagerControlPlane.ManagerOperationalActionRecoveryAction;
  transition: ManagerControlPlane.ManagerOperationalActionTransitionEvaluation | null;
}): ManagerControlPlane.ManagerOperationalActionEvaluation {
  const transition = args.transition ? Object.freeze({ ...args.transition }) : null;
  return Object.freeze({
    ok: args.ok,
    actionType: args.policy.actionType,
    riskClass: args.policy.riskClass,
    decision: args.decision,
    reasonCode: args.reasonCode,
    authorityStage: args.input.authorityStage,
    requiredAuthorityStage: args.policy.requiredAuthorityStage,
    authorityFamily: args.policy.authorityFamily,
    maximumMutationLevel: args.policy.maximumMutationLevel,
    needsApproval: Object.freeze([...args.needsApproval]),
    recoveryAction: args.recoveryAction,
    transition,
    evidenceRefs: Object.freeze([...args.evidenceRefs]),
    metadataOnly: true,
    rawPayloadRetained: false
  });
}

function sanitizeEvidenceRefs(value: unknown): readonly ManagerControlPlane.EvidenceRefId[] {
  if (!Array.isArray(value)) return Object.freeze([]);
  const refs: string[] = [];
  const pattern = /^[a-z][a-z0-9._-]{1,40}:[A-Za-z0-9][A-Za-z0-9._:/-]{1,180}$/;
  for (const ref of value) {
    if (refs.length >= 20) break;
    if (typeof ref !== "string") continue;
    const trimmed = ref.trim();
    if (pattern.test(trimmed)) refs.push(trimmed);
  }
  return Object.freeze(refs.map((ref) => ref as ManagerControlPlane.EvidenceRefId));
}

function sanitizeGateRecords(value: unknown): readonly ManagerControlPlane.ManagerOperationalGateRecord[] {
  if (!Array.isArray(value)) return Object.freeze([]);
  const records: ManagerControlPlane.ManagerOperationalGateRecord[] = [];
  for (const record of value) {
    if (!isPlainObject(record)) continue;
    if (record.rawPayloadRetained !== false) continue;
    const gateRecordId = sanitizeGateRecordId(record.gateRecordId);
    if (!gateRecordId) continue;
    const sanitized = {
      gateRecordId,
      runId: String(record.runId || "").trim(),
      workItemId: String(record.workItemId || "").trim(),
      actionType: isOperationalActionType(record.actionType) ? record.actionType : "unknown_action",
      authoritySource: String(record.authoritySource || "").trim(),
      scope: String(record.scope || "").trim(),
      prNumber: typeof record.prNumber === "string" || typeof record.prNumber === "number" ? record.prNumber : null,
      headSha: typeof record.headSha === "string" ? record.headSha.trim() : null,
      expectedBaseBranch: typeof record.expectedBaseBranch === "string" ? record.expectedBaseBranch.trim() : null,
      draft: typeof record.draft === "boolean" ? record.draft : null,
      mergeableState: isPassingMergeableState(record.mergeableState) ? record.mergeableState : null,
      checksHeadSha: typeof record.checksHeadSha === "string" ? record.checksHeadSha.trim() : null,
      checksStatus: isPassingChecksStatus(record.checksStatus) ? record.checksStatus : null,
      reviewState: isPassingReviewState(record.reviewState) ? record.reviewState : null,
      reviewThreadsResolved: typeof record.reviewThreadsResolved === "boolean" ? record.reviewThreadsResolved : null,
      localVerificationRefs: sanitizeEvidenceRefs(record.localVerificationRefs),
      currentHeadRefOid: typeof record.currentHeadRefOid === "string" ? record.currentHeadRefOid.trim() : null,
      currentBaseBranch: typeof record.currentBaseBranch === "string" ? record.currentBaseBranch.trim() : null,
      currentDraft: typeof record.currentDraft === "boolean" ? record.currentDraft : null,
      currentMergeableState: isPassingMergeableState(record.currentMergeableState) ? record.currentMergeableState : null,
      currentChecksHeadSha: typeof record.currentChecksHeadSha === "string" ? record.currentChecksHeadSha.trim() : null,
      currentChecksStatus: isPassingChecksStatus(record.currentChecksStatus) ? record.currentChecksStatus : null,
      currentReviewState: isPassingReviewState(record.currentReviewState) ? record.currentReviewState : null,
      currentReviewThreadsResolved: typeof record.currentReviewThreadsResolved === "boolean" ? record.currentReviewThreadsResolved : null,
      currentVerificationFresh: record.currentVerificationFresh === true,
      currentSnapshotAt: typeof record.currentSnapshotAt === "string" ? record.currentSnapshotAt.trim() : null,
      currentPrSnapshotAt: typeof record.currentPrSnapshotAt === "string" ? record.currentPrSnapshotAt.trim() : null,
      currentVerifiedAt: typeof record.currentVerifiedAt === "string" ? record.currentVerifiedAt.trim() : null,
      currentSnapshotTtlMs: typeof record.currentSnapshotTtlMs === "number" ? record.currentSnapshotTtlMs : null,
      freshnessTtlMs: typeof record.freshnessTtlMs === "number" ? record.freshnessTtlMs : null,
      currentVerificationRefs: sanitizeEvidenceRefs(record.currentVerificationRefs),
      mergedPrHeadSha: typeof record.mergedPrHeadSha === "string" ? record.mergedPrHeadSha.trim() : null,
      expectedOwner: typeof record.expectedOwner === "string" ? record.expectedOwner.trim() : null,
      worktreePath: typeof record.worktreePath === "string" ? record.worktreePath.trim() : null,
      localBranch: typeof record.localBranch === "string" ? record.localBranch.trim() : null,
      localBranchSha: typeof record.localBranchSha === "string" ? record.localBranchSha.trim() : null,
      remoteBranch: typeof record.remoteBranch === "string" ? record.remoteBranch.trim() : null,
      remoteBranchSha: typeof record.remoteBranchSha === "string" ? record.remoteBranchSha.trim() : null,
      currentExpectedOwner: typeof record.currentExpectedOwner === "string" ? record.currentExpectedOwner.trim() : null,
      currentWorktreePath: typeof record.currentWorktreePath === "string" ? record.currentWorktreePath.trim() : null,
      currentLocalBranch: typeof record.currentLocalBranch === "string" ? record.currentLocalBranch.trim() : null,
      currentLocalBranchSha: typeof record.currentLocalBranchSha === "string" ? record.currentLocalBranchSha.trim() : null,
      currentRemoteBranch: typeof record.currentRemoteBranch === "string" ? record.currentRemoteBranch.trim() : null,
      currentRemoteBranchSha: typeof record.currentRemoteBranchSha === "string" ? record.currentRemoteBranchSha.trim() : null,
      currentWorktreeState: record.currentWorktreeState === "clean" || record.currentWorktreeState === "removed"
        ? record.currentWorktreeState as "clean" | "removed"
        : null,
      currentDryRunId: typeof record.currentDryRunId === "string" ? record.currentDryRunId.trim() : null,
      currentDryRunAt: typeof record.currentDryRunAt === "string" ? record.currentDryRunAt.trim() : null,
      dryRunAt: typeof record.dryRunAt === "string" ? record.dryRunAt.trim() : null,
      dryRunTtlMs: typeof record.dryRunTtlMs === "number" ? record.dryRunTtlMs : null,
      dryRunFresh: record.dryRunFresh === true,
      deletionScope: isCleanupDeletionScope(record.deletionScope) ? record.deletionScope : null,
      dryRunId: typeof record.dryRunId === "string" ? record.dryRunId.trim() : null,
      rollbackPath: typeof record.rollbackPath === "string" ? record.rollbackPath.trim() : null,
      cleanupDryRunPassed: record.cleanupDryRunPassed === true,
      rawPayloadRetained: false as const
    };
    if (sanitized.gateRecordId && sanitized.runId && sanitized.workItemId && sanitized.authoritySource && sanitized.scope) {
      records.push(sanitized);
      if (records.length >= 10) break;
    }
  }
  return Object.freeze(records);
}

function requiresPreauthorizationEvidence(policy: ManagerControlPlane.ManagerOperationalActionPolicy): boolean {
  return policy.actionType === "deliver_pr" || policy.actionType === "cleanup_workspace";
}

function isMetadataOnlyAction(policy: ManagerControlPlane.ManagerOperationalActionPolicy): boolean {
  return policy.actionType === "inspect_state" || policy.actionType === "refresh_projection";
}

function hasPreauthorizationGate(
  policy: ManagerControlPlane.ManagerOperationalActionPolicy,
  gateRecords: readonly ManagerControlPlane.ManagerOperationalGateRecord[],
  workItem: Pick<ManagerControlPlane.WorkItem, "status" | "leaseId" | "workItemId" | "runId">,
  evidenceRefs: readonly ManagerControlPlane.EvidenceRefId[],
  now: string | number | Date | null | undefined
): boolean {
  return gateRecords.some((record) => {
    if (record.actionType !== policy.actionType) return false;
    if (record.runId !== String(workItem.runId)) return false;
    if (record.workItemId !== String(workItem.workItemId)) return false;
    if (!evidenceRefsMatchGateRecord(evidenceRefs, record.gateRecordId)) return false;
    if (policy.actionType === "deliver_pr") {
      return Boolean(
        record.prNumber &&
          isFullHeadSha(record.headSha) &&
          record.expectedBaseBranch &&
          record.draft === false &&
          record.mergeableState &&
          record.checksHeadSha === record.headSha &&
          record.checksStatus &&
          record.reviewState &&
          record.reviewThreadsResolved === true &&
          Array.isArray(record.localVerificationRefs) &&
          record.localVerificationRefs.length > 0 &&
          deliveryGateRecordMatchesCurrentState(record, evidenceRefs, now)
      );
    }
    if (policy.actionType === "cleanup_workspace") {
      return cleanupGateRecordMatchesScope(record, now);
    }
    return false;
  });
}

function evidenceRefsMatchGateRecord(evidenceRefs: readonly ManagerControlPlane.EvidenceRefId[], gateRecordId: ManagerControlPlane.EvidenceRefId): boolean {
  const id = String(gateRecordId || "");
  const suffix = id.includes(":") ? id.slice(id.indexOf(":") + 1) : id;
  return evidenceRefs.includes(id as ManagerControlPlane.EvidenceRefId) ||
    evidenceRefs.includes(`gate-record:${suffix}` as ManagerControlPlane.EvidenceRefId) ||
    evidenceRefs.includes(`preauthorization-record:${suffix}` as ManagerControlPlane.EvidenceRefId) ||
    evidenceRefs.includes(`preauthorization-record:${id}` as ManagerControlPlane.EvidenceRefId);
}

function cleanupGateRecordMatchesScope(record: ManagerControlPlane.ManagerOperationalGateRecord, now: string | number | Date | null | undefined): boolean {
  if (record.cleanupDryRunPassed !== true) return false;
  if (!isFullHeadSha(record.mergedPrHeadSha)) return false;
  if (!record.expectedOwner || !record.deletionScope || !record.dryRunId || !record.rollbackPath) return false;
  if (!cleanupGateRecordMatchesCurrentState(record, now)) return false;
  if (record.deletionScope === "worktree") {
    return Boolean(record.worktreePath);
  }
  if (record.deletionScope === "local_branch") {
    return Boolean(record.localBranch && record.localBranchSha === record.mergedPrHeadSha);
  }
  if (record.deletionScope === "remote_branch") {
    return Boolean(record.remoteBranch && record.remoteBranchSha === record.mergedPrHeadSha);
  }
  return Boolean(
    record.worktreePath &&
      record.localBranch &&
      record.localBranchSha === record.mergedPrHeadSha &&
      record.remoteBranch &&
      record.remoteBranchSha === record.mergedPrHeadSha
  );
}

function deliveryGateRecordMatchesCurrentState(record: ManagerControlPlane.ManagerOperationalGateRecord, evidenceRefs: readonly ManagerControlPlane.EvidenceRefId[], now: string | number | Date | null | undefined): boolean {
  if (!currentPrSnapshotEvidenceMatches(record, evidenceRefs)) return false;
  if (!freshTimestampWithinTtl(record.currentSnapshotAt || record.currentPrSnapshotAt, record.currentSnapshotTtlMs || record.freshnessTtlMs, now)) return false;
  if (record.currentHeadRefOid !== record.headSha) return false;
  if (record.currentBaseBranch !== record.expectedBaseBranch) return false;
  if (record.currentDraft !== false) return false;
  if (!record.currentMergeableState) return false;
  if (record.currentChecksHeadSha !== record.headSha) return false;
  if (!record.currentChecksStatus) return false;
  if (record.currentReviewState !== "approved") return false;
  if (record.currentReviewThreadsResolved !== true) return false;
  if (record.currentVerificationFresh !== true) return false;
  const expectedRefs = Array.isArray(record.localVerificationRefs) ? record.localVerificationRefs : [];
  const currentRefs = Array.isArray(record.currentVerificationRefs) ? record.currentVerificationRefs : [];
  return expectedRefs.length > 0 && expectedRefs.every((ref) => currentRefs.includes(ref));
}

function currentPrSnapshotEvidenceMatches(record: ManagerControlPlane.ManagerOperationalGateRecord, evidenceRefs: readonly ManagerControlPlane.EvidenceRefId[]): boolean {
  const prNumber = String(record.prNumber || "").trim();
  if (!prNumber) return false;
  return evidenceRefs.includes(`record:current-pr-snapshot-${prNumber}` as ManagerControlPlane.EvidenceRefId) ||
    evidenceRefs.includes(`record:current-pr-snapshot:${prNumber}` as ManagerControlPlane.EvidenceRefId);
}

function cleanupGateRecordMatchesCurrentState(record: ManagerControlPlane.ManagerOperationalGateRecord, now: string | number | Date | null | undefined): boolean {
  if (!freshTimestampWithinTtl(record.currentDryRunAt, record.dryRunTtlMs || record.freshnessTtlMs, now)) return false;
  if (record.dryRunFresh !== true) return false;
  if (record.currentDryRunId !== record.dryRunId) return false;
  if (record.currentExpectedOwner !== record.expectedOwner) return false;
  if (record.deletionScope === "worktree" || record.deletionScope === "managed_workspace") {
    if (record.currentWorktreeState !== "clean" && record.currentWorktreeState !== "removed") return false;
    if (record.worktreePath && record.currentWorktreePath !== record.worktreePath) return false;
  }
  if (record.deletionScope === "local_branch" || record.deletionScope === "managed_workspace") {
    if (record.localBranch && record.currentLocalBranch !== record.localBranch) return false;
    if (record.localBranchSha && record.currentLocalBranchSha !== record.localBranchSha) return false;
  }
  if (record.deletionScope === "remote_branch" || record.deletionScope === "managed_workspace") {
    if (record.remoteBranch && record.currentRemoteBranch !== record.remoteBranch) return false;
    if (record.remoteBranchSha && record.currentRemoteBranchSha !== record.remoteBranchSha) return false;
  }
  return true;
}

function freshTimestampWithinTtl(timestamp: string | null | undefined, ttlMs: number | null | undefined, now: string | number | Date | null | undefined): boolean {
  const parsed = Date.parse(String(timestamp || ""));
  if (!Number.isFinite(parsed)) return false;
  const requestedTtl = Number.isFinite(Number(ttlMs)) && Number(ttlMs) > 0 ? Number(ttlMs) : MAX_OPERATIONAL_FRESHNESS_TTL_MS;
  const ttl = Math.min(requestedTtl, MAX_OPERATIONAL_FRESHNESS_TTL_MS);
  const injected = now instanceof Date ? now.getTime() : Date.parse(String(now ?? ""));
  if (!Number.isFinite(injected)) return false;
  const reference = injected;
  return parsed <= reference && reference - parsed <= ttl;
}

function normalizeOperationalInput(input: OperationalActionEvaluationInput | null | undefined): NormalizedOperationalActionInput {
  const actionType = isOperationalActionType(input?.actionType) ? input.actionType : "unknown_action";
  const targetStatus = isWorkItemStatus(input?.targetStatus) ? input?.targetStatus ?? null : null;
  const authorityStage = isAuthorityStage(input?.authorityStage) ? input?.authorityStage : "backend_proof";
  const invalidAuthorityStage = Boolean(input) && !isAuthorityStage(input?.authorityStage);
  const leaseId = typeof input?.leaseId === "string" && input.leaseId.trim() ? input.leaseId.trim() : null;
  return {
    actionType: actionType as ManagerControlPlane.ManagerOperationalActionType,
    targetStatus,
    leaseId,
    authorityStage,
    invalidAuthorityStage,
    evidenceRefs: input?.evidenceRefs,
    trustedGateRecords: input?.trustedGateRecords,
    now: input?.now ?? null
  };
}

function normalizeWorkItem(workItem: ManagerControlPlane.WorkItem | null | undefined): Pick<ManagerControlPlane.WorkItem, "status" | "leaseId" | "workItemId" | "runId"> | null {
  if (!isWorkItemStatus(workItem?.status)) return null;
  const workItemId = typeof workItem?.workItemId === "string" ? workItem.workItemId : "";
  const runId = typeof workItem?.runId === "string" ? workItem.runId : "";
  if (!workItemId || !runId) return null;
  return {
    status: workItem.status,
    leaseId: typeof workItem.leaseId === "string" ? workItem.leaseId : null,
    workItemId: workItem.workItemId,
    runId: workItem.runId
  };
}

function isAuthorityStage(value: unknown): value is ManagerControlPlane.ManagerAuthorityStage {
  return typeof value === "string" && ManagerControlPlane.MANAGER_AUTHORITY_STAGES.includes(value as ManagerControlPlane.ManagerAuthorityStage);
}

function isWorkItemStatus(value: unknown): value is ManagerControlPlane.ManagerWorkItemStatus {
  return typeof value === "string" && ManagerControlPlane.WORK_ITEM_STATUSES.includes(value as ManagerControlPlane.ManagerWorkItemStatus);
}

function isOperationalActionType(value: unknown): value is ManagerControlPlane.ManagerOperationalActionType {
  return typeof value === "string" && ManagerControlPlane.MANAGER_OPERATIONAL_ACTION_TYPES.includes(value as ManagerControlPlane.ManagerOperationalActionType);
}

function requiresLeaseOwnerEvidence(actionType: ManagerControlPlane.ManagerOperationalActionType): boolean {
  return actionType === "start_live_worker" ||
    actionType === "complete_work_item" ||
    actionType === "signal_worker_progress" ||
    actionType === "answer_worker_question" ||
    actionType === "probe_worker_prompt" ||
    actionType === "repair_submit_pending" ||
    actionType === "inspect_worker_recovery" ||
    actionType === "retire_worker";
}

function hasEvidenceSubject(evidenceRefs: readonly ManagerControlPlane.EvidenceRefId[], subject: string): boolean {
  return evidenceRefs.some((ref) => String(ref).startsWith(`${subject}:`));
}

function hasEvidenceSubjectForWorkItem(evidenceRefs: readonly ManagerControlPlane.EvidenceRefId[], subject: string, expected: string | null | undefined): boolean {
  const normalizedExpected = String(expected || "").trim();
  if (!normalizedExpected) return false;
  return evidenceRefs.some((ref) => String(ref) === `${subject}:${normalizedExpected}`);
}

function sanitizeGateRecordId(value: unknown): ManagerControlPlane.EvidenceRefId | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (/^(gate-record|preauthorization-record):[A-Za-z0-9][A-Za-z0-9._:/-]{1,180}$/.test(trimmed)) {
    return trimmed as ManagerControlPlane.EvidenceRefId;
  }
  return null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isPassingChecksStatus(value: unknown): value is "passed" | "success" | "green" {
  return value === "passed" || value === "success" || value === "green";
}

function isPassingReviewState(value: unknown): value is "approved" {
  return value === "approved";
}

function isPassingMergeableState(value: unknown): value is "clean" | "mergeable" {
  return value === "clean" || value === "mergeable";
}

function isCleanupDeletionScope(value: unknown): value is "worktree" | "local_branch" | "remote_branch" | "managed_workspace" {
  return value === "worktree" || value === "local_branch" || value === "remote_branch" || value === "managed_workspace";
}

function isFullHeadSha(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{40}$/i.test(value);
}
