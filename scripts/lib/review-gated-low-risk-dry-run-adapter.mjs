import { evaluateReviewGatedLowRiskAutomation } from "./review-gated-low-risk-automation.mjs";

const ACTION_KEY_PATTERN = /(?:execute|command|provider|livemodel|worker|github|git(?:push|commit|merge|checkout|reset)|merge|cleanup|mutation|dispatch|process|shell|spawn|network|http|request|write|delete|remove|prune|destroy|intent)/i;
const ACTION_VALUE_PATTERN = /\b(?:execute|run|shell|spawn|network|http|request|write|delete|remove|prune|destroy|push|commit|reset|checkout|provider(?:\s+call)?|live[- ]model|worker(?:\s+launch)?|git(?:hub)?\s+(?:push|commit|merge|checkout|reset)|merge|cleanup|mutat(?:e|ion)|dispatch)\b/i;
const REFERENCE_ACTION_PATTERN = /\b(?:execute|run|shell|spawn|write|delete|remove|prune|destroy|http|request|provider\s+call|live[- ]model|worker\s+launch|git(?:hub)?\s+(?:push|commit|merge|checkout|reset)|mutat(?:e|ion)|dispatch)\b/i;
const REPORT_ONLY_OPERATION_PREFIXES = [
  "documentation",
  "runbook",
  "test-hardening",
  "deterministic-tooling",
  "refactoring",
  "maintenance",
  "worktree",
  "focused-verification",
  "code-review",
  "low-risk-maintenance",
];

/**
 * Adapt supplied workspace and delivery-readiness evidence into the
 * report-only evaluator. This is a pure dry-run projection: it executes no
 * commands and has no provider, worker, GitHub, merge, or cleanup path.
 */
export function evaluateReviewGatedLowRiskDryRun(input = {}, options = {}) {
  const source = input && typeof input === "object" ? input : {};
  const opts = options && typeof options === "object" ? options : {};
  const workspace = source.workspaceEvidence && typeof source.workspaceEvidence === "object"
    ? source.workspaceEvidence
    : {};
  const readiness = source.deliveryReadiness && typeof source.deliveryReadiness === "object"
    ? source.deliveryReadiness
    : {};
  const integrationBlockers = [];
  const actionAttempts = findActionAttempts(source);
  if (actionAttempts.length) {
    integrationBlockers.push(`mutation or external action intent rejected: ${actionAttempts.join(", ")}`);
  }
  if (!Object.keys(source.workspaceEvidence || {}).length) {
    integrationBlockers.push("workspace evidence report is missing");
  }
  if (!Object.keys(source.deliveryReadiness || {}).length) {
    integrationBlockers.push("delivery-readiness report is missing");
  }

  const now = opts.now ?? source.now;
  const requestedOperation = Object.hasOwn(source, "operation") ? source.operation : "low-risk-maintenance";
  const normalizedOperation = typeof requestedOperation === "string"
    ? requestedOperation.toLowerCase().replace(/[\s_/:]+/g, "-")
    : "";
  if (!REPORT_ONLY_OPERATION_PREFIXES.some((prefix) => normalizedOperation === prefix || normalizedOperation.startsWith(`${prefix}-`))) {
    integrationBlockers.push("operation is not an allowlisted report-only class");
  }
  const derived = {
    operation: requestedOperation,
    review: source.review,
    state: {
      ...workspace,
      changedFiles: workspace.changedFiles,
      allowlistedFiles: workspace.allowlistedFiles,
      disallowedFiles: mergeEvidenceLists(workspace.disallowedFiles, readiness.disallowedFiles),
      highRiskExclusions: mergeEvidenceLists(workspace.highRiskExclusions, readiness.highRiskExclusions),
      exactHead: readiness.exactHead,
      statusChecks: readiness.statusChecks,
      reviewThreads: readiness.reviewThreads,
      rollback: readiness.rollback,
      rollbackPath: readiness.rollbackPath,
      evidence: readiness.evidence,
      cleanupWithinNamedLane: readiness.cleanupWithinNamedLane,
    },
    authority: readiness.authority,
  };
  const evaluation = evaluateReviewGatedLowRiskAutomation(derived, { now });
  const blockers = [...evaluation.blockers, ...integrationBlockers];
  const status = blockers.length ? "hold" : evaluation.status;

  return {
    ...evaluation,
    schemaVersion: 1,
    mode: "dry-run-integration",
    status,
    eligible: status === "eligible",
    blockers: unique(blockers),
    execution: {
      dryRun: true,
      commandsExecuted: false,
      providerCalls: false,
      liveModelCalls: false,
      workerLaunch: false,
      gitHubMutation: false,
      merge: false,
      cleanup: false,
      mutation: "none",
    },
    authorityDecision: {
      ...evaluation.authorityDecision,
      decision: status === "eligible" ? "eligible-dry-run-report-only" : "hold",
      allowed: false,
      blockedReasons: unique(blockers),
      metadataOnly: true,
    },
    metadataOnly: true,
    rawPayloadRetained: false,
  };
}

function findActionAttempts(value, path = "input") {
  if (!value || typeof value !== "object") return [];
  const attempts = [];
  for (const [key, nested] of Object.entries(value)) {
    const currentPath = `${path}.${key}`;
    const evidenceKey = ["exactHead", "statusChecks", "reviewThreads", "rollback", "rollbackPath", "cleanupWithinNamedLane"].includes(key);
    const referenceKey = /(?:ref|summary|evidence)$/i.test(key);
    const normalizedKey = key.replace(/[_-]/g, "");
    const actionKey = !evidenceKey && !referenceKey && ACTION_KEY_PATTERN.test(normalizedKey);
    const actionValue = (key === "operation" || key === "shell" || key === "intent") && typeof nested === "string" && ACTION_VALUE_PATTERN.test(nested);
    const referenceAction = referenceKey && typeof nested === "string" && REFERENCE_ACTION_PATTERN.test(nested);
    if ((actionKey || actionValue || referenceAction) && !isAllowedNoActionValue(nested)) {
      attempts.push(currentPath);
    }
    if (nested && typeof nested === "object") attempts.push(...findActionAttempts(nested, currentPath));
  }
  return [...new Set(attempts)].slice(0, 10);
}

function mergeEvidenceLists(...values) {
  const present = values.filter((value) => value !== undefined);
  if (present.some((value) => !Array.isArray(value))) return present.find((value) => !Array.isArray(value));
  return present.flat();
}

function isAllowedNoActionValue(value) {
  return value === false || value === null || value === "none" || value === "" || (Array.isArray(value) && value.length === 0);
}

function unique(values) {
  return [...new Set(values)];
}
