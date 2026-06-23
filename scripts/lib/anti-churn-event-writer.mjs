import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  WorkspaceStateStorageError,
  assertWorkspaceStateStorage,
} from "./codex-workspace-state.mjs";

const SCHEMA_VERSION = 1;
const MAX_EVIDENCE_BYTES = 8 * 1024;
const MAX_EVENT_BYTES = 32 * 1024;
const MAX_STORE_BYTES = 5 * 1024 * 1024;
const OPTIONAL_FIELDS = new Set([
  "wrongRetryPrevented",
  "autonomyTier",
  "sourceFile",
  "sourceLine",
  "prNumber",
  "checkName",
  "reviewThreadId",
  "cleanupStep",
  "owner",
  "verification",
  "durableUpdate",
  "outcome",
]);
const REQUIRED_FIELDS = [
  "phase",
  "failureClass",
  "signature",
  "attemptedCommand",
  "evidenceSummary",
  "wrongRetryPattern",
  "nextSafeAction",
  "createdAt",
];

export class ChurnEventWriterError extends Error {
  constructor(code, message, options = {}) {
    super(message, options);
    this.name = "ChurnEventWriterError";
    this.code = code;
    if (options.details) {
      this.details = options.details;
    }
  }
}

export function recordChurnEvent(input, options = {}) {
  const event = normalizeChurnEvent(input);
  const serializedEvent = serializeEvent(event);
  const { state, proof } = assertEventStorage(options);
  const storeDir = join(state.root, "churn-events");
  const globalEventStore = join(storeDir, "churn-events.jsonl");
  const eventStore = join(storeDir, `${event.lane}.jsonl`);

  const warnings = [];
  const globalHasEvent = storeContainsEventId(globalEventStore, event.eventId);
  const laneHasEvent = storeContainsEventId(eventStore, event.eventId);
  if (globalHasEvent && laneHasEvent) {
    warnings.push("duplicate-event-id");
    return {
      status: "duplicate",
      event,
      eventId: event.eventId,
      eventStore,
      globalEventStore,
      warnings,
      storageProof: proof,
    };
  }

  mkdirSync(storeDir, { recursive: true });
  if (globalHasEvent || laneHasEvent) {
    warnings.push("duplicate-event-id");
  }
  if (!globalHasEvent) {
    appendJsonl(globalEventStore, serializedEvent);
  }
  if (!laneHasEvent) {
    appendJsonl(eventStore, serializedEvent);
  }

  return {
    status: "recorded",
    event,
    eventId: event.eventId,
    eventStore,
    globalEventStore,
    warnings,
    storageProof: proof,
  };
}

export function readChurnEventInputFile(path) {
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch (error) {
    throw new ChurnEventWriterError("EVENT_FILE_READ_FAILED", `Unable to read event file: ${path}`, { cause: error });
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new ChurnEventWriterError("INVALID_EVENT_JSON", `Event file is not valid JSON: ${path}`, { cause: error });
  }
}

function normalizeChurnEvent(input = {}) {
  const lane = normalizeLane(input.laneId || input.lane);
  const event = {
    schemaVersion: SCHEMA_VERSION,
    eventId: "",
    lane,
  };

  for (const field of REQUIRED_FIELDS) {
    const value = input[field];
    if (typeof value !== "string" || value.trim() === "") {
      throw new ChurnEventWriterError("MISSING_EVENT_FIELD", `Churn event field is required: ${field}`, {
        details: { field },
      });
    }
    event[field] = field === "evidenceSummary" ? redactEvidence(value) : value.trim();
  }

  validateCreatedAt(event.createdAt);
  event.eventId = input.eventId ? validateEventId(input.eventId) : buildStableEventId(event);

  const metadata = input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata)
    ? input.metadata
    : {};
  for (const field of OPTIONAL_FIELDS) {
    const value = input[field] ?? metadata[field];
    if (value === undefined || value === null) {
      continue;
    }
    event[field] = normalizeOptionalValue(field, value);
  }

  return event;
}

function normalizeLane(value) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ChurnEventWriterError("INVALID_LANE", "Lane id is required.");
  }
  const lane = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(lane) || lane.includes("..")) {
    throw new ChurnEventWriterError("INVALID_LANE", `Lane id is not safe for local event storage: ${lane}`);
  }
  return lane;
}

