import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ALLOWLISTED_TARGETS = new Set([
  "docs/workflows/tool-churn-rca.md",
  "docs/workflows/tool-churn-rca-examples.md",
  "docs/workflows/end-to-end-lane-runner.md",
  "scripts/check-token-economy.mjs",
]);
const START_MARKER = "<!-- anti-churn-guidance:start -->";
const END_MARKER = "<!-- anti-churn-guidance:end -->";

export class HookSourceApplyError extends Error {
  constructor(code, message, options = {}) {
    super(`${code}: ${message}`, options);
    this.name = "HookSourceApplyError";
    this.code = code;
  }
}

export function applyPreparedHookTransaction(input = {}, options = {}) {
  let transaction = null;
  let path = null;
  let currentContent = null;
  let wroteTarget = false;
  try {
    transaction = normalizeTransaction(input.transaction);
    validateAllowlistedTarget(transaction.targetFile);
    path = resolve(options.cwd || process.cwd(), transaction.targetFile);
    currentContent = readTargetFile(path, transaction.targetFile);
    const nextContent = applyTransactionToContent(currentContent, transaction);
    writeTargetFile(path, nextContent, transaction.targetFile);
    wroteTarget = true;
    if (input.transactionPath) {
      updateTransactionStatus(input.transactionPath, transaction, options.now);
    }
    return {
      status: "applied",
      transactionId: transaction.transactionId,
      filesChanged: [transaction.targetFile],
      applied: [
        {
          candidateId: input.candidateId || null,
          targetFile: transaction.targetFile,
          transactionId: transaction.transactionId,
          status: "verification-pending",
        },
      ],
      verification: [
        {
          target: transaction.targetFile,
          command: transaction.verificationCommand,
        },
      ],
      warnings: ["source-application-verification-pending"],
      requiresAuthority: [],
      residualRisks: ["source-patch-not-yet-verified-story-3-4"],
    };
  } catch (error) {
    if (error instanceof HookSourceApplyError) {
      if (wroteTarget && transaction && path && currentContent !== null) {
        return handlePostWriteFailure({
          error,
          path,
          currentContent,
          transaction,
          candidateId: input.candidateId || null,
        });
      }
      return {
        status: "requires-higher-authority",
        transactionId: input.transaction?.transactionId || null,
        filesChanged: [],
        applied: [],
        verification: [],
        warnings: [`source-apply-blocked:${error.code}`],
        requiresAuthority: [
          {
            reason: error.code,
            authority: ["operator-review"],
            behavior: "block-source-application",
          },
        ],
        residualRisks: ["source-application-blocked-before-file-write"],
      };
    }
    throw error;
  }
}

function handlePostWriteFailure({ error, path, currentContent, transaction, candidateId }) {
  try {
    writeTargetFile(path, currentContent, transaction.targetFile);
    return {
      status: "requires-higher-authority",
      transactionId: transaction.transactionId,
      filesChanged: [],
      applied: [],
      verification: [],
      warnings: [
        `source-apply-blocked:${error.code}`,
        `source-application-rolled-back:${transaction.targetFile}`,
      ],
      requiresAuthority: [
        {
          reason: error.code,
          authority: ["operator-review"],
          behavior: "block-source-application",
        },
      ],
      residualRisks: ["source-application-rolled-back-after-transaction-status-update-failed"],
    };
  } catch (rollbackError) {
    return {
      status: "requires-higher-authority",
      transactionId: transaction.transactionId,
      filesChanged: [transaction.targetFile],
      applied: [
        {
          candidateId,
          targetFile: transaction.targetFile,
          transactionId: transaction.transactionId,
          status: "manual-inspection-required",
        },
      ],
      verification: [
        {
          target: transaction.targetFile,
          command: transaction.verificationCommand,
        },
      ],
      warnings: [
        `source-apply-blocked:${error.code}`,
        `source-application-rollback-failed:${rollbackError.code || "TARGET_ROLLBACK_FAILED"}`,
      ],
      requiresAuthority: [
        {
          reason: error.code,
          authority: ["operator-review"],
          behavior: "inspect-unverified-source-application",
        },
      ],
      residualRisks: [
        "source-application-status-update-failed-after-file-write",
        "manual-inspection-required-for-hook-owned-edit",
      ],
    };
  }
}

export function applyTransactionToContent(content, transaction) {
  validateTransactionHashes(transaction);
  const markerResult = tryApplyManagedMarkerContent(content, transaction);
  if (markerResult.applied) {
    return markerResult.content;
  }
  return applyExactUnmarkedHunk(content, transaction);
}

function tryApplyManagedMarkerContent(content, transaction) {
  const startIndex = content.indexOf(START_MARKER);
  const endIndex = content.indexOf(END_MARKER);
  if (startIndex === -1 && endIndex === -1) {
    return {
      applied: false,
      content,
    };
  }
  if (
    startIndex === -1
    || endIndex === -1
    || startIndex > endIndex
    || content.indexOf(START_MARKER, startIndex + START_MARKER.length) !== -1
    || content.indexOf(END_MARKER, endIndex + END_MARKER.length) !== -1
  ) {
    throw new HookSourceApplyError("INVALID_MANAGED_MARKERS", "Managed anti-churn markers must exist exactly once and in order.");
  }

  const before = content.slice(0, startIndex + START_MARKER.length);
  const section = content.slice(startIndex + START_MARKER.length, endIndex);
  const after = content.slice(endIndex);
  const replacedSection = replaceUniqueSubstring(section, transaction.preimageHunk, transaction.plannedPostimageHunk, "MANAGED_PREIMAGE_NOT_UNIQUE");
  return {
    applied: true,
    content: `${before}${replacedSection}${after}`,
  };
}

