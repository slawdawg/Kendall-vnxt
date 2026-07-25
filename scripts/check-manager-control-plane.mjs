#!/usr/bin/env node
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { buildCodexAdvisorClassificationPlan, buildCodexAdvisorPacketPlan, buildContinuousRunPlan, buildCyclePacket, buildDeliveryPlan, buildFeedbackPlan, buildManagerSelfRepairSummary, buildProgressBeaconPlan, buildRecoveryPlan, buildSourceBackedPacketSeedPlan, buildSteeringPlan, buildWorkerFrictionPlan, buildWorkerLifecyclePlan, buildWorkerQuestionAnswerPlan, classifyAutoApply, ledgerCommand } from "./lib/manager-control-plane/core.mjs";
import { findManagerTmuxControlViolations } from "./lib/manager-control-plane/tmux-cwd-rebind-contract.mjs";

const rootDir = fileURLToPath(new URL("..", import.meta.url));

function readWorkspaceFile(path) {
  return readFileSync(join(rootDir, path), "utf8");
}

function assertCondition(condition, message, failures) {
  if (!condition) failures.push(message);
}

function assertGitTracked(path, failures) {
  const trackedCheck = spawnSync("git", ["ls-files", "--error-unmatch", "--", path], {
    cwd: rootDir,
    encoding: "utf8",
    stdio: "pipe",
  });
  assertCondition(trackedCheck.status === 0, `Manager source artifact must be tracked by git: ${path}`, failures);
}

function assertAggregateIncludes(scriptName, command, failures) {
  const script = packageJson.scripts?.[scriptName] || "";
  const segments = script.split("&&").map((segment) => segment.trim());
  const matchingSegments = segments.filter((segment) => segment === command);
  assertCondition(matchingSegments.length > 0, `package.json ${scriptName} must execute ${command} as an unmasked command segment`, failures);
  assertCondition(!script.includes(`${command} || true`), `package.json ${scriptName} must not mask ${command} with || true`, failures);
  assertCondition(!script.includes(`echo ${command}`), `package.json ${scriptName} must not only echo ${command}`, failures);
}

function writeFreshDispatcherSummary(stateRoot, runId = "manager-contract") {
  writeFileSync(join(stateRoot, "manager-runs", runId, "dispatcher-summary.json"), JSON.stringify({
    stateSource: "dispatcher-summary-fixture",
    freshness: "fresh",
    currentPhase: "ready",
    nextAction: "none",
    updatedAt: "2026-06-30T00:00:00.000Z",
    counts: { queued: 1, active: 0, blocked: 0, failed: 0 },
    rawPayloadRetained: false,
  }, null, 2));
}

function readyReconciliationSignals({
  runId = "manager-contract",
  laneId = "lane-contract",
  branch = "codex/lane-contract",
  workerId = "codex-1",
  headSha = "abc123",
  baseBranch = "dev",
  checkpoint = "checkpoint-contract",
} = {}) {
  return {
    dispatcher: { laneId, branch, owner: `${runId}/dispatcher`, state: "leased", leaseState: "active", eventWatermark: "evt-10", freshness: "fresh" },
    ledger: { laneId, branch, owner: `${runId}/ledger`, state: "active", latestSafeCheckpoint: checkpoint, eventWatermark: "evt-10", freshness: "fresh" },
    workers: { laneId, branch, owner: `${runId}/${workerId}`, state: "active", freshness: "fresh" },
    tmux: { laneId, branch, owner: `${runId}/${workerId}`, state: "active", freshness: "fresh" },
    assignment: { laneId, branch, owner: `${runId}/assignment`, state: "assigned", freshness: "fresh" },
    workspace: { laneId, branch, owner: `${runId}/workspace`, state: "active", dirty: false, freshness: "fresh" },
    git: { laneId, branch, state: "active", headSha, baseBranch, dirty: false, freshness: "fresh" },
    pr: { laneId, branch, state: "open", headSha, baseBranch, freshness: "fresh" },
  };
}

const failures = [];
const packageJson = JSON.parse(readWorkspaceFile("package.json"));
const checkScript = readWorkspaceFile("scripts/check-manager-control-plane.mjs");
const supervisorTestRunner = readWorkspaceFile("scripts/run-supervisor-tests.mjs");
const requiredFiles = [
  ".agents/skills/kendall-manager-control-plane/SKILL.md",
  "packages/contracts/src/manager-control-plane/review-route.ts",
  "scripts/lib/manager-control-plane/core.mjs",
  "scripts/lib/manager-control-plane/review-route.mjs",
  "scripts/lib/manager-control-plane/simulated-review-adapter.mjs",
  "scripts/lib/manager-control-plane/forbidden-boundary.mjs",
  "scripts/lib/manager-control-plane/README.md",
  "scripts/manager-preflight.mjs",
  "scripts/manager-resource-status.mjs",
  "scripts/manager-usage-status.mjs",
  "scripts/manager-worker-status.mjs",
  "scripts/manager-worker-recovery-inspection.mjs",
  "scripts/manager-worker-answer-question.mjs",
  "scripts/manager-worker-owner-delegation.mjs",
  "scripts/manager-worker-progress.mjs",
  "scripts/manager-worker-progress-signal.mjs",
  "scripts/manager-worker-code-review.mjs",
  "scripts/manager-worker-review-feedback.mjs",
  "scripts/manager-worker-prompt-probe.mjs",
  "scripts/manager-worker-submit-pending.mjs",
  "scripts/manager-worker-retire.mjs",
  "scripts/manager-worker-clean-cycle-observer.mjs",
  "scripts/manager-worker-warm.mjs",
  "scripts/manager-worker-handoff.mjs",
  "scripts/manager-lane-advance.mjs",
  "scripts/manager-capability-posture.mjs",
  "scripts/manager-codex-advisor-packet.mjs",
  "scripts/manager-refill-plan.mjs",
  "scripts/manager-source-intake-cycle.mjs",
  "scripts/manager-supervisor-source-intake.mjs",
  "scripts/manager-source-packet-seed.mjs",
  "scripts/manager-cleanup-plan.mjs",
  "scripts/manager-dirty-workspace-preservation.mjs",
  "scripts/manager-stale-owner-inspection.mjs",
  "scripts/manager-resume-state.mjs",
  "scripts/manager-cycle-packet.mjs",
  "scripts/manager-run-loop.mjs",
  "scripts/manager-ledger.mjs",
  "scripts/run-manager-control-plane-fast-tests.mjs",
  "scripts/run-manager-control-plane-shards.mjs",
  "scripts/run-supervisor-tests.mjs",
  "scripts/lib/manager-control-plane-verification.mjs",
  "scripts/lib/manager-control-plane/manager-supervisor-source-intake.mjs",
  "tests/manager-control-plane.test.mjs",
  "tests/manager-source-intake-cycle.test.mjs",
  "tests/manager-continuous-source-intake.test.mjs",
  "tests/manager-supervisor-source-intake.test.mjs",
  "tests/manager-control-plane-verification.test.mjs",
  "tests/manager-control-plane.contract.test.mjs",
  "tests/manager-review-route.test.mjs",
  "services/supervisor/src/supervisor/domain/review_route.py",
  "services/supervisor/tests/integration/test_review_route_packet.py",
  "tests/manager-control-plane.dispatcher-port.test.mjs",
  "tests/manager-control-plane.forbidden-boundary.test.mjs",
  "tests/manager-control-plane.run-contract.test.mjs",
  "tests/manager-worker-clean-cycle-observer.test.mjs",
];

for (const path of requiredFiles) {
  assertCondition(existsSync(join(rootDir, path)), `Missing manager control plane artifact ${path}`, failures);
  assertGitTracked(path, failures);
}

for (const [name, command] of [
  ["manager:preflight", "node ./scripts/manager-preflight.mjs --summary-json"],
  ["manager:resource", "node ./scripts/manager-resource-status.mjs --summary-json"],
  ["manager:usage", "node ./scripts/manager-usage-status.mjs --summary-json"],
  ["manager:worker", "node ./scripts/manager-worker-status.mjs --summary-json"],
  ["manager:worker:recovery", "node ./scripts/manager-worker-recovery-inspection.mjs --summary-json"],
  ["manager:worker:answer-question", "node ./scripts/manager-worker-answer-question.mjs --summary-json"],
  ["manager:worker:owner-delegation", "node ./scripts/manager-worker-owner-delegation.mjs --summary-json"],
  ["manager:worker:progress", "node ./scripts/manager-worker-progress.mjs --summary-json"],
  ["manager:worker:progress-signal", "node ./scripts/manager-worker-progress-signal.mjs --summary-json"],
  ["manager:worker:code-review", "node ./scripts/manager-worker-code-review.mjs --summary-json"],
  ["manager:worker:review-feedback", "node ./scripts/manager-worker-review-feedback.mjs --summary-json"],
  ["manager:worker:prompt-probe", "node ./scripts/manager-worker-prompt-probe.mjs --summary-json"],
  ["manager:worker:submit-pending", "node ./scripts/manager-worker-submit-pending.mjs --summary-json"],
  ["manager:worker:retire", "node ./scripts/manager-worker-retire.mjs --summary-json"],
  ["manager:worker:cycles", "node ./scripts/manager-worker-clean-cycle-observer.mjs --summary-json"],
  ["manager:worker:warm", "node ./scripts/manager-worker-warm.mjs --summary-json"],
  ["manager:worker:handoff", "node ./scripts/manager-worker-handoff.mjs --summary-json"],
  ["manager:lane-advance", "node ./scripts/manager-lane-advance.mjs --summary-json"],
  ["manager:capability-posture", "node ./scripts/manager-capability-posture.mjs --summary-json"],
  ["manager:codex-advisor", "node ./scripts/manager-codex-advisor-packet.mjs --summary-json"],
  ["manager:cycle", "node ./scripts/manager-cycle-packet.mjs --summary-json"],
  ["manager:refill", "node ./scripts/manager-refill-plan.mjs --summary-json"],
  ["manager:source-intake-cycle", "node ./scripts/manager-source-intake-cycle.mjs"],
  ["manager:supervisor-source-intake", "node ./scripts/manager-supervisor-source-intake.mjs"],
  ["manager:source-packet-seed", "node ./scripts/manager-source-packet-seed.mjs --summary-json"],
  ["manager:cleanup", "node ./scripts/manager-cleanup-plan.mjs --summary-json"],
  ["manager:dirty-workspace-preservation", "node ./scripts/manager-dirty-workspace-preservation.mjs --summary-json"],
  ["manager:stale-owner", "node ./scripts/manager-stale-owner-inspection.mjs --summary-json"],
  ["manager:resume", "node ./scripts/manager-resume-state.mjs --summary-json"],
  ["manager:run", "node ./scripts/manager-run-loop.mjs --summary-json"],
  ["test:manager-control-plane", "pnpm run test:manager-control-plane:preflight && pnpm run test:manager-control-plane:full"],
  ["test:manager-control-plane:preflight", "pnpm run test:manager-control-plane:contracts && pnpm run test:manager-control-plane:focused && pnpm run test:manager-control-plane:verification"],
  ["test:manager-control-plane:contracts", "node ./scripts/run-manager-control-plane-fast-tests.mjs contracts && pnpm run test:manager-control-plane-tmux-cwd-rebind-contract"],
  ["test:manager-control-plane:focused", "node ./scripts/run-manager-control-plane-fast-tests.mjs focused && node --test tests/manager-review-route.test.mjs"],
  ["test:manager-control-plane:verification", "node --test tests/manager-control-plane-verification.test.mjs"],
  ["test:supervisor", "node ./scripts/run-supervisor-tests.mjs"],
  ["test:supervisor:review-route", "node ./scripts/run-supervisor-tests.mjs tests/integration/test_review_route_packet.py -q"],
  ["test:manager-source-intake", "node --test tests/manager-continuous-source-intake.test.mjs tests/manager-default-bmad-source-resolution.test.mjs tests/manager-source-intake-cycle.test.mjs tests/manager-supervisor-source-intake.test.mjs && uv run --directory services/supervisor pytest tests/integration/test_manager_source_intake_adapter.py -q"],
  ["test:manager-control-plane:full", "node ./scripts/run-manager-control-plane-shards.mjs all --jobs 1"],
  ["test:manager-control-plane:shard:refill-source", "node ./scripts/run-manager-control-plane-shards.mjs refill-source"],
  ["test:manager-control-plane:shard:worker-review", "node ./scripts/run-manager-control-plane-shards.mjs worker-review"],
  ["test:manager-control-plane:shard:worker-lifecycle", "node ./scripts/run-manager-control-plane-shards.mjs worker-lifecycle"],
  ["test:manager-control-plane:shard:worker-progress", "node ./scripts/run-manager-control-plane-shards.mjs worker-progress"],
  ["test:manager-control-plane:shard:worker-pointer", "node ./scripts/run-manager-control-plane-shards.mjs worker-pointer"],
  ["test:manager-control-plane:shard:worker-friction", "node ./scripts/run-manager-control-plane-shards.mjs worker-friction"],
  ["test:manager-control-plane:shard:worker-supply", "node ./scripts/run-manager-control-plane-shards.mjs worker-supply"],
  ["test:manager-control-plane:shard:worker-warm-continuation", "node ./scripts/run-manager-control-plane-shards.mjs worker-warm-continuation"],
  ["test:manager-control-plane:shard:worker-active-continuation", "node ./scripts/run-manager-control-plane-shards.mjs worker-active-continuation"],
  ["test:manager-control-plane:shard:lane-advance-worker-owner", "node ./scripts/run-manager-control-plane-shards.mjs lane-advance-worker-owner"],
  ["test:manager-control-plane:shard:continuous-worker-auto-actions", "node ./scripts/run-manager-control-plane-shards.mjs continuous-worker-auto-actions"],
  ["test:manager-control-plane:shard:worker-continuation", "node ./scripts/run-manager-control-plane-shards.mjs worker-continuation"],
  ["test:manager-control-plane:shard:worker", "node ./scripts/run-manager-control-plane-shards.mjs worker"],
  ["test:manager-control-plane:shard:cycle-runtime", "node ./scripts/run-manager-control-plane-shards.mjs cycle-runtime"],
  ["test:manager-control-plane:shard:delivery-cleanup", "node ./scripts/run-manager-control-plane-shards.mjs delivery-cleanup"],
  ["test:manager-control-plane:shard:ledger-recovery", "node ./scripts/run-manager-control-plane-shards.mjs ledger-recovery"],
  ["test:manager-control-plane:shard:misc", "node ./scripts/run-manager-control-plane-shards.mjs misc"],
  ["test:manager-control-plane-contract", "node --test tests/manager-control-plane.contract.test.mjs"],
  ["test:manager-control-plane-dispatcher-port", "node --test tests/manager-control-plane.dispatcher-port.test.mjs"],
  ["test:manager-control-plane-forbidden-boundary", "node --test tests/manager-control-plane.forbidden-boundary.test.mjs"],
  ["test:manager-control-plane-run-contract", "node --test tests/manager-control-plane.run-contract.test.mjs"],
  ["test:manager-control-plane-tmux-cwd-rebind-contract", "node --test tests/manager-control-plane-tmux-cwd-rebind-contract.test.mjs"],
  ["test:manager-worker-clean-cycle-observer", "node --test tests/manager-worker-clean-cycle-observer.test.mjs"],
  ["check:manager-control-plane", "node ./scripts/check-manager-control-plane.mjs"],
]) {
  assertCondition(packageJson.scripts?.[name] === command, `package.json must define ${name} as ${command}`, failures);
}

