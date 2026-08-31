export const REQUIRED_DRY_RUN_PACKET_FIELDS = Object.freeze([
  "packet_id",
  "worker",
  "mode",
  "task_class",
  "authority_level",
  "base_sha",
  "worktree_path",
  "allowed_file_scopes",
  "blocked_file_scopes",
  "command_allowlist",
  "environment_allowlist",
  "network_policy",
  "session_policy",
  "evidence_policy",
  "timeout_policy",
  "diff_limits",
  "retry_policy",
  "review_requirement",
  "status_policy",
  "stop_lines",
  "blocked_operations",
  "evidence_refs",
  "status_events",
  "rollback_or_recovery_path",
  "expiry_or_review_point",
]);

export const REQUIRED_STOP_LINES = Object.freeze([
  "no Claude/Hermes/Codex launch",
  "no provider calls",
  "no network calls",
  "no session inheritance",
  "no credential reads",
  "no worker source mutation",
  "no PR creation or delivery",
  "no merge",
  "no cleanup or deletion",
  "no raw prompt/completion/transcript/provider payload retention",
  "no adaptive trust effects",
]);

export const BLOCKED_AUTHORITY_FAMILIES = Object.freeze([
  "worker-process-launch",
  "subscription-agent-launch",
  "local-provider-execution",
  "premium-execution",
  "worker-network-or-session",
  "session-inheritance",
  "worker-command-execution",
  "worker-source-mutation",
  "raw-failure-retention",
  "github-delivery",
  "merge",
  "cleanup-automation",
  "adaptive-scoring",
]);

const ALLOWED_WORKERS = new Set(["claude", "hermes"]);
const ALLOWED_MODES = new Set(["dry_run"]);
const ALLOWED_AUTHORITY_LEVELS = new Set(["model_only", "non_executing"]);
const ALLOWED_REVIEW_REQUIREMENTS = new Set([
  "codex_review_required",
  "operator_review_required",
  "blocked_until_future_approval",
]);
const LIVE_STATUS_STATES = new Set(["running_live_worker"]);
const ALLOWED_STATUS_STATES = new Set([
  "queued",
  "validating",
  "dry_run_complete",
  "blocked",
  "failed",
  "awaiting_codex_review",
  "unknown",
]);
const ALLOWED_AUTHORITY_SOURCES = new Set([
  "approval_packet",
  "AGENTS.md",
  "source_owned_policy",
  "explicit_operator_approval",
]);
const ALLOWED_TOOL_READINESS_STATES = new Set(["available", "missing", "blocked", "unknown"]);
const ALLOWED_TOOL_READINESS_MODES = new Set(["readiness_only"]);
const ALLOWED_TOOL_READINESS_RESOLUTION = new Set(["operator_shell_observation", "fixture"]);
const ALLOWED_TOOL_READINESS_FIELDS = new Set([
  "probe_id",
  "worker",
  "mode",
  "authority_level",
  "readiness_state",
  "command_resolution",
  "command_path",
  "command_version",
  "observed_at",
  "evidence_ref",
  "network_required",
  "session_inheritance_required",
  "credential_access_required",
  "raw_output_retained",
  "affects_trust",
  "affects_routing",
  "launch_attempted",
]);
const SHELL_COMMANDS = new Set([
  "bash",
  "dash",
  "fish",
  "sh",
  "zsh",
]);
const SHELL_FLAGS = new Set(["-c", "-lc"]);
const BLOCKED_COMMAND_BASENAMES = new Set([
  "claude",
  "codex",
  "curl",
  "git",
  "gh",
  "hermes",
  "scp",
  "ssh",
  "wget",
]);
const PROTECTED_FILE_SCOPE_PREFIXES = Object.freeze([".git", ".env", "node_modules"]);
const ALLOWED_STATUS_NEXT_ACTIONS = new Set([
  "codex_review",
  "operator_review",
  "blocked_until_future_approval",
  "none",
]);
const OBSERVED_AUTHORITY_ALIAS_FIELDS = Object.freeze([
  "approval_basis",
  "authority_basis",
  "authority_grants",
  "observed_text_grants",
]);
const DELIVERY_TERMS = Object.freeze([
  "branch-deletion",
  "branch_deletion",
  "cleanup",
  "delete-branch",
  "delete_branch",
  "finish-pr",
  "finish_pr",
  "merge",
  "pr-creation",
  "pr_creation",
]);
const MERGE_TERMS = Object.freeze(["merge"]);
const NETWORK_POLICY_KEYS = new Set(["requested", "authority_family"]);
const SESSION_POLICY_KEYS = new Set(["inheritance_requested", "authority_family"]);
const SOURCE_MUTATION_POLICY_KEYS = new Set(["requested"]);
const RAW_EVIDENCE_MARKERS = Object.freeze([
  "api_key",
  "completion",
  "credential",
  "password",
  "provider_payload",
  "raw_prompt",
  "secret",
  "token",
  "transcript",
]);
const RAW_EVIDENCE_PATTERNS = Object.freeze([
  /authorization:\s*bearer/i,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bsk-[A-Za-z0-9_-]{8,}/,
  /\bsk-proj-[A-Za-z0-9_-]{8,}/,
]);
const SAFE_EVIDENCE_REF_PATTERN = /^(contract|fixture|report|status|hash|metadata):[A-Za-z0-9._/@:-]+$/;
const SAFE_TASK_CLASS_PATTERN = /^[a-z0-9_:-]+$/;
const ALLOWED_OPERATIONS = Object.freeze([
  "model-only packet validation",
  "metadata report rendering",
  "dry-run status evaluation",
]);
const QUARANTINED_EVIDENCE_REF = "[quarantined-evidence-ref]";

