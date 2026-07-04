const backendProofBoundary = {
  authorityStage: "backend_proof",
  allowedOperations: [
    "contract.evaluate",
    "fixture.load",
    "memory_dispatcher.refill",
    "memory_dispatcher.claim",
    "memory_dispatcher.heartbeat",
    "memory_dispatcher.complete",
    "memory_dispatcher.fail",
    "memory_dispatcher.recover",
    "summary_json.emit",
    "pipeline_projection.read"
  ],
  realCapabilities: [
    "contract_objects",
    "workflow_core_lifecycle",
    "in_memory_dispatcher_adapter",
    "bounded_summary_json",
    "metadata_only_evidence_links",
    "source_boundary_tests"
  ],
  fakeCapabilities: [
    "simulated_worker_execution",
    "fixture_backed_work_supply",
    "in_memory_state",
    "metadata_only_completion_evidence"
  ],
  forbiddenCapabilities: [
    "live_tmux_mutation",
    "real_codex_worker_launch",
    "github_delivery",
    "provider_calls",
    "cleanup_apply",
    "bullmq_or_redis_runtime",
    "sqlite_runtime",
    "hatchet_runtime",
    "supervisor_runtime",
    "child_process_worker_dispatch",
    "raw_payload_retention"
  ]
};

export const BACKEND_PROOF_BOUNDARY = deepFreeze(backendProofBoundary);

const FORBIDDEN_OPERATION_MAP = new Map([
  ["tmux.mutate", "live_tmux_mutation"],
  ["codex_worker.launch", "real_codex_worker_launch"],
  ["github.delivery", "github_delivery"],
  ["provider.call", "provider_calls"],
  ["cleanup.apply", "cleanup_apply"],
  ["bullmq.runtime", "bullmq_or_redis_runtime"],
  ["redis.runtime", "bullmq_or_redis_runtime"],
  ["sqlite.runtime", "sqlite_runtime"],
  ["hatchet.runtime", "hatchet_runtime"],
  ["supervisor.runtime", "supervisor_runtime"],
  ["child_process.worker_dispatch", "child_process_worker_dispatch"],
  ["raw_payload_retention", "raw_payload_retention"],
  ["contracts.import_runtime", "runtime_boundary_violation"],
  ["workflow_core.import_adapter", "runtime_boundary_violation"],
  ["dashboard.import_runtime", "dashboard_boundary_violation"]
]);