assertCondition(
  supervisorTestRunner.includes('options.pytestArgs.length > 0 ? options.pytestArgs : ["tests"]'),
  "Supervisor test runner must retain the default full Python test root for review-route parity.",
  failures,
);

for (const aggregateScript of ["check:static", "check"]) {
  assertAggregateIncludes(aggregateScript, "pnpm run test:manager-control-plane", failures);
  assertAggregateIncludes(aggregateScript, "pnpm run test:manager-control-plane-contract", failures);
  assertAggregateIncludes(aggregateScript, "pnpm run test:manager-control-plane-dispatcher-port", failures);
  assertAggregateIncludes(aggregateScript, "pnpm run test:manager-control-plane-forbidden-boundary", failures);
  assertAggregateIncludes(aggregateScript, "pnpm run test:manager-control-plane-run-contract", failures);
  assertAggregateIncludes(aggregateScript, "pnpm run check:manager-control-plane", failures);
}
assertAggregateIncludes("check", "pnpm run test:supervisor:review-route", failures);

const gitignore = readWorkspaceFile(".gitignore");
assertCondition(gitignore.includes("/skills/"), ".gitignore must ignore only root /skills/ generated output", failures);
assertCondition(gitignore.includes(".agents/skills/**/.decision-log.md"), ".gitignore must keep generated skill decision logs local-only", failures);

const ignoredCheck = spawnSync("git", ["check-ignore", "-q", "--", ".agents/skills/kendall-manager-control-plane/SKILL.md"], {
  cwd: rootDir,
  encoding: "utf8",
  stdio: "pipe",
});
assertCondition(ignoredCheck.status !== 0, ".agents/skills/kendall-manager-control-plane/SKILL.md must not be ignored", failures);
assertCondition(ignoredCheck.status === 1, `git check-ignore must report not ignored for manager skill, got status ${ignoredCheck.status}`, failures);

if (existsSync(join(rootDir, ".agents/skills/kendall-manager-control-plane/SKILL.md"))) {
  const skill = readWorkspaceFile(".agents/skills/kendall-manager-control-plane/SKILL.md");
  const normalizedSkill = skill.toLowerCase();
  for (const requiredText of [
    "node ./scripts/manager-preflight.mjs --summary-json",
    "node ./scripts/manager-refill-plan.mjs --summary-json",
    "node ./scripts/manager-cycle-packet.mjs --summary-json",
    "node ./scripts/manager-run-loop.mjs --summary-json",
    "node ./scripts/manager-resume-state.mjs --summary-json",
    "node ./scripts/manager-ledger.mjs init --run-id <run-id> --summary-json",
    "Dogfood Test Item Mode",
    "pnpm run check:safe-backlog",
    "Manager runtime state lives under",
    "At or below 2% 5-hour usage remaining",
    "Never requeue completed lanes",
    "current MVP supports classification",
    "Keep backend-only and test-only completions heartbeat-level",
    "Classify immediate operator feedback",
    "Stop for explicit operator approval",
    "Continuous Mode",
    "Useful Work Priority",
    "Degraded Capability Modes",
    "managerCapabilityPosture",
    "parked, degraded, or blocked",
    "compact posture visibility",
    "capability-posture.json",
    "manager-capability-posture.mjs",
    "tmuxWorkerMutation",
    "dispatchApply",
    "reviewDelegation",
    "self_fix_churn",
    "manager-codex-advisor-packet.mjs",
    "It must not call a provider from the manager loop",
    "edit manager code",
    "At most one manager self-repair action may run in a cycle",
    "Code or contract changes to the manager itself are not background work",
  ]) {
    assertCondition(skill.includes(requiredText), `Manager skill must include ${requiredText}`, failures);
  }
  for (const requiredConcept of [
    "manager-only mode",
    "drain mode",
    "critical CPU/RAM pressure",
    "narrowest BMAD workflow",
    "metadata-only",
  ]) {
    assertCondition(normalizedSkill.includes(requiredConcept.toLowerCase()), `Manager skill must include concept ${requiredConcept}`, failures);
  }
  assertCondition(
    normalizedSkill.includes("raw prompt") &&
      normalizedSkill.includes("completion") &&
      normalizedSkill.includes("reasoning trace") &&
      normalizedSkill.includes("provider payload"),
    "Manager skill must include metadata-only retention stop-line language",
    failures,
  );
}

if (existsSync(join(rootDir, "scripts/lib/manager-control-plane/core.mjs"))) {
  const core = readWorkspaceFile("scripts/lib/manager-control-plane/core.mjs");
  for (const requiredText of [
    "parseCodexUsageOutput",
    "parseCodexFetcherUsage",
    "fetch_codex_usage.py",
    "usage-fetcher-failed",
    "buildResourceStatus",
    "buildTmuxOrientationStatus",
    "buildAssignmentResume",
    "buildRefillPlan",
    "buildSourceBackedPacketSeedPlan",
    "source-backed-dispatcher-refill-refresh",
    "buildMatureToolEvaluationPlan",
    "buildLargeSliceContinuationPlan",
    "buildDispatchPreview",
    "dispatchPreview",
    "buildWorkerLifecyclePlan",
    "warmPool",
    "dispatcher_lease_pull",
    "sourceExhausted",
    "worker-handoff-no-fallback-workers",
    "worker-handoff-resource-stop-line",
    "buildWorkerQuestionAnswerPlan",
    "buildWorkerSubmitPendingPlan",
    "buildWorkerRetirePlan",
    "buildDirtyWorkspacePreservation",
    "buildWorkerFrictionPlan",
    "buildLaneAdvancementPlan",
    "buildDeliveryPlan",
    "buildFeedbackPlan",
    "buildCodexAdvisorPacketPlan",
    "buildCodexAdvisorClassificationPlan",
    "metadata_only_codex_advisor_packet",
    "do_not_edit_manager_code",
    "do_not_call_provider_from_manager",
    "codex-advisor-packet-ready",
    "codex-advisor-posture-preview-ready",
    "buildProgressBeaconPlan",
    "buildRecoveryPlan",
    "buildSteeringPlan",
    "classifyAutoApply",
    "buildCyclePacket",
    "buildContinuousRunPlan",
    "continuous",
    "manager-owned-worker-enter-only-repair-existing-gates",
    "manager-owned-worker-progress-signal-existing-gates",
    "manager-owned-worker-warm-existing-gates",
    "manager-owned-worker-handoff-existing-gates",
    "metadata-only-worker-recovery-inspection",
    "manager-owned-worker-retire-after-recovery-existing-gates",
    "manager-owned-worker-retire-after-policy-blocked-question-existing-gates",
    "retire_blocked_question",
    "source-owned-refill-planning-existing-gates",
    "codex-workspace-dispatch-existing-gates",
    "continuous-worker-warm",
    "continuous-worker-handoff",
    "continuous-worker-retire",
    "unsafe_question_policy_blocked",
    "useful_work_first",
    "continuous-codex-advisor-packet-ready",
    "buildContinuousCodexAdvisorSummary",
    "buildManagerCapabilityPosture",
    "buildManagerCapabilityPostureControlPlan",
    "readManagerCapabilityPosture",
    "writeManagerCapabilityPosture",
    "manager_capability_posture.v1",
    "capability-posture.json",
    "manager-capability-posture.mjs",
    "capability_posture",
    "managerCapabilityStatus",
    "normalizeHeartbeatCapabilityPosture",
    "capabilityPosture",
    "tmuxWorkerMutation",
    "dispatchApply",
    "reviewDelegation",
    "cleanupApply",
    "workClass",
    "self_fix_churn",
    "manager.self_repair.attempted",
    "buildManagerSelfRepairSummary",
    "continuous-lane-advance-apply",
    "continuous-refill-apply",
    "continuous-dispatch-apply",
    "manager-owned-lane-advancement-heartbeat-existing-gates",
    "assignment_heartbeat_metadata_only",
    "local_bmad_refill_artifacts",
    "assignment_workspace_claim_only",
    "manager-lane-advance-ready",
    "continuous-worker-recovery-inspection",
    "worker_recovery_inspection",
    "recovery_inspected",
    "recovery_submit_unanswered",
    "submitPendingAfterRecoveryInspection",
    "buildResumeState",
    "buildLedgerReadiness",
    "ledgerCommand",
    "reconcile-state",
    "--preflight-file",
    "manager-preflight.v1",
    "reconcile-preflight-producer-unsupported",
    "reconcile-preflight-schema-unsupported",
    "reconcile-preflight-allowed-conflict",
    "reconcile-preflight-dispatch-apply-unsafe",
    "reconcile-state-state-conflict",
    "ledger-append-lock-timeout",
    "manager.replay.summarized",
    "dispatcher-preflight-only",
    "followUpGatesRequired",
    "dispatchApplyAllowed",
    "noDispatchStop",
    "reconcile-state-apply-rolled-back",
    "reconciliationPreStateDigest",
    "reconciliationPostStateDigest",
    "reconcileImmutableEventMismatch",
    "repairedDuplicate",
    "mission.json",
    "workers.json",
    "events.ndjson",
    "checkpoints.json",
    "questions.ndjson",
    "resource-snapshots.ndjson",
    "usage-snapshots.ndjson",
    "auto_apply_allowed",
    "dry_run_required",
    "missingProof",
    "existingGateProof",
    "refill.metadata",
    "cleanup.merged-lane",
    "blocked",
    "append-question",
    "append-checkpoint",
    "append-resource-snapshot",
    "append-usage-snapshot",
    "metadata-only",
    "manager_only",
    "blockedLaneAssignments",
    "blockedWorkspaceAssignments",
    "safe-backlog-starvation",
    "source-evidence-missing",
    "source-evidence-ambiguous",
    "sourceSlice",
    "candidateLanes",
    "closedEvidence",
    "preserve_do_not_requeue",
    "workCreationStep",
    "bmad-create-story",
    "bmad-check-implementation-readiness",
    "bmad-ux",
    "bmad-create-architecture",
    "local_bmad_output",
    "do_not_execute_bmad_workflow",
    "splitPlan",
    "split_proposed",
    "keep_story_boundary",
    "coveredAcceptanceCriteria",
    "mergeOrder",
    "reconciliationStep",
    "split-coupled-surface",
    "allowedTarget",
    "safeWorkSupply",
    "activeAssignments",
    "safe-work-supply-limited",
    "usage-drain",
    "resource-pressured",
    "worker-target-stop-line",
    "tmux-unmanaged-orientation-evidence",
    "tmux-takeover-required",
    "dispatchPosture",
    "preserve_task_fit_quality",
    "dispatch-posture-blocked",
    "usage-manager-only",
    "resource-critical",
    "lifecyclePlan",
    "plan_only_existing_gates_required",
    "recordRequirements",
    "visibleSessionName",
    "ownerId",
    "assignmentState",
    "durable_handoff_file",
    "literal_safe_tmux_buffer",
    "fragile_long_key_injection",
    "critical_drain",
    "planned-manager-owned-termination",
    "managerOwnedOnly",
    "idle_warm_before_active",
    "killOrder",
    "not-manager-owned",
    "questionHandling",
    "compactAnswer",
    "answer_with_best_judgment",
    "narrow_question",
    "escalate_to_operator",
    "block_unsafe_continuation",
    "material_decision_only",
    "do_not_record_non_material",
    "leaseContinuation",
    "blocked_pending_operator",
    "blocked_pending_source_context",
    "provider_calls_require_operator_approval",
    "ambiguous_product_direction_requires_operator",
    "metadata_only_question_policy",
    "worker-friction-loop-detected",
    "escalate_model_reasoning",
    "narrow_slice",
    "reassign_lane",
    "park_lane",
    "high_effort_task_fit",
    "standard_task_fit",
    "reduce_dispatch_not_model_quality",
    "high-expected-rework-cost",
    "high-verification-difficulty",
    "task-type-high-reasoning",
    "ambiguous-verification-failure",
    "unknown-task-risk-input",
    "escalate_for_quality_risk",
    "focused_plus_integration_verification",
    "avoid_underfit_rework",
    "usage_pressure_limits_new_leases_before_quality",
    "usageInputStatus",
    "rawPayloadRetained",
    "codex-workspace.mjs finish-pr",
    "reviewThreadsResolved",
    "localVerificationPassed",
    "managed-worktree",
    "remote-branch",
    "park_ambiguous_lane",
    "auto_repair_allowed",
    "tool_churn_rca",
    "docs/workflows/tool-churn-rca.md",
    "pause_new_dispatch",
    "resume_dispatch_when_governors_allow",
    "--steering",
    "--operator-instruction",
    "--feedback",
    "--operator-feedback",
    "drain_and_stop",
    "drain_and_shift_focus",
    "reduce_worker_target",
    "reduce_progress_beacon_frequency",
    "report_testable_work",
    "manager.steering",
    "plan_only_reporting",
    "daily_use_checkpoint",
    "heartbeat_only",
    "backend_or_test_only_no_visible_unblock_or_risk_reduction",
    "state_change_or_hourly",
    "healthy_active",
    "hasUsefulCheckpointDetails",
    "plan_only_feedback_routing",
    "pause_affected_delivery_and_prevent_merge",
    "prevent_affected_pr_merge",
    "continue_unrelated_safe_lanes",
    "create_correction_lane",
    "record_future_work",
    "delivery-blocking-feedback",
    "all_affected_delivery",
    "hold_until_correction_resolved",
  ]) {
    assertCondition(core.includes(requiredText), `Manager core must include ${requiredText}`, failures);
  }
  assertCondition(core.includes("verifyTmuxPointerSubmitted"), "Manager core must include bounded tmux pointer receipt verification", failures);
  assertCondition(core.includes('["capture-pane", "-J", "-p", "-t", target, "-S", start]'), "Manager core may use capture-pane only for bounded pointer receipt checks", failures);
  failures.push(...findManagerTmuxControlViolations(core));
  assertCondition(!/send-keys[\s\S]{0,120}(handoff|prompt|assignment|task|branch)/i.test(core), "Manager core must not use send-keys for long handoff text", failures);
}

