import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  HookSourceApplyError,
  applyTransactionToContent,
} from "./anti-churn-source-apply.mjs";

export class HookVerificationRollbackError extends Error {
  constructor(code, message, options = {}) {
    super(`${code}: ${message}`, options);
    this.name = "HookVerificationRollbackError";
    this.code = code;
  }
}

export function finalizeHookTransactionVerification(input = {}, options = {}) {
  const transaction = normalizeTransaction(input.transaction);
  const verificationResult = normalizeVerificationResult(input.verificationResult, transaction);
  const narrowerVerificationResult = normalizeOptionalVerificationResult(input.narrowerVerificationResult);

  if (verificationResult.status === "passed") {
    const statusError = updateTransactionStatus(input.transactionPath, transaction, "verified", options.now);
    if (statusError) {
      return shapeRequiresAuthority(transaction, "transaction-status-update-blocked:TRANSACTION_STATUS_UPDATE_FAILED", "TRANSACTION_STATUS_UPDATE_FAILED", {
        residualRisks: ["source-patch-verified-but-transaction-status-update-failed"],
      });
    }
    return shapeSuccess(transaction, verificationResult, {
      candidateId: input.candidateId || null,
      warnings: [],
      verification: [shapeVerification(transaction, verificationResult)],
    });
  }

  if (verificationResult.status === "failed" && verificationResult.classification === "environment-churn") {
    const warnings = ["environment-churn-record-required"];
    if (narrowerVerificationResult?.status === "passed") {
      const statusError = updateTransactionStatus(input.transactionPath, transaction, "verified", options.now);
      if (statusError) {
        return shapeRequiresAuthority(transaction, "transaction-status-update-blocked:TRANSACTION_STATUS_UPDATE_FAILED", "TRANSACTION_STATUS_UPDATE_FAILED", {
          residualRisks: ["source-patch-verified-but-transaction-status-update-failed"],
        });
      }
      return shapeSuccess(transaction, verificationResult, {
        candidateId: input.candidateId || null,
        warnings,
        verification: [
          shapeVerification(transaction, verificationResult),
          shapeVerification(transaction, narrowerVerificationResult),
        ],
      });
    }
    const rollback = rollbackHookOwnedHunk(transaction, input.transactionPath, options, "rolled-back");
    if (rollback.status !== "rolled-back") {
      return rollback;
    }
    return shapeVerificationFailed(transaction, verificationResult, {
      warnings,
      proposals: [shapeProposal(transaction, verificationResult)],
    });
  }

  if (verificationResult.status === "approval-required") {
    const rollback = rollbackHookOwnedHunk(transaction, input.transactionPath, options, "verification-pending-approval");
    if (rollback.status !== "rolled-back") {
      return rollback;
    }
    return {
      status: "verification-pending-approval",
      exitCode: 4,
      transactionId: transaction.transactionId,
      filesChanged: [],
      applied: [],
      proposals: [shapeProposal(transaction, verificationResult)],
      verification: [shapeVerification(transaction, verificationResult)],
      warnings: ["verification-pending-approval:source-patch-rolled-back"],
      requiresAuthority: [
        {
          reason: "outside-sandbox-approval-required",
          authority: ["operator-approval"],
          behavior: "rerun-read-only-verification-outside-sandbox",
          command: verificationResult.command,
        },
      ],
      residualRisks: ["source-patch-rolled-back-until-verification-approval"],
    };
  }

  if (verificationResult.status === "failed") {
    const rollback = rollbackHookOwnedHunk(transaction, input.transactionPath, options, "rolled-back");
    if (rollback.status !== "rolled-back") {
      return rollback;
    }
    return shapeVerificationFailed(transaction, verificationResult, {
      warnings: [],
      proposals: [shapeProposal(transaction, verificationResult)],
    });
  }

  throw new HookVerificationRollbackError("UNSUPPORTED_VERIFICATION_STATUS", `Unsupported verification status: ${verificationResult.status}`);
}

function rollbackHookOwnedHunk(transaction, transactionPath, options = {}, finalStatus) {
  const path = resolve(options.cwd || process.cwd(), transaction.targetFile);
  let currentContent;
  try {
    currentContent = readFileSync(path, "utf8");
  } catch (error) {
    return shapeRequiresAuthority(transaction, `rollback-blocked:TARGET_READ_FAILED`, "TARGET_READ_FAILED", error);
  }

  const reverse = reverseTransaction(transaction);
  let nextContent;
  try {
    nextContent = applyTransactionToContent(currentContent, reverse);
  } catch (error) {
    if (error instanceof HookSourceApplyError) {
      if (error.code === "PREIMAGE_NOT_FOUND" && rollbackAlreadyApplied(currentContent, transaction)) {
        const statusError = updateTransactionStatus(transactionPath, transaction, finalStatus, options.now);
        if (statusError) {
          return shapeRequiresAuthority(transaction, "transaction-status-update-blocked:TRANSACTION_STATUS_UPDATE_FAILED", "TRANSACTION_STATUS_UPDATE_FAILED", {
            residualRisks: ["rollback-already-applied-but-transaction-status-update-failed"],
          });
        }
        return {
          status: "rolled-back",
        };
      }
      updateTransactionStatus(transactionPath, transaction, "manual-inspection-required", options.now);
      return shapeRequiresAuthority(transaction, `rollback-blocked:${error.code}`, error.code, error);
    }
    throw error;
  }

  try {
    writeFileSync(path, nextContent, "utf8");
  } catch (error) {
    return shapeRequiresAuthority(transaction, "rollback-blocked:TARGET_WRITE_FAILED", "TARGET_WRITE_FAILED", error);
  }

  const statusError = updateTransactionStatus(transactionPath, transaction, finalStatus, options.now);
  if (statusError) {
    return shapeRequiresAuthority(transaction, "transaction-status-update-blocked:TRANSACTION_STATUS_UPDATE_FAILED", "TRANSACTION_STATUS_UPDATE_FAILED", {
      residualRisks: ["rollback-applied-but-transaction-status-update-failed"],
    });
  }
  return {
    status: "rolled-back",
  };
}

