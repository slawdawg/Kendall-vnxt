import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";

import {
  WorkspaceStateStorageError,
  assertWorkspaceStateStorage,
} from "./codex-workspace-state.mjs";

const SCHEMA_VERSION = 1;
const MAX_TRANSACTION_BYTES = 64 * 1024;
const INCOMPLETE_STATUSES = new Set([
  "prepared",
  "applying",
  "verification-pending",
  "rollback-pending",
]);

export class HookTransactionStoreError extends Error {
  constructor(code, message, options = {}) {
    super(`${code}: ${message}`, options);
    this.name = "HookTransactionStoreError";
    this.code = code;
    if (options.details) {
      this.details = options.details;
    }
  }
}

export function prepareHookTransaction(input = {}) {
  const lane = validateLane(input.lane);
  const candidate = input.candidate && typeof input.candidate === "object" ? input.candidate : {};
  const targetFile = validateTargetFile(input.targetFile || candidate.targetFile || candidate.durableTarget || candidate.verificationPlan?.target);
  const targetContent = requireString(input.targetContent, "targetContent");
  const preimageHunk = normalizeHunk(input.preimageHunk, "preimageHunk");
  const plannedPostimageHunk = normalizeHunk(input.plannedPostimageHunk, "plannedPostimageHunk");
  validateDeterministicPreimage(targetContent, preimageHunk);

  const createdAt = normalizeTimestamp(input.now);
  const preimageHash = hashHunk(preimageHunk);
  const plannedPostimageHash = hashHunk(plannedPostimageHunk);
  const transactionId = input.transactionId
    ? validateTransactionId(input.transactionId)
    : buildTransactionId({
      lane,
      targetFile,
      preimageHash,
      plannedPostimageHash,
      createdAt,
    });

  return {
    schemaVersion: SCHEMA_VERSION,
    transactionId,
    lane,
    targetFile,
    preimageHunk,
    preimageHash,
    plannedPostimageHunk,
    plannedPostimageHash,
    verificationCommand: candidate.verificationPlan?.command || candidate.verification || input.verificationCommand || null,
    authorityDecision: input.authorityDecision || {
      autonomyTier: candidate.autonomyTier || "tier-1-safe-automatic",
      reason: "apply-safe-gates-passed",
    },
    status: input.status || "prepared",
    createdAt,
    updatedAt: createdAt,
  };
}

export function prepareAndPersistHookTransaction(input = {}, options = {}) {
  const transaction = prepareHookTransaction(input);
  const transactionPath = persistHookTransaction(transaction, options);
  return {
    status: "prepared",
    transaction,
    transactionId: transaction.transactionId,
    transactionPath,
    candidateId: input.candidate?.candidateId || null,
    warnings: [`hook-transaction-prepared:${transaction.transactionId}`],
    residualRisks: ["source-application-still-deferred-until-later-epic-3-story"],
    requiresAuthority: [],
  };
}

export function persistHookTransaction(transaction, options = {}) {
  const normalized = normalizeTransaction(transaction);
  const { root } = transactionStorageRoot(options);
  const laneDir = join(root, "anti-churn-transactions", normalized.lane);
  const transactionPath = join(laneDir, `${normalized.transactionId}.json`);
  const serialized = `${JSON.stringify(normalized, null, 2)}\n`;
  if (Buffer.byteLength(serialized, "utf8") > MAX_TRANSACTION_BYTES) {
    throw new HookTransactionStoreError("TRANSACTION_TOO_LARGE", "Serialized hook transaction exceeds the 64 KiB limit.");
  }
  mkdirSync(laneDir, { recursive: true });
  writeFileSync(transactionPath, serialized, { encoding: "utf8", flag: "wx" });
  return transactionPath;
}

export function readPendingHookTransactions(input = {}, options = {}) {
  const lane = validateLane(input.lane);
  const { root } = transactionStorageRoot(options);
  const laneDir = join(root, "anti-churn-transactions", lane);
  if (!existsSync(laneDir)) {
    return {
      status: "none",
      lane,
      transactions: [],
      warnings: [],
    };
  }

  const transactions = readdirSync(laneDir)
    .filter((entry) => entry.endsWith(".json"))
    .map((entry) => readTransactionFile(join(laneDir, entry)))
    .filter((transaction) => INCOMPLETE_STATUSES.has(transaction.status));
  return {
    status: transactions.length > 0 ? "pending" : "none",
    lane,
    transactions,
    warnings: [],
  };
}