const sourceSeed = buildSourceBackedPacketSeedPlan(
  {
    runId: "manager-contract",
    candidateId: "contract-source-seed",
    sourceRefs: ["doc:docs/workflows/current-session-runbook.md"],
    acceptanceCriteria: ["AC contract source seed eligible"],
    verificationTargets: ["node --test tests/manager-control-plane.test.mjs"],
    touchedSurfaceHint: "scripts/lib/manager-control-plane/core.mjs",
    riskClass: "low",
    authorityClass: "allowed_unattended",
  },
  {},
);
assertCondition(sourceSeed.status === "ready", "Source-backed packet seed must produce an eligible packet", failures);
assertCondition(sourceSeed.summary.seedPacket?.eligibilityDecision === "eligible", "Source-backed packet seed must run eligibility", failures);
assertCondition(sourceSeed.summary.rawPayloadRetained === false, "Source-backed packet seed must retain metadata only", failures);

const autoProof = {
  resourceState: "normal",
  usageState: "normal",
  authorityBasis: "manager-owned-low-risk-mvp",
  ownershipEvidence: "manager-run-owner",
  sourceEvidence: "manager-runtime-state",
  recoveryPath: "inspect manager ledger event and remove manager-owned state if needed",
};
const allowed = classifyAutoApply("ledger.append", autoProof);
assertCondition(allowed.posture === "auto_apply_allowed", "Manager core must allow low-risk manager-owned ledger append when posture is normal", failures);
const dryRun = classifyAutoApply("dispatch.apply", { resourceState: "normal", usageState: "normal" });
assertCondition(dryRun.posture === "dry_run_required", "Manager core must require proof before dispatch apply", failures);
assertCondition(dryRun.missingProof?.includes("existingGateProof"), "Manager core must explain missing existing gate proof for dispatch", failures);
const gatedDispatch = classifyAutoApply("dispatch.apply", { ...autoProof, sourceEvidence: "codex-workspace-existing-gates", operationGate: "existing-gates-proven" });
assertCondition(gatedDispatch.posture === "auto_apply_allowed", "Manager core must allow dispatch through proven existing gates", failures);
const drainDispatch = classifyAutoApply("dispatch.apply", { ...autoProof, authorityBasis: "codex-workspace-existing-gates", sourceEvidence: "codex-workspace-existing-gates", usageState: "drain", operationGate: "existing-gates-proven" });
assertCondition(drainDispatch.posture === "dry_run_required", "Manager core must not auto-apply dispatch while usage drain stops dispatch", failures);
const refillAuto = classifyAutoApply("refill.metadata", { ...autoProof, authorityBasis: "source-owned-refill-planning", sourceEvidence: "source-owned-refill-plan" });
assertCondition(refillAuto.posture === "auto_apply_allowed", "Manager core must allow source-proven refill metadata", failures);
const cleanupAuto = classifyAutoApply("cleanup.merged-lane", { ...autoProof, authorityBasis: "merged-lane-cleanup-gates", sourceEvidence: "merged-pr-cleanup-proof", operationGate: "existing-gates-proven" });
assertCondition(cleanupAuto.posture === "auto_apply_allowed", "Manager core must allow merged lane cleanup with existing gate proof", failures);
const invalidProof = classifyAutoApply("ledger.append", { ...autoProof, authorityBasis: "whatever", sourceEvidence: "chat-only" });
assertCondition(invalidProof.posture === "dry_run_required", "Manager core must reject arbitrary proof strings", failures);
const blocked = classifyAutoApply("ledger.append", { ...autoProof, resourceState: "critical" });
assertCondition(blocked.posture === "blocked", "Manager core must block manager-owned mutation under critical resource pressure", failures);
const deliverySubagentAuditContract = {
  status: "merge-ready",
  headSha: "abc",
  agent: "delivery-auditor",
  summary: "Independent delivery subagent found the exact-head delivery gates merge-ready.",
  evidenceRefs: ["evidence:delivery-subagent-audit"],
  metadataOnly: true,
  rawPayloadRetained: false,
};
const deliveryReady = buildDeliveryPlan({
  runId: "manager-contract",
  lane: {
    laneId: "lane-contract",
    managerOwned: true,
    workspaceGate: "codex-workspace",
    prNumber: 1,
    headSha: "abc",
    expectedHeadSha: "abc",
    prHeadSha: "abc",
    branch: "codex/lane-contract",
    deliveryGate: "finish-pr",
    baseBranch: "main",
    prDraft: false,
    checks: "passed",
    checksHeadSha: "abc",
    checksEvidenceKind: "check_runs",
    failingReportedChecks: 0,
    reviewThreads: "resolved",
    reviewThreadsHeadSha: "abc",
    reviewEvidenceKind: "thread_aware_review_threads",
    threadAwareReviewInspected: true,
    deliverySubagentAudit: deliverySubagentAuditContract,
    requestedChanges: "none",
    requestedChangesHeadSha: "abc",
    localVerification: "passed",
    localVerificationHeadSha: "abc",
    localVerificationCommand: "node --test tests/manager-control-plane.test.mjs",
    mergeState: "clean",
    mergeability: "mergeable",
    dirtyState: "clean",
    branchState: "clean",
    baseState: "clean",
    headState: "clean",
    changedFiles: ["scripts/lib/manager-control-plane/core.mjs"],
    changedFilesHeadSha: "abc",
  },
  deliveryPhase: {
    authorityFamily: "delivery_phase",
    authorityRef: "authority:delivery-contract",
    approvalRef: "approval:delivery-contract",
    runId: "manager-contract",
    laneId: "lane-contract",
    branchScope: ["codex/lane-contract"],
    targetBase: "main",
    exactHeadSha: "abc",
    reviewThreadRequirement: "resolved",
    checkRequirement: "passed",
    localVerification: "passed",
    allowedOperations: ["merge", "cleanup", "push", "pr_create"],
    authorityCoveredSurfaces: [],
    allowedCleanupTargets: { worktreePath: "/tmp/kendall/lane-contract", localBranch: "codex/lane-contract", remoteBranch: "codex/lane-contract" },
    rollbackPath: "revert PR or restore manager-owned worktree",
    stopLines: ["no_force_push", "no_unresolved_review_threads"],
    expiresAt: "2099-01-01T00:00:00.000Z",
    evidenceRefs: ["evidence:delivery-contract"],
  },
});
assertCondition(deliveryReady.status === "ready", "Delivery plan must allow only proven low-risk merge evidence with delivery-phase authority", failures);
assertCondition(deliveryReady.summary.deliveryAuthority.status === "active", "Delivery plan must record active delivery-phase authority", failures);
assertCondition(Array.isArray(deliveryReady.summary.mergePlan.criteria), "Delivery plan must expose structured low-risk merge criteria", failures);
assertCondition(deliveryReady.summary.mergePlan.criteria.some((criterion) => criterion.key === "exactReviewedHeadSha" && criterion.status === "proven" && criterion.headSha === "abc"), "Delivery plan must prove exact reviewed head SHA as a structured criterion", failures);
assertCondition(deliveryReady.summary.mergePlan.criteria.some((criterion) => criterion.key === "threadAwareReviewState" && criterion.source === "thread_aware_review_threads"), "Delivery plan must require thread-aware review state, not flat comments", failures);
assertCondition(deliveryReady.summary.mergePlan.criteria.some((criterion) => criterion.key === "checkRunExactHead" && criterion.source === "check_runs"), "Delivery plan must require exact-head check-run evidence, not green rollups", failures);
assertCondition(deliveryReady.summary.mergePlan.rawPayloadRetained === false, "Delivery merge proof must not retain raw payloads", failures);
const cleanupReady = buildDeliveryPlan({
  runId: "manager-contract",
  requestedOperation: "cleanup",
  lane: {
    laneId: "lane-contract",
    managerOwned: true,
    workspaceGate: "codex-workspace",
    deliveryGate: "finish-pr",
    prNumber: 17,
    prUrl: "pr:17",
    headSha: "abc",
    expectedHeadSha: "abc",
    branch: "codex/lane-contract",
    baseBranch: "main",
    mergeState: "merged",
    expectedCleanup: { worktreePath: "/tmp/kendall/lane-contract", localBranch: "codex/lane-contract", remoteBranch: "codex/lane-contract" },
    cleanupEvidence: {
      mergedPr: true,
      expectedHeadSha: "abc",
      worktreePath: "/tmp/kendall/lane-contract",
      localBranch: "codex/lane-contract",
      remoteBranch: "codex/lane-contract",
      assignmentState: "closed",
      objectType: "merged-managed-lane",
      ownershipProof: "manager assignment owner matches manager-contract/lane-contract",
      evidencePath: "_bmad-output/evidence/cleanup-lane-contract.json",
      blockedCaseBehavior: "block and preserve lane evidence",
      idempotencyCondition: "target_absent_or_already_closed_at_exact_head",
      deliverySubagentAudit: deliverySubagentAuditContract,
      dryRun: {
        target: { worktreePath: "/tmp/kendall/lane-contract", localBranch: "codex/lane-contract", remoteBranch: "codex/lane-contract" },
        expectedHeadSha: "abc",
        wouldDelete: ["worktree:/tmp/kendall/lane-contract", "local-branch:codex/lane-contract"],
        skipped: ["assignment-state:already-closed"],
        finalExpectedState: "worktree_absent_branches_absent_assignment_closed",
        rollbackNote: "restore branch from exact head abc",
        evidenceRefs: ["evidence:cleanup-dry-run"],
        rawPayloadRetained: false,
      },
      applyResult: {
        target: { worktreePath: "/tmp/kendall/lane-contract", localBranch: "codex/lane-contract", remoteBranch: "codex/lane-contract" },
        expectedHeadSha: "abc",
        deletionResult: "already_clean",
        skipped: ["worktree:already-absent"],
        finalState: "worktree_absent_branches_absent_assignment_closed",
        rollbackNote: "no-op; final state already clean",
        evidenceRefs: ["evidence:cleanup-apply-result"],
        rawPayloadRetained: false,
      },
    },
  },
  deliveryPhase: { ...deliveryReady.summary.deliveryAuthority, laneId: "lane-contract" },
});
assertCondition(cleanupReady.status === "ready", "Delivery cleanup plan must allow only proven scoped cleanup evidence", failures);
assertCondition(Array.isArray(cleanupReady.summary.cleanupPlan.criteria), "Delivery cleanup plan must expose structured cleanup criteria", failures);
assertCondition(cleanupReady.summary.cleanupPlan.criteria.some((criterion) => criterion.key === "dryRunEvidence" && criterion.status === "proven" && criterion.headSha === "abc"), "Delivery cleanup plan must require exact-head dry-run evidence", failures);
assertCondition(cleanupReady.summary.cleanupPlan.applyResult?.deletionResult === "already_clean", "Delivery cleanup plan must record cleanup apply result metadata", failures);
assertCondition(cleanupReady.summary.cleanupPlan.applyResult?.idempotent === true, "Delivery cleanup plan must prove repeated cleanup idempotency", failures);
assertCondition(cleanupReady.summary.cleanupPlan.rawPayloadRetained === false && cleanupReady.summary.cleanupPlan.dryRun.rawPayloadRetained === false, "Delivery cleanup proof must not retain raw payloads", failures);
const prReady = buildDeliveryPlan({
  runId: "manager-contract",
  requestedOperation: "pr_create",
  lane: {
    laneId: "lane-contract",
    managerOwned: true,
    workspaceGate: "codex-workspace",
    headSha: "abc",
    expectedHeadSha: "abc",
    prHeadSha: "abc",
    branch: "codex/lane-contract",
    deliveryGate: "finish-pr",
    baseBranch: "main",
    localVerification: "passed",
    localVerificationHeadSha: "abc",
    mergeState: "clean",
    dirtyState: "clean",
    branchState: "clean",
    baseState: "clean",
    headState: "clean",
  },
  deliveryPhase: {
    authorityFamily: "delivery_phase",
    authorityRef: "authority:delivery-contract",
    approvalRef: "approval:delivery-contract",
    runId: "manager-contract",
    laneId: "lane-contract",
    branchScope: ["codex/lane-contract"],
    targetBase: "main",
    exactHeadSha: "abc",
    reviewThreadRequirement: "resolved",
    checkRequirement: "passed",
    localVerification: "passed",
    allowedOperations: ["pr_create"],
    authorityCoveredSurfaces: [],
    allowedCleanupTargets: { worktreePath: "/tmp/kendall/lane-contract", localBranch: "codex/lane-contract", remoteBranch: "codex/lane-contract" },
    rollbackPath: "revert PR or restore manager-owned worktree",
    stopLines: ["no_force_push", "no_unresolved_review_threads"],
    expiresAt: "2099-01-01T00:00:00.000Z",
    evidenceRefs: ["evidence:delivery-contract"],
  },
  prDelivery: {
    dryRunApproved: true,
    changedFiles: ["scripts/lib/manager-control-plane/core.mjs"],
    verificationCommand: "node --test tests/manager-control-plane.test.mjs",
    verificationHeadSha: "abc",
    evidenceRefs: ["evidence:pr-dry-run"],
    rollbackNote: "close PR or restore branch",
    recoveryPath: "restore branch from exact head",
    expectedMutation: "pr_create",
  },
});
assertCondition(prReady.status === "ready", "Delivery plan must allow scoped PR create readiness only with delivery authority and dry-run evidence", failures);
assertCondition(prReady.summary.prPlan.state === "ready", "Delivery plan must record PR stewardship dry-run readiness", failures);
assertCondition(prReady.summary.prPlan.rawPayloadRetained === false, "PR stewardship plan must not retain raw payloads", failures);
const prBlocked = buildDeliveryPlan({
  runId: "manager-contract",
  requestedOperation: "pr_create",
  lane: { laneId: "lane-contract", managerOwned: true, workspaceGate: "codex-workspace", deliveryGate: "finish-pr", headSha: "abc", expectedHeadSha: "abc", branch: "codex/lane-contract", baseBranch: "main", localVerification: "passed", localVerificationHeadSha: "abc", dirtyState: "clean", branchState: "clean", baseState: "clean", headState: "clean" },
  deliveryPhase: prReady.summary.deliveryAuthority,
  prDelivery: { dryRunApproved: true, changedFiles: ["scripts/lib/manager-control-plane/core.mjs"], verificationCommand: "node --test tests/manager-control-plane.test.mjs", verificationHeadSha: "old", evidenceRefs: [], rollbackNote: "close PR", recoveryPath: "" },
});
assertCondition(prBlocked.status === "blocked", "Delivery plan must block PR stewardship with stale or incomplete dry-run evidence", failures);
assertCondition(prBlocked.summary.prPlan.missingEvidence.includes("verification_head_stale"), "PR stewardship plan must name stale verification head", failures);
assertCondition(prBlocked.blockers.some((blocker) => blocker.code === "pr-stewardship-evidence-missing"), "PR stewardship plan must emit blocker packets", failures);
const missingDeliveryAuthority = buildDeliveryPlan({ runId: "manager-contract", requestedOperation: "merge", lane: { managerOwned: true, workspaceGate: "codex-workspace", deliveryGate: "finish-pr", headSha: "abc", expectedHeadSha: "abc", branch: "codex/lane-contract", baseBranch: "main" } });
assertCondition(missingDeliveryAuthority.status === "blocked", "Delivery plan must block terminal delivery without delivery-phase authority", failures);
assertCondition(missingDeliveryAuthority.summary.deliveryAuthority.status === "blocked_missing_contract", "Delivery plan must name missing delivery_phase authority", failures);
const malformedDeliveryAuthority = buildDeliveryPlan({
  runId: "manager-contract",
  requestedOperation: "merge",
  lane: { laneId: "lane-contract", managerOwned: true, workspaceGate: "codex-workspace", deliveryGate: "finish-pr", headSha: "abc", expectedHeadSha: "abc", branch: "codex/lane-contract", baseBranch: "main" },
  deliveryPhase: {
    authorityFamily: "backend_proof",
    authorityRef: "authority:delivery-contract",
    runId: "manager-contract",
    laneId: "lane-contract",
    branchScope: ["codex/lane-contract"],
    targetBase: "main",
    exactHeadSha: "abc",
    reviewThreadRequirement: "resolved",
    checkRequirement: "passed",
    localVerification: "passed",
    allowedOperations: ["merge"],
    rollbackPath: "revert PR or restore manager-owned worktree",
    stopLines: ["no_force_push"],
    expiresAt: "2099-01-01T00:00:00.000Z",
  },
});
assertCondition(malformedDeliveryAuthority.status === "blocked", "Delivery plan must block malformed delivery-phase authority", failures);
assertCondition(malformedDeliveryAuthority.summary.deliveryAuthority.missingFields.includes("evidence_ref"), "Delivery plan must require explicit delivery evidence refs", failures);
assertCondition(malformedDeliveryAuthority.summary.deliveryAuthority.missingFields.includes("cleanup_targets.worktreePath"), "Delivery plan must require explicit delivery cleanup targets", failures);
assertCondition(malformedDeliveryAuthority.summary.deliveryAuthority.mismatchReasons.includes("authority_family_invalid"), "Delivery plan must reject non-delivery authority family", failures);
const deliveryBlocked = buildDeliveryPlan({
  runId: "manager-contract",
  requestedOperation: "merge",
  lane: { managerOwned: true, workspaceGate: "codex-workspace", deliveryGate: "finish-pr", headSha: "abc", expectedHeadSha: "def", branch: "codex/lane-contract", baseBranch: "main" },
  deliveryPhase: {
    authorityFamily: "delivery_phase",
    authorityRef: "authority:delivery-contract",
    runId: "manager-contract",
    branchScope: ["codex/lane-contract"],
    targetBase: "main",
    exactHeadSha: "abc",
    reviewThreadRequirement: "resolved",
    checkRequirement: "passed",
    localVerification: "passed",
    allowedOperations: ["merge"],
    allowedCleanupTargets: { worktreePath: "/tmp/kendall/lane-contract", localBranch: "codex/lane-contract", remoteBranch: "codex/lane-contract" },
    rollbackPath: "revert PR or restore manager-owned worktree",
    stopLines: ["no_force_push"],
    expiresAt: "2099-01-01T00:00:00.000Z",
    evidenceRefs: ["evidence:delivery-contract"],
  },
});
assertCondition(deliveryBlocked.status === "blocked", "Delivery plan must block stale or incomplete merge evidence", failures);
assertCondition(deliveryBlocked.summary.mergePlan.missingEvidence.includes("exactHeadSha"), "Delivery plan must name exact missing head evidence", failures);
const recoveryBlocked = buildRecoveryPlan({
  runId: "manager-contract",
  stateSignals: {
    ledger: { state: "active" },
    tmux: { state: "missing" },
    assignment: { state: "assigned" },
    git: { dirty: "unknown" },
    pr: { state: "open" },
  },
});
assertCondition(recoveryBlocked.status === "blocked", "Recovery plan must block split-brain resume before mutation", failures);
assertCondition(recoveryBlocked.summary.reconciliation.action === "park_ambiguous_lane", "Recovery plan must park ambiguous lanes", failures);
const recoveryAuto = buildRecoveryPlan({
  runId: "manager-contract",
  stateSignals: readyReconciliationSignals(),
  drift: {
    condition: "manager-owned-ledger-append",
    managerOwned: true,
    objectType: "manager-ledger-event",
    targetRef: "manager-ledger-event:manager-contract-1",
    ownershipProof: "owner prefix matches manager run id",
    lowRisk: true,
    freshness: "fresh",
    evidence: ["workers.json"],
    recoveryEvidence: ["recovery-ledger.ndjson"],
    authorityBasis: "manager-owned-runtime-ledger-recovery",
    preState: { state: "stale", owner: "manager-contract/codex-1" },
    idempotencyProof: "event id is stable",
    recoveryPath: "append manager-owned ledger event",
  },
});
assertCondition(recoveryAuto.summary.autoRepair.posture === "auto_repair_allowed", "Recovery plan must allow obvious manager-owned low-risk repair with evidence", failures);
assertCondition(recoveryAuto.summary.autoRepair.repairClass === "manager-owned-ledger-append", "Recovery plan must report the allowlisted auto-repair class", failures);
assertCondition(recoveryAuto.summary.autoRepair.rawPayloadRetained === false, "Recovery auto-repair evidence must remain metadata-only", failures);
assertCondition(recoveryAuto.summary.autoRepair.recoveryEvidence?.includes("recovery-ledger.ndjson"), "Recovery plan must require explicit recovery evidence refs", failures);
assertCondition(recoveryAuto.summary.autoRepair.authorityBasis === "manager-owned-runtime-ledger-recovery", "Recovery plan must use allowlisted authority basis", failures);
assertCondition(recoveryAuto.summary.autoRepair.objectType === "manager-ledger-event", "Recovery plan must require allowlisted object type", failures);
assertCondition(recoveryAuto.summary.autoRepair.targetRef === "manager-ledger-event:manager-contract-1", "Recovery plan must require target identity", failures);
assertCondition(recoveryAuto.summary.autoRepair.owner === "manager-contract/codex-1", "Recovery plan must bind repair to manager-owned pre-state owner", failures);
const recoveryMissing = buildRecoveryPlan({ runId: "manager-contract", stateSignals: { ledger: { state: "active" } } });
assertCondition(recoveryMissing.summary.reconciliation.missingEvidence.includes("tmux"), "Recovery plan must park when required resume evidence is missing", failures);
const destructiveRepair = buildRecoveryPlan({
  runId: "manager-contract",
  stateSignals: readyReconciliationSignals(),
  drift: {
    condition: "manager-owned-ledger-append",
    managerOwned: true,
    objectType: "manager-ledger-event",
    targetRef: "manager-ledger-event:manager-contract-1",
    ownershipProof: "owner prefix matches manager run id",
    lowRisk: true,
    freshness: "fresh",
    evidence: ["workers.json"],
    recoveryEvidence: ["recovery-ledger.ndjson"],
    authorityBasis: "manager-owned-runtime-ledger-recovery",
    preState: { state: "stale", owner: "manager-contract/codex-1" },
    idempotencyProof: "event id is stable",
    recoveryPath: "delete branch",
  },
});
assertCondition(destructiveRepair.summary.autoRepair.posture === "blocked", "Recovery plan must block destructive repair paths", failures);
assertCondition(destructiveRepair.summary.autoRepair.blockedReasons.includes("destructive-recovery-path"), "Recovery plan must name destructive auto-repair blocker", failures);
const retryRoute = buildRecoveryPlan({ runId: "manager-contract", retrySignals: [{ laneId: "lane-api", toolPath: "pnpm run check", failureCount: 2, failureKind: "same-command", evidence: ["events.ndjson"] }] });
assertCondition(retryRoute.summary.retryRoutes[0]?.action === "tool_churn_rca", "Recovery plan must route repeated tool failure to tool-churn RCA", failures);
assertCondition(retryRoute.summary.retryRoutes[0]?.posture === "routed", "Recovery retry route must be explicit routed posture", failures);
assertCondition(retryRoute.summary.retryRoutes[0]?.commandShape === "pnpm run check", "Recovery retry route must record command shape", failures);
assertCondition(retryRoute.summary.retryRoutes[0]?.failureClass === "same-command", "Recovery retry route must record normalized failure class", failures);
assertCondition(retryRoute.summary.retryRoutes[0]?.authorityBasis === "bounded-retry-route-policy", "Recovery retry route must record bounded retry authority", failures);
assertCondition(retryRoute.summary.retryRoutes[0]?.rawPayloadRetained === false, "Recovery retry route must remain metadata-only", failures);
const retryCommandOnly = buildRecoveryPlan({ runId: "manager-contract", retrySignals: [{ laneId: "lane-api", command: "pnpm run check", failureCount: 2, failureKind: "same-command", evidence: ["events.ndjson"] }] });
assertCondition(retryCommandOnly.summary.retryRoutes[0]?.posture === "routed" && retryCommandOnly.summary.retryRoutes[0]?.commandShape === "pnpm run check", "Recovery retry route must accept command-only retry signals", failures);
const retryPark = buildRecoveryPlan({ runId: "manager-contract", retrySignals: [{ laneId: "lane-api", toolPath: "cleanup", failureCount: 2, failureKind: "ownership-unknown", evidence: ["events.ndjson"] }] });
assertCondition(retryPark.status === "blocked" && retryPark.summary.retryRoutes[0]?.action === "park_lane", "Recovery plan must block ownership-sensitive retry loops by parking lane", failures);
assertCondition(retryPark.summary.retryRoutes[0]?.parkedLane?.visible === true, "Recovery parked retry route must keep lane visible", failures);
const retrySandbox = buildRecoveryPlan({
  runId: "manager-contract",
  stateSignals: readyReconciliationSignals(),
  retrySignals: [{
    laneId: "lane-api",
    toolPath: "pnpm run check",
    failureCount: 2,
    failureKind: "verification command",
    failureSignature: "spawnSync /usr/bin/node EPERM",
    evidence: ["events.ndjson"],
  }],
});
assertCondition(retrySandbox.summary.retryRoutes[0]?.failureClass === "sandbox", "Recovery retry route must classify known sandbox boundaries", failures);
assertCondition(retrySandbox.summary.retryRoutes[0]?.rerunRequirement === "Rerun the exact same read-only verification command outside the sandbox once.", "Recovery sandbox retry route must preserve exact outside-sandbox rerun requirement", failures);
assertCondition(!String(retrySandbox.summary.retryRoutes[0]?.failureSignature || "").includes("spawnSync"), "Recovery retry route must store metadata-only sandbox signatures", failures);
assertCondition(retrySandbox.summary.retryRoutes[0]?.durableFixRequired === true, "Recovery sandbox retry route must require durable boundary avoidance", failures);
assertCondition(/skip.*known sandbox attempt|durable avoidance/i.test(String(retrySandbox.summary.retryRoutes[0]?.durableFixRecommendation || "")), "Recovery sandbox retry route must tell future runs to avoid the known sandbox attempt", failures);
const retryFirstSandbox = buildRecoveryPlan({
  runId: "manager-contract",
  stateSignals: readyReconciliationSignals(),
  retrySignals: [{
    laneId: "lane-api",
    toolPath: "pnpm run check",
    failureCount: 1,
    failureKind: "verification command",
    failureSignature: "spawnSync /usr/bin/node EPERM",
    evidence: ["events.ndjson"],
  }],
});
assertCondition(retryFirstSandbox.summary.retryRoutes[0]?.failureClass === "sandbox", "Recovery retry route must route first known read-only sandbox boundary", failures);
const retryNetworkMutation = buildRecoveryPlan({
  runId: "manager-contract",
  stateSignals: readyReconciliationSignals(),
  retrySignals: [{
    laneId: "lane-api",
    toolPath: "git push origin codex/lane-api",
    commandShape: "git push origin codex/lane-api",
    failureCount: 2,
    failureKind: "network denied",
    failureSignature: "network denied",
    evidence: ["events.ndjson"],
  }],
});
assertCondition(retryNetworkMutation.summary.retryRoutes[0]?.posture === "blocked" && retryNetworkMutation.summary.retryRoutes[0]?.rerunRequirement === null, "Recovery retry route must block non-read-only sandbox rerun recommendations", failures);
const retryMissingEvidence = buildRecoveryPlan({ runId: "manager-contract", stateSignals: readyReconciliationSignals(), retrySignals: [{ laneId: "lane-api", toolPath: "pnpm run check", failureCount: 2, failureKind: "same-command", evidence: [] }] });
assertCondition(retryMissingEvidence.status === "blocked" && retryMissingEvidence.summary.retryRoutes[0]?.blockedReasons.includes("evidence-missing"), "Recovery retry route must block missing evidence", failures);
const retryStaleEvidence = buildRecoveryPlan({ runId: "manager-contract", stateSignals: readyReconciliationSignals(), retrySignals: [{ laneId: "lane-api", toolPath: "pnpm run check", failureCount: 2, failureKind: "same-command", evidence: ["events.ndjson"], freshness: "stale" }] });
assertCondition(retryStaleEvidence.summary.retryRoutes[0]?.blockedReasons.includes("fresh-evidence-required"), "Recovery retry route must block stale retry evidence", failures);
const retryCrossLane = buildRecoveryPlan({ runId: "manager-contract", stateSignals: readyReconciliationSignals(), retrySignals: [{ laneId: "lane-api", toolPath: "pnpm run check", failureCount: 2, failureKind: "same-command", evidence: ["events.ndjson"], crossLaneAmbiguous: true }] });
assertCondition(retryCrossLane.summary.retryRoutes[0]?.blockedReasons.includes("cross-lane-ambiguous"), "Recovery retry route must block cross-lane ambiguous retry evidence", failures);
const retryAuthority = buildRecoveryPlan({ runId: "manager-contract", stateSignals: readyReconciliationSignals(), retrySignals: [{ laneId: "lane-api", toolPath: "pnpm run check", failureCount: 2, failureKind: "same-command", evidence: ["events.ndjson"], authorityExpanding: true }] });
assertCondition(retryAuthority.summary.retryRoutes[0]?.blockedReasons.includes("authority-expanding-route"), "Recovery retry route must block authority-expanding retry evidence", failures);
const retryRawRef = buildRecoveryPlan({ runId: "manager-contract", stateSignals: readyReconciliationSignals(), retrySignals: [{ laneId: "lane-api", toolPath: "pnpm run check", failureCount: 2, failureKind: "same-command", evidence: ["events/stdout.ndjson"] }] });
assertCondition(retryRawRef.summary.retryRoutes[0]?.blockedReasons.includes("evidence-ref-not-structured"), "Recovery retry route must block raw-output-shaped evidence refs", failures);
const steeringPause = buildSteeringPlan({ runId: "manager-contract", steeringInstruction: "pause" });
assertCondition(steeringPause.summary.futureDispatch.action === "pause_new_dispatch", "Steering plan must pause future dispatch on operator pause", failures);
assertCondition(steeringPause.summary.record?.eventType === "manager.steering", "Steering plan must emit a compact manager steering ledger event", failures);
const steeringReduce = buildSteeringPlan({ runId: "manager-contract", desiredWorkers: 6, steeringInstruction: "reduce worker count" });
assertCondition(steeringReduce.summary.futureDispatch.action === "reduce_worker_target" && steeringReduce.summary.futureDispatch.targetWorkers === 5, "Steering plan must reduce worker count even when no explicit number is provided", failures);
const steeringFocus = buildSteeringPlan({ runId: "manager-contract", steeringInstruction: "focus on setup churn" });
assertCondition(steeringFocus.summary.futureDispatch.action === "drain_and_shift_focus", "Steering plan must drain active safe work and shift new dispatch on focus change", failures);
assertCondition(steeringFocus.summary.activeWorkerPolicy.killHealthyWorkersByDefault === false, "Steering focus must not kill healthy active workers by default", failures);
assertCondition(Boolean(steeringFocus.summary.operatorReport.whatChanged), "Steering report must include what changed", failures);
assertCondition(Boolean(steeringFocus.summary.operatorReport.whyItMatters), "Steering report must include why it matters", failures);
assertCondition(Boolean(steeringFocus.summary.operatorReport.whatHappensNext), "Steering report must include what happens next", failures);
const steeringBareFocus = buildSteeringPlan({ runId: "manager-contract", steeringInstruction: "focus" });
assertCondition(steeringBareFocus.status === "attention" && steeringBareFocus.summary.instruction.supported === false, "Steering plan must ask for clarification when focus has no surface", failures);
const progress = buildProgressBeaconPlan(
  { runId: "manager-contract" },
  {
    workerCounts: { active: 1, warm: 1, paused: 0 },
    usageState: "normal",
    resourceState: "normal",
    currentSource: "Manager Control Plane MVP",
    operatorActionState: "none",
    queueLeaseSummary: { queued: 2, leased: 1, running: 1, blocked: 0, refilling: false, nextAction: "continue", freshness: "fresh" },
    checkpoints: [
      { checkpointId: "visible", userFacing: true, whatChanged: "Visible work", whereToTest: "/pipeline", verificationEvidence: ["cmd:pnpm run test:manager-control-plane"] },
      { checkpointId: "backend", category: "backend", whatChanged: "Internal helper" },
    ],
  },
);
assertCondition(progress.summary.heartbeat.text.includes("workers 1 active / 1 warm / 0 paused"), "Progress beacon must include concise worker counts", failures);
assertCondition(progress.summary.heartbeat.text.includes("queue 2 queued / 1 leased / 1 running / 0 blocked"), "Progress beacon must include concise queue and lease posture", failures);
assertCondition(progress.summary.heartbeat.queueLeasePosture?.freshness === "fresh", "Progress beacon must expose bounded queue and lease posture fields", failures);
assertCondition(progress.summary.heartbeat.queueLeasePosture?.runningKnown === true, "Progress beacon must distinguish explicit running counts from unknown running posture", failures);
assertCondition(progress.summary.checkpointReports.length === 1 && progress.summary.checkpointReports[0].checkpointId === "visible", "Progress beacon must report daily-use checkpoints", failures);
assertCondition(progress.summary.heartbeatOnly.length === 1 && progress.summary.heartbeatOnly[0].checkpointId === "backend", "Progress beacon must keep backend-only work heartbeat-level", failures);
assertCondition(progress.summary.heartbeat.cadence.mode === "healthy_active", "Progress beacon must include adaptive heartbeat cadence", failures);
assertCondition(progress.summary.heartbeat.cadence.minIntervalMinutes === 3 && progress.summary.heartbeat.cadence.maxIntervalMinutes === 5, "Progress beacon must encode healthy 3-5 minute cadence", failures);
const progressCheckpointDetails = buildProgressBeaconPlan(
  { runId: "manager-contract" },
  {
    usageState: "normal",
    resourceState: "normal",
    checkpoints: [
      {
        checkpointId: "daily-use-contract",
        userFacing: true,
        whatChanged: "Operator can test manager checkpoint reports.",
        whereToTest: "/pipeline",
        verificationEvidence: ["cmd:pnpm run check", "secret:sk-contractcheckpoint"],
        evidenceRefs: ["evidence:checkpoint:daily-use-contract", "prompt:raw worker transcript"],
        changedSurfaces: ["dashboard:/pipeline", "provider payload should redact"],
        knownLimits: ["Backend summary only.", "raw prompt should redact"],
        nextSource: "Story 7.3",
      },
      {
        checkpointId: "redacted-only-contract",
        userFacing: true,
        whatChanged: "Visible work with only secret evidence.",
        whereToTest: "/pipeline",
        verificationEvidence: ["secret:sk-redactedcontract"],
      },
      {
        checkpointId: "unsafe-token-contract",
        userFacing: true,
        whatChanged: "Visible work with unsafe token evidence.",
        whereToTest: "/pipeline",
        verificationEvidence: ["token:abc123"],
      },
      {
        checkpointId: "source-ref-only-contract",
        userFacing: true,
        whatChanged: "Visible work with source refs but no verification proof.",
        whereToTest: "/pipeline",
        sourceRefs: ["story:_bmad-output/implementation-artifacts/7-2-report-daily-use-checkpoints.md"],
      },
      {
        checkpointId: "redacted-location-contract",
        userFacing: true,
        whatChanged: "Visible work with redacted test instructions.",
        whereToTest: "secret sk-location-only",
        verificationEvidence: ["cmd:pnpm run check"],
      },
      {
        checkpointId: "fixture-contract",
        category: "fixture",
        testingRelevant: true,
        whatChanged: "Fixture-only work.",
        whereToTest: "node --test",
        verificationEvidence: ["cmd:node --test"],
      },
    ],
  },
);
const dailyUseCheckpoint = progressCheckpointDetails.summary.checkpointReports[0] || {};
assertCondition(dailyUseCheckpoint.checkpointId === "daily-use-contract", "Progress beacon must promote daily-use checkpoint details", failures);
assertCondition(Array.isArray(dailyUseCheckpoint.changedSurfaces) && dailyUseCheckpoint.changedSurfaces.includes("dashboard:/pipeline"), "Daily-use checkpoint reports must include changed surfaces", failures);
assertCondition(Array.isArray(dailyUseCheckpoint.knownLimits) && dailyUseCheckpoint.knownLimits.includes("Backend summary only."), "Daily-use checkpoint reports must include known limits", failures);
assertCondition(Array.isArray(dailyUseCheckpoint.evidenceRefs) && dailyUseCheckpoint.evidenceRefs.includes("evidence:checkpoint:daily-use-contract"), "Daily-use checkpoint reports must include compact evidence refs", failures);
assertCondition(dailyUseCheckpoint.workContinuation?.continues === true && dailyUseCheckpoint.workContinuation?.nextSource === "Story 7.3", "Daily-use checkpoint reports must include explicit work continuation metadata", failures);
assertCondition(
  progressCheckpointDetails.summary.heartbeatOnly.length === 5 &&
    progressCheckpointDetails.summary.heartbeatOnly.some((checkpoint) => checkpoint.checkpointId === "fixture-contract") &&
    progressCheckpointDetails.summary.heartbeatOnly.some((checkpoint) => checkpoint.checkpointId === "redacted-only-contract") &&
    progressCheckpointDetails.summary.heartbeatOnly.some((checkpoint) => checkpoint.checkpointId === "unsafe-token-contract") &&
    progressCheckpointDetails.summary.heartbeatOnly.some((checkpoint) => checkpoint.checkpointId === "source-ref-only-contract") &&
    progressCheckpointDetails.summary.heartbeatOnly.some((checkpoint) => checkpoint.checkpointId === "redacted-location-contract"),
  "Fixture-only, redacted-only, unsafe-token, source-ref-only, and redacted-location checkpoints must remain heartbeat-only",
  failures,
);
assertCondition(!/sk-contractcheckpoint|raw worker transcript|provider payload|raw prompt/i.test(JSON.stringify(dailyUseCheckpoint)), "Daily-use checkpoint reports must not retain raw secrets or provider/prompt payloads", failures);
assertCondition(!/sk-redactedcontract|token:abc123|sk-location-only/i.test(JSON.stringify(progressCheckpointDetails.summary.heartbeatOnly)), "Heartbeat-only checkpoint summaries must not retain raw unsafe evidence", failures);
const progressFinal = buildProgressBeaconPlan(
  { runId: "manager-contract" },
  {
    usageState: "normal",
    resourceState: "normal",
    sourceExhausted: true,
    cleanupState: "housekeeping_complete",
    nextProductDecision: "Choose next PRD.",
    openLanes: [{ assignmentId: "lane-open", branch: "codex/open", state: "review" }, { branch: "codex/missing-id", state: "review" }],
    parkedLanes: [{ assignmentId: "lane-parked", reason: "waiting for feedback" }, { reason: "missing assignment id" }],
    checkpoints: [{ checkpointId: "final-visible", userFacing: true, whatChanged: "Final visible work.", whereToTest: "/pipeline", verificationEvidence: ["cmd:pnpm run check"] }],
  },
);
assertCondition(progressFinal.summary.finalReport.status === "ready" && progressFinal.summary.finalReport.trigger === "source_exhausted", "Progress beacon must emit final report when source is exhausted", failures);
assertCondition(progressFinal.summary.finalReport.completedCheckpointCount === 1 && progressFinal.summary.finalReport.cleanupState === "housekeeping_complete", "Final report must summarize completed checkpoints and cleanup state", failures);
assertCondition(progressFinal.summary.finalReport.openLanes.length === 1 && progressFinal.summary.finalReport.parkedLanes.length === 1, "Final report must summarize open and parked lanes", failures);
assertCondition(progressFinal.summary.finalReport.nextProductDecision === "Choose next PRD.", "Final report must name the next product decision", failures);
assertCondition(progressFinal.summary.finalReport.completedUserFacingCheckpoints[0]?.workContinues === false, "Final report checkpoints without explicit continuation must not claim work continues", failures);
const progressAliasQueue = buildProgressBeaconPlan({ runId: "manager-contract" }, { usageState: "normal", resourceState: "normal", queueLeaseSummary: { dispatchableCount: 3, activeCount: 2, blocked: 1, freshness: "dispatcher_preview" } });
assertCondition(progressAliasQueue.summary.heartbeat.queueLeasePosture.queued === 3 && progressAliasQueue.summary.heartbeat.queueLeasePosture.leased === 2, "Progress beacon must map dispatcher queue/lease aliases into posture fields", failures);
assertCondition(progressAliasQueue.summary.heartbeat.queueLeasePosture.runningKnown === false && progressAliasQueue.summary.heartbeat.text.includes("unknown running"), "Progress beacon must not fabricate running workers from lease counts", failures);
const progressDrain = buildProgressBeaconPlan({ runId: "manager-contract" }, { usageState: "drain", resourceState: "normal", operatorActionState: "none" });
assertCondition(progressDrain.summary.heartbeat.cadence.mode === "reduced_pressure" && progressDrain.summary.heartbeat.cadence.minIntervalMinutes === 10 && progressDrain.summary.heartbeat.cadence.maxIntervalMinutes === 15, "Progress beacon must encode drain/conserve 10-15 minute cadence", failures);
const progressResourcePressure = buildProgressBeaconPlan({ runId: "manager-contract" }, { usageState: "normal", resourceState: "pressured", operatorActionState: "none" });
assertCondition(progressResourcePressure.summary.heartbeat.cadence.mode === "resource_pressure" && progressResourcePressure.summary.heartbeat.cadence.minIntervalMinutes === 10 && progressResourcePressure.summary.heartbeat.cadence.maxIntervalMinutes === 15, "Progress beacon must not report resource pressure as healthy active", failures);
const progressResourceCritical = buildProgressBeaconPlan({ runId: "manager-contract" }, { usageState: "normal", resourceState: "critical", operatorActionState: "none" });
assertCondition(progressResourceCritical.summary.heartbeat.cadence.mode === "resource_pressure" && progressResourceCritical.summary.heartbeat.cadence.reportNow === true && progressResourceCritical.summary.heartbeat.cadence.trigger === "resource_critical", "Progress beacon must report critical CPU/RAM pressure immediately", failures);
const progressTroubleshooting = buildProgressBeaconPlan({ runId: "manager-contract" }, { usageState: "normal", resourceState: "normal", troubleshooting: true, heartbeatSeconds: 15 });
assertCondition(progressTroubleshooting.summary.heartbeat.cadence.mode === "troubleshooting" && progressTroubleshooting.summary.heartbeat.cadence.intervalSeconds === 15 && progressTroubleshooting.summary.heartbeat.cadence.defaultContinuousRunUnchanged === true, "Progress beacon must allow bounded troubleshooting cadence without changing the default", failures);
const progressManagerOnly = buildProgressBeaconPlan({ runId: "manager-contract" }, { usageState: "manager_only", resourceState: "normal", usageSummary: { resumeTrigger: "reset at 21:34" } });
assertCondition(progressManagerOnly.summary.heartbeat.cadence.mode === "state_change_or_hourly" && progressManagerOnly.summary.heartbeat.cadence.minIntervalMinutes === 60 && progressManagerOnly.summary.heartbeat.cadence.resumeCondition === "reset at 21:34", "Progress beacon must encode manager-only hourly cadence and resume condition", failures);
const progressWaiting = buildProgressBeaconPlan({ runId: "manager-contract" }, { runState: "active", usageState: "waiting", resourceState: "normal" });
assertCondition(progressWaiting.summary.heartbeat.cadence.mode === "state_change_or_hourly" && progressWaiting.summary.heartbeat.cadence.resumeCondition === "waiting condition clears", "Progress beacon must encode usage waiting cadence and resume condition", failures);
const progressUnknown = buildProgressBeaconPlan({ runId: "manager-contract" }, { usageState: "unknown raw prompt sk-contracttoken", resourceState: "unknown provider payload" });
assertCondition(progressUnknown.summary.heartbeat.cadence.mode === "conservative_unknown" && progressUnknown.summary.heartbeat.cadence.signalGap === "usage_or_resource_unknown", "Progress beacon must fail conservative for unknown usage or resource state", failures);
assertCondition(!/raw prompt|sk-contracttoken|provider payload/i.test(progressUnknown.summary.heartbeat.text), "Progress beacon heartbeat text must not retain raw unsafe state payloads", failures);
const progressTaintedKnown = buildProgressBeaconPlan({ runId: "manager-contract" }, { usageState: "normal raw prompt sk-contracttoken", resourceState: "normal provider payload" });
assertCondition(progressTaintedKnown.summary.heartbeat.usageState === "unknown" && progressTaintedKnown.summary.heartbeat.resourceState === "unknown", "Progress beacon must reject tainted known-state prefixes instead of trusting them", failures);
const progressForcedNoChange = buildProgressBeaconPlan({ runId: "manager-contract" }, { usageState: "normal", resourceState: "normal", stateChanged: true, materialChange: false, materialChangeSummary: "worker state changed" });
assertCondition(progressForcedNoChange.summary.heartbeat.materialChange === true && progressForcedNoChange.summary.heartbeat.materialChangeSummary === "worker state changed", "Progress beacon must not suppress actual state changes with materialChange false", failures);
const feedback = buildFeedbackPlan(
  { runId: "manager-contract" },
  { feedback: [{ text: "blocking issue, stop merge", affectedLane: "lane-contract" }, { text: "minor polish" }, { text: "future idea" }] },
);
assertCondition(feedback.summary.feedbackRoutes[0].classification === "blocking", "Feedback plan must classify blocking feedback", failures);
assertCondition(feedback.summary.affectedDeliveryGates[0].mergePolicy === "prevent_affected_pr_merge", "Feedback plan must prevent affected PR merge for blocking feedback", failures);
assertCondition(feedback.summary.unrelatedLanePolicy === "continue_unrelated_safe_lanes", "Feedback plan must keep unrelated safe lanes moving", failures);
assertCondition(feedback.blockers.some((blocker) => blocker.code === "feedback-blocking-delivery"), "Feedback plan must emit blocking delivery blocker for blocking feedback", failures);
const feedbackDelivery = buildDeliveryPlan({
  runId: "manager-contract",
  lane: {
    managerOwned: true,
    workspaceGate: "codex-workspace",
    prNumber: 2,
    headSha: "abc",
    expectedHeadSha: "abc",
    prHeadSha: "abc",
    branch: "codex/lane-contract",
    deliveryGate: "finish-pr",
    baseBranch: "main",
    checks: "passed",
    checksHeadSha: "abc",
    reviewThreads: "resolved",
    reviewThreadsHeadSha: "abc",
    localVerification: "passed",
    localVerificationHeadSha: "abc",
    mergeState: "clean",
    laneId: "lane-contract",
  },
  feedbackPlan: feedback,
  deliveryPhase: {
    authorityFamily: "delivery_phase",
    authorityRef: "authority:delivery-contract",
    runId: "manager-contract",
    laneId: "lane-contract",
    branchScope: ["codex/lane-contract"],
    targetBase: "main",
    exactHeadSha: "abc",
    reviewThreadRequirement: "resolved",
    checkRequirement: "passed",
    localVerification: "passed",
    allowedOperations: ["merge"],
    allowedCleanupTargets: { worktreePath: "/tmp/kendall/lane-contract", localBranch: "codex/lane-contract", remoteBranch: "codex/lane-contract" },
    rollbackPath: "revert PR or restore manager-owned worktree",
    stopLines: ["no_force_push"],
    expiresAt: "2099-01-01T00:00:00.000Z",
    evidenceRefs: ["evidence:delivery-contract"],
  },
});
assertCondition(feedbackDelivery.status === "blocked" && feedbackDelivery.summary.mergePlan.feedbackGate.mergePolicy === "prevent_affected_pr_merge", "Delivery plan must block affected lanes with unresolved blocking feedback", failures);
const questionPolicy = buildWorkerFrictionPlan(
  { runId: "manager-contract" },
  {
    questions: [
      {
        workerId: "codex-1",
        questionId: "question-contract-provider",
        type: "implementation",
        requestedAction: "provider_call",
        authorityFamily: "provider-execution",
        summary: "provider call with sk-contracttoken",
        sourceRefs: ["story:_bmad-output/implementation-artifacts/4-4-handle-routine-worker-questions.md"],
      },
      {
        workerId: "codex-2",
        questionId: "question-contract-copy",
        type: "copy",
        summary: "Can I make this file-local copy edit?",
        sourceRefs: ["story:_bmad-output/implementation-artifacts/4-4-handle-routine-worker-questions.md"],
        materialDecision: false,
      },
      {
        workerId: "codex-3",
        questionId: "question-contract-model-policy",
        type: "policy",
        requestedAction: "model_policy_change",
        summary: "Can I change model routing and downgrade reasoning effort?",
        sourceRefs: ["story:_bmad-output/implementation-artifacts/4-4-handle-routine-worker-questions.md"],
        materialDecision: true,
      },
    ],
    taskRisk: { ambiguity: "low", blastRadius: "low" },
    usageState: "normal",
  },
);
const blockedQuestion = questionPolicy.summary.questionHandling.find((decision) => decision.questionId === "question-contract-provider");
assertCondition(blockedQuestion?.decision === "block_unsafe_continuation", "Worker question policy must block unsafe provider-call continuation", failures);
assertCondition(blockedQuestion?.leaseContinuation === "blocked_pending_operator", "Worker question policy must block unsafe leases pending operator authority", failures);
assertCondition(blockedQuestion?.stopLines?.includes("provider_calls_require_operator_approval"), "Worker question policy must include provider-call stop line", failures);
const modelPolicyQuestion = questionPolicy.summary.questionHandling.find((decision) => decision.questionId === "question-contract-model-policy");
assertCondition(modelPolicyQuestion?.decision === "block_unsafe_continuation", "Worker question policy must block model policy changes", failures);
assertCondition(modelPolicyQuestion?.stopLines?.includes("model_policy_requires_operator_approval"), "Worker question policy must include model-policy stop line", failures);
const routineQuestion = questionPolicy.summary.questionHandling.find((decision) => decision.questionId === "question-contract-copy");
assertCondition(routineQuestion?.decision === "answer_with_best_judgment", "Worker question policy must answer routine source-backed questions", failures);
assertCondition(routineQuestion?.recordPolicy === "do_not_record_non_material", "Worker question policy must suppress non-material decision records", failures);
assertCondition(!JSON.stringify(questionPolicy).includes("sk-contracttoken"), "Worker question policy must not retain raw secret-like question text", failures);
const blockedAnswer = buildWorkerQuestionAnswerPlan(
  { runId: "manager-contract" },
  {
    workerStatus: { summary: { workers: [{ workerId: "codex-1", owner: "manager-contract/codex-1", runId: "manager-contract", sessionName: "codex-1", state: "active", assignmentId: "lane-contract" }] } },
    questions: [
      {
        questionId: "question-contract-provider",
        actor: "codex-1",
        questionType: "implementation",
        requestedAction: "provider_call",
        authorityFamily: "provider-execution",
        summary: "provider payload sk-contracttoken",
        sourceRefs: ["assignment:lane-contract", "story:_bmad-output/implementation-artifacts/4-4-handle-routine-worker-questions.md"],
      },
      {
        questionId: "question-contract-delivery-check",
        actor: "codex-1",
        questionType: "verification",
        summary: "Which delivery readiness check should I rerun?",
        sourceRefs: ["assignment:lane-contract", "story:_bmad-output/implementation-artifacts/4-4-handle-routine-worker-questions.md"],
        materialDecision: false,
      },
    ],
    events: [],
  },
);
assertCondition(blockedAnswer.status === "attention", "Worker question answer plan must surface attention for mixed unsafe and allowed questions", failures);
assertCondition(blockedAnswer.summary.blockedQuestions?.length === 1, "Worker question answer plan must keep blocked question evidence in mixed batches", failures);
assertCondition(blockedAnswer.summary.requests?.length === 0, "Worker question answer plan must not send allowed answers to a worker that also has a blocked question", failures);
const stateRoot = mkdtempSync(join(tmpdir(), "manager-contract-"));
const contractInit = ledgerCommand({ command: "init", runId: "manager-contract", stateRoot });
assertCondition(contractInit.status === "ready", "Manager ledger init behavior must be ready for a safe runtime state root", failures);
for (const key of ["contract-self-repair-1", "contract-self-repair-2"]) {
  const selfRepairAttempt = ledgerCommand({
    command: "append-event",
    runId: "manager-contract",
    stateRoot,
    eventType: "manager_self_repair_attempt",
    summary: "Selected prompt probe repair.",
    authorityBasis: "manager-owned-worker-enter-only-repair-existing-gates",
    recoveryPath: "classify self repair churn before adding handlers",
    advisorActionCode: "continuous-worker-prompt-probe",
    advisorWorkClass: "direct_unblock_repair",
    capabilityName: "tmuxWorkerMutation",
    sourceRefs: ["manager:continuous-run"],
    evidenceRefs: ["self-repair:continuous-worker-prompt-probe"],
    idempotencyKey: key,
  });
  assertCondition(selfRepairAttempt.status === "ready", "Manager self-repair attempts must append as metadata-only ledger events", failures);
}
const selfRepairSummary = buildManagerSelfRepairSummary({ runId: "manager-contract", stateRoot });
assertCondition(selfRepairSummary.summary.attemptsByAction?.["continuous-worker-prompt-probe"] === 2, "Manager self-repair budget must replay attempts from ledger events", failures);
assertCondition(selfRepairSummary.summary.rawPayloadRetained === false, "Manager self-repair replay summary must retain metadata only", failures);
writeFreshDispatcherSummary(stateRoot, "manager-contract");