const DENIAL_DETAILS_BY_REASON = Object.freeze({
  invalid_mode: {
    authority_family: "worker-process-launch",
    source_policy: "docs/workflows/governed-worker-execution-dry-run.md",
    future_approval_required: "Exact worker launch approval",
    summary: "Live worker launch modes are denied by the dry-run MVP.",
  },
  network_requested: {
    authority_family: "worker-network-or-session",
    source_policy: "docs/workflows/governed-worker-execution-dry-run.md",
    future_approval_required: "Worker-specific network/session approval naming Claude or Hermes",
    summary: "Network access is blocked unless a future exact approval grants it.",
  },
  session_inheritance_requested: {
    authority_family: "session-inheritance",
    source_policy: "docs/workflows/execution-authority-boundary.md",
    future_approval_required: "Session approval naming account and repo context",
    summary: "Session inheritance is blocked in the dry-run MVP.",
  },
  source_mutation_requested: {
    authority_family: "worker-source-mutation",
    source_policy: "docs/workflows/governed-worker-execution-dry-run.md",
    future_approval_required: "Source mutation approval naming worker, task, paths, and diff limits",
    summary: "Worker source mutation is blocked in the dry-run MVP.",
  },
  raw_evidence_retention_requested: {
    authority_family: "raw-failure-retention",
    source_policy: "docs/workflows/governed-worker-execution-dry-run.md",
    future_approval_required: "Raw-failure-retention approval",
    summary: "Raw prompts, transcripts, provider payloads, and source snippets are not retained.",
  },
  delivery_requested: {
    authority_family: "github-delivery",
    source_policy: "docs/workflows/execution-authority-boundary.md",
    future_approval_required: "Delivery approval through existing PR guardrails",
    summary: "PR creation, branch publication, review-thread mutation, and CI/GitHub mutation are blocked.",
  },
  merge_requested: {
    authority_family: "merge",
    source_policy: "docs/workflows/execution-authority-boundary.md",
    future_approval_required: "Exact-head low-risk merge evidence or explicit approval",
    summary: "Merge authority is blocked in the dry-run MVP.",
  },
  cleanup_requested: {
    authority_family: "cleanup-automation",
    source_policy: "docs/workflows/execution-authority-boundary.md",
    future_approval_required: "Target-specific cleanup approval",
    summary: "Cleanup, deletion, and remote-ref removal are blocked in the dry-run MVP.",
  },
  adaptive_trust_effect_requested: {
    authority_family: "adaptive-scoring",
    source_policy: "docs/workflows/governed-worker-execution-dry-run.md",
    future_approval_required: "Adaptive-scoring approval",
    summary: "Trust labels cannot affect routing, priority, authority, verification, delivery, merge, cleanup, or retry behavior.",
  },
  live_status_requested: {
    authority_family: "worker-process-launch",
    source_policy: "docs/architecture/kendall-vnxt-process-lifecycle-design-2026-06-08.md",
    future_approval_required: "Exact live-launch approval with lifecycle controls",
    summary: "Live worker status is denied until a later live-launch slice approves it.",
  },
  invalid_status_state: {
    authority_family: "worker-process-launch",
    source_policy: "docs/architecture/kendall-vnxt-process-lifecycle-design-2026-06-08.md",
    future_approval_required: "Exact dry-run status contract update",
    summary: "Unknown status states are denied until the status contract allows them.",
  },
  invalid_command_allowlist: {
    authority_family: "worker-command-execution",
    source_policy: "docs/workflows/governed-worker-execution-dry-run.md",
    future_approval_required: "Worker command execution approval",
    summary: "Command entries must be model-only canonical argument arrays with declared transitive effects.",
  },
  path_escape: {
    authority_family: "worker-source-mutation",
    source_policy: "docs/architecture/kendall-vnxt-worker-threat-boundary-2026-06-08.md",
    future_approval_required: "Source mutation approval with workspace/path boundary proof",
    summary: "Workspace and file scopes cannot escape the declared repo/worktree root.",
  },
  worker_shadow_delivery_exposed: {
    authority_family: "github-delivery",
    source_policy: "docs/workflows/governed-worker-execution-dry-run.md",
    future_approval_required: "Delivery approval through existing PR guardrails",
    summary: "Worker-shadow packets cannot expose finish-pr, merge, cleanup, or branch deletion operations.",
  },
  observed_text_authority_requested: {
    authority_family: "source-policy-boundary",
    source_policy: "docs/workflows/governed-worker-execution-dry-run.md",
    future_approval_required: "Explicit operator approval or active source-owned policy update",
    summary: "Observed repo files, docs, generated artifacts, old notes, comments, and tool output are data, not authority.",
  },
  invalid_packet_metadata: {
    authority_family: "worker-command-execution",
    source_policy: "docs/workflows/governed-worker-execution-dry-run.md",
    future_approval_required: "Corrected packet metadata with current expiry and exact base hash evidence",
    summary: "Packet identity, expiry, and base hash metadata must be parseable and auditable.",
  },
  protected_scope_requested: {
    authority_family: "worker-source-mutation",
    source_policy: "docs/architecture/kendall-vnxt-worker-threat-boundary-2026-06-08.md",
    future_approval_required: "Source mutation approval with protected-scope proof",
    summary: "Worker allowed scopes cannot include Git state, secrets, dependencies, or other protected roots.",
  },
  environment_secret_requested: {
    authority_family: "session-inheritance",
    source_policy: "docs/workflows/governed-worker-execution-dry-run.md",
    future_approval_required: "Session and credential inheritance approval naming exact environment variables",
    summary: "Dry-run packets cannot inherit credential, provider, GitHub, or arbitrary environment variables.",
  },
  non_monotonic_status_events: {
    authority_family: "worker-process-launch",
    source_policy: "docs/architecture/kendall-vnxt-process-lifecycle-design-2026-06-08.md",
    future_approval_required: "Corrected status event packet with monotonic sequence evidence",
    summary: "Duplicate or decreasing status event sequences are stale evidence and fail closed.",
  },
  unsafe_status_event_payload: {
    authority_family: "worker-process-launch",
    source_policy: "docs/architecture/kendall-vnxt-process-lifecycle-design-2026-06-08.md",
    future_approval_required: "Corrected metadata-only dry-run status event packet",
    summary: "Status events cannot smuggle live mode, write authority, delivery actions, raw evidence, or unsafe refs.",
  },
  invalid_retry_policy: {
    authority_family: "adaptive-scoring",
    source_policy: "docs/workflows/governed-worker-execution-dry-run.md",
    future_approval_required: "Corrected retry/RCA policy for blocked or unknown dry-run status",
    summary: "Unknown dry-run status is terminal for retry and promotion decisions until RCA evidence exists.",
  },
  invalid_packet_object: {
    authority_family: "worker-command-execution",
    source_policy: "docs/workflows/governed-worker-execution-dry-run.md",
    future_approval_required: "Well-formed dry-run packet object",
    summary: "The dry-run validator only accepts own-property packet objects.",
  },
  invalid_worker: {
    authority_family: "worker-process-launch",
    source_policy: "docs/workflows/governed-worker-execution-dry-run.md",
    future_approval_required: "Worker-specific contract update naming the worker",
    summary: "Only Claude and Hermes packets are accepted by this dry-run slice.",
  },
  invalid_authority_level: {
    authority_family: "worker-command-execution",
    source_policy: "docs/workflows/governed-worker-execution-dry-run.md",
    future_approval_required: "Dry-run authority contract update",
    summary: "Only model-only and non-executing authority levels are accepted.",
  },
  invalid_review_requirement: {
    authority_family: "worker-command-execution",
    source_policy: "docs/workflows/governed-worker-execution-dry-run.md",
    future_approval_required: "Dry-run review requirement contract update",
    summary: "Packets must keep Codex/operator review gates visible.",
  },
  invalid_tool_readiness_probe: {
    authority_family: "worker-command-execution",
    source_policy: "docs/workflows/governed-worker-execution-dry-run.md",
    future_approval_required: "Corrected readiness-only probe evidence before any launch approval",
    summary: "Tool readiness observations must stay metadata-only and non-executing.",
  },
});

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function arrayOrEmpty(value) {
  return Array.isArray(value) ? [...value] : [];
}