export function inspectPendingHookTransactions(input = {}, options = {}) {
  const pending = readPendingHookTransactions(input, options);
  if (pending.transactions.length === 0) {
    return {
      status: "none",
      lane: pending.lane,
      transactions: [],
      warnings: [],
      requiresAuthority: [],
      residualRisks: [],
    };
  }

  const inspected = pending.transactions.map((transaction) => {
    const targetContent = readTargetContent(transaction.targetFile, options);
    let inspection = "manual-inspection-required";
    if (targetContent.includes(transaction.plannedPostimageHunk)) {
      inspection = "postimage-present";
    } else if (targetContent.includes(transaction.preimageHunk)) {
      inspection = "preimage-present";
    }
    return {
      ...transaction,
      inspection,
    };
  });
  const needsManual = inspected.some((transaction) => transaction.inspection === "manual-inspection-required");
  return {
    status: needsManual ? "manual-inspection-required" : "pending-transaction",
    lane: pending.lane,
    transactions: inspected,
    warnings: inspected.map((transaction) => `pending-hook-transaction:${transaction.transactionId}:${transaction.inspection}`),
    requiresAuthority: needsManual
      ? [
        {
          reason: "manual-inspection-required",
          authority: ["operator-review"],
          behavior: "block-source-application",
        },
      ]
      : [],
    residualRisks: needsManual
      ? ["pending-hook-transaction-current-hunk-does-not-match-recorded-preimage-or-postimage"]
      : ["pending-hook-transaction-must-complete-before-new-transaction"],
  };
}

export function prepareApplySafeTransactionPreflight(input = {}, options = {}) {
  const lane = validateLane(input.lane);
  try {
    const pending = inspectPendingHookTransactions({ lane }, options);
    if (pending.status !== "none") {
      return {
        status: pending.status,
        transactionId: null,
        warnings: pending.warnings,
        requiresAuthority: pending.requiresAuthority,
        residualRisks: pending.residualRisks,
      };
    }

    const plannedUpdates = Array.isArray(input.plannedSourceUpdates) ? input.plannedSourceUpdates : [];
    if (plannedUpdates.length === 0) {
      return {
        status: "not-requested",
        transactionId: null,
        warnings: [],
        requiresAuthority: [],
        residualRisks: [],
      };
    }

    const candidates = Array.isArray(input.candidates) ? input.candidates : [];
    const plan = findPlannedUpdate(plannedUpdates, candidates);
    if (!plan) {
      return {
        status: "not-requested",
        transactionId: null,
        warnings: ["planned-source-update-without-matching-candidate"],
        requiresAuthority: [],
        residualRisks: ["source-application-blocked-without-matching-guidance-candidate"],
      };
    }

    const targetFile = validateTargetFile(plan.targetFile || plan.durableTarget || plan.verificationPlan?.target);
    return prepareAndPersistHookTransaction({
      lane,
      candidate: plan.candidate,
      targetFile,
      targetContent: readTargetContent(targetFile, options),
      preimageHunk: plan.preimageHunk,
      plannedPostimageHunk: plan.plannedPostimageHunk,
      authorityDecision: plan.authorityDecision,
      now: input.now,
    }, options);
  } catch (error) {
    if (error instanceof HookTransactionStoreError) {
      return {
        status: "requires-higher-authority",
        transactionId: null,
        warnings: [`hook-transaction-blocked:${error.code}`],
        requiresAuthority: [
          {
            reason: error.code,
            authority: ["operator-review"],
            behavior: "block-source-application",
          },
        ],
        residualRisks: ["source-application-blocked-without-persisted-hook-transaction"],
      };
    }
    throw error;
  }
}