const BASE_FORBIDDEN_PATTERNS = [
  ["tmux.mutate", /\btmux\s+(?:send-keys|new-session|kill-pane|kill-session|respawn-pane|split-window|rename-window|set-option|set-environment|capture-pane|paste-buffer)\b|["']tmux["'][\s\S]{0,160}["'](?:send-keys|new-session|kill-pane|kill-session|respawn-pane|split-window|rename-window|set-option|set-environment|capture-pane|paste-buffer)["']/i],
  ["codex_worker.launch", /\b(?:spawn|spawnSync|execFile|execFileSync|exec|execSync)\s*\(\s*["'](?:codex|claude|opencode)\b/i],
  ["github.delivery", /\bgh\s+(?:pr|repo|api|workflow)\b|(?:from|import)\s+["'][^"']*(?:@octokit|github)[^"']*["']|\bapi\.github\.com\b|\bgithub\.com\/repos\b|\bgit\s+push\b|GITHUB_(?:TOKEN|APP|REPOSITORY)/i],
  ["provider.call", /\b(?:OPENAI_API_KEY|ANTHROPIC_API_KEY|GOOGLE_API_KEY|providerPayload|provider\.call)\b|(?:from|import)\s+["'][^"']*(?:openai|anthropic|@google\/generative-ai)[^"']*["']|\bapi\.openai\.com\b|\banthropic\.com\/v1\b|\bgenerativelanguage\.googleapis\.com\b/i],
  ["cleanup.apply", /manager-cleanup-[\w-]+\.mjs[\s\S]{0,160}\s--apply|codex-workspace\.mjs[\s\S]{0,160}\bcleanup-(?:current|merged|branches|orphans)\b[\s\S]{0,160}\s--apply|\bcleanup-(?:current|merged|branches|orphans)\b[\s\S]{0,160}\s--apply/i],
  ["bullmq.runtime", /\b(?:from\s+["']bullmq(?:\/[^"']*)?["']|require\s*\(\s*["']bullmq(?:\/[^"']*)?["']|new\s+Queue\s*\()/i],
  ["redis.runtime", /\b(?:from\s+["'](?:ioredis|redis)(?:\/[^"']*)?["']|require\s*\(\s*["'](?:ioredis|redis)(?:\/[^"']*)?["']|new\s+Redis\s*\()/i],
  ["sqlite.runtime", /\b(?:from\s+["'](?:sqlite3|sqlite3\/[^"']*|better-sqlite3|better-sqlite3\/[^"']*|node:sqlite)["']|require\s*\(\s*["'](?:sqlite3|sqlite3\/[^"']*|better-sqlite3|better-sqlite3\/[^"']*|node:sqlite)["'])/i],
  ["hatchet.runtime", /\b(?:from\s+["']@hatchet[^"']*["']|require\s*\(\s*["']@hatchet[^"']*["']|new\s+Hatchet\s*\()/i],
  ["supervisor.runtime", /\bservices\/supervisor\b|\bsupervisor\/application\/service\b/i],
  ["child_process.worker_dispatch", /\bfrom\s+["'](?:node:)?child_process["']|\brequire\s*\(\s*["'](?:node:)?child_process["']\s*\)/i],
  ["raw_payload_retention", /\b(?:rawPrompt|rawCompletion|providerPayload|rawWorkerTranscript|unboundedLog|secret)\b/]
];

const SURFACE_IMPORT_RULES = {
  contracts: [
    ["contracts.import_runtime", /\b(?:from|import)\s+["'][^"']*(?:workflow-core|scripts\/lib|apps\/dashboard|bullmq|ioredis|redis|sqlite|hatchet|tmux|github|provider|node:fs|node:child_process|fs\/promises|child_process)|\brequire\s*\(\s*["'][^"']*(?:workflow-core|scripts\/lib|apps\/dashboard|bullmq|ioredis|redis|sqlite|hatchet|tmux|github|provider|node:fs|node:child_process|fs\/promises|child_process)/i]
  ],
  workflow_core: [
    ["workflow_core.import_adapter", /\b(?:from|import)\s+["'][^"']*(?:scripts\/lib|apps\/dashboard|services\/supervisor|bullmq|ioredis|redis|sqlite|hatchet|tmux|github|provider|node:fs|node:child_process|fs\/promises|child_process)|\brequire\s*\(\s*["'][^"']*(?:scripts\/lib|apps\/dashboard|services\/supervisor|bullmq|ioredis|redis|sqlite|hatchet|tmux|github|provider|node:fs|node:child_process|fs\/promises|child_process)/i]
  ],
  dashboard_projection: [
    ["dashboard.import_runtime", /\b(?:from|import)\s+["'][^"']*(?:scripts\/lib|memory-dispatcher-adapter|backend-proof-harness|workflow-core|services\/supervisor|tmux|github|provider|RefillJob|WorkItem|Lease|ExecutionAttempt)|\brequire\s*\(\s*["'][^"']*(?:scripts\/lib|memory-dispatcher-adapter|backend-proof-harness|workflow-core|services\/supervisor|tmux|github|provider|RefillJob|WorkItem|Lease|ExecutionAttempt)/i]
  ],
  backend_proof: []
};

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

export function classifyBackendProofOperation(operation) {
  if (BACKEND_PROOF_BOUNDARY.allowedOperations.includes(operation)) {
    return {
      allowed: true,
      operation,
      authorityStage: BACKEND_PROOF_BOUNDARY.authorityStage,
      authorityClass: "allowed_unattended",
      authorityStopReason: null
    };
  }
  const capability = FORBIDDEN_OPERATION_MAP.get(operation) ?? "unlisted_backend_proof_operation";
  return {
    allowed: false,
    operation,
    capability,
    authorityStage: BACKEND_PROOF_BOUNDARY.authorityStage,
    authorityClass: "forbidden",
    authorityStopReason: `backend_proof_forbids_${capability}`
  };
}

export function classifyBackendProofSourceBoundary({ path, source, surface = "backend_proof" }) {
  const rules = [...BASE_FORBIDDEN_PATTERNS, ...(SURFACE_IMPORT_RULES[surface] ?? [])];
  const violations = [];
  for (const [operation, pattern] of rules) {
    const match = pattern.exec(source);
    pattern.lastIndex = 0;
    if (match) {
      const decision = classifyBackendProofOperation(operation);
      violations.push({
        path,
        operation,
        capability: decision.capability ?? operation,
        authorityStage: BACKEND_PROOF_BOUNDARY.authorityStage,
        authorityClass: "forbidden",
        authorityStopReason: decision.authorityStopReason ?? `backend_proof_forbids_${operation}`,
        line: lineForIndex(source, match.index),
        rule: operation
      });
    }
  }
  return {
    ok: violations.length === 0,
    path,
    surface,
    violations
  };
}

export function buildBackendProofEvidencePacket({ runId, result, evidenceRefs = [] }) {
  return {
    schema_version: "manager_control_plane.backend_proof_boundary.v1",
    run_id: runId,
    authority_stage: BACKEND_PROOF_BOUNDARY.authorityStage,
    result,
    real: [...BACKEND_PROOF_BOUNDARY.realCapabilities],
    fake: [...BACKEND_PROOF_BOUNDARY.fakeCapabilities],
    forbidden: [...BACKEND_PROOF_BOUNDARY.forbiddenCapabilities],
    evidence_refs: sanitizeEvidenceRefs(evidenceRefs),
    metadata_only: true,
    raw_payload_retained: false,
    next_actions: result === "blocked"
      ? ["remove_forbidden_backend_proof_operation_or_promote_authority_stage"]
      : ["continue_backend_proof"]
  };
}

function sanitizeEvidenceRefs(evidenceRefs) {
  return evidenceRefs.map((ref) => {
    if (typeof ref === "string" && /^[A-Za-z0-9._:/#-]{1,160}$/.test(ref)) return ref;
    if (ref && typeof ref === "object") {
      const label = typeof ref.label === "string" && /^[A-Za-z0-9._:/#-]{1,80}$/.test(ref.label) ? ref.label : "redacted";
      return `metadata-only:${label}`;
    }
    return "metadata-only:redacted";
  });
}

function lineForIndex(source, index) {
  return source.slice(0, index).split("\n").length;
}