const lifecycleCritical = buildWorkerLifecyclePlan(
  { runId: "manager-contract", desiredWorkers: 6 },
  {
    workers: [{ workerId: "codex-1", owner: "manager-contract/codex-1", sessionName: "codex-1", state: "warm", lastHeartbeatAt: "2026-06-28T00:00:00.000Z" }],
    targets: { allowedTarget: 4 },
    usageState: "normal",
    resourceState: "critical",
    resourceSummary: {
      state: "critical",
      sampledAt: "2026-06-30T00:00:00.000Z",
      timestamp: "2026-06-30T00:00:00.000Z",
      cpuCount: 4,
      load1: 4.2,
      loadRatio: 1.05,
      freeMemoryBytes: 700,
      totalMemoryBytes: 10000,
      freeMemoryRatio: 0.07,
      usedMemoryRatio: 0.93,
    },
    tmuxSummary: { unmanagedPanes: 0, takeoverRequiredPanes: 0 },
  },
);
assertCondition(lifecycleCritical.summary.startWarmCandidates.length === 0, "Worker lifecycle must not plan start/warm candidates under critical resources", failures);
assertCondition(lifecycleCritical.summary.terminationPlan.killOrder.length === 1, "Worker lifecycle must plan only eligible manager-owned termination under critical resources", failures);