function addFieldReason(fieldReasons, field, reason) {
  fieldReasons.push({ field, reason });
}

function hasOwnField(input, field) {
  return Object.hasOwn(input, field);
}

function isEmptyRequiredValue(value) {
  if (value === null || value === undefined) {
    return true;
  }
  if (typeof value === "string") {
    return value.trim().length === 0;
  }
  return false;
}

function includesEvery(values, requiredValues) {
  if (!Array.isArray(values)) {
    return false;
  }
  const actual = new Set(values);
  return requiredValues.every((value) => actual.has(value));
}

function validateNonEmptyArray(fieldReasons, input, field, reason) {
  if (hasOwnField(input, field) && (!Array.isArray(input[field]) || input[field].length === 0)) {
    addFieldReason(fieldReasons, field, reason);
  }
}

function basename(value) {
  return value.split("/").at(-1)?.toLowerCase() ?? "";
}

function isAbsolutePath(value) {
  return value.startsWith("/");
}

function includesShellSyntax(value) {
  return /[`$|&;<>(){}[\]*?]/.test(value);
}

function includesBlockedTerm(value, terms) {
  if (typeof value === "string") {
    const normalized = value.toLowerCase();
    return terms.some((term) => normalized.includes(term));
  }
  if (Array.isArray(value)) {
    return value.some((entry) => includesBlockedTerm(entry, terms));
  }
  if (isRecord(value)) {
    return Object.values(value).some((entry) => includesBlockedTerm(entry, terms));
  }
  return false;
}

function hasRawEvidenceMarker(value) {
  return (
    typeof value !== "string" ||
    value.length > 200 ||
    !SAFE_EVIDENCE_REF_PATTERN.test(value) ||
    RAW_EVIDENCE_MARKERS.some((marker) => value.toLowerCase().includes(marker)) ||
    RAW_EVIDENCE_PATTERNS.some((pattern) => pattern.test(value))
  );
}

function hasRawMarkerInObject(value) {
  if (typeof value === "string") {
    return (
      RAW_EVIDENCE_MARKERS.some((marker) => value.toLowerCase().includes(marker)) ||
      RAW_EVIDENCE_PATTERNS.some((pattern) => pattern.test(value))
    );
  }
  if (Array.isArray(value)) {
    return value.some(hasRawMarkerInObject);
  }
  if (isRecord(value)) {
    return Object.entries(value).some(([key, entry]) => {
      return hasRawMarkerInObject(key) || hasRawMarkerInObject(entry);
    });
  }
  return false;
}

function isBlockedCommandExecutable(value) {
  const executableName = basename(value);
  return SHELL_COMMANDS.has(executableName) || BLOCKED_COMMAND_BASENAMES.has(executableName);
}

function validateCommandAllowlist(fieldReasons, input) {
  if (!hasOwnField(input, "command_allowlist")) {
    return;
  }
  const commands = input.command_allowlist;
  const valid =
    Array.isArray(commands) &&
    commands.every((command) => {
	    return (
	        isRecord(command) &&
	        command.model_only === true &&
	        Array.isArray(command.argv) &&
	        command.argv.length > 0 &&
	        command.argv.every((arg) => typeof arg === "string" && arg.trim().length > 0) &&
	        isAbsolutePath(command.argv[0]) &&
	        !isBlockedCommandExecutable(command.argv[0]) &&
	        command.argv.every((arg) => !SHELL_FLAGS.has(arg.toLowerCase()) && !includesShellSyntax(arg) && !hasRawMarkerInObject(arg)) &&
	        Array.isArray(command.transitive_effects) &&
	        command.transitive_effects.length === 0
	      );
	    });

  if (!valid) {
    addFieldReason(fieldReasons, "command_allowlist", "invalid_command_allowlist");
  }
}

function validatePolicyDenials(fieldReasons, input) {
  if (
    !isRecord(input.network_policy) ||
    input.network_policy.requested !== false ||
    Object.keys(input.network_policy).some((key) => !NETWORK_POLICY_KEYS.has(key)) ||
    hasRawMarkerInObject(input.network_policy)
  ) {
    addFieldReason(fieldReasons, "network_policy", "network_requested");
  }
  if (
    !isRecord(input.session_policy) ||
    input.session_policy.inheritance_requested !== false ||
    Object.keys(input.session_policy).some((key) => !SESSION_POLICY_KEYS.has(key)) ||
    hasRawMarkerInObject(input.session_policy)
  ) {
    addFieldReason(fieldReasons, "session_policy", "session_inheritance_requested");
  }
  if (
    !isRecord(input.evidence_policy) ||
    input.evidence_policy.retention !== "metadata_only" ||
      input.evidence_policy.raw_payload_retained !== false ||
      Object.keys(input.evidence_policy).some((key) => !["retention", "raw_payload_retained"].includes(key)) ||
      hasRawMarkerInObject(input.evidence_policy)
  ) {
    addFieldReason(fieldReasons, "evidence_policy", "raw_evidence_retention_requested");
  }
  if (
    hasOwnField(input, "source_mutation_policy") &&
    (!isRecord(input.source_mutation_policy) ||
      input.source_mutation_policy.requested !== false ||
      Object.keys(input.source_mutation_policy).some((key) => !SOURCE_MUTATION_POLICY_KEYS.has(key)) ||
      hasRawMarkerInObject(input.source_mutation_policy))
  ) {
    addFieldReason(fieldReasons, "source_mutation_policy", "source_mutation_requested");
  }
  if (
    hasOwnField(input, "delivery_policy") &&
    (!isRecord(input.delivery_policy) ||
      input.delivery_policy.pr_creation_requested !== false ||
      input.delivery_policy.finish_pr_exposed === true ||
      includesBlockedTerm(input.delivery_policy, DELIVERY_TERMS))
  ) {
    addFieldReason(fieldReasons, "delivery_policy", "delivery_requested");
  }
  if (
    isRecord(input.delivery_policy) &&
    (input.delivery_policy.merge_requested !== false || includesBlockedTerm(input.delivery_policy, MERGE_TERMS))
  ) {
    addFieldReason(fieldReasons, "delivery_policy", "merge_requested");
  }
  if (
    isRecord(input.cleanup_policy) &&
    (input.cleanup_policy.deletion_requested !== false || includesBlockedTerm(input.cleanup_policy.operations, DELIVERY_TERMS))
  ) {
    addFieldReason(fieldReasons, "cleanup_policy", "cleanup_requested");
  }
  if (
    isRecord(input.adaptive_trust_policy) &&
    (input.adaptive_trust_policy.affects_routing !== false ||
      input.adaptive_trust_policy.affects_authority !== false ||
      input.adaptive_trust_policy.affects_retry !== false ||
      input.adaptive_trust_policy.affects_priority === true ||
      input.adaptive_trust_policy.affects_verification === true ||
      input.adaptive_trust_policy.affects_delivery === true ||
      input.adaptive_trust_policy.affects_merge === true ||
      input.adaptive_trust_policy.affects_cleanup === true)
  ) {
    addFieldReason(fieldReasons, "adaptive_trust_policy", "adaptive_trust_effect_requested");
  }
}

function validateEnvironmentAllowlist(fieldReasons, input) {
  if (!hasOwnField(input, "environment_allowlist")) {
    return;
  }
  if (
    !Array.isArray(input.environment_allowlist) ||
    input.environment_allowlist.length !== 0 ||
    hasRawMarkerInObject(input.environment_allowlist)
  ) {
    addFieldReason(fieldReasons, "environment_allowlist", "environment_secret_requested");
  }
}

function isUnsafeStatusEventPayload(event) {
  if (!isRecord(event)) {
    return false;
  }
  if (hasOwnField(event, "mode") && event.mode !== "dry_run") {
    return true;
  }
  if (hasOwnField(event, "authority_level") && !ALLOWED_AUTHORITY_LEVELS.has(event.authority_level)) {
    return true;
  }
  if (hasOwnField(event, "next_action")) {
    if (typeof event.next_action !== "string" || !ALLOWED_STATUS_NEXT_ACTIONS.has(event.next_action)) {
      return true;
    }
  }
  if (hasOwnField(event, "evidence_ref") && hasRawEvidenceMarker(event.evidence_ref)) {
    return true;
  }
  if (
    hasOwnField(event, "blocked_operations") &&
    (!Array.isArray(event.blocked_operations) ||
      event.blocked_operations.some((operation) => !BLOCKED_AUTHORITY_FAMILIES.includes(operation)))
  ) {
    return true;
  }
  return hasRawMarkerInObject(event);
}

function validateStatusEvents(fieldReasons, input) {
  if (!hasOwnField(input, "status_events")) {
    return;
  }
  validateNonEmptyArray(fieldReasons, input, "status_events", "missing_status_events");
  if (
    Array.isArray(input.status_events) &&
    input.status_events.some((event) => isRecord(event) && isLiveStatusState(event.state))
  ) {
    addFieldReason(fieldReasons, "status_events", "live_status_requested");
  }
  if (
    Array.isArray(input.status_events) &&
    input.status_events.some((event) => {
      return !isRecord(event) || !Number.isSafeInteger(event.sequence) || !ALLOWED_STATUS_STATES.has(event.state);
    })
  ) {
    addFieldReason(fieldReasons, "status_events", "invalid_status_state");
  }
  if (Array.isArray(input.status_events)) {
    const lastSequenceByRun = new Map();
    for (const event of input.status_events) {
      if (!isRecord(event) || !Number.isSafeInteger(event.sequence)) {
        continue;
      }
      const runId = typeof event.run_id === "string" && event.run_id.trim().length > 0 ? event.run_id : "__missing_run_id";
      const lastSequence = lastSequenceByRun.get(runId) ?? -Infinity;
      if (event.sequence <= lastSequence) {
        addFieldReason(fieldReasons, "status_events", "non_monotonic_status_events");
        break;
      }
      lastSequenceByRun.set(runId, event.sequence);
    }
  }
  if (Array.isArray(input.status_events) && input.status_events.some(isUnsafeStatusEventPayload)) {
    addFieldReason(fieldReasons, "status_events", "unsafe_status_event_payload");
  }
}

function validateEvidenceRefs(fieldReasons, input) {
  validateNonEmptyArray(fieldReasons, input, "evidence_refs", "missing_evidence_refs");
  if (hasOwnField(input, "evidence_refs") && (!Array.isArray(input.evidence_refs) || input.evidence_refs.some(hasRawEvidenceMarker))) {
    addFieldReason(fieldReasons, "evidence_refs", "raw_evidence_retention_requested");
  }
}

function hasPathEscape(value) {
  if (typeof value !== "string") {
    return true;
  }
  const lowerValue = value.toLowerCase();
  const segments = value.split(/[\\/]+/);
  return (
    value.trim().length === 0 ||
    value.startsWith("/") ||
    value.startsWith("~") ||
    value.startsWith("$") ||
    value.includes("\\") ||
    lowerValue.includes("%2e") ||
    lowerValue.includes("submodule:") ||
    lowerValue.includes("symlink:") ||
    segments.includes("..")
  );
}

function isProtectedAllowedScope(value) {
  if (typeof value !== "string") {
    return true;
  }
  const normalized = value.replace(/\/+$/g, "").toLowerCase();
  return PROTECTED_FILE_SCOPE_PREFIXES.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`));
}

