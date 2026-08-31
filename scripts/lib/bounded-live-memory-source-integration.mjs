import { existsSync, lstatSync, readFileSync, realpathSync, statSync } from "node:fs";
import { basename, isAbsolute, normalize, relative, resolve, sep } from "node:path";

import {
  listApprovedNotes,
  validateConfig,
  writeApprovedDraft,
} from "./knx-obsidian-memory.mjs";
import {
  LIVE_MEMORY_SOURCE_ENFORCEMENT_POLICY,
  evaluateLiveMemorySourceEnforcement,
} from "./live-memory-source-enforcement.mjs";

const DEFAULT_SOURCE_REF = Object.freeze({
  sourceType: "obsidian",
  accessState: "allowed",
  freshness: "fresh",
  canonicality: "canonical_human_owned",
  contradictionStatus: "none",
});

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonBlankString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function asSourceRef(sourceRef, overrides = {}) {
  if (!isRecord(sourceRef)) {
    return sourceRef;
  }
  return {
    ...DEFAULT_SOURCE_REF,
    ...sourceRef,
    ...overrides,
  };
}

function displaySourceRef(sourceRef) {
  return isRecord(sourceRef)
    ? {
        sourceType: sourceRef.sourceType ?? null,
        accessState: sourceRef.accessState ?? null,
        freshness: sourceRef.freshness ?? null,
        canonicality: sourceRef.canonicality ?? null,
        contradictionStatus: sourceRef.contradictionStatus ?? null,
      }
    : {
        sourceType: null,
        accessState: null,
        freshness: null,
        canonicality: null,
        contradictionStatus: null,
      };
}

function isSafeRelativePath(relativePath) {
  if (!isNonBlankString(relativePath) || isAbsolute(relativePath)) {
    return false;
  }
  const normalized = normalize(relativePath);
  return normalized !== ".." && !normalized.startsWith(`..${sep}`) && !normalized.split(sep).includes("..");
}

function toPosixRelativePath(relativePath) {
  return normalize(relativePath).split(sep).join("/");
}

function addUniqueReason(reasonCodes, reasonCode) {
  if (!reasonCodes.includes(reasonCode)) {
    reasonCodes.push(reasonCode);
  }
}

function isExcludedRelativePath(relativePath, excludedFolders) {
  const normalized = toPosixRelativePath(relativePath);
  return excludedFolders.some((folder) => {
    const excluded = toPosixRelativePath(folder).replace(/\/+$/, "");
    return normalized === excluded || normalized.startsWith(`${excluded}/`);
  });
}