const lifecycleUnmanaged = buildWorkerLifecyclePlan(
  { runId: "manager-contract", desiredWorkers: 6 },
  {
    workers: [{ workerId: "codex-1", owner: "manager-contract/codex-1", sessionName: "codex-1", state: "warm", lastHeartbeatAt: "2026-06-28T00:00:00.000Z" }],
    targets: { allowedTarget: 4 },
    usageState: "normal",
    resourceState: "normal",
    tmuxSummary: { unmanagedPanes: 1, takeoverRequiredPanes: 0 },
  },
);
assertCondition(lifecycleUnmanaged.status === "ready", "Worker lifecycle must allow warm planning when unmanaged tmux is orientation-only", failures);
assertCondition(lifecycleUnmanaged.summary.startWarmCandidates.length === 3, "Worker lifecycle must preserve warm candidates with unmanaged orientation evidence", failures);
assertCondition(lifecycleUnmanaged.warnings.some((warning) => warning.code === "tmux-unmanaged-orientation-evidence"), "Worker lifecycle must report unmanaged tmux as warning evidence", failures);

const cycleUnmanaged = buildCyclePacket(
  { runId: "manager-contract", desiredWorkers: 6, stateRoot },
  {
    stateSignals: readyReconciliationSignals(),
    assignmentSummary: { summary: { backlogStatusCounts: { assignable: 6, closed: 0 } } },
    dispatchPreview: { summary: { counts: { dispatchable: 6, active: 0 }, candidateStateCounts: { assignable: 6 } } },
    refillPlan: { summary: { safeWorkSupply: 6, candidateLanes: [] } },
    sourcePlanningState: {
      sprintStatus: {
        exists: true,
        path: "_bmad-output/implementation-artifacts/sprint-status-manager-contract.yaml",
        backlogStories: 1,
        readyStories: 5,
        reviewReadyStories: 0,
        readyForDevStories: 5,
        activeStories: 0,
        doneStories: 78,
        nextBacklogStoryKey: "6-6-overnight-run-recovery-and-housekeeping",
      },
    },
    usageContext: { status: "normal" },
    resourceContext: { status: "normal" },
    tmuxSummary: { unmanagedPanes: 1, takeoverRequiredPanes: 0 },
    fakeWorkerHarness: {
      twoWorkerProof: { status: "passed", workerCount: 2, cleanCyclesPerWorker: 10 },
      sixWorkerProof: { status: "passed", workerCount: 6, cleanCyclesPerWorker: 10 },
    },
  },
);
assertCondition(cycleUnmanaged.summary.workers.lifecyclePlan.startWarmCandidates.length === 6, "Cycle packet must keep warm candidates when unmanaged tmux is orientation-only", failures);
assertCondition(cycleUnmanaged.warnings.some((warning) => warning.code === "tmux-unmanaged-orientation-evidence"), "Cycle packet must include unmanaged tmux warning evidence", failures);