function applyExactUnmarkedHunk(content, transaction) {
  const preimageLines = transaction.preimageHunk.split("\n");
  const nonEmptyLines = preimageLines.filter((line) => line.trim() !== "");
  const isBulletHunk = nonEmptyLines.length > 0 && nonEmptyLines.every((line) => /^\s*[-*]\s+/.test(line));
  if (transaction.preimageHunk.includes("\n\n")) {
    throw new HookSourceApplyError("BROAD_MARKDOWN_REWRITE", "Unmarked source apply requires one exact paragraph or bullet block.");
  }
  if (isBulletHunk) {
    return replaceUniqueLineBlock(content, preimageLines, transaction.plannedPostimageHunk.split("\n"));
  }
  return replaceUniqueParagraph(content, transaction.preimageHunk, transaction.plannedPostimageHunk);
}

function replaceUniqueSubstring(content, preimage, postimage, code) {
  const first = content.indexOf(preimage);
  if (first === -1) {
    throw new HookSourceApplyError("PREIMAGE_NOT_FOUND", "Transaction preimage was not found in the current target content.");
  }
  if (content.indexOf(preimage, first + preimage.length) !== -1) {
    throw new HookSourceApplyError(code, "Transaction preimage is not unique in the current target content.");
  }
  return `${content.slice(0, first)}${postimage}${content.slice(first + preimage.length)}`;
}

function replaceUniqueLineBlock(content, preimageLines, postimageLines) {
  const lines = content.split("\n");
  const matches = [];
  for (let index = 0; index <= lines.length - preimageLines.length; index += 1) {
    const window = lines.slice(index, index + preimageLines.length);
    if (window.join("\n") === preimageLines.join("\n")) {
      matches.push(index);
    }
  }
  if (matches.length === 0) {
    throw new HookSourceApplyError("PREIMAGE_NOT_FOUND", "Transaction bullet preimage was not found in the current target content.");
  }
  if (matches.length > 1) {
    throw new HookSourceApplyError("PREIMAGE_NOT_UNIQUE", "Transaction bullet preimage is not unique in the current target content.");
  }
  const start = matches[0];
  lines.splice(start, preimageLines.length, ...postimageLines);
  return lines.join("\n");
}

function replaceUniqueParagraph(content, preimage, postimage) {
  const parts = content.split(/(\n\s*\n)/);
  const matches = [];
  for (let index = 0; index < parts.length; index += 2) {
    if (parts[index].trim() === preimage.trim()) {
      matches.push(index);
    }
  }
  if (matches.length === 0) {
    throw new HookSourceApplyError("PREIMAGE_NOT_FOUND", "Transaction paragraph preimage was not found in the current target content.");
  }
  if (matches.length > 1) {
    throw new HookSourceApplyError("PREIMAGE_NOT_UNIQUE", "Transaction paragraph preimage is not unique in the current target content.");
  }
  parts[matches[0]] = postimage;
  return parts.join("");
}

function updateTransactionStatus(transactionPath, transaction, now) {
  const updated = {
    ...transaction,
    status: "verification-pending",
    updatedAt: normalizeTimestamp(now),
  };
  try {
    writeFileSync(transactionPath, `${JSON.stringify(updated, null, 2)}\n`, "utf8");
  } catch (error) {
    throw new HookSourceApplyError("TRANSACTION_STATUS_UPDATE_FAILED", `Unable to update hook transaction status: ${transactionPath}`, { cause: error });
  }
}

function readTargetFile(path, targetFile) {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    throw new HookSourceApplyError("TARGET_READ_FAILED", `Unable to read source apply target: ${targetFile}`, { cause: error });
  }
}

function writeTargetFile(path, content, targetFile) {
  try {
    writeFileSync(path, content, "utf8");
  } catch (error) {
    throw new HookSourceApplyError("TARGET_WRITE_FAILED", `Unable to write source apply target: ${targetFile}`, { cause: error });
  }
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

function validateTransactionHashes(transaction) {
  if (transaction.preimageHash !== sha256(transaction.preimageHunk)) {
    throw new HookSourceApplyError("PREIMAGE_HASH_MISMATCH", "Transaction preimage hash does not match its hunk.");
  }
  if (transaction.plannedPostimageHash !== sha256(transaction.plannedPostimageHunk)) {
    throw new HookSourceApplyError("POSTIMAGE_HASH_MISMATCH", "Transaction postimage hash does not match its hunk.");
  }
}

function validateAllowlistedTarget(targetFile) {
  if (!ALLOWLISTED_TARGETS.has(targetFile)) {
    throw new HookSourceApplyError("DISALLOWED_SOURCE_TARGET", `Source target is not allowlisted for apply-safe: ${targetFile}`);
  }
}

function requireString(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new HookSourceApplyError("INVALID_SOURCE_APPLY_INPUT", `Source apply ${field} is required.`);
  }
  return value;
}

function normalizeTimestamp(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    throw new HookSourceApplyError("INVALID_SOURCE_APPLY_TIMESTAMP", `Invalid source apply timestamp: ${value}`);
  }
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}