function validatePathBoundaries(fieldReasons, input) {
  if (hasPathEscape(input.worktree_path)) {
    addFieldReason(fieldReasons, "worktree_path", "path_escape");
  }
  for (const field of ["allowed_file_scopes", "blocked_file_scopes"]) {
    if (!Array.isArray(input[field]) || input[field].some(hasPathEscape)) {
      addFieldReason(fieldReasons, field, "path_escape");
    }
  }
  if (Array.isArray(input.allowed_file_scopes) && input.allowed_file_scopes.some(isProtectedAllowedScope)) {
    addFieldReason(fieldReasons, "allowed_file_scopes", "protected_scope_requested");
  }
  if (
    isRecord(input.worker_shadow_delivery) &&
    (input.worker_shadow_delivery.finish_pr_exposed === true ||
      input.worker_shadow_delivery.pr_creation_exposed === true ||
      input.worker_shadow_delivery.merge_exposed === true ||
      input.worker_shadow_delivery.cleanup_exposed === true ||
      input.worker_shadow_delivery.branch_deletion_exposed === true ||
      includesBlockedTerm(input.worker_shadow_delivery, DELIVERY_TERMS))
  ) {
    addFieldReason(fieldReasons, "worker_shadow_delivery", "worker_shadow_delivery_exposed");
  }
}