const friction = buildWorkerFrictionPlan(
  { runId: "manager-contract", failureBudget: 3 },
  {
    questions: [{ workerId: "codex-1", type: "verification", sourceRefs: ["story:manager-contract"], materialDecision: true }],
    failureSignals: [{ workerId: "codex-1", laneId: "lane-contract", leaseId: "lease-contract", failureKind: "same-check", failureCount: 3, sourceRefs: ["story:manager-contract"], command: "raw prompt sk-contracttoken" }],
    safeWorkers: { eligibleCount: 1, workers: ["codex-2"], lanes: ["lane-safe"], source: "dispatcher-lease-truth", freshness: "fresh" },
    taskRisk: {
      ambiguity: "high",
      blastRadius: "broad",
      repeatedFailure: true,
      expectedReworkCost: "high",
      verificationDifficulty: "high",
      sourceRefs: ["story:manager-contract", "raw prompt sk-contracttoken"],
    },
    usageState: "drain",
  },
);
assertCondition(friction.summary.questionHandling[0].decision === "answer_with_best_judgment", "Worker friction must answer routine source-backed questions with best judgment", failures);
assertCondition(Boolean(friction.summary.questionHandling[0].compactAnswer), "Worker friction must include a compact source-backed answer/resolution", failures);
assertCondition(friction.summary.failureLoops.some((loop) => loop.action === "narrow_slice"), "Worker friction must route repeated check failures to slice narrowing", failures);
assertCondition(friction.summary.failureLoops[0]?.affectedLease === "lease-contract", "Worker friction loops must record affected lease identity", failures);
assertCondition(friction.summary.failureLoops[0]?.affectedLane === "lane-contract", "Worker friction loops must record affected lane identity", failures);
assertCondition(friction.summary.failureLoops[0]?.priorAttemptCount === 3, "Worker friction loops must record prior attempt count", failures);
assertCondition(friction.summary.failureLoops[0]?.rawPayloadRetained === false, "Worker friction loop packets must explicitly reject raw payload retention", failures);
assertCondition(friction.summary.dependencyLoops?.rawPayloadRetained === false, "Worker dependency loop summary must explicitly reject raw payload retention", failures);
assertCondition(friction.summary.dependencyLoops?.unrelatedWork?.eligibleCount === 1, "Worker dependency loop summary must preserve unrelated safe work metadata", failures);
assertCondition(!/raw prompt|sk-contracttoken/i.test(JSON.stringify(friction.summary.failureLoops)), "Worker friction must sanitize failure-loop refs and command metadata", failures);
assertCondition(friction.summary.modelRouting.routing === "high_effort_task_fit", "Worker friction must choose high-effort task-fit routing for high-risk work", failures);
assertCondition(friction.summary.modelRouting.usageAdjustment === "reduce_dispatch_not_model_quality", "Worker friction must reduce dispatch rather than model quality under usage pressure", failures);
assertCondition(friction.summary.modelRouting.leasePolicy === "usage_pressure_limits_new_leases_before_quality", "Worker friction must limit new leases before model quality under usage pressure", failures);
assertCondition(friction.summary.modelRouting.escalationRule === "escalate_for_quality_risk", "Worker friction must record quality-risk escalation rule", failures);
assertCondition(friction.summary.modelRouting.expectedVerificationBoundary === "focused_plus_integration_verification", "Worker friction must record high-risk verification boundary", failures);
assertCondition(friction.summary.modelRouting.costPosture === "avoid_underfit_rework", "Worker friction must record underfit rework cost posture", failures);
assertCondition(friction.summary.modelRouting.rawPayloadRetained === false, "Worker friction model routing must explicitly reject raw payload retention", failures);
assertCondition(friction.summary.modelRouting.riskSignals.includes("high-expected-rework-cost"), "Worker friction model routing must include high expected rework cost signal", failures);
assertCondition(friction.summary.modelRouting.riskSignals.includes("high-verification-difficulty"), "Worker friction model routing must include high verification difficulty signal", failures);
assertCondition(!/raw prompt|sk-contracttoken/i.test(JSON.stringify(friction.summary.modelRouting)), "Worker friction model routing must sanitize source refs and retain metadata only", failures);