function firstHeading(markdown, fallback) {
  const heading = markdown.split(/\r?\n/).find((line) => line.startsWith("# "));
  return heading ? heading.replace(/^#\s+/, "").trim() : fallback;
}

function isScopedDraftTarget(targetRef, draftQueueFolder = "01 Dashboard Queue") {
  if (!isRecord(targetRef) || targetRef.targetType !== "obsidian_draft" || targetRef.quarantine !== true) {
    return false;
  }
  if (!isSafeRelativePath(targetRef.targetPath)) {
    return false;
  }
  const queueRoot = `${toPosixRelativePath(draftQueueFolder).replace(/\/+$/, "")}/AI Drafts`;
  const targetPath = toPosixRelativePath(targetRef.targetPath);
  return targetPath === queueRoot || targetPath.startsWith(`${queueRoot}/`);
}

function proposalSourcePaths(proposal) {
  return Array.isArray(proposal?.source_refs)
    ? proposal.source_refs
        .filter((ref) => isRecord(ref) && ref.type === "obsidian-note" && isNonBlankString(ref.path))
        .map((ref) => toPosixRelativePath(ref.path))
    : [];
}

function approvedProposalSourceDecision(config, proposal, sourceRef, options) {
  const sourcePaths = proposalSourcePaths(proposal);
  if (sourcePaths.length === 0 || sourcePaths.length !== (proposal?.source_refs?.length ?? 0)) {
    return {
      approved: false,
      sourceRef: asSourceRef(sourceRef, { freshness: "unknown" }),
      reasonCode: "unknown_source",
    };
  }

  const validation = validateConfig(config, options);
  const approvedNotes = listApprovedNotes(config, options);
  const approvedPaths = new Set(approvedNotes.notes.map((note) => note.relative_path));
  for (const sourcePath of sourcePaths) {
    if (!isSafeRelativePath(sourcePath)) {
      return {
        approved: false,
        sourceRef: asSourceRef(sourceRef, { freshness: "unknown" }),
        reasonCode: "unknown_source",
      };
    }
    if (isExcludedRelativePath(sourcePath, validation.excluded_folders)) {
      return {
        approved: false,
        sourceRef: asSourceRef(sourceRef, { accessState: "excluded" }),
        reasonCode: "excluded_source",
      };
    }
    if (!approvedPaths.has(sourcePath)) {
      return {
        approved: false,
        sourceRef: asSourceRef(sourceRef, { accessState: "missing" }),
        reasonCode: "missing_source",
      };
    }
  }

  return {
    approved: true,
    sourceRef,
    reasonCode: null,
  };
}

function baseResult(decisionResult, extra = {}) {
  return {
    decision: decisionResult.decision,
    authorityFamily: decisionResult.authorityFamily,
    reasonCodes: decisionResult.reasonCodes,
    blockedOperations: decisionResult.blockedOperations,
    auditEvent: decisionResult.auditEvent,
    recovery: decisionResult.recovery,
    retention: {
      rawPayloadRetained: false,
      sourceContentCopied: false,
    },
    rawPayloadRetained: false,
    sourceContentCopied: false,
    ...extra,
  };
}

function blockedIntegrationResult(input, reasonCode, extra = {}) {
  const result = evaluateLiveMemorySourceEnforcement(input);
  addUniqueReason(result.reasonCodes, reasonCode);
  return baseResult(
    {
      ...result,
      decision: "blocked",
      blockedOperations: result.blockedOperations.length > 0
        ? result.blockedOperations
        : ["write_back", "source_copy", "promotion", "authority_escalation"],
      auditEvent: {
        ...result.auditEvent,
        decision: "blocked",
        reasonCodes: result.reasonCodes,
      },
    },
    extra,
  );
}

export function createDryRunMemorySourceWritePlan(input = {}) {
  const sourceRef = asSourceRef(input.sourceRef);
  const operationInput = {
    operation: "create_dry_run_write_plan",
    sourceRef,
    backupPath: input.backupPath,
    rollbackPath: input.rollbackPath,
    requestedRetention: "metadata_only",
    rawPayloadRetained: false,
    sourceContentCopied: false,
  };
  if (!isScopedDraftTarget(input.targetRef, input.draftQueueFolder)) {
    return blockedIntegrationResult(
      operationInput,
      "unscoped_target",
      {
        operation: "create_dry_run_write_plan",
        dryRun: true,
        writePerformed: false,
        writePreviewArtifactCreated: false,
        sourceMetadata: displaySourceRef(sourceRef),
        targetMetadata: {
          targetType: input.targetRef?.targetType ?? null,
          targetPath: input.targetRef?.targetPath ?? null,
          quarantine: input.targetRef?.quarantine === true,
        },
      },
    );
  }

  const decisionResult = evaluateLiveMemorySourceEnforcement({
    ...operationInput,
  });

  return baseResult(decisionResult, {
    operation: "create_dry_run_write_plan",
    dryRun: true,
    writePerformed: false,
    writePreviewArtifactCreated: false,
    sourceMetadata: displaySourceRef(sourceRef),
    targetMetadata: {
      targetType: input.targetRef?.targetType ?? null,
      targetPath: input.targetRef?.targetPath ?? null,
      quarantine: input.targetRef?.quarantine === true,
    },
  });
}

export function inspectApprovedMemorySource(config, input = {}, options = {}) {
  const sourceRef = asSourceRef(input.sourceRef);
  const relativePath = input.relativePath;
  const validation = validateConfig(config, options);
  const operationInput = {
    operation: "inspect_approved_source_metadata",
    sourceRef,
    requestedRetention: "metadata_only",
    rawPayloadRetained: false,
    sourceContentCopied: false,
  };

  if (validation.status === "FAIL" || !existsSync(validation.vault_root)) {
    return blockedIntegrationResult(
      {
        ...operationInput,
        sourceRef: asSourceRef(sourceRef, { accessState: "unavailable" }),
      },
      "unavailable_source",
      { mode: "read_only", metadata: null },
    );
  }

  if (!isSafeRelativePath(relativePath)) {
    return blockedIntegrationResult(
      {
        ...operationInput,
        sourceRef: asSourceRef(sourceRef, { freshness: "unknown" }),
      },
      "unknown_source",
      { mode: "read_only", metadata: null },
    );
  }

  const normalizedRelativePath = toPosixRelativePath(relativePath);
  if (isExcludedRelativePath(normalizedRelativePath, validation.excluded_folders)) {
    return blockedIntegrationResult(
      {
        ...operationInput,
        sourceRef: asSourceRef(sourceRef, { accessState: "excluded" }),
      },
      "excluded_source",
      { mode: "read_only", metadata: null },
    );
  }

  const approvedNotes = listApprovedNotes(config, options);
  const note = approvedNotes.notes.find((approvedNote) => approvedNote.relative_path === normalizedRelativePath);
  if (!note) {
    return blockedIntegrationResult(
      {
        ...operationInput,
        sourceRef: asSourceRef(sourceRef, { accessState: "missing" }),
      },
      "missing_source",
      { mode: "read_only", metadata: null },
    );
  }

  let notePath;
  let noteStat;
  try {
    notePath = resolve(note.path);
    noteStat = statSync(notePath);
    const noteLinkStat = lstatSync(notePath);
    const vaultRoot = realpathSync(validation.vault_root);
    const noteRealPath = realpathSync(notePath);
    const noteRelative = relative(vaultRoot, noteRealPath);
    if (
      noteLinkStat.isSymbolicLink() ||
      noteRelative.startsWith("..") ||
      isAbsolute(noteRelative) ||
      !noteStat.isFile()
    ) {
      return blockedIntegrationResult(
        {
          ...operationInput,
          sourceRef: asSourceRef(sourceRef, { accessState: "blocked" }),
        },
        "blocked_source",
        { mode: "read_only", metadata: null },
      );
    }
  } catch {
    return blockedIntegrationResult(
      {
        ...operationInput,
        sourceRef: asSourceRef(sourceRef, { accessState: "unavailable" }),
      },
      "unavailable_source",
      { mode: "read_only", metadata: null },
    );
  }

  const decisionResult = evaluateLiveMemorySourceEnforcement(operationInput);
  if (decisionResult.decision !== "allowed") {
    return baseResult(decisionResult, {
      mode: "read_only",
      metadata: null,
    });
  }

  let content;
  try {
    content = readFileSync(notePath, "utf8");
  } catch {
    return blockedIntegrationResult(
      {
        ...operationInput,
        sourceRef: asSourceRef(sourceRef, { accessState: "unavailable" }),
      },
      "unavailable_source",
      { mode: "read_only", metadata: null },
    );
  }
  return baseResult(decisionResult, {
    mode: "read_only",
    metadata: {
      relativePath: normalizedRelativePath,
      sourceType: "obsidian",
      title: firstHeading(content, basename(normalizedRelativePath, ".md")),
      sizeBytes: noteStat.size,
    },
  });
}

export function createBoundedDraftWritePreview(config, proposal, input = {}, options = {}) {
  const sourceRef = asSourceRef(input.sourceRef);
  const targetRef = input.targetRef;
  const validation = validateConfig(config, options);
  if (!isScopedDraftTarget(targetRef, validation.proposal_queue_folder)) {
    return blockedIntegrationResult(
      {
        operation: "create_draft_write_preview",
        sourceRef,
        explicitApproval: input.explicitApproval,
        approvalRef: input.approvalRef,
        backupPath: input.backupPath,
        rollbackPath: input.rollbackPath,
        requestedRetention: "metadata_only",
        rawPayloadRetained: false,
        sourceContentCopied: false,
      },
      "unscoped_target",
      {
        dryRun: true,
        writePerformed: false,
        writePreviewArtifactCreated: false,
        preview: null,
      },
    );
  }

  if (proposal?.status !== "approved") {
    return blockedIntegrationResult(
      {
        operation: "create_draft_write_preview",
        sourceRef,
        explicitApproval: input.explicitApproval,
        approvalRef: input.approvalRef,
        backupPath: input.backupPath,
        rollbackPath: input.rollbackPath,
        requestedRetention: "metadata_only",
        rawPayloadRetained: false,
        sourceContentCopied: false,
      },
      "missing_approval_metadata",
      {
        dryRun: true,
        writePerformed: false,
        writePreviewArtifactCreated: false,
        preview: null,
      },
    );
  }

  const approvedSourceDecision = approvedProposalSourceDecision(config, proposal, sourceRef, options);
  if (!approvedSourceDecision.approved) {
    return blockedIntegrationResult(
      {
        operation: "create_draft_write_preview",
        sourceRef: approvedSourceDecision.sourceRef,
        explicitApproval: input.explicitApproval,
        approvalRef: input.approvalRef,
        backupPath: input.backupPath,
        rollbackPath: input.rollbackPath,
        requestedRetention: "metadata_only",
        rawPayloadRetained: false,
        sourceContentCopied: false,
      },
      approvedSourceDecision.reasonCode,
      {
        dryRun: true,
        writePerformed: false,
        writePreviewArtifactCreated: false,
        preview: null,
      },
    );
  }

  const decisionResult = evaluateLiveMemorySourceEnforcement({
    operation: "create_draft_write_preview",
    sourceRef,
    explicitApproval: input.explicitApproval,
    approvalRef: input.approvalRef,
    backupPath: input.backupPath,
    rollbackPath: input.rollbackPath,
    requestedRetention: "metadata_only",
    rawPayloadRetained: false,
    sourceContentCopied: false,
  });

  if (decisionResult.decision !== "allowed") {
    return baseResult(decisionResult, {
      dryRun: true,
      writePerformed: false,
      writePreviewArtifactCreated: false,
      preview: null,
    });
  }

  if (input.writePreviewArtifact !== true) {
    return baseResult(decisionResult, {
      dryRun: true,
      writePerformed: false,
      writePreviewArtifactCreated: false,
      preview: null,
    });
  }

  const draft = writeApprovedDraft(config, proposal, options);
  return baseResult(
    {
      ...decisionResult,
      recovery: {
        ...decisionResult.recovery,
        backupPath: draft.backup.backup_path,
      },
    },
    {
      dryRun: false,
      writePerformed: false,
      writePreviewArtifactCreated: true,
      preview: {
        path: draft.draft_path,
        relativePath: draft.relative_path,
      },
    },
  );
}

export function describeBoundedLiveMemorySourceIntegration() {
  return {
    authorityFamily: LIVE_MEMORY_SOURCE_ENFORCEMENT_POLICY.authorityFamily,
    operations: [
      "create_dry_run_write_plan",
      "inspect_approved_source_metadata",
      "create_draft_write_preview",
    ],
    writesCanonicalMemory: false,
    mutatesSource: false,
    retainsRawPayloads: false,
    copiesSourceContent: false,
  };
}
