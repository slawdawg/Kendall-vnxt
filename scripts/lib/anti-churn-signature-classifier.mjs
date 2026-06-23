import { recordChurnEvent } from "./anti-churn-event-writer.mjs";

const DEFAULT_PHASE = "verification";
const TOOL_CHURN_RCA = "docs/workflows/tool-churn-rca.md";

export function classifyChurnFailure(observation = {}) {
  const normalized = normalizeObservation(observation);

  if (isProductAssertionFailure(normalized)) {
    return noEvent("product-assertion-failure");
  }

  const sandboxEvent = classifySandboxBoundary(normalized);
  if (sandboxEvent) {
    return recordEvent(sandboxEvent);
  }

  const repeatedEvent = classifyRepeatedFailure(normalized);
  if (repeatedEvent) {
    return recordEvent(repeatedEvent);
  }

  return noEvent("insufficient-repeated-evidence");
}

export function recordClassifiedChurnEvent(observation = {}, options = {}) {
  const classification = classifyChurnFailure(observation);
  if (classification.status !== "record-event") {
    return classification;
  }
  return recordChurnEvent(classification.event, options);
}

function classifySandboxBoundary(observation) {
  if (observation.timedOutBeforeOutput) {
    return buildEvent(observation, {
      failureClass: "sandbox",
      signature: "sandbox runner timeout before output",
      evidenceSummary: "Sandbox runner timed out before command output; the result is inconclusive.",
      wrongRetryPattern: "retrying the same command shape after a pre-output sandbox timeout",
      nextSafeAction: "confirm the sandbox runner with a simple serialized no-op such as `pwd`, then retry once with a simpler command shape",
    });
  }

  if (!observation.readOnlyVerification) {
    return null;
  }

  const text = observationText(observation);
  if (text.includes(".git/worktrees") && isReadOnlyBoundary(text)) {
    return buildReadOnlyEvent(observation, ".git/worktrees read-only filesystem boundary", ".git/worktrees");
  }

  if ((text.includes("$home/.cache/uv") || text.includes(".cache/uv")) && isReadOnlyBoundary(text)) {
    return buildReadOnlyEvent(observation, "$HOME/.cache/uv read-only filesystem boundary", "$HOME/.cache/uv");
  }

  if ((text.includes("pnpm temp") || text.includes("managed-worktree pnpm") || text.includes("pnpm")) && isReadOnlyBoundary(text)) {
    return buildReadOnlyEvent(observation, "managed-worktree pnpm temp read-only filesystem boundary", "managed-worktree pnpm temp");
  }

  return null;
}

function classifyRepeatedFailure(observation) {
  if (!hasRepeatedEvidence(observation)) {
    return null;
  }

  const text = observationText(observation);
  const kind = observation.failureKind;

  if (kind === "quoting" || /unexpected eof|syntax error|parser error|unterminated|bad substitution/.test(text)) {
    return buildRepeatedEvent(observation, "tool-resolution", "shell quoting/parser error", "retrying the same quoting or parser-error command shape");
  }

  if (kind === "missing-tool" || /command not found|no such file or directory|not found/.test(text)) {
    return buildRepeatedEvent(observation, "tool-resolution", "missing tool or path", "retrying without resolving the missing tool or path");
  }

  if (kind === "permission" || /permission denied|eacces/.test(text)) {
    return buildRepeatedEvent(observation, "permission", "permission denied", "retrying without changing permissions or authority");
  }

  if (kind === "stale-state" || /stale/.test(text)) {
    return buildRepeatedEvent(observation, "stale-state", "stale state", "retrying while stale local state still blocks progress");
  }

  if (kind === "sandbox") {
    return buildRepeatedEvent(observation, "sandbox", "repeated sandbox failure", "retrying the same sandbox-blocked command without changing authority or command shape");
  }

  if (observation.rcaClassified || kind === "environment" || kind === "tool-resolution") {
    const signature = observation.rcaClassified
      ? `RCA-classified ${kind || "environment"} failure`
      : `repeated ${kind} failure`;
    return buildRepeatedEvent(
      observation,
      kind === "tool-resolution" ? "tool-resolution" : "environment",
      signature,
      "retrying after RCA-classified churn without following the RCA stop line",
    );
  }

  return null;
}

function buildReadOnlyEvent(observation, signature, evidenceTarget) {
  return buildEvent(observation, {
    failureClass: "sandbox",
    signature,
    evidenceSummary: `${evidenceTarget} hit a read-only filesystem boundary while running a read-only verification command.`,
    wrongRetryPattern: "retrying the same read-only verification command inside the sandbox after a filesystem boundary",
    nextSafeAction: `request approval to rerun the exact same read-only command outside the sandbox: ${observation.command}`,
  });
}

function buildRepeatedEvent(observation, failureClass, signature, wrongRetryPattern) {
  return buildEvent(observation, {
    failureClass,
    signature,
    evidenceSummary: `${signature} repeated for command: ${observation.command}.`,
    wrongRetryPattern,
    nextSafeAction: `stop blind retries and route through ${TOOL_CHURN_RCA}`,
  });
}

function buildEvent(observation, fields) {
  return {
    laneId: observation.laneId,
    phase: observation.phase || DEFAULT_PHASE,
    failureClass: fields.failureClass,
    signature: fields.signature,
    attemptedCommand: observation.command || observation.toolPath,
    evidenceSummary: fields.evidenceSummary,
    wrongRetryPattern: fields.wrongRetryPattern,
    nextSafeAction: fields.nextSafeAction,
    createdAt: observation.createdAt || new Date().toISOString(),
    metadata: {
      wrongRetryPrevented: true,
    },
  };
}

function normalizeObservation(observation) {
  return {
    ...observation,
    laneId: observation.laneId || observation.lane || "unknown-lane",
    phase: observation.phase || DEFAULT_PHASE,
    command: observation.command || observation.toolPath || "unknown-command",
    attemptCount: Number(observation.attemptCount || 0),
    priorFailureCount: Number(observation.priorFailureCount || 0),
    output: observation.output || "",
    error: observation.error || "",
    failureKind: observation.failureKind || "",
    rcaClassified: Boolean(observation.rcaClassified),
    readOnlyVerification: Boolean(observation.readOnlyVerification),
    timedOutBeforeOutput: Boolean(observation.timedOutBeforeOutput),
    createdAt: observation.createdAt,
  };
}

function recordEvent(event) {
  return {
    status: "record-event",
    event,
  };
}

function noEvent(reason) {
  return {
    status: "no-event",
    reason,
  };
}

function isProductAssertionFailure(observation) {
  const text = observationText(observation);
  return observation.failureKind === "product-assertion" || /assertionerror|expected .* to|assert\./.test(text);
}

function hasRepeatedEvidence(observation) {
  return observation.attemptCount >= 2 || observation.priorFailureCount > 0 || observation.rcaClassified;
}

function observationText(observation) {
  return `${observation.output}\n${observation.error}\n${observation.failureKind}`.toLowerCase();
}

function isReadOnlyBoundary(text) {
  return /read-only file system|erofs/.test(text);
}