function shapeSuccess(transaction, verificationResult, details = {}) {
  return {
    status: "success",
    exitCode: 0,
    transactionId: transaction.transactionId,
    filesChanged: [transaction.targetFile],
    applied: [
      {
        candidateId: details.candidateId,
        targetFile: transaction.targetFile,
        transactionId: transaction.transactionId,
        status: "verified",
      },
    ],
    proposals: [],
    verification: details.verification || [shapeVerification(transaction, verificationResult)],
    warnings: details.warnings || [],
    requiresAuthority: [],
    residualRisks: [],
  };
}

function shapeVerificationFailed(transaction, verificationResult, details = {}) {
  return {
    status: "verification-failed",
    exitCode: 2,
    transactionId: transaction.transactionId,
    filesChanged: [],
    applied: [],
    proposals: details.proposals || [shapeProposal(transaction, verificationResult)],
    verification: [shapeVerification(transaction, verificationResult)],
    warnings: ["source-patch-rolled-back-after-verification-failure", ...(details.warnings || [])],
    requiresAuthority: [],
    residualRisks: ["failed-hook-patch-converted-to-proposal"],
  };
}

function shapeRequiresAuthority(transaction, warning, reason, options = {}) {
  return {
    status: "requires-higher-authority",
    exitCode: 3,
    transactionId: transaction.transactionId,
    filesChanged: [],
    applied: [],
    proposals: [],
    verification: [
      {
        target: transaction.targetFile,
        command: transaction.verificationCommand,
        status: "rollback-blocked",
      },
    ],
    warnings: [warning],
    requiresAuthority: [
      {
        reason,
        authority: ["operator-review"],
        behavior: "manual-inspection-required-before-rollback",
      },
    ],
    residualRisks: options.residualRisks || ["rollback-blocked-current-hunk-does-not-match-hook-postimage"],
  };
}

function shapeProposal(transaction, verificationResult) {
  return {
    candidateId: null,
    targetFile: transaction.targetFile,
    transactionId: transaction.transactionId,
    decision: "proposal",
    noOpReason: "verification-failed-after-source-apply",
    summary: verificationResult.summary || "Verification failed after hook source apply.",
    failedPatch: {
      preimageHash: transaction.preimageHash,
      plannedPostimageHash: transaction.plannedPostimageHash,
    },
    verification: shapeVerification(transaction, verificationResult),
  };
}

function shapeVerification(transaction, verificationResult) {
  return {
    target: transaction.targetFile,
    command: verificationResult.command || transaction.verificationCommand,
    status: verificationResult.status,
    classification: verificationResult.classification || null,
    exitCode: verificationResult.exitCode ?? null,
    summary: verificationResult.summary || null,
  };
}

function updateTransactionStatus(transactionPath, transaction, status, now) {
  if (!transactionPath) {
    return null;
  }
  const updated = {
    ...transaction,
    status,
    updatedAt: normalizeTimestamp(now),
  };
  try {
    writeFileSync(transactionPath, `${JSON.stringify(updated, null, 2)}\n`, "utf8");
    return null;
  } catch (error) {
    return new HookVerificationRollbackError("TRANSACTION_STATUS_UPDATE_FAILED", `Unable to update hook transaction status: ${transactionPath}`, { cause: error });
  }
}

function rollbackAlreadyApplied(currentContent, transaction) {
  try {
    applyTransactionToContent(currentContent, transaction);
    return true;
  } catch {
    return false;
  }
}

function reverseTransaction(transaction) {
  return {
    ...transaction,
    preimageHunk: transaction.plannedPostimageHunk,
    preimageHash: transaction.plannedPostimageHash,
    plannedPostimageHunk: transaction.preimageHunk,
    plannedPostimageHash: transaction.preimageHash,
  };
}

function normalizeTransaction(transaction = {}) {
  return {
    ...transaction,
    transactionId: requireString(transaction.transactionId, "transactionId"),
    targetFile: requireString(transaction.targetFile, "targetFile"),
    preimageHunk: requireString(transaction.preimageHunk, "preimageHunk"),
    preimageHash: requireString(transaction.preimageHash, "preimageHash"),
    plannedPostimageHunk: requireString(transaction.plannedPostimageHunk, "plannedPostimageHunk"),
    plannedPostimageHash: requireString(transaction.plannedPostimageHash, "plannedPostimageHash"),
    verificationCommand: transaction.verificationCommand || null,
  };
}

function normalizeVerificationResult(result = {}, transaction) {
  const status = requireString(result.status, "verificationResult.status");
  return {
    ...result,
    status,
    command: result.command || transaction.verificationCommand,
    classification: result.classification || defaultClassification(status),
  };
}

function normalizeOptionalVerificationResult(result) {
  if (!result) {
    return null;
  }
  return {
    ...result,
    status: requireString(result.status, "narrowerVerificationResult.status"),
  };
}

function defaultClassification(status) {
  if (status === "failed") {
    return "hook-patch";
  }
  return null;
}

function requireString(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new HookVerificationRollbackError("INVALID_VERIFICATION_ROLLBACK_INPUT", `${field} is required.`);
  }
  return value;
}

function normalizeTimestamp(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    throw new HookVerificationRollbackError("INVALID_VERIFICATION_ROLLBACK_TIMESTAMP", `Invalid timestamp: ${value}`);
  }
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}