function parseTimestamp(value) {
  if (typeof value !== "string") {
    return Number.NaN;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function latestStatusTimestamp(input) {
  if (!Array.isArray(input.status_events)) {
    return Number.NaN;
  }
  const timestamps = input.status_events.map((event) => parseTimestamp(event?.timestamp)).filter(Number.isFinite);
  return timestamps.length > 0 ? Math.max(...timestamps) : Number.NaN;
}

function validatePacketMetadata(fieldReasons, input) {
  if (
    hasOwnField(input, "task_class") &&
    (typeof input.task_class !== "string" || !SAFE_TASK_CLASS_PATTERN.test(input.task_class) || hasRawMarkerInObject(input.task_class))
  ) {
    addFieldReason(fieldReasons, "task_class", "invalid_packet_metadata");
  }
  if (hasOwnField(input, "base_sha") && (typeof input.base_sha !== "string" || !/^[0-9a-f]{40}$/.test(input.base_sha))) {
    addFieldReason(fieldReasons, "base_sha", "invalid_packet_metadata");
  }
  if (hasOwnField(input, "expiry_or_review_point")) {
    const expiryTime = parseTimestamp(input.expiry_or_review_point);
    const latestEventTime = latestStatusTimestamp(input);
    if (!Number.isFinite(expiryTime) || (Number.isFinite(latestEventTime) && expiryTime <= latestEventTime)) {
      addFieldReason(fieldReasons, "expiry_or_review_point", "invalid_packet_metadata");
    }
  }
}

function validateRetryPolicy(fieldReasons, input) {
  if (!hasOwnField(input, "retry_policy")) {
    return;
  }
  if (!isRecord(input.retry_policy) || !Number.isSafeInteger(input.retry_policy.max_attempts)) {
    addFieldReason(fieldReasons, "retry_policy", "invalid_retry_policy");
    return;
  }
  const statusEvaluation = evaluateStatusEvents(input.status_events);
  if (
    statusEvaluation.latest_event?.state === "unknown" &&
    (input.retry_policy.max_attempts !== 0 || input.retry_policy.rca_required !== true)
  ) {
    addFieldReason(fieldReasons, "retry_policy", "invalid_retry_policy");
  }
}

function isLiveStatusState(state) {
  return (
    typeof state === "string" &&
    (LIVE_STATUS_STATES.has(state) ||
      /live|launch|provider|source_mutation|delivery|cleanup|running|executing|worker_started/.test(state))
  );
}

function validateStatusPolicy(fieldReasons, input) {
  if (!isRecord(input.status_policy) || !Array.isArray(input.status_policy.allowed_states)) {
    addFieldReason(fieldReasons, "status_policy", "invalid_status_state");
    return;
  }
  if (input.status_policy.allowed_states.some(isLiveStatusState)) {
    addFieldReason(fieldReasons, "status_policy", "live_status_requested");
  }
  if (input.status_policy.allowed_states.some((state) => !ALLOWED_STATUS_STATES.has(state))) {
    addFieldReason(fieldReasons, "status_policy", "invalid_status_state");
  }
}

function validateAuthoritySources(fieldReasons, input) {
  if (hasOwnField(input, "authority_sources")) {
    if (
      !Array.isArray(input.authority_sources) ||
      input.authority_sources.some((authoritySource) => !ALLOWED_AUTHORITY_SOURCES.has(authoritySource))
    ) {
      addFieldReason(fieldReasons, "authority_sources", "observed_text_authority_requested");
    }
  }
  for (const field of OBSERVED_AUTHORITY_ALIAS_FIELDS) {
    if (hasOwnField(input, field)) {
      addFieldReason(fieldReasons, field, "observed_text_authority_requested");
    }
  }
}

function denialDetailsFor(fieldReasons) {
  return fieldReasons
    .map((fieldReason) => {
      const detail = DENIAL_DETAILS_BY_REASON[fieldReason.reason];
      if (!detail) {
        return {
          field: fieldReason.field,
          reason: fieldReason.reason,
          authority_family: "worker-command-execution",
          source_policy: "docs/workflows/governed-worker-execution-dry-run.md",
          future_approval_required: "Corrected dry-run packet or explicit source-owned contract update",
          summary: "Malformed or unsupported packet data failed closed.",
        };
      }
      return {
        field: fieldReason.field,
        reason: fieldReason.reason,
        ...detail,
      };
    })
}

function safeEvidenceRefs(evidenceRefs) {
  return arrayOrEmpty(evidenceRefs).map((evidenceRef) => {
    return hasRawEvidenceMarker(evidenceRef) ? QUARANTINED_EVIDENCE_REF : evidenceRef;
  });
}

function sortedExactMatch(values, expectedValues) {
  if (!Array.isArray(values) || values.length !== expectedValues.length) {
    return false;
  }
  return includesEvery(values, expectedValues) && includesEvery(expectedValues, values);
}

function safeWorker(value) {
  return ALLOWED_WORKERS.has(value) ? value : "unknown";
}

function safeAuthorityLevel(value) {
  return ALLOWED_AUTHORITY_LEVELS.has(value) ? value : "unknown";
}

function safeReadinessText(value) {
  return typeof value === "string" && value.trim().length > 0 && !hasRawMarkerInObject(value) ? value : null;
}

function safeToolReadinessState(value) {
  return ALLOWED_TOOL_READINESS_STATES.has(value) ? value : "unknown";
}

function safeTaskClass(packet) {
  if (
    !isRecord(packet) ||
    typeof packet.task_class !== "string" ||
    !SAFE_TASK_CLASS_PATTERN.test(packet.task_class) ||
    hasRawMarkerInObject(packet.task_class)
  ) {
    return "unknown";
  }
  return packet.task_class;
}

function nextApprovalLines(deniedDetails) {
  if (deniedDetails.length === 0) {
    return ["none; dry-run remains non-executing"];
  }
  return [
    ...new Set(
      deniedDetails.map((detail) => {
        return `${detail.authority_family}: ${detail.future_approval_required}`;
      }),
    ),
  ];
}

export function evaluateStatusEvents(statusEvents) {
  const ordered_events = [];
  const ignored_stale_events = [];
  const denied_live_events = [];
  const ignored_malformed_events = [];
  const lastSequenceByRun = new Map();

  for (const event of arrayOrEmpty(statusEvents)) {
    if (!isRecord(event) || !Number.isSafeInteger(event.sequence) || typeof event.state !== "string") {
      ignored_malformed_events.push(event);
      continue;
    }
    if (isLiveStatusState(event.state)) {
      denied_live_events.push(event);
      continue;
    }
    if (!ALLOWED_STATUS_STATES.has(event.state)) {
      ignored_malformed_events.push(event);
      continue;
    }
    const runId = typeof event.run_id === "string" && event.run_id.trim().length > 0 ? event.run_id : "__missing_run_id";
    const lastSequence = lastSequenceByRun.get(runId) ?? -Infinity;
    if (event.sequence <= lastSequence) {
      ignored_stale_events.push(event);
      continue;
    }
    ordered_events.push(event);
    lastSequenceByRun.set(runId, event.sequence);
  }

  return {
    ordered_events,
    ignored_stale_events,
    ignored_malformed_events,
    denied_live_events,
    latest_event: ordered_events.at(-1) ?? null,
    latest_denied_event: denied_live_events.at(-1) ?? null,
  };
}

export function renderDryRunReport(packet, validationResult = validateDryRunPacket(packet)) {
  const statusEvaluation = evaluateStatusEvents(validationResult.status_events);
  const latestState = statusEvaluation.latest_event?.state ?? "unknown";
  const deniedDetails = arrayOrEmpty(validationResult.denial_details);
  const denialReasons = validationResult.denied_reasons.length > 0 ? validationResult.denied_reasons.join(", ") : "none";
  const evidenceRefs = safeEvidenceRefs(validationResult.evidence_refs);
  const retryPolicy = isRecord(packet) && isRecord(packet.retry_policy) ? packet.retry_policy : {};
  const maxAttempts = Number.isSafeInteger(retryPolicy.max_attempts) ? retryPolicy.max_attempts : "unknown";
  const retryState = `max_attempts=${maxAttempts}; rca_required=${retryPolicy.rca_required === true}`;

  return [
    "# Governed Worker Execution Dry-Run Report",
    "",
    `Worker: ${safeWorker(validationResult.worker)}`,
    `Task class: ${safeTaskClass(packet)}`,
    `Authority level: ${safeAuthorityLevel(validationResult.authority_level)}`,
    `Allowed operations: ${ALLOWED_OPERATIONS.join(", ")}`,
    `Blocked operations: ${BLOCKED_AUTHORITY_FAMILIES.join(", ")}`,
    `Denial reasons: ${denialReasons}`,
    `Evidence references: ${evidenceRefs.length > 0 ? evidenceRefs.join(", ") : "none"}`,
    `Status state: ${latestState}`,
    `Ignored stale status events: ${statusEvaluation.ignored_stale_events.length}`,
    `Ignored malformed status events: ${statusEvaluation.ignored_malformed_events.length}`,
    `Denied live status events: ${statusEvaluation.denied_live_events.length}`,
    `Retry/RCA state: ${retryState}`,
    `Next approval packet required: ${nextApprovalLines(deniedDetails).join("; ")}`,
  ].join("\n");
}

export function validateToolReadinessProbe(probe) {
  const input = isRecord(probe) ? probe : {};
  const field_reasons = [];

  if (!isRecord(probe)) {
    addFieldReason(field_reasons, "$", "invalid_tool_readiness_probe");
  }

  for (const field of [
    "probe_id",
    "worker",
    "mode",
    "authority_level",
    "readiness_state",
    "command_resolution",
    "observed_at",
    "evidence_ref",
  ]) {
    if (!hasOwnField(input, field) || isEmptyRequiredValue(input[field])) {
      addFieldReason(field_reasons, field, "invalid_tool_readiness_probe");
    }
  }

  if (!ALLOWED_WORKERS.has(input.worker)) {
    addFieldReason(field_reasons, "worker", "invalid_tool_readiness_probe");
  }
  if (!ALLOWED_TOOL_READINESS_MODES.has(input.mode)) {
    addFieldReason(field_reasons, "mode", "invalid_tool_readiness_probe");
  }
  if (input.authority_level !== "non_executing") {
    addFieldReason(field_reasons, "authority_level", "invalid_tool_readiness_probe");
  }
  if (!ALLOWED_TOOL_READINESS_STATES.has(input.readiness_state)) {
    addFieldReason(field_reasons, "readiness_state", "invalid_tool_readiness_probe");
  }
  if (!ALLOWED_TOOL_READINESS_RESOLUTION.has(input.command_resolution)) {
    addFieldReason(field_reasons, "command_resolution", "invalid_tool_readiness_probe");
  }
  if (hasOwnField(input, "command_path")) {
    const commandPathAllowed =
      input.command_path === null ||
      (typeof input.command_path === "string" &&
        input.command_path.startsWith("/") &&
        basename(input.command_path) === input.worker);
    if (!commandPathAllowed) {
      addFieldReason(field_reasons, "command_path", "invalid_tool_readiness_probe");
    }
  }
  for (const field of ["command_path", "command_version"]) {
    if (!hasOwnField(input, field)) {
      addFieldReason(field_reasons, field, "invalid_tool_readiness_probe");
    }
  }
  if (hasOwnField(input, "command_version") && input.command_version !== null) {
    if (typeof input.command_version !== "string" || input.command_version.length > 120 || hasRawMarkerInObject(input.command_version)) {
      addFieldReason(field_reasons, "command_version", "invalid_tool_readiness_probe");
    }
  }
  if (input.readiness_state === "available") {
    if (typeof input.command_path !== "string" || typeof input.command_version !== "string" || input.command_version.trim().length === 0) {
      addFieldReason(field_reasons, "readiness_state", "invalid_tool_readiness_probe");
    }
  }
  if (input.readiness_state === "missing" && (input.command_path !== null || input.command_version !== null)) {
    addFieldReason(field_reasons, "readiness_state", "invalid_tool_readiness_probe");
  }
  if (!Number.isFinite(parseTimestamp(input.observed_at))) {
    addFieldReason(field_reasons, "observed_at", "invalid_tool_readiness_probe");
  }
  if (hasRawEvidenceMarker(input.evidence_ref)) {
    addFieldReason(field_reasons, "evidence_ref", "invalid_tool_readiness_probe");
  }
  for (const [field, expected] of [
    ["network_required", false],
    ["session_inheritance_required", false],
    ["credential_access_required", false],
    ["raw_output_retained", false],
    ["affects_trust", false],
    ["affects_routing", false],
    ["launch_attempted", false],
  ]) {
    if (!hasOwnField(input, field) || input[field] !== expected) {
      addFieldReason(field_reasons, field, "invalid_tool_readiness_probe");
    }
  }
  if (
    Object.entries(input).some(([key, value]) => {
      return !ALLOWED_TOOL_READINESS_FIELDS.has(key) || hasRawMarkerInObject(value);
    })
  ) {
    addFieldReason(field_reasons, "$", "invalid_tool_readiness_probe");
  }

  const denied_reasons = [...new Set(field_reasons.map((reason) => reason.reason))];
  return {
    ok: field_reasons.length === 0,
    probe_id: safeReadinessText(input.probe_id),
    worker: ALLOWED_WORKERS.has(input.worker) ? input.worker : null,
    mode: ALLOWED_TOOL_READINESS_MODES.has(input.mode) ? input.mode : null,
    authority_level: input.authority_level === "non_executing" ? input.authority_level : null,
    readiness_state: safeToolReadinessState(input.readiness_state),
    evidence_ref: hasOwnField(input, "evidence_ref") && !hasRawEvidenceMarker(input.evidence_ref) ? input.evidence_ref : null,
    denied_reasons,
    field_reasons,
    denial_details: denialDetailsFor(field_reasons),
  };
}

export function validateDryRunPacket(packet) {
  const input = isRecord(packet) ? packet : {};
  const field_reasons = [];

  if (!isRecord(packet)) {
    addFieldReason(field_reasons, "$", "invalid_packet_object");
  }

  for (const field of REQUIRED_DRY_RUN_PACKET_FIELDS) {
    if (!hasOwnField(input, field)) {
      addFieldReason(field_reasons, field, "missing_required_field");
    } else if (isEmptyRequiredValue(input[field])) {
      addFieldReason(field_reasons, field, "empty_required_field");
    }
  }

  if ("worker" in input && !ALLOWED_WORKERS.has(input.worker)) {
    addFieldReason(field_reasons, "worker", "invalid_worker");
  }

  if ("mode" in input && !ALLOWED_MODES.has(input.mode)) {
    addFieldReason(field_reasons, "mode", "invalid_mode");
  }

  if ("authority_level" in input && !ALLOWED_AUTHORITY_LEVELS.has(input.authority_level)) {
    addFieldReason(field_reasons, "authority_level", "invalid_authority_level");
  }

  if ("review_requirement" in input && !ALLOWED_REVIEW_REQUIREMENTS.has(input.review_requirement)) {
    addFieldReason(field_reasons, "review_requirement", "invalid_review_requirement");
  }

  validateCommandAllowlist(field_reasons, input);
  validatePolicyDenials(field_reasons, input);
  validateEnvironmentAllowlist(field_reasons, input);
  validateStatusEvents(field_reasons, input);
  validateStatusPolicy(field_reasons, input);
  validatePathBoundaries(field_reasons, input);
  validateAuthoritySources(field_reasons, input);
  validatePacketMetadata(field_reasons, input);
  validateRetryPolicy(field_reasons, input);
  validateNonEmptyArray(field_reasons, input, "allowed_file_scopes", "path_escape");
  validateNonEmptyArray(field_reasons, input, "command_allowlist", "invalid_command_allowlist");
  validateNonEmptyArray(field_reasons, input, "stop_lines", "missing_required_stop_line");
  validateNonEmptyArray(field_reasons, input, "blocked_operations", "missing_blocked_authority_family");
  validateEvidenceRefs(field_reasons, input);

  if (hasOwnField(input, "stop_lines") && !sortedExactMatch(input.stop_lines, REQUIRED_STOP_LINES)) {
    addFieldReason(field_reasons, "stop_lines", "missing_required_stop_line");
  }

  if (hasOwnField(input, "blocked_operations") && !sortedExactMatch(input.blocked_operations, BLOCKED_AUTHORITY_FAMILIES)) {
    addFieldReason(field_reasons, "blocked_operations", "missing_blocked_authority_family");
  }

  const denied_reasons = [...new Set(field_reasons.map((reason) => reason.reason))];
  const denial_details = denialDetailsFor(field_reasons);

  return {
    ok: field_reasons.length === 0,
    packet_id: input.packet_id ?? null,
    worker: input.worker ?? null,
    mode: input.mode ?? null,
    authority_level: input.authority_level ?? null,
    denied_reasons,
    blocked_operations: arrayOrEmpty(input.blocked_operations),
    evidence_refs: arrayOrEmpty(input.evidence_refs),
    status_events: arrayOrEmpty(input.status_events),
    field_reasons,
    denial_details,
  };
}