const routingRiskOnly = buildWorkerFrictionPlan(
  { runId: "manager-contract", failureBudget: 3 },
  {
    failureSignals: [{ workerId: "codex-2", failureKind: "ambiguous-verification", failureCount: 1, sourceRefs: ["story:manager-contract"] }],
    taskRisk: { taskType: "architecture", ambiguity: "low", blastRadius: "low", expectedReworkCost: "low", verificationDifficulty: "low" },
    usageState: "normal raw prompt sk-contracttoken",
  },
);
assertCondition(routingRiskOnly.summary.modelRouting.routing === "high_effort_task_fit", "Worker friction model routing must escalate high-reasoning task types", failures);
assertCondition(routingRiskOnly.summary.modelRouting.riskSignals.includes("task-type-high-reasoning"), "Worker friction model routing must include task type risk signal", failures);
assertCondition(routingRiskOnly.summary.modelRouting.riskSignals.includes("ambiguous-verification-failure"), "Worker friction model routing must include ambiguous verification risk below retry budget", failures);
assertCondition(routingRiskOnly.summary.modelRouting.usageState === "unknown", "Worker friction model routing must normalize unsafe usage-state metadata", failures);
assertCondition(routingRiskOnly.summary.modelRouting.usageInputStatus === "unknown_values_ignored", "Worker friction model routing must report ignored unsafe usage-state values", failures);

const unsafeWorkerDependency = buildWorkerFrictionPlan(
  { runId: "manager-contract", failureBudget: 2 },
  {
    questions: [{
      workerId: "codex-1",
      questionId: "question-contract-delivery",
      type: "delivery",
      requestedAction: "merge cleanup_apply",
      authorityFamily: "delivery_phase",
      sourceRefs: ["events/stdout.ndjson", "story:manager-contract"],
      leaseId: "lease-delivery",
      laneId: "lane-delivery",
      materialDecision: true,
    }],
    failureSignals: [{
      workerId: "codex-3",
      laneId: "lane-raw",
      leaseId: "lease-raw",
      failureKind: "same-check",
      failureCount: 2,
      sourceRefs: ["events/stdout.ndjson"],
    }],
    safeWorkers: { eligibleCount: 1, workers: ["codex-4"], lanes: ["lane-safe"], source: "dispatcher-lease-truth", freshness: "fresh" },
    taskRisk: { ambiguity: "low", blastRadius: "low" },
    usageState: "normal",
  },
);
const unsafeQuestion = unsafeWorkerDependency.summary.questionHandling[0];
assertCondition(unsafeQuestion.decision === "block_unsafe_continuation", "Worker dependency question must block unsafe delivery or cleanup continuation", failures);
assertCondition(unsafeQuestion.blockerPacket?.blockerType === "operator_interruption_required", "Worker dependency question must emit concise operator blocker packet", failures);
assertCondition(unsafeQuestion.dependencyImpact?.affectedLease === "lease-delivery", "Worker dependency question must record affected lease impact", failures);
assertCondition(unsafeQuestion.blockerPacket?.evidenceRefs.length === 1 && unsafeQuestion.blockerPacket.evidenceRefs[0] === "story:manager-contract", "Worker dependency question blocker packet must retain only structured source evidence refs", failures);
assertCondition(unsafeQuestion.blockerPacket?.blockedEvidenceReasons.includes("source-ref-not-structured"), "Worker dependency question blocker packet must report rejected raw-output-like refs", failures);
assertCondition(unsafeWorkerDependency.summary.failureLoops[0]?.blockedReasons.includes("source-ref-not-structured"), "Worker dependency loop must block raw-output-shaped source refs", failures);
assertCondition(unsafeWorkerDependency.summary.failureLoops[0]?.sourceRefs.length === 0, "Worker dependency loop must not retain rejected raw source refs", failures);
assertCondition(!/stdout|raw prompt|provider payload|sk-contracttoken/i.test(JSON.stringify(unsafeWorkerDependency)), "Worker dependency loop packets must not retain raw output or provider payload markers", failures);
assertCondition(!/raw prompt|sk-contracttoken/i.test(JSON.stringify(routingRiskOnly.summary.modelRouting)), "Worker friction model routing must not retain raw usage-state payloads", failures);

