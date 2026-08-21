import { createHash } from "node:crypto";

export const LOCAL_VERIFICATION_SCHEMA_VERSION = "local-verification/v1";
export const SOURCE_IDENTITY_SCHEMA_VERSION = "source-identity/v1";

export class LocalVerificationError extends Error {
  constructor(code, message, actionable) {
    super(message);
    this.name = "LocalVerificationError";
    this.code = code;
    this.actionable = actionable;
  }
}

function canonicalize(value) {
  if (value === undefined || typeof value === "function" || typeof value === "symbol" || typeof value === "bigint") {
    throw new LocalVerificationError("invalid-canonical-value", "Canonical verification data contains an unsupported value.", "Use JSON-compatible values in verification data.");
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new LocalVerificationError("invalid-canonical-value", "Canonical verification data contains a non-finite number.", "Use finite JSON numbers in verification data.");
  }
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

export function stableJson(value) {
  return JSON.stringify(canonicalize(value));
}

export function sha256(value) {
  return createHash("sha256").update(typeof value === "string" ? value : stableJson(value)).digest("hex");
}

export function digest(value) {
  return `sha256:${sha256(value)}`;
}

export function createPlanResponse({ sourceIdentity, plan }) {
  return {
    schemaVersion: LOCAL_VERIFICATION_SCHEMA_VERSION,
    command: "plan",
    ok: true,
    status: "planned",
    sourceIdentity,
    result: plan,
  };
}

export function createErrorResponse({ command = "unknown", error }) {
  const localError = error instanceof LocalVerificationError
    ? error
    : new LocalVerificationError("internal-error", "Local verification could not create a plan.", "Inspect stderr and retry after correcting the local workspace.");

  return {
    schemaVersion: LOCAL_VERIFICATION_SCHEMA_VERSION,
    command,
    ok: false,
    status: "blocked",
    sourceIdentity: null,
    result: null,
    error: {
      code: localError.code,
      message: localError.message,
      actionable: localError.actionable,
    },
  };
}

function assert(condition, code, message) {
  if (!condition) throw new LocalVerificationError(code, message, "Update the local verification implementation or its caller to use the v1 contract.");
}

// This is deliberately a literal allowlist, rather than a "pnpm run <name>"
// grammar.  State records are an execution boundary: a forged or stale record
// must never be able to turn the verifier into a generic package-script runner.
const APPROVED_PNPM_SCRIPTS = new Set([
  "check",
  "check:docs", "check:github-workflow-policy", "check:workspace-coordination", "check:manager-control-plane", "check:workspace-fast",
  "test:manager-control-plane:preflight", "test:manager-control-plane:full", "test:manager-control-plane-dispatcher-port",
  "build:dashboard", "test:dashboard-pipeline-fixtures", "test:dashboard-memory-proposals", "test:pipeline-implementation-readiness", "check:dashboard-pipeline-boundary",
  "test:supervisor-runner", "test:supervisor:preflight", "test:supervisor:profile",
  "test:sandbox-boundary-classifier", "test:anti-churn-event-writer", "test:anti-churn-signature-classifier",
  "test:check-plan", "test:local-verification-contracts", "test:local-verification-state-store", "test:local-verification-lifecycle",
  "test:static-bundles", "check:static",
]);

function isRecognizedPlannerCommand(command) {
  if (command[0] === "pnpm") return command.length === 3 && command[1] === "run" && APPROVED_PNPM_SCRIPTS.has(command[2]);
  if (command[0] === "git") {
    return (command.length === 3 && command[1] === "diff" && command[2] === "--check")
      || (command.length === 4 && command[1] === "diff" && command[2] === "--cached" && command[3] === "--check")
      || (command.length === 4 && command[1] === "diff" && command[2] === "--check" && !command[3].startsWith("-") && !command[3].includes("\0"));
  }
  return command.length === 3 && command[1] === "--check" && command[2].startsWith("/");
}

export function assertPlanResponse(response) {
  assert(response && typeof response === "object", "invalid-response", "Plan response must be an object.");
  assert(response.schemaVersion === LOCAL_VERIFICATION_SCHEMA_VERSION, "invalid-response", "Plan response has an unsupported schema version.");
  assert(response.command === "plan" && response.ok === true && response.status === "planned", "invalid-response", "Plan response has an invalid lifecycle envelope.");
  assert(response.sourceIdentity && typeof response.sourceIdentity === "object", "invalid-response", "Plan response is missing source identity.");
  assert(response.sourceIdentity.schemaVersion === SOURCE_IDENTITY_SCHEMA_VERSION, "invalid-response", "Plan response source identity has an unsupported schema version.");
  assert(typeof response.sourceIdentity.commit === "string" && response.sourceIdentity.commit.length > 0, "invalid-response", "Plan response source identity is missing its commit.");
  for (const field of ["worktreeFingerprint", "plannerDigest", "commandDigest", "environmentDigest"]) {
    assert(/^sha256:[a-f0-9]{64}$/.test(response.sourceIdentity[field] || ""), "invalid-response", `Plan response source identity has an invalid ${field}.`);
  }
  assert(response.sourceIdentity.surfaceFingerprints && typeof response.sourceIdentity.surfaceFingerprints === "object" && !Array.isArray(response.sourceIdentity.surfaceFingerprints) && Object.entries(response.sourceIdentity.surfaceFingerprints).every(([surface, value]) => /^[a-zA-Z][a-zA-Z0-9_-]{0,80}$/.test(surface) && /^sha256:[a-f0-9]{64}$/.test(value)), "invalid-response", "Plan response source identity has invalid surface fingerprints.");
  assert(response.result && /^plan_[a-f0-9]{64}$/.test(response.result.planId || ""), "invalid-response", "Plan response has an invalid plan ID.");
  assert(Array.isArray(response.result.nodes), "invalid-response", "Plan response nodes must be an array.");
  assert(Array.isArray(response.result.surfaces) && response.result.surfaces.every((value) => typeof value === "string"), "invalid-response", "Plan response surfaces must be string values.");
  assert(Array.isArray(response.result.reasons) && response.result.reasons.every((value) => typeof value === "string"), "invalid-response", "Plan response reasons must be string values.");
  assert(Array.isArray(response.result.jsonParseFiles) && response.result.jsonParseFiles.every((value) => typeof value === "string"), "invalid-response", "Plan response JSON parse files must be string values.");
  assert(response.result.broadening && (response.result.broadening.mode === "focused" || response.result.broadening.mode === "governed-full"), "invalid-response", "Plan response has an invalid broadening mode.");
  assert(Array.isArray(response.result.broadening.reasons) && response.result.broadening.reasons.every((value) => typeof value === "string"), "invalid-response", "Plan response broadening reasons must be string values.");
  assert((response.result.broadening.mode === "focused" && response.result.broadening.fallback === null && response.result.nextAction === "start") || (response.result.broadening.mode === "governed-full" && response.result.broadening.fallback === "pnpm run check" && response.result.nextAction === "start-governed-control"), "invalid-response", "Plan response broadening action is inconsistent.");
  if (response.result.broadening.mode === "governed-full") {
    assert(response.result.nodes.length === 1 && response.result.nodes[0]?.command.join("\0") === "pnpm\0run\0check", "invalid-response", "Governed-full plans must contain only the fixed governed control node.");
    assert(response.result.jsonParseFiles.length === 0, "invalid-response", "Governed-full plans cannot retain focused parse work.");
  } else {
    assert(response.result.broadening.reasons.length === 0, "invalid-response", "Focused plans cannot claim broadening reasons.");
  }
  const precedingNodeIds = new Set();
  for (const node of response.result.nodes) {
    assert(/^node_[a-f0-9]{64}$/.test(node.nodeId || ""), "invalid-response", "Verification node has an invalid ID.");
    assert(Array.isArray(node.command) && node.command.length > 0 && node.command.every((part) => typeof part === "string" && part.length > 0 && !part.includes("\0")), "invalid-response", "Verification node command must be a non-empty argv string array.");
    assert(isRecognizedPlannerCommand(node.command), "invalid-response", "Verification node command is outside the approved planner recipe boundary.");
    assert(node.commandText === node.command.join(" "), "invalid-response", "Verification node display text must match its argv.");
    assert(/^sha256:[a-f0-9]{64}$/.test(node.inputDigest || ""), "invalid-response", "Verification node is missing its bounded input identity.");
    assert(node.resourceClass === "default" && Array.isArray(node.dependsOn) && node.dependsOn.every((nodeId) => typeof nodeId === "string" && precedingNodeIds.has(nodeId)), "invalid-response", "Verification node has an unsupported scheduling shape.");
    assert(Array.isArray(node.rationale) && node.rationale.every((value) => typeof value === "string"), "invalid-response", "Verification node rationale must be string values.");
    assert(node.nodeId === `node_${sha256({ command: node.command, commandText: node.commandText, resourceClass: node.resourceClass, dependsOn: node.dependsOn, rationale: node.rationale, inputDigest: node.inputDigest })}`, "invalid-response", "Verification node ID does not match its canonical contents.");
    precedingNodeIds.add(node.nodeId);
  }
  const { planId, ...planContents } = response.result;
  assert(planId === `plan_${sha256({ sourceIdentity: response.sourceIdentity, ...planContents })}`, "invalid-response", "Plan ID does not match its canonical contents.");
  return response;
}