function validateEventId(value) {
  if (typeof value !== "string" || !/^churn-[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value) || value.includes("..")) {
    throw new ChurnEventWriterError("INVALID_EVENT_ID", `Event id is not safe for local event storage: ${value}`);
  }
  return value;
}

function buildStableEventId(event) {
  const createdAt = validateCreatedAt(event.createdAt);
  const timestamp = createdAt
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z")
    .replace(/[-:]/g, "")
    .toLowerCase();
  const hash = createHash("sha256")
    .update([event.lane, event.phase, event.failureClass, event.signature, event.attemptedCommand].join("\0"))
    .digest("hex")
    .slice(0, 12);
  return `churn-${timestamp}-${hash}`;
}

function validateCreatedAt(value) {
  const createdAt = new Date(value);
  if (Number.isNaN(createdAt.getTime())) {
    throw new ChurnEventWriterError("INVALID_CREATED_AT", `createdAt is not a valid timestamp: ${value}`);
  }
  return createdAt;
}

function normalizeOptionalValue(field, value) {
  if (typeof value === "boolean" || typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    return field === "sourceFile" ? value.trim() : redactEvidence(value.trim());
  }
  return redactEvidence(JSON.stringify(value));
}

function redactEvidence(value) {
  let redacted = String(value)
    .replace(
      /\b(provider payload|raw (?:user )?prompt|raw (?:model )?completion|reasoning trace|hidden reasoning)\b[^.;\n]*/gi,
      "[REDACTED:UNSAFE_EVIDENCE]",
    )
    .replace(/sk-proj-[A-Za-z0-9_-]{16,}/g, "[REDACTED:OPENAI_KEY]")
    .replace(/sk-[A-Za-z0-9_-]{16,}/g, "[REDACTED:OPENAI_KEY]")
    .replace(/\b(password|passwd|token|api[_-]?key)\s*=\s*[^;\s,]+/gi, (_match, label) => `[REDACTED:${label.toUpperCase()}]`);

  if (Buffer.byteLength(redacted, "utf8") > MAX_EVIDENCE_BYTES) {
    redacted = truncateUtf8(redacted, MAX_EVIDENCE_BYTES - Buffer.byteLength(" [TRUNCATED]", "utf8")) + " [TRUNCATED]";
  }
  return redacted;
}

function truncateUtf8(value, maxBytes) {
  let output = "";
  let bytes = 0;
  for (const char of value) {
    const charBytes = Buffer.byteLength(char, "utf8");
    if (bytes + charBytes > maxBytes) {
      break;
    }
    output += char;
    bytes += charBytes;
  }
  return output;
}

function serializeEvent(event) {
  const serialized = `${JSON.stringify(event)}\n`;
  if (Buffer.byteLength(serialized, "utf8") > MAX_EVENT_BYTES) {
    throw new ChurnEventWriterError("EVENT_TOO_LARGE", "Serialized churn event exceeds the 32 KiB limit.");
  }
  return serialized;
}

function assertEventStorage(options) {
  try {
    return assertWorkspaceStateStorage({ stateRoot: options.stateRoot }, {
      repoRoot: options.repoRoot,
      cwd: options.cwd,
      env: options.env,
    });
  } catch (error) {
    if (error instanceof WorkspaceStateStorageError) {
      throw new ChurnEventWriterError("UNSAFE_EVENT_STORAGE", error.message, { cause: error });
    }
    throw error;
  }
}

function appendJsonl(path, line) {
  const existingBytes = existsSync(path) ? statSync(path).size : 0;
  if (existingBytes + Buffer.byteLength(line, "utf8") > MAX_STORE_BYTES) {
    throw new ChurnEventWriterError("EVENT_STORE_ROTATION_REQUIRED", `Event store would exceed 5 MiB: ${path}`);
  }
  appendFileSync(path, line, "utf8");
}

function storeContainsEventId(path, eventId) {
  if (!existsSync(path)) {
    return false;
  }
  const lines = readFileSync(path, "utf8").split("\n").filter(Boolean);
  for (const line of lines) {
    try {
      if (JSON.parse(line).eventId === eventId) {
        return true;
      }
    } catch {
      throw new ChurnEventWriterError("CORRUPT_EVENT_STORE", `Event store contains invalid JSONL: ${path}`);
    }
  }
  return false;
}