const advisor = buildCodexAdvisorPacketPlan(
  {
    runId: "manager-contract",
    advisorCondition: "prompt repair variant",
    advisorActionCode: "continuous-worker-prompt-probe",
    advisorWorkClass: "direct_unblock_repair",
    evidenceRefs: ["events.ndjson", "checkpoint:manager-contract"],
    sourceRefs: ["assignment:lane-contract", "worker:codex-1"],
    summary: "Prompt repair looked different but safe dispatch can continue.",
  },
  { safeTaskWorkAvailable: true },
);
assertCondition(advisor.status === "ready", "Codex advisor packet must be ready for structured metadata evidence", failures);
assertCondition(advisor.summary.requestPacket?.mutationMode === "none; advisor packet only", "Codex advisor packet must be read-only", failures);
assertCondition(advisor.summary.requestPacket?.inputContract?.forbiddenOutputs?.includes("code_patch"), "Codex advisor packet must forbid code patch output", failures);
assertCondition(advisor.summary.requestPacket?.condition?.existingHandler?.handler === "manager-worker-prompt-probe", "Codex advisor packet must identify existing deterministic handlers", failures);
assertCondition(advisor.summary.requestPacket?.taskContinuity?.recommendedResponse === "use_existing_handler_if_it_directly_unblocks_task_work", "Codex advisor packet must not default to manager self-coding", failures);
assertCondition(!/sk-contracttoken|raw prompt transcript|provider payload body/i.test(JSON.stringify(advisor.summary)), "Codex advisor packet must retain metadata only", failures);
const blockedAdvisor = buildCodexAdvisorPacketPlan(
  {
    runId: "manager-contract",
    advisorCondition: "novel issue",
    evidenceRefs: ["raw prompt transcript"],
    apply: true,
  },
);
assertCondition(blockedAdvisor.status === "blocked", "Codex advisor packet must block raw evidence and apply attempts", failures);
assertCondition(blockedAdvisor.blockers.some((blocker) => blocker.code === "codex-advisor-forbidden-mutation"), "Codex advisor packet must block mutation attempts", failures);
const advisorClassification = buildCodexAdvisorClassificationPlan({
  runId: "manager-contract",
  command: "classify",
  advisorCondition: "self_fix_churn continuous-worker-prompt-probe",
  advisorRecommendation: "park_or_degrade_capability",
  advisorFailureKind: "self_fix_churn",
  advisorActionCode: "continuous-worker-prompt-probe",
  advisorWorkClass: "direct_unblock_repair",
  capabilityName: "tmuxWorkerMutation",
  capabilityState: "parked",
  capabilitySafeFallbacks: ["dispatch_apply_existing_gates"],
  evidenceRefs: ["self-repair:continuous-worker-prompt-probe", "cycle:manager-contract"],
  sourceRefs: ["manager:continuous-run"],
});
assertCondition(advisorClassification.status === "ready", "Codex advisor classification intake must accept structured metadata recommendations", failures);
assertCondition(advisorClassification.summary.posturePatch?.tmuxWorkerMutation?.state === "parked", "Codex advisor classification must produce a posture patch for park/degrade recommendations", failures);
assertCondition(advisorClassification.nextActions?.[0]?.code === "codex-advisor-posture-preview-ready", "Codex advisor classification must route posture changes through the posture gate", failures);
assertCondition(!/raw prompt|provider payload|sk-contracttoken/i.test(JSON.stringify(advisorClassification.summary)), "Codex advisor classification must retain metadata only", failures);
const blockedAdvisorClassification = buildCodexAdvisorClassificationPlan({
  runId: "manager-contract",
  command: "classify",
  advisorCondition: "novel manager issue",
  advisorRecommendation: "park_or_degrade_capability",
  capabilityName: "tmuxWorkerMutation",
  capabilityState: "parked",
  capabilitySafeFallbacks: ["dispatch_apply_existing_gates"],
  evidenceRefs: ["raw prompt transcript"],
  apply: true,
});
assertCondition(blockedAdvisorClassification.status === "blocked", "Codex advisor classification must block raw evidence and direct apply", failures);
assertCondition(blockedAdvisorClassification.blockers.some((blocker) => blocker.code === "codex-advisor-classification-forbidden-mutation"), "Codex advisor classification must remain plan-only", failures);
const churnAdvisorPlan = buildContinuousRunPlan(
  {},
  {
    cyclePacket: {
      ok: true,
      status: "attention",
      summary: {
        run: { runId: "manager-contract" },
        usage: { state: "normal" },
        resources: { state: "normal" },
        workers: { workerCounts: { active: 1, warm: 0, paused: 0 } },
        selfRepair: { budget: 2, attemptsByAction: { "continuous-worker-prompt-probe": 2 } },
        continuation: { workerMutationAllowed: true },
      },
      warnings: [],
      nextActions: [],
    },
    promptProbe: {
      status: "attention",
      summary: { probes: [{ workerId: "codex-1", promptDetected: true, inputHasManagerPointer: true }] },
      warnings: [],
      nextActions: [
        {
          code: "worker-prompt-probe-submit-ready",
          summary: "Submit pending manager pointer.",
          nextAction: "node ./scripts/manager-worker-prompt-probe.mjs --summary-json --limit 1 --apply",
        },
      ],
    },
  },
);
assertCondition(churnAdvisorPlan.summary.codexAdvisor?.status === "ready", "Continuous self-repair churn must produce a Codex advisor recommendation", failures);
assertCondition(churnAdvisorPlan.summary.codexAdvisor?.recommendations?.[0]?.recommendedResponse === "park_or_degrade_capability", "Continuous self-repair churn advisor must recommend park/degrade when no task work remains", failures);
assertCondition(churnAdvisorPlan.nextActions?.[0]?.code === "continuous-codex-advisor-packet-ready", "Continuous self-repair churn must expose advisor packet as the next visible action", failures);
assertCondition(!/raw prompt|provider payload|sk-contracttoken/i.test(JSON.stringify(churnAdvisorPlan.summary.codexAdvisor)), "Continuous advisor recommendations must retain metadata only", failures);

const cycleAttention = buildCyclePacket(
  { runId: "manager-contract", desiredWorkers: 6, stateRoot, failureBudget: 3 },
  {
    stateSignals: readyReconciliationSignals(),
    assignmentSummary: { summary: { backlogStatusCounts: { assignable: 6, closed: 0 } } },
    dispatchPreview: { summary: { counts: { dispatchable: 6, active: 0 }, candidateStateCounts: { assignable: 6 } } },
    refillPlan: { summary: { safeWorkSupply: 6, candidateLanes: [] } },
    sourcePlanningState: {
      sprintStatus: {
        exists: true,
        path: "_bmad-output/implementation-artifacts/sprint-status-manager-contract.yaml",
        backlogStories: 1,
        readyStories: 5,
        reviewReadyStories: 0,
        readyForDevStories: 5,
        activeStories: 0,
        doneStories: 78,
        nextBacklogStoryKey: "6-6-overnight-run-recovery-and-housekeeping",
      },
    },
    usageContext: { status: "normal" },
    resourceContext: { status: "normal" },
    questions: [
      { workerId: "codex-1", type: "verification", sourceRefs: [] },
      { workerId: "codex-1", type: "verification", sourceRefs: [] },
      { workerId: "codex-1", type: "verification", sourceRefs: [] },
    ],
    tmuxSummary: { unmanagedPanes: 0, takeoverRequiredPanes: 0 },
    tmuxContext: {
      tmuxResult: { ok: true, panes: [], error: "" },
      workspaceResult: { stateRoot, manifests: [], manifestErrors: [] },
      env: { USER: "tester" },
    },
  },
);
assertCondition(cycleAttention.status === "attention", "Cycle packet must surface parked worker friction loops as attention", failures);
assertCondition(/Park the lane/i.test(cycleAttention.summary.report), "Cycle report must surface friction action when it is the current action", failures);

const cycleQuestionBlocker = buildCyclePacket(
  { runId: "manager-contract", desiredWorkers: 6, stateRoot, failureBudget: 3 },
  {
    stateSignals: readyReconciliationSignals(),
    assignmentSummary: { summary: { backlogStatusCounts: { assignable: 6, closed: 0 } } },
    dispatchPreview: { summary: { counts: { dispatchable: 6, active: 0 }, candidateStateCounts: { assignable: 6 } } },
    refillPlan: { summary: { safeWorkSupply: 6, candidateLanes: [] } },
    sourcePlanningState: {
      sprintStatus: {
        exists: true,
        path: "_bmad-output/implementation-artifacts/sprint-status-manager-contract.yaml",
        backlogStories: 1,
        readyStories: 5,
        reviewReadyStories: 0,
        readyForDevStories: 5,
        activeStories: 0,
        doneStories: 78,
        nextBacklogStoryKey: "6-6-overnight-run-recovery-and-housekeeping",
      },
    },
    usageContext: { status: "normal" },
    resourceContext: { status: "normal" },
    safeWorkers: { eligibleCount: 1, workers: ["codex-4"], lanes: ["lane-safe"], source: "dispatcher-lease-truth", freshness: "fresh" },
    questions: [{
      workerId: "codex-1",
      questionId: "question-contract-delivery-cycle",
      type: "delivery",
      requestedAction: "merge and delete branch",
      authorityFamily: "delivery_phase",
      sourceRefs: ["story:manager-contract"],
      leaseId: "lease-delivery",
      laneId: "lane-delivery",
      materialDecision: true,
    }],
    tmuxSummary: { unmanagedPanes: 0, takeoverRequiredPanes: 0 },
    tmuxContext: {
      tmuxResult: { ok: true, panes: [], error: "" },
      workspaceResult: { stateRoot, manifests: [], manifestErrors: [] },
      env: { USER: "tester" },
    },
  },
);
assertCondition(cycleQuestionBlocker.status === "attention", "Cycle packet must keep worker-question operator blockers lane-scoped attention", failures);
assertCondition(cycleQuestionBlocker.blockers[0]?.code === "worker-question-operator-interruption", "Cycle packet must expose unsafe worker question as operator blocker", failures);
assertCondition(cycleQuestionBlocker.nextActions[0]?.code === "worker-question-operator-interruption", "Cycle packet must prioritize unsafe worker question action before dispatch/refill", failures);
assertCondition(cycleQuestionBlocker.summary.dependencyLoops?.unrelatedWork?.eligibleCount === 1, "Cycle packet must preserve unrelated safe work metadata for worker dependency loops", failures);
assertCondition(/Operator decision for delivery authority/i.test(cycleQuestionBlocker.summary.report), "Cycle report must surface unsafe worker question operator action", failures);

try {
  const missingEvidence = ledgerCommand({ command: "append-question", runId: "manager-contract", stateRoot, summary: "needs evidence" });
  assertCondition(missingEvidence.status === "blocked", "Manager ledger must block question append without complete evidence", failures);
  assertCondition(missingEvidence.blockers?.[0]?.code === "ledger-evidence-missing", "Manager ledger missing-evidence blocker must remain explicit", failures);
  const nonMaterialQuestion = ledgerCommand({
    command: "append-question",
    runId: "manager-contract",
    stateRoot,
    summary: "non-material question",
    authorityBasis: "manager-best-judgment",
    recoveryPath: "answer without recording",
    sourceRefs: ["story:manager-contract"],
    evidenceRefs: ["evidence:non-material-question"],
  });
  assertCondition(nonMaterialQuestion.blockers?.[0]?.code === "ledger-question-not-material", "Manager ledger must not persist non-material worker questions", failures);
  const sanitized = ledgerCommand({
    command: "append-event",
    runId: "manager-contract",
    stateRoot,
    summary: "raw prompt completion reasoning trace provider payload sk-contracttoken",
    authorityBasis: "manager-owned-ledger-append",
    recoveryPath: "inspect redacted manager ledger summary",
    sourceRefs: ["story:manager-contract"],
    evidenceRefs: ["evidence:manager-contract"],
  });
  assertCondition(sanitized.status === "ready", "Manager ledger append-event behavior must remain available for manager-owned summaries", failures);
  assertCondition(!/raw prompt|completion|reasoning trace|provider payload|sk-contracttoken/i.test(sanitized.summary?.event?.summary || ""), "Manager ledger must redact raw provider/retention terms from summaries", failures);
} finally {
  rmSync(stateRoot, { recursive: true, force: true });
}

const forbiddenLiveAccess = [
  ...["tmux", "gh", "codex", "curl"].flatMap((tool) => [`spawnSync("${tool}"`, `spawnSync('${tool}'`, `execFileSync("${tool}"`, `execFileSync('${tool}'`, `execSync("${tool}"`, `execSync('${tool}'`]),
  "import { exec" + "FileSync",
  "import { exec" + "Sync",
  "from \"node:" + "https\"",
  "from 'node:" + "https'",
  "from \"node:" + "http\"",
  "from 'node:" + "http'",
  "fet" + "ch(",
  "h" + "ttps://",
  "h" + "ttp://",
  "worker:smoke" + ":execute",
];

for (const forbidden of forbiddenLiveAccess) {
  assertCondition(!checkScript.includes(forbidden), `check-manager-control-plane must not require live tool/network/worker access: ${forbidden}`, failures);
}

if (failures.length > 0) {
  console.error("Manager control plane drift check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("OK: manager control plane contract checks passed.");