function findPlannedUpdate(plannedUpdates, candidates) {
  for (const update of plannedUpdates) {
    const candidate = candidates.find((item) => {
      return item.candidateId === update.candidateId
        || item.durableTarget === update.targetFile
        || item.targetFile === update.targetFile
        || item.verificationPlan?.target === update.targetFile;
    });
    if (candidate) {
      return {
        ...update,
        candidate,
      };
    }
  }
  return null;
}

function transactionStorageRoot(options = {}) {
  try {
    const { state } = assertWorkspaceStateStorage({ stateRoot: options.stateRoot }, {
      repoRoot: options.repoRoot,
      cwd: options.cwd,
      env: options.env,
    });
    return state;
  } catch (error) {
    if (error instanceof WorkspaceStateStorageError) {
      throw new HookTransactionStoreError("UNSAFE_TRANSACTION_STORAGE", error.message, { cause: error });
    }
    throw error;
  }
}

function readTransactionFile(path) {
  const stats = statSync(path);
  if (stats.size > MAX_TRANSACTION_BYTES) {
    throw new HookTransactionStoreError("TRANSACTION_TOO_LARGE", `Hook transaction file exceeds the 64 KiB limit: ${path}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new HookTransactionStoreError("CORRUPT_TRANSACTION_STORE", `Hook transaction file is not valid JSON: ${path}`, { cause: error });
  }
  return normalizeTransaction(parsed);
}

function normalizeTransaction(transaction = {}) {
  const normalized = {
    schemaVersion: transaction.schemaVersion,
    transactionId: validateTransactionId(transaction.transactionId),
    lane: validateLane(transaction.lane),
    targetFile: validateTargetFile(transaction.targetFile),
    preimageHunk: normalizeHunk(transaction.preimageHunk, "preimageHunk"),
    preimageHash: validateHash(transaction.preimageHash, "preimageHash"),
    plannedPostimageHunk: normalizeHunk(transaction.plannedPostimageHunk, "plannedPostimageHunk"),
    plannedPostimageHash: validateHash(transaction.plannedPostimageHash, "plannedPostimageHash"),
    verificationCommand: transaction.verificationCommand || null,
    authorityDecision: transaction.authorityDecision && typeof transaction.authorityDecision === "object"
      ? transaction.authorityDecision
      : {},
    status: validateStatus(transaction.status),
    createdAt: normalizeTimestamp(transaction.createdAt),
    updatedAt: normalizeTimestamp(transaction.updatedAt || transaction.createdAt),
  };
  if (normalized.schemaVersion !== SCHEMA_VERSION) {
    throw new HookTransactionStoreError("UNSUPPORTED_TRANSACTION_SCHEMA", `Unsupported hook transaction schema version: ${transaction.schemaVersion}`);
  }
  if (normalized.preimageHash !== hashHunk(normalized.preimageHunk)) {
    throw new HookTransactionStoreError("PREIMAGE_HASH_MISMATCH", "Hook transaction preimage hash does not match the stored hunk.");
  }
  if (normalized.plannedPostimageHash !== hashHunk(normalized.plannedPostimageHunk)) {
    throw new HookTransactionStoreError("POSTIMAGE_HASH_MISMATCH", "Hook transaction postimage hash does not match the stored hunk.");
  }
  return normalized;
}

function readTargetContent(targetFile, options = {}) {
  const snapshots = options.sourceSnapshots && typeof options.sourceSnapshots === "object"
    ? options.sourceSnapshots
    : {};
  if (Object.prototype.hasOwnProperty.call(snapshots, targetFile)) {
    return String(snapshots[targetFile]);
  }
  const path = resolve(options.cwd || process.cwd(), targetFile);
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    throw new HookTransactionStoreError("TARGET_READ_FAILED", `Unable to read transaction target file: ${targetFile}`, { cause: error });
  }
}

function validateDeterministicPreimage(targetContent, preimageHunk) {
  const preimageLines = preimageHunk.split("\n").filter((line) => line.trim() !== "");
  const preimageIsWholeMultiLineTarget = preimageHunk.trim() === targetContent.trim() && preimageLines.length > 1;
  if (preimageHunk.includes("\n\n") || preimageIsWholeMultiLineTarget) {
    throw new HookTransactionStoreError("BROAD_MARKDOWN_REWRITE", "Hook transactions require one exact paragraph or bullet preimage, not a broad markdown rewrite.");
  }
  const matches = countExactPreimageBlocks(targetContent, preimageHunk);
  if (matches === 0) {
    throw new HookTransactionStoreError("PREIMAGE_NOT_FOUND", "Hook transaction preimage hunk was not found in the target content.");
  }
  if (matches > 1) {
    throw new HookTransactionStoreError("PREIMAGE_NOT_UNIQUE", "Hook transaction preimage hunk is not unique in the target content.");
  }
}

function countExactPreimageBlocks(targetContent, preimageHunk) {
  const preimageLines = preimageHunk.split("\n");
  const nonEmptyLines = preimageLines.filter((line) => line.trim() !== "");
  const isBulletHunk = nonEmptyLines.length > 0 && nonEmptyLines.every((line) => /^\s*[-*]\s+/.test(line));
  if (isBulletHunk) {
    return countLineBlockOccurrences(targetContent, preimageLines);
  }
  return targetContent
    .split(/\n\s*\n/)
    .filter((paragraph) => paragraph.trim() === preimageHunk.trim())
    .length;
}

function countLineBlockOccurrences(targetContent, blockLines) {
  const targetLines = targetContent.split("\n");
  let count = 0;
  for (let index = 0; index <= targetLines.length - blockLines.length; index += 1) {
    const window = targetLines.slice(index, index + blockLines.length);
    if (window.join("\n") === blockLines.join("\n")) {
      count += 1;
    }
  }
  return count;
}

function validateLane(value) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new HookTransactionStoreError("INVALID_LANE", "Lane id is required for hook transaction storage.");
  }
  const lane = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(lane) || lane.includes("..")) {
    throw new HookTransactionStoreError("INVALID_LANE", `Lane id is not safe for hook transaction storage: ${lane}`);
  }
  return lane;
}

function validateTransactionId(value) {
  if (typeof value !== "string" || !/^hooktxn-[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value) || value.includes("..")) {
    throw new HookTransactionStoreError("INVALID_TRANSACTION_ID", `Transaction id is not safe for hook transaction storage: ${value}`);
  }
  return value;
}

function validateTargetFile(value) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new HookTransactionStoreError("INVALID_TARGET_FILE", "Transaction target file is required.");
  }
  const targetFile = value.trim();
  if (targetFile.startsWith("/") || targetFile.includes("..") || targetFile.includes("\0")) {
    throw new HookTransactionStoreError("INVALID_TARGET_FILE", `Transaction target file must be a safe repo-relative path: ${targetFile}`);
  }
  return targetFile;
}

function validateHash(value, field) {
  if (typeof value !== "string" || !/^sha256:[a-f0-9]{64}$/.test(value)) {
    throw new HookTransactionStoreError("INVALID_TRANSACTION_HASH", `Invalid ${field}: ${value}`);
  }
  return value;
}

function validateStatus(value) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new HookTransactionStoreError("INVALID_TRANSACTION_STATUS", "Hook transaction status is required.");
  }
  return value.trim();
}

function normalizeHunk(value, field) {
  const hunk = requireString(value, field).trim();
  if (hunk === "") {
    throw new HookTransactionStoreError("INVALID_TRANSACTION_HUNK", `Hook transaction ${field} cannot be blank.`);
  }
  return hunk;
}

function requireString(value, field) {
  if (typeof value !== "string") {
    throw new HookTransactionStoreError("INVALID_TRANSACTION_INPUT", `Hook transaction ${field} must be a string.`);
  }
  return value;
}

function normalizeTimestamp(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    throw new HookTransactionStoreError("INVALID_TRANSACTION_TIMESTAMP", `Invalid hook transaction timestamp: ${value}`);
  }
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function hashHunk(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function buildTransactionId({ lane, targetFile, preimageHash, plannedPostimageHash, createdAt }) {
  const timestamp = createdAt.replace(/[-:]/g, "");
  const hash = createHash("sha256")
    .update([lane, targetFile, preimageHash, plannedPostimageHash, createdAt].join("\0"))
    .digest("hex")
    .slice(0, 12);
  return `hooktxn-${timestamp}-${hash}`;
}
