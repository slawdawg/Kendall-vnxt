import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { hostname, tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { runAntiChurnGuidanceHookCli } from "./anti-churn-guidance-hook.mjs";
import { protectedBranches as branchFoundationProtectedBranches } from "./lib/branch-foundation.mjs";
import { buildAssignmentInventory } from "./lib/codex-workspace-assignment-inventory.mjs";
import { inspectBaseCheckoutRecovery } from "./lib/base-checkout-recovery.mjs";
import { assertWorkspaceStateStorage, currentGitRoot, workspaceKey, workspaceState } from "./lib/codex-workspace-state.mjs";
import { resolveWorkspaceCommand } from "./lib/workspace-command-resolution.mjs";
import {
  evaluateEpicBatchAdmission,
  buildEpicBatchFinishPlan,
  buildEpicBatchManifest,
  EPIC_BATCH_DEFAULT_LIMITS,
} from "./lib/epic-batch-contract.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const defaultBaseBranch = "dev";
const MAX_BASE_BRANCH_LENGTH = 250;
const MAX_BASE_REF_LENGTH = 257;
const defaultVerificationTimeoutMs = 120_000;
const codexWorkspaceVerificationTimeoutMs = 600_000;
const dashboardVerificationTimeoutMs = 600_000;
const checkVerificationTimeoutMs = 900_000;
const verificationDiagnosticSchemaVersion = 2;
const verificationDiagnosticTailMaxBytes = 2_048;
const verificationDiagnosticCaptureMaxBytes = 4 * 1024 * 1024;
const resumableCheckInvocationBudgetMs = 180_000;
// Every ordinary leaf must start with enough time to produce useful evidence.
// Otherwise a short, healthy command can be killed solely because a prior leaf
// consumed the invocation budget just before it began.
const resumableCheckDefaultLeafExecutionReserveMs = 30_000;
const resumableCheckSupervisorLeafTimeoutMs = 150_000;
const resumableCheckSupervisorLeafExecutionReserveMs = 170_000;
const resumableCheckPacketSchemaVersion = 1;
const resumableCheckPacketTtlMs = 30 * 60 * 1000;
const resumableCheckPacketFutureSkewMs = 30_000;
// Retry history is audit evidence, not a scheduler. Thirty seconds tolerates
// ordinary local clock skew while rejecting timestamps projected far enough
// ahead to make the bounded record untrustworthy.
const environmentPreflightRetryHistoryFutureSkewMs = 30_000;
const environmentPreflightRetryHistoryLimit = 32;
const environmentPreflightRetryStatuses = new Set([
  "started",
  "failed",
  "blocked_snapshot_changed",
  "blocked_packet_changed",
  "preflight_passed",
]);
const environmentPreflightRetryHistoryFields = new Set([
  "schema_version",
  "started_at",
  "completed_at",
  "task_id",
  "owner",
  "profile",
  "failed_stage",
  "head",
  "plan_digest",
  "staged_input_digest",
  "status",
  "delivery",
]);
const resumableCheckRoutingPreviewLeaves = Object.freeze([
  "test:supervisor:check-routing-preview-01",
  "test:supervisor:check-routing-preview-02",
  "test:supervisor:check-routing-preview-03",
  "test:supervisor:check-routing-preview-04",
  "test:supervisor:check-routing-preview-05",
  "test:supervisor:check-routing-preview-06",
  "test:supervisor:check-routing-preview-07",
  "test:supervisor:check-routing-preview-08",
]);
const resumableCheckSupervisorLeaves = Object.freeze([
  "test:supervisor:check:preflight",
  "test:supervisor:check:non-integration",
  "test:supervisor:check:integration:orchestrator-fake-workers",
  "test:supervisor:check:integration:operational-action-v1-pause-drain",
  "test:supervisor:check:integration:work-packets",
  "test:supervisor:check:integration:bmad-import-parser",
  "test:supervisor:check:integration:epic25-evidence-chain",
  ...resumableCheckRoutingPreviewLeaves,
  "test:supervisor:check:integration:review-route-packet",
  "test:supervisor:check:integration:manager-source-intake-adapter",
  "test:supervisor:check:integration:operational-action-v1-retry-reassign",
  "test:supervisor:check:integration:candidate-work-api",
  "test:supervisor:check:integration:local-dogfood-attestation",
  "test:supervisor:check:integration:manager-terminal-events",
  "test:supervisor:check:integration:supervisor-flow",
]);
const resumableCheckSupervisorLeafSet = new Set(resumableCheckSupervisorLeaves);
const resumableCheckNestedStageExpansions = Object.freeze({
  "check:fast": ["check:ci-fast", "check:workspace-fast", "check:sandbox-fast", "check:dashboard-fast"],
  "check:workspace-fast": [
    "test:codex-workspace-state",
    "test:workspace-command-resolution",
    "test:base-checkout-recovery",
    "test:mutation-admission",
    "test:mutation-admission-workspace-handoff",
    "test:mutation-admission-prewrite-guard",
    "test:codex-workspace:delivery",
    "test:workspace-fast-profile",
  ],
  "test:supervisor": resumableCheckSupervisorLeaves,
});
const resumableCheckTrailingWorkspaceDuplicates = new Set([
  "test:codex-workspace-state",
  "test:workspace-command-resolution",
]);
const externalCheckStageEvidenceStage = "test:codex-workspace";
const externalCheckStageEvidenceCommand = Object.freeze(["pnpm", "run", externalCheckStageEvidenceStage]);
const resumableCheckLongLeafBudgetMs = codexWorkspaceVerificationTimeoutMs;
// These two leaves have independently exceeded the ordinary 180s invocation
// budget in governed delivery. They remain explicit fixed commands; only their
// invocation budget is extended. The external-evidence handoff stays limited
// to test:codex-workspace below.
const resumableCheckLongLeafStages = new Set([
  externalCheckStageEvidenceStage,
  "test:manager-control-plane",
]);
const taskLockSchemaVersion = 1;
const taskLeaseSchemaVersion = 1;
const legacyRecoveryAdoptionTaskId = "20260810-recover-finish-pr-preflight-and-stale-lock-lifec";
const taskLeaseMaximumHistoryRecords = 4_096;
const taskLeaseMaximumHeartbeatHistoryRecords = 1_024;
// Every lease inspection walks immutable predecessor records from root through
// the current generation.  Acquiring a successor at this bound would make the
// successor impossible to inspect and therefore impossible to release.  Keep
// the bound explicit and reserve the final inspectable slot before a callback
// or durable manifest write can run.
const taskLeaseMaximumGenerationChainLength = 64;
const taskLeaseMaximumEpochCount = 16;
let activeTaskLeaseWriteContext = null;
const cleanupBranchesDefaultBaseRef = "origin/main";
const cleanupIntegratedDefaultBaseRef = "origin/dev";
const canonicalKendallRepository = Object.freeze({ owner: "slawdawg", name: "Kendall-vnxt" });
const strictExactTreeCloseoutTaskId = "20260723-tailnet-authenticated-dashboard-persistence-and";
const missingWorktreeCloseoutTargets = Object.freeze({
  "20260724-synchronize-dev-recovery": {
    prNumber: null,
    branch: "codex/synchronize-dev-recovery",
    worktreeName: "20260724-synchronize-dev-recovery",
    // The original manifest pre-dates source-head persistence. This one-task
    // profile binds the recovered source candidate to the independently
    // merged successor without permitting a general missing-head fallback.
    supersededBy: {
      prNumber: 710,
      recoveredSourceCommit: "d0a31e95c7ebdb6c57fb2281e6a40dcd40603275",
      sourceTree: "88e56c34edd9afb6a32a41d2a6a551d91d7c5247",
      sourceParent: "0697c3e6ff4c10ecfd581b074ea3ba423a42caa4",
      prHead: "751d8f8936bfa987257b0002326f6bad82ea84df",
      mergeCommit: "84d8c21feb9940ec85b818007654ee6765aeb169",
      scope: ["AGENTS.md", "docs/workflows/end-to-end-lane-runner.md", "docs/workflows/tool-churn-rca-examples.md"],
    },
  },
  "dashboard-delivery-profile": { prNumber: 751, branch: "codex/dashboard-delivery-profile", worktreeName: "dashboard-delivery-profile", legacyWorktreeRelativePath: ".codex-workspaces/dashboard-delivery-profile" },
  // This is a one-time legacy recovery exception.  The recorded delivery head
  // was later amended on the same merged PR; accept no other ancestor pair.
  "dashboard-lan-navigation": {
    prNumber: 753,
    branch: "codex/dashboard-lan-navigation",
    worktreeName: "dashboard-lan-navigation",
    approvedAncestorDeliveryHeadPair: Object.freeze({
      recordedHead: "63c138fdca01d6af5bd234c861f64a5779c6f58e",
      livePrHead: "4499822c180fb6d5d85d7109d9f0fec78dc1bed6",
    }),
  },
});
const rebuildIndexBaseBranch = "main";
const protectedBranches = new Set(branchFoundationProtectedBranches);
const maxReviewRequestPages = 100;
const maxResolutionRecoveryHops = 20;
const maxResolutionOutcomeRetention = 20;
const resolutionRetentionOverflowStatus = "unrecovered-history-truncated";
const recognizedResolutionRecoveryMutations = new Set([
  "attempt-recorded",
  "ambiguous-or-failed",
  "retry-authorized-after-live-unresolved-audit",
  "confirmed-by-mutation-response",
  "confirmed-by-post-audit-recovery",
  "retry-authorized-after-kind-change",
]);
// This is deliberately not a general non-ancestral recovery mechanism. It is
// the one operator-authorized historical rewrite recorded for PR #723. A
// later implementation commit necessarily advances the PR beyond the
// authorized anchor, so the live head must descend from that anchor exactly.
const pr723NonAncestralRefreshException = Object.freeze({
  taskId: "20260727-standing-review-thread-resolution-authority",
  repository: "slawdawg/Kendall-vnxt",
  prNumber: 723,
  prUrl: "https://github.com/slawdawg/Kendall-vnxt/pull/723",
  baseBranch: "dev",
  branch: "codex/standing-review-thread-resolution-authority",
  priorHeadSha: "df0200175510c8346ef98b10f45c19a5e195219a",
  authorizedAnchorHeadSha: "85a74486f65328f76986834a61859b8f2e191042",
  documentedMergeBaseSha: "b8df8d162195993c7d37f5162b46783a388963d1",
});
const args = process.argv.slice(2);
const command = args[0];
const commandArgs = args.slice(1);

if (!command || command === "--help" || command === "-h") {
  printHelp();
  process.exit(command ? 0 : 1);
}

if (commandArgs.includes("--help") || commandArgs.includes("-h")) {
  printHelp();
  process.exit(0);
}

try {
  switch (command) {
    case "start":
      startWorkspace(commandArgs);
      break;
    case "list":
      listWorkspaces(commandArgs);
      break;
    case "coordination-report":
      coordinationReport(commandArgs);
      break;
    case "assignment-report":
      assignmentReport(commandArgs);
      break;
    case "claim-next":
      claimNext(commandArgs);
      break;
    case "heartbeat":
      heartbeat(commandArgs);
      break;
    case "close-assignments":
      closeAssignments(commandArgs);
      break;
    case "takeover":
      takeover(commandArgs);
      break;
    case "dispatch-next":
      dispatchNext(commandArgs);
      break;
    case "emergency-stop":
      emergencyStop(commandArgs);
      break;
    case "resume":
      resumeWorkspace(commandArgs);
      break;
    case "finish-pr":
      finishPr(commandArgs);
      break;
    case "record-check-stage-evidence":
      recordCheckStageEvidence(commandArgs);
      break;
    case "inspect-task-lock":
      inspectTaskLockCommand(commandArgs);
      break;
    case "settle-external-intent":
      settleExternalIntent(commandArgs);
      break;
    case "adopt-legacy-recovery":
      adoptLegacyRecovery(commandArgs);
      break;
    case "finish-epic":
      finishEpic(commandArgs);
      break;
    case "verify-pr-gates":
      verifyPrGates(commandArgs);
      break;
    case "refresh-pr-head":
      refreshPrHead(commandArgs);
      break;
    case "adjudicate-outdated-thread":
      adjudicateOutdatedThread(commandArgs);
      break;
    case "resolve-adjudicated-thread":
      resolveAdjudicatedThread(commandArgs);
      break;
    case "adjudicate-current-thread":
      adjudicateCurrentThread(commandArgs);
      break;
    case "resolve-adjudicated-current-thread":
      resolveAdjudicatedCurrentThread(commandArgs);
      break;
    case "verify-unmanaged-pr-gates":
      verifyUnmanagedPrGates(commandArgs);
      break;
    case "reconcile-merged-pr":
      reconcileMergedPr(commandArgs);
      break;
    case "cleanup-merged":
      cleanupMerged(commandArgs);
      break;
    case "cleanup-current":
      cleanupCurrent(commandArgs);
      break;
    case "cleanup-integrated":
      cleanupIntegrated(commandArgs);
      break;
    case "close-missing-worktree":
      closeMissingWorktree(commandArgs);
      break;
    case "cleanup-superseded":
      cleanupSuperseded(commandArgs);
      break;
    case "cleanup-orphans":
      cleanupOrphans(commandArgs);
      break;
    case "cleanup-branches":
      cleanupBranches(commandArgs);
      break;
    case "repair-manifests":
      repairManifests(commandArgs);
      break;
    case "rebuild-index":
      rebuildIndex(commandArgs);
      break;
    case "doctor":
      doctor(commandArgs);
      break;
    default:
      throw new Error(`Unknown command: ${command}`);
  }
} catch (error) {
  console.error(`FAIL: ${error.message}`);
  process.exit(1);
}

function printHelp() {
  console.log(`Usage: node ./scripts/codex-workspace.mjs <command> [options]

Commands:
  start <description>       Create a task manifest, branch, and worktree.
  list                      Show known Codex workspaces.
  coordination-report       Show a read-only workspace coordination packet.
  assignment-report         Show read-only runner assignment inventory and blockers.
  claim-next                Preview the next claimable runner assignment lane.
  heartbeat <query>         Update owner-only runner heartbeat evidence.
  close-assignments         Close assignment records whose workspaces are already closed.
  takeover <query>          Build or apply explicit stale-owner takeover evidence.
  dispatch-next             Claim or resume one safe lane and record handoff evidence.
  emergency-stop            Preview, apply, or clear a metadata-only emergency stop checkpoint.
  resume <query>            Print the matching task worktree and branch.
  finish-pr [query]         Commit, push, and create/view a PR for a task.
  inspect-task-lock <task-id> Read a redacted, exact-task lock inspection packet.
  adopt-legacy-recovery  Preview or apply the one governed v1-to-v2 recovery adoption.
  finish-epic [query]       Plan final epic-batch closeout without delivery mutation.
  verify-pr-gates [query]   Record exact-head checks and review-thread PR gate evidence.
  refresh-pr-head [query]   Explicitly rebind a stale managed PR delivery head after fresh remote proof.
  adjudicate-outdated-thread [query] Record evidence for one satisfied outdated review thread; never resolves it.
  resolve-adjudicated-thread [query] Resolve exactly one freshly revalidated adjudicated thread, then re-audit.
  adjudicate-current-thread [query] Record exact-head evidence for one fully satisfied current review thread; never resolves it.
  resolve-adjudicated-current-thread [query] Resolve exactly one freshly revalidated current thread without a reply, then re-audit.
  verify-unmanaged-pr-gates Inspect a detached-worktree PR gate packet without manifest mutation.
  reconcile-merged-pr <query> Record verified merged-PR metadata before cleanup.
  cleanup-merged [query]    Remove clean worktrees whose PRs are merged.
  cleanup-current           Remove the current clean worktree after its PR is merged.
  cleanup-integrated [query] Remove clean integrated worktrees with no PR, or one explicitly approved non-open PR record.
  close-missing-worktree <task-id> Close one allowlisted stale manifest whose managed worktree and branch refs are proven absent.
  cleanup-superseded <task> Remove one clean no-PR worktree carried forward by a named merged PR.
  cleanup-orphans [query]   Remove orphan directories no longer registered as Git worktrees.
  cleanup-branches [query]  Remove safe local codex/* branches already present in the base ref by ancestry or patch-id.
  repair-manifests          Preview or apply conservative repairs for closed legacy manifests.
  rebuild-index             Rebuild missing manifests from Git worktrees.
  doctor                    Check local workspace protocol readiness.

Common options:
  --help, -h               Show this help and exit without resolving or mutating a workspace.
  --dry-run                 Print the planned mutation without applying it.
  --state-root <path>       Override the Codex workspace state root.
  --owner <id>              Override the lane owner recorded or checked for this command.
  --take-ownership          Reassign a lane to the current owner before mutating it.
  --takeover-reason <text>  Required with --take-ownership when another owner is recorded.

start options:
  --base <branch>           Base branch. Defaults to dev.
  --base-ref <ref>          Exact local or origin base ref paired with --base.
  --branch <branch>         Override generated branch name.
  --mode <pr|experiment|epic-batch>
                             Task mode. Defaults to pr.
  --epic-id <id>             Required with epic-batch mode.
  --decision-ref <ref>       Required with epic-batch mode.
  --expected-slices <list>   Comma-separated slices required for admission.
  --allowed-paths <list>     Comma-separated allowlisted paths for admission.
  --no-fetch                Do not fetch origin before creating the branch.
  --summary-json            With --dry-run, print a bounded JSON start plan.
  --task-id <id>            Override generated task id.
  --worktree <path>         Override generated worktree path.

list options:
  --active                  Show only non-closed workspaces.
  --owned                   Show only workspaces owned by the current runner.
  --owner <id>              Show only workspaces owned by the given owner.
  --json                    Print matching workspaces as JSON for automation.
  --summary-json            Print bounded inventory counts and a row sample.

coordination-report options:
  --json                    Print the coordination packet as JSON for automation.
  --summary-json            Print a bounded JSON summary for quick runner scans.
  --stale-after-seconds <n> Override stale owner threshold. Defaults to 86400.

assignment-report options:
  --summary-json            Print a bounded JSON summary for quick runner scans.
  --stale-after-seconds <n> Override stale owner threshold. Defaults to 86400.

claim-next options:
  --dry-run                 Preview only; no mutation.
  --apply                   Write assignment metadata for an unowned ready lane.
  --summary-json            With --dry-run, print a bounded JSON summary.
  --stale-after-seconds <n> Override stale owner threshold. Defaults to 86400.

heartbeat options:
  --json                    Print the written heartbeat evidence packet as JSON.
  --phase <phase>           Runner phase. Defaults to active.
  --runner-kind <kind>      Runner kind. Defaults to codex-cli.
  --current-command <text>  Current command or wait state summary.
  --last-result <text>      Last result summary.
  --decision <text>         Best-judgment decision summary to retain as metadata-only evidence.
  --decision-rationale <text> Rationale for the best-judgment decision.
  --next-safe-action <text> Next bounded action after the decision.
  --stale-after-seconds <n> Stale owner threshold to record. Defaults to 86400.

close-assignments options:
  --ids <a,b>               Comma-separated assignment ids to close.
  --apply                   Apply closeout. Without this, closeout is dry-run.
  --summary-json            Without --apply, print a bounded JSON closeout summary.
  --allow-stale-record-cleanup Allow explicitly approved closeout of abandoned stale assignment records.
  --approval <text>         Required with --allow-stale-record-cleanup --apply.
  --delegated-cleanup-owner <id> Stable owner delegated to this worker for approved stale-record cleanup only.
  --delegation-evidence <text> Required with --delegated-cleanup-owner. Metadata-only delegation evidence.

takeover options:
  --dry-run                 Print takeover packet without mutation.
  --apply                   Apply takeover after evidence gates pass.
  --summary-json            With --dry-run, print a compact JSON takeover summary.
  --takeover-reason <text>  Required. Explains takeover in at least 10 non-whitespace characters.
  --approval <text>         Required with --apply. Operator approval evidence.
  --allow-dirty-in-lane     Opt in to the narrowly gated dirty-worktree takeover path.
  --dirty-paths <path>      Repeat for each exact dirty relative path required by --allow-dirty-in-lane.
  --stale-after-seconds <n> Override stale owner threshold. Defaults to 86400.

dispatch-next options:
  --dry-run                 Preview dispatch without mutation.
  --apply                   Claim/prepare one lane and record handoff evidence.
  --summary-json            With --dry-run, print a bounded JSON summary.
  --readiness <profile>     Readiness profile: doctor, preflight, none. Defaults to doctor.
  --base <branch>           Base branch for a created worktree. Defaults to dev.
  --task-id <id>            Override task id when creating a workspace.
  --worktree <path>         Override worktree path when creating a workspace.
  --no-fetch                Do not fetch origin before creating a workspace.
  --stale-after-seconds <n> Override stale owner threshold. Defaults to 86400.

emergency-stop options:
  --dry-run                 Preview checkpoint without mutation.
  --apply                   Write or clear the metadata-only emergency stop checkpoint.
  --summary-json            With --dry-run, print a compact JSON checkpoint summary.
  --mode <pause|drain|kill> Stop posture to record. Defaults to pause.
  --reason <text>           Required. Explains the stop or clear in at least 10 non-whitespace characters.
  --approval <text>         Required for --mode kill --apply and --clear --apply; records operator approval evidence.
  --clear                   Clear an active checkpoint after operator-approved resume.

resume options:
  --json                    Print the matched workspace resume packet as JSON.

finish-pr options:
  --message <text>          Commit message. Defaults to task title.
  --stage-all               Stage all current worktree changes before commit.
  --verify <profile>        Verification profile: scoped, preflight, check, check-fast, dashboard, workspace-fast, manager-control-plane, docs, codex-workspace.
  --retry-environment-preflight
                            Re-run one exact-bound check packet that failed at its initial preflight stage without staging or changing its source snapshot.
  --no-verify               Skip verification command.
  --title <text>            PR title. Defaults to task title.
  --body <text>             PR body.

record-check-stage-evidence options:
  --external-direct-success Attest that the fixed external direct command succeeded.
  --apply                   Record the bounded handoff. Without this, show a dry-run plan.
  --state-root <path>       Override local workspace state root.
  Runner identity is derived from the current runner and must match the recorded lane owner.

inspect-task-lock options:
  <task-id>                 Exact managed task id to inspect.
  --summary-json            Print a redacted, read-only lock inspection packet.

settle-external-intent options:
  <task-id>                 Exact owner-managed task with one unresolved external intent.
  --intent-id <uuid>        Exact immutable unresolved intent to settle.
  --dry-run                 Print the bounded settlement packet without mutation.
  --apply                   Append an immutable owner-attested completion record.
  --approval <text>         Required with --apply; records the operator authorization.

adopt-legacy-recovery options:
  --dry-run                 Print exact dead-owner and inode/hash evidence without mutation.
  --apply                   Publish only the bounded adoption evidence for the named recovery task.
  --approval <text>         Required with --apply; recorded as bounded operator evidence.
  --summary-json            Print a compact adoption packet.

finish-epic options:
  --summary-json            Print a bounded closeout plan without mutation.
  --verification-ref <ref>  Existing final verification evidence reference.
  --review-ref <ref>        Existing final review evidence reference.
  --age-business-days <n>   Elapsed UTC business days; stale batches hold.

verify-pr-gates options:
  --apply                   Record gate evidence in the manifest. Without this, gate check is dry-run.
  --summary-json            Without --apply, print a compact JSON gate packet.
  --delivery-audit-agent <id> Agent or reviewer id for independent delivery audit evidence.
  --delivery-audit-status <status> Delivery audit recommendation. Must be merge-ready for bounded merge.
  --delivery-audit-summary <text> Metadata-only delivery audit summary for the exact PR head.
  --merge-method <text>     Required planned gh pr merge --merge --match-head-commit <expected-head> command; cleanup flags are forbidden.
  --rollback-path <text>    Required bounded revert or recovery path for a later merge.
  --non-required-checks <list> Comma-separated skipped check names accepted by the named policy.
  --non-required-check-policy <ref> Required source-owned policy reference for --non-required-checks.
  --diff-risk-summary <text> Exact-head diff-risk assessment summary.
  --diff-risk-files <list> Changed paths covered by the assessment; use a JSON string array when paths contain commas or exceed normal metadata lengths.
  --diff-risk-verification <text> Bounded focused verification result for the assessment.
  --diff-risk-verification-command <text> Executed focused verification command for the assessment.
  --diff-risk-verification-exit-code <0> Required successful focused verification exit status.

refresh-pr-head options:
  --reason <text>           Required bounded reason for the explicit stale-head rebind.
  --non-ancestral-recovery-authorization <text>
                             Required only for the one literal, audited PR #723 historical-rewrite recovery.
  --apply                   Record the rebind under the task lock. Without this, print a dry-run plan.
  --summary-json            Without --apply, print the bounded rebind evidence packet.
  Supports --non-required-checks and --non-required-check-policy for exact-head documented skipped checks.

adjudicate-outdated-thread options:
  --thread-id <id>          Required unresolved outdated GitHub review-thread id.
  --request-fingerprint <sha256> Required fingerprint emitted by the thread-aware audit.
  --request-summary <text>  Required bounded summary of the original request.
  --diff-summary <text>     Required current-head mapping from request to change.
  --mapped-files <list>     Required changed PR paths implementing the request.
  --renamed-paths <json>    Optional exact [{"from":"old/path","to":"new/path"}] mapping when an outdated thread anchors a renamed path.
  --verification <text>     Required focused local verification evidence.
  --verification-command <text> Required executed verification command.
  --verification-exit-code <0> Required successful verification result.
  --review-summary <text>   Required bounded code-review evidence.
  --reviewer-id <id>        Required reviewer or audit identity.
  --high-risk-authorization <text> Required exact evidence: operator-authorized thread=<id> head=<sha> for one named high-risk thread.
  --apply                   Record adjudication evidence in the manifest. Never resolves GitHub threads.
  --summary-json            Without --apply, print the adjudication packet.
  Supports --non-required-checks and --non-required-check-policy for exact-head documented skipped checks.

adjudicate-current-thread options:
  --thread-id <id>          Required unresolved current GitHub review-thread id.
  --request-fingerprint <sha256> Required fingerprint emitted by the thread-aware audit.
  --request-summary <text>  Required bounded summary of the original request.
  --diff-summary <text>     Required current-head mapping from request to change.
  --mapped-files <list>     Required changed PR paths implementing the request.
  --verification <text>     Required focused local verification evidence.
  --verification-command <text> Required executed verification command.
  --verification-exit-code <0> Required successful verification result.
  --review-summary <text>   Required independent code-review evidence.
  --reviewer-id <id>        Required reviewer or audit identity.
  --high-risk-authorization <text> Required exact evidence: operator-authorized thread=<id> head=<sha> for one named high-risk thread.
  --apply                   Record adjudication evidence in the manifest. Never resolves GitHub threads.
  --summary-json            Without --apply, print the adjudication packet.
  Supports --non-required-checks and --non-required-check-policy for exact-head documented skipped checks.

verify-unmanaged-pr-gates options:
  --pr <number>             Required pull-request number in this repository.
  --base <branch>           Required expected base branch.
  --expected-head <sha>     Required exact detached-worktree and PR head SHA.
  --merge-method <text>     Required planned exact-head merge method.
  --rollback-path <text>    Required bounded revert or recovery path.
  --summary-json            Print the bounded external evidence packet.
  Supports the verify-pr-gates delivery-audit, non-required-check, and diff-risk options.

reconcile-merged-pr options:
  --apply                   Record verified merged-PR metadata only. Without this, inspect only.
  --summary-json            Without --apply, print a compact reconciliation packet.
  --delivery-audit-agent <id> Agent or reviewer id for an independent cleanup audit.
  --delivery-audit-status <status> Cleanup audit recommendation. Must be cleanup-ready.
  --delivery-audit-summary <text> Metadata-only cleanup audit summary for the exact PR head.
  --delivery-audit-head-sha <sha> Optional exact head override; must match the merged PR head.
  --allow-audited-descendant-head Reserved; fail-closed until independently retained exact-head successor evidence is available.
  --approval <text>         Reserved with --allow-audited-descendant-head; does not bypass the fail-closed hold.

cleanup-merged options:
  --apply                   Apply cleanup. Without this, cleanup is dry-run.
  --delete-remote           Delete remote branch after merged cleanup.
  --summary-json            Without --apply, print a compact JSON cleanup summary.
  --delivery-audit-agent <id> Agent or reviewer id for independent delivery audit evidence.
  --delivery-audit-status <status> Delivery audit recommendation. Must be cleanup-ready.
  --delivery-audit-summary <text> Metadata-only delivery audit summary for the exact PR head.
  --take-ownership          Reassign a lane and linked assignment to the current owner before cleanup.
  --takeover-reason <text>  Required with --take-ownership when another owner is recorded.

cleanup-current options:
  --apply                   Apply cleanup. Without this, cleanup is dry-run.
  --delete-remote           Delete remote branch after merged cleanup.
  --summary-json            Without --apply, print a compact JSON cleanup summary.
  --delivery-audit-agent <id> Agent or reviewer id for independent delivery audit evidence.
  --delivery-audit-status <status> Delivery audit recommendation. Must be cleanup-ready.
  --delivery-audit-summary <text> Metadata-only delivery audit summary for the exact PR head.
  --take-ownership          Reassign a lane and linked assignment to the current owner before cleanup.
  --takeover-reason <text>  Required with --take-ownership when another owner is recorded.

cleanup-integrated options:
  --apply                   Apply cleanup. Without this, cleanup is dry-run.
  --base <ref>              Ref to compare against. Defaults to origin/dev.
  --allow-closed-pr-integrated
                            Allow one explicitly approved non-open PR manifest only when its current branch is integrated into --base.
  --approval <text>         Required with --allow-closed-pr-integrated; recorded as closeout evidence.
  --summary-json            Without --apply, print a compact JSON cleanup summary.

cleanup-superseded options:
  --source-head <sha>       Exact current head of the no-PR source branch.
  --carry-forward-pr <id>   Merged PR that carries the named source scope.
  --carry-forward-commit <sha> Exact integrated commit recorded by that merged PR.
  --scope <paths>           Comma-separated repository-relative paths to prove by tree entry.
  --first-use-repair         Enable the restricted legacy first-use repair contract.
  --canonical-base <branch> Canonical base branch; first-use repair requires dev.
  --supersession-provenance <text> Explicit migration/supersession provenance (metadata only).
  --source-remote <state>   Source remote state: present (normal) or absent (first-use repair only).
  --legacy-unassigned       Permit only a manifest with no source assignment in first-use repair.

  --successor-hardening-commits <shas> Comma-separated commits in the named PR lineage.
  --successor-hardening-scope <paths> Exact scoped paths changed by those successor commits.
  --successor-hardening-evidence <text> Explicit bounded hardening rationale (metadata only).
  --closed-source-pr <id> Closed-unmerged source PR allowed only with exact patch-equivalent commit lists.
  --source-patch-commits <shas> Exact non-merge source commits in closed source PR order.
  --carry-forward-patch-commits <shas> Exact equivalent commits in the named merged successor PR order.
  --apply                   Apply local-only cleanup after a fresh locked re-proof.
  --approval <text>         Required with --apply; records operator approval evidence.
  --reason <text>           Required with --apply; records the reviewed cleanup reason.
  --summary-json            Without --apply, print a compact metadata-only proof packet.

close-missing-worktree options:
  --apply                   Record verified metadata-only closeout. Without this, preview only.
  --summary-json            Without --apply, print a compact JSON recovery packet.
  --approval <text>         Required with --apply; at least 10 non-whitespace characters.
  --stale-after-seconds <n> Owner-heartbeat age required for stale-owner proof. Defaults to 86400.

cleanup-branches options:
  --apply                   Apply cleanup. Without this, cleanup is dry-run.
  --summary-json            Without --apply, print a bounded JSON branch cleanup summary.
  --base <ref>              Ref to compare against. Defaults to origin/main.
                            Missing base refs fail closed; no fetch is performed.

cleanup-orphans options:
  --apply                   Apply cleanup. Without this, cleanup is dry-run.
  --all                     Include every orphan directory without a query.
  --summary-json            Without --apply, print a bounded JSON orphan cleanup summary.

repair-manifests options:
  --apply                   Apply closed-manifest repairs. Without this, repair is dry-run.
  --summary-json            Without --apply, print a bounded JSON repair summary.

rebuild-index options:
  --dry-run                 Preview manifest rebuilds without writing.
  --summary-json            Print a bounded JSON rebuild summary without writing.

doctor options:
  --summary-json            Print a bounded JSON readiness summary.
  --break-glass             Record a metadata-only Base Checkout break-glass recovery marker.
  --resolve-break-glass     Resolve the active recovery marker; requires --resolution.
  --resolution <text>       Bounded operator resolution evidence for --resolve-break-glass.
`);
}

function parseOptions(argv) {
  const positional = [];
  const options = {};
  const occurrences = new Map();

  const record = (key, value) => {
    const values = occurrences.get(key) || [];
    values.push(value);
    occurrences.set(key, values);
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }

    const [rawKey, ...inlineParts] = arg.slice(2).split("=");
    const inlineValue = inlineParts.length > 0 ? inlineParts.join("=") : undefined;
    const key = rawKey.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    if (inlineValue !== undefined) {
      record(key, inlineValue);
      options[key] = key === "dirtyPaths" ? [...(options[key] || []), inlineValue] : inlineValue;
      continue;
    }

    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      record(key, true);
      options[key] = true;
      continue;
    }

    record(key, next);
    options[key] = key === "dirtyPaths" ? [...(options[key] || []), next] : next;
    index += 1;
  }

  Object.defineProperty(options, "__occurrences", { value: occurrences, enumerable: false });
  return { positional, options };
}

function assertBareApplyOption(options, command) {
  const applyValues = options?.__occurrences?.get("apply") || (options.apply === undefined ? [] : [options.apply]);
  if (applyValues.some((value) => value !== true)) {
    throw new Error(`${command} requires a bare --apply flag without a value.`);
  }
}

function assertReviewThreadResolutionMutationOptions(options, command) {
  if (options.dryRun !== undefined || options.summaryJson !== undefined) {
    throw new Error(`${command} does not accept --dry-run or --summary-json because it mutates GitHub review-thread state.`);
  }
}

function startWorkspace(argv) {
  const { positional, options } = parseOptions(argv);
  const description = positional.join(" ").trim();
  if (!description) {
    throw new Error("start requires a task description.");
  }
  if (options.summaryJson && !options.dryRun) {
    throw new Error("start --summary-json is only supported with --dry-run.");
  }

  if (options.baseRef === true) {
    throw new Error("--base-ref requires a value.");
  }
  const usingDefaultBase = !options.base;
  const baseBranch = String(options.base || defaultBaseBranch);
  assertSafeBaseBranch(baseBranch);
  const explicitBaseRef = options.baseRef === undefined ? null : String(options.baseRef);
  if (explicitBaseRef !== null) {
    assertSafeExplicitBasePair(baseBranch, explicitBaseRef);
    assertExplicitBaseRefAvailable(explicitBaseRef);
  }
  const mode = String(options.mode || "pr");
  if (!["pr", "experiment", "epic-batch"].includes(mode)) {
    throw new Error("--mode must be either pr, experiment, or epic-batch.");
  }
  const epicBatch = mode === "epic-batch"
    ? buildEpicBatchManifest({
        epicId: options.epicId,
        decisionRef: options.decisionRef,
        expectedSlices: String(options.expectedSlices || "").split(","),
        allowedPaths: String(options.allowedPaths || "").split(","),
        limits: {
          sliceLimit: options.sliceLimit || EPIC_BATCH_DEFAULT_LIMITS.sliceLimit,
          ageBusinessDays: options.ageBusinessDays || EPIC_BATCH_DEFAULT_LIMITS.ageBusinessDays,
          fileLimit: options.fileLimit || EPIC_BATCH_DEFAULT_LIMITS.fileLimit,
          lineLimit: options.lineLimit || EPIC_BATCH_DEFAULT_LIMITS.lineLimit,
        },
      })
    : null;
  if (epicBatch) {
    for (const [name, value] of [["--epic-id", options.epicId], ["--decision-ref", options.decisionRef], ["--expected-slices", options.expectedSlices], ["--allowed-paths", options.allowedPaths]]) {
      if (value === true || value === undefined || !String(value).trim()) throw new Error(`${name} requires a value with epic-batch mode`);
    }
    const admission = evaluateEpicBatchAdmission({ epicBatch });
    if (admission.status !== "admitted") throw new Error(`epic-batch admission blocked: ${admission.blockers.join("; ")}`);
  }
  const slug = slugify(description);
  const taskId = String(options.taskId || `${dateStamp()}-${slug}`);
  assertSafeTaskId(taskId);
  const branch = String(options.branch || `codex/${slug}`);
  assertSafeBranch(branch);

  const state = workspaceState(options);
  const owner = currentLaneOwner(options);
  const worktreePath = resolve(String(options.worktree || join(state.worktreesDir, taskId)));
  const manifestPath = join(state.tasksDir, `${taskId}.json`);
  const shouldFetch = !options.noFetch;
  if (!options.dryRun && shouldFetch) {
    fetchBaseBranch(baseBranch, { usingDefaultBase });
  }
  const baseRef = explicitBaseRef || resolveBaseRef(baseBranch, { usingDefaultBase });

  if (existsSync(manifestPath)) {
    throw new Error(`Task manifest already exists: ${manifestPath}`);
  }
  if (existsSync(worktreePath)) {
    throw new Error(`Worktree path already exists: ${worktreePath}`);
  }
  if (branchExists(branch)) {
    throw new Error(`Branch already exists: ${branch}`);
  }
  if (remoteBranchExists(branch)) {
    throw new Error(`Remote branch already exists: origin/${branch}`);
  }

  const manifest = {
    schema_version: 1,
    task_id: taskId,
    title: titleFromDescription(description),
    description,
    repo_name: workspaceKey(),
    repo_root: repoRoot,
    state_root: state.root,
    base_branch: baseBranch,
    base_ref: baseRef,
    branch,
    worktree_path: worktreePath,
    status: "active",
    owner,
    owner_thread_id: process.env.CODEX_THREAD_ID || null,
    owner_acquired_at: new Date().toISOString(),
    owner_updated_at: new Date().toISOString(),
    mode,
    epic_batch: epicBatch,
    pr_url: null,
    pr_number: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    last_verified_at: null,
    last_verification_command: null,
    last_commit: null,
    events: [taskEvent("created", "workspace manifest created")],
  };

  if (options.dryRun) {
    const plan = [
      shouldFetch ? `git fetch origin ${baseBranch}` : "skip fetch",
      `mkdir ${state.tasksDir}`,
      `mkdir ${state.worktreesDir}`,
      `git worktree add -b ${branch} ${worktreePath} ${baseRef}`,
      `write ${manifestPath}`,
    ];
    if (options.summaryJson) {
      console.log(JSON.stringify(buildStartDryRunSummary({ state, manifest, manifestPath, plan, shouldFetch }), null, 2));
      return;
    }
    printPlan("start", [
      ...plan,
    ]);
    printManifestSummary(manifest);
    return;
  }

  mkdirSync(state.tasksDir, { recursive: true });
  mkdirSync(state.worktreesDir, { recursive: true });
  withManifestLock(state, taskId, () => {
    runChecked("git", ["worktree", "add", "-b", branch, worktreePath, baseRef], { cwd: repoRoot });
    writeManifest(manifestPath, manifest);
  });

  console.log(`Created Codex workspace ${taskId}`);
  printManifestSummary(manifest);
}

function buildStartDryRunSummary({ state, manifest, manifestPath, plan, shouldFetch }) {
  return {
    generatedAt: new Date().toISOString(),
    stateRoot: state.root,
    taskId: manifest.task_id,
    title: manifest.title,
    description: manifest.description,
    mode: manifest.mode,
    epicBatch: manifest.epic_batch || null,
    owner: manifest.owner || null,
    branch: manifest.branch,
    baseBranch: manifest.base_branch || null,
    baseRef: manifest.base_ref || null,
    worktreePath: manifest.worktree_path,
    manifestPath,
    shouldFetch,
    plan,
    plannedWrites: {
      manifest: manifestPath,
      worktree: manifest.worktree_path,
      branch: manifest.branch,
    },
    mutation: "none; dry-run summary only",
  };
}

function listWorkspaces(argv) {
  const { options } = parseOptions(argv);
  const state = workspaceState(options);
  const ownerFilter = options.owned ? currentLaneOwner(options) : options.owner ? String(options.owner) : "";
  const manifests = readManifests(state).filter(({ manifest }) => {
    if (options.active && manifest.status === "closed") {
      return false;
    }
    if (ownerFilter && manifest.owner !== ownerFilter) {
      return false;
    }
    return true;
  });
  const listRows = manifests.map(({ manifest, path }) => ({
    taskId: manifest.task_id,
    status: manifest.status,
    branch: manifest.branch,
    baseBranch: manifest.base_branch || null,
    prUrl: manifest.pr_url || null,
    prNumber: manifest.pr_number || prNumberFromUrl(manifest.pr_url || "") || null,
    owner: manifest.owner || null,
    worktreePath: manifest.worktree_path,
    worktreeExists: existsSync(manifest.worktree_path),
    manifestPath: path,
    updatedAt: manifest.updated_at || null,
    cleanup: {
      startedAt: manifest.cleanup_started_at || null,
      completedAt: manifest.cleanup_completed_at || null,
      expectedHeadSha: manifest.cleanup_expected_head_sha || null,
      error: manifest.cleanup_error || null,
    },
  }));

  if (options.summaryJson) {
    console.log(JSON.stringify(buildListSummary({ state, listRows, filters: { active: Boolean(options.active), owner: ownerFilter || null } }), null, 2));
    return;
  }

  if (options.json) {
    console.log(JSON.stringify(listRows, null, 2));
    return;
  }

  if (manifests.length === 0) {
    console.log(`No Codex workspaces found or matched under ${state.tasksDir}`);
    return;
  }

  for (const { manifest } of manifests) {
    console.log(
      [
        manifest.task_id,
        manifest.status,
        manifest.branch,
        manifest.pr_url || "no-pr",
        `owner=${manifest.owner || "unowned"}`,
        manifest.worktree_path,
      ].join(" | "),
    );
  }
}

function buildListSummary({ state, listRows, filters }) {
  const statusCounts = countByField(listRows, "status");
  const ownerCounts = countByField(listRows.map((row) => ({ ...row, owner: row.owner || "unowned" })), "owner");
  const worktreeCounts = {
    present: listRows.filter((row) => row.worktreeExists).length,
    missing: listRows.filter((row) => !row.worktreeExists).length,
  };
  const prCounts = {
    withPr: listRows.filter((row) => row.prNumber || row.prUrl).length,
    withoutPr: listRows.filter((row) => !row.prNumber && !row.prUrl).length,
  };

  return {
    generatedAt: new Date().toISOString(),
    stateRoot: state.root,
    tasksDir: state.tasksDir,
    filters,
    counts: {
      total: listRows.length,
      statuses: statusCounts,
      owners: ownerCounts,
      worktrees: worktreeCounts,
      prs: prCounts,
    },
    rows: listRows.slice(0, 10),
    rowsTruncated: listRows.length > 10,
    mutation: "none; summary only",
  };
}

function coordinationReport(argv) {
  const { options } = parseOptions(argv);
  const packet = buildCoordinationReportPacket(options);
  if (options.summaryJson) {
    console.log(JSON.stringify(buildCoordinationReportSummary(packet), null, 2));
    return;
  }
  if (options.json) {
    console.log(JSON.stringify(packet, null, 2));
    return;
  }
  printCoordinationReport(packet);
}

function buildCoordinationReportSummary(packet) {
  return {
    generatedAt: packet.generatedAt,
    stateRoot: packet.stateRoot,
    currentOwner: packet.currentOwner,
    staleAfterSeconds: packet.staleAfterSeconds,
    currentCheckout: packet.currentCheckout,
    rootStatus: packet.rootStatus,
    counts: {
      activeManagedWorktrees: packet.activeManagedWorktrees.length,
      prsWaitingAtMergeGate: packet.prsWaitingAtMergeGate.length,
      prStateReconciliation: packet.prStateReconciliation.length,
      cleanActiveLanes: packet.cleanActiveLanes.length,
      dirtyActiveLanes: packet.dirtyActiveLanes.length,
      localOnlyCommits: packet.localOnlyCommits.length,
      closedButRetainedLanes: packet.closedButRetainedLanes.length,
      cleanupCandidates: packet.cleanupCandidates.length,
      blockedApprovalPackets: packet.blockedApprovalPackets.length,
      backlogSummary: packet.backlogSummary.length,
      backlogClassificationSummary: packet.backlogClassificationSummary.length,
    },
    blockedApprovalPacketStatusCounts: countByField(packet.blockedApprovalPackets, "status"),
    backlogStatusCounts: countByField(packet.backlogSummary, "status"),
    backlogClassificationStatusCounts: countByField(packet.backlogClassificationSummary, "status"),
    activeManagedWorktrees: packet.activeManagedWorktrees.map(summaryLane),
    workspaceCloseoutReadiness: summarizeWorkspaceCloseoutReadiness(packet.workspaceCloseoutReadiness),
    prsWaitingAtMergeGate: packet.prsWaitingAtMergeGate.map(summaryLane),
    prStateReconciliation: packet.prStateReconciliation.slice(0, 10).map(summaryLane),
    prStateReconciliationTruncated: packet.prStateReconciliation.length > 10,
    dirtyActiveLanes: packet.dirtyActiveLanes.map(summaryLane),
    localOnlyCommits: packet.localOnlyCommits.map((lane) => ({
      taskId: lane.taskId,
      branch: lane.branch,
      localOnlyCommits: lane.localOnlyCommits,
    })),
    cleanupCandidates: packet.cleanupCandidates.map(summaryLane),
    blockedApprovalPackets: packet.blockedApprovalPackets.slice(0, 10),
    blockedApprovalPacketsTruncated: packet.blockedApprovalPackets.length > 10,
    backlogSummary: packet.backlogSummary.slice(0, 10),
    backlogSummaryTruncated: packet.backlogSummary.length > 10,
    backlogClassificationSummary: packet.backlogClassificationSummary.slice(0, 10),
    backlogClassificationSummaryTruncated: packet.backlogClassificationSummary.length > 10,
    nextSafeSlice: packet.nextSafeSlice,
    stopLines: packet.stopLines,
  };
}

function countByField(rows, field) {
  return rows.reduce((counts, row) => {
    const key = String(row[field] || "unknown");
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function reasonCodeForClassification(classification = {}) {
  const status = String(classification.status || "unknown").trim() || "unknown";
  const reason = String(classification.reason || "").trim();

  if (reason === "workspace manifest is closed") return "workspace_manifest_closed";
  if (reason === "manifest is authority-blocked") return "manifest_authority_blocked";
  if (reason === "worktree path is missing") return "worktree_path_missing";
  if (reason.startsWith("owner heartbeat older than ")) return "owner_heartbeat_stale";
  if (reason === "owned by current runner") return "active_current_owner";
  if (reason.startsWith("owned by ")) return "owned_by_other_runner";
  if (reason === "PR is merged but cleanup is not closed") return "pr_merged_cleanup_pending";
  if (reason === "cleanup is partial" || status === "cleanup") return "cleanup_partial";
  if (reason === "PR is open") return "pr_open_delivery";
  if (reason === "active workspace has no owner") return "active_workspace_unowned";
  if (reason === "safe backlog item is already complete and must not be requeued") return "safe_backlog_complete";
  if (reason === "safe backlog item is not dispatchable from generic continuation") return "safe_backlog_not_dispatchable";
  if (reason === "ready item has no source-owned lane start command") return "safe_backlog_missing_start_command";
  if (reason === "ready item has no source-owned lane start command and branch") return "safe_backlog_missing_start_metadata";
  if (reason === "ready item has no source-owned lane branch") return "safe_backlog_missing_branch";
  if (reason.startsWith("closed workspace evidence exists for ")) return "closed_workspace_evidence";
  if (reason.startsWith("closed assignment evidence exists for ")) return "closed_assignment_evidence";
  if (reason === "lane assignment already exists for branch") return "lane_assignment_exists";
  if (reason === "multiple active assignment records exist for branch") return "duplicate_assignment_records";
  if (reason.startsWith("multiple active lane assignments exist for ")) return "duplicate_lane_assignments";
  if (reason === "workspace manifest already exists for branch") return "workspace_manifest_exists";
  if (reason === "only closed workspace manifests exist for branch") return "closed_workspace_only";
  if (reason === "ready safe backlog item has no active workspace conflict") return "ready_no_workspace_conflict";
  if (reason === "assignment is closed") return "assignment_closed";
  if (reason === "assignment is authority-blocked") return "assignment_authority_blocked";
  if (reason === "assignment has no owner") return "assignment_missing_owner";
  if (reason.startsWith("assignment heartbeat older than ")) return "assignment_heartbeat_stale";
  if (reason.startsWith("assigned to ")) return "assignment_owned_by_other_runner";
  if (reason === "assignment is owned by current runner") return "assignment_current_owner";
  if (reason.startsWith("multiple active workspace manifests exist for ")) return "duplicate_workspace_manifests";
  if (reason === "ready safe backlog lane has an unowned active workspace") return "ready_unowned_active_workspace";
  if (reason === "ready safe backlog lane is already claimed by current runner") return "ready_claimed_by_current_runner";
  if (reason === "ready safe backlog lane has no workspace conflict") return "ready_no_workspace_conflict";
  if (reason.startsWith("current runner already has active lane evidence: ")) return "current_runner_active_lane_exists";
  if (reason.startsWith("Refusing to operate on protected branch: ")) return "protected_branch_blocked";
  if (reason.startsWith("branch ") || reason.startsWith("local branch ") || reason.startsWith("remote branch ")) {
    return "branch_availability_blocked";
  }

  return `${status.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase() || "unknown"}_unclassified`;
}

function summaryLane(lane) {
  return {
    taskId: lane.taskId,
    status: lane.status,
    assignmentStatus: lane.assignmentStatus,
    recommendation: lane.recommendation || null,
    reasonCode: lane.reasonCode || null,
    branch: lane.branch,
    owner: lane.owner,
    ownerUpdatedAt: lane.ownerUpdatedAt || null,
    lastHeartbeatAt: lane.lastHeartbeatAt || null,
    worktreeExists: lane.worktreeExists,
    dirty: lane.dirty,
    dirtyPathCount: lane.dirtyPathCount || 0,
    localOnlyCommits: lane.localOnlyCommits,
    prNumber: lane.prNumber,
    prState: lane.prState,
    prStateReason: lane.prStateReason,
    prStateNextAction: lane.prStateNextAction,
    nextAction: lane.nextAction,
  };
}

function buildCoordinationReportPacket(options = {}) {
  const state = workspaceState(options);
  const currentOwner = currentLaneOwner(options);
  const staleAfterSeconds = positiveInteger(options.staleAfterSeconds, 86_400);
  const generatedAt = new Date();
  const manifests = readManifests(state).map(({ manifest }) => manifest);
  const assignments = readAssignments(state).map(({ assignment }) => assignment);
  const activeManifests = manifests.filter((manifest) => manifest.status !== "closed");
  const context = { currentOwner, generatedAt, staleAfterSeconds };
  const rootStatus = parseStatus(repoRoot);
  const checkout = currentCheckoutPacket(repoRoot);
  const activeLanes = activeManifests.map((manifest) => coordinationLanePacket(manifest, context));
  const cleanActiveLanes = activeLanes.filter((lane) => lane.worktreeExists && !lane.dirty);
  const dirtyActiveLanes = activeLanes.filter((lane) => lane.dirty);
  const localOnlyCommits = activeLanes.filter((lane) => lane.localOnlyCommits > 0);
  const prWaitingAtMergeGate = activeLanes.filter((lane) => lane.status === "pr_open");
  const prStateReconciliation = prWaitingAtMergeGate.filter((lane) => lane.prState === "merged_evidence_present");
  const cleanupCandidates = activeLanes.filter((lane) => lane.assignmentStatus === "cleanup" && !lane.dirty);
  const workspaceCloseoutReadiness = buildWorkspaceCloseoutReadiness(activeLanes, context);
  const blockedApprovalPackets = [
    ...activeLanes.filter((lane) => String(lane.assignmentStatus).startsWith("blocked")),
    ...assignments
      .map((assignment) => {
        const classification = classifyLaneAssignment(assignment, context);
        return {
          id: assignment.assignment_id,
          branch: assignment.branch || null,
          status: classification.status,
          reason: classification.reason,
          nextAction: classification.nextAction,
        };
      })
      .filter((assignment) => String(assignment.status).startsWith("blocked")),
  ];

  const manifestBranchStates = workspaceBranchStates(manifests);
  const assignmentBranchStates = assignmentBranchStatesByBranch(assignments);
  const backlogItems = readSafeBacklogItems({ stateRootPath: state.root });
  const claimEvaluations = backlogItems.map((item) =>
    evaluateClaimCandidate(item, manifests, assignments, {
      currentOwner,
      generatedAt,
      staleAfterSeconds,
    }),
  );
  const selected = claimEvaluations.find((evaluation) => evaluation.claimable) || null;
  const closedRetainedLanes = manifests
    .filter((manifest) => manifest.status === "closed")
    .map((manifest) => ({
      taskId: manifest.task_id,
      branch: manifest.branch,
      prNumber: manifest.pr_number || prNumberFromUrl(manifest.pr_url || "") || null,
      worktreePath: manifest.worktree_path,
      worktreeExists: Boolean(manifest.worktree_path && existsSync(manifest.worktree_path)),
    }));

  return {
    generatedAt: generatedAt.toISOString(),
    stateRoot: state.root,
    currentOwner,
    staleAfterSeconds,
    currentCheckout: checkout,
    rootStatus: {
      dirty: rootStatus.any,
      staged: rootStatus.staged,
      unstaged: rootStatus.unstaged,
      pathCount: rootStatus.lines.length,
    },
    activeManagedWorktrees: activeLanes,
    workspaceCloseoutReadiness,
    prsWaitingAtMergeGate: prWaitingAtMergeGate,
    prStateReconciliation,
    cleanActiveLanes,
    dirtyActiveLanes,
    localOnlyCommits,
    closedButRetainedLanes: closedRetainedLanes,
    cleanupCandidates,
    blockedApprovalPackets,
    nextSafeSlice: selected
      ? {
          status: "claimable",
          itemId: selected.item.itemId,
          branch: selected.item.branchName || null,
          action: selected.action,
          nextAction: selected.nextAction,
        }
      : {
          status: "none",
          itemId: null,
          branch: null,
          action: "no claimable safe backlog lane found",
          nextAction: "choose the next ready safe backlog lane or wait for explicit authority approval",
        },
    backlogSummary: claimEvaluations.map((evaluation) => ({
      itemId: evaluation.item.itemId,
      sourceStatus: evaluation.item.status || "unknown",
      status: evaluation.status,
      branch: evaluation.item.branchName || null,
      reason: evaluation.reason,
      nextAction: evaluation.nextAction,
    })),
    backlogClassificationSummary: backlogItems.map((item) => {
      const classification = classifyBacklogItem(item, manifestBranchStates, assignmentBranchStates, manifests, assignments);
      return {
        itemId: item.itemId,
        sourceStatus: item.status || "unknown",
        status: classification.status,
        branch: item.branchName || null,
        reason: classification.reason,
      };
    }),
    stopLines: coordinationReportStopLines(),
  };
}

function printCoordinationReport(packet) {
  console.log("Workspace Coordination Report");
  console.log(`- Current checkout: ${packet.currentCheckout.branch || "unknown"} at ${packet.currentCheckout.shortHead || "unknown"} (${packet.currentCheckout.path})`);
  console.log(`- Root status: ${packet.rootStatus.dirty ? `dirty (${packet.rootStatus.pathCount} path(s))` : "clean"}`);
  printCoordinationRows("- Active managed worktrees:", packet.activeManagedWorktrees, formatCoordinationLane);
  printWorkspaceCloseoutReadiness(packet.workspaceCloseoutReadiness);
  printCoordinationRows("- PRs waiting at merge gate:", packet.prsWaitingAtMergeGate, formatCoordinationLane);
  printCoordinationRows(
    "- PR state reconciliation:",
    packet.prStateReconciliation,
    (lane) => `${lane.taskId} | ${lane.status} | pr=${lane.prNumber || "unknown"} | ${lane.prStateReason} | next=${lane.prStateNextAction}`,
  );
  printCoordinationRows("- Clean active lanes:", packet.cleanActiveLanes, formatCoordinationLane);
  printCoordinationRows("- Dirty active lanes:", packet.dirtyActiveLanes, formatCoordinationLane);
  printCoordinationRows("- Local-only commits:", packet.localOnlyCommits, (lane) => `${lane.taskId} | ${lane.branch} | ahead=${lane.localOnlyCommits}`);
  printCoordinationRows("- Closed but retained lanes:", packet.closedButRetainedLanes, (lane) => `${lane.taskId} | ${lane.branch} | worktreeExists=${lane.worktreeExists}`);
  printCoordinationRows("- Cleanup candidates:", packet.cleanupCandidates, formatCoordinationLane);
  printCoordinationRows("- Blocked approval packets:", packet.blockedApprovalPackets, (entry) => `${entry.id || entry.taskId} | ${entry.status} | ${entry.reason} | next=${entry.nextAction}`);
  console.log(`- Next safe slice: ${packet.nextSafeSlice.status} | ${packet.nextSafeSlice.action} | next=${packet.nextSafeSlice.nextAction}`);
  printCoordinationRows("- Stop lines:", packet.stopLines, (line) => line);
}

function printCoordinationRows(label, rows, formatter) {
  console.log(label);
  if (!rows.length) {
    console.log("  - none");
    return;
  }
  for (const row of rows) {
    console.log(`  - ${formatter(row)}`);
  }
}

function formatCoordinationLane(lane) {
  return `${lane.taskId} | ${lane.status} | ${lane.branch} | ${lane.cleanState} | assignment=${lane.assignmentStatus} | next=${lane.nextAction}`;
}

function printWorkspaceCloseoutReadiness(readiness) {
  console.log("- Workspace stale-lane closeout readiness:");
  for (const [label, rows] of [
    ["currently owned active work", readiness.currentlyOwnedActiveWork],
    ["stale manager-owned lanes", readiness.staleManagerOwnedLanes],
    ["dirty preserve-first lanes", readiness.dirtyPreserveFirstLanes],
    ["clean closeout candidates", readiness.cleanCloseoutCandidates],
    ["needs operator decision", readiness.needsOperatorDecision],
  ]) {
    printCoordinationRows(`  - ${label}:`, rows, formatWorkspaceCloseoutReadinessLane);
  }
}

function formatWorkspaceCloseoutReadinessLane(lane) {
  return `${lane.taskId} | ${lane.branch} | owner=${lane.owner || "unowned"} | status=${lane.manifestStatus} | clean=${lane.cleanState} | pr=${lane.prState} | reason_code=${lane.reasonCode} | next=${lane.nextAction}`;
}

function coordinationLanePacket(manifest, context) {
  const classification = classifyWorkspaceAssignment(manifest, context);
  const worktreeExists = Boolean(manifest.worktree_path && existsSync(manifest.worktree_path));
  const status = worktreeExists ? parseStatus(manifest.worktree_path) : { any: false, staged: false, unstaged: false, lines: [] };
  const localOnlyCommits = worktreeExists ? commitsAheadOfBase(manifest) : 0;
  return {
    taskId: manifest.task_id,
    title: manifest.title || manifest.description || manifest.task_id,
    status: manifest.status,
    assignmentStatus: classification.status,
    reason: classification.reason,
    nextAction: classification.nextAction,
    reasonCode: reasonCodeForClassification(classification),
    branch: manifest.branch,
    owner: manifest.owner || null,
    ownerUpdatedAt: manifest.owner_updated_at || manifest.updated_at || manifest.created_at || null,
    lastHeartbeatAt: manifest.last_heartbeat_at || manifest.owner_updated_at || manifest.updated_at || null,
    worktreePath: manifest.worktree_path,
    worktreeExists,
    dirty: status.any,
    dirtyPathCount: status.lines.length,
    cleanState: status.any ? `dirty:${status.lines.length}` : "clean",
    staged: status.staged,
    unstaged: status.unstaged,
    localOnlyCommits,
    prUrl: manifest.pr_url || null,
    prNumber: manifest.pr_number || prNumberFromUrl(manifest.pr_url || "") || null,
    prState: coordinationPrState(manifest),
    prStateReason: coordinationPrStateReason(manifest),
    prStateNextAction: coordinationPrStateNextAction(manifest),
  };
}

function buildWorkspaceCloseoutReadiness(activeLanes, context) {
  const buckets = {
    schemaVersion: "workspace-closeout-readiness/v0",
    metadataOnly: true,
    bucketPriority: [
      "dirtyPreserveFirstLanes",
      "cleanCloseoutCandidates",
      "currentlyOwnedActiveWork",
      "staleManagerOwnedLanes",
      "needsOperatorDecision",
    ],
    generatedAt: context.generatedAt.toISOString(),
    staleAfterSeconds: context.staleAfterSeconds,
    counts: {
      currentlyOwnedActiveWork: 0,
      staleManagerOwnedLanes: 0,
      dirtyPreserveFirstLanes: 0,
      cleanCloseoutCandidates: 0,
      needsOperatorDecision: 0,
    },
    reasonCodeCounts: {},
    currentlyOwnedActiveWork: [],
    staleManagerOwnedLanes: [],
    dirtyPreserveFirstLanes: [],
    cleanCloseoutCandidates: [],
    needsOperatorDecision: [],
  };

  for (const lane of activeLanes) {
    const classification = classifyWorkspaceCloseoutReadinessLane(lane, context);
    const row = {
      taskId: lane.taskId,
      branch: lane.branch || null,
      owner: lane.owner || null,
      manifestStatus: lane.status || "unknown",
      assignmentStatus: lane.assignmentStatus || "unknown",
      ownerUpdatedAt: lane.ownerUpdatedAt || null,
      lastHeartbeatAt: lane.lastHeartbeatAt || null,
      worktreeExists: lane.worktreeExists,
      dirty: lane.dirty,
      dirtyPathCount: lane.dirtyPathCount || 0,
      cleanState: lane.cleanState,
      localOnlyCommits: lane.localOnlyCommits || 0,
      prNumber: lane.prNumber || null,
      prState: lane.prState || "not_applicable",
      prStateReason: lane.prStateReason || null,
      recommendation: classification.recommendation,
      reasonCode: classification.reasonCode,
      reason: classification.reason,
      nextAction: classification.nextAction,
    };
    buckets[classification.bucket].push(row);
    buckets.counts[classification.bucket] += 1;
    buckets.reasonCodeCounts[row.reasonCode] = (buckets.reasonCodeCounts[row.reasonCode] || 0) + 1;
  }

  return buckets;
}

function classifyWorkspaceCloseoutReadinessLane(lane, context) {
  if (lane.dirty) {
    return {
      bucket: "dirtyPreserveFirstLanes",
      recommendation: "preserve_first",
      reasonCode: "dirty_preserve_first",
      reason: "worktree has uncommitted paths; preserve or inspect before any closeout decision",
      nextAction: "preserve dirty work and ask the owner or operator before closeout",
    };
  }

  if (!lane.worktreeExists) {
    return {
      bucket: "needsOperatorDecision",
      recommendation: "operator_decision_required",
      reasonCode: lane.reasonCode || "worktree_path_missing",
      reason: lane.reason || "worktree path is missing",
      nextAction: lane.nextAction || "run workspace doctor or rebuild-index before closeout decisions",
    };
  }

  if (lane.assignmentStatus === "cleanup" || lane.prState === "merged_evidence_present") {
    return {
      bucket: "cleanCloseoutCandidates",
      recommendation: "closeout_readiness_check",
      reasonCode: lane.prState === "merged_evidence_present" ? "clean_pr_merged_evidence_present" : "clean_cleanup_status",
      reason: "lane is clean and has merged or cleanup evidence",
      nextAction: "run the matching cleanup dry-run and prove branch/worktree evidence before mutation",
    };
  }

  if (lane.owner === context.currentOwner && ["active", "delivery"].includes(lane.assignmentStatus)) {
    return {
      bucket: "currentlyOwnedActiveWork",
      recommendation: "continue_current_owner_work",
      reasonCode: "current_owner_active_work",
      reason: "lane is owned by the current runner and is clean",
      nextAction: "continue the lane or refresh heartbeat evidence",
    };
  }

  if (isManagerOwner(lane.owner) && lane.assignmentStatus === "blocked_stale_owner_needs_takeover") {
    return {
      bucket: "staleManagerOwnedLanes",
      recommendation: "operator_stale_manager_review",
      reasonCode: "stale_manager_owner",
      reason: `manager-owned lane heartbeat is older than ${context.staleAfterSeconds} seconds`,
      nextAction: "prepare takeover or closeout evidence; do not mutate without operator approval",
    };
  }

  return {
    bucket: "needsOperatorDecision",
    recommendation: "operator_decision_required",
    reasonCode: lane.reasonCode || "operator_decision_required",
    reason: lane.reason || "lane does not meet automatic closeout-readiness criteria",
    nextAction: lane.nextAction || "inspect lane metadata before action",
  };
}

function isManagerOwner(owner) {
  return /^manager(?:-|\/|$)/.test(String(owner || ""));
}

function summarizeWorkspaceCloseoutReadiness(readiness) {
  return {
    schemaVersion: readiness.schemaVersion,
    metadataOnly: readiness.metadataOnly,
    bucketPriority: readiness.bucketPriority,
    generatedAt: readiness.generatedAt,
    staleAfterSeconds: readiness.staleAfterSeconds,
    counts: readiness.counts,
    reasonCodeCounts: readiness.reasonCodeCounts,
    currentlyOwnedActiveWork: readiness.currentlyOwnedActiveWork.slice(0, 10),
    currentlyOwnedActiveWorkTruncated: readiness.currentlyOwnedActiveWork.length > 10,
    staleManagerOwnedLanes: readiness.staleManagerOwnedLanes.slice(0, 10),
    staleManagerOwnedLanesTruncated: readiness.staleManagerOwnedLanes.length > 10,
    dirtyPreserveFirstLanes: readiness.dirtyPreserveFirstLanes.slice(0, 10),
    dirtyPreserveFirstLanesTruncated: readiness.dirtyPreserveFirstLanes.length > 10,
    cleanCloseoutCandidates: readiness.cleanCloseoutCandidates.slice(0, 10),
    cleanCloseoutCandidatesTruncated: readiness.cleanCloseoutCandidates.length > 10,
    needsOperatorDecision: readiness.needsOperatorDecision.slice(0, 10),
    needsOperatorDecisionTruncated: readiness.needsOperatorDecision.length > 10,
  };
}

function coordinationPrState(manifest) {
  if (manifest.status === "pr_open" && (manifest.merged_at || manifest.pr_merged_at)) {
    return "merged_evidence_present";
  }
  if (manifest.status === "pr_open") {
    return "open_unverified";
  }
  return "not_applicable";
}

function coordinationPrStateReason(manifest) {
  if (coordinationPrState(manifest) === "merged_evidence_present") {
    return `manifest is pr_open but has merged evidence at ${manifest.merged_at || manifest.pr_merged_at}`;
  }
  if (coordinationPrState(manifest) === "open_unverified") {
    return "manifest says pr_open and has no local merged evidence";
  }
  return "manifest is not waiting at the merge gate";
}

function coordinationPrStateNextAction(manifest) {
  if (coordinationPrState(manifest) === "merged_evidence_present") {
    return "run cleanup-merged or inspect before treating as active blocked work";
  }
  if (coordinationPrState(manifest) === "open_unverified") {
    return "verify PR state before merge or cleanup action";
  }
  return "no PR state reconciliation needed";
}

function currentCheckoutPacket(cwd) {
  const branch = git(["branch", "--show-current"], { cwd }).stdout.trim();
  const head = git(["rev-parse", "HEAD"], { cwd }).stdout.trim();
  return {
    path: cwd,
    branch: branch || "detached",
    head: head || null,
    shortHead: head ? head.slice(0, 7) : null,
  };
}

function commitsAheadOfBase(manifest) {
  const baseRef = String(manifest.base_ref || manifest.base_branch || "").trim();
  if (!baseRef) {
    return 0;
  }
  const base = git(["rev-parse", "--verify", "--quiet", baseRef], { cwd: manifest.worktree_path });
  if (base.code !== 0 || !base.stdout.trim()) {
    return 0;
  }
  const ahead = git(["rev-list", "--count", `${baseRef}..HEAD`], { cwd: manifest.worktree_path });
  const count = Number.parseInt(ahead.stdout.trim(), 10);
  return ahead.code === 0 && Number.isFinite(count) ? count : 0;
}

function coordinationReportStopLines() {
  return [
    "Merge a PR.",
    "Delete a worktree.",
    "Delete a local or remote branch.",
    "Discard local commits.",
    "Rewrite a shared branch.",
    "Resolve a review thread that has not been addressed.",
    "Start work in a lane whose scope overlaps an active dirty lane.",
    "Create an empty PR for a verified no-source refresh lane.",
    "Mutate an active workspace branch owned by another runner.",
    "Repair an active or unreadable workspace manifest without explicit inspection.",
    "Delete a remote branch with no PR record, a SHA mismatch, an open PR, or an active workspace owner.",
  ];
}

function assignmentReport(argv) {
  const { options } = parseOptions(argv);
  const state = workspaceState(options);
  const currentOwner = currentLaneOwner(options);
  const staleAfterSeconds = positiveInteger(options.staleAfterSeconds, 86_400);
  const generatedAt = new Date();
  const manifests = readManifests(state).map(({ manifest }) => manifest);
  const assignments = readAssignments(state).map(({ assignment }) => assignment);
  const backlogItems = readSafeBacklogItems({ stateRootPath: state.root });
  const manifestBranchStates = workspaceBranchStates(manifests);
  const assignmentBranchStates = assignmentBranchStatesByBranch(assignments);
  const context = {
    currentOwner,
    generatedAt,
    staleAfterSeconds,
  };

  if (options.summaryJson) {
    console.log(
      JSON.stringify(
        buildAssignmentReportSummary({
          state,
          currentOwner,
          staleAfterSeconds,
          generatedAt,
          manifests,
          assignments,
          backlogItems,
          manifestBranchStates,
          assignmentBranchStates,
        }),
        null,
        2,
      ),
    );
    return;
  }

  console.log("Assignment Report");
  console.log(`Generated: ${generatedAt.toISOString()}`);
  console.log(`State root: ${state.root}`);
  console.log(`Current owner: ${currentOwner}`);
  console.log(`Stale after seconds: ${staleAfterSeconds}`);
  console.log("Safe backlog source: services/supervisor/src/supervisor/application/service.py#get_safe_development_backlog_report");
  console.log("");

  console.log("Safe backlog candidates:");
  if (backlogItems.length === 0) {
    console.log("- none found (safe backlog source unavailable or unparsable)");
  } else {
    for (const item of backlogItems) {
      const classification = classifyBacklogItem(item, manifestBranchStates, assignmentBranchStates, manifests, assignments);
      console.log(
        [
          `- ${item.itemId}`,
          classification.status,
          `source_status=${item.status || "unknown"}`,
          `slice=${item.recommendedSliceSize || "unknown"}`,
          `branch=${item.branchName || "none"}`,
          `reason_code=${reasonCodeForClassification(classification)}`,
          `reason=${classification.reason}`,
        ].join(" | "),
      );
    }
  }

  console.log("");
  console.log("Lane assignments:");
  if (assignments.length === 0) {
    console.log(`- none (no assignment metadata under ${state.assignmentsDir})`);
  } else {
    for (const assignment of assignments) {
      const classification = classifyLaneAssignment(assignment, {
        ...context,
      });
      console.log(
        [
          `- ${assignment.assignment_id}`,
          classification.status,
          `owner=${assignment.owner || "unowned"}`,
          `branch=${assignment.branch || "none"}`,
          `task=${assignment.task_id || "none"}`,
          `phase=${assignment.phase || "none"}`,
          `heartbeat=${assignment.last_heartbeat_at || "none"}`,
          `runner=${assignment.runner_kind || "none"}`,
          `reason_code=${reasonCodeForClassification(classification)}`,
          `reason=${classification.reason}`,
          `next=${classification.nextAction}`,
        ].join(" | "),
      );
    }
  }

  console.log("");
  console.log("Workspace assignments:");
  if (manifests.length === 0) {
    console.log(`- none (no workspace manifests under ${state.tasksDir})`);
    return;
  }

  for (const manifest of manifests) {
    const classification = classifyWorkspaceAssignment(manifest, {
      ...context,
    });
    console.log(
      [
        `- ${manifest.task_id}`,
        classification.status,
        `manifest_status=${manifest.status}`,
        `owner=${manifest.owner || "unowned"}`,
        `branch=${manifest.branch}`,
        `worktree=${manifest.worktree_path}`,
        `phase=${manifest.phase || "none"}`,
        `heartbeat=${manifest.last_heartbeat_at || "none"}`,
        `runner=${manifest.runner_kind || "none"}`,
        `reason_code=${reasonCodeForClassification(classification)}`,
        `reason=${classification.reason}`,
        `next=${classification.nextAction}`,
      ].join(" | "),
    );
  }
}

function buildAssignmentReportSummary({
  state,
  currentOwner,
  staleAfterSeconds,
  generatedAt,
  manifests,
  assignments,
  backlogItems,
  manifestBranchStates,
  assignmentBranchStates,
}) {
  const context = { currentOwner, generatedAt, staleAfterSeconds };
  const backlogCandidates = backlogItems.map((item) => {
    const classification = classifyBacklogItem(item, manifestBranchStates, assignmentBranchStates, manifests, assignments);
    return {
      itemId: item.itemId,
      sourceStatus: item.status || "unknown",
      status: classification.status,
      branch: item.branchName || null,
      reasonCode: reasonCodeForClassification(classification),
      reason: classification.reason,
    };
  });
  let laneAssignments = assignments.map((assignment) => {
    const classification = classifyLaneAssignment(assignment, context);
    return {
      assignmentId: assignment.assignment_id,
      taskId: assignment.task_id || null,
      status: classification.status,
      owner: assignment.owner || null,
      branch: assignment.branch || null,
      phase: assignment.phase || null,
      heartbeat: assignment.last_heartbeat_at || null,
      reasonCode: reasonCodeForClassification(classification),
      reason: classification.reason,
      nextAction: classification.nextAction,
    };
  });
  let workspaceAssignments = manifests.map((manifest) => {
    const classification = classifyWorkspaceAssignment(manifest, context);
    return {
      taskId: manifest.task_id,
      status: classification.status,
      manifestStatus: manifest.status,
      owner: manifest.owner || null,
      branch: manifest.branch || null,
      worktreePath: manifest.worktree_path || null,
      phase: manifest.phase || null,
      heartbeat: manifest.last_heartbeat_at || manifest.owner_updated_at || null,
      reasonCode: reasonCodeForClassification(classification),
      reason: classification.reason,
      nextAction: classification.nextAction,
    };
  });
  const assignmentInventory = buildAssignmentInventory({
    assignments,
    manifests,
    currentOwner,
    generatedAt,
    staleAfterSeconds,
    stateRoot: state.root,
  });
  // The inventory is the complete canonical classification. Keep the bounded
  // report samples and their status counts derived from it so a duplicated
  // legacy classifier cannot advertise stale targets absent from manager
  // inspection detail.
  laneAssignments = assignmentInventory.laneAssignments;
  workspaceAssignments = assignmentInventory.workspaceAssignments;

  return {
    generatedAt: generatedAt.toISOString(),
    stateRoot: state.root,
    currentOwner,
    staleAfterSeconds,
    safeBacklogSource: "services/supervisor/src/supervisor/application/service.py#get_safe_development_backlog_report",
    counts: {
      backlogCandidates: backlogCandidates.length,
      laneAssignments: laneAssignments.length,
      workspaceAssignments: workspaceAssignments.length,
    },
    backlogStatusCounts: countByField(backlogCandidates, "status"),
    laneAssignmentStatusCounts: countByField(laneAssignments, "status"),
    workspaceAssignmentStatusCounts: countByField(workspaceAssignments, "status"),
    backlogReasonCodeCounts: countByField(backlogCandidates, "reasonCode"),
    laneAssignmentReasonCodeCounts: countByField(laneAssignments, "reasonCode"),
    workspaceAssignmentReasonCodeCounts: countByField(workspaceAssignments, "reasonCode"),
    backlogCandidates: backlogCandidates.slice(0, 10),
    backlogCandidatesTruncated: backlogCandidates.length > 10,
    laneAssignments: laneAssignments.slice(0, 10),
    laneAssignmentsTruncated: laneAssignments.length > 10,
    workspaceAssignments: workspaceAssignments.slice(0, 10),
    workspaceAssignmentsTruncated: workspaceAssignments.length > 10,
    assignmentInventory,
    mutation: "none; summary only",
  };
}

function claimNext(argv) {
  const { options } = parseOptions(argv);
  if (options.apply && options.dryRun) {
    throw new Error("claim-next accepts either --dry-run or --apply, not both.");
  }
  if (!options.apply && !options.dryRun) {
    throw new Error("claim-next requires either --dry-run or --apply.");
  }
  if (options.summaryJson && !options.dryRun) {
    throw new Error("claim-next --summary-json is only supported with --dry-run.");
  }

  const state = workspaceState(options);
  const currentOwner = currentLaneOwner(options);
  const staleAfterSeconds = positiveInteger(options.staleAfterSeconds, 86_400);
  const generatedAt = new Date();
  const manifests = readManifests(state).map(({ manifest }) => manifest);
  const assignments = readAssignments(state).map(({ assignment }) => assignment);
  const backlogItems = readSafeBacklogItems({ stateRootPath: state.root });
  const evaluations = backlogItems.map((item) =>
    evaluateClaimCandidate(item, manifests, assignments, {
      currentOwner,
      generatedAt,
      staleAfterSeconds,
    }),
  );
  const { selected, evaluations: queueEvaluations } = applyCurrentOwnerSessionBounds({
    evaluations,
    manifests,
    assignments,
    currentOwner,
    generatedAt,
    staleAfterSeconds,
    mode: "claim-next",
  });

  const plan = [
    `current owner ${currentOwner}`,
    `state root ${state.root}`,
    selected
      ? `claim candidate ${selected.item.itemId} (${selected.action})`
      : "no claimable safe backlog lane found",
  ];
  if (selected?.item.branchName) {
    plan.push(`branch ${selected.item.branchName}`);
  }
  if (selected?.item.startCommand) {
    plan.push(`start command ${selected.item.startCommand}`);
  }
  if (options.dryRun) {
    const summary = buildClaimNextSummary({ state, currentOwner, staleAfterSeconds, selected, evaluations: queueEvaluations });
    if (options.summaryJson) {
      console.log(JSON.stringify(summary, null, 2));
      return;
    }
    plan.push(formatClaimNextActionSummary(summary.nextActionSummary));
    plan.push("preview only; no manifest, branch, PR, or worktree mutation");
    printPlan("claim-next", plan);
  } else {
    const stop = activeEmergencyStop(state);
    if (stop) {
      plan.push(`emergency stop ${stop.checkpoint_id || "unknown"} (${stop.mode || "unknown"}) is active`);
      printBlocked("claim-next", plan);
      throw new Error(emergencyStopBlocker(stop, "claim-next"));
    }
    if (!selected) {
      printBlocked("claim-next", plan);
      printClaimBlockers(queueEvaluations, selected);
      throw new Error("No claimable safe backlog lane found.");
    }
    const applied = applyClaimNext(selected, {
      state,
      options,
      currentOwner,
      staleAfterSeconds,
    });
    printApplied("claim-next", [
      ...plan,
      `wrote ${applied.path}`,
      applied.message,
      selected.mutation === "manifest_owner_claim"
        ? "workspace manifest owner metadata only; no branch, PR, worktree, worker, or implementation mutation"
        : "assignment metadata only; no branch, PR, worktree, worker, or implementation mutation",
    ]);
  }

  console.log("Queue evidence:");
  printClaimBlockers(queueEvaluations, selected);
}

function buildClaimNextSummary({ state, currentOwner, staleAfterSeconds, selected, evaluations }) {
  const blockers = evaluations.filter((evaluation) => claimEvaluationIsBlocker(evaluation));
  const excluded = evaluations.filter((evaluation) => claimEvaluationIsExcluded(evaluation));
  const sourceDrift = excluded.filter((evaluation) => claimEvaluationIsSourceDrift(evaluation));
  const stop = activeEmergencyStop(state);
  const blockedReasons = [
    ...claimNextBlockedReasons({ selected, blockers, sourceDrift }),
    ...(stop ? [emergencyStopBlocker(stop, "claim-next")] : []),
  ];
  return {
    currentOwner,
    stateRoot: state.root,
    staleAfterSeconds,
    selected: selected && !stop ? summarizeClaimEvaluation(selected) : null,
    assignmentPreview: buildAssignmentPreview({
      selected: stop ? null : selected,
      currentOwner,
      mode: "claim-next",
      blockedReasons,
      blockedRequiredEvidence: claimNextBlockedRequiredEvidence(),
    }),
    nextActionSummary: buildClaimNextActionSummary({ selected, blockers, excluded, sourceDrift, evaluations }),
    counts: {
      total: evaluations.length,
      claimable: evaluations.filter((evaluation) => evaluation.claimable).length,
      blocked: blockers.length,
      excluded: excluded.length,
      sourceDrift: sourceDrift.length,
    },
    statusCounts: countByField(evaluations, "status"),
    blockerStatusCounts: countByField(blockers, "status"),
    blockers: blockers.slice(0, 10).map(summarizeClaimEvaluation),
    blockersTruncated: blockers.length > 10,
    excludedStatusCounts: countByField(excluded, "status"),
    excluded: excluded.slice(0, 10).map(summarizeClaimEvaluation),
    excludedTruncated: excluded.length > 10,
    sourceDrift: sourceDrift.slice(0, 10).map(summarizeClaimEvaluation),
    sourceDriftTruncated: sourceDrift.length > 10,
    mutation: "none; dry-run summary only",
  };
}

function buildAssignmentPreview({ selected, currentOwner, mode, blockedReasons = [], blockedRequiredEvidence = [] }) {
  const targetLane = selected?.item?.itemId || null;
  const hasBlockers = blockedReasons.length > 0;
  return {
    proposedRunner: currentOwner,
    targetLane,
    targetBranch: selected?.item?.branchName || null,
    rationale: selected
      ? selected.reason
      : blockedReasons[0] || "no safe independent lane is available to claim",
    blockedReasons,
    requiredEvidence: selected && !hasBlockers
      ? [`safe backlog item ${targetLane}`, `${mode} dry-run summary-json`]
      : [`${mode} dry-run summary-json`, ...blockedRequiredEvidence],
    mutation: "none; preview only",
  };
}

function applyCurrentOwnerSessionBounds({ evaluations, manifests, assignments, currentOwner, generatedAt, staleAfterSeconds, mode }) {
  const selectedCandidate = selectClaimableEvaluation(evaluations);
  if (mode === "dispatch-next" && isManagerDispatcherOwner(currentOwner)) {
    return {
      selected: selectedCandidate,
      evaluations,
    };
  }
  const boundedSessionBlockers = currentOwnerActiveLaneEvidence({ manifests, assignments, currentOwner, generatedAt, staleAfterSeconds })
    .filter((evidence) => !currentOwnerEvidenceIsClosedSource(evidence, evaluations))
    .filter((evidence) => !selectedMatchesCurrentOwnerEvidence(selectedCandidate, evidence))
    .map((evidence) => currentOwnerActiveLaneEvaluation(evidence));
  return {
    selected: boundedSessionBlockers.length > 0 ? null : selectedCandidate,
    evaluations: [...boundedSessionBlockers, ...evaluations],
  };
}

function isManagerDispatcherOwner(owner) {
  return /^manager-[A-Za-z0-9._-]+\/dispatcher$/.test(String(owner || ""));
}

function currentOwnerActiveLaneEvidence({ manifests, assignments, currentOwner, generatedAt, staleAfterSeconds }) {
  const context = { currentOwner, generatedAt, staleAfterSeconds };
  const assignmentEvidence = assignments
    .filter((assignment) => assignment.owner === currentOwner && assignment.status !== "closed")
    .map((assignment) => ({
      kind: "assignment",
      id: assignment.assignment_id || assignment.task_id || assignment.lane_slug || "unknown-assignment",
      sourceBacklogItemId: assignment.source_backlog_item?.item_id || assignment.lane_slug || assignment.assignment_id || null,
      branch: assignment.branch || null,
      classification: classifyLaneAssignment(assignment, context).status,
    }));
  const workspaceEvidence = manifests
    .filter((manifest) => manifest.owner === currentOwner && manifest.status !== "closed")
    .map((manifest) => ({
      kind: "workspace",
      id: manifest.task_id || "unknown-workspace",
      sourceBacklogItemId: manifest.source_backlog_item?.item_id || manifest.task_id || null,
      branch: manifest.branch || null,
      classification: classifyWorkspaceAssignment(manifest, context).status,
    }));
  return [...assignmentEvidence, ...workspaceEvidence].filter((evidence) =>
    ["active", "claimed", "delivery", "cleanup"].includes(evidence.classification),
  );
}

function selectedMatchesCurrentOwnerEvidence(selected, evidence) {
  if (!selected) {
    return false;
  }
  if (evidence.kind === "assignment" && selected.targetAssignmentId && selected.targetAssignmentId === evidence.id) {
    return true;
  }
  if (evidence.kind === "workspace" && selected.targetTaskId && selected.targetTaskId === evidence.id) {
    return true;
  }
  return Boolean(selected.item?.branchName && evidence.branch && selected.item.branchName === evidence.branch);
}

function currentOwnerEvidenceIsClosedSource(evidence, evaluations) {
  return evaluations.some(
    (evaluation) =>
      evaluation.status === "closed" &&
      (evaluation.item?.itemId === evidence.id || evaluation.item?.itemId === evidence.sourceBacklogItemId),
  );
}

function currentOwnerActiveLaneEvaluation(evidence) {
  const itemId = `current-owner-active-${evidence.kind}-${evidence.id}`;
  return {
    item: {
      itemId,
      status: "blocked",
      branchName: evidence.branch || null,
      priority: null,
    },
    claimable: false,
    action: "",
    mutation: "",
    status: "blocked_current_owner_active_lane",
    reason: `current runner already has active lane evidence: ${evidence.kind} ${evidence.id}`,
    nextAction: "finish or clean up the current runner lane before claiming another safe backlog lane",
  };
}

function claimNextBlockedReasons({ selected, blockers, sourceDrift }) {
  if (selected) {
    return [];
  }
  const reasons = blockers.map(previewBlockedReason);
  if (reasons.length > 0) {
    return reasons;
  }
  return sourceDrift.map(previewBlockedReason);
}

function claimNextBlockedRequiredEvidence() {
  return ["resolve blockers before applying claim-next"];
}

function previewBlockedReason(evaluation) {
  if (typeof evaluation === "string") {
    return evaluation;
  }
  const itemId = evaluation?.item?.itemId || "unknown";
  const status = evaluation?.status || "unknown";
  const reason = evaluation?.reason || evaluation?.nextAction || "no reason recorded";
  return `${itemId}: ${status} - ${reason}`;
}

function claimEvaluationIsExcluded(evaluation) {
  return evaluation.status === "closed";
}

function claimEvaluationIsBlocker(evaluation) {
  return !evaluation.claimable && !claimEvaluationIsExcluded(evaluation);
}

function claimEvaluationIsSourceDrift(evaluation) {
  return (
    claimEvaluationIsExcluded(evaluation) &&
    evaluation.item?.status === "ready" &&
    /^closed (workspace|assignment) evidence /.test(evaluation.reason || "")
  );
}

function buildClaimNextActionSummary({ selected, blockers, excluded, sourceDrift, evaluations }) {
  if (selected) {
    return {
      action: "claim selected lane",
      itemId: selected.item.itemId,
      nextAction: selected.nextAction,
      claimable: evaluations.filter((evaluation) => evaluation.claimable).length,
      blocked: blockers.length,
      excluded: excluded.length,
      sourceDrift: sourceDrift.length,
    };
  }
  const primaryBlocker = blockers[0] || null;
  return {
    action: primaryBlocker ? "wait for blocked lane or explicit approval" : "reconcile source drift or add a ready lane",
    itemId: primaryBlocker?.item?.itemId || sourceDrift[0]?.item?.itemId || null,
    nextAction: primaryBlocker?.nextAction || sourceDrift[0]?.nextAction || "choose the next ready safe backlog lane",
    claimable: 0,
    blocked: blockers.length,
    excluded: excluded.length,
    sourceDrift: sourceDrift.length,
  };
}

function formatClaimNextActionSummary(summary) {
  return `next action summary ${summary.action}; claimable=${summary.claimable} blocked=${summary.blocked} excluded=${summary.excluded} sourceDrift=${summary.sourceDrift}; next=${summary.nextAction}`;
}

function summarizeClaimEvaluation(evaluation) {
  return {
    itemId: evaluation.item.itemId,
    sourceStatus: evaluation.item.status || "unknown",
    priority: evaluation.item.priority || null,
    sourceType: evaluation.item.sourceType || null,
    sourceKey: evaluation.item.sourceKey || null,
    sourceRef: evaluation.item.sourceRef || null,
    sourcePath: evaluation.item.sourcePath || null,
    storyPath: evaluation.item.storyPath || null,
    status: evaluation.status,
    claimable: evaluation.claimable,
    branch: evaluation.item.branchName || null,
    action: evaluation.action || null,
    mutation: evaluation.mutation || null,
    reasonCode: reasonCodeForClassification(evaluation),
    reason: evaluation.reason,
    nextAction: evaluation.nextAction,
  };
}

function heartbeat(argv) {
  const { positional, options } = parseOptions(argv);
  const query = positional.join(" ").trim();
  if (!query) {
    throw new Error("heartbeat requires an assignment or task query.");
  }

  const state = workspaceState(options);
  const currentOwner = currentLaneOwner(options);
  const heartbeatOptions = normalizeHeartbeatOptions(options);
  const assignmentRecord = findAssignment(state, query);

  if (assignmentRecord) {
    const result = heartbeatAssignment(state, assignmentRecord, {
      currentOwner,
      options,
      heartbeatOptions,
    });
    if (options.json) {
      console.log(JSON.stringify(buildHeartbeatPacket({ kind: "assignment", result, currentOwner }), null, 2));
      return;
    }
    printApplied("heartbeat", [
      `target assignment ${result.target}`,
      `owner ${currentOwner}`,
      `phase ${heartbeatOptions.phase}`,
      `wrote ${result.path}`,
      "heartbeat metadata only; no branch, PR, cleanup, or ownership mutation",
    ]);
    return;
  }

  const manifestRecord = findManifest(state, query, { preferCurrentWorktree: true });
  const result = heartbeatManifest(state, manifestRecord.manifest.task_id, {
    currentOwner,
    options,
    heartbeatOptions,
  });
  if (options.json) {
    console.log(JSON.stringify(buildHeartbeatPacket({ kind: "workspace", result, currentOwner }), null, 2));
    return;
  }
  printApplied("heartbeat", [
    `target workspace ${result.target}`,
    `owner ${currentOwner}`,
    `phase ${heartbeatOptions.phase}`,
    `wrote ${result.path}`,
    "heartbeat metadata only; no branch, PR, cleanup, or ownership mutation",
  ]);
}

function buildHeartbeatPacket({ kind, result, currentOwner }) {
  const record = kind === "assignment" ? readAssignment(result.path) : readManifest(result.path);
  return {
    targetKind: kind,
    target: result.target,
    path: result.path,
    owner: record.owner || null,
    currentOwner,
    ownerMatches: record.owner === currentOwner,
    status: record.status || null,
    branch: record.branch || null,
    phase: record.phase || null,
    runnerKind: record.runner_kind || null,
    currentCommand: record.current_command || null,
    lastResult: record.last_result || null,
    lastHeartbeatAt: record.last_heartbeat_at || null,
    staleAfterSeconds: Number.isInteger(record.stale_after_seconds) ? record.stale_after_seconds : null,
    heartbeatCount: Number.isInteger(record.heartbeat_count) ? record.heartbeat_count : null,
    bestJudgmentDecisionCount: Array.isArray(record.best_judgment_decisions)
      ? record.best_judgment_decisions.length
      : 0,
    latestBestJudgmentDecision: latestBestJudgmentDecision(record),
    mutation: "heartbeat metadata only; no branch, PR, cleanup, or ownership mutation",
  };
}

function latestBestJudgmentDecision(record) {
  const decisions = Array.isArray(record.best_judgment_decisions) ? record.best_judgment_decisions : [];
  const latest = decisions.at(-1);
  if (!latest) {
    return null;
  }
  return {
    recordedAt: latest.recorded_at || null,
    owner: latest.owner || null,
    phase: latest.phase || null,
    decision: latest.decision || null,
    rationale: latest.rationale || null,
    nextSafeAction: latest.next_safe_action || null,
  };
}

function closeAssignments(argv) {
  const { positional, options } = parseOptions(argv);
  if (options.apply && options.dryRun) {
    throw new Error("close-assignments accepts either --dry-run or --apply, not both.");
  }
  if (options.summaryJson && options.apply) {
    throw new Error("close-assignments --summary-json is only supported without --apply.");
  }

  const assignmentIds = closeAssignmentIds(positional, options);
  if (assignmentIds.length === 0) {
    throw new Error("close-assignments requires --ids or an assignment query.");
  }

  const state = workspaceState(options);
  const currentOwner = currentLaneOwner(options);
  const records = assignmentIds.map((assignmentId) => {
    assertSafeTaskId(assignmentId);
    const path = assignmentPath(state, assignmentId);
    if (!existsSync(path)) {
      throw new Error(`Assignment does not exist: ${assignmentId}`);
    }
    return { path, assignment: readAssignment(path) };
  });
  const manifests = readManifests(state);
  if (options.apply && options.allowStaleRecordCleanup && !validTakeoverReason(options.approval)) {
    throw new Error("--approval must cite explicit operator approval in at least 10 non-whitespace characters.");
  }

  const closeoutOptions = {
    allowStaleRecordCleanup: Boolean(options.allowStaleRecordCleanup),
    approval: String(options.approval || "").trim(),
    delegatedCleanupOwner: String(options.delegatedCleanupOwner || "").trim(),
    delegationEvidence: String(options.delegationEvidence || "").trim(),
  };
  const plans = records.map((record) => assignmentCloseoutPlan(record, manifests, currentOwner, closeoutOptions));
  const lines = plans.map(renderAssignmentCloseoutPlan);
  const blocked = plans.filter((plan) => !plan.closeable && !plan.alreadyClosed);

  if (!options.apply) {
    if (options.summaryJson) {
      console.log(JSON.stringify(buildCloseAssignmentsSummary({ state, currentOwner, plans }), null, 2));
      return;
    }
    printPlan("close-assignments", [
      ...lines,
      "preview only; pass --apply to close eligible assignment records",
    ]);
    return;
  }

  if (blocked.length > 0) {
    throw new Error(`Refusing to close blocked assignments: ${blocked.map((plan) => plan.assignmentId).join(", ")}`);
  }

  for (const plan of plans) {
    if (plan.alreadyClosed) {
      continue;
    }
    applyAssignmentCloseout(state, plan.assignmentId, currentOwner, closeoutOptions);
  }
  printApplied("close-assignments", lines);
}

function buildCloseAssignmentsSummary({ state, currentOwner, plans }) {
  const results = plans.map(shapeAssignmentCloseoutPlan);
  const delegatedCleanup = plans.find((plan) => plan.delegatedCleanup);
  const counts = {
    total: results.length,
    closeable: results.filter((result) => result.status === "closeable").length,
    alreadyClosed: results.filter((result) => result.status === "already_closed").length,
    blocked: results.filter((result) => result.status === "blocked").length,
  };
  return {
    generatedAt: new Date().toISOString(),
    stateRoot: state.root,
    currentOwner: sanitizeCloseoutEvidenceField(currentOwner, 180) || null,
    delegatedCleanupOwner: sanitizeCloseoutEvidenceField(delegatedCleanup?.delegatedCleanupOwner || "", 180) || null,
    delegatedCleanupEvidence: delegatedCleanup?.delegationEvidence || null,
    counts,
    statusCounts: countByField(results, "status"),
    closeoutHandoffEvidence: closeAssignmentsEvidenceSummary({ currentOwner, counts, results, mode: "dry_run" }),
    results: results.slice(0, 10),
    resultsTruncated: results.length > 10,
    mutation: "none; summary only",
  };
}

function closeAssignmentsEvidenceSummary({ currentOwner, counts, results = [], mode = "dry_run", closedAt = null } = {}) {
  const closeable = Number(counts?.closeable || 0);
  const blocked = Number(counts?.blocked || 0);
  const alreadyClosed = Number(counts?.alreadyClosed || 0);
  const changed = mode === "apply"
    ? `closed ${closeable} assignment record(s); skipped ${alreadyClosed} already-closed record(s)`
    : "none; close-assignments summary dry-run only";
  const nextManagerAction = blocked > 0
    ? "Preserve this closeout summary and request explicit cleanup approval before any --apply or gate expansion."
    : closeable > 0 && mode !== "apply"
      ? "Review this dry-run summary before any close-assignments --apply."
      : "Return to manager cleanup planning or active worker monitoring.";
  return {
    schemaVersion: "assignment-closeout-handoff-evidence/v1",
    retention: "metadata_only_no_raw_prompts_provider_payloads_or_tmux_scrollback",
    authority: mode === "apply" ? "existing-close-assignments-apply-gate" : "close-assignments-summary-json-dry-run",
    owner: sanitizeCloseoutEvidenceField(currentOwner, 180) || null,
    changed,
    verified: {
      matchingClosedWorkspaceCount: results.filter((result) => result.closeoutMode === "closed_workspace").length,
      staleRecordCleanupEligibleCount: results.filter((result) => result.staleRecordCleanupEligible).length,
      blockedCount: blocked,
    },
    resultRefs: results.map((result) => ({
      assignmentId: sanitizeCloseoutEvidenceField(result.assignmentId, 180),
      taskId: sanitizeCloseoutEvidenceField(result.taskId, 180),
      manifestTaskId: sanitizeCloseoutEvidenceField(result.manifestTaskId, 180),
      closeoutMode: sanitizeCloseoutEvidenceField(result.closeoutMode, 80),
      status: sanitizeCloseoutEvidenceField(result.status, 80),
    })).slice(0, 10),
    resultRefsTruncated: results.length > 10,
    nextManagerAction,
    closedAt,
  };
}

function sanitizeCloseoutEvidenceField(value, maxLength = 180) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (/\b(sk-[A-Za-z0-9_-]+|gh[pousr]_[A-Za-z0-9_]+)\b/i.test(text)) return "[redacted-token]";
  if (/\b(raw prompt|completion|reasoning trace|provider payload|raw transcript|tmux scrollback|raw scrollback|OPENAI_API_KEY|secret|password|credential)\b/i.test(text)) {
    return "[redacted-retention-field]";
  }
  return text.slice(0, maxLength);
}

function shapeAssignmentCloseoutPlan(plan) {
  return {
    assignmentId: plan.assignmentId,
    status: plan.closeable ? "closeable" : plan.alreadyClosed ? "already_closed" : "blocked",
    reason: plan.reason,
    taskId: plan.taskId,
    manifestTaskId: plan.manifest?.task_id || null,
    branch: plan.manifest?.branch || null,
    owner: plan.manifest?.owner || null,
    closeoutMode: plan.closeoutMode || "blocked",
    staleRecordCleanupEligible: Boolean(plan.staleRecordCleanupEligible),
    staleRecordCleanupEvidence: plan.staleRecordCleanupEvidence || null,
    delegatedCleanup: plan.delegatedCleanup || null,
    assignmentPath: plan.assignmentPath,
    manifestPath: plan.manifestPath,
  };
}

function closeAssignmentIds(positional, options) {
  const ids = [];
  if (options.ids) {
    ids.push(...String(options.ids).split(","));
  }
  if (positional.length > 0) {
    ids.push(positional.join(" "));
  }
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
}

function takeover(argv) {
  const { positional, options } = parseOptions(argv);
  if (options.apply && options.dryRun) {
    throw new Error("takeover accepts either --dry-run or --apply, not both.");
  }
  if (!options.apply && !options.dryRun) {
    throw new Error("takeover requires either --dry-run or --apply.");
  }
  if (options.summaryJson && !options.dryRun) {
    throw new Error("takeover --summary-json is only supported with --dry-run.");
  }
  const query = positional.join(" ").trim();
  if (!query) {
    throw new Error("takeover requires an assignment or task query.");
  }
  if (!validTakeoverReason(options.takeoverReason)) {
    throw new Error("--takeover-reason must explain the takeover in at least 10 non-whitespace characters.");
  }
  if (options.apply && !validTakeoverReason(options.approval)) {
    throw new Error("--approval must cite explicit operator approval in at least 10 non-whitespace characters.");
  }
  if (options.allowDirtyInLane !== undefined && options.allowDirtyInLane !== true) {
    throw new Error("--allow-dirty-in-lane is a flag and does not accept a value.");
  }
  if (options.allowDirtyInLane && !validTakeoverReason(options.approval)) {
    throw new Error("--allow-dirty-in-lane requires explicit operator approval evidence in --approval.");
  }
  if (options.dirtyPaths !== undefined && options.dirtyPaths === true) {
    throw new Error("--dirty-paths requires a value.");
  }
  if (options.dirtyPaths !== undefined && !options.allowDirtyInLane) {
    throw new Error("--dirty-paths is only valid with --allow-dirty-in-lane.");
  }

  const state = workspaceState(options);
  const currentOwner = currentLaneOwner(options);
  const staleAfterSeconds = positiveInteger(options.staleAfterSeconds, 86_400);
  const generatedAt = new Date();
  let target = resolveTakeoverTarget(state, query);
  // An interrupted dirty takeover cannot pass the ordinary no-retained-lock
  // preflight until its digest-bound staging record has been restored.  Apply
  // only: dry runs remain strictly read-only.
  const interruptedRecovery = options.apply && options.allowDirtyInLane === true && target.kind === "workspace"
    ? recoverInterruptedDirtyTakeover(state, target)
    : null;
  // Final-owner crash recovery can restore a different on-disk owner than the
  // target snapshot resolved before the recovery.  Never build authorization
  // evidence from that stale in-memory record.
  if (interruptedRecovery?.recovered && target.kind === "workspace") {
    const manifest = readManifest(target.path);
    validateManifest(manifest, target.path);
    target = { ...target, record: manifest };
  }
  const preflightLockInspection = target.kind === "workspace" ? inspectTaskLock(state, target.record.task_id) : null;
  const packet = takeoverPacket(target, {
    state,
    currentOwner,
    generatedAt,
    staleAfterSeconds,
    reason: String(options.takeoverReason || "").trim(),
    approval: options.approval ? String(options.approval).trim() : "",
    allowDirtyInLane: options.allowDirtyInLane === true,
    dirtyPaths: options.dirtyPaths === undefined ? [] : options.dirtyPaths,
    preflightLockInspection,
    recoveredDirtyTakeoverLease: interruptedRecovery,
  });

  if (options.dryRun) {
    if (options.summaryJson) {
      console.log(JSON.stringify(buildTakeoverSummary(packet), null, 2));
      return;
    }
    printTakeoverPacket("DRY RUN", packet);
    return;
  }

  if (!packet.allowed) {
    printTakeoverPacket("BLOCKED", packet);
    throw new Error(`Takeover blocked for ${packet.target_id}: ${packet.blockers.join("; ")}`);
  }

  const applied = applyTakeover(state, target, {
    currentOwner,
    options,
    staleAfterSeconds,
    preflightLockInspection,
    interruptedRecovery,
  });
  printTakeoverPacket("APPLY", applied.packet);
  console.log(`Wrote: ${applied.path}`);
}

function dispatchNext(argv) {
  const { options } = parseOptions(argv);
  if (options.apply && options.dryRun) {
    throw new Error("dispatch-next accepts either --dry-run or --apply, not both.");
  }
  if (!options.apply && !options.dryRun) {
    throw new Error("dispatch-next requires either --dry-run or --apply.");
  }
  const readinessProfile = normalizeDispatchReadinessProfile(options.readiness || "doctor");
  const state = workspaceState(options);
  const currentOwner = currentLaneOwner(options);
  const staleAfterSeconds = positiveInteger(options.staleAfterSeconds, 86_400);
  const generatedAt = new Date();
  const context = {
    state,
    options,
    currentOwner,
    staleAfterSeconds,
    generatedAt,
    readinessProfile,
  };
  const plan = dispatchPlan(context);

  if (options.dryRun) {
    if (options.summaryJson) {
      console.log(JSON.stringify(buildDispatchNextSummary({ state, currentOwner, staleAfterSeconds, readinessProfile, plan }), null, 2));
      return;
    }
    printDispatchPacket("DRY RUN", plan.packet);
    printClaimBlockers(plan.evaluations, plan.selected);
    return;
  }

  if (!plan.packet.allowed) {
    if (options.summaryJson) {
      console.log(JSON.stringify(buildDispatchNextBlockedApplySummary({ state, currentOwner, staleAfterSeconds, readinessProfile, plan }), null, 2));
      return;
    }
    printDispatchPacket("BLOCKED", plan.packet);
    printClaimBlockers(plan.evaluations, plan.selected);
    throw new Error("No dispatchable safe backlog lane found.");
  }

  const applied = applyDispatchNext(plan, context);
  if (options.summaryJson) {
    console.log(JSON.stringify(buildDispatchNextApplySummary({ state, currentOwner, staleAfterSeconds, readinessProfile, plan, applied }), null, 2));
    return;
  }
  printDispatchPacket("APPLY", applied.packet);
  console.log(`Wrote: ${applied.path}`);
  if (applied.assignmentPath) {
    console.log(`Assignment: ${applied.assignmentPath}`);
  }
  if (applied.manifestPath) {
    console.log(`Workspace: ${applied.manifestPath}`);
  }
}

function emergencyStop(argv) {
  const { options } = parseOptions(argv);
  if (options.apply && options.dryRun) {
    throw new Error("emergency-stop accepts either --dry-run or --apply, not both.");
  }
  if (!options.apply && !options.dryRun) {
    throw new Error("emergency-stop requires either --dry-run or --apply.");
  }
  if (options.summaryJson && !options.dryRun) {
    throw new Error("emergency-stop --summary-json is only supported with --dry-run.");
  }
  if (!validEmergencyStopReason(options.reason)) {
    throw new Error("--reason must explain the emergency stop or clear in at least 10 non-whitespace characters.");
  }

  const state = workspaceState(options);
  const currentOwner = currentLaneOwner(options);
  const generatedAt = new Date();
  const existing = readEmergencyStopCheckpoint(state);
  const packet = options.clear
    ? buildEmergencyStopClearPacket({ state, currentOwner, generatedAt, options, existing })
    : buildEmergencyStopApplyPacket({ state, currentOwner, generatedAt, options, existing });

  if (options.dryRun) {
    if (options.summaryJson) {
      console.log(JSON.stringify(summarizeEmergencyStopPacket(packet, { dryRun: true }), null, 2));
      return;
    }
    printEmergencyStopPacket("DRY RUN", packet);
    return;
  }

  if (!packet.allowed) {
    printEmergencyStopPacket("BLOCKED", packet);
    throw new Error(`Emergency stop ${packet.action} blocked.`);
  }

  const applied = applyEmergencyStopCheckpoint(state, packet);
  printEmergencyStopPacket("APPLY", applied.packet);
  console.log(`Wrote: ${applied.path}`);
}

function resumeWorkspace(argv) {
  const { positional, options } = parseOptions(argv);
  const manifestRecord = findManifest(workspaceState(options), positional.join(" "));
  const { manifest } = manifestRecord;
  const ownerWarning = laneOwnerWarning(manifest, options);

  if (options.json) {
    console.log(JSON.stringify(buildResumePacket(manifestRecord, options, ownerWarning), null, 2));
    return;
  }

  console.log(`Task: ${manifest.task_id}`);
  console.log(`Status: ${manifest.status}`);
  console.log(`Owner: ${manifest.owner || "unowned"}`);
  if (ownerWarning) {
    console.log(ownerWarning);
  }
  console.log(`Branch: ${manifest.branch}`);
  console.log(`Base branch: ${manifest.base_branch || "unknown"}`);
  console.log(`Base ref: ${manifest.base_ref || "unknown"}`);
  console.log(`Worktree: ${manifest.worktree_path}`);
  if (manifest.pr_url) {
    console.log(`PR: ${manifest.pr_url}`);
  }
  console.log(`Command: cd "${manifest.worktree_path}"`);
}

function buildResumePacket({ manifest, path }, options, ownerWarning = laneOwnerWarning(manifest, options)) {
  const currentOwner = currentLaneOwner(options);
  return {
    taskId: manifest.task_id,
    status: manifest.status,
    branch: manifest.branch,
    baseBranch: manifest.base_branch || null,
    baseRef: manifest.base_ref || null,
    owner: manifest.owner || null,
    currentOwner,
    ownerMatches: !manifest.owner || manifest.owner === currentOwner,
    ownerWarning: ownerWarning || null,
    worktreePath: manifest.worktree_path,
    worktreeExists: existsSync(manifest.worktree_path),
    manifestPath: path,
    prUrl: manifest.pr_url || null,
    prNumber: manifest.pr_number || prNumberFromUrl(manifest.pr_url || "") || null,
    command: `cd "${manifest.worktree_path}"`,
    mutation: "none; resume only",
  };
}

function finishEpic(argv) {
  const { positional, options } = parseOptions(argv);
  const state = workspaceState(options);
  const manifestRecord = findManifest(state, positional.join(" "), { preferCurrentWorktree: true });
  const { manifest } = manifestRecord;
  assertLaneOwner(manifest, options);
  const plan = buildEpicBatchFinishPlan(manifest, {
    verificationRef: options.verificationRef || null,
    reviewRef: options.reviewRef || null,
    ageBusinessDays: options.ageBusinessDays === undefined ? null : Number(options.ageBusinessDays),
    liveState: inspectEpicBatchLiveState(manifest),
  });
  const packet = {
    taskId: manifest.task_id,
    mode: manifest.mode || "pr",
    epicId: manifest.epic_batch?.epic_id || null,
    status: plan.status,
    blockers: plan.blockers,
    steps: plan.steps,
    mutation: plan.mutation,
    authority: "operator decision required before final PR, merge, or cleanup",
  };
  if (options.summaryJson) {
    console.log(JSON.stringify(packet, null, 2));
    return;
  }
  printPlan("finish-epic", [
    ...plan.steps,
    ...(plan.blockers.length > 0 ? [`blocked: ${plan.blockers.join("; ")}`] : ["no mutation performed; operator delivery decision remains required"]),
  ]);
}

function inspectEpicBatchLiveState(manifest) {
  if (!manifest?.worktree_path || !existsSync(manifest.worktree_path)) {
    return { error: "managed epic worktree is missing" };
  }
  try {
    const status = parseStatus(manifest.worktree_path);
    const branchResult = git(["branch", "--show-current"], { cwd: manifest.worktree_path });
    return {
      dirty: status.any,
      branch: branchResult.code === 0 ? branchResult.stdout.trim() : "",
      head: branchSha("HEAD", manifest.worktree_path),
    };
  } catch (error) {
    return { error: error.message };
  }
}

function finishPr(argv) {
  const { positional, options } = parseOptions(argv);
  const state = workspaceState(options);
  const manifestRecord = findManifest(state, positional.join(" "), {
    preferCurrentWorktree: true,
  });
  const { manifest, path: manifestPath } = manifestRecord;

  assertFinishPrRecoveryOptions(options);
  if (!options.noVerify) {
    assertKnownVerificationProfile(String(options.verify || ""));
  }
  assertLaneOwner(manifest, options);
  assertBaseCheckoutRecoveryClearForDelivery(state);
  requireGh("finish-pr");
  if (manifest.mode === "experiment") {
    throw new Error("This workspace is marked as experiment mode. Create a PR only after changing its manifest mode to pr.");
  }
  if (manifest.mode === "epic-batch") {
    throw new Error("This workspace is marked as epic-batch mode. Use finish-epic for planning-only final closeout.");
  }
  assertSafeBranch(manifest.branch);
  assertWorktreeExists(manifest);
  assertCurrentBranch(manifest);
  reconcileManifest(manifest, { refreshPr: true });

  let worktreeStatus = parseStatus(manifest.worktree_path);
  const preflightReconciledCommit = reconcileExistingTaskCommit(manifest, worktreeStatus);
  const verificationPlan = options.noVerify
    ? { profile: "", resolvedProfile: "", command: [], changedFiles: [], reason: "explicit-no-verify" }
    : resolveVerificationPlan(String(options.verify || ""), manifest, worktreeStatus);
  const verifyCommand = verificationPlan.command;
  const commitMessage = String(options.message || manifest.title || manifest.description);
  const prTitle = String(options.title || manifest.title || manifest.description);
  const prBody = String(
    options.body ||
      [
        "Created by Codex Workspace Protocol.",
        "",
        `Task: ${manifest.task_id}`,
        `Worktree: ${manifest.worktree_path}`,
      ].join("\n"),
  );

  if (worktreeStatus.unstaged && !options.stageAll) {
    throw new Error("Worktree has unstaged/untracked changes. Stage intentionally first or pass --stage-all.");
  }

  if (!worktreeStatus.any && !manifest.last_commit) {
    throw new Error("No changes to commit and no prior task commit is recorded.");
  }

  const plan = [];
  if (worktreeStatus.unstaged && options.stageAll) {
    plan.push("git add --all");
  }
  if (verifyCommand.length > 0) {
    plan.push(verifyCommand.join(" "));
  }
  plan.push("anti-churn hook evaluate --apply-safe --format json");
  if (worktreeStatus.any) {
    plan.push(`git commit -m "${commitMessage}"`);
  }
  plan.push(`git push -u origin ${manifest.branch}`);
  plan.push("gh pr create/view");

  if (options.dryRun) {
    printPlan("finish-pr", plan);
    return;
  }

  withManifestLock(state, manifest.task_id, (lock) => {
    const lockedManifest = readManifest(manifestPath);
    validateManifest(lockedManifest, manifestPath);
    assertLaneOwner(lockedManifest, options);
    claimLaneOwner(lockedManifest, options);
    Object.assign(manifest, lockedManifest);
    assertCurrentBranch(manifest);
    if (lock.recovery?.classification === "same_owner_stale_child_pid_reuse") {
      appendTaskEvent(manifest, "task_lock_recovered", "same-owner stale child lock with a proven replaced PID identity archived before delivery recovery");
    }

    worktreeStatus = parseStatus(manifest.worktree_path);
    if (worktreeStatus.unstaged && options.stageAll) {
      runChecked("git", ["add", "--all"], { cwd: manifest.worktree_path });
      worktreeStatus = parseStatus(manifest.worktree_path);
    }

    const existingPr = prView(manifest);
    if (existingPr?.baseRefName && existingPr.baseRefName !== manifest.base_branch) {
      throw new Error(`Existing PR base is ${existingPr.baseRefName}, expected ${manifest.base_branch}.`);
    }

    if (verifyCommand.length > 0) {
      lock.heartbeat();
      if (verificationPlan.resolvedProfile === "check") {
        runResumableCheckVerification(manifest, manifestPath, verificationPlan, {
          state,
          owner: currentLaneOwner(options),
          cwd: manifest.worktree_path,
          allowTerminalPacketRecovery: Boolean(options.stageAll),
          allowEnvironmentPreflightRetry: Boolean(options.retryEnvironmentPreflight),
        });
      } else runBoundedVerification(verificationPlan, {
        cwd: manifest.worktree_path,
        diagnosticContext: { state, taskId: manifest.task_id, lockToken: lock.token },
      });
      lock.heartbeat();
      manifest.last_verified_at = new Date().toISOString();
      manifest.last_verification_command = verifyCommand.join(" ");
      appendTaskEvent(manifest, "verified", verifyCommand.join(" "));
      worktreeStatus = parseStatus(manifest.worktree_path);
    }
    const reconciledCommit =
      reconcileExistingTaskCommit(manifest, worktreeStatus) ||
      (preflightReconciledCommit && manifest.last_commit === preflightReconciledCommit.short
        ? preflightReconciledCommit
        : null);
    if (reconciledCommit) {
      appendTaskEvent(
        manifest,
        "commit_reconciled",
        `${reconciledCommit.short} inferred from clean branch ahead of ${reconciledCommit.baseRef}`,
      );
    }

    const antiChurn = runAntiChurnFinalization(manifest, state, { worktreeStatus, pr: existingPr });
    manifest.anti_churn_finalization = antiChurn.manifestRecord;
    appendTaskEvent(manifest, "anti_churn_finalized", `${antiChurn.manifestRecord.status}:${antiChurn.manifestRecord.lessons_evaluated}`);
    worktreeStatus = parseStatus(manifest.worktree_path);
    manifest.lane_evidence_packet = buildLaneEvidencePacket(manifest, antiChurn.manifestRecord, { worktreeStatus });

    if (worktreeStatus.unstaged && !options.stageAll) {
      throw new Error("Worktree has unstaged/untracked changes after verification. Stage intentionally first or pass --stage-all.");
    }

    if (worktreeStatus.unstaged && options.stageAll) {
      runChecked("git", ["add", "--all"], { cwd: manifest.worktree_path });
    }
    if (worktreeStatus.any) {
      runChecked("git", ["commit", "-m", commitMessage], { cwd: manifest.worktree_path });
      manifest.last_commit = git(["rev-parse", "--short", "HEAD"], {
        cwd: manifest.worktree_path,
      }).stdout.trim();
      appendTaskEvent(manifest, "committed", manifest.last_commit);
      worktreeStatus = parseStatus(manifest.worktree_path);
    }

    lock.heartbeat();
    runChecked("git", ["push", "-u", "origin", manifest.branch], { cwd: manifest.worktree_path });
    appendTaskEvent(manifest, "pushed", manifest.branch);
    manifest.pr_delivery_head_sha = git(["rev-parse", "HEAD"], { cwd: manifest.worktree_path }).stdout.trim() || null;
    manifest.pr_delivery_branch = manifest.branch;
    manifest.pr_delivery_base_branch = manifest.base_branch;
    manifest.pr_delivery_pushed_at = new Date().toISOString();

    if (existingPr) {
      manifest.pr_url = existingPr.url;
      manifest.pr_number = existingPr.number;
    } else {
      lock.heartbeat();
      const result = runChecked(
        "gh",
        [
          "pr",
          "create",
          "--base",
          manifest.base_branch,
          "--head",
          manifest.branch,
          "--title",
          prTitle,
          "--body",
          prBody,
        ],
        { cwd: manifest.worktree_path },
      );
      manifest.pr_url = result.stdout.trim().split(/\r?\n/).at(-1);
      manifest.pr_number = prNumberFromUrl(manifest.pr_url);
      if (!manifest.pr_url || !manifest.pr_number) {
        throw new Error("Could not parse created PR URL from GitHub CLI output.");
      }
    }

    manifest.pr_delivery_evidence = shapePrDeliveryEvidence(manifest, {
      existingPr,
      prTitle,
      prBody,
      verifyCommand,
      noVerify: Boolean(options.noVerify),
      verificationPlan,
    });
    appendAuthorityDecision(manifest, manifest.pr_delivery_evidence.authorityDecision);
    manifest.lane_evidence_packet = buildLaneEvidencePacket(manifest, antiChurn.manifestRecord, {
      worktreeStatus,
      prDeliveryEvidence: manifest.pr_delivery_evidence,
    });
    appendTaskEvent(manifest, "pr_delivery_evidence_recorded", manifest.pr_url || manifest.branch);
    manifest.status = "pr_open";
    manifest.updated_at = new Date().toISOString();
    appendTaskEvent(manifest, "pr_open", manifest.pr_url || manifest.branch);
    writeManifest(manifestPath, manifest);
  });
  console.log(`Finished task ${manifest.task_id}`);
  if (manifest.anti_churn_finalization) {
    for (const line of renderAntiChurnFinalization(manifest.anti_churn_finalization)) {
      console.log(line);
    }
  }
  console.log(`PR: ${manifest.pr_url}`);
}

function assertFinishPrRecoveryOptions(options = {}) {
  if (options.retryEnvironmentPreflight === undefined) return;
  if (options.retryEnvironmentPreflight !== true) {
    throw new Error("--retry-environment-preflight accepts only a bare flag.");
  }
  if (options.stageAll) {
    throw new Error("--retry-environment-preflight refuses --stage-all so it cannot alter the reviewed staged snapshot.");
  }
  if (options.noVerify || String(options.verify || "") !== "check") {
    throw new Error("--retry-environment-preflight requires the explicit unchanged --verify check profile.");
  }
}

function inspectTaskLockCommand(argv) {
  const { positional, options } = parseOptions(argv);
  if (positional.length !== 1) {
    throw new Error("inspect-task-lock requires exactly one task id.");
  }
  const taskId = String(positional[0] || "").trim();
  assertSafeTaskId(taskId);
  const state = workspaceState(options);
  const inspection = inspectTaskLock(state, taskId);
  const packet = redactTaskLockInspection(inspection);
  if (options.summaryJson) {
    console.log(JSON.stringify(packet, null, 2));
    return;
  }
  printPlan("inspect-task-lock", [
    `task_id=${packet.taskId}`,
    `status=${packet.status}`,
    `reason=${packet.reason}`,
    `owner=${packet.owner || "unknown"}`,
    `pid=${packet.pid ?? "unknown"}`,
    `heartbeat_at=${packet.heartbeatAt || "unknown"}`,
    "mutation=none; read-only lock inspection",
  ]);
}

function externalIntentSettlementPacket(state, taskId, intentId, owner) {
  const manifestPath = join(state.tasksDir, `${taskId}.json`);
  const manifest = readManifest(manifestPath);
  validateManifest(manifest, manifestPath);
  const blockers = [];
  if (manifest.owner !== owner) blockers.push("current runner is not the exact manifest owner");
  const inspection = inspectTaskLock(state, taskId);
  if (inspection.protocol !== "versioned_lease" || inspection.status !== "ambiguous" || inspection.reason !== "external_command_fence_unresolved") {
    blockers.push("task does not have the exact unresolved versioned external-command fence");
  }
  const metadata = inspection.metadata;
  const tokenDigest = metadata?.token ? taskLeaseTokenDigest(metadata.token) : "";
  let intent = null;
  if (metadata && tokenDigest) {
    try {
      intent = unresolvedTaskLeaseExternalIntent(state, taskId, metadata, tokenDigest);
    } catch {
      blockers.push("unresolved external intent record is invalid");
    }
  }
  if (!intent || intent.intent_id !== intentId) blockers.push("requested intent is not the exact unresolved external intent");
  if (intent) {
    const observedIdentity = processStartIdentity(intent.runner_pid);
    if (observedIdentity !== null) blockers.push("intent runner PID/start identity is still observable or reused");
    try {
      process.kill(intent.runner_pid, 0);
      blockers.push("intent runner PID is still live or not probeable as absent");
    } catch (error) {
      if (error?.code !== "ESRCH") blockers.push("intent runner PID absence could not be proven");
    }
  }
  return {
    taskId,
    intentId,
    owner,
    manifestPath,
    generation: metadata?.generation || null,
    tokenDigest: tokenDigest || null,
    runnerPid: intent?.runner_pid || null,
    runnerProcessStartIdentity: intent?.runner_process_start_identity || null,
    commandDigest: intent?.command_digest || null,
    startedAt: intent?.started_at || null,
    allowed: blockers.length === 0,
    blockers,
    metadataOnly: true,
    rawPayloadRetained: false,
  };
}

function settleExternalIntent(argv) {
  const { positional, options } = parseOptions(argv);
  if (positional.length !== 1) throw new Error("settle-external-intent requires exactly one task id.");
  if (Boolean(options.dryRun) === Boolean(options.apply)) throw new Error("settle-external-intent requires exactly one of --dry-run or --apply.");
  const taskId = String(positional[0] || "").trim();
  const intentId = String(options.intentId || "").trim();
  assertSafeTaskId(taskId);
  if (!isUuid(intentId)) throw new Error("settle-external-intent requires an exact --intent-id UUID.");
  if (options.apply && !validTakeoverReason(options.approval)) {
    throw new Error("settle-external-intent --apply requires explicit operator approval of at least 10 non-whitespace characters.");
  }
  const state = workspaceState(options);
  const owner = currentLaneOwner(options);
  const packet = externalIntentSettlementPacket(state, taskId, intentId, owner);
  if (options.dryRun) {
    const output = { ...packet, mutation: "none; dry-run only" };
    if (options.summaryJson) console.log(JSON.stringify(output, null, 2));
    else printPlan("settle-external-intent", [JSON.stringify(output)]);
    return;
  }
  if (!packet.allowed) throw new Error(`external intent settlement blocked: ${packet.blockers.join("; ")}`);
  const fresh = externalIntentSettlementPacket(state, taskId, intentId, owner);
  if (!fresh.allowed || fresh.generation !== packet.generation || fresh.tokenDigest !== packet.tokenDigest || fresh.commandDigest !== packet.commandDigest || fresh.startedAt !== packet.startedAt) {
    throw new Error("external intent settlement evidence changed before immutable completion; refusing to settle.");
  }
  try {
    writeNewJson(taskLeasePath(state, taskId, "external-completions", intentId), {
      schema_version: taskLeaseSchemaVersion,
      task_id: taskId,
      generation: fresh.generation,
      token_digest: fresh.tokenDigest,
      intent_id: intentId,
      status: 125,
      completed_at: new Date().toISOString(),
      settlement: "owner-attested-runner-absent/v1",
      approval: String(options.approval).trim(),
      metadata_only: true,
      raw_payload_retained: false,
    });
  } catch (error) {
    if (error?.code === "EEXIST") throw new Error("external intent completion already exists; refusing to overwrite immutable evidence.");
    throw error;
  }
  const output = {
    ...fresh,
    settledAt: new Date().toISOString(),
    settlement: "owner-attested-runner-absent/v1",
    mutation: "immutable external completion published; subsequent governed operation must re-prove all normal gates",
  };
  if (options.summaryJson) console.log(JSON.stringify(output, null, 2));
  else printPlan("settle-external-intent", [JSON.stringify(output)]);
}

function adoptLegacyRecovery(argv) {
  const { positional, options } = parseOptions(argv);
  if (positional.length > 0) throw new Error("adopt-legacy-recovery does not accept a task selector.");
  if (Boolean(options.dryRun) === Boolean(options.apply)) {
    throw new Error("adopt-legacy-recovery requires exactly one of --dry-run or --apply.");
  }
  if (options.apply && !validTakeoverReason(options.approval)) {
    throw new Error("adopt-legacy-recovery --apply requires an explicit approval of at least 10 non-whitespace characters.");
  }
  const state = workspaceState(options);
  const manifestPath = join(state.tasksDir, `${legacyRecoveryAdoptionTaskId}.json`);
  const manifest = readManifest(manifestPath);
  validateManifest(manifest, manifestPath);
  if (manifest.task_id !== legacyRecoveryAdoptionTaskId) throw new Error("legacy recovery adoption target does not exactly match its governed manifest.");
  if (manifest.owner !== currentLaneOwner(options)) throw new Error("legacy recovery adoption requires the current governed manifest owner.");

  const packet = legacyRecoveryAdoptionPacket(state, legacyRecoveryAdoptionTaskId);
  if (options.dryRun) {
    const output = { ...packet, mutation: "none; dry-run only" };
    if (options.summaryJson) console.log(JSON.stringify(output, null, 2));
    else printPlan("adopt-legacy-recovery", [JSON.stringify(output)]);
    return;
  }
  if (!packet.allowed) throw new Error(`legacy recovery adoption blocked: ${packet.blockers.join("; ")}`);
  const applied = applyLegacyRecoveryAdoption(state, packet, String(options.approval).trim());
  const output = { ...applied, mutation: "immutable adoption evidence published; legacy pathname retained" };
  if (options.summaryJson) console.log(JSON.stringify(output, null, 2));
  else printPlan("adopt-legacy-recovery", [JSON.stringify(output)]);
}

function recordCheckStageEvidence(argv) {
  const { positional, options } = parseOptions(argv);
  assertExternalCheckStageEvidenceOptions(options);
  if (options.externalDirectSuccess !== true) {
    throw new Error("record-check-stage-evidence requires --external-direct-success.");
  }

  const state = workspaceState(options);
  const manifestRecord = findManifest(state, positional.join(" "), {
    preferCurrentWorktree: true,
  });
  const { manifest, path: manifestPath } = manifestRecord;
  const runnerIdentity = currentLaneOwner();
  assertExternalCheckStageEvidenceManifest(manifest, runnerIdentity);
  const handoff = buildExternalCheckStageEvidenceHandoff(manifest, runnerIdentity);

  if (!options.apply) {
    printPlan("record-check-stage-evidence", [
      `record metadata-only external-direct success for ${handoff.stage}`,
      "do not commit, push, or create/update a PR",
    ]);
    return;
  }

  withManifestLock(state, manifest.task_id, () => {
    const lockedManifest = readManifest(manifestPath);
    validateManifest(lockedManifest, manifestPath);
    const lockedRunnerIdentity = currentLaneOwner();
    assertExternalCheckStageEvidenceManifest(lockedManifest, lockedRunnerIdentity);
    const lockedHandoff = buildExternalCheckStageEvidenceHandoff(lockedManifest, lockedRunnerIdentity);
    applyExternalCheckStageEvidenceHandoff(lockedManifest, lockedHandoff);
    writeManifest(manifestPath, lockedManifest);
    Object.assign(manifest, lockedManifest);
  });

  printApplied("record-check-stage-evidence", [
    `stage=${handoff.stage}`,
    `command=${handoff.command.join(" ")}`,
    "result=metadata-only passed evidence recorded",
    "delivery=none; run ordinary finish-pr separately for existing delivery gates",
  ]);
}

function assertExternalCheckStageEvidenceOptions(options = {}) {
  const allowed = new Set(["apply", "externalDirectSuccess", "stateRoot"]);
  for (const key of Object.keys(options)) {
    if (!allowed.has(key)) {
      throw new Error(`record-check-stage-evidence does not accept --${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}.`);
    }
  }
  if (options.apply !== undefined && options.apply !== true) {
    throw new Error("record-check-stage-evidence accepts --apply only as a flag.");
  }
  if (options.externalDirectSuccess !== undefined && options.externalDirectSuccess !== true) {
    throw new Error("record-check-stage-evidence accepts --external-direct-success only as a flag.");
  }
  if (options.stateRoot === true) {
    throw new Error("record-check-stage-evidence option requires a value.");
  }
}

function assertExternalCheckStageEvidenceManifest(manifest, runnerIdentity) {
  if (manifest.owner !== runnerIdentity) {
    throw new Error("record-check-stage-evidence requires the exact recorded lane owner.");
  }
  if (manifest.status !== "active") {
    throw new Error("record-check-stage-evidence requires an active lane.");
  }
  assertSafeBranch(manifest.branch);
  assertWorktreeExists(manifest);
  assertCurrentBranch(manifest);
}

function buildExternalCheckStageEvidenceHandoff(manifest, runnerIdentity) {
  const cwd = manifest.worktree_path;
  const plan = resumableCheckPlan(cwd);
  const head = git(["rev-parse", "HEAD"], { cwd }).stdout.trim();
  const stagedInputDigest = stagedInputDigestForWorktree(cwd);
  const packet = manifest.check_verification_packet;
  const expected = {
    taskId: manifest.task_id,
    owner: runnerIdentity,
    head,
    plan,
    stagedInputDigest,
  };
  validateTerminalCheckPacketForDiscard(packet, expected);
  if (packet.status !== "failed") {
    throw new Error("record-check-stage-evidence requires a terminal failed check packet.");
  }
  if (
    packet.head !== head ||
    packet.plan_digest !== plan.digest ||
    packet.staged_input_digest !== stagedInputDigest
  ) {
    throw new Error("record-check-stage-evidence binding changed; refusing handoff.");
  }
  const recordedAt = new Date().toISOString();
  if (Date.parse(packet.expires_at) <= Date.parse(recordedAt)) {
    throw new Error("record-check-stage-evidence check packet expired.");
  }
  const targetIndex = plan.stages.indexOf(externalCheckStageEvidenceStage);
  if (targetIndex < 0) {
    throw new Error("record-check-stage-evidence fixed stage is not present in the current check plan.");
  }
  if (packet.stages.length !== targetIndex + 1 || packet.failed_stage !== externalCheckStageEvidenceStage || packet.next_stage !== externalCheckStageEvidenceStage) {
    throw new Error("record-check-stage-evidence requires the recognized failed stage at its ordered current-plan position.");
  }
  if (packet.stages.some((evidence, index) => evidence.stage !== plan.stages[index])) {
    throw new Error("record-check-stage-evidence packet history is not the current ordered plan.");
  }
  const failedEvidence = packet.stages.at(-1);
  if (
    failedEvidence.stage !== externalCheckStageEvidenceStage ||
    (failedEvidence.status === 0 && failedEvidence.signal === null && failedEvidence.error_code === null)
  ) {
    throw new Error("record-check-stage-evidence requires a nonzero final-stage result.");
  }
  const handoff = {
    taskId: manifest.task_id,
    owner: runnerIdentity,
    stage: externalCheckStageEvidenceStage,
    command: [...externalCheckStageEvidenceCommand],
    head,
    planDigest: plan.digest,
    stagedInputDigest,
    recordedAt,
    nextStage: plan.stages[targetIndex + 1] || null,
  };
  assertNoDuplicateExternalCheckStageEvidence(manifest, handoff);
  return handoff;
}

function assertNoDuplicateExternalCheckStageEvidence(manifest, handoff) {
  const evidence = [
    manifest.external_check_stage_evidence,
    ...(Array.isArray(manifest.external_check_stage_evidence_history)
      ? manifest.external_check_stage_evidence_history
      : []),
  ];
  if (evidence.some((entry) => externalCheckStageEvidenceMatchesBinding(entry, handoff))) {
    throw new Error("external check-stage evidence was already recorded for the exact binding; refusing duplicate handoff.");
  }
}

function externalCheckStageEvidenceMatchesBinding(evidence, handoff) {
  return Boolean(
    evidence &&
      evidence.task_id === handoff.taskId &&
      evidence.owner === handoff.owner &&
      evidence.stage === handoff.stage &&
      evidence.head === handoff.head &&
      evidence.plan_digest === handoff.planDigest &&
      evidence.staged_input_digest === handoff.stagedInputDigest &&
      Array.isArray(evidence.command) &&
      evidence.command.length === handoff.command.length &&
      evidence.command.every((part, index) => part === handoff.command[index]),
  );
}

function externalCheckStageEvidenceRecord(handoff, recordedAt) {
  return {
    schema_version: 1,
    recorded_at: recordedAt,
    task_id: handoff.taskId,
    owner: handoff.owner,
    stage: handoff.stage,
    command: [...handoff.command],
    status: 0,
    signal: null,
    error_code: null,
    output: "omitted",
    head: handoff.head,
    plan_digest: handoff.planDigest,
    staged_input_digest: handoff.stagedInputDigest,
  };
}

function archiveExternalCheckStageEvidence(evidence, archivedAt) {
  return {
    schema_version: 1,
    archived_at: archivedAt,
    recorded_at: typeof evidence?.recorded_at === "string" ? evidence.recorded_at : null,
    task_id: typeof evidence?.task_id === "string" ? evidence.task_id : null,
    owner: typeof evidence?.owner === "string" ? evidence.owner : null,
    stage: typeof evidence?.stage === "string" ? evidence.stage : null,
    command: Array.isArray(evidence?.command) && evidence.command.every((part) => typeof part === "string") ? [...evidence.command] : [],
    status: Number.isInteger(evidence?.status) ? evidence.status : null,
    signal: typeof evidence?.signal === "string" ? evidence.signal : null,
    error_code: typeof evidence?.error_code === "string" ? evidence.error_code : null,
    output: "omitted",
    head: typeof evidence?.head === "string" ? evidence.head : null,
    plan_digest: typeof evidence?.plan_digest === "string" ? evidence.plan_digest : null,
    staged_input_digest: typeof evidence?.staged_input_digest === "string" ? evidence.staged_input_digest : null,
  };
}

function applyExternalCheckStageEvidenceHandoff(manifest, handoff) {
  const packet = manifest.check_verification_packet;
  const completedAt = handoff.recordedAt;
  packet.stages = [
    ...packet.stages.slice(0, -1),
    {
      stage: handoff.stage,
      completed_at: completedAt,
      status: 0,
      signal: null,
      error_code: null,
      output: "omitted",
    },
  ];
  packet.status = handoff.nextStage ? "partial" : "passed";
  packet.next_stage = handoff.nextStage;
  packet.updated_at = completedAt;
  if (handoff.nextStage) {
    delete packet.completed_at;
  } else {
    packet.completed_at = completedAt;
  }
  delete packet.failed_stage;
  if (manifest.external_check_stage_evidence) {
    const history = Array.isArray(manifest.external_check_stage_evidence_history)
      ? manifest.external_check_stage_evidence_history
      : [];
    manifest.external_check_stage_evidence_history = [
      ...history,
      archiveExternalCheckStageEvidence(manifest.external_check_stage_evidence, completedAt),
    ];
    appendTaskEvent(manifest, "external_check_stage_evidence_superseded", `${handoff.stage}: stale binding archived`);
  }
  manifest.external_check_stage_evidence = externalCheckStageEvidenceRecord(handoff, completedAt);
  appendTaskEvent(manifest, "external_check_stage_evidence_recorded", `${handoff.stage}: external-direct-success`);
}

function verifyPrGates(argv) {
  const { positional, options } = parseOptions(argv);
  assertBareApplyOption(options, "verify-pr-gates");
  if (options.summaryJson && options.apply) {
    throw new Error("verify-pr-gates --summary-json is only supported without --apply.");
  }

  const state = workspaceState(options);
  const manifestRecord = findManifest(state, positional.join(" "), {
    preferCurrentWorktree: true,
  });
  const { manifest, path: manifestPath } = manifestRecord;
  assertLaneOwner(manifest, options);
  requireGh("verify-pr-gates");
  assertSafeBranch(manifest.branch);
  assertWorktreeExists(manifest);
  assertCurrentBranch(manifest);
  reconcileManifest(manifest, { refreshPr: true });

  const packet = buildPrGateEvidence(manifest, { options });
  if (options.summaryJson) {
    console.log(JSON.stringify(packet, null, 2));
    return;
  }

  if (!packet.lowRiskReady) {
    printBlocked("verify-pr-gates", renderPrGateEvidence(packet));
    throw new Error(`PR gate evidence is not low-risk ready: ${packet.blockers.join("; ")}`);
  }

  if (!options.apply) {
    printPlan("verify-pr-gates", renderPrGateEvidence(packet));
    console.log("Add --apply to record PR gate evidence in the manifest.");
    return;
  }

  withManifestLock(state, manifest.task_id, () => {
    const lockedManifest = readManifest(manifestPath);
    validateManifest(lockedManifest, manifestPath);
    assertLaneOwner(lockedManifest, options);
    claimLaneOwner(lockedManifest, options);
    Object.assign(manifest, lockedManifest);
    assertCurrentBranch(manifest);
    const lockedPacket = buildPrGateEvidence(manifest, { options });
    if (!lockedPacket.lowRiskReady) {
      printBlocked("verify-pr-gates", renderPrGateEvidence(lockedPacket));
      throw new Error(`PR gate evidence changed under lock: ${lockedPacket.blockers.join("; ")}`);
    }
    manifest.pr_gate_evidence = lockedPacket;
    manifest.pr_review_state_checked_at = lockedPacket.checkedAt;
    manifest.pr_checks_state_checked_at = lockedPacket.checkedAt;
    manifest.pr_exact_head_checked_at = lockedPacket.checkedAt;
    manifest.delivery_subagent_audit = lockedPacket.deliverySubagentAudit;
    manifest.delivery_subagent_audit_checked_at = lockedPacket.checkedAt;
    manifest.pr_delivery_head_sha = lockedPacket.expectedHeadSha;
    manifest.pr_url = lockedPacket.pr.url || manifest.pr_url;
    manifest.pr_number = lockedPacket.pr.number || manifest.pr_number;
    appendAuthorityDecision(manifest, lockedPacket.authorityDecision);
    manifest.lane_evidence_packet = buildLaneEvidencePacket(manifest, manifest.anti_churn_finalization || {}, {
      worktreeStatus: parseStatus(manifest.worktree_path),
      prDeliveryEvidence: manifest.pr_delivery_evidence || null,
      prGateEvidence: lockedPacket,
      deliverySubagentAudit: lockedPacket.deliverySubagentAudit,
    });
    manifest.updated_at = lockedPacket.checkedAt;
    appendTaskEvent(manifest, "pr_gate_evidence_recorded", `PR ${lockedPacket.pr.number} ${lockedPacket.expectedHeadSha}`);
    writeManifest(manifestPath, manifest);
  });

  printApplied("verify-pr-gates", renderPrGateEvidence(manifest.pr_gate_evidence));
}

function refreshPrHead(argv) {
  const { positional, options } = parseOptions(argv);
  assertBareApplyOption(options, "refresh-pr-head");
  if (options.summaryJson && options.apply) {
    throw new Error("refresh-pr-head --summary-json is only supported without --apply.");
  }
  const reason = safeMetadataText(options.reason, 500);
  if (!validTakeoverReason(reason)) {
    throw new Error("refresh-pr-head requires --reason with at least 10 non-whitespace characters.");
  }

  const state = workspaceState(options);
  const { manifest, path: manifestPath } = findManifest(state, positional.join(" "), {
    preferCurrentWorktree: true,
  });
  assertLaneOwner(manifest, options);
  requireGh("refresh-pr-head");
  assertSafeBranch(manifest.branch);
  assertWorktreeExists(manifest);
  assertCurrentBranch(manifest);
  assertRegisteredManagedWorktree(manifest, state);

  const lockInspection = inspectTaskLock(state, manifest.task_id);
  const packet = buildPrHeadRefreshEvidence(manifest, { options, reason, lockInspection });
  if (options.summaryJson) {
    console.log(JSON.stringify(packet, null, 2));
    return;
  }
  if (!packet.ready) {
    printBlocked("refresh-pr-head", renderPrHeadRefreshEvidence(packet));
    throw new Error(`PR-head refresh is not ready: ${packet.blockers.join("; ")}`);
  }
  if (!options.apply) {
    printPlan("refresh-pr-head", renderPrHeadRefreshEvidence(packet));
    console.log("Add --apply to record this explicit metadata-only stale-head rebind. It does not resolve threads, merge, or clean up.");
    return;
  }

  withManifestLock(state, manifest.task_id, (lock) => {
    const locked = readManifest(manifestPath);
    validateManifest(locked, manifestPath);
    assertLaneOwner(locked, options);
    claimLaneOwner(locked, options);
    assertCurrentBranch(locked);
    assertRegisteredManagedWorktree(locked, state);
    lock.heartbeat();
    const lockedPacket = buildPrHeadRefreshEvidence(locked, {
      options,
      reason,
      lockInspection: { status: "owned", owner: currentLaneOwner(options) },
    });
    if (!lockedPacket.ready) {
      printBlocked("refresh-pr-head", renderPrHeadRefreshEvidence(lockedPacket));
      throw new Error(`PR-head refresh changed under lock: ${lockedPacket.blockers.join("; ")}`);
    }
    const rebind = {
      schemaVersion: 1,
      priorHeadSha: lockedPacket.priorHeadSha,
      newHeadSha: lockedPacket.newHeadSha,
      reason: lockedPacket.reason,
      checkedAt: lockedPacket.checkedAt,
      repository: lockedPacket.repository,
      pr: lockedPacket.pr,
      lock: lockedPacket.lock,
      checks: compactStatusCheckEvidence(lockedPacket.checks),
      reviewThreads: compactReviewThreadAudit(lockedPacket.reviewThreads),
      nonAncestralRecovery: lockedPacket.nonAncestralRecovery,
      metadataOnly: true,
      rawPayloadRetained: false,
    };
    locked.pr_delivery_head_sha = lockedPacket.newHeadSha;
    locked.pr_delivery_evidence = synchronizeStandardDeliveryEvidenceAfterHeadRebind(
      locked.pr_delivery_evidence,
      lockedPacket,
    );
    locked.pr_url = lockedPacket.pr.url || locked.pr_url;
    locked.pr_number = lockedPacket.pr.number || locked.pr_number;
    locked.pr_head_rebinds = [...copyJsonArray(locked.pr_head_rebinds), rebind];
    locked.pr_gate_evidence = stalePrGateEvidenceAfterHeadRebind(lockedPacket, rebind);
    locked.delivery_subagent_audit = staleDeliveryAuditAfterHeadRebind(lockedPacket, rebind);
    locked.delivery_subagent_audit_checked_at = lockedPacket.checkedAt;
    locked.pr_head_rebind_checked_at = lockedPacket.checkedAt;
    appendAuthorityDecision(locked, lockedPacket.authorityDecision);
    locked.lane_evidence_packet = buildLaneEvidencePacket(locked, locked.anti_churn_finalization || {}, {
      prGateEvidence: locked.pr_gate_evidence,
      deliverySubagentAudit: locked.delivery_subagent_audit,
    });
    locked.updated_at = lockedPacket.checkedAt;
    appendTaskEvent(locked, "pr_delivery_head_rebound", `${lockedPacket.priorHeadSha} -> ${lockedPacket.newHeadSha}: ${lockedPacket.reason}`);
    writeManifest(manifestPath, locked);
    Object.assign(manifest, locked);
  });

  printApplied("refresh-pr-head", renderPrHeadRefreshEvidence({
    ...manifest.pr_head_rebinds.at(-1),
    lock: { status: "owned", owner: currentLaneOwner(options) },
  }));
}

function buildPrHeadRefreshEvidence(manifest, context = {}) {
  const checkedAt = new Date().toISOString();
  const options = context.options || {};
  const reason = safeMetadataText(context.reason, 500);
  const lockInspection = context.lockInspection || { status: "ambiguous", reason: "lock_inspection_missing" };
  const priorHeadSha = exactGitObjectIdOrNull(manifest.pr_delivery_head_sha) || null;
  const localHeadResult = git(["rev-parse", "HEAD"], { cwd: manifest.worktree_path });
  const localHeadSha = localHeadResult.code === 0 ? exactGitObjectIdOrNull(localHeadResult.stdout.trim()) : null;
  const remoteHeadResult = git(["rev-parse", `origin/${manifest.branch}`], { cwd: manifest.worktree_path });
  const remoteHeadSha = remoteHeadResult.code === 0 ? exactGitObjectIdOrNull(remoteHeadResult.stdout.trim()) : null;
  const repositoryRef = githubRepository(manifest);
  const repository = { owner: repositoryRef.owner, name: repositoryRef.name, fullName: `${repositoryRef.owner}/${repositoryRef.name}` };
  const pr = prViewForGates(manifest);
  const nonRequiredCheckPolicy = shapeNonRequiredCheckPolicyEvidence(options, {
    expectedHeadSha: pr?.headRefOid || "",
    worktreePath: manifest.worktree_path,
  });
  const checks = normalizeStatusCheckRollup(pr?.statusCheckRollup, nonRequiredCheckPolicy);
  const reviewThreads = pr?.number ? fetchReviewThreadState(manifest, repositoryRef, pr.number) : emptyReviewThreadState();
  // Thread hydration can require multiple GraphQL pages.  Re-read the mutable
  // PR/check snapshot afterwards so a head, branch, base, or check transition
  // cannot be persisted as a ready delivery-head rebind.
  const postAuditPr = prViewForGates(manifest);
  const postAuditChecks = normalizeStatusCheckRollup(postAuditPr?.statusCheckRollup, nonRequiredCheckPolicy);
  const postAuditSnapshotChanged = !postAuditPr
    || postAuditPr.number !== pr?.number
    || postAuditPr.baseRefName !== pr?.baseRefName
    || postAuditPr.baseRefOid !== pr?.baseRefOid
    || postAuditPr.headRefName !== pr?.headRefName
    || postAuditPr.headRefOid !== pr?.headRefOid
    || JSON.stringify(compactStatusCheckEvidence(postAuditChecks)) !== JSON.stringify(compactStatusCheckEvidence(checks));
  const resolutionOutcomes = [
    ...(Array.isArray(manifest.current_thread_resolution_outcomes) ? manifest.current_thread_resolution_outcomes : []).map((outcome) => ({ kind: "current", outcome })),
    ...(Array.isArray(manifest.outdated_thread_resolution_outcomes) ? manifest.outdated_thread_resolution_outcomes : []).map((outcome) => ({ kind: "outdated", outcome })),
  ];
  const unrecoveredAttempts = resolutionOutcomes.filter(({ kind, outcome }) =>
    isUnrecoveredResolutionAttempt(resolutionOutcomes, kind, outcome),
  );
  const blockers = [];
  if (manifest.status !== "pr_open") blockers.push(`Manifest status is ${manifest.status || "missing"}; only pr_open lanes may refresh a delivery head`);
  const releasedByCurrentOwner = lockInspection.status === "released"
    && lockInspection.metadata?.owner === manifest.owner
    && manifest.owner === currentLaneOwner(options);
  if (lockInspection.status !== "absent" && lockInspection.status !== "owned" && !releasedByCurrentOwner) blockers.push(`Task lock is ${lockInspection.status || "ambiguous"}; explicit refresh requires an idle or owned lane lock`);
  if (!priorHeadSha) blockers.push("Recorded delivery head is missing or invalid; refresh cannot silently establish an initial delivery binding");
  if (!reason) blockers.push("Explicit stale-head refresh reason is missing");
  if (priorHeadSha && priorHeadSha === pr?.headRefOid) blockers.push("Recorded delivery head already matches the live PR head; refresh is unnecessary");
  if (repository.owner !== "slawdawg" || repository.name !== "Kendall-vnxt") blockers.push("PR-head refresh only accepts the canonical Kendall_Nxt repository");
  if (!pr?.number || !pr?.url) blockers.push("Live PR identity is incomplete");
  if (manifest.pr_number && pr?.number !== manifest.pr_number) blockers.push("Live PR number does not match the managed manifest");
  if (manifest.pr_url && pr?.url !== manifest.pr_url) blockers.push("Live PR URL does not match the managed manifest");
  if (pr?.state !== "OPEN" || pr?.isDraft || pr?.mergedAt) blockers.push("Live PR must be open and non-draft for an explicit head refresh");
  if (pr?.baseRefName !== manifest.base_branch) blockers.push(`Live PR base is ${pr?.baseRefName || "missing"}, expected ${manifest.base_branch}`);
  if (!pr?.headRefOid || !exactGitObjectIdOrNull(pr.headRefOid)) blockers.push("Live PR head is missing or invalid");
  if (pr?.headRefName !== manifest.branch) blockers.push("Live PR head branch does not match the managed manifest branch");
  if (postAuditSnapshotChanged) blockers.push("Live PR or status checks changed while collecting the refresh review-thread audit");
  if (!localHeadSha || localHeadSha !== pr?.headRefOid) blockers.push("Local worktree HEAD does not match the live PR head");
  if (!remoteHeadSha || remoteHeadSha !== pr?.headRefOid) blockers.push("origin branch HEAD does not match the live PR head");
  const fastForward = priorHeadSha && pr?.headRefOid
    ? git(["merge-base", "--is-ancestor", priorHeadSha, pr.headRefOid], { cwd: manifest.worktree_path }).code === 0
    : false;
  const nonAncestralRecovery = shapePr723NonAncestralRefreshRecoveryEvidence(manifest, {
    options,
    priorHeadSha,
    localHeadSha,
    remoteHeadSha,
    repository,
    pr,
    fastForward,
  });
  if (!fastForward && nonAncestralRecovery.status !== "authorized") {
    blockers.push("Recorded delivery head is not a fast-forward ancestor of the live PR head");
  }
  blockers.push(...nonAncestralRecovery.blockers);
  if (pr?.reviewDecision === "CHANGES_REQUESTED") blockers.push(`PR reviewDecision is ${pr.reviewDecision}`);
  if (checks.total === 0) blockers.push("No status checks reported for live PR head");
  if (checks.pending.length) blockers.push(`Pending checks: ${checks.pending.map((check) => check.name).join(", ")}`);
  if (checks.failing.length) blockers.push(`Failing checks: ${checks.failing.map((check) => check.name).join(", ")}`);
  blockers.push(...(nonRequiredCheckPolicy.blockers || []));
  if (!reviewThreads.querySucceeded) blockers.push("Review-thread query did not return thread-aware evidence");
  if (reviewThreads.errorCount > 0) blockers.push(`Review-thread query returned ${reviewThreads.errorCount} GraphQL error(s)`);
  if (reviewThreads.hasNextPage || reviewThreads.reviewRequestHasNextPage) blockers.push("Review-thread audit is incomplete");
  if (reviewThreads.pendingReviewRequestCount > 0) blockers.push(`Pending review requests: ${reviewThreads.pendingReviewRequestCount}`);
  if (unrecoveredAttempts.length) {
    blockers.push(`Unrecovered review-thread mutation outcomes block delivery-head refresh: ${unrecoveredAttempts.map(({ kind, outcome }) => `${kind}:${outcome?.threadId || "unknown"}`).join(", ")}`);
  }
  const requiredGates = [
    "exact managed owner plus absent or owned task lock",
    "canonical Kendall_Nxt repository and matching managed PR identity",
    "open non-draft PR at one exact local, origin, and GitHub head",
    "terminal successful checks or canonical policy-bound non-required skipped checks",
    "complete thread-aware review audit with no pending review request",
    "explicit prior/new head and reason retained as metadata only",
  ];
  if (!fastForward) {
    requiredGates.push("PR #723-only non-ancestral recovery contract with exact prior head, authorized anchor ancestry, documented merge base, and operator evidence");
  }
  const ready = blockers.length === 0;
  return {
    schemaVersion: 1,
    status: ready ? "ready" : "blocked",
    ready,
    checkedAt,
    taskId: manifest.task_id,
    reason: reason || null,
    priorHeadSha,
    newHeadSha: pr?.headRefOid || null,
    localHeadSha,
    remoteHeadSha,
    repository,
    pr: {
      number: pr?.number || null,
      url: pr?.url || null,
      state: pr?.state || null,
      isDraft: Boolean(pr?.isDraft),
      baseRefName: pr?.baseRefName || null,
      headRefName: pr?.headRefName || null,
      headRefOid: pr?.headRefOid || null,
      reviewDecision: pr?.reviewDecision || null,
    },
    lock: { status: lockInspection.status || "ambiguous", reason: lockInspection.reason || null },
    checks,
    nonRequiredCheckPolicy,
    reviewThreads,
    nonAncestralRecovery,
    blockers,
    requiredGates,
    authorityDecision: shapeAuthorityDecisionEvidence({
      operation: "refresh-pr-head",
      authorityFamily: nonAncestralRecovery.status === "authorized" ? "delivery-evidence-rebind-recovery" : "delivery-evidence-rebind",
      decision: ready ? "ready" : "blocked",
      allowed: ready,
      requiredGates,
      satisfiedGates: ready ? requiredGates : [],
      blockedReasons: blockers,
      stopLines: [
        "explicit metadata-only manifest rebind; no source, review-thread, merge, or cleanup mutation",
        "active, stale, or ambiguous task locks block refresh",
        "remote/local/PR identity mismatch, pending or failing checks, or incomplete review evidence block refresh",
        "non-ancestral history is blocked unless every literal PR #723 recovery binding and the exact operator authorization match",
      ],
      evidenceRefs: [`task:${manifest.task_id}`, `repository:${repository.fullName}`, pr?.number ? `pr:${pr.number}` : "", priorHeadSha ? `prior-head:${priorHeadSha}` : "", pr?.headRefOid ? `new-head:${pr.headRefOid}` : "", nonAncestralRecovery.status === "authorized" ? `recovery-anchor:${nonAncestralRecovery.authorizedAnchorHeadSha}` : "", nonAncestralRecovery.status === "authorized" ? `recovery-merge-base:${nonAncestralRecovery.observedMergeBaseSha}` : ""],
      nextSafeAction: ready ? "Apply the one explicit delivery-head rebind under lock, then rerun the normal thread adjudication workflow." : "Do not alter the manifest manually; fix the named evidence mismatch and rerun refresh-pr-head.",
      recoveryPath: "Keep the prior delivery-head binding unchanged. Re-run the read-only refresh packet after the ambiguous state is resolved.",
      generatedAt: checkedAt,
    }),
    metadataOnly: true,
    rawPayloadRetained: false,
  };
}

function shapePr723NonAncestralRefreshRecoveryEvidence(manifest, context = {}) {
  const specification = pr723NonAncestralRefreshException;
  const rawAuthorization = context.options?.nonAncestralRecoveryAuthorization;
  // This is deliberately an exact byte-for-byte token, not normal metadata:
  // whitespace normalization would make the operator evidence ambiguous.
  const authorization = typeof rawAuthorization === "string" && rawAuthorization.length <= 500
    ? rawAuthorization
    : "";
  const expectedAuthorization = `operator-authorized recovery=pr-723 prior=${specification.priorHeadSha} anchor=${specification.authorizedAnchorHeadSha} merge-base=${specification.documentedMergeBaseSha}`;
  const liveHeadSha = exactGitObjectIdOrNull(context.pr?.headRefOid) || null;
  const observedMergeBase = git(["merge-base", specification.priorHeadSha, specification.authorizedAnchorHeadSha], { cwd: manifest.worktree_path });
  const observedMergeBaseSha = observedMergeBase.code === 0 ? exactGitObjectIdOrNull(observedMergeBase.stdout.trim()) : null;
  const anchorIsAncestorOfLiveHead = liveHeadSha
    ? gitCommitIsAncestor(specification.authorizedAnchorHeadSha, liveHeadSha, manifest.worktree_path)
    : false;
  const literalBindingMatches = (
    manifest.task_id === specification.taskId
    && manifest.branch === specification.branch
    && manifest.base_branch === specification.baseBranch
    && context.repository?.fullName === specification.repository
    && context.pr?.number === specification.prNumber
    && context.pr?.url === specification.prUrl
    && context.pr?.baseRefName === specification.baseBranch
    && context.pr?.headRefName === specification.branch
    && context.priorHeadSha === specification.priorHeadSha
  );
  const blockers = [];

  if (context.fastForward) {
    if (authorization) blockers.push("Non-ancestral recovery authorization is only valid when the recorded delivery head is not an ancestor of the live PR head");
    return {
      schemaVersion: 1,
      status: authorization ? "blocked" : "not-required",
      expectedAuthorization: expectedAuthorization || null,
      authorization: authorization || null,
      priorHeadSha: context.priorHeadSha || null,
      authorizedAnchorHeadSha: specification.authorizedAnchorHeadSha,
      liveHeadSha,
      observedMergeBaseSha,
      anchorIsAncestorOfLiveHead,
      literalBindingMatches,
      blockers,
      metadataOnly: true,
      rawPayloadRetained: false,
    };
  }

  if (!literalBindingMatches) blockers.push("Non-ancestral recovery is restricted to the literal recorded PR #723 task, repository, URL, branch, base, and prior delivery head");
  if (authorization !== expectedAuthorization) blockers.push("Non-ancestral recovery requires exact operator evidence bound to the PR #723 prior head, authorized anchor, and documented merge base");
  if (!observedMergeBaseSha || observedMergeBaseSha !== specification.documentedMergeBaseSha) blockers.push("Non-ancestral recovery did not reproduce the documented merge base");
  if (!anchorIsAncestorOfLiveHead) blockers.push("Non-ancestral recovery requires the live PR head to descend from the exact authorized anchor head");
  if (!context.localHeadSha || context.localHeadSha !== liveHeadSha) blockers.push("Non-ancestral recovery requires exact local-head evidence for the live PR head");
  if (!context.remoteHeadSha || context.remoteHeadSha !== liveHeadSha) blockers.push("Non-ancestral recovery requires exact origin-head evidence for the live PR head");

  return {
    schemaVersion: 1,
    status: blockers.length ? "blocked" : "authorized",
    expectedAuthorization,
    authorization: authorization || null,
    taskId: specification.taskId,
    repository: specification.repository,
    prNumber: specification.prNumber,
    prUrl: specification.prUrl,
    baseBranch: specification.baseBranch,
    branch: specification.branch,
    priorHeadSha: context.priorHeadSha || null,
    authorizedAnchorHeadSha: specification.authorizedAnchorHeadSha,
    liveHeadSha,
    documentedMergeBaseSha: specification.documentedMergeBaseSha,
    observedMergeBaseSha,
    anchorIsAncestorOfLiveHead,
    localHeadSha: context.localHeadSha || null,
    remoteHeadSha: context.remoteHeadSha || null,
    literalBindingMatches,
    blockers,
    metadataOnly: true,
    rawPayloadRetained: false,
  };
}

function renderPrHeadRefreshEvidence(packet = {}) {
  const reviewThreads = packet.reviewThreads || {};
  return [
    `prior head ${packet.priorHeadSha || "missing"}`,
    `new head ${packet.newHeadSha || "missing"}`,
    `repository ${packet.repository?.fullName || "unknown"} pr=${packet.pr?.number || "unknown"}`,
    `lock ${packet.lock?.status || "unknown"}`,
    `checks total=${packet.checks?.total ?? 0} pending=${packet.checks?.pending?.length ?? 0} failing=${packet.checks?.failing?.length ?? 0}`,
    `reviewThreads current=${reviewThreads.unresolvedNonOutdatedCount ?? reviewThreads.unresolvedCurrent ?? "unknown"} outdated=${reviewThreads.unresolvedOutdatedCount ?? reviewThreads.unresolvedOutdated ?? "unknown"} pendingRequests=${reviewThreads.pendingReviewRequestCount ?? reviewThreads.pendingRequests ?? "unknown"}`,
    `nonAncestralRecovery ${packet.nonAncestralRecovery?.status || "unknown"} anchor=${packet.nonAncestralRecovery?.authorizedAnchorHeadSha || "none"} mergeBase=${packet.nonAncestralRecovery?.observedMergeBaseSha || "none"}`,
  ];
}

function stalePrGateEvidenceAfterHeadRebind(packet, rebind) {
  return {
    schemaVersion: 1,
    status: "stale",
    lowRiskReady: false,
    expectedHeadSha: rebind.priorHeadSha,
    supersededByHeadSha: rebind.newHeadSha,
    supersededAt: packet.checkedAt,
    reason: "Explicit delivery-head refresh requires a new exact-head PR gate packet before merge.",
    metadataOnly: true,
    rawPayloadRetained: false,
  };
}

function staleDeliveryAuditAfterHeadRebind(packet, rebind) {
  return {
    schemaVersion: 1,
    status: "stale",
    headSha: rebind.priorHeadSha,
    supersededByHeadSha: rebind.newHeadSha,
    checkedAt: packet.checkedAt,
    reason: "Exact-head delivery audit must be repeated after an explicit delivery-head refresh.",
    metadataOnly: true,
    rawPayloadRetained: false,
  };
}

function adjudicateOutdatedThread(argv) {
  const { positional, options } = parseOptions(argv);
  assertBareApplyOption(options, "adjudicate-outdated-thread");
  if (options.summaryJson && options.apply) {
    throw new Error("adjudicate-outdated-thread --summary-json is only supported without --apply.");
  }
  const threadId = safeMetadataText(options.threadId, 160);
  if (!/^PRRT_[A-Za-z0-9_-]+$/.test(threadId)) {
    throw new Error("adjudicate-outdated-thread requires --thread-id <GitHub review-thread id>.");
  }

  const state = workspaceState(options);
  const manifestRecord = findManifest(state, positional.join(" "), { preferCurrentWorktree: true });
  const { manifest, path: manifestPath } = manifestRecord;
  assertLaneOwner(manifest, options);
  requireGh("adjudicate-outdated-thread");
  assertSafeBranch(manifest.branch);
  assertWorktreeExists(manifest);
  assertCurrentBranch(manifest);
  assertRegisteredManagedWorktree(manifest, state);
  assertCleanManagedResolutionWorktree(manifest);
  reconcileManifest(manifest, { refreshPr: true });

  const packet = buildOutdatedThreadAdjudicationEvidence(manifest, { options, threadId });
  if (options.summaryJson) {
    console.log(JSON.stringify(packet, null, 2));
    return;
  }
  if (!packet.ready) {
    printBlocked("adjudicate-outdated-thread", renderOutdatedThreadAdjudicationEvidence(packet));
    throw new Error(`Outdated review-thread adjudication is not ready: ${packet.blockers.join("; ")}`);
  }
  if (!options.apply) {
    printPlan("adjudicate-outdated-thread", renderOutdatedThreadAdjudicationEvidence(packet));
    console.log("Add --apply to record the bounded evidence. This command never resolves or replies to a GitHub review thread.");
    return;
  }

  withManifestLock(state, manifest.task_id, () => {
    const lockedManifest = readManifest(manifestPath);
    validateManifest(lockedManifest, manifestPath);
    assertLaneOwner(lockedManifest, options);
    claimLaneOwner(lockedManifest, options);
    assertCurrentBranch(lockedManifest);
    assertRegisteredManagedWorktree(lockedManifest, state);
    assertCleanManagedResolutionWorktree(lockedManifest);
    reconcileManifest(lockedManifest, { refreshPr: true });
    const lockedPacket = buildOutdatedThreadAdjudicationEvidence(lockedManifest, { options, threadId });
    if (!lockedPacket.ready) {
      printBlocked("adjudicate-outdated-thread", renderOutdatedThreadAdjudicationEvidence(lockedPacket));
      throw new Error(`Outdated review-thread adjudication changed under lock: ${lockedPacket.blockers.join("; ")}`);
    }
    const prior = Array.isArray(lockedManifest.outdated_thread_adjudications) ? lockedManifest.outdated_thread_adjudications : [];
    lockedManifest.outdated_thread_adjudications = retainThreadAdjudicationsForRecovery(
      [...prior.filter((entry) => entry?.threadId !== threadId), lockedPacket],
      [
        ...(Array.isArray(lockedManifest.current_thread_resolution_outcomes) ? lockedManifest.current_thread_resolution_outcomes : []),
        ...(Array.isArray(lockedManifest.outdated_thread_resolution_outcomes) ? lockedManifest.outdated_thread_resolution_outcomes : []),
      ],
    );
    appendAuthorityDecision(lockedManifest, lockedPacket.authorityDecision);
    lockedManifest.lane_evidence_packet = buildLaneEvidencePacket(lockedManifest, lockedManifest.anti_churn_finalization || {});
    lockedManifest.updated_at = lockedPacket.checkedAt;
    appendTaskEvent(lockedManifest, "outdated_review_thread_adjudicated", `${threadId} ${lockedPacket.expectedHeadSha}`);
    writeManifest(manifestPath, lockedManifest);
    Object.assign(manifest, lockedManifest);
  });
  printApplied("adjudicate-outdated-thread", renderOutdatedThreadAdjudicationEvidence(manifest.outdated_thread_adjudications.at(-1)));
}

function resolveAdjudicatedThread(argv) {
  const { positional, options } = parseOptions(argv);
  assertReviewThreadResolutionMutationOptions(options, "resolve-adjudicated-thread");
  const threadId = safeMetadataText(options.threadId, 160);
  if (!/^PRRT_[A-Za-z0-9_-]+$/.test(threadId)) throw new Error("resolve-adjudicated-thread requires --thread-id <GitHub review-thread id>.");
  const state = workspaceState(options);
  const { manifest, path: manifestPath } = findManifest(state, positional.join(" "), { preferCurrentWorktree: true });
  assertLaneOwner(manifest, options);
  requireGh("resolve-adjudicated-thread");
  assertSafeBranch(manifest.branch);
  assertWorktreeExists(manifest);
  assertCurrentBranch(manifest);
  assertRegisteredManagedWorktree(manifest, state);
  assertCleanManagedResolutionWorktree(manifest);
  let recoveredResolvedAttempt = false;
  withManifestLock(state, manifest.task_id, () => {
    const locked = readManifest(manifestPath);
    validateManifest(locked, manifestPath); assertLaneOwner(locked, options); claimLaneOwner(locked, options); assertCurrentBranch(locked); assertRegisteredManagedWorktree(locked, state); assertCleanManagedResolutionWorktree(locked);
    reconcileManifest(locked, { refreshPr: true });
    const recovery = recoverAlreadyResolvedOutdatedThreadAttempt(locked, threadId);
    if (recovery) {
      locked.outdated_thread_resolution_outcomes = appendResolutionOutcome(locked.outdated_thread_resolution_outcomes, recovery);
      locked.lane_evidence_packet = buildLaneEvidencePacket(locked, locked.anti_churn_finalization || {});
      appendTaskEvent(locked, "outdated_review_thread_resolution_recovered", `${threadId} ${recovery.expectedHeadSha}`);
      writeManifest(manifestPath, locked);
      recoveredResolvedAttempt = true;
      return;
    }
    const retained = (locked.outdated_thread_adjudications || []).find((entry) => entry?.threadId === threadId && entry?.ready === true);
    if (!retained) throw new Error("No ready retained adjudication exists for the target thread.");
    const mapping = retained.mapping || {};
    if (mapping.outdatedResolutionAuthorization?.status !== "authorized") {
      throw new Error("Outdated review-thread resolution requires retained exact operator authorization for this thread and head.");
    }
    const fresh = buildOutdatedThreadAdjudicationEvidence(locked, { threadId, options: {
      requestFingerprint: mapping.requestFingerprint, requestSummary: mapping.requestSummary, diffSummary: mapping.diffSummary,
      mappedFiles: JSON.stringify(mapping.files || []), verification: mapping.verification, verificationCommand: mapping.verificationCommand,
      verificationExitCode: mapping.verificationExitCode, reviewSummary: mapping.reviewSummary, reviewerId: mapping.reviewerId,
      renamedPaths: JSON.stringify(mapping.renamedPaths || []),
      highRiskAuthorization: mapping.highRiskAuthorization?.evidence,
      outdatedResolutionAuthorization: mapping.outdatedResolutionAuthorization?.evidence,
      nonRequiredChecks: (retained.nonRequiredCheckPolicy?.names || []).join(","), nonRequiredCheckPolicy: retained.nonRequiredCheckPolicy?.policyRef,
    }});
    if (!fresh.ready || fresh.expectedHeadSha !== retained.expectedHeadSha || fresh.repository?.fullName !== retained.repository?.fullName || fresh.mapping?.requestFingerprint !== retained.mapping?.requestFingerprint || fresh.mapping?.highRiskAuthorization?.evidence !== mapping.highRiskAuthorization?.evidence || fresh.mapping?.outdatedResolutionAuthorization?.evidence !== mapping.outdatedResolutionAuthorization?.evidence || fresh.mapping?.highRiskAuthorization?.threadId !== threadId || fresh.mapping?.highRiskAuthorization?.expectedHeadSha !== fresh.expectedHeadSha || fresh.targetRequestFingerprint !== retained.targetRequestFingerprint) {
      throw new Error(`Fresh adjudication is not ready: ${fresh.blockers.join("; ")}`);
    }
    // A second audit immediately before the write is deliberate.  The persisted
    // adjudication is useful provenance, but it must never be treated as a
    // substitute for a mutation-time snapshot of GitHub's mutable state.
    const preMutationAudit = fetchReviewThreadState(locked, githubRepository(locked), fresh.pr.number);
    const preMutationPr = prViewForGates(locked);
    const preMutationHead = prGateHeadState(locked);
    const preMutationBlockers = reviewThreadResolutionPreMutationBlockers(preMutationPr, preMutationHead, preMutationAudit, fresh);
    if (preMutationBlockers.length) {
      throw new Error(`Pre-mutation review-thread audit drifted or is unsafe: ${preMutationBlockers.join("; ")}`);
    }

    const retryRecovery = supersedeLiveUnresolvedResolutionAttempt(locked, "outdated", fresh, preMutationAudit);
    assertNoUnrecoveredResolutionAttempt(locked, "outdated", fresh, retryRecovery?.supersedesAttemptId || null);
    if (retryRecovery) {
      locked.outdated_thread_resolution_outcomes = appendResolutionOutcome(locked.outdated_thread_resolution_outcomes, retryRecovery);
      appendTaskEvent(locked, "outdated_review_thread_resolution_retry_authorized", `${threadId} ${fresh.expectedHeadSha}`);
    }

    const attempt = {
      schemaVersion: 1,
      attemptId: randomUUID(),
      threadId,
      expectedHeadSha: fresh.expectedHeadSha,
      repository: fresh.repository,
      supersedesAttemptId: retryRecovery?.attemptId || null,
      attemptedAt: new Date().toISOString(),
      targetRequestFingerprint: fresh.targetRequestFingerprint,
      mutation: { status: "attempt-recorded", replyPosted: false, metadataOnly: true },
      preMutationAudit: compactReviewThreadAudit(preMutationAudit),
      recoveryPath: "Do not retry blindly. Re-audit the exact PR head and thread state, then resume only through resolve-adjudicated-thread.",
      metadataOnly: true,
      rawPayloadRetained: false,
    };
    locked.outdated_thread_resolution_outcomes = appendResolutionOutcome(locked.outdated_thread_resolution_outcomes, attempt);
    locked.lane_evidence_packet = buildLaneEvidencePacket(locked, locked.anti_churn_finalization || {});
    appendTaskEvent(locked, "outdated_review_thread_resolution_attempted", `${threadId} ${fresh.expectedHeadSha}`);
    writeManifest(manifestPath, locked);

    const mutation = run("gh", ["api", "graphql", "-f", "query=mutation($threadId:ID!){resolveReviewThread(input:{threadId:$threadId}){thread{id isResolved}}}", "-F", `threadId=${threadId}`], { cwd: locked.worktree_path });
    const mutationBlocker = reviewThreadMutationBlocker(mutation, threadId, "review-thread resolution mutation");

    let postResolutionState = null;
    let postAuditFailure = null;
    try {
      postResolutionState = loadPostResolutionExactState(locked, fresh);
    } catch (error) {
      postAuditFailure = postResolutionAuditFailureCategory(error);
    }
    const postResolutionAudit = postResolutionState?.reviewThreads || null;
    const outcome = locked.outdated_thread_resolution_outcomes.find((entry) => entry?.attemptId === attempt.attemptId);
    outcome.completedAt = new Date().toISOString();
    outcome.mutation = {
      status: mutationBlocker ? "ambiguous-or-failed" : "confirmed-by-mutation-response",
      exitCode: mutation.code,
      result: mutationBlocker || "target returned resolved",
      replyPosted: false,
      metadataOnly: true,
    };
    outcome.postResolutionAudit = postResolutionAudit ? compactReviewThreadAudit(postResolutionAudit) : null;
    outcome.postResolutionState = postResolutionState ? compactPostResolutionExactState(postResolutionState) : null;
    outcome.recoveryPath = mutationBlocker || postAuditFailure
      ? "The mutation outcome is not fully proven. Do not retry blindly; inspect this retained attempt, re-audit GitHub, and resume only with a fresh exact-head adjudication."
      : "Re-run verify-pr-gates before an exact-head merge. Any remaining current or outdated thread is a merge hold.";
    if (postAuditFailure) outcome.postAuditFailure = { category: postAuditFailure, metadataOnly: true, rawPayloadRetained: false };

    const target = postResolutionAudit?.threadRefs.find((thread) => thread.id === threadId);
    const postBlockers = [
      ...postResolutionExactStateBlockers(postResolutionState, fresh),
      ...reviewThreadResolutionPostMutationBlockers(postResolutionAudit, target, fresh),
    ];
    if (mutationBlocker) postBlockers.unshift(mutationBlocker);
    if (postAuditFailure) postBlockers.unshift(`Post-resolution thread-aware audit unavailable: ${postAuditFailure}`);
    outcome.status = postBlockers.length ? "needs-recovery" : "resolved";
    outcome.postResolutionHolds = postResolutionAudit ? {
      unresolvedCurrent: postResolutionAudit.unresolvedNonOutdatedCount,
      unresolvedOutdated: postResolutionAudit.unresolvedOutdatedCount,
      pendingRequests: postResolutionAudit.pendingReviewRequestCount,
      mergeReady: Boolean(postResolutionAudit.querySucceeded) && Boolean(postResolutionAudit.reviewThreadComplete) && Boolean(postResolutionAudit.reviewRequestComplete) && postResolutionAudit.unresolvedNonOutdatedCount === 0 && postResolutionAudit.unresolvedOutdatedCount === 0 && postResolutionAudit.pendingReviewRequestCount === 0,
    } : null;
    locked.lane_evidence_packet = buildLaneEvidencePacket(locked, locked.anti_churn_finalization || {});
    appendTaskEvent(locked, outcome.status === "resolved" ? "outdated_review_thread_resolved" : "outdated_review_thread_resolution_needs_recovery", `${threadId} ${fresh.expectedHeadSha}`);
    writeManifest(manifestPath, locked);
    if (postBlockers.length) throw new Error(`Post-resolution thread-aware re-audit is incomplete or unsafe; no merge is permitted: ${postBlockers.join("; ")}`);
  });
  if (recoveredResolvedAttempt) {
    printApplied("resolve-adjudicated-thread", [`thread ${threadId} was already resolved; exact post-interruption recovery evidence recorded without a GitHub mutation`]);
    return;
  }
  printApplied("resolve-adjudicated-thread", [`thread ${threadId} resolved without reply; post-resolution re-audit recorded`]);
}

function recoverAlreadyResolvedOutdatedThreadAttempt(manifest, threadId) {
  const prior = (Array.isArray(manifest.outdated_thread_resolution_outcomes) ? manifest.outdated_thread_resolution_outcomes : [])
    .filter((entry) => entry?.threadId === threadId && (entry?.status === "needs-recovery" || entry?.mutation?.status === "attempt-recorded"))
    .at(-1);
  if (!prior) return null;
  const pr = prViewForGates(manifest);
  const headState = prGateHeadState(manifest);
  const audit = pr?.number ? fetchReviewThreadState(manifest, githubRepository(manifest), pr.number) : null;
  const postAuditPr = prViewForGates(manifest);
  const postAuditHeadState = prGateHeadState(manifest);
  const retained = (Array.isArray(manifest.outdated_thread_adjudications) ? manifest.outdated_thread_adjudications : [])
    .find((entry) => entry?.threadId === threadId && entry?.ready === true && entry?.expectedHeadSha === prior.expectedHeadSha);
  const nonRequiredCheckPolicy = shapeNonRequiredCheckPolicyEvidence({
    nonRequiredChecks: (retained?.nonRequiredCheckPolicy?.names || []).join(","),
    nonRequiredCheckPolicy: retained?.nonRequiredCheckPolicy?.policyRef,
  }, { expectedHeadSha: prior.expectedHeadSha, worktreePath: manifest.worktree_path });
  const checks = normalizeStatusCheckRollup(postAuditPr?.statusCheckRollup, nonRequiredCheckPolicy);
  const target = audit?.threadRefs?.find((thread) => thread.id === threadId);
  const expectedFingerprint = retained?.targetRequestFingerprint;
  const blockers = [];
  if (!postAuditPr || postAuditPr.number !== pr?.number || postAuditPr.baseRefName !== pr?.baseRefName || postAuditPr.baseRefOid !== pr?.baseRefOid || postAuditPr.headRefName !== pr?.headRefName || postAuditPr.headRefOid !== pr?.headRefOid) blockers.push("Interrupted outdated-thread recovery PR state changed during the thread audit");
  if (!prior.expectedHeadSha || prior.expectedHeadSha !== postAuditHeadState.expectedHeadSha || prior.expectedHeadSha !== postAuditPr?.headRefOid || !postAuditHeadState.localMatchesExpected) blockers.push("Interrupted outdated-thread attempt no longer matches the exact PR head");
  if (prior.repository?.fullName !== `${githubRepository(manifest).owner}/${githubRepository(manifest).name}`) blockers.push("Interrupted outdated-thread attempt no longer matches the canonical repository");
  if (!postAuditPr || postAuditPr.state !== "OPEN" || postAuditPr.isDraft || postAuditPr.mergedAt || postAuditPr.reviewDecision === "CHANGES_REQUESTED") blockers.push("Interrupted outdated-thread attempt PR state is no longer safe");
  if (!retained || !retained.targetRequestFingerprint || !prior.attemptId) blockers.push("Interrupted outdated-thread attempt lacks retained exact-head adjudication provenance");
  if (!postAuditPr?.baseRefName || postAuditPr.baseRefName !== retained?.pr?.baseRefName) blockers.push("Interrupted outdated-thread attempt PR base changed before recovery");
  if (!exactGitObjectIdOrNull(postAuditPr?.baseRefOid) || postAuditPr.baseRefOid !== retained?.pr?.baseRefOid) blockers.push("Interrupted outdated-thread attempt PR base commit changed before recovery");
  if (!prior.targetRequestFingerprint || prior.targetRequestFingerprint !== retained?.targetRequestFingerprint) blockers.push("Interrupted outdated-thread attempt fingerprint does not match retained adjudication provenance");
  if (!/^[a-f0-9]{64}$/.test(prior.targetRequestFingerprint || "") || !/^[a-f0-9]{64}$/.test(retained?.targetRequestFingerprint || "")) blockers.push("Interrupted outdated-thread attempt has malformed adjudication provenance");
  if (!audit?.querySucceeded || audit.errorCount || audit.hasNextPage || audit.reviewRequestHasNextPage || audit.pendingReviewRequestCount) blockers.push("Interrupted outdated-thread attempt lacks a complete post-interruption thread audit");
  if (target && !target.isResolved && target.isOutdated && target.commentsComplete && target.requestFingerprint) return null;
  if (!target?.isOutdated || !target.commentsComplete || !target.requestFingerprint) blockers.push("Interrupted outdated-thread target is not proven resolved by the live thread audit");
  if (expectedFingerprint && target?.requestFingerprint !== expectedFingerprint) blockers.push("Interrupted outdated-thread target fingerprint changed before recovery");
  blockers.push(...nonTargetThreadPostMutationBlockers(audit, retained, threadId));
  if (checks.total === 0 || checks.pending.length || checks.failing.length) blockers.push("Interrupted outdated-thread attempt checks are not terminal-successful");
  blockers.push(...nonRequiredCheckPolicy.blockers);
  if (blockers.length) throw new Error(`A prior outdated review-thread resolution attempt is unrecovered; do not retry blindly: ${blockers.join("; ")}`);
  const completedAt = new Date().toISOString();
  return {
    schemaVersion: 1,
    attemptId: randomUUID(),
    supersedesAttemptId: prior.attemptId,
    threadId,
    expectedHeadSha: prior.expectedHeadSha,
    repository: prior.repository,
    targetRequestFingerprint: target.requestFingerprint,
    attemptedAt: completedAt,
    completedAt,
    status: "resolved",
    mutation: { status: "confirmed-by-post-audit-recovery", exitCode: null, result: "live target already resolved after interrupted attempt", replyPosted: false, metadataOnly: true },
    postResolutionAudit: compactReviewThreadAudit(audit),
    postResolutionHolds: reviewThreadResolutionHolds(audit),
    recoveryPath: "Recovered from exact live thread evidence without retrying a GitHub mutation. Re-run verify-pr-gates before merge.",
    metadataOnly: true,
    rawPayloadRetained: false,
  };
}

function adjudicateCurrentThread(argv) {
  const { positional, options } = parseOptions(argv);
  assertBareApplyOption(options, "adjudicate-current-thread");
  if (options.summaryJson && options.apply) throw new Error("adjudicate-current-thread --summary-json is only supported without --apply.");
  const threadId = safeMetadataText(options.threadId, 160);
  if (!/^PRRT_[A-Za-z0-9_-]+$/.test(threadId)) throw new Error("adjudicate-current-thread requires --thread-id <GitHub review-thread id>.");
  const state = workspaceState(options);
  const { manifest, path: manifestPath } = findManifest(state, positional.join(" "), { preferCurrentWorktree: true });
  assertLaneOwner(manifest, options); requireGh("adjudicate-current-thread"); assertSafeBranch(manifest.branch); assertWorktreeExists(manifest); assertCurrentBranch(manifest); assertRegisteredManagedWorktree(manifest, state);
  assertCleanManagedResolutionWorktree(manifest);
  reconcileManifest(manifest, { refreshPr: true });
  const packet = buildCurrentThreadAdjudicationEvidence(manifest, { options, threadId });
  if (options.summaryJson) return console.log(JSON.stringify(packet, null, 2));
  if (!packet.ready) {
    printBlocked("adjudicate-current-thread", renderCurrentThreadAdjudicationEvidence(packet));
    throw new Error(`Current review-thread adjudication is not ready: ${packet.blockers.join("; ")}`);
  }
  if (!options.apply) {
    printPlan("adjudicate-current-thread", renderCurrentThreadAdjudicationEvidence(packet));
    console.log("Add --apply to record the bounded evidence. This command never resolves or replies to a GitHub review thread.");
    return;
  }
  withManifestLock(state, manifest.task_id, () => {
    const locked = readManifest(manifestPath);
    validateManifest(locked, manifestPath); assertLaneOwner(locked, options); claimLaneOwner(locked, options); assertCurrentBranch(locked); assertRegisteredManagedWorktree(locked, state); assertCleanManagedResolutionWorktree(locked);
    reconcileManifest(locked, { refreshPr: true });
    const lockedPacket = buildCurrentThreadAdjudicationEvidence(locked, { options, threadId });
    if (!lockedPacket.ready) {
      printBlocked("adjudicate-current-thread", renderCurrentThreadAdjudicationEvidence(lockedPacket));
      throw new Error(`Current review-thread adjudication changed under lock: ${lockedPacket.blockers.join("; ")}`);
    }
    const prior = Array.isArray(locked.current_thread_adjudications) ? locked.current_thread_adjudications : [];
    locked.current_thread_adjudications = retainThreadAdjudicationsForRecovery(
      [...prior.filter((entry) => entry?.threadId !== threadId), lockedPacket],
      [
        ...(Array.isArray(locked.current_thread_resolution_outcomes) ? locked.current_thread_resolution_outcomes : []),
        ...(Array.isArray(locked.outdated_thread_resolution_outcomes) ? locked.outdated_thread_resolution_outcomes : []),
      ],
    );
    appendAuthorityDecision(locked, lockedPacket.authorityDecision);
    locked.lane_evidence_packet = buildLaneEvidencePacket(locked, locked.anti_churn_finalization || {});
    locked.updated_at = lockedPacket.checkedAt;
    appendTaskEvent(locked, "current_review_thread_adjudicated", `${threadId} ${lockedPacket.expectedHeadSha}`);
    writeManifest(manifestPath, locked);
    Object.assign(manifest, locked);
  });
  printApplied("adjudicate-current-thread", renderCurrentThreadAdjudicationEvidence(manifest.current_thread_adjudications.at(-1)));
}

function resolveAdjudicatedCurrentThread(argv) {
  const { positional, options } = parseOptions(argv);
  assertReviewThreadResolutionMutationOptions(options, "resolve-adjudicated-current-thread");
  const threadId = safeMetadataText(options.threadId, 160);
  if (!/^PRRT_[A-Za-z0-9_-]+$/.test(threadId)) throw new Error("resolve-adjudicated-current-thread requires --thread-id <GitHub review-thread id>.");
  const state = workspaceState(options);
  const { manifest, path: manifestPath } = findManifest(state, positional.join(" "), { preferCurrentWorktree: true });
  assertLaneOwner(manifest, options); requireGh("resolve-adjudicated-current-thread"); assertSafeBranch(manifest.branch); assertWorktreeExists(manifest); assertCurrentBranch(manifest); assertRegisteredManagedWorktree(manifest, state);
  assertCleanManagedResolutionWorktree(manifest);
  let recoveredResolvedAttempt = false;
  withManifestLock(state, manifest.task_id, () => {
    const locked = readManifest(manifestPath);
    validateManifest(locked, manifestPath); assertLaneOwner(locked, options); claimLaneOwner(locked, options); assertCurrentBranch(locked); assertRegisteredManagedWorktree(locked, state); assertCleanManagedResolutionWorktree(locked);
    reconcileManifest(locked, { refreshPr: true });
    const recovery = recoverAlreadyResolvedCurrentThreadAttempt(locked, threadId);
    if (recovery) {
      locked.current_thread_resolution_outcomes = appendResolutionOutcome(locked.current_thread_resolution_outcomes, recovery);
      locked.lane_evidence_packet = buildLaneEvidencePacket(locked, locked.anti_churn_finalization || {});
      appendTaskEvent(locked, "current_review_thread_resolution_recovered", `${threadId} ${recovery.expectedHeadSha}`);
      writeManifest(manifestPath, locked);
      recoveredResolvedAttempt = true;
      return;
    }
    const retained = (locked.current_thread_adjudications || []).find((entry) => entry?.threadId === threadId && entry?.ready === true);
    if (!retained) throw new Error("No ready retained current-thread adjudication exists for the target thread.");
    const mapping = retained.mapping || {};
    const fresh = buildCurrentThreadAdjudicationEvidence(locked, { threadId, options: {
      requestFingerprint: mapping.requestFingerprint, requestSummary: mapping.requestSummary, diffSummary: mapping.diffSummary,
      mappedFiles: JSON.stringify(mapping.files || []), verification: mapping.verification, verificationCommand: mapping.verificationCommand,
      verificationExitCode: mapping.verificationExitCode, reviewSummary: mapping.reviewSummary, reviewerId: mapping.reviewerId,
      highRiskAuthorization: mapping.highRiskAuthorization?.evidence,
      nonRequiredChecks: (retained.nonRequiredCheckPolicy?.names || []).join(","), nonRequiredCheckPolicy: retained.nonRequiredCheckPolicy?.policyRef,
    }});
    if (!fresh.ready || fresh.expectedHeadSha !== retained.expectedHeadSha || fresh.repository?.fullName !== retained.repository?.fullName || fresh.pr?.baseRefName !== retained.pr?.baseRefName || fresh.pr?.baseRefOid !== retained.pr?.baseRefOid || fresh.mapping?.requestFingerprint !== retained.mapping?.requestFingerprint || fresh.mapping?.highRiskAuthorization?.evidence !== mapping.highRiskAuthorization?.evidence || fresh.mapping?.highRiskAuthorization?.threadId !== threadId || fresh.mapping?.highRiskAuthorization?.expectedHeadSha !== fresh.expectedHeadSha || fresh.targetRequestFingerprint !== retained.targetRequestFingerprint) {
      throw new Error(`Fresh current-thread adjudication is not ready: ${fresh.blockers.join("; ")}`);
    }
    const preMutationAudit = fetchReviewThreadState(locked, githubRepository(locked), fresh.pr.number);
    const preMutationPr = prViewForGates(locked);
    const preMutationHead = prGateHeadState(locked);
    const preMutationBlockers = currentThreadResolutionPreMutationBlockers(preMutationPr, preMutationHead, preMutationAudit, fresh);
    if (preMutationBlockers.length) throw new Error(`Pre-mutation review-thread audit drifted or is unsafe: ${preMutationBlockers.join("; ")}`);
    const retryRecovery = supersedeLiveUnresolvedResolutionAttempt(locked, "current", fresh, preMutationAudit);
    assertNoUnrecoveredResolutionAttempt(locked, "current", fresh, retryRecovery?.supersedesAttemptId || null);
    if (retryRecovery) {
      locked.current_thread_resolution_outcomes = appendResolutionOutcome(locked.current_thread_resolution_outcomes, retryRecovery);
      appendTaskEvent(locked, "current_review_thread_resolution_retry_authorized", `${threadId} ${fresh.expectedHeadSha}`);
    }
    const attempt = {
      schemaVersion: 1, attemptId: randomUUID(), threadId, expectedHeadSha: fresh.expectedHeadSha, repository: fresh.repository, supersedesAttemptId: retryRecovery?.attemptId || null,
      attemptedAt: new Date().toISOString(), targetRequestFingerprint: fresh.targetRequestFingerprint, mutation: { status: "attempt-recorded", replyPosted: false, metadataOnly: true },
      preMutationAudit: compactReviewThreadAudit(preMutationAudit),
      recoveryPath: "Do not retry blindly. Re-audit the exact PR head and thread state, then resume only through resolve-adjudicated-current-thread.",
      metadataOnly: true, rawPayloadRetained: false,
    };
    locked.current_thread_resolution_outcomes = appendResolutionOutcome(locked.current_thread_resolution_outcomes, attempt);
    locked.lane_evidence_packet = buildLaneEvidencePacket(locked, locked.anti_churn_finalization || {});
    appendTaskEvent(locked, "current_review_thread_resolution_attempted", `${threadId} ${fresh.expectedHeadSha}`);
    writeManifest(manifestPath, locked);
    const mutation = run("gh", ["api", "graphql", "-f", "query=mutation($threadId:ID!){resolveReviewThread(input:{threadId:$threadId}){thread{id isResolved}}}", "-F", `threadId=${threadId}`], { cwd: locked.worktree_path });
    const mutationBlocker = reviewThreadMutationBlocker(mutation, threadId, "current review-thread resolution mutation");
    let postResolutionState = null;
    let postAuditFailure = null;
    try { postResolutionState = loadPostResolutionExactState(locked, fresh); } catch (error) { postAuditFailure = postResolutionAuditFailureCategory(error); }
    const postResolutionAudit = postResolutionState?.reviewThreads || null;
    const outcome = locked.current_thread_resolution_outcomes.find((entry) => entry?.attemptId === attempt.attemptId);
    outcome.completedAt = new Date().toISOString();
    outcome.mutation = { status: mutationBlocker ? "ambiguous-or-failed" : "confirmed-by-mutation-response", exitCode: mutation.code, result: mutationBlocker || "target returned resolved", replyPosted: false, metadataOnly: true };
    outcome.postResolutionAudit = postResolutionAudit ? compactReviewThreadAudit(postResolutionAudit) : null;
    outcome.postResolutionState = postResolutionState ? compactPostResolutionExactState(postResolutionState) : null;
    if (postAuditFailure) outcome.postAuditFailure = { category: postAuditFailure, metadataOnly: true, rawPayloadRetained: false };
    const target = postResolutionAudit?.threadRefs.find((thread) => thread.id === threadId);
    const postBlockers = [
      ...postResolutionExactStateBlockers(postResolutionState, fresh),
      ...currentThreadResolutionPostMutationBlockers(postResolutionAudit, target, fresh),
    ];
    if (mutationBlocker) postBlockers.unshift(mutationBlocker);
    if (postAuditFailure) postBlockers.unshift(`Post-resolution thread-aware audit unavailable: ${postAuditFailure}`);
    outcome.status = postBlockers.length ? "needs-recovery" : "resolved";
    outcome.postResolutionHolds = reviewThreadResolutionHolds(postResolutionAudit);
    outcome.recoveryPath = postBlockers.length
      ? "The mutation outcome is not fully proven. Do not retry blindly; inspect this retained attempt, re-audit GitHub, and resume only with a fresh exact-head current-thread adjudication."
      : "Re-run verify-pr-gates before an exact-head merge. Any remaining current or outdated thread is a merge hold.";
    locked.lane_evidence_packet = buildLaneEvidencePacket(locked, locked.anti_churn_finalization || {});
    appendTaskEvent(locked, outcome.status === "resolved" ? "current_review_thread_resolved" : "current_review_thread_resolution_needs_recovery", `${threadId} ${fresh.expectedHeadSha}`);
    writeManifest(manifestPath, locked);
    if (postBlockers.length) throw new Error(`Post-resolution thread-aware re-audit is incomplete or unsafe; no merge is permitted: ${postBlockers.join("; ")}`);
  });
  if (recoveredResolvedAttempt) {
    printApplied("resolve-adjudicated-current-thread", [`thread ${threadId} was already resolved; exact post-interruption recovery evidence recorded without a GitHub mutation`]);
    return;
  }
  printApplied("resolve-adjudicated-current-thread", [`thread ${threadId} resolved without reply; post-resolution re-audit recorded`]);
}

function recoverAlreadyResolvedCurrentThreadAttempt(manifest, threadId) {
  const prior = (Array.isArray(manifest.current_thread_resolution_outcomes) ? manifest.current_thread_resolution_outcomes : [])
    .filter((entry) => entry?.threadId === threadId && (entry?.status === "needs-recovery" || entry?.mutation?.status === "attempt-recorded"))
    .at(-1);
  if (!prior) return null;
  const pr = prViewForGates(manifest);
  const headState = prGateHeadState(manifest);
  const audit = pr?.number ? fetchReviewThreadState(manifest, githubRepository(manifest), pr.number) : null;
  const postAuditPr = prViewForGates(manifest);
  const postAuditHeadState = prGateHeadState(manifest);
  const retained = (Array.isArray(manifest.current_thread_adjudications) ? manifest.current_thread_adjudications : [])
    .find((entry) => entry?.threadId === threadId && entry?.ready === true && entry?.expectedHeadSha === prior.expectedHeadSha);
  const nonRequiredCheckPolicy = shapeNonRequiredCheckPolicyEvidence({
    nonRequiredChecks: (retained?.nonRequiredCheckPolicy?.names || []).join(","),
    nonRequiredCheckPolicy: retained?.nonRequiredCheckPolicy?.policyRef,
  }, { expectedHeadSha: prior.expectedHeadSha, worktreePath: manifest.worktree_path });
  const checks = normalizeStatusCheckRollup(postAuditPr?.statusCheckRollup, nonRequiredCheckPolicy);
  const target = audit?.threadRefs?.find((thread) => thread.id === threadId);
  // A still-unresolved mutation attempt is not a recovery case. Leave it for a
  // fresh, later exact-head adjudication to supersede before any retry.
  if (!target?.isResolved) return null;
  const blockers = [];
  if (!postAuditPr || postAuditPr.number !== pr?.number || postAuditPr.baseRefName !== pr?.baseRefName || postAuditPr.baseRefOid !== pr?.baseRefOid || postAuditPr.headRefName !== pr?.headRefName || postAuditPr.headRefOid !== pr?.headRefOid) blockers.push("Interrupted current-thread recovery PR state changed during the thread audit");
  if (!prior.expectedHeadSha || prior.expectedHeadSha !== postAuditHeadState.expectedHeadSha || prior.expectedHeadSha !== postAuditPr?.headRefOid || !postAuditHeadState.localMatchesExpected) blockers.push("Interrupted current-thread attempt no longer matches the exact PR head");
  if (prior.repository?.fullName !== `${githubRepository(manifest).owner}/${githubRepository(manifest).name}`) blockers.push("Interrupted current-thread attempt no longer matches the canonical repository");
  if (!postAuditPr || postAuditPr.state !== "OPEN" || postAuditPr.isDraft || postAuditPr.mergedAt || postAuditPr.reviewDecision === "CHANGES_REQUESTED") blockers.push("Interrupted current-thread attempt PR state is no longer safe");
  if (!postAuditPr?.baseRefName || postAuditPr.baseRefName !== retained?.pr?.baseRefName) blockers.push("Interrupted current-thread attempt PR base changed before recovery");
  if (!retained || !retained.targetRequestFingerprint || !prior.attemptId) blockers.push("Interrupted current-thread attempt lacks retained exact-head adjudication provenance");
  if (!exactGitObjectIdOrNull(postAuditPr?.baseRefOid) || postAuditPr.baseRefOid !== retained?.pr?.baseRefOid) blockers.push("Interrupted current-thread attempt PR base commit changed before recovery");
  if (!prior.targetRequestFingerprint || prior.targetRequestFingerprint !== retained?.targetRequestFingerprint) blockers.push("Interrupted current-thread attempt fingerprint does not match retained adjudication provenance");
  if (!/^[a-f0-9]{64}$/.test(prior.targetRequestFingerprint || "") || !/^[a-f0-9]{64}$/.test(retained?.targetRequestFingerprint || "")) blockers.push("Interrupted current-thread attempt has malformed adjudication provenance");
  if (!audit?.querySucceeded || audit.errorCount || audit.hasNextPage || audit.reviewRequestHasNextPage || audit.pendingReviewRequestCount) blockers.push("Interrupted current-thread attempt lacks a complete post-interruption thread audit");
  if (!target || !target.isResolved || !target.commentsComplete || !target.requestFingerprint) blockers.push("Interrupted current-thread target is not proven resolved by the live thread audit");
  if (target?.isOutdated) blockers.push("Interrupted current-thread target became outdated before recovery");
  if (target?.requestFingerprint !== retained?.targetRequestFingerprint) blockers.push("Interrupted current-thread target fingerprint changed before recovery");
  blockers.push(...nonTargetThreadPostMutationBlockers(audit, retained, threadId));
  if (checks.total === 0 || checks.pending.length || checks.failing.length) blockers.push("Interrupted current-thread attempt checks are not terminal-successful");
  blockers.push(...nonRequiredCheckPolicy.blockers);
  if (blockers.length) throw new Error(`A prior current review-thread resolution attempt is unrecovered; do not retry blindly: ${blockers.join("; ")}`);
  const completedAt = new Date().toISOString();
  return {
    schemaVersion: 1,
    attemptId: randomUUID(),
    supersedesAttemptId: prior.attemptId,
    threadId,
    expectedHeadSha: prior.expectedHeadSha,
    repository: prior.repository,
    targetRequestFingerprint: target.requestFingerprint,
    attemptedAt: completedAt,
    completedAt,
    status: "resolved",
    mutation: { status: "confirmed-by-post-audit-recovery", exitCode: null, result: "live target already resolved after interrupted attempt", replyPosted: false, metadataOnly: true },
    postResolutionAudit: compactReviewThreadAudit(audit),
    postResolutionHolds: reviewThreadResolutionHolds(audit),
    recoveryPath: "Recovered from exact live thread evidence without retrying a GitHub mutation. Re-run verify-pr-gates before merge.",
    metadataOnly: true,
    rawPayloadRetained: false,
  };
}

function currentThreadResolutionPreMutationBlockers(pr, headState, audit, fresh) {
  const blockers = [];
  if (!pr || pr.state !== "OPEN" || pr.isDraft || pr.mergedAt) blockers.push("PR is no longer open and non-draft immediately before the thread mutation");
  if (!pr?.baseRefName || pr.baseRefName !== fresh.pr?.baseRefName) blockers.push("PR base drifted immediately before the thread mutation");
  if (!exactGitObjectIdOrNull(pr?.baseRefOid) || pr.baseRefOid !== fresh.pr?.baseRefOid) blockers.push("PR base commit drifted immediately before the thread mutation");
  if (!pr?.headRefOid || pr.headRefOid !== fresh.expectedHeadSha) blockers.push("PR head drifted immediately before the thread mutation");
  if (!headState.localMatchesExpected || headState.localHeadSha !== fresh.expectedHeadSha) blockers.push("Local worktree head drifted immediately before the thread mutation");
  if (pr?.reviewDecision === "CHANGES_REQUESTED") blockers.push(`PR reviewDecision is ${pr.reviewDecision} immediately before the thread mutation`);
  const checks = normalizeStatusCheckRollup(pr?.statusCheckRollup, fresh.nonRequiredCheckPolicy);
  if (checks.total === 0) blockers.push("No status checks reported for exact head immediately before the thread mutation");
  if (checks.pending.length) blockers.push(`Pending checks immediately before the thread mutation: ${checks.pending.map((check) => check.name).join(", ")}`);
  if (checks.failing.length) blockers.push(`Failed or ambiguous checks immediately before the thread mutation: ${checks.failing.map((check) => check.name).join(", ")}`);
  blockers.push(...(fresh.nonRequiredCheckPolicy?.blockers || []));
  if (!audit?.querySucceeded || audit.errorCount || audit.hasNextPage || audit.reviewRequestHasNextPage) blockers.push("Thread-aware audit is incomplete immediately before the thread mutation");
  if (audit?.pendingReviewRequestCount) blockers.push(`Pending review requests immediately before the thread mutation: ${audit.pendingReviewRequestCount}`);
  if (audit?.auditFingerprint !== fresh.reviewThreads?.auditFingerprint) blockers.push("Thread-aware audit changed after the fresh adjudication and before the thread mutation");
  const target = audit?.threadRefs?.find((thread) => thread.id === fresh.threadId);
  if (!target || target.isResolved || target.isOutdated || !target.commentsComplete || target.requestFingerprint !== fresh.targetRequestFingerprint) blockers.push("Target review thread changed after the fresh adjudication and before the thread mutation");
  return blockers;
}

function currentThreadResolutionPostMutationBlockers(audit, target, fresh) {
  const blockers = [];
  if (!audit?.querySucceeded || audit.errorCount || audit.hasNextPage || audit.reviewRequestHasNextPage) blockers.push("Post-resolution thread-aware audit is incomplete");
  if (audit?.pendingReviewRequestCount) blockers.push(`Pending review requests after resolution: ${audit.pendingReviewRequestCount}`);
  const preExistingCurrentIds = new Set((fresh.reviewThreads?.threadRefs || [])
    .filter((thread) => !thread?.isResolved && !thread?.isOutdated)
    .map((thread) => thread.id)
    .filter(Boolean));
  const unexpectedCurrent = (audit?.threadRefs || []).filter((thread) =>
    !thread?.isResolved && !thread?.isOutdated && !preExistingCurrentIds.has(thread.id),
  );
  if (unexpectedCurrent.length) {
    blockers.push(`New unresolved current review threads after resolution: ${unexpectedCurrent.map((thread) => thread.url || thread.id).join(", ")}`);
  }
  blockers.push(...nonTargetThreadPostMutationBlockers(audit, fresh, fresh?.threadId));
  blockers.push(...nonTargetThreadPostMutationBlockers(audit, fresh, fresh?.threadId));
  if (!target?.isResolved) blockers.push("Target review thread was not confirmed resolved by the post-resolution audit");
  if (target?.isOutdated) blockers.push("Target review thread became outdated during resolution and requires recovery");
  if (target?.requestFingerprint !== fresh?.targetRequestFingerprint) blockers.push("Target review thread changed during resolution and requires recovery");
  return blockers;
}

function nonTargetThreadPostMutationBlockers(audit, fresh, targetThreadId) {
  const blockers = [];
  const fingerprint = (thread) => JSON.stringify({
    id: thread?.id || null,
    isResolved: thread?.isResolved === true,
    isOutdated: thread?.isOutdated === true,
    path: thread?.path || null,
    url: thread?.url || null,
    commentsComplete: thread?.commentsComplete === true,
    requestFingerprint: thread?.requestFingerprint || null,
  });
  const pre = new Map((fresh?.reviewThreads?.threadRefs || [])
    .filter((thread) => thread?.id && thread.id !== targetThreadId)
    .map((thread) => [thread.id, fingerprint(thread)]));
  const post = new Map((audit?.threadRefs || [])
    .filter((thread) => thread?.id && thread.id !== targetThreadId)
    .map((thread) => [thread.id, fingerprint(thread)]));
  const changed = [...new Set([...pre.keys(), ...post.keys()])]
    .filter((id) => pre.get(id) !== post.get(id));
  if (changed.length) blockers.push(`Pre-existing non-target review threads changed during resolution: ${changed.join(", ")}`);
  return blockers;
}

function loadPostResolutionExactState(manifest, fresh) {
  const repositoryRef = githubRepository(manifest);
  const repository = { owner: repositoryRef.owner, name: repositoryRef.name, fullName: `${repositoryRef.owner}/${repositoryRef.name}` };
  const preAuditPr = prViewForGates(manifest);
  if (!preAuditPr) throw new Error("Could not reload PR state after review-thread resolution mutation.");
  const preAuditHeadState = prGateHeadState(manifest);
  const reviewThreads = fetchReviewThreadState(manifest, repositoryRef, fresh.pr.number);
  // Review-thread hydration can span multiple provider calls. Re-read mutable
  // PR and check state after it completes so the resolution cannot be recorded
  // against a head/check snapshot that changed during the audit.
  const pr = prViewForGates(manifest);
  if (!pr) throw new Error("Could not reload PR state after post-resolution thread audit.");
  const headState = prGateHeadState(manifest);
  const checks = normalizeStatusCheckRollup(pr.statusCheckRollup, fresh.nonRequiredCheckPolicy);
  return { repository, pr, headState, reviewThreads, checks, preAuditPr, preAuditHeadState };
}

function graphqlErrorsOrThrow(parsed, label) {
  if (parsed && typeof parsed === "object" && Object.hasOwn(parsed, "errors") && !Array.isArray(parsed.errors)) {
    throw new Error(`${label} returned a malformed errors field`);
  }
  return Array.isArray(parsed?.errors) ? parsed.errors : [];
}

function graphqlErrorCategories(errors) {
  const knownCategories = new Set([
    "BAD_USER_INPUT",
    "FORBIDDEN",
    "INTERNAL",
    "NOT_FOUND",
    "RATE_LIMITED",
    "SERVICE_UNAVAILABLE",
    "UNAUTHORIZED",
    "VALIDATION",
  ]);
  const categories = new Set();
  for (const error of Array.isArray(errors) ? errors : []) {
    const candidate = typeof error?.type === "string"
      ? error.type
      : typeof error?.extensions?.code === "string"
        ? error.extensions.code
        : "";
    const normalized = candidate.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_");
    categories.add(knownCategories.has(normalized) ? normalized.toLowerCase() : "unspecified");
  }
  return [...categories].sort().slice(0, 8);
}

function postResolutionAuditFailureCategory(error) {
  const message = String(error?.message || "").toLowerCase();
  if (message.includes("malformed errors field")) return "graphql-errors-malformed";
  if (message.includes("invalid json")) return "github-response-invalid-json";
  if (message.includes("pagination")) return "graphql-pagination-incomplete";
  if (message.includes("github cli")) return "github-cli-unavailable";
  return "post-resolution-audit-unavailable";
}

function reviewThreadMutationBlocker(mutation, threadId, label) {
  // Mutation stdout/stderr can contain provider-supplied text. Retain only a
  // bounded category and exit code in the outcome record; raw provider text is
  // neither needed for recovery nor safe to persist in lane evidence.
  if (mutation.code !== 0) return "GitHub resolution mutation did not return a confirmed process result";
  try {
    const parsed = parseGhJson(mutation.stdout, label);
    const errors = graphqlErrorsOrThrow(parsed, label);
    const resolved = parsed?.data?.resolveReviewThread?.thread;
    if (errors.length) return "GitHub resolution mutation returned GraphQL errors";
    if (!resolved || resolved.id !== threadId || resolved.isResolved !== true) {
      return "GitHub resolution mutation returned an incomplete or mismatched target result";
    }
    return "";
  } catch {
    return "GitHub resolution mutation did not return a valid confirmed response";
  }
}

function postResolutionExactStateBlockers(post, fresh = {}) {
  const blockers = [];
  if (!post) return ["Post-resolution exact PR state re-audit is unavailable"];
  if (post.repository?.fullName !== fresh.repository?.fullName) blockers.push("Repository changed during review-thread resolution and requires recovery");
  if (!post.pr || post.pr.number !== fresh.pr?.number || post.pr.state !== "OPEN" || post.pr.isDraft || post.pr.mergedAt) blockers.push("PR is no longer the exact open non-draft PR after review-thread resolution");
  if (!post.pr?.baseRefName || post.pr.baseRefName !== fresh.pr?.baseRefName) blockers.push("PR base changed during review-thread resolution and requires recovery");
  if (!exactGitObjectIdOrNull(post.pr?.baseRefOid) || post.pr.baseRefOid !== fresh.pr?.baseRefOid) blockers.push("PR base commit changed during review-thread resolution and requires recovery");
  if (!post.pr?.headRefOid || post.pr.headRefOid !== fresh.expectedHeadSha) blockers.push("PR head changed during review-thread resolution and requires recovery");
  if (post.preAuditPr?.headRefOid !== post.pr?.headRefOid || post.preAuditPr?.baseRefOid !== post.pr?.baseRefOid || post.preAuditPr?.baseRefName !== post.pr?.baseRefName) blockers.push("PR state changed while collecting the post-resolution thread audit and requires recovery");
  if (!post.preAuditHeadState?.localMatchesExpected || post.preAuditHeadState?.localHeadSha !== post.headState?.localHeadSha) blockers.push("Local worktree head changed while collecting the post-resolution thread audit and requires recovery");
  if (!post.headState?.localMatchesExpected || post.headState?.localHeadSha !== fresh.expectedHeadSha) blockers.push("Local worktree head changed during review-thread resolution and requires recovery");
  if (post.pr?.reviewDecision === "CHANGES_REQUESTED") blockers.push(`PR reviewDecision is ${post.pr.reviewDecision} after review-thread resolution`);
  if (post.checks?.total === 0) blockers.push("No status checks reported for exact head after review-thread resolution");
  if (post.checks?.pending?.length) blockers.push(`Pending checks after review-thread resolution: ${post.checks.pending.map((check) => check.name).join(", ")}`);
  if (post.checks?.failing?.length) blockers.push(`Failed or ambiguous checks after review-thread resolution: ${post.checks.failing.map((check) => check.name).join(", ")}`);
  blockers.push(...(fresh.nonRequiredCheckPolicy?.blockers || []));
  return blockers;
}

function compactPostResolutionExactState(post = {}) {
  return {
    repository: post.repository?.fullName || null,
    pr: {
      number: post.pr?.number || null,
      state: post.pr?.state || null,
      baseRefName: post.pr?.baseRefName || null,
      baseRefOid: exactGitObjectIdOrNull(post.pr?.baseRefOid),
      headRefOid: post.pr?.headRefOid || null,
      reviewDecision: post.pr?.reviewDecision || null,
    },
    localHeadSha: post.headState?.localHeadSha || null,
    expectedHeadSha: post.headState?.expectedHeadSha || null,
    checks: compactStatusCheckEvidence(post.checks),
    metadataOnly: true,
    rawPayloadRetained: false,
  };
}

function reviewThreadResolutionHolds(audit) {
  if (!audit) return null;
  const unresolvedCurrentThreadIds = (audit.threadRefs || []).filter((thread) => !thread.isResolved && !thread.isOutdated).map((thread) => thread.id).filter(Boolean);
  const unresolvedOutdatedThreadIds = (audit.threadRefs || []).filter((thread) => !thread.isResolved && thread.isOutdated).map((thread) => thread.id).filter(Boolean);
  return {
    unresolvedCurrent: audit.unresolvedNonOutdatedCount,
    unresolvedOutdated: audit.unresolvedOutdatedCount,
    unresolvedCurrentThreadIds,
    unresolvedOutdatedThreadIds,
    pendingRequests: audit.pendingReviewRequestCount,
    mergeReady: Boolean(audit.querySucceeded) && Boolean(audit.reviewThreadComplete) && Boolean(audit.reviewRequestComplete) && audit.unresolvedNonOutdatedCount === 0 && audit.unresolvedOutdatedCount === 0 && audit.pendingReviewRequestCount === 0,
  };
}

function appendResolutionOutcome(existing, attempt) {
  return boundedResolutionOutcomes([...(Array.isArray(existing) ? existing : []), attempt]);
}

function retainedResolutionOutcomes(outcomes) {
  return boundedResolutionOutcomes(outcomes);
}

function retainThreadAdjudicationsForRecovery(entries, resolutionOutcomes) {
  const required = new Set((Array.isArray(resolutionOutcomes) ? resolutionOutcomes : [])
    .filter((outcome) => outcome?.threadId && outcome?.expectedHeadSha && (outcome?.status === "needs-recovery" || outcome?.mutation?.status === "attempt-recorded"))
    .map((outcome) => `${outcome.threadId}\u0000${outcome.expectedHeadSha}`));
  const protectedEntries = entries.filter((entry) => required.has(`${entry?.threadId}\u0000${entry?.expectedHeadSha}`));
  const newestUnprotected = entries.filter((entry) => !required.has(`${entry?.threadId}\u0000${entry?.expectedHeadSha}`)).slice(-20);
  return [...protectedEntries, ...newestUnprotected];
}

function isResolutionRetentionOverflow(entry) {
  return entry?.retention?.status === resolutionRetentionOverflowStatus;
}

function boundedResolutionOutcomes(outcomes) {
  const entries = Array.isArray(outcomes) ? outcomes : [];
  const existingOverflow = entries.find(isResolutionRetentionOverflow) || null;
  const attempts = entries.filter((entry) => !isResolutionRetentionOverflow(entry));
  const recovery = attempts.filter((entry) => isUnrecoveredResolutionAttemptSameKind(attempts, entry));
  const terminal = attempts.filter((entry) => !recovery.includes(entry));
  // One current recovery record plus nineteen terminal records is sufficient
  // for normal operation. Once more than one recovery record would need to be
  // retained, discard the ambiguous history behind a durable fail-closed
  // marker. The marker intentionally cannot be superseded by a later thread
  // mutation: a later outcome cannot prove which discarded attempt it covers.
  if (!existingOverflow && recovery.length <= 1) {
    return [...recovery, ...terminal.slice(-(maxResolutionOutcomeRetention - recovery.length))];
  }
  const retainedRecovery = recovery.slice(-1);
  const retainedTerminal = terminal.slice(-(maxResolutionOutcomeRetention - 1 - retainedRecovery.length));
  const priorDiscarded = Number.isSafeInteger(existingOverflow?.retention?.discardedUnrecoveredCount)
    ? existingOverflow.retention.discardedUnrecoveredCount
    : 0;
  return [
    {
      schemaVersion: 1,
      status: "needs-recovery",
      threadId: "retention-overflow",
      mutation: { status: "retention-limit-exceeded", metadataOnly: true },
      retention: {
        status: resolutionRetentionOverflowStatus,
        discardedUnrecoveredCount: priorDiscarded + Math.max(0, recovery.length - retainedRecovery.length),
        retainedAt: new Date().toISOString(),
      },
      recoveryPath: "Resolution recovery history exceeded its bounded retention limit. The discarded interrupted attempts cannot be proven recovered; preserve this fail-closed hold for operator investigation.",
      metadataOnly: true,
    },
    ...retainedTerminal,
    ...retainedRecovery,
  ];
}

function isHighRiskReviewThreadPath(path) {
  const value = String(path || "").toLowerCase();
  if (value === "agents.md" || value.endsWith("/agents.md")) return true;
  return value === "docs/workflows/end-to-end-lane-runner.md"
    || value.startsWith(".github/")
    || value.startsWith("scripts/codex-workspace")
    // These are documented stop-line surfaces; classify conservatively rather
    // than relying on a short list of file-name spellings.
    || ["credential", "secret", "migration", "provider", "schema", "policy", "authority", "deployment", "release"].some((term) => value.includes(term));
}

function supersedeLiveUnresolvedResolutionAttempt(manifest, kind, fresh, audit) {
  const key = kind === "current" ? "current_thread_resolution_outcomes" : "outdated_thread_resolution_outcomes";
  const ownPrior = (Array.isArray(manifest?.[key]) ? manifest[key] : [])
    .filter((entry) => entry?.threadId === fresh.threadId && (entry?.status === "needs-recovery" || entry?.mutation?.status === "attempt-recorded"))
    .at(-1);
  // The only cross-kind recovery allowed is a current thread becoming outdated
  // after an interrupted current-thread mutation.  It retains the old exact
  // identity and requires a new outdated adjudication before retrying.
  const crossKindPrior = kind === "outdated"
    ? (Array.isArray(manifest?.current_thread_resolution_outcomes) ? manifest.current_thread_resolution_outcomes : [])
      .filter((entry) => entry?.threadId === fresh.threadId && (entry?.status === "needs-recovery" || entry?.mutation?.status === "attempt-recorded"))
      .at(-1)
    : null;
  const prior = ownPrior || crossKindPrior;
  const priorKind = ownPrior ? kind : (crossKindPrior ? "current" : null);
  // An interrupted initial `attempt-recorded` entry deliberately has no
  // completedAt.  It is still an identity-complete recovery-chain entry, and
  // a fresh exact-head audit of the still-unresolved target is the bounded
  // evidence required to supersede it rather than leaving it unrecoverable.
  if (!prior || !hasValidResolutionRecoveryChainAttempt(prior)) return null;
  const target = audit?.threadRefs?.find((thread) => thread.id === fresh.threadId);
  if (prior.expectedHeadSha !== fresh.expectedHeadSha
    || prior.repository?.fullName !== fresh.repository?.fullName
    || prior.targetRequestFingerprint !== fresh.targetRequestFingerprint
    || !target || target.isResolved || Boolean(target.isOutdated) !== (kind === "outdated")
    || !target.commentsComplete || target.requestFingerprint !== fresh.targetRequestFingerprint) return null;
  const completedAt = new Date().toISOString();
  return {
    schemaVersion: 1,
    attemptId: randomUUID(),
    supersedesAttemptId: prior.attemptId,
    threadId: fresh.threadId,
    expectedHeadSha: fresh.expectedHeadSha,
    repository: fresh.repository,
    targetRequestFingerprint: fresh.targetRequestFingerprint,
    attemptedAt: completedAt,
    completedAt,
    status: "superseded",
    supersededAttemptKind: priorKind,
    mutation: { status: priorKind === kind ? "retry-authorized-after-live-unresolved-audit" : "retry-authorized-after-kind-change", exitCode: null, result: priorKind === kind ? "live target remains unresolved and exact-head retry is authorized" : "interrupted current-thread target is now outdated and requires the retained exact outdated-thread retry", replyPosted: false, metadataOnly: true },
    preMutationAudit: compactReviewThreadAudit(audit),
    recoveryPath: priorKind === kind ? "A fresh exact-head audit proved the target remains unresolved. The prior ambiguous mutation is superseded; a new governed mutation attempt follows." : "A fresh exact-head audit proved the interrupted current-thread target is now outdated. The prior current attempt is superseded; only the retained exact outdated-thread retry may follow.",
    metadataOnly: true,
    rawPayloadRetained: false,
  };
}

function assertNoUnrecoveredResolutionAttempt(manifest, kind, freshAdjudication = null, retryAttemptId = null) {
  const outcomes = [
    ...(Array.isArray(manifest?.current_thread_resolution_outcomes) ? manifest.current_thread_resolution_outcomes : []).map((outcome) => ({ kind: "current", outcome })),
    ...(Array.isArray(manifest?.outdated_thread_resolution_outcomes) ? manifest.outdated_thread_resolution_outcomes : []).map((outcome) => ({ kind: "outdated", outcome })),
  ];
  const unrecovered = outcomes.filter(({ kind: attemptKind, outcome }) => outcome?.attemptId !== retryAttemptId && isUnrecoveredResolutionAttempt(outcomes, attemptKind, outcome));
  if (!unrecovered.length) return;
  const details = unrecovered.map(({ kind: attemptKind, outcome }) => `${attemptKind}:${outcome?.threadId || "unknown"}`).join(", ");
  throw new Error(`An outstanding ${kind} review-thread resolution attempt is unrecovered; do not mutate another thread until recovery is recorded: ${details}.`);
}

function reviewThreadResolutionPreMutationBlockers(pr, headState, audit, fresh) {
  const blockers = [];
  if (!pr || pr.state !== "OPEN" || pr.isDraft || pr.mergedAt) blockers.push("PR is no longer open and non-draft immediately before the thread mutation");
  if (!pr?.baseRefName || pr.baseRefName !== fresh.pr?.baseRefName) blockers.push("PR base drifted immediately before the thread mutation");
  if (!exactGitObjectIdOrNull(pr?.baseRefOid) || pr.baseRefOid !== fresh.pr?.baseRefOid) blockers.push("PR base commit drifted immediately before the thread mutation");
  if (!pr?.headRefOid || pr.headRefOid !== fresh.expectedHeadSha) blockers.push("PR head drifted immediately before the thread mutation");
  if (!headState.localMatchesExpected || headState.localHeadSha !== fresh.expectedHeadSha) blockers.push("Local worktree head drifted immediately before the thread mutation");
  if (pr?.reviewDecision === "CHANGES_REQUESTED") blockers.push(`PR reviewDecision is ${pr.reviewDecision} immediately before the thread mutation`);
  const checks = normalizeStatusCheckRollup(pr?.statusCheckRollup, fresh.nonRequiredCheckPolicy);
  if (checks.total === 0) blockers.push("No status checks reported for exact head immediately before the thread mutation");
  if (checks.pending.length) blockers.push(`Pending checks immediately before the thread mutation: ${checks.pending.map((check) => check.name).join(", ")}`);
  if (checks.failing.length) blockers.push(`Failed or ambiguous checks immediately before the thread mutation: ${checks.failing.map((check) => check.name).join(", ")}`);
  blockers.push(...(fresh.nonRequiredCheckPolicy?.blockers || []));
  if (!audit?.querySucceeded || audit.errorCount || audit.hasNextPage || audit.reviewRequestHasNextPage) blockers.push("Thread-aware audit is incomplete immediately before the thread mutation");
  if (audit?.pendingReviewRequestCount) blockers.push(`Pending review requests immediately before the thread mutation: ${audit.pendingReviewRequestCount}`);
  if (audit?.unresolvedNonOutdatedCount) blockers.push(`Unresolved current review threads immediately before the thread mutation: ${audit.unresolvedNonOutdatedCount}`);
  if (audit?.auditFingerprint !== fresh.reviewThreads?.auditFingerprint) blockers.push("Thread-aware audit changed after the fresh adjudication and before the thread mutation");
  const target = audit?.threadRefs?.find((thread) => thread.id === fresh.threadId);
  if (!target || target.isResolved || !target.isOutdated || !target.commentsComplete || target.requestFingerprint !== fresh.targetRequestFingerprint) {
    blockers.push("Target review thread changed after the fresh adjudication and before the thread mutation");
  }
  return blockers;
}

function reviewThreadResolutionPostMutationBlockers(audit, target, fresh = {}) {
  const blockers = [];
  if (!audit?.querySucceeded || audit.errorCount || audit.hasNextPage || audit.reviewRequestHasNextPage) blockers.push("Post-resolution thread-aware audit is incomplete");
  if (audit?.pendingReviewRequestCount) blockers.push(`Pending review requests after resolution: ${audit.pendingReviewRequestCount}`);
  const preExistingCurrentIds = new Set((fresh.reviewThreads?.threadRefs || [])
    .filter((thread) => !thread?.isResolved && !thread?.isOutdated)
    .map((thread) => thread.id)
    .filter(Boolean));
  const unexpectedCurrent = (audit?.threadRefs || []).filter((thread) =>
    !thread?.isResolved && !thread?.isOutdated && !preExistingCurrentIds.has(thread.id),
  );
  if (unexpectedCurrent.length) {
    blockers.push(`New unresolved current review threads after resolution: ${unexpectedCurrent.map((thread) => thread.url || thread.id).join(", ")}`);
  }
  if (!target?.isResolved) blockers.push("Target review thread was not confirmed resolved by the post-resolution audit");
  if (target?.requestFingerprint !== fresh?.targetRequestFingerprint) blockers.push("Target review thread changed during resolution and requires recovery");
  return blockers;
}

function emptyReviewThreadState() {
  return {
    querySucceeded: false,
    reviewThreadComplete: false,
    reviewRequestComplete: false,
    errorCount: 1,
    errorCategories: ["audit-unavailable"],
    hasNextPage: false,
    reviewRequestHasNextPage: false,
    pendingReviewRequestCount: 0,
    unresolvedNonOutdatedCount: 0,
    unresolvedOutdatedCount: 0,
    threadRefs: [],
  };
}

function compactStatusCheckEvidence(checks) {
  return {
    total: Number(checks?.total || 0),
    passed: (checks?.passed || []).map((check) => ({ name: check.name, status: check.status, conclusion: check.conclusion })),
    pending: (checks?.pending || []).map((check) => ({ name: check.name, status: check.status, conclusion: check.conclusion })),
    failing: (checks?.failing || []).map((check) => ({ name: check.name, status: check.status, conclusion: check.conclusion })),
    metadataOnly: true,
    rawPayloadRetained: false,
  };
}

function compactReviewThreadAudit(audit) {
  return {
    checkedAt: new Date().toISOString(),
    querySucceeded: Boolean(audit?.querySucceeded),
    reviewThreadComplete: Boolean(audit?.reviewThreadComplete),
    reviewRequestComplete: Boolean(audit?.reviewRequestComplete),
    errorCount: Number(audit?.errorCount || 0),
    errorCategories: Array.isArray(audit?.errorCategories) ? audit.errorCategories.filter((category) => typeof category === "string").slice(0, 8) : [],
    hasNextPage: Boolean(audit?.hasNextPage),
    reviewRequestHasNextPage: Boolean(audit?.reviewRequestHasNextPage),
    pendingReviewRequestCount: Number(audit?.pendingReviewRequestCount || 0),
    unresolvedCurrent: Number(audit?.unresolvedNonOutdatedCount || 0),
    unresolvedOutdated: Number(audit?.unresolvedOutdatedCount || 0),
    unresolvedCurrentThreadIds: (audit?.threadRefs || []).filter((thread) => !thread.isResolved && !thread.isOutdated).map((thread) => thread.id).filter(Boolean),
    unresolvedOutdatedThreadIds: (audit?.threadRefs || []).filter((thread) => !thread.isResolved && thread.isOutdated).map((thread) => thread.id).filter(Boolean),
    auditFingerprint: audit?.auditFingerprint || null,
    metadataOnly: true,
    rawPayloadRetained: false,
  };
}

function reviewThreadStateSnapshotFingerprint(audit) {
  // `checkedAt` is generated locally for retained evidence, so it cannot be
  // part of a GitHub-state drift comparison.
  const { checkedAt, ...stable } = compactReviewThreadAudit(audit);
  return JSON.stringify(stable);
}

function verifyUnmanagedPrGates(argv) {
  const { options } = parseOptions(argv);
  if (options.apply) {
    throw new Error("verify-unmanaged-pr-gates is metadata-only and does not support --apply.");
  }
  if (typeof options.pr !== "string" || !/^[1-9][0-9]*$/.test(options.pr)) {
    throw new Error("verify-unmanaged-pr-gates requires --pr <positive integer>.");
  }
  const prNumber = Number(options.pr);
  const baseBranch = safeMetadataText(options.base, 250);
  const expectedHeadSha = safeMetadataText(options.expectedHead, 80);
  const plannedMergeMethod = safeMetadataText(options.mergeMethod, 500);
  const rollbackPath = typeof options.rollbackPath === "string" ? safeMetadataText(options.rollbackPath, 500) : "";
  if (!Number.isInteger(prNumber) || prNumber <= 0) {
    throw new Error("verify-unmanaged-pr-gates requires --pr <number>.");
  }
  if (!baseBranch) {
    throw new Error("verify-unmanaged-pr-gates requires --base <branch>.");
  }
  assertSafeBaseBranch(baseBranch);
  if (!exactGitObjectIdOrNull(expectedHeadSha)) {
    throw new Error("verify-unmanaged-pr-gates requires --expected-head <exact sha>.");
  }
  if (!plannedMergeMethod) {
    throw new Error("verify-unmanaged-pr-gates requires --merge-method <planned exact-head method>.");
  }
  if (!rollbackPath) {
    throw new Error("verify-unmanaged-pr-gates requires --rollback-path <revert or recovery path>.");
  }
  requireGh("verify-unmanaged-pr-gates");
  const cwdResult = git(["rev-parse", "--show-toplevel"], { cwd: process.cwd() });
  if (cwdResult.code !== 0 || !cwdResult.stdout.trim()) {
    throw new Error("verify-unmanaged-pr-gates must run from a Git worktree.");
  }
  const worktreePath = cwdResult.stdout.trim();
  const repository = githubRepository({ worktree_path: worktreePath });
  if (repository.owner !== "slawdawg" || repository.name !== "Kendall-vnxt") {
    throw new Error("verify-unmanaged-pr-gates only produces Kendall_Nxt evidence.");
  }
  const detached = git(["symbolic-ref", "-q", "HEAD"], { cwd: worktreePath });
  if (detached.code === 0) {
    throw new Error("verify-unmanaged-pr-gates requires a detached checkout.");
  }
  if (parseStatus(worktreePath).any) {
    throw new Error("verify-unmanaged-pr-gates requires a clean detached checkout.");
  }
  const manifest = {
    task_id: `unmanaged-pr-${prNumber}`,
    branch: `unmanaged-pr-${prNumber}`,
    base_branch: baseBranch,
    pr_number: prNumber,
    pr_delivery_head_sha: expectedHeadSha,
    worktree_path: worktreePath,
  };
  const packet = buildPrGateEvidence(manifest, { options, managedGate: false });
  const externalPacket = {
    ...packet,
    plannedMergeMethod,
    rollbackPath,
    authorityProfile: "unmanaged-pr-evidence",
    unmanaged: true,
    metadataOnly: true,
    recoveryPath: "No merge or cleanup was attempted. Fix any exact-head gate blocker, rebuild this detached-worktree evidence packet, then re-audit before merge.",
  };
  externalPacket.authorityDecision = shapeAuthorityDecisionEvidence({
    operation: "verify-unmanaged-pr-gates",
    authorityFamily: "unmanaged-pr-evidence",
    authorityProfile: "unmanaged-pr-evidence",
    decision: externalPacket.lowRiskReady ? "ready" : "blocked",
    allowed: externalPacket.lowRiskReady,
    requiredGates: packet.authorityDecision?.requiredGates || [],
    satisfiedGates: externalPacket.lowRiskReady ? (packet.authorityDecision?.requiredGates || []) : [],
    blockedReasons: externalPacket.blockers || [],
    stopLines: [
      "metadata-only evidence; never mutates a managed manifest",
      "no merge or cleanup",
      "requires a clean detached Kendall_Nxt checkout and an exact PR/head binding",
    ],
    evidenceRefs: [
      `repository:${repository.owner}/${repository.name}`,
      `pr:${prNumber}`,
      `expected-head:${expectedHeadSha}`,
    ],
    nextSafeAction: externalPacket.lowRiskReady
      ? "Retain this unmanaged exact-head evidence packet and re-audit immediately before any separately authorized merge."
      : "Fix the named unmanaged PR evidence blocker and rebuild the detached-worktree packet.",
    recoveryPath: externalPacket.recoveryPath,
    generatedAt: packet.checkedAt,
  });
  if (options.summaryJson) {
    console.log(JSON.stringify(externalPacket, null, 2));
    return;
  }
  if (!externalPacket.lowRiskReady) {
    printBlocked("verify-unmanaged-pr-gates", renderPrGateEvidence(externalPacket));
    throw new Error(`Unmanaged PR gate evidence is not ready: ${externalPacket.blockers.join("; ")}`);
  }
  printPlan("verify-unmanaged-pr-gates", renderPrGateEvidence(externalPacket));
  console.log("Retain this metadata-only packet with the detached-worktree delivery evidence; no merge or cleanup was performed.");
}

function reconcileMergedPr(argv) {
  assertReconciliationModeOptionOccurrences(argv);
  const { positional, options } = parseOptions(argv);
  const query = positional.join(" ").trim();
  if (!query) {
    throw new Error("reconcile-merged-pr requires a task query.");
  }
  assertReconciliationModeOptionValues(options);
  if (options.apply && options.dryRun) {
    throw new Error("reconcile-merged-pr accepts either --dry-run or --apply, not both.");
  }
  assertReconciliationAuditOptionValues(options);
  assertAuditedDescendantHeadOptionValues(options);
  if (options.takeOwnership) {
    throw new Error("reconcile-merged-pr does not support --take-ownership; the recorded lane owner must run this metadata-only operation.");
  }
  if (options.summaryJson && options.apply) {
    throw new Error("reconcile-merged-pr --summary-json is only supported without --apply.");
  }

  const state = workspaceState(options);
  const manifestRecord = findCleanupManifest(state, query);
  const { manifest, path: manifestPath } = manifestRecord;
  assertExactReconciliationOwner(manifest, options);
  assertReconciliationManifestState(manifest);
  assertSafeBranch(manifest.branch);
  assertRegisteredManagedWorktree(manifest, state);
  requireGh("reconcile-merged-pr");

  const packet = buildMergedPrReconciliationEvidence(manifest, { options });
  if (options.summaryJson) {
    console.log(JSON.stringify(packet, null, 2));
    return;
  }
  if (!packet.ready) {
    printBlocked("reconcile-merged-pr", renderMergedPrReconciliationEvidence(packet));
    throw new Error(`Merged PR reconciliation is not ready: ${packet.blockers.join("; ")}`);
  }
  if (!options.apply) {
    printPlan("reconcile-merged-pr", renderMergedPrReconciliationEvidence(packet));
    console.log("Add --apply to record only verified merged-PR metadata and cleanup audit evidence.");
    return;
  }

  withManifestLock(state, manifest.task_id, () => {
    const lockedManifest = readManifest(manifestPath);
    validateManifest(lockedManifest, manifestPath);
    assertExactReconciliationOwner(lockedManifest, options);
    assertReconciliationManifestState(lockedManifest);
    assertSafeBranch(lockedManifest.branch);
    assertRegisteredManagedWorktree(lockedManifest, state);

    const lockedPacket = buildMergedPrReconciliationEvidence(lockedManifest, { options });
    if (!lockedPacket.ready) {
      printBlocked("reconcile-merged-pr", renderMergedPrReconciliationEvidence(lockedPacket));
      throw new Error(`Merged PR reconciliation changed under lock: ${lockedPacket.blockers.join("; ")}`);
    }

    applyVerifiedMergedPrStatus(lockedManifest);
    lockedManifest.pr_url = lockedPacket.pr.url;
    lockedManifest.pr_number = lockedPacket.pr.number;
    lockedManifest.pr_delivery_head_sha = lockedPacket.expectedHeadSha;
    if (lockedPacket.auditedDescendantHead) {
      lockedManifest.audited_descendant_delivery_reconciliation = lockedPacket.auditedDescendantHead;
      appendTaskEvent(lockedManifest, "audited_descendant_delivery_head_reconciled", `${lockedPacket.auditedDescendantHead.recordedHeadSha} -> ${lockedPacket.auditedDescendantHead.liveHeadSha}`);
    }
    lockedManifest.merged_at = lockedPacket.pr.mergedAt;
    lockedManifest.delivery_subagent_audit = lockedPacket.deliverySubagentAudit;
    lockedManifest.delivery_subagent_audit_checked_at = lockedPacket.checkedAt;
    lockedManifest.merged_pr_reconciliation = lockedPacket;
    appendAuthorityDecision(lockedManifest, lockedPacket.authorityDecision);
    lockedManifest.updated_at = lockedPacket.checkedAt;
    appendTaskEvent(
      lockedManifest,
      "merged_pr_reconciled",
      `PR ${lockedPacket.pr.number} ${lockedPacket.expectedHeadSha} cleanup audit ${lockedPacket.deliverySubagentAudit.status}`,
    );
    writeManifest(manifestPath, lockedManifest);
    Object.assign(manifest, lockedManifest);
  });

  printApplied("reconcile-merged-pr", renderMergedPrReconciliationEvidence(manifest.merged_pr_reconciliation));
}

function assertReconciliationModeOptionOccurrences(argv) {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const option = arg === "--apply" || arg.startsWith("--apply=")
      ? "--apply"
      : arg === "--dry-run" || arg.startsWith("--dry-run=")
        ? "--dry-run"
        : null;
    if (!option) {
      continue;
    }
    if (arg !== option || (index + 1 < argv.length && !argv[index + 1].startsWith("--"))) {
      throw new Error(`reconcile-merged-pr ${option} must be a bare flag without a value.`);
    }
  }
}

function assertReconciliationModeOptionValues(options) {
  for (const [option, value] of [
    ["--apply", options.apply],
    ["--dry-run", options.dryRun],
  ]) {
    if (value !== undefined && value !== true) {
      throw new Error(`reconcile-merged-pr ${option} must be a bare flag without a value.`);
    }
  }
}

function assertReconciliationAuditOptionValues(options) {
  for (const [option, value] of [
    ["--delivery-audit-agent", options.deliveryAuditAgent],
    ["--delivery-audit-summary", options.deliveryAuditSummary],
  ]) {
    if (value === undefined) {
      continue;
    }
    if (value === true || typeof value !== "string" || !value.trim()) {
      throw new Error(`reconcile-merged-pr ${option} requires a non-empty value.`);
    }
  }
}

function assertAuditedDescendantHeadOptionValues(options) {
  if (options.allowAuditedDescendantHead !== undefined && options.allowAuditedDescendantHead !== true) {
    throw new Error("reconcile-merged-pr --allow-audited-descendant-head must be a bare flag without a value.");
  }
  if (options.allowAuditedDescendantHead && !validTakeoverReason(options.approval)) {
    throw new Error("reconcile-merged-pr --allow-audited-descendant-head requires --approval with at least 10 non-whitespace characters.");
  }
  if (options.allowAuditedDescendantHead) {
    throw new Error("reconcile-merged-pr --allow-audited-descendant-head is unavailable: independently retained exact-head successor gate evidence is required before descendant reconciliation can be enabled.");
  }
}

function buildMergedPrReconciliationEvidence(manifest, context = {}) {
  const checkedAt = new Date().toISOString();
  const blockers = [];
  const livePr = prView(manifest, canonicalKendallRepository);
  const { pr, blockers: providerFieldBlockers } = shapeMergedPrReconciliationPr(livePr);
  blockers.push(...providerFieldBlockers);
  let localHeadSha = "";
  let remoteHeadSha = null;
  let remoteInspectionError = null;
  let rawRemoteHeadSha = "";
  const allowAuditedDescendantHead = context.options?.allowAuditedDescendantHead === true;
  const recordedHeadSha = exactGitObjectIdOrNull(manifest.pr_delivery_head_sha);
  let auditedDescendantHead = null;

  if (!pr) {
    addReconciliationBlocker(blockers, "Could not load live PR state for merged-PR reconciliation.");
  } else {
    validateMergedPrReconciliationIdentity(pr, blockers);
    if (pr.state !== "MERGED" || !pr.mergedAt) {
      addReconciliationBlocker(blockers, "Live PR is not merged.");
    }
    if (!pr.number || !pr.url) {
      addReconciliationBlocker(blockers, "Live PR identity is incomplete.");
    }
    if (!pr.headRefName || pr.headRefName !== manifest.branch) {
      addReconciliationBlocker(blockers, `Live PR head branch ${pr.headRefName || "missing"} does not match manifest branch ${safeMetadataText(manifest.branch, 250)}.`);
    }
    if (!pr.baseRefName || pr.baseRefName !== manifest.base_branch) {
      addReconciliationBlocker(blockers, `Live PR base ${pr.baseRefName || "missing"} does not match manifest base ${safeMetadataText(manifest.base_branch, 250)}.`);
    }
    if (!exactGitObjectIdOrNull(pr.headRefOid)) {
      addReconciliationBlocker(blockers, "Live PR head is missing or is not an exact Git object id.");
    }
    if (manifest.pr_number && manifest.pr_number !== pr.number) {
      addReconciliationBlocker(blockers, `Manifest PR number ${safeMetadataText(manifest.pr_number, 32)} does not match live PR ${pr.number || "missing"}.`);
    }
    if (manifest.pr_url && manifest.pr_url !== pr.url) {
      addReconciliationBlocker(blockers, "Manifest PR URL does not match the live PR URL.");
    }
    if (manifest.pr_delivery_head_sha && manifest.pr_delivery_head_sha !== pr.headRefOid && !allowAuditedDescendantHead) {
      addReconciliationBlocker(blockers, `Recorded delivery head ${safeMetadataText(manifest.pr_delivery_head_sha, 80)} does not match live PR head ${pr.headRefOid || "missing"}.`);
    }
    if (manifest.merged_at && manifest.merged_at !== pr.mergedAt) {
      addReconciliationBlocker(blockers, "Recorded merged timestamp does not match the live PR merged timestamp.");
    }
  }

  try {
    localHeadSha = branchSha(manifest.branch, manifest.worktree_path);
  } catch (error) {
    addReconciliationBlocker(blockers, `Could not inspect local branch head: ${error.message}`);
  }
  localHeadSha = exactGitObjectIdOrNull(localHeadSha) || "";
  if (!localHeadSha) {
    addReconciliationBlocker(blockers, `Local branch ${safeMetadataText(manifest.branch, 250)} is missing or does not resolve to an exact Git object id.`);
  } else if (pr?.headRefOid && localHeadSha !== pr.headRefOid) {
    addReconciliationBlocker(blockers, `Local branch ${safeMetadataText(manifest.branch, 250)} head ${localHeadSha} does not match live PR head ${pr.headRefOid}.`);
  }

  if (allowAuditedDescendantHead) {
    if (!recordedHeadSha || !pr?.headRefOid || recordedHeadSha === pr.headRefOid) {
      addReconciliationBlocker(blockers, "Audited descendant reconciliation requires distinct exact recorded and live PR delivery heads.");
    } else if (git(["merge-base", "--is-ancestor", recordedHeadSha, pr.headRefOid], { cwd: manifest.worktree_path }).code !== 0) {
      addReconciliationBlocker(blockers, "Live PR head is not a descendant of the recorded delivery head.");
    } else if (parseStatus(manifest.worktree_path).any) {
      addReconciliationBlocker(blockers, "Audited descendant reconciliation requires a clean managed worktree.");
    } else {
      auditedDescendantHead = {
        schemaVersion: 1,
        recordedHeadSha,
        liveHeadSha: pr.headRefOid,
        approval: String(context.options.approval).trim(),
        checkedAt,
        metadataOnly: true,
        rawPayloadRetained: false,
      };
    }
  }

  try {
    rawRemoteHeadSha = originBranchSha(manifest.branch, manifest.worktree_path) || "";
  } catch (error) {
    remoteInspectionError = safeMetadataText(error.message || error, 500);
    addReconciliationBlocker(blockers, `Could not inspect remote branch origin/${safeMetadataText(manifest.branch, 250)}: ${remoteInspectionError}`);
  }
  remoteHeadSha = rawRemoteHeadSha ? exactGitObjectIdOrNull(rawRemoteHeadSha) : null;
  if (!remoteInspectionError && rawRemoteHeadSha && remoteHeadSha === null) {
    addReconciliationBlocker(blockers, "Remote branch head is not an exact Git object id.");
  }
  if (remoteHeadSha && pr?.headRefOid && remoteHeadSha !== pr.headRefOid) {
    addReconciliationBlocker(blockers, `Remote branch origin/${safeMetadataText(manifest.branch, 250)} head ${remoteHeadSha} does not match live PR head ${pr.headRefOid}.`);
  }

  const expectedHeadSha = pr?.headRefOid || "";
  // A pre-merge gate necessarily predates the merge.  The narrow
  // audited-descendant recovery path proves the live merged head is a clean
  // descendant of that recorded delivery head, so retain the original exact
  // gate binding while the independent cleanup audit stays bound to the live
  // merged head below.
  const preMergeGatePr = auditedDescendantHead
    ? { ...pr, headRefOid: recordedHeadSha }
    : pr;
  const preMergeGate = shapeRetainedPreMergeGateEvidence(manifest, preMergeGatePr);
  blockers.push(...preMergeGate.blockers);
  const deliverySubagentAudit = shapeCleanupDeliverySubagentAuditEvidence(manifest, pr || {}, context.options || {}, {
    expectedHeadSha,
    checkedAt,
  });
  blockers.push(...deliverySubagentAudit.blockers.map((blocker) => safeMetadataText(blocker, 500)));

  const requiredGates = [
    "manifest names a registered managed worktree",
    "live PR is merged on the manifest base from the manifest branch",
    "live PR head is an exact Git object id",
    "local lane branch exactly matches the merged PR head",
    "live remote lane branch is absent or exactly matches the merged PR head",
    "retained PR identity and delivery metadata do not conflict",
    "retained exact-head pre-merge gate evidence passed before the merge",
    "independent cleanup audit recommends cleanup-ready for the exact merged head",
    ...(allowAuditedDescendantHead ? ["live merged head is a clean descendant of the recorded delivery head", "explicit audited-descendant approval is recorded"] : []),
  ];
  const status = blockers.length === 0 ? "ready" : "blocked";
  const authorityDecision = shapeAuthorityDecisionEvidence({
    operation: "reconcile-merged-pr",
    authorityFamily: "post-merge-metadata",
    decision: status,
    allowed: blockers.length === 0,
    requiredGates,
    satisfiedGates: blockers.length === 0 ? requiredGates : [],
    blockedReasons: blockers,
    stopLines: [
      "no source, worktree, branch, remote, PR, assignment, or cleanup mutation",
      "live merged-PR evidence is rechecked under the manifest lock before recording",
      "conflicting retained metadata is a fail-closed hold",
      "retain metadata only; no raw provider payloads",
    ],
    evidenceRefs: [
      `task:${manifest.task_id}`,
      pr?.number ? `pr:${pr.number}` : "",
      expectedHeadSha ? `merged-head:${expectedHeadSha}` : "",
      preMergeGate.checkedAt ? `pre-merge-gate:${preMergeGate.checkedAt}` : "",
      deliverySubagentAudit.agent ? `delivery-audit-agent:${deliverySubagentAudit.agent}` : "",
    ],
    nextSafeAction: blockers.length === 0
      ? "Record the verified merged-PR metadata, then run cleanup-merged as a separate dry-run."
      : "Resolve the recorded identity or audit mismatch, then rerun reconcile-merged-pr.",
    recoveryPath: "No cleanup was attempted. Preserve the manifest and rerun after the live PR, branch, or cleanup audit evidence is consistent.",
    generatedAt: checkedAt,
  });

  return {
    schemaVersion: 1,
    status,
    ready: blockers.length === 0,
    checkedAt,
    taskId: manifest.task_id,
    branch: manifest.branch,
    baseBranch: manifest.base_branch,
    expectedHeadSha: expectedHeadSha || null,
    auditedDescendantHead,
    localHeadSha: localHeadSha || null,
    remoteBranch: {
      branch: manifest.branch,
      state: remoteInspectionError ? "unknown" : remoteHeadSha ? "present" : "absent",
      headSha: remoteHeadSha,
      error: remoteInspectionError,
    },
    pr: pr
      ? {
          number: pr.number || null,
          url: pr.url || null,
          state: pr.state || null,
          mergedAt: pr.mergedAt || null,
          baseRefName: pr.baseRefName || null,
          headRefName: pr.headRefName || null,
          headRefOid: pr.headRefOid || null,
        }
      : null,
    deliverySubagentAudit,
    preMergeGate,
    blockers,
    requiredGates,
    authorityDecision,
    recoveryPath: "No cleanup was attempted. Preserve the manifest and rerun after the live PR, branch, or cleanup audit evidence is consistent.",
    metadataOnly: true,
    rawPayloadRetained: false,
  };
}

function renderMergedPrReconciliationEvidence(packet = {}) {
  return [
    `PR ${packet.pr?.number || "unknown"} ${packet.pr?.state || "unknown"}`,
    `head ${packet.expectedHeadSha || "unknown"} local=${packet.localHeadSha || "unknown"} remote=${packet.remoteBranch?.state || "unknown"}:${packet.remoteBranch?.headSha || "none"}`,
    `base ${packet.pr?.baseRefName || "unknown"} branch ${packet.pr?.headRefName || "unknown"}`,
    `preMergeGate status=${packet.preMergeGate?.status || "unknown"} checkedAt=${packet.preMergeGate?.checkedAt || "unknown"}`,
    `deliveryAudit status=${packet.deliverySubagentAudit?.status || "unknown"} agent=${packet.deliverySubagentAudit?.agent || "unknown"}`,
    `status ${packet.status || "unknown"}`,
  ];
}

function shapeRetainedPreMergeGateEvidence(manifest, pr) {
  const expectedHeadSha = pr?.headRefOid || "";
  const gate = manifest.pr_gate_evidence && typeof manifest.pr_gate_evidence === "object" ? manifest.pr_gate_evidence : null;
  const blockers = [];
  if (!gate) {
    blockers.push("Retained pre-merge gate evidence is missing");
    return {
      status: "blocked",
      checkedAt: null,
      expectedHeadSha: expectedHeadSha || null,
      legacy: true,
      blockers,
      metadataOnly: true,
    };
  } else {
    if (gate.status !== "passed" || gate.lowRiskReady !== true) {
      blockers.push("Retained pre-merge gate evidence was not passed");
    }
    if (!gate.checkedAt) {
      blockers.push("Retained pre-merge gate evidence timestamp is missing");
    }
    if (!gate.expectedHeadSha || gate.expectedHeadSha !== expectedHeadSha) {
      blockers.push("Retained pre-merge gate evidence does not match the merged PR head");
    }
    if (gate.taskId !== manifest.task_id || gate.branch !== manifest.branch || gate.baseBranch !== manifest.base_branch) {
      blockers.push("Retained pre-merge gate evidence does not match the managed task, branch, or base");
    }
    if (gate.pr?.number !== pr?.number || gate.pr?.url !== pr?.url || gate.pr?.baseRefName !== pr?.baseRefName || gate.pr?.headRefOid !== pr?.headRefOid) {
      blockers.push("Retained pre-merge gate evidence does not match the merged PR identity");
    }
  }
  return {
    status: blockers.length === 0 ? "passed" : "blocked",
    checkedAt: gate?.checkedAt || null,
    expectedHeadSha: gate?.expectedHeadSha || null,
    blockers,
    metadataOnly: true,
  };
}

function addReconciliationBlocker(blockers, value) {
  const bounded = safeMetadataText(value, 500);
  if (bounded) {
    blockers.push(bounded);
  }
}

function boundedProviderText(value, maxLength, field, blockers) {
  const raw = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!raw) {
    return null;
  }
  if (raw.length > maxLength) {
    addReconciliationBlocker(blockers, `Live PR ${field} exceeds the ${maxLength}-character metadata bound.`);
    return null;
  }
  return safeMetadataText(raw, maxLength) || null;
}

function shapeMergedPrReconciliationPr(livePr) {
  const blockers = [];
  if (!livePr || typeof livePr !== "object" || Array.isArray(livePr)) {
    addReconciliationBlocker(blockers, "Live PR response must be a JSON object.");
    return { pr: null, blockers };
  }
  const rawNumber = livePr.number;
  const number = Number.isSafeInteger(rawNumber) && rawNumber > 0 ? rawNumber : null;
  if (rawNumber !== undefined && rawNumber !== null && number === null) {
    addReconciliationBlocker(blockers, "Live PR number is not a positive safe integer.");
  }
  const url = boundedProviderText(livePr.url, 500, "URL", blockers);
  const state = boundedProviderText(livePr.state, 64, "state", blockers);
  const mergedAt = boundedProviderText(livePr.mergedAt, 80, "merged timestamp", blockers);
  const baseRefName = boundedProviderText(livePr.baseRefName, MAX_BASE_BRANCH_LENGTH, "base branch", blockers);
  const headRefName = boundedProviderText(livePr.headRefName, 250, "head branch", blockers);
  const rawHeadRefOid = boundedProviderText(livePr.headRefOid, 80, "head object id", blockers);
  const headRefOid = exactGitObjectIdOrNull(rawHeadRefOid) || null;
  if (rawHeadRefOid && !headRefOid) {
    addReconciliationBlocker(blockers, "Live PR head is not an exact Git object id.");
  }
  return {
    pr: { number, url, state, mergedAt, baseRefName, headRefName, headRefOid },
    blockers,
  };
}

function validateMergedPrReconciliationIdentity(pr, blockers) {
  if (!validMergedPrUrl(pr.url, pr.number, canonicalKendallRepository)) {
    addReconciliationBlocker(blockers, "Live PR URL is not the canonical Kendall_Nxt HTTPS pull-request URL for the reported PR number.");
  }
  if (!validProviderBranchName(pr.baseRefName, MAX_BASE_BRANCH_LENGTH)) {
    addReconciliationBlocker(blockers, "Live PR base branch is not a valid branch name.");
  }
  if (!validProviderBranchName(pr.headRefName, 250)) {
    addReconciliationBlocker(blockers, "Live PR head branch is not a valid branch name.");
  }
  if (!exactGitObjectIdOrNull(pr.headRefOid)) {
    addReconciliationBlocker(blockers, "Live PR head is not an exact Git object id.");
  }
  if (pr.state !== "MERGED") {
    addReconciliationBlocker(blockers, "Live PR state must be MERGED for reconciliation.");
  }
  if (!validMergedAtTimestamp(pr.mergedAt)) {
    addReconciliationBlocker(blockers, "Live PR merged timestamp is not a valid RFC 3339 timestamp.");
  }
}

function validMergedPrUrl(value, number, repository = null) {
  if (!value || !Number.isSafeInteger(number) || number <= 0) {
    return false;
  }
  try {
    const parsed = new URL(value);
    const match = parsed.pathname.match(/\/pull\/(\d+)\/?$/);
    const canonical = repository
      ? parsed.hostname === "github.com" && parsed.pathname === `/${repository.owner}/${repository.name}/pull/${number}`
      : Boolean(parsed.hostname) && Boolean(match) && Number(match[1]) === number;
    return parsed.protocol === "https:" && canonical && !parsed.username && !parsed.password && !parsed.search && !parsed.hash;
  } catch {
    return false;
  }
}

function validProviderBranchName(value, maxLength) {
  if (!value || value.length > maxLength || value === "HEAD" || value.startsWith("-") || value.startsWith("refs/") || /[\s:*]/.test(value) || value.includes("..") || value.includes("@{")) {
    return false;
  }
  return git(["check-ref-format", "--branch", value], { cwd: repoRoot }).code === 0;
}

function validMergedAtTimestamp(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?Z$/);
  if (!match) {
    return false;
  }
  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) {
    return false;
  }
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, 0);
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
    && date.getUTCHours() === hour
    && date.getUTCMinutes() === minute
    && date.getUTCSeconds() === second;
}

function buildPrGateEvidence(manifest, context = {}) {
  const managedGate = context.managedGate !== false;
  const checkedAt = new Date().toISOString();
  const pr = prViewForGates(manifest);
  if (!pr) {
    throw new Error("Could not load PR state for gate evidence.");
  }
  const headState = prGateHeadState(manifest);
  const worktreeStatus = parseStatus(manifest.worktree_path);
  const repositoryRef = githubRepository(manifest);
  const repository = { owner: repositoryRef.owner, name: repositoryRef.name, fullName: `${repositoryRef.owner}/${repositoryRef.name}` };
  const reviewThreadState = fetchReviewThreadState(manifest, repositoryRef, pr.number);
  const nonRequiredCheckPolicy = shapeNonRequiredCheckPolicyEvidence(context.options || {}, {
    expectedHeadSha: headState.expectedHeadSha,
    worktreePath: manifest.worktree_path,
  });
  const checks = normalizeStatusCheckRollup(pr.statusCheckRollup, nonRequiredCheckPolicy);
  const changedPathInspection = fetchPrChangedPaths(manifest, pr.number, headState.expectedHeadSha, pr.baseRefName, pr.baseRefOid, pr.changedFiles);
  const postEvidencePr = prViewForGates(manifest);
  if (!postEvidencePr) throw new Error("Could not reload PR state after collecting gate evidence.");
  // Review state is independently mutable. Re-read it after the remaining
  // evidence calls so a newly-created request cannot be hidden by an earlier
  // clean snapshot.
  const postEvidenceReviewThreadState = fetchReviewThreadState(manifest, repositoryRef, pr.number);
  // The final thread audit itself can span paginated GraphQL requests. Reload
  // the mutable PR/check snapshot after it so the gate cannot persist a pass
  // for a head, base, or check set that changed during that audit.
  const finalEvidencePr = prViewForGates(manifest);
  if (!finalEvidencePr) throw new Error("Could not reload PR state after final review-thread audit.");
  const finalHeadState = prGateHeadState(manifest);
  const finalWorktreeStatus = parseStatus(manifest.worktree_path);
  const finalEvidenceChecks = normalizeStatusCheckRollup(finalEvidencePr.statusCheckRollup, nonRequiredCheckPolicy);
  const checkSnapshotChanged = JSON.stringify(checks) !== JSON.stringify(finalEvidenceChecks);
  const finalPrSnapshotChanged = postEvidencePr.number !== finalEvidencePr.number
    || postEvidencePr.baseRefName !== finalEvidencePr.baseRefName
    || postEvidencePr.baseRefOid !== finalEvidencePr.baseRefOid
    || postEvidencePr.headRefName !== finalEvidencePr.headRefName
    || postEvidencePr.headRefOid !== finalEvidencePr.headRefOid
    || JSON.stringify(normalizeStatusCheckRollup(postEvidencePr.statusCheckRollup, nonRequiredCheckPolicy)) !== JSON.stringify(finalEvidenceChecks);
  const reviewThreadSnapshotChanged = reviewThreadStateSnapshotFingerprint(reviewThreadState)
    !== reviewThreadStateSnapshotFingerprint(postEvidenceReviewThreadState);
  const diffRiskEvidence = shapeDiffRiskEvidence(context.options || {}, {
    expectedHeadSha: headState.expectedHeadSha,
    expectedPrNumber: pr.number,
    expectedBaseRefName: pr.baseRefName,
    expectedBaseRefOid: pr.baseRefOid,
    changedPaths: changedPathInspection.paths,
    changedPathError: changedPathInspection.error,
    inspectedHeadSha: changedPathInspection.inspectedHeadSha,
    postInspectionHeadSha: changedPathInspection.postInspectionHeadSha,
    inspectedPrNumber: changedPathInspection.inspectedPrNumber,
    postInspectionPrNumber: changedPathInspection.postInspectionPrNumber,
    inspectedBaseRefName: changedPathInspection.inspectedBaseRefName,
    postInspectionBaseRefName: changedPathInspection.postInspectionBaseRefName,
    inspectedBaseRefOid: changedPathInspection.inspectedBaseRefOid,
    postInspectionBaseRefOid: changedPathInspection.postInspectionBaseRefOid,
  });
  const deliverySubagentAudit = shapeDeliverySubagentAuditEvidence(manifest, context.options || {}, {
    checkedAt,
    expectedHeadSha: headState.expectedHeadSha,
  });
  const mergePlan = shapeExactHeadMergePlanEvidence(context.options || {}, {
    expectedHeadSha: headState.expectedHeadSha,
    prNumber: pr.number,
  });
  const blockers = prGateBlockers(manifest, finalEvidencePr, {
    repository,
    headState,
    worktreeStatus: finalWorktreeStatus,
    finalHeadState,
    finalLocalStateChanged: finalHeadState.localHeadSha !== headState.localHeadSha || !finalHeadState.localMatchesExpected || JSON.stringify(finalWorktreeStatus) !== JSON.stringify(worktreeStatus),
    checks: finalEvidenceChecks,
    checkSnapshotChanged,
    finalPrSnapshotChanged,
    initialBaseRefOid: pr.baseRefOid,
    nonRequiredCheckPolicy,
    reviewThreadState: postEvidenceReviewThreadState,
    reviewThreadSnapshotChanged,
    deliverySubagentAudit,
    diffRiskEvidence,
    mergePlan,
    currentResolutionOutcomes: manifest.current_thread_resolution_outcomes,
    outdatedResolutionOutcomes: manifest.outdated_thread_resolution_outcomes,
    managedGate,
  });
  const requiredGates = [
    "PR open and non-draft",
    "expected base branch",
    "exact PR head matches local delivery head",
    "GitHub merge state clean",
    "all reported checks completed successfully or are exact-head documented non-required skips",
    "thread-aware review query returned no unresolved or pending review state",
    "delivery subagent audit recommends merge-ready for exact head",
    "exact-head diff-risk assessment and focused verification evidence are recorded",
    "planned exact-head merge command and bounded rollback path are recorded without cleanup flags",
  ];
  const stopLines = [
    "metadata-only evidence; no merge",
    "no review-thread mutation",
    "no check bypass",
    "no cleanup",
    "no raw provider payload retention",
  ];
  const status = blockers.length ? "blocked" : "passed";

  return {
    schemaVersion: 1,
    status,
    lowRiskReady: blockers.length === 0,
    checkedAt,
    authorityProfile: managedGate ? "standard-delivery" : "unmanaged-pr-evidence",
    taskId: manifest.task_id,
    branch: manifest.branch,
    baseBranch: manifest.base_branch || null,
    expectedHeadSha: headState.expectedHeadSha,
    localHeadSha: finalHeadState.localHeadSha,
    worktree: { clean: !finalWorktreeStatus.any, status: finalWorktreeStatus },
    pr: {
      number: finalEvidencePr.number || manifest.pr_number || null,
      url: finalEvidencePr.url || manifest.pr_url || null,
      state: finalEvidencePr.state || null,
      isDraft: Boolean(finalEvidencePr.isDraft),
      mergedAt: finalEvidencePr.mergedAt || null,
      baseRefName: finalEvidencePr.baseRefName || null,
      headRefOid: finalEvidencePr.headRefOid || null,
      mergeStateStatus: finalEvidencePr.mergeStateStatus || null,
      reviewDecision: finalEvidencePr.reviewDecision || null,
    },
    checks: finalEvidenceChecks,
    checkSnapshotChanged,
    nonRequiredCheckPolicy,
    reviewThreads: postEvidenceReviewThreadState,
    reviewThreadSnapshotChanged,
    deliverySubagentAudit,
    diffRiskEvidence,
    mergePlan,
    blockers,
    requiredGates,
    stopLines,
    authorityDecision: shapeAuthorityDecisionEvidence({
      operation: "verify-pr-gates",
      authorityFamily: "delivery-gate",
      decision: status,
      allowed: blockers.length === 0,
      requiredGates,
      satisfiedGates: blockers.length === 0 ? requiredGates : [],
      blockedReasons: blockers,
      stopLines,
      evidenceRefs: [
        `task:${manifest.task_id}`,
        pr.number ? `pr:${pr.number}` : "",
        headState.expectedHeadSha ? `expected-head:${headState.expectedHeadSha}` : "",
        deliverySubagentAudit.agent ? `delivery-audit-agent:${deliverySubagentAudit.agent}` : "",
        mergePlan.plannedMergeMethod ? `planned-merge:${mergePlan.plannedMergeMethod}` : "",
      ],
      nextSafeAction:
        blockers.length === 0
          ? "Record PR gate evidence or proceed to exact-head merge only under the active delivery policy."
          : "Fix blockers, rerun focused verification, push a new head if needed, then rerun verify-pr-gates.",
      recoveryPath: "Fix blockers, rerun focused verification, push a new head if needed, then rerun verify-pr-gates before exact-head merge.",
      generatedAt: checkedAt,
    }),
    recoveryPath: "Fix blockers, rerun focused verification, push a new head if needed, then rerun verify-pr-gates before exact-head merge.",
    metadataOnly: true,
  };
}

function buildOutdatedThreadAdjudicationEvidence(manifest, context = {}) {
  const checkedAt = new Date().toISOString();
  const options = context.options || {};
  const threadId = safeMetadataText(context.threadId, 160);
  const pr = prViewForGates(manifest);
  if (!pr) {
    throw new Error("Could not load PR state for outdated review-thread adjudication.");
  }
  const headState = prGateHeadState(manifest);
  const repositoryRef = githubRepository(manifest);
  const repository = { owner: repositoryRef.owner, name: repositoryRef.name, fullName: `${repositoryRef.owner}/${repositoryRef.name}` };
  const reviewThreadState = fetchReviewThreadState(manifest, repositoryRef, pr.number);
  const nonRequiredCheckPolicy = shapeNonRequiredCheckPolicyEvidence(options, {
    expectedHeadSha: headState.expectedHeadSha,
    worktreePath: manifest.worktree_path,
  });
  const checks = normalizeStatusCheckRollup(pr.statusCheckRollup, nonRequiredCheckPolicy);
  const changedPathInspection = fetchPrChangedPaths(manifest, pr.number, headState.expectedHeadSha, pr.baseRefName, pr.baseRefOid, pr.changedFiles);
  const renamedPathInspection = fetchPrRenamedPaths(manifest, pr.number, headState.expectedHeadSha, pr.baseRefName, pr.baseRefOid, pr.changedFiles);
  const target = reviewThreadState.threadRefs.find((thread) => thread.id === threadId) || null;
  const mapping = shapeOutdatedThreadMappingEvidence(options, {
    requireOutdatedResolutionAuthorization: true,
    laneOwner: manifest.owner,
    currentOwner: currentLaneOwner(options),
    expectedHeadSha: headState.expectedHeadSha,
    expectedPrNumber: pr.number,
    expectedBaseRefName: pr.baseRefName,
    expectedBaseRefOid: pr.baseRefOid,
    threadId,
    changedPaths: changedPathInspection.paths,
    changedPathError: changedPathInspection.error,
    inspectedHeadSha: changedPathInspection.inspectedHeadSha,
    postInspectionHeadSha: changedPathInspection.postInspectionHeadSha,
    inspectedPrNumber: changedPathInspection.inspectedPrNumber,
    postInspectionPrNumber: changedPathInspection.postInspectionPrNumber,
    inspectedBaseRefName: changedPathInspection.inspectedBaseRefName,
    postInspectionBaseRefName: changedPathInspection.postInspectionBaseRefName,
    inspectedBaseRefOid: changedPathInspection.inspectedBaseRefOid,
    postInspectionBaseRefOid: changedPathInspection.postInspectionBaseRefOid,
    targetPath: target?.path || null,
    renamedPaths: renamedPathInspection.paths,
    renamedPathError: renamedPathInspection.error,
  });
  const blockers = outdatedThreadAdjudicationBlockers(manifest, pr, {
    repository, headState,
    checks,
    nonRequiredCheckPolicy,
    reviewThreadState,
    target,
    mapping,
  });
  const requiredGates = [
    "target review thread is unresolved and outdated",
    "exact current PR head matches the managed worktree",
    "all reported checks are terminal-successful or exact-head documented non-required skips",
    "no pending review request, requested change, or unresolved current review thread",
    "bounded request, current-head diff, local verification, and code-review mapping is recorded",
    "every high-risk mapping has explicit operator authorization evidence bound to this named thread and exact head",
    "GitHub resolution remains a separate no-reply action followed by a fresh thread-aware re-audit",
  ];
  const status = blockers.length === 0 ? "ready" : "blocked";
  return {
    schemaVersion: 1,
    status,
    ready: blockers.length === 0,
    checkedAt,
    taskId: manifest.task_id,
    threadId,
    threadUrl: target?.url || null,
    repository,
    expectedHeadSha: headState.expectedHeadSha,
    localHeadSha: headState.localHeadSha,
    pr: {
      number: pr.number || null,
      url: pr.url || null,
      baseRefName: pr.baseRefName || null,
      baseRefOid: exactGitObjectIdOrNull(pr.baseRefOid),
      headRefOid: pr.headRefOid || null,
      reviewDecision: pr.reviewDecision || null,
    },
    checks,
    nonRequiredCheckPolicy,
    reviewThreads: reviewThreadState,
    mapping,
    targetRequestFingerprint: target?.requestFingerprint || null,
    remainingOutdatedThreadRefs: reviewThreadState.unresolvedOutdatedRefs.filter((ref) => ref !== target?.url && ref !== target?.id),
    blockers,
    requiredGates,
    authorityDecision: shapeAuthorityDecisionEvidence({
      operation: "adjudicate-outdated-thread",
      authorityFamily: "review-thread-adjudication",
      decision: status,
      allowed: blockers.length === 0,
      requiredGates,
      satisfiedGates: blockers.length === 0 ? requiredGates : [],
      blockedReasons: blockers,
      stopLines: [
        "records evidence only; never resolves or replies to a GitHub review thread",
        "no merge or cleanup",
        "missing, ambiguous, nonterminal, or newly current feedback blocks adjudication",
        "a fresh thread-aware re-audit is required after any separate GitHub resolution",
      ],
      evidenceRefs: [
        `task:${manifest.task_id}`,
        `repository:${repository.fullName}`,
        pr.number ? `pr:${pr.number}` : "",
        threadId ? `review-thread:${threadId}` : "",
        headState.expectedHeadSha ? `expected-head:${headState.expectedHeadSha}` : "",
      ],
      nextSafeAction: blockers.length === 0
        ? "Resolve only this recorded thread without replying under the active review-thread authority, then rerun a thread-aware audit before merge."
        : "Fix or prove the missing exact-head review evidence, then rerun adjudicate-outdated-thread.",
      recoveryPath: "No GitHub thread, merge, or cleanup mutation was performed. Preserve this packet and rerun after every PR-head or review-state change.",
      generatedAt: checkedAt,
    }),
    metadataOnly: true,
    rawPayloadRetained: false,
  };
}

function buildCurrentThreadAdjudicationEvidence(manifest, context = {}) {
  const checkedAt = new Date().toISOString();
  const options = context.options || {};
  const threadId = safeMetadataText(context.threadId, 160);
  const pr = prViewForGates(manifest);
  if (!pr) throw new Error("Could not load PR state for current review-thread adjudication.");
  const headState = prGateHeadState(manifest);
  const repositoryRef = githubRepository(manifest);
  const repository = { owner: repositoryRef.owner, name: repositoryRef.name, fullName: `${repositoryRef.owner}/${repositoryRef.name}` };
  const reviewThreadState = fetchReviewThreadState(manifest, repositoryRef, pr.number);
  const nonRequiredCheckPolicy = shapeNonRequiredCheckPolicyEvidence(options, {
    expectedHeadSha: headState.expectedHeadSha,
    worktreePath: manifest.worktree_path,
  });
  const checks = normalizeStatusCheckRollup(pr.statusCheckRollup, nonRequiredCheckPolicy);
  const changedPathInspection = fetchPrChangedPaths(manifest, pr.number, headState.expectedHeadSha, pr.baseRefName, pr.baseRefOid, pr.changedFiles);
  const renamedPathInspection = fetchPrRenamedPaths(manifest, pr.number, headState.expectedHeadSha, pr.baseRefName, pr.baseRefOid, pr.changedFiles);
  const mapping = shapeCurrentThreadMappingEvidence(options, {
    laneOwner: manifest.owner,
    currentOwner: currentLaneOwner(options),
    expectedHeadSha: headState.expectedHeadSha,
    expectedPrNumber: pr.number,
    expectedBaseRefName: pr.baseRefName,
    expectedBaseRefOid: pr.baseRefOid,
    threadId,
    changedPaths: changedPathInspection.paths,
    changedPathError: changedPathInspection.error,
    inspectedHeadSha: changedPathInspection.inspectedHeadSha,
    postInspectionHeadSha: changedPathInspection.postInspectionHeadSha,
    inspectedPrNumber: changedPathInspection.inspectedPrNumber,
    postInspectionPrNumber: changedPathInspection.postInspectionPrNumber,
    inspectedBaseRefName: changedPathInspection.inspectedBaseRefName,
    postInspectionBaseRefName: changedPathInspection.postInspectionBaseRefName,
    inspectedBaseRefOid: changedPathInspection.inspectedBaseRefOid,
    postInspectionBaseRefOid: changedPathInspection.postInspectionBaseRefOid,
    renamedPaths: renamedPathInspection.paths,
    renamedPathError: renamedPathInspection.error,
  });
  const target = reviewThreadState.threadRefs.find((thread) => thread.id === threadId) || null;
  const blockers = currentThreadAdjudicationBlockers(manifest, pr, {
    repository, headState, checks, nonRequiredCheckPolicy, reviewThreadState, target, mapping,
  });
  const requiredGates = [
    "target review thread is unresolved and current with a complete canonical all-comment fingerprint",
    "exact repository, PR, and current head match the managed worktree",
    "all reported checks are terminal-successful or exact-head documented non-required skips",
    "no pending review request or requested change; other unresolved threads are retained as explicit merge holds",
    "bounded request, current-head diff, local verification, and independent code-review mapping is recorded",
    "every high-risk mapping has explicit operator authorization evidence bound to this named thread and exact head",
    "GitHub resolution remains a separate named no-reply action followed by a fresh thread-aware re-audit",
  ];
  const status = blockers.length === 0 ? "ready" : "blocked";
  return {
    schemaVersion: 1, status, ready: blockers.length === 0, checkedAt,
    taskId: manifest.task_id, threadId, threadUrl: target?.url || null,
    repository, expectedHeadSha: headState.expectedHeadSha, localHeadSha: headState.localHeadSha,
    pr: { number: pr.number || null, url: pr.url || null, baseRefName: pr.baseRefName || null, baseRefOid: exactGitObjectIdOrNull(pr.baseRefOid), headRefOid: pr.headRefOid || null, reviewDecision: pr.reviewDecision || null },
    checks, nonRequiredCheckPolicy, reviewThreads: reviewThreadState, mapping,
    targetRequestFingerprint: target?.requestFingerprint || null,
    remainingCurrentThreadRefs: reviewThreadState.unresolvedNonOutdatedRefs.filter((ref) => ref !== target?.url && ref !== target?.id),
    remainingOutdatedThreadRefs: reviewThreadState.unresolvedOutdatedRefs,
    blockers, requiredGates,
    authorityDecision: shapeAuthorityDecisionEvidence({
      operation: "adjudicate-current-thread", authorityFamily: "review-thread-current-resolution", decision: status, allowed: blockers.length === 0,
      requiredGates, satisfiedGates: blockers.length === 0 ? requiredGates : [], blockedReasons: blockers,
      stopLines: [
        "records evidence only; never resolves or replies to a GitHub review thread",
        "no merge or cleanup",
        "missing, ambiguous, outdated, newly current, nonterminal, or requested-change feedback blocks current-thread adjudication",
        "a fresh thread-aware re-audit is required immediately before and after any separate GitHub resolution",
      ],
      evidenceRefs: [
        `task:${manifest.task_id}`, `repository:${repository.fullName}`, pr.number ? `pr:${pr.number}` : "", threadId ? `review-thread:${threadId}` : "", headState.expectedHeadSha ? `expected-head:${headState.expectedHeadSha}` : "",
      ],
      nextSafeAction: blockers.length === 0
        ? "Resolve only this recorded current thread without replying under the active review-thread authority, then rerun a thread-aware audit before merge."
        : "Fix or prove the missing exact-head review evidence, then rerun adjudicate-current-thread.",
      recoveryPath: "No GitHub thread, merge, or cleanup mutation was performed. Preserve this packet and rerun after every PR-head or review-state change.", generatedAt: checkedAt,
    }),
    metadataOnly: true, rawPayloadRetained: false,
  };
}

function shapeCurrentThreadMappingEvidence(options = {}, context = {}) {
  const mapping = shapeOutdatedThreadMappingEvidence(options, context);
  const rename = (value) => String(value || "").replaceAll("Outdated-thread", "Current-thread");
  return {
    ...mapping,
    blockers: mapping.blockers.map(rename),
  };
}

function currentThreadAdjudicationBlockers(manifest, pr, context) {
  const blockers = [];
  if (context.repository?.owner !== "slawdawg" || context.repository?.name !== "Kendall-vnxt") blockers.push("Current-thread adjudication only accepts the canonical Kendall_Nxt repository");
  if (pr.state !== "OPEN" || pr.isDraft || pr.mergedAt) blockers.push("PR must be open and non-draft for current-thread adjudication");
  if (!pr.baseRefName || pr.baseRefName !== manifest.base_branch) blockers.push(`PR base is ${pr.baseRefName || "missing"}, expected ${manifest.base_branch}`);
  if (!pr.headRefOid || pr.headRefOid !== context.headState.expectedHeadSha) blockers.push("PR head does not match the exact current-thread adjudication head");
  if (!context.headState.localMatchesExpected) blockers.push("Local HEAD does not match the recorded current-thread adjudication head");
  if (!hasRecordedStandardDeliveryPrState(manifest, pr, context.headState.expectedHeadSha)) blockers.push("Current-thread adjudication requires recorded standard-delivery pr_open evidence");
  if (pr.reviewDecision === "CHANGES_REQUESTED") blockers.push(`PR reviewDecision is ${pr.reviewDecision}`);
  if (context.checks.total === 0) blockers.push("No status checks reported for exact head");
  if (context.checks.pending.length) blockers.push(`Pending checks: ${context.checks.pending.map((check) => check.name).join(", ")}`);
  if (context.checks.failing.length) blockers.push(`Failing checks: ${context.checks.failing.map((check) => check.name).join(", ")}`);
  blockers.push(...(context.nonRequiredCheckPolicy?.blockers || []));
  const audit = context.reviewThreadState;
  if (!audit.querySucceeded) blockers.push("Review-thread query did not return thread-aware evidence");
  if (audit.errorCount > 0) blockers.push(`Review-thread query returned ${audit.errorCount} GraphQL error(s)`);
  if (audit.hasNextPage) blockers.push("Review-thread query returned additional pages; complete thread evidence is required");
  if (audit.reviewRequestHasNextPage) blockers.push("Review-request query returned additional pages; complete review-request evidence is required");
  if (audit.pendingReviewRequestCount > 0) blockers.push(`Pending review requests: ${audit.pendingReviewRequestCount}`);
  if (!context.target) blockers.push("Target review thread was not returned by the thread-aware audit");
  else if (context.target.isResolved) blockers.push("Target review thread is already resolved");
  else if (context.target.isOutdated) blockers.push("Target review thread is not current");
  else if (!context.target.commentsComplete) blockers.push("Target review thread comment evidence is incomplete; full canonical fingerprint is required");
  else if (!context.target.requestFingerprint) blockers.push("Target review thread has no request fingerprint");
  else if (context.mapping?.requestFingerprint !== context.target.requestFingerprint) blockers.push("Current-thread request fingerprint does not match the target review thread");
  else if (context.target.path && !context.mapping?.files?.includes(context.target.path)) blockers.push(`Current-thread mapping omits target review path: ${context.target.path}`);
  if (context.mapping?.highRiskPaths?.length && context.mapping?.highRiskAuthorization?.status !== "authorized") blockers.push(`High-risk current-thread resolution is a stop line: ${context.mapping.highRiskPaths.join(", ")}`);
  blockers.push(...(context.mapping?.blockers || []));
  return blockers;
}

function renderCurrentThreadAdjudicationEvidence(packet = {}) {
  return [
    `thread ${packet.threadId || "unknown"} status=${packet.status || "unknown"}`,
    `repository ${packet.repository?.fullName || "unknown"} pr=${packet.pr?.number || "unknown"} head ${packet.expectedHeadSha || "unknown"}`,
    `checks passed=${packet.checks?.passed?.length ?? 0} pending=${packet.checks?.pending?.length ?? 0} failing=${packet.checks?.failing?.length ?? 0}`,
    `reviewThreads remainingCurrent=${packet.remainingCurrentThreadRefs?.length ?? "unknown"} remainingOutdated=${packet.remainingOutdatedThreadRefs?.length ?? "unknown"} pendingRequests=${packet.reviewThreads?.pendingReviewRequestCount ?? "unknown"}`,
    `mapping status=${packet.mapping?.status || "unknown"}`,
  ];
}

function shapeOutdatedThreadMappingEvidence(options = {}, context = {}) {
  const requestSummary = safeMetadataText(options.requestSummary, 500);
  const diffSummary = safeMetadataText(options.diffSummary, 500);
  const fileSet = diffRiskPathSet(options.mappedFiles);
  const files = fileSet.paths;
  const verification = evidenceText(options.verification, 500);
  const verificationCommand = evidenceText(options.verificationCommand, 300);
  const verificationExitCode = safeMetadataText(options.verificationExitCode, 12);
  const reviewSummary = safeMetadataText(options.reviewSummary, 500);
  const reviewerId = typeof options.reviewerId === "string" ? safeMetadataText(options.reviewerId, 120) : "";
  const reviewerIdIsString = typeof options.reviewerId === "string";
  const laneOwners = [context.laneOwner, context.currentOwner]
    .map((owner) => safeMetadataText(owner, 120))
    .filter(Boolean);
  const requestFingerprint = safeMetadataText(options.requestFingerprint, 80).toLowerCase();
  const changedPaths = Array.isArray(context.changedPaths) ? context.changedPaths : [];
  const renamedPaths = shapeRenamedPathMappings(options.renamedPaths, {
    targetPath: typeof context.targetPath === "string" ? context.targetPath : "",
    changedPaths,
    observedPaths: Array.isArray(context.renamedPaths) ? context.renamedPaths : [],
  });
  // A rename can remove a guarded path from the to-side of the current diff.
  // Classify validated from-paths too, otherwise the authority gate could be
  // bypassed by renaming a high-risk file before resolving its review thread.
  const authoritativeRenamedFromPaths = (Array.isArray(context.renamedPaths) ? context.renamedPaths : [])
    .filter((entry) => typeof entry?.from === "string" && entry.from && typeof entry?.to === "string" && entry.to && entry.from !== entry.to && changedPaths.includes(entry.to))
    .map((entry) => entry.from);
  const highRiskPaths = [...new Set([
    ...changedPaths,
    ...authoritativeRenamedFromPaths,
  ].filter(isHighRiskReviewThreadPath))];
  const highRiskAuthorization = shapeHighRiskThreadAuthorizationEvidence(options, {
    threadId: context.threadId,
    expectedHeadSha: context.expectedHeadSha,
    highRiskPaths,
  });
  const outdatedResolutionAuthorization = context.requireOutdatedResolutionAuthorization === true
    ? shapeOutdatedResolutionAuthorizationEvidence(options, {
      threadId: context.threadId,
      expectedHeadSha: context.expectedHeadSha,
    })
    : {
      schemaVersion: 1,
      status: "not-applicable",
      evidence: null,
      threadId: safeMetadataText(context.threadId, 160) || null,
      expectedHeadSha: exactGitObjectIdOrNull(context.expectedHeadSha) || null,
      blockers: [],
      metadataOnly: true,
    };
  const changedPathError = safeMetadataText(context.changedPathError, 500);
  const renamedPathError = safeMetadataText(context.renamedPathError, 500);
  const uncoveredFiles = files.filter((path) => !changedPaths.includes(path));
  const blockers = [];
  if (!requestSummary) blockers.push("Outdated-thread request summary missing");
  if (!diffSummary) blockers.push("Outdated-thread current-head diff mapping missing");
  if (files.length === 0) blockers.push("Outdated-thread mapped changed files missing");
  if (!verification) blockers.push("Outdated-thread local verification evidence missing");
  if (!verificationCommand) blockers.push("Outdated-thread verification command missing");
  if (verificationExitCode !== "0") blockers.push("Outdated-thread verification result must be exit code 0");
  if (!reviewSummary) blockers.push("Outdated-thread code-review evidence missing");
  if (!reviewerIdIsString && options.reviewerId !== undefined) blockers.push("Outdated-thread reviewer identity must be a non-empty string value");
  else if (!reviewerId) blockers.push("Outdated-thread reviewer identity missing");
  if (reviewerId && laneOwners.includes(reviewerId)) blockers.push("Outdated-thread reviewer identity must not match the lane owner");
  if (!/^[a-f0-9]{64}$/.test(requestFingerprint)) blockers.push("Outdated-thread request fingerprint missing or invalid");
  if (fileSet.error) blockers.push(`Outdated-thread mapped-file evidence is invalid: ${fileSet.error}`);
  if (!context.inspectedHeadSha) blockers.push("Outdated-thread changed-path inspection is not bound to an exact PR head");
  if (context.inspectedHeadSha && context.expectedHeadSha && context.inspectedHeadSha !== context.expectedHeadSha) blockers.push("Outdated-thread changed-path inspection no longer matches the exact PR head");
  if (!context.postInspectionHeadSha || context.postInspectionHeadSha !== context.expectedHeadSha) blockers.push("Outdated-thread PR head changed during changed-path inspection");
  if (!Number.isSafeInteger(context.expectedPrNumber) || context.expectedPrNumber <= 0 || context.inspectedPrNumber !== context.expectedPrNumber || context.postInspectionPrNumber !== context.expectedPrNumber) blockers.push("Outdated-thread changed-path inspection is not bound to the exact PR identity");
  if (!context.expectedBaseRefName || context.inspectedBaseRefName !== context.expectedBaseRefName || context.postInspectionBaseRefName !== context.expectedBaseRefName) blockers.push("Outdated-thread PR base changed during changed-path inspection");
  if (!exactGitObjectIdOrNull(context.expectedBaseRefOid) || context.inspectedBaseRefOid !== context.expectedBaseRefOid || context.postInspectionBaseRefOid !== context.expectedBaseRefOid) blockers.push("Outdated-thread PR base commit changed during changed-path inspection");
  if (changedPathError) blockers.push(`Outdated-thread changed-path inspection failed: ${changedPathError}`);
  if (renamedPathError) blockers.push(`Outdated-thread rename inspection failed: ${renamedPathError}`);
  if (!changedPathError && changedPaths.length === 0) blockers.push("Outdated-thread changed-path inspection returned no paths");
  if (uncoveredFiles.length) blockers.push(`Outdated-thread mapping names paths absent from the current PR diff: ${uncoveredFiles.join(", ")}`);
  blockers.push(...renamedPaths.blockers);
  blockers.push(...highRiskAuthorization.blockers);
  if (context.requireOutdatedResolutionAuthorization === true) {
    blockers.push(...outdatedResolutionAuthorization.blockers);
  }
  return {
    schemaVersion: 1,
    status: blockers.length ? "missing" : "recorded",
    requestSummary: requestSummary || null,
    diffSummary: diffSummary || null,
    files,
    verification: verification || null,
    verificationCommand: verificationCommand || null,
    verificationExitCode: verificationExitCode || null,
    reviewSummary: reviewSummary || null,
    reviewerId: reviewerId || null,
    requestFingerprint: requestFingerprint || null,
    highRiskPaths,
    highRiskAuthorization,
    outdatedResolutionAuthorization,
    expectedHeadSha: safeMetadataText(context.expectedHeadSha, 80) || null,
    expectedPrNumber: Number.isSafeInteger(context.expectedPrNumber) ? context.expectedPrNumber : null,
    expectedBaseRefName: safeMetadataText(context.expectedBaseRefName, 300) || null,
    expectedBaseRefOid: exactGitObjectIdOrNull(context.expectedBaseRefOid),
    inspectedHeadSha: safeMetadataText(context.inspectedHeadSha, 80) || null,
    postInspectionHeadSha: safeMetadataText(context.postInspectionHeadSha, 80) || null,
    inspectedPrNumber: Number.isSafeInteger(context.inspectedPrNumber) ? context.inspectedPrNumber : null,
    postInspectionPrNumber: Number.isSafeInteger(context.postInspectionPrNumber) ? context.postInspectionPrNumber : null,
    inspectedBaseRefName: safeMetadataText(context.inspectedBaseRefName, 300) || null,
    postInspectionBaseRefName: safeMetadataText(context.postInspectionBaseRefName, 300) || null,
    inspectedBaseRefOid: exactGitObjectIdOrNull(context.inspectedBaseRefOid),
    postInspectionBaseRefOid: exactGitObjectIdOrNull(context.postInspectionBaseRefOid),
    changedPaths,
    renamedPaths: renamedPaths.entries,
    blockers,
    metadataOnly: true,
  };
}

function shapeOutdatedResolutionAuthorizationEvidence(options = {}, context = {}) {
  const evidence = typeof options.outdatedResolutionAuthorization === "string" && options.outdatedResolutionAuthorization.length <= 500
    ? options.outdatedResolutionAuthorization
    : "";
  const threadId = safeMetadataText(context.threadId, 160);
  const expectedHeadSha = exactGitObjectIdOrNull(context.expectedHeadSha) || null;
  const expected = threadId && expectedHeadSha ? `operator-authorized outdated-thread=${threadId} head=${expectedHeadSha}` : "";
  const authorized = Boolean(expected) && evidence === expected;
  return {
    schemaVersion: 1,
    status: authorized ? "authorized" : "blocked",
    evidence: evidence || null,
    threadId: threadId || null,
    expectedHeadSha,
    blockers: authorized ? [] : ["Outdated review-thread resolution requires exact operator evidence: operator-authorized outdated-thread=<id> head=<sha>"],
    metadataOnly: true,
  };
}

function hasRecordedStandardDeliveryPrState(manifest, pr, expectedHeadSha) {
  const delivery = manifest.pr_delivery_evidence;
  return manifest.status === "pr_open"
    && delivery?.status === "recorded"
    && delivery?.authorityProfile === "standard-delivery"
    && delivery?.taskId === manifest.task_id
    && delivery?.branch === manifest.branch
    && delivery?.baseBranch === manifest.base_branch
    && delivery?.headRevision === expectedHeadSha
    && delivery?.pullRequestNumber === pr?.number
    && pr?.headRefName === manifest.branch
    && delivery?.pullRequestUrl === pr?.url;
}

function synchronizeStandardDeliveryEvidenceAfterHeadRebind(existing, packet) {
  if (!existing || existing.status !== "recorded" || existing.authorityProfile !== "standard-delivery") return existing || null;
  if (existing.headRevision !== packet.priorHeadSha) return existing;
  return {
    ...existing,
    headRevision: packet.newHeadSha,
    authorityDecision: synchronizeStandardDeliveryAuthorityDecision(existing.authorityDecision, packet),
    deliveryHeadRefresh: {
      schemaVersion: 1,
      priorHeadSha: packet.priorHeadSha,
      newHeadSha: packet.newHeadSha,
      checkedAt: packet.checkedAt,
      reason: packet.reason,
      metadataOnly: true,
      rawPayloadRetained: false,
    },
  };
}

function synchronizeStandardDeliveryAuthorityDecision(existing, packet) {
  if (!existing || typeof existing !== "object" || Array.isArray(existing)) return existing || null;
  const evidenceRefs = Array.isArray(existing.evidenceRefs) ? existing.evidenceRefs : [];
  return shapeAuthorityDecisionEvidence({
    ...existing,
    evidenceRefs: [
      ...evidenceRefs.filter((entry) => entry !== `head:${packet.priorHeadSha}`),
      `head:${packet.newHeadSha}`,
    ],
  });
}

function shapeRenamedPathMappings(value, context = {}) {
  const raw = String(value || "");
  if (!raw) return { entries: [], blockers: [] };
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { entries: [], blockers: ["Outdated-thread renamed-path evidence is invalid JSON"] };
  }
  if (!Array.isArray(parsed)) return { entries: [], blockers: ["Outdated-thread renamed-path evidence must be a JSON array"] };
  const entries = [];
  const blockers = [];
  const seenFrom = new Set();
  for (const entry of parsed) {
    const from = entry?.from;
    const to = entry?.to;
    if (typeof from !== "string" || typeof to !== "string" || !from || !to || from.includes("\0") || to.includes("\0") || from === to || seenFrom.has(from)) {
      blockers.push("Outdated-thread renamed-path evidence contains an invalid or ambiguous mapping");
      continue;
    }
    seenFrom.add(from);
    entries.push({ from, to });
  }
  if (entries.some((entry) => !context.changedPaths.includes(entry.to))) blockers.push("Outdated-thread renamed-path target is absent from the current PR diff");
  if (context.targetPath && entries.length && !entries.some((entry) => entry.from === context.targetPath)) blockers.push("Outdated-thread renamed-path evidence does not bind the target review path");
  const observed = context.observedPaths || [];
  if (entries.some((entry) => !observed.some((candidate) => candidate?.from === entry.from && candidate?.to === entry.to))) blockers.push("Outdated-thread renamed-path evidence is not proven by the exact PR rename metadata");
  return { entries, blockers };
}

function outdatedThreadMappingCoversTargetPath(mapping, targetPath) {
  if (mapping?.files?.includes(targetPath)) return true;
  return (mapping?.renamedPaths || []).some((entry) => entry?.from === targetPath && mapping?.files?.includes(entry.to));
}

function shapeHighRiskThreadAuthorizationEvidence(options = {}, context = {}) {
  // This evidence is an exact operator binding, not prose. Do not normalize
  // whitespace before comparison: a leading/trailing byte or newline must
  // fail rather than silently becoming authority for a GitHub mutation.
  const rawEvidence = typeof options.highRiskAuthorization === "string" ? options.highRiskAuthorization : "";
  const evidence = rawEvidence.length <= 500 ? rawEvidence : "";
  const highRiskPaths = Array.isArray(context.highRiskPaths) ? context.highRiskPaths : [];
  const threadId = safeMetadataText(context.threadId, 160);
  const expectedHeadSha = exactGitObjectIdOrNull(context.expectedHeadSha) || null;
  const blockers = [];
  const canonicalEvidence = threadId && expectedHeadSha
    ? `operator-authorized thread=${threadId} head=${expectedHeadSha}`
    : "";
  const hasExactBinding = evidence === canonicalEvidence;
  if (highRiskPaths.length && !hasExactBinding) {
    blockers.push("High-risk review-thread resolution requires exact operator evidence: operator-authorized thread=<id> head=<sha>");
  }
  if (!highRiskPaths.length && evidence) {
    blockers.push("High-risk review-thread authorization is only valid when the exact audited PR diff contains a high-risk path");
  }
  if (evidence && (!threadId || !expectedHeadSha)) {
    blockers.push("High-risk review-thread authorization could not bind to one exact thread and PR head");
  }
  return {
    schemaVersion: 1,
    status: blockers.length ? "blocked" : highRiskPaths.length ? "authorized" : "not-required",
    evidence: evidence || null,
    threadId: threadId || null,
    expectedHeadSha,
    highRiskPaths,
    blockers,
    metadataOnly: true,
  };
}

function outdatedThreadAdjudicationBlockers(manifest, pr, context) {
  const blockers = [];
  if (context.repository?.owner !== "slawdawg" || context.repository?.name !== "Kendall-vnxt") blockers.push("Outdated-thread adjudication only accepts the canonical Kendall_Nxt repository");
  if (pr.state !== "OPEN" || pr.isDraft || pr.mergedAt) blockers.push("PR must be open and non-draft for outdated-thread adjudication");
  if (!pr.baseRefName || pr.baseRefName !== manifest.base_branch) blockers.push(`PR base is ${pr.baseRefName || "missing"}, expected ${manifest.base_branch}`);
  if (!pr.headRefOid || pr.headRefOid !== context.headState.expectedHeadSha) blockers.push("PR head does not match the exact adjudication head");
  if (!context.headState.localMatchesExpected) blockers.push("Local HEAD does not match the recorded adjudication head");
  if (!hasRecordedStandardDeliveryPrState(manifest, pr, context.headState.expectedHeadSha)) blockers.push("Outdated-thread adjudication requires recorded standard-delivery pr_open evidence");
  if (pr.reviewDecision === "CHANGES_REQUESTED") blockers.push(`PR reviewDecision is ${pr.reviewDecision}`);
  if (context.checks.total === 0) blockers.push("No status checks reported for exact head");
  if (context.checks.pending.length) blockers.push(`Pending checks: ${context.checks.pending.map((check) => check.name).join(", ")}`);
  if (context.checks.failing.length) blockers.push(`Failing checks: ${context.checks.failing.map((check) => check.name).join(", ")}`);
  blockers.push(...(context.nonRequiredCheckPolicy?.blockers || []));
  if (!context.reviewThreadState.querySucceeded) blockers.push("Review-thread query did not return thread-aware evidence");
  if (context.reviewThreadState.errorCount > 0) blockers.push(`Review-thread query returned ${context.reviewThreadState.errorCount} GraphQL error(s)`);
  if (context.reviewThreadState.hasNextPage) blockers.push("Review-thread query returned additional pages; complete thread evidence is required");
  if (context.reviewThreadState.reviewRequestHasNextPage) blockers.push("Review-request query returned additional pages; complete review-request evidence is required");
  if (context.reviewThreadState.pendingReviewRequestCount > 0) blockers.push(`Pending review requests: ${context.reviewThreadState.pendingReviewRequestCount}`);
  if (context.reviewThreadState.unresolvedNonOutdatedCount > 0) blockers.push(`Unresolved current review threads: ${context.reviewThreadState.unresolvedNonOutdatedCount}`);
  if (!context.target) blockers.push("Target review thread was not returned by the thread-aware audit");
  else if (context.target.isResolved) blockers.push("Target review thread is already resolved");
  else if (!context.target.isOutdated) blockers.push("Target review thread is not outdated");
  else if (!context.target.commentsComplete) blockers.push("Target review thread comment evidence is incomplete; full canonical fingerprint is required");
  else if (!context.target.requestFingerprint) blockers.push("Target review thread has no request fingerprint");
  else if (context.mapping?.requestFingerprint !== context.target.requestFingerprint) blockers.push("Outdated-thread request fingerprint does not match the target review thread");
  else if (context.target.path && !outdatedThreadMappingCoversTargetPath(context.mapping, context.target.path)) blockers.push(`Outdated-thread mapping omits target review path: ${context.target.path}`);
  if (context.mapping?.highRiskPaths?.length && context.mapping?.highRiskAuthorization?.status !== "authorized") blockers.push(`High-risk outdated-thread resolution is a stop line: ${context.mapping.highRiskPaths.join(", ")}`);
  blockers.push(...(context.mapping?.blockers || []));
  return blockers;
}

function renderOutdatedThreadAdjudicationEvidence(packet = {}) {
  return [
    `thread ${packet.threadId || "unknown"} status=${packet.status || "unknown"}`,
    `head ${packet.expectedHeadSha || "unknown"}`,
    `checks passed=${packet.checks?.passed?.length ?? 0} pending=${packet.checks?.pending?.length ?? 0} failing=${packet.checks?.failing?.length ?? 0}`,
    `reviewThreads current=${packet.reviewThreads?.unresolvedNonOutdatedCount ?? "unknown"} pendingRequests=${packet.reviewThreads?.pendingReviewRequestCount ?? "unknown"} remainingOutdated=${packet.remainingOutdatedThreadRefs?.length ?? "unknown"}`,
    `mapping status=${packet.mapping?.status || "unknown"}`,
  ];
}

function shapeDeliverySubagentAuditEvidence(manifest, options = {}, context = {}) {
  const existing = manifest.delivery_subagent_audit && typeof manifest.delivery_subagent_audit === "object"
    ? manifest.delivery_subagent_audit
    : {};
  const status = normalizeDeliveryAuditStatus(options.deliveryAuditStatus ?? existing.status);
  const agent = safeMetadataText(options.deliveryAuditAgent ?? existing.agent, 120);
  const summary = safeMetadataText(options.deliveryAuditSummary ?? existing.summary, 500);
  const expectedHeadSha = safeMetadataText(context.expectedHeadSha || "", 80);
  const headSha = safeMetadataText(options.deliveryAuditHeadSha ?? existing.headSha ?? expectedHeadSha, 80);
  const checkedAt = context.checkedAt || new Date().toISOString();
  const blockers = [];

  if (!agent) {
    blockers.push("Delivery subagent audit agent missing");
  }
  if (!summary) {
    blockers.push("Delivery subagent audit summary missing");
  }
  if (!status) {
    blockers.push("Delivery subagent audit status missing");
  } else if (!deliveryAuditAcceptableStatuses(context).includes(status)) {
    blockers.push(`Delivery subagent audit status is ${status}`);
  }
  if (!headSha) {
    blockers.push("Delivery subagent audit head missing");
  } else if (expectedHeadSha && headSha !== expectedHeadSha) {
    blockers.push(`Delivery subagent audit head ${headSha} does not match expected head ${expectedHeadSha}`);
  }

  return {
    schemaVersion: 1,
    status: status || "missing",
    agent: agent || null,
    summary: summary || null,
    headSha: headSha || null,
    checkedAt,
    source: "delivery-subagent",
    blockers,
    metadataOnly: true,
    rawPayloadRetained: false,
  };
}

function deliveryAuditAcceptableStatuses(context = {}) {
  const statuses = Array.isArray(context.acceptableStatuses) ? context.acceptableStatuses : ["merge-ready"];
  return statuses.map((status) => normalizeDeliveryAuditStatus(status)).filter(Boolean);
}

function normalizeDeliveryAuditStatus(value) {
  const status = safeMetadataText(value, 80)
    .toLowerCase()
    .replace(/_/g, "-");
  if (!status) {
    return "";
  }
  if (["merge-ready", "merge-ready.", "ready"].includes(status)) {
    return "merge-ready";
  }
  if (["cleanup-ready", "cleanup-ready."].includes(status)) {
    return "cleanup-ready";
  }
  if (["hold", "needs-coordinator-action", "needs-action", "blocked"].includes(status)) {
    return status;
  }
  return status;
}

function safeMetadataText(value, maxLength) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function evidenceText(value, maxLength) {
  return typeof value === "string" ? safeMetadataText(value, maxLength) : "";
}

function shapeExactHeadMergePlanEvidence(options = {}, context = {}) {
  const plannedMergeMethod = safeMetadataText(options.mergeMethod, 500);
  const rollbackPath = typeof options.rollbackPath === "string" ? safeMetadataText(options.rollbackPath, 500) : "";
  const expectedHeadSha = safeMetadataText(context.expectedHeadSha, 80);
  const prNumber = Number(context.prNumber);
  const blockers = [];
  if (!plannedMergeMethod) {
    blockers.push("Planned exact-head merge method is missing; provide --merge-method");
  } else {
    const exactMergeCommand = `gh pr merge ${prNumber} --merge --match-head-commit ${expectedHeadSha}`;
    if (plannedMergeMethod !== exactMergeCommand) {
      blockers.push("Planned merge method must use gh pr merge <PR> --merge --match-head-commit <expected-head>");
    }
    if (/(?:^|\s)(?:--admin|--delete-branch|--cleanup|--repo)(?:\s|=|$)|(?:^|\s)-(?!-)[^\s]+/.test(plannedMergeMethod)) {
      blockers.push("Planned merge method must not include admin, cleanup, repository-target, or short flags");
    }
  }
  if (!rollbackPath) {
    blockers.push("Bounded rollback or recovery path is missing; provide --rollback-path");
  }
  return {
    plannedMergeMethod: plannedMergeMethod || null,
    rollbackPath: rollbackPath || null,
    expectedHeadSha: expectedHeadSha || null,
    metadataOnly: true,
    rawPayloadRetained: false,
    blockers,
  };
}

function prGateHeadState(manifest) {
  const result = git(["rev-parse", "HEAD"], { cwd: manifest.worktree_path });
  if (result.code !== 0 || !result.stdout.trim()) {
    throw new Error("Could not resolve local HEAD for PR gate evidence.");
  }
  const localHeadSha = result.stdout.trim();
  const recorded = String(manifest.pr_delivery_head_sha || "").trim();
  return {
    expectedHeadSha: recorded || localHeadSha,
    localHeadSha,
    recordedHeadSha: recorded || null,
    localMatchesExpected: !recorded || recorded === localHeadSha,
  };
}

function prGateBlockers(manifest, pr, context) {
  const blockers = [];
  if (context.repository?.owner !== "slawdawg" || context.repository?.name !== "Kendall-vnxt") blockers.push("Managed PR gate only accepts the canonical Kendall_Nxt repository");
  if (!pr.number) {
    blockers.push("PR number missing");
  }
  if (pr.state !== "OPEN") {
    blockers.push(`PR state is ${pr.state || "unknown"}, expected OPEN`);
  }
  if (pr.isDraft) {
    blockers.push("PR is draft");
  }
  if (pr.mergedAt) {
    blockers.push("PR is already merged");
  }
  if (!pr.baseRefName) {
    blockers.push("PR baseRefName missing");
  } else if (pr.baseRefName !== manifest.base_branch) {
    blockers.push(`PR base is ${pr.baseRefName}, expected ${manifest.base_branch}`);
  }
  if (!pr.headRefOid) {
    blockers.push("PR headRefOid missing");
  } else if (pr.headRefOid !== context.headState.expectedHeadSha) {
    blockers.push(`PR head ${pr.headRefOid} does not match expected head ${context.headState.expectedHeadSha}`);
  }
  if (!pr.headRefName) {
    blockers.push("PR headRefName missing");
  } else if (context.managedGate !== false && pr.headRefName !== manifest.branch) {
    blockers.push(`PR head branch ${pr.headRefName} does not match managed branch ${manifest.branch}`);
  }
  if (!exactGitObjectIdOrNull(context.initialBaseRefOid) || pr.baseRefOid !== context.initialBaseRefOid) {
    blockers.push("PR base commit changed while collecting gate evidence");
  }
  if (!context.headState.localMatchesExpected) {
    blockers.push(`Local HEAD ${context.headState.localHeadSha} does not match recorded delivery head ${context.headState.expectedHeadSha}`);
  }
  if (context.managedGate !== false && !hasRecordedStandardDeliveryPrState(manifest, pr, context.headState.expectedHeadSha)) {
    blockers.push("Managed PR gate requires recorded standard-delivery pr_open evidence");
  }
  if (context.finalLocalStateChanged) {
    blockers.push("Local HEAD or worktree state changed during the final review-thread audit");
  }
  if (context.worktreeStatus?.any) {
    blockers.push("Managed merge gate requires a clean worktree for exact-head verification evidence");
  }
  if (!pr.mergeStateStatus) {
    blockers.push("PR mergeStateStatus missing");
  } else if (pr.mergeStateStatus !== "CLEAN") {
    blockers.push(`PR mergeStateStatus is ${pr.mergeStateStatus}`);
  }
  if (["CHANGES_REQUESTED", "REVIEW_REQUIRED"].includes(pr.reviewDecision)) {
    blockers.push(`PR reviewDecision is ${pr.reviewDecision}`);
  }
  if (context.checks.total === 0) {
    blockers.push("No status checks reported for exact head");
  }
  if (context.checks.pending.length) {
    blockers.push(`Pending checks: ${context.checks.pending.map((check) => check.name).join(", ")}`);
  }
  if (context.checks.failing.length) {
    blockers.push(`Failing checks: ${context.checks.failing.map((check) => check.name).join(", ")}`);
  }
  if (context.checkSnapshotChanged) {
    blockers.push("Status checks changed while collecting the remaining gate evidence");
  }
  if (context.finalPrSnapshotChanged) {
    blockers.push("PR identity or status checks changed during the final review-thread audit");
  }
  if (context.reviewThreadSnapshotChanged) {
    blockers.push("Review-thread state changed while collecting the remaining gate evidence");
  }
  blockers.push(...(context.nonRequiredCheckPolicy?.blockers || []));
  if (!context.reviewThreadState.querySucceeded) {
    blockers.push("Review-thread query did not return thread-aware evidence");
  }
  if (context.reviewThreadState.errorCount > 0) {
    blockers.push(`Review-thread query returned ${context.reviewThreadState.errorCount} GraphQL error(s)`);
  }
  if (context.reviewThreadState.hasNextPage) {
    blockers.push("Review-thread query returned additional pages; complete thread evidence is required");
  }
  if (context.reviewThreadState.unresolvedNonOutdatedCount > 0) {
    blockers.push(`Unresolved non-outdated review threads: ${context.reviewThreadState.unresolvedNonOutdatedCount}`);
  }
  if (context.reviewThreadState.unresolvedOutdatedCount > 0) {
    blockers.push(`Unresolved outdated review threads require adjudication: ${context.reviewThreadState.unresolvedOutdatedCount}`);
  }
  if (context.reviewThreadState.pendingReviewRequestCount > 0) {
    blockers.push(`Pending review requests: ${context.reviewThreadState.pendingReviewRequestCount}`);
  }
  if (context.reviewThreadState.reviewRequestHasNextPage) {
    blockers.push("Review-request query returned additional pages; complete review-request evidence is required");
  }
  blockers.push(...(context.deliverySubagentAudit?.blockers || []));
  blockers.push(...(context.diffRiskEvidence?.blockers || []));
  blockers.push(...(context.mergePlan?.blockers || []));
  const resolutionOutcomes = [
    ...(context.currentResolutionOutcomes || []).map((outcome) => ({ kind: "current", outcome })),
    ...(context.outdatedResolutionOutcomes || []).map((outcome) => ({ kind: "outdated", outcome })),
  ];
  const unrecovered = resolutionOutcomes.filter(({ kind, outcome }) => isUnrecoveredResolutionAttempt(resolutionOutcomes, kind, outcome));
  if (unrecovered.length) blockers.push(`Unrecovered review-thread mutation outcomes: ${unrecovered.map(({ outcome }) => outcome.threadId || "unknown").join(", ")}`);
  return blockers;
}

function resolutionAttemptSupersedes(superseder, supersederKind, attempt, attemptKind) {
  const supersederCompletedAt = Date.parse(superseder?.completedAt || superseder?.attemptedAt || "");
  const attemptCompletedAt = Date.parse(attempt?.completedAt || attempt?.attemptedAt || "");
  const sameKind = supersederKind === attemptKind;
  const currentToOutdated = supersederKind === "outdated"
    && attemptKind === "current"
    && superseder?.supersededAttemptKind === "current"
    && superseder?.mutation?.status === "retry-authorized-after-kind-change";
  return (sameKind || currentToOutdated)
    && isNonEmptyResolutionIdentifier(superseder?.attemptId)
    && isNonEmptyResolutionIdentifier(superseder?.supersedesAttemptId)
    && isNonEmptyResolutionIdentifier(attempt?.attemptId)
    && hasValidResolutionRecoveryChainAttempt(superseder)
    && hasValidResolutionRecoveryChainAttempt(attempt)
    && superseder.attemptId !== attempt.attemptId
    && superseder.supersedesAttemptId === attempt.attemptId
    && superseder?.threadId === attempt?.threadId
    && superseder?.repository?.fullName === attempt?.repository?.fullName
    && superseder?.expectedHeadSha === attempt?.expectedHeadSha
    && superseder?.targetRequestFingerprint === attempt?.targetRequestFingerprint
    && Number.isFinite(supersederCompletedAt)
    && Number.isFinite(attemptCompletedAt)
    && supersederCompletedAt > attemptCompletedAt;
}

function resolutionAttemptRecovered(outcomes, attemptKind, attempt) {
  const visited = new Set([attempt?.attemptId]);
  const queue = [attempt];
  let hops = 0;
  while (queue.length && hops < maxResolutionRecoveryHops) {
    hops += 1;
    const prior = queue.shift();
    for (const candidate of outcomes || []) {
      if (!resolutionAttemptSupersedes(candidate.outcome, candidate.kind, prior, attemptKind)) continue;
      if (isValidTerminalResolutionOutcome(candidate.outcome)) return true;
      if (!visited.has(candidate.outcome?.attemptId)) {
        visited.add(candidate.outcome?.attemptId);
        queue.push(candidate.outcome);
      }
    }
  }
  return false;
}

function isNonEmptyResolutionIdentifier(value) {
  return typeof value === "string" && Boolean(value.trim());
}

function isCanonicalResolutionRepositoryFullName(value) {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(value);
}

function isValidResolutionTargetRequestFingerprint(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function hasValidResolutionRecoveryChainAttempt(attempt) {
  const attemptedAt = Date.parse(attempt?.attemptedAt || "");
  const hasCompletedAt = Object.hasOwn(attempt || {}, "completedAt");
  const completedAt = Date.parse(attempt?.completedAt || "");
  const isInitialAttemptRecorded = attempt?.mutation?.status === "attempt-recorded"
    && !isNonEmptyResolutionIdentifier(attempt?.supersedesAttemptId);
  return isNonEmptyResolutionIdentifier(attempt?.attemptId)
    && isNonEmptyResolutionIdentifier(attempt?.threadId)
    && exactGitObjectIdOrNull(attempt?.expectedHeadSha) === attempt?.expectedHeadSha
    && isCanonicalResolutionRepositoryFullName(attempt?.repository?.fullName)
    && isValidResolutionTargetRequestFingerprint(attempt?.targetRequestFingerprint)
    && recognizedResolutionRecoveryMutations.has(attempt?.mutation?.status)
    && Number.isFinite(attemptedAt)
    && (isInitialAttemptRecorded
      ? (!hasCompletedAt || (Number.isFinite(completedAt) && completedAt >= attemptedAt))
      : (hasCompletedAt && Number.isFinite(completedAt) && completedAt >= attemptedAt));
}

function hasCompleteResolutionAttemptIdentity(attempt) {
  const attemptedAt = Date.parse(attempt?.attemptedAt || "");
  const completedAt = Date.parse(attempt?.completedAt || "");
  return hasValidResolutionRecoveryChainAttempt(attempt)
    && Number.isFinite(completedAt)
    && completedAt >= attemptedAt;
}

function isValidTerminalResolutionOutcome(attempt) {
  return (
    attempt?.status === "resolved"
    && ["confirmed-by-mutation-response", "confirmed-by-post-audit-recovery"].includes(attempt?.mutation?.status)
    && hasCompleteResolutionAttemptIdentity(attempt)
  ) || (
    attempt?.status === "superseded"
    && ["retry-authorized-after-live-unresolved-audit", "retry-authorized-after-kind-change"].includes(attempt?.mutation?.status)
    && hasCompleteResolutionAttemptIdentity(attempt)
  );
}

function isMalformedResolutionOutcome(attempt) {
  if (isResolutionRetentionOverflow(attempt)) return false;
  if (["resolved", "superseded"].includes(attempt?.status)) return !isValidTerminalResolutionOutcome(attempt);
  if (attempt?.status === "needs-recovery" || attempt?.mutation?.status === "attempt-recorded") return !hasValidResolutionRecoveryChainAttempt(attempt);
  return attempt?.status !== "needs-recovery" && attempt?.mutation?.status !== "attempt-recorded";
}

function isUnrecoveredResolutionAttempt(outcomes, attemptKind, attempt) {
  return isResolutionRetentionOverflow(attempt)
    || isMalformedResolutionOutcome(attempt)
    || ((attempt?.status === "needs-recovery" || attempt?.mutation?.status === "attempt-recorded")
    && !resolutionAttemptRecovered(outcomes, attemptKind, attempt));
}

function isUnrecoveredResolutionAttemptSameKind(outcomes, attempt) {
  const normalized = (Array.isArray(outcomes) ? outcomes : []).map((outcome) => ({ kind: "same-kind", outcome }));
  return isUnrecoveredResolutionAttempt(normalized, "same-kind", attempt);
}

function renderPrGateEvidence(packet = {}) {
  return [
    `PR ${packet.pr?.number || "unknown"}`,
    `head ${packet.pr?.headRefOid || "unknown"}`,
    `expected ${packet.expectedHeadSha || "unknown"}`,
    `mergeStateStatus ${packet.pr?.mergeStateStatus || "unknown"}`,
    `checks total=${packet.checks?.total ?? 0} passed=${packet.checks?.passed?.length ?? 0} pending=${packet.checks?.pending?.length ?? 0} failing=${packet.checks?.failing?.length ?? 0} nonRequiredPolicy=${packet.nonRequiredCheckPolicy?.policyRef || "none"}`,
    `reviewThreads unresolvedNonOutdated=${packet.reviewThreads?.unresolvedNonOutdatedCount ?? "unknown"} unresolvedOutdated=${packet.reviewThreads?.unresolvedOutdatedCount ?? "unknown"} pendingRequests=${packet.reviewThreads?.pendingReviewRequestCount ?? "unknown"}`,
    `deliveryAudit status=${packet.deliverySubagentAudit?.status || "unknown"} agent=${packet.deliverySubagentAudit?.agent || "unknown"}`,
    `diffRisk status=${packet.diffRiskEvidence?.status || "unknown"}`,
    `mergePlan method=${packet.mergePlan?.plannedMergeMethod || "unknown"} rollback=${packet.mergePlan?.rollbackPath || "unknown"}`,
    `status ${packet.status || "unknown"}`,
  ];
}

function normalizeStatusCheckRollup(rollup, nonRequiredCheckPolicy = {}) {
  const nodes = Array.isArray(rollup)
    ? rollup
    : Array.isArray(rollup?.nodes)
      ? rollup.nodes
      : [];
  const checks = nodes.map((node) => {
    const name = node.name || node.workflowName || node.context || node.__typename || "unnamed-check";
    const status = String(node.status || node.state || "").toUpperCase() || null;
    const rawConclusion = String(node.conclusion || "").toUpperCase() || null;
    const conclusion = rawConclusion || statusContextConclusion(status);
    return {
      name,
      status,
      conclusion,
      detailsUrl: node.detailsUrl || node.targetUrl || null,
    };
  }).sort((left, right) => JSON.stringify([left.name, left.status, left.conclusion, left.detailsUrl])
    .localeCompare(JSON.stringify([right.name, right.status, right.conclusion, right.detailsUrl])));
  const terminal = (check) => terminalCheckStatus(check.status);
  const acceptedSkipped = (check) => terminal(check) && check.conclusion === "SKIPPED"
    && nonRequiredCheckPolicy.names?.includes(check.name)
    && Boolean(nonRequiredCheckPolicy.policyRef)
    && nonRequiredCheckPolicy.valid === true
    && Boolean(nonRequiredCheckPolicy.expectedHeadSha);
  const passed = checks.filter((check) => terminal(check) && (check.conclusion === "SUCCESS" || acceptedSkipped(check)));
  const pending = checks.filter((check) => !terminal(check) && pendingCheckStatus(check.status));
  const failing = checks.filter((check) => terminal(check) && (
    !check.conclusion || (check.conclusion !== "SUCCESS" && !acceptedSkipped(check))
  ));
  const unknown = checks.filter((check) => !terminal(check) && !pendingCheckStatus(check.status));
  return {
    total: checks.length,
    passed,
    pending,
    failing: [...failing, ...unknown],
    checks,
  };
}

function terminalCheckStatus(status) {
  return ["COMPLETED", "SUCCESS", "FAILURE", "ERROR", "NEUTRAL", "SKIPPED", "CANCELLED", "TIMED_OUT"].includes(status || "");
}

function statusContextConclusion(status) {
  if (["SUCCESS", "FAILURE", "ERROR"].includes(status || "")) {
    return status;
  }
  return null;
}

function pendingCheckStatus(status) {
  return ["PENDING", "QUEUED", "IN_PROGRESS", "REQUESTED", "WAITING", "EXPECTED", "ACTION_REQUIRED"].includes(status || "");
}

function githubRepository(manifest) {
  const result = runChecked("gh", ["repo", "view", "--json", "owner,name"], {
    cwd: manifest.worktree_path,
  });
  const parsed = parseGhJson(result.stdout, "repository metadata");
  const owner = typeof parsed.owner === "string" ? parsed.owner : parsed.owner?.login;
  if (!owner || !parsed.name) {
    throw new Error("GitHub CLI repository metadata omitted owner or name.");
  }
  return { owner, name: parsed.name };
}

function fetchReviewThreadState(manifest, repository, prNumber) {
  const query = [
    "query($owner:String!,$name:String!,$number:Int!,$after:String){",
    "repository(owner:$owner,name:$name){",
    "pullRequest(number:$number){",
    "reviewThreads(first:100,after:$after){",
    "nodes{id,isResolved,isOutdated,path,comments(first:100){nodes{id,url,body}pageInfo{hasNextPage,endCursor}}}",
    "pageInfo{hasNextPage,endCursor}",
    "}",
    "}",
    "}",
    "}",
  ].join("");
  const nodes = [];
  const errors = [];
  let cursor = null;
  let connectionComplete = true;
  let reviewThreadComplete = true;
  let hasNextPage = false;
  let pages = 0;
  do {
    if (pages++ >= 100) {
      hasNextPage = true;
      connectionComplete = false;
      break;
    }
    const args = ["api", "graphql", "-f", `query=${query}`, "-F", `owner=${repository.owner}`, "-F", `name=${repository.name}`, "-F", `number=${prNumber}`];
    if (cursor) args.push("-F", `after=${cursor}`);
    const result = runChecked("gh", args, { cwd: manifest.worktree_path });
    const parsed = parseGhJson(result.stdout, "review-thread state");
    const pageErrors = graphqlErrorsOrThrow(parsed, "Review-thread state");
    errors.push(...pageErrors);
    if (pageErrors.length) reviewThreadComplete = false;
    const connection = parsed?.data?.repository?.pullRequest?.reviewThreads;
    const pageComplete = Array.isArray(connection?.nodes) && typeof connection?.pageInfo?.hasNextPage === "boolean";
    connectionComplete = connectionComplete && pageComplete;
    if (!pageComplete) break;
    nodes.push(...connection.nodes.map((thread) => hydrateReviewThreadComments(manifest, thread)));
    hasNextPage = Boolean(connection.pageInfo.hasNextPage);
    cursor = hasNextPage ? connection.pageInfo.endCursor : null;
    if (hasNextPage && !cursor) throw new Error("Review-thread pagination omitted a next-page cursor");
  } while (cursor);
  const reviewRequests = fetchCompleteReviewRequestSnapshot(manifest, repository, prNumber);
  errors.push(...reviewRequests.errors);
  reviewThreadComplete = reviewThreadComplete && connectionComplete;
  const reviewRequestComplete = reviewRequests.complete && reviewRequests.errors.length === 0;
  const threadRefs = nodes.map((thread) => {
    const comments = reviewThreadCommentAudit(thread.comments);
    return {
      id: thread.id || null,
      isResolved: Boolean(thread.isResolved),
      isOutdated: Boolean(thread.isOutdated),
      // A review-thread path is identity-bearing evidence. Preserve legal
      // whitespace byte-for-byte rather than applying display-text cleanup.
      path: typeof thread.path === "string" && thread.path && !thread.path.includes("\0") ? thread.path : null,
      url: comments.firstUrl || null,
      requestFingerprint: comments.requestFingerprint,
      commentsComplete: comments.complete,
      commentCount: comments.count,
      commentsHasNextPage: comments.hasNextPage,
    };
  });
  const unresolvedNonOutdated = threadRefs.filter((thread) => !thread.isResolved && !thread.isOutdated);
  const unresolvedOutdated = threadRefs.filter((thread) => !thread.isResolved && thread.isOutdated);
  return {
    querySucceeded: reviewThreadComplete && reviewRequestComplete,
    reviewThreadComplete,
    reviewRequestComplete,
    errorCount: errors.length,
    errorCategories: graphqlErrorCategories(errors),
    totalCount: threadRefs.length,
    unresolvedNonOutdatedCount: unresolvedNonOutdated.length,
    unresolvedOutdatedCount: unresolvedOutdated.length,
    outdatedCount: threadRefs.filter((thread) => thread.isOutdated).length,
    resolvedCount: threadRefs.filter((thread) => thread.isResolved).length,
    hasNextPage,
    pendingReviewRequestCount: reviewRequests.nodes.length,
    reviewRequestHasNextPage: reviewRequests.hasNextPage,
    unresolvedNonOutdatedRefs: unresolvedNonOutdated.map((thread) => thread.url || thread.id).filter(Boolean),
    unresolvedOutdatedRefs: unresolvedOutdated.map((thread) => thread.url || thread.id).filter(Boolean),
    incompleteCommentThreadRefs: threadRefs.filter((thread) => !thread.commentsComplete).map((thread) => thread.url || thread.id).filter(Boolean),
    auditFingerprint: reviewThreadAuditFingerprint(threadRefs, reviewRequests),
    threadRefs,
  };
}

function fetchCompleteReviewRequestSnapshot(manifest, repository, prNumber) {
  const query = [
    "query($owner:String!,$name:String!,$number:Int!,$after:String){",
    "repository(owner:$owner,name:$name){",
    "pullRequest(number:$number){reviewRequests(first:100,after:$after){nodes{id}pageInfo{hasNextPage,endCursor}}}",
    "}",
    "}",
  ].join("");
  const nodes = [];
  const errors = [];
  let cursor = null;
  let hasNextPage = false;
  let complete = true;
  let pages = 0;
  do {
    if (pages++ >= maxReviewRequestPages) {
      hasNextPage = true;
      complete = false;
      break;
    }
    const args = ["api", "graphql", "-f", `query=${query}`, "-F", `owner=${repository.owner}`, "-F", `name=${repository.name}`, "-F", `number=${prNumber}`];
    if (cursor) args.push("-F", `after=${cursor}`);
    const result = runChecked("gh", args, { cwd: manifest.worktree_path });
    const parsed = parseGhJson(result.stdout, "review-request state");
    const pageErrors = graphqlErrorsOrThrow(parsed, "Review-request state");
    errors.push(...pageErrors);
    if (pageErrors.length) complete = false;
    const connection = parsed?.data?.repository?.pullRequest?.reviewRequests;
    const pageComplete = Array.isArray(connection?.nodes) && typeof connection?.pageInfo?.hasNextPage === "boolean";
    complete = complete && pageComplete;
    if (!pageComplete) break;
    nodes.push(...connection.nodes);
    hasNextPage = Boolean(connection.pageInfo.hasNextPage);
    cursor = hasNextPage ? connection.pageInfo.endCursor : null;
    if (hasNextPage && !cursor) throw new Error("Review-request pagination omitted a next-page cursor");
  } while (cursor);
  return { nodes, errors, complete, hasNextPage };
}

function hydrateReviewThreadComments(manifest, thread) {
  const initial = thread?.comments;
  if (!Array.isArray(initial?.nodes) || typeof initial?.pageInfo?.hasNextPage !== "boolean") {
    throw new Error("Review-thread comment pagination returned incomplete initial evidence");
  }
  if (!initial.pageInfo.hasNextPage) return thread;
  const comments = Array.isArray(initial.nodes) ? [...initial.nodes] : [];
  let cursor = initial.pageInfo.endCursor;
  if (!cursor) throw new Error("Review-thread comment pagination omitted an initial cursor");
  let pages = 0;
  while (cursor) {
    if (pages++ >= 100) throw new Error("Review-thread comment pagination exceeded the bounded page limit");
    const query = "query($id:ID!,$after:String!){node(id:$id){... on PullRequestReviewThread{comments(first:100,after:$after){nodes{id,url,body}pageInfo{hasNextPage,endCursor}}}}}";
    const result = runChecked("gh", ["api", "graphql", "-f", `query=${query}`, "-F", `id=${thread.id}`, "-F", `after=${cursor}`], { cwd: manifest.worktree_path });
    const parsed = parseGhJson(result.stdout, "review-thread comment page");
    const page = parsed?.data?.node?.comments;
    if (graphqlErrorsOrThrow(parsed, "Review-thread comment pagination").length) throw new Error("Review-thread comment pagination returned GraphQL errors");
    if (!Array.isArray(page?.nodes) || typeof page?.pageInfo?.hasNextPage !== "boolean") throw new Error("Review-thread comment pagination returned incomplete evidence");
    comments.push(...page.nodes);
    cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
    if (page.pageInfo.hasNextPage && !cursor) throw new Error("Review-thread comment pagination omitted a next-page cursor");
  }
  return { ...thread, comments: { nodes: comments, pageInfo: { hasNextPage: false } } };
}

function reviewThreadCommentAudit(comments) {
  const nodes = Array.isArray(comments?.nodes) ? comments.nodes : null;
  const hasNextPage = Boolean(comments?.pageInfo?.hasNextPage);
  const complete = Boolean(nodes && !hasNextPage && nodes.length > 0 && nodes.every((comment) => (
    typeof comment?.id === "string" && comment.id && typeof comment?.body === "string" && typeof comment?.url === "string" && comment.url
  )));
  const canonical = complete ? nodes.map((comment) => ({
    id: comment.id,
    body: comment.body.replace(/\r\n/g, "\n"),
    url: comment.url,
  })).sort((left, right) => left.id.localeCompare(right.id)) : [];
  const uniqueIds = new Set(canonical.map((comment) => comment.id));
  return {
    complete: complete && uniqueIds.size === canonical.length,
    count: nodes?.length || 0,
    hasNextPage,
    firstUrl: nodes?.[0]?.url || null,
    requestFingerprint: complete && uniqueIds.size === canonical.length
      ? createHash("sha256").update(JSON.stringify(canonical)).digest("hex")
      : null,
  };
}

function reviewThreadAuditFingerprint(threadRefs, reviewRequests) {
  const canonicalThreads = (Array.isArray(threadRefs) ? threadRefs : []).map((thread) => ({
    id: thread.id || null,
    isResolved: Boolean(thread.isResolved),
    isOutdated: Boolean(thread.isOutdated),
    path: thread.path || null,
    requestFingerprint: thread.requestFingerprint || null,
    commentsComplete: Boolean(thread.commentsComplete),
    commentCount: Number(thread.commentCount || 0),
    commentsHasNextPage: Boolean(thread.commentsHasNextPage),
  })).sort((left, right) => String(left.id).localeCompare(String(right.id)));
  const pendingRequests = Array.isArray(reviewRequests?.nodes) ? reviewRequests.nodes.map((request) => String(request?.id || "")).sort() : [];
  return createHash("sha256").update(JSON.stringify({ threads: canonicalThreads, pendingRequests })).digest("hex");
}

function commaSeparatedMetadata(value, maxEntries = 80) {
  return [...new Set(String(value || "").split(",").map((entry) => safeMetadataText(entry, 180)).filter(Boolean))].slice(0, maxEntries);
}

function diffRiskPathSet(value) {
  const raw = String(value || "");
  if (!raw) return { paths: [], error: "" };
  if (!raw.trimStart().startsWith("[")) {
    const paths = raw.split(",");
    if (paths.some((path) => !path || path.includes("\0"))) return { paths: [], error: "Diff-risk path evidence contains an empty or invalid path" };
    return { paths: [...new Set(paths)], error: "" };
  }
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.some((path) => typeof path !== "string" || !path || path.includes("\0"))) {
      return { paths: [], error: "Diff-risk JSON path evidence must be an array of non-empty paths" };
    }
    return { paths: [...new Set(parsed)], error: "" };
  } catch {
    return { paths: [], error: "Diff-risk JSON path evidence is invalid" };
  }
}

function shapeNonRequiredCheckPolicyEvidence(options = {}, context = {}) {
  const names = commaSeparatedMetadata(options.nonRequiredChecks);
  const policyRef = safeMetadataText(options.nonRequiredCheckPolicy, 300);
  const expectedHeadSha = safeMetadataText(context.expectedHeadSha || "", 80);
  const valid = validateSourceOwnedSkipPolicy(policyRef, names, context.worktreePath, expectedHeadSha);
  const blockers = [];
  if (names.length > 0 && !policyRef) {
    blockers.push("Non-required skipped checks require a source-owned policy reference");
  }
  if (policyRef && names.length === 0) {
    blockers.push("Non-required check policy reference has no named skipped checks");
  }
  if (names.length > 0 && !valid) {
    blockers.push("Non-required skipped checks do not match the source-owned policy");
  }
  return {
    schemaVersion: 1,
    names,
    policyRef: policyRef || null,
    expectedHeadSha: expectedHeadSha || null,
    valid,
    blockers,
    metadataOnly: true,
  };
}

function validateSourceOwnedSkipPolicy(policyRef, names, worktreePath, expectedHeadSha) {
  if (!worktreePath || !exactGitObjectIdOrNull(expectedHeadSha) || names.length === 0) {
    return false;
  }
  const canonicalPolicies = {
    "docs/workflows/end-to-end-lane-runner.md#documented-non-required-checks": "docs/workflows/end-to-end-lane-runner.md",
    "AGENTS.md#documented-non-required-checks": "AGENTS.md",
  };
  const policyPath = canonicalPolicies[policyRef];
  if (!policyPath) {
    return false;
  }
  const policyResult = git(["show", `${expectedHeadSha}:${policyPath}`], { cwd: worktreePath, preserveStdout: true });
  if (policyResult.code !== 0) {
    return false;
  }
  const policyText = policyResult.stdout;
  const section = sourceOwnedSkipPolicySection(policyText);
  if (section === null) return false;
  const visibleNames = visibleSkipPolicyListItems(section);
  return names.every((name) => ["full", "javascript", "supervisor"].includes(name) && visibleNames.has(name));
}

function visibleSkipPolicyListItems(section) {
  // HTML comments are not visible policy. Accept only actual Markdown bullet
  // items, after removing comments that could otherwise preserve a stale
  // `- `check`` substring.
  const visible = String(section || "").replace(/<!--[\s\S]*?-->/g, "");
  return new Set(visible.split(/\r?\n/)
    .map((line) => /^[ \t]*[-+*][ \t]+`([^`\r\n]+)`(?:[ \t].*)?$/.exec(line)?.[1] || null)
    .filter(Boolean));
}

function sourceOwnedSkipPolicySection(policyText) {
  // Both source-owned policy documents deliberately use this heading: AGENTS
  // at H2 and the lane runner at H3. Keep the accepted depths bounded. Parse
  // line-by-line so examples inside fenced code cannot become policy and a
  // later same-or-higher ATX or Setext heading cannot extend the section.
  const lines = policyText.split(/\r?\n/);
  const policyHeading = /^[ ]{0,3}(#{2,3})[ \t]+Documented Non-Required Checks(?:[ \t]+#+)?[ \t]*$/;
  const atxHeading = /^[ ]{0,3}(#{1,6})[ \t]+/;
  const setextUnderline = /^[ ]{0,3}(?:=+|-+)[ \t]*$/;
  let fence = null;
  let headingDepth = 0;
  const section = [];
  for (const line of lines) {
    const fenceMatch = fence
      ? /^([ \t]*)(`{3,}|~{3,})([^\r\n]*)$/.exec(line)
      : /^([ \t]*)(?:([-+*]|\d+[.)])([ \t]+))?(`{3,}|~{3,})([^\r\n]*)$/.exec(line);
    if (fenceMatch) {
      const opening = !fence;
      const indentation = fenceMatch[1];
      const marker = fenceMatch[opening ? 4 : 2];
      const suffix = fenceMatch[opening ? 5 : 3];
      if (!fence) {
        // CommonMark permits any info string on tilde fences, while a
        // backtick fence cannot contain a backtick in its info string.
        if (marker[0] === "`" && suffix.includes("`")) continue;
        const openingIndent = markdownIndentationColumns(indentation);
        if (openingIndent > 3) continue;
        const listIndent = fenceMatch[2] ? markdownIndentationColumns(`${fenceMatch[2]}${fenceMatch[3]}`) : 0;
        fence = {
          character: marker[0],
          length: marker.length,
          minClosingIndent: listIndent ? openingIndent + listIndent : 0,
          maxClosingIndent: listIndent ? openingIndent + listIndent + 3 : 3,
        };
      } else if (markdownIndentationColumns(indentation) >= fence.minClosingIndent && markdownIndentationColumns(indentation) <= fence.maxClosingIndent && marker[0] === fence.character && marker.length >= fence.length && /^[ \t]*$/.test(suffix)) {
        fence = null;
      }
      continue;
    }
    if (fence) {
      continue;
    }
    if (!headingDepth) {
      const match = policyHeading.exec(line);
      if (match) headingDepth = match[1].length;
      continue;
    }
    const atx = atxHeading.exec(line);
    if (atx && atx[1].length <= headingDepth) break;
    if (setextUnderline.test(line) && section.length > 0 && section.at(-1).trim()) {
      section.pop();
      break;
    }
    section.push(line);
  }
  return headingDepth ? section.join("\n") : null;
}

function markdownIndentationColumns(value) {
  let columns = 0;
  for (const character of String(value || "")) {
    columns = character === "\t" ? columns + (4 - (columns % 4)) : columns + 1;
  }
  return columns;
}

function shapeDiffRiskEvidence(options = {}, context = {}) {
  const summary = safeMetadataText(options.diffRiskSummary, 500);
  // Diff-risk evidence is an exact-head coverage set, not a display list.  Do
  // not apply the general CLI metadata cap here or a PR with more than 80 files
  // becomes impossible to prove even when every path was supplied.
  const fileSet = diffRiskPathSet(options.diffRiskFiles);
  const files = fileSet.paths;
  const verification = evidenceText(options.diffRiskVerification, 500);
  const verificationCommand = evidenceText(options.diffRiskVerificationCommand, 500);
  const verificationExitCode = String(options.diffRiskVerificationExitCode ?? "").trim();
  const expectedHeadSha = safeMetadataText(context.expectedHeadSha || "", 80);
  const expectedPrNumber = Number(context.expectedPrNumber);
  const expectedBaseRefName = safeMetadataText(context.expectedBaseRefName || "", 300);
  const expectedBaseRefOid = exactGitObjectIdOrNull(context.expectedBaseRefOid);
  const changedPaths = Array.isArray(context.changedPaths) ? context.changedPaths : [];
  const changedPathError = safeMetadataText(context.changedPathError || "", 500);
  const inspectedHeadSha = safeMetadataText(context.inspectedHeadSha || "", 80);
  const postInspectionHeadSha = safeMetadataText(context.postInspectionHeadSha || "", 80);
  const inspectedPrNumber = Number(context.inspectedPrNumber);
  const postInspectionPrNumber = Number(context.postInspectionPrNumber);
  const inspectedBaseRefName = safeMetadataText(context.inspectedBaseRefName || "", 300);
  const postInspectionBaseRefName = safeMetadataText(context.postInspectionBaseRefName || "", 300);
  const inspectedBaseRefOid = exactGitObjectIdOrNull(context.inspectedBaseRefOid);
  const postInspectionBaseRefOid = exactGitObjectIdOrNull(context.postInspectionBaseRefOid);
  const uncoveredPaths = changedPaths.filter((path) => !files.includes(path));
  const blockers = [];
  if (!summary) blockers.push("Diff-risk summary missing");
  if (files.length === 0) blockers.push("Diff-risk changed-file evidence missing");
  if (!verification) blockers.push("Diff-risk focused verification evidence missing");
  if (!verificationCommand) blockers.push("Diff-risk focused verification command missing");
  if (verificationExitCode !== "0") blockers.push("Diff-risk focused verification exit code must be 0");
  if (!expectedHeadSha) blockers.push("Diff-risk exact head missing");
  if (!inspectedHeadSha || inspectedHeadSha !== expectedHeadSha) blockers.push("Diff-risk changed-path inspection does not match the exact PR head");
  if (!postInspectionHeadSha || postInspectionHeadSha !== expectedHeadSha) blockers.push("Diff-risk PR head changed after changed-path inspection");
  if (!Number.isSafeInteger(expectedPrNumber) || expectedPrNumber <= 0 || inspectedPrNumber !== expectedPrNumber || postInspectionPrNumber !== expectedPrNumber) blockers.push("Diff-risk changed-path inspection is not bound to the exact PR identity");
  if (!expectedBaseRefName || inspectedBaseRefName !== expectedBaseRefName || postInspectionBaseRefName !== expectedBaseRefName) blockers.push("Diff-risk PR base changed during changed-path inspection");
  if (!expectedBaseRefOid || inspectedBaseRefOid !== expectedBaseRefOid || postInspectionBaseRefOid !== expectedBaseRefOid) blockers.push("Diff-risk PR base commit changed during changed-path inspection");
  if (fileSet.error) blockers.push(fileSet.error);
  if (changedPathError) blockers.push(`Diff-risk changed-path inspection failed: ${changedPathError}`);
  if (!changedPathError && changedPaths.length === 0) blockers.push("Diff-risk changed-path inspection returned no paths");
  if (uncoveredPaths.length > 0) blockers.push(`Diff-risk evidence omits changed paths: ${uncoveredPaths.join(", ")}`);
  return {
    schemaVersion: 1,
    status: blockers.length ? "missing" : "recorded",
    summary: summary || null,
    files,
    verification: verification || null,
    verificationCommand: verificationCommand || null,
    verificationExitCode: verificationExitCode === "0" ? 0 : null,
    expectedHeadSha: expectedHeadSha || null,
    expectedPrNumber: Number.isSafeInteger(expectedPrNumber) && expectedPrNumber > 0 ? expectedPrNumber : null,
    expectedBaseRefName: expectedBaseRefName || null,
    expectedBaseRefOid,
    inspectedHeadSha: inspectedHeadSha || null,
    postInspectionHeadSha: postInspectionHeadSha || null,
    inspectedPrNumber: Number.isSafeInteger(inspectedPrNumber) ? inspectedPrNumber : null,
    postInspectionPrNumber: Number.isSafeInteger(postInspectionPrNumber) ? postInspectionPrNumber : null,
    inspectedBaseRefName: inspectedBaseRefName || null,
    postInspectionBaseRefName: postInspectionBaseRefName || null,
    inspectedBaseRefOid,
    postInspectionBaseRefOid,
    changedPaths,
    uncoveredPaths,
    blockers,
    metadataOnly: true,
  };
}

function fetchPrChangedPaths(manifest, prNumber, expectedHeadSha = "", expectedBaseRefName = "", expectedBaseRefOid = "", expectedChangedFileCount = null) {
  const before = prViewForGates(manifest);
  const snapshot = (pr) => ({
    inspectedHeadSha: pr?.headRefOid || null,
    inspectedPrNumber: Number.isSafeInteger(pr?.number) ? pr.number : null,
    inspectedBaseRefName: pr?.baseRefName || null,
    inspectedBaseRefOid: exactGitObjectIdOrNull(pr?.baseRefOid),
  });
  if (!expectedHeadSha || !before?.headRefOid || before.headRefOid !== expectedHeadSha) {
    return { paths: [], ...snapshot(before), error: "GitHub changed-path inspection is not bound to the expected exact PR head" };
  }
  if (!Number.isSafeInteger(prNumber) || before.number !== prNumber) {
    return { paths: [], ...snapshot(before), error: "GitHub changed-path inspection is not bound to the expected exact PR identity" };
  }
  if (!expectedBaseRefName || before.baseRefName !== expectedBaseRefName) {
    return { paths: [], ...snapshot(before), error: "GitHub changed-path inspection is not bound to the expected exact PR base" };
  }
  if (!exactGitObjectIdOrNull(expectedBaseRefOid) || before.baseRefOid !== expectedBaseRefOid) {
    return { paths: [], ...snapshot(before), error: "GitHub changed-path inspection is not bound to the expected exact PR base commit" };
  }
  const repository = githubRepository(manifest);
  const result = run("gh", ["api", "--paginate", `repos/${repository.owner}/${repository.name}/pulls/${prNumber}/files?per_page=100`], { cwd: manifest.worktree_path });
  if (result.code !== 0) {
    return { paths: [], ...snapshot(before), error: safeMetadataText(result.stderr || result.stdout || "GitHub CLI changed-path inspection failed", 500) };
  }
  const after = prViewForGates(manifest);
  if (!after?.headRefOid || after.headRefOid !== expectedHeadSha || after.headRefOid !== before.headRefOid) {
    return { paths: [], ...snapshot(before), postInspectionHeadSha: after?.headRefOid || null, postInspectionPrNumber: Number.isSafeInteger(after?.number) ? after.number : null, postInspectionBaseRefName: after?.baseRefName || null, postInspectionBaseRefOid: exactGitObjectIdOrNull(after?.baseRefOid), error: "GitHub PR head changed during changed-path inspection" };
  }
  if (after.number !== prNumber || after.number !== before.number) {
    return { paths: [], ...snapshot(before), postInspectionHeadSha: after.headRefOid, postInspectionPrNumber: Number.isSafeInteger(after.number) ? after.number : null, postInspectionBaseRefName: after.baseRefName || null, postInspectionBaseRefOid: exactGitObjectIdOrNull(after.baseRefOid), error: "GitHub PR identity changed during changed-path inspection" };
  }
  if (after.baseRefName !== expectedBaseRefName || after.baseRefName !== before.baseRefName) {
    return { paths: [], ...snapshot(before), postInspectionHeadSha: after.headRefOid, postInspectionPrNumber: Number.isSafeInteger(after.number) ? after.number : null, postInspectionBaseRefName: after.baseRefName || null, postInspectionBaseRefOid: exactGitObjectIdOrNull(after.baseRefOid), error: "GitHub PR base changed during changed-path inspection" };
  }
  if (!exactGitObjectIdOrNull(after.baseRefOid) || after.baseRefOid !== expectedBaseRefOid || after.baseRefOid !== before.baseRefOid) {
    return { paths: [], ...snapshot(before), postInspectionHeadSha: after.headRefOid, postInspectionPrNumber: Number.isSafeInteger(after.number) ? after.number : null, postInspectionBaseRefName: after.baseRefName || null, postInspectionBaseRefOid: exactGitObjectIdOrNull(after.baseRefOid), error: "GitHub PR base commit changed during changed-path inspection" };
  }
  try {
    const pages = parseConcatenatedJsonValues(result.stdout, "paginated changed-path metadata");
    if (!Array.isArray(pages) || pages.some((page) => !Array.isArray(page))) throw new Error("unexpected paginated payload");
    const files = pages.flat();
    if (!Number.isSafeInteger(expectedChangedFileCount) || expectedChangedFileCount < 0 || files.length !== expectedChangedFileCount) {
      throw new Error("changed-path metadata is incomplete");
    }
    if (files.some((file) => typeof file?.filename !== "string" || !file.filename || file.filename.includes("\0"))) {
      throw new Error("changed-path metadata contains an invalid filename");
    }
    // REST JSON retains legal filenames (including whitespace and newlines)
    // without the delimiter ambiguity of `gh pr diff --name-only`.
    const paths = [...new Set(files.map((file) => file.filename).filter((path) => path !== ""))];
    return { paths, ...snapshot(before), postInspectionHeadSha: after.headRefOid, postInspectionPrNumber: after.number, postInspectionBaseRefName: after.baseRefName, postInspectionBaseRefOid: exactGitObjectIdOrNull(after.baseRefOid), error: "" };
  } catch (error) {
    return { paths: [], ...snapshot(before), postInspectionHeadSha: after.headRefOid, postInspectionPrNumber: after.number, postInspectionBaseRefName: after.baseRefName, postInspectionBaseRefOid: exactGitObjectIdOrNull(after.baseRefOid), error: `GitHub changed-path inspection returned invalid metadata: ${safeMetadataText(error.message, 300)}` };
  }
}

function fetchPrRenamedPaths(manifest, prNumber, expectedHeadSha = "", expectedBaseRefName = "", expectedBaseRefOid = "", expectedChangedFileCount = null) {
  const before = prViewForGates(manifest);
  if (!expectedHeadSha || !before?.headRefOid || before.headRefOid !== expectedHeadSha || !Number.isSafeInteger(prNumber) || before.number !== prNumber || !expectedBaseRefName || before.baseRefName !== expectedBaseRefName || !exactGitObjectIdOrNull(expectedBaseRefOid) || before.baseRefOid !== expectedBaseRefOid) {
    return { paths: [], inspectedHeadSha: before?.headRefOid || null, error: "GitHub rename inspection is not bound to the expected exact PR head" };
  }
  const repository = githubRepository(manifest);
  const result = run("gh", ["api", "--paginate", `repos/${repository.owner}/${repository.name}/pulls/${prNumber}/files?per_page=100`], { cwd: manifest.worktree_path });
  if (result.code !== 0) {
    return { paths: [], inspectedHeadSha: before.headRefOid, error: safeMetadataText(result.stderr || result.stdout || "GitHub CLI rename inspection failed", 500) };
  }
  const after = prViewForGates(manifest);
  if (!after?.headRefOid || after.headRefOid !== expectedHeadSha || after.headRefOid !== before.headRefOid || after.number !== prNumber || after.number !== before.number || after.baseRefName !== expectedBaseRefName || after.baseRefName !== before.baseRefName || !exactGitObjectIdOrNull(after.baseRefOid) || after.baseRefOid !== expectedBaseRefOid || after.baseRefOid !== before.baseRefOid) {
    return { paths: [], inspectedHeadSha: before.headRefOid, error: "GitHub PR head changed during rename inspection" };
  }
  try {
    const pages = parseConcatenatedJsonValues(result.stdout, "paginated rename metadata");
    if (!Array.isArray(pages) || pages.some((page) => !Array.isArray(page))) throw new Error("unexpected paginated payload");
    const listedFiles = pages.flat();
    if (!Number.isSafeInteger(expectedChangedFileCount) || expectedChangedFileCount < 0 || listedFiles.length !== expectedChangedFileCount) {
      return { paths: [], inspectedHeadSha: before.headRefOid, error: "GitHub rename inspection metadata is incomplete" };
    }
    const paths = listedFiles.flatMap((file) => (
      file?.status === "renamed" && typeof file.previous_filename === "string" && file.previous_filename
        && typeof file.filename === "string" && file.filename
        ? [{ from: file.previous_filename, to: file.filename }]
        : []
    ));
    return { paths: paths.filter((entry, index) => paths.findIndex((candidate) => candidate.from === entry.from && candidate.to === entry.to) === index), inspectedHeadSha: before.headRefOid, error: "" };
  } catch {
    return { paths: [], inspectedHeadSha: before.headRefOid, error: "GitHub rename inspection returned incomplete metadata" };
  }
}

function parseGhJson(stdout, label) {
  try {
    return JSON.parse(stdout);
  } catch {
    throw new Error(`GitHub CLI returned invalid JSON for ${label}.`);
  }
}

function parseConcatenatedJsonValues(stdout, label) {
  const input = String(stdout || "");
  const values = [];
  let index = 0;
  while (index < input.length) {
    while (index < input.length && /\s/.test(input[index])) index += 1;
    if (index >= input.length) break;
    const start = index;
    const opener = input[index];
    if (opener !== "[" && opener !== "{") throw new Error(`${label} contains a non-container JSON value`);
    const closer = opener === "[" ? "]" : "}";
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (; index < input.length; index += 1) {
      const character = input[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') inString = false;
        continue;
      }
      if (character === '"') {
        inString = true;
        continue;
      }
      if (character === opener) depth += 1;
      else if (character === closer) {
        depth -= 1;
        if (depth === 0) {
          index += 1;
          values.push(JSON.parse(input.slice(start, index)));
          break;
        }
      }
    }
    if (depth !== 0 || inString) throw new Error(`${label} is incomplete`);
  }
  if (values.length === 0) throw new Error(`${label} is empty`);
  return values;
}

function runAntiChurnFinalization(manifest, state, options = {}) {
  const now = new Date().toISOString();
  const worktreeStatus = options.worktreeStatus || parseStatus(manifest.worktree_path);
  const hookResult = runAntiChurnGuidanceHookCli(
    ["evaluate", "--lane", manifest.task_id, "--apply-safe", "--format", "json"],
    {
      cwd: manifest.worktree_path,
      env: {
        ...process.env,
        CODEX_WORKSPACE_ROOT: state.root,
      },
      laneManifest: antiChurnLaneManifest(manifest, worktreeStatus, now, { pr: options.pr }),
      now,
    },
  );
  return {
    hookResult,
    manifestRecord: shapeAntiChurnManifestRecord(hookResult, now),
  };
}

function antiChurnLaneManifest(manifest, worktreeStatus, checkedAt, options = {}) {
  return {
    taskId: manifest.task_id,
    branch: manifest.branch,
    owner: manifest.owner || null,
    worktreePath: manifest.worktree_path,
    baseBranch: manifest.base_branch,
    pr: antiChurnPrState(manifest, options.pr),
    cleanup: {
      status: antiChurnCleanupStatus(manifest),
      startedAt: manifest.cleanup_started_at || null,
    },
    dirtyWorktree: {
      checkedAt,
      paths: statusPaths(worktreeStatus),
    },
  };
}

function antiChurnPrState(manifest, pr) {
  const merged = Boolean(pr?.mergedAt || manifest.merged_at || manifest.pr_merged_at || manifest.status === "merged" || manifest.status === "closed");
  const hasPrEvidence = Boolean(pr || manifest.pr_number || manifest.pr_url || merged);
  if (!hasPrEvidence) {
    return null;
  }
  return {
    number: pr?.number || manifest.pr_number || null,
    state: pr?.state || manifest.pr_state || null,
    merged,
    reviewStateCheckedAt: manifest.pr_review_state_checked_at || null,
    headRefOid: pr?.headRefOid || manifest.pr_delivery_head_sha || null,
  };
}

function antiChurnCleanupStatus(manifest) {
  if (manifest.status === "cleanup_partial" || manifest.cleanup_started_at) {
    return "started";
  }
  return "not-started";
}

function statusPaths(worktreeStatus) {
  return (worktreeStatus?.lines || [])
    .map((line) => line.slice(3).trim())
    .filter(Boolean);
}

function shapeAntiChurnManifestRecord(result, updatedAt) {
  const lessons = Number(result?.lessonsEvaluated || 0);
  const omittedReason = lessons === 0 ? noStructuredChurnReason(result) : null;
  return {
    mode: result?.mode || "apply-safe",
    status: result?.status || "input-error",
    omitted_reason: omittedReason,
    lessons_evaluated: lessons,
    applied: copyJsonArray(result?.applied),
    proposals: copyJsonArray(result?.proposals),
    skipped: copyJsonArray(result?.skipped),
    files_changed: copyJsonArray(result?.filesChanged),
    verification: copyJsonArray(result?.verification),
    residual_risks: copyJsonArray(result?.residualRisks),
    local_event_storage: copyJsonArray(result?.localEventStorage),
    warnings: copyJsonArray(result?.warnings),
    requires_authority: copyJsonArray(result?.requiresAuthority),
    next_safe_action: antiChurnNextSafeAction(result, omittedReason),
    updated_at: updatedAt,
  };
}

function noStructuredChurnReason(result) {
  const warnings = Array.isArray(result?.warnings) ? result.warnings : [];
  if (warnings.includes("malformed-event-line") || warnings.some((warning) => warning.startsWith("malformed-event-line:"))) {
    return null;
  }
  if (warnings.includes("invalid-event-line") || warnings.some((warning) => warning.startsWith("invalid-event-line:"))) {
    return null;
  }
  if (warnings.includes("no-valid-events")) {
    return null;
  }
  if (warnings.includes("missing-event-store") || warnings.includes("empty-event-store")) {
    return "no-structured-churn-events";
  }
  return "insufficient-evidence";
}

function antiChurnNextSafeAction(result, omittedReason) {
  if (omittedReason) {
    return "Record structured churn events before expecting anti-churn lessons.";
  }
  if (result?.status === "verification-pending-approval") {
    return "Request approval for the exact read-only verification command surfaced by the hook.";
  }
  if (result?.status === "requires-higher-authority") {
    return "Review required authority before any higher-authority mutation.";
  }
  if (result?.status === "verification-failed") {
    return "Inspect the hook proposal and verification failure before applying guidance.";
  }
  if (result?.status === "input-error") {
    return "Inspect local anti-churn state and event store availability.";
  }
  return null;
}

function copyJsonArray(value) {
  return Array.isArray(value) ? value.map((entry) => JSON.parse(JSON.stringify(entry))) : [];
}

function renderAntiChurnFinalization(record = {}) {
  const changedFiles = uniqueTextValues(record.files_changed);
  const appliedFiles = uniqueTextValues([...changedFiles, ...record.applied?.map((entry) => fieldValue(entry, ["targetFile", "file", "target"])) || []]);
  const lines = [
    "Anti-Churn Finalization",
    `- Status: ${valueOrNone(record.status)}`,
    `- Mode: ${valueOrNone(record.mode)}`,
    `- Lessons evaluated: ${Number(record.lessons_evaluated || 0)}`,
    `- Applied safe local edits: ${appliedFiles.length ? appliedFiles.join(", ") : "none"}`,
    `- Proposals prepared: ${formatCount(record.proposals)}`,
    `- No-op reasons: ${formatNoOpReasons(record)}`,
    `- Local event storage: ${formatLocalEventStorage(record.local_event_storage)}`,
    `- Verification: ${formatVerification(record.verification)}`,
    `- Residual risks: ${formatTextList(record.residual_risks)}`,
  ];

  if (appliedFiles.length) {
    lines.push("  - PR inclusion: existing finish-pr staging/commit policy decides whether changed source files are included in the lane PR.");
  }
  lines.push(...renderProposalDetails(record));
  if (record.next_safe_action) {
    lines.push(`- Operator next step: ${record.next_safe_action}`);
  }
  return lines;
}

function renderProposalDetails(record = {}) {
  const lines = [];
  const authorityItems = [
    ...copyJsonArray(record.proposals),
    ...copyJsonArray(record.requires_authority),
    ...copyJsonArray(record.skipped).filter((entry) => entry?.noOpReason === "requires-higher-authority" || entry?.noOpReason === "proposal-only"),
  ];
  authorityItems.forEach((entry, index) => {
    const authority = fieldList(entry, ["requiredAuthorityFamily", "requiredAuthority", "requiresAuthority", "authority"]);
    const operation = fieldValue(entry, ["blockedOperation", "operation", "behavior", "proposedTarget", "durableTarget", "targetFile", "target"]);
    const evidence = fieldList(entry, ["evidenceReferences", "evidenceRefs", "collapsedSourceEventIds", "sourceEventId"]);
    const next = fieldValue(entry, ["nextSafeAction", "approvalGuidance", "verificationIdea", "residualRisk"]);
    lines.push(
      `  - Proposal ${index + 1}: authority=${authority || "unspecified"}; blocked_operation=${operation || "unspecified"}; evidence=${evidence || "none"}; next_safe_action=${next || "review proposal"}; approval=not approved; proposal-only`,
    );
  });
  return lines;
}

function formatCount(value) {
  return Array.isArray(value) && value.length ? String(value.length) : "none";
}

function formatNoOpReasons(record = {}) {
  const counts = new Map();
  const proposalReasons = copyJsonArray(record.proposals).map((entry) => entry?.noOpReason || entry?.decision || "proposal-only");
  const statusReasons = ["proposal-only", "requires-higher-authority"].includes(record.status) ? [record.status] : [];
  for (const reason of [
    record.omitted_reason,
    ...statusReasons,
    ...proposalReasons,
    ...copyJsonArray(record.skipped).map((entry) => entry?.noOpReason || entry?.decision || entry?.status),
  ]) {
    if (!reason) {
      continue;
    }
    counts.set(reason, (counts.get(reason) || 0) + 1);
  }
  return counts.size ? [...counts.entries()].map(([reason, count]) => `${reason}=${count}`).join(", ") : "none";
}

function formatLocalEventStorage(value) {
  const entries = copyJsonArray(value);
  if (!entries.length) {
    return "none";
  }
  return entries.map((entry) => {
    const eventStore = fieldValue(entry, ["eventStore", "path"]) || "unavailable";
    const eventCount = entry?.eventCount === undefined ? "unknown" : entry.eventCount;
    return `${eventStore} (${eventCount} events)`;
  }).join(", ");
}

function formatVerification(value) {
  const entries = copyJsonArray(value);
  if (!entries.length) {
    return "none";
  }
  return entries.map((entry) => {
    const command = fieldValue(entry, ["command", "target"]) || "unspecified";
    const result = fieldValue(entry, ["status", "result", "exitCode"]);
    return result ? `${command} => ${result}` : command;
  }).join(", ");
}

function formatTextList(value) {
  const entries = uniqueTextValues(value);
  return entries.length ? entries.join(", ") : "none";
}

function fieldValue(entry, names) {
  if (!entry || typeof entry !== "object") {
    return typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean" ? String(entry) : "";
  }
  for (const name of names) {
    const value = entry[name];
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
  }
  return "";
}

function fieldList(entry, names) {
  if (!entry || typeof entry !== "object") {
    return fieldValue(entry, names);
  }
  for (const name of names) {
    const value = entry[name];
    const formatted = Array.isArray(value) ? uniqueTextValues(value).join(", ") : fieldValue({ value }, ["value"]);
    if (formatted) {
      return formatted;
    }
  }
  return "";
}

function uniqueTextValues(value) {
  const input = Array.isArray(value) ? value : [];
  return [...new Set(input
    .map((entry) => {
      if (typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean") {
        return String(entry);
      }
      return "";
    })
    .filter(Boolean))];
}

function valueOrNone(value) {
  return value === undefined || value === null || value === "" ? "none" : String(value);
}

function buildLaneEvidencePacket(manifest, antiChurnRecord = {}, options = {}) {
  const existingPacket =
    manifest.lane_evidence_packet && typeof manifest.lane_evidence_packet === "object" ? manifest.lane_evidence_packet : {};
  const prDeliveryEvidence = Object.hasOwn(options, "prDeliveryEvidence")
    ? options.prDeliveryEvidence
    : manifest.pr_delivery_evidence || existingPacket.pr_delivery || null;
  const prGateEvidence = Object.hasOwn(options, "prGateEvidence")
    ? options.prGateEvidence
    : manifest.pr_gate_evidence || existingPacket.pr_gate || null;
  const deliverySubagentAudit = Object.hasOwn(options, "deliverySubagentAudit")
    ? options.deliverySubagentAudit
    : manifest.delivery_subagent_audit || existingPacket.delivery_subagent_audit || null;
  const cleanupAuthorityDecision = Object.hasOwn(options, "cleanupAuthorityDecision")
    ? options.cleanupAuthorityDecision
    : manifest.cleanup_authority_decision || existingPacket.cleanup || null;
  return {
    ...existingPacket,
    schemaVersion: 1,
    task_id: manifest.task_id,
    branch: manifest.branch,
    worktree_path: manifest.worktree_path,
    updated_at: antiChurnRecord.updated_at || new Date().toISOString(),
    anti_churn_finalization: shapeAntiChurnEvidencePacket(antiChurnRecord, options),
    pr_delivery: prDeliveryEvidence,
    pr_gate: prGateEvidence,
    outdated_thread_adjudications: Array.isArray(manifest.outdated_thread_adjudications)
      ? manifest.outdated_thread_adjudications.slice(-20)
      : [],
    outdated_thread_resolution_outcomes: retainedResolutionOutcomes(manifest.outdated_thread_resolution_outcomes),
    current_thread_adjudications: Array.isArray(manifest.current_thread_adjudications)
      ? manifest.current_thread_adjudications.slice(-20)
      : [],
    current_thread_resolution_outcomes: retainedResolutionOutcomes(manifest.current_thread_resolution_outcomes),
    delivery_subagent_audit: deliverySubagentAudit,
    cleanup: cleanupAuthorityDecision,
    authority_decisions: shapeLaneAuthorityDecisions(manifest, {
      ...options,
      prDeliveryEvidence,
      prGateEvidence,
      cleanupAuthorityDecision,
      existingAuthorityDecisions: existingPacket.authority_decisions,
    }),
  };
}

function shapeAuthorityDecisionEvidence(options = {}) {
  const blockedReasons = uniqueTextValues(options.blockedReasons || options.blockers || []);
  return {
    schemaVersion: 1,
    operation: valueOrNone(options.operation),
    authorityFamily: valueOrNone(options.authorityFamily),
    authorityProfile: valueOrNone(options.authorityProfile || "standard-delivery"),
    decision: valueOrNone(options.decision),
    allowed: Boolean(options.allowed),
    requiredGates: uniqueTextValues(options.requiredGates),
    satisfiedGates: uniqueTextValues(options.satisfiedGates),
    blockedReasons,
    stopLines: uniqueTextValues(options.stopLines),
    evidenceRefs: uniqueTextValues(options.evidenceRefs),
    nextSafeAction: options.nextSafeAction || null,
    recoveryPath: options.recoveryPath || "Preserve metadata evidence, fix the blocked gate, and rerun the same command.",
    recordedAt: options.recordedAt || options.generatedAt || new Date().toISOString(),
    metadataOnly: true,
    rawPayloadRetained: false,
  };
}

function appendAuthorityDecision(target, decision) {
  const clean = normalizeAuthorityDecision(decision);
  if (!clean) {
    return;
  }
  target.authority_decisions = [...copyJsonArray(target.authority_decisions).map(normalizeAuthorityDecision).filter(Boolean), clean].slice(-20);
}

function normalizeAuthorityDecision(decision, overrides = {}) {
  if (!decision || typeof decision !== "object" || Array.isArray(decision)) {
    return null;
  }
  const normalized = shapeAuthorityDecisionEvidence({ ...decision, ...overrides });
  if (
    normalized.operation === "none" ||
    normalized.authorityFamily === "none" ||
    normalized.decision === "none" ||
    normalized.recordedAt === "none"
  ) {
    return null;
  }
  return normalized;
}

function shapeLaneAuthorityDecisions(manifest, options = {}) {
  const decisions = [
    ...copyJsonArray(options.existingAuthorityDecisions),
    ...copyJsonArray(manifest.authority_decisions),
    manifest.pr_delivery_evidence?.authorityDecision,
    manifest.pr_gate_evidence?.authorityDecision,
    options.prDeliveryEvidence?.authorityDecision,
    options.prGateEvidence?.authorityDecision,
    options.cleanupAuthorityDecision,
    manifest.cleanup_authority_decision,
  ].map(normalizeAuthorityDecision).filter(Boolean);
  const seen = new Set();
  return decisions.filter((entry) => {
    const key = [entry.operation, entry.recordedAt, entry.decision].join("|");
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function shapePrDeliveryEvidence(manifest, options = {}) {
  const prBody = typeof options.prBody === "string" ? options.prBody : "";
  const verifyCommand = Array.isArray(options.verifyCommand) ? options.verifyCommand.filter(Boolean).join(" ") : "";
  const verificationPlan = options.verificationPlan && typeof options.verificationPlan === "object" && !Array.isArray(options.verificationPlan)
    ? options.verificationPlan
    : {};
  const verificationGateSatisfied = Boolean(verifyCommand) || Boolean(options.noVerify);
  const requiredGates = [
    "clean worktree or intentionally staged changes",
    "configured verification command or explicitly recorded no-verify decision",
    "anti-churn finalization before delivery mutation",
    "safe branch",
    "expected base branch",
    "push succeeded before PR evidence is recorded",
  ];
  const stopLines = [
    "no provider/model calls",
    "no paid usage",
    "no worker launch",
    "no credential or sensitive-material retention",
    "no merge or cleanup from finish-pr",
    "no failed-check bypass",
    "no review-thread mutation",
  ];
  return {
    schemaVersion: 1,
    operation: options.existingPr ? "update-existing-pr-reference" : "create-pr",
    status: "recorded",
    authorityProfile: "standard-delivery",
    taskId: manifest.task_id,
    branch: manifest.pr_delivery_branch || manifest.branch,
    baseBranch: manifest.pr_delivery_base_branch || manifest.base_branch || null,
    headRevision: manifest.pr_delivery_head_sha || null,
    pushedAt: manifest.pr_delivery_pushed_at || null,
    pullRequestUrl: manifest.pr_url || null,
    pullRequestNumber: manifest.pr_number || null,
    pullRequestTitle: typeof options.prTitle === "string" ? options.prTitle : null,
    pullRequestBodyLineCount: prBody ? prBody.split(/\r?\n/).length : 0,
    pullRequestBodyCharCount: prBody.length,
    verificationGate: verifyCommand
      ? {
          status: "passed",
          command: verifyCommand,
          profile: verificationPlan.profile || null,
          resolvedProfile: verificationPlan.resolvedProfile || null,
          reason: verificationPlan.reason || null,
          changedFileCount: Array.isArray(verificationPlan.changedFiles) ? verificationPlan.changedFiles.length : 0,
          verifiedAt: manifest.last_verified_at || null,
        }
      : {
          status: "not-run",
          decision: options.noVerify ? "explicit-no-verify" : "no-verification-profile",
          recordedAt: new Date().toISOString(),
        },
    requiredGates,
    stopLines,
    authorityDecision: shapeAuthorityDecisionEvidence({
      operation: "finish-pr",
      authorityFamily: "delivery",
      decision: "recorded",
      allowed: true,
      requiredGates,
      satisfiedGates: requiredGates.filter(
        (gate) => verificationGateSatisfied || gate !== "configured verification command or explicitly recorded no-verify decision",
      ),
      stopLines,
      evidenceRefs: [
        `task:${manifest.task_id}`,
        `branch:${manifest.pr_delivery_branch || manifest.branch}`,
        manifest.pr_number ? `pr:${manifest.pr_number}` : "",
        manifest.pr_delivery_head_sha ? `head:${manifest.pr_delivery_head_sha}` : "",
      ],
      recoveryPath: "If push or PR creation/update fails, leave the local branch and manifest in place, preserve command output, and rerun finish-pr after fixing the gate.",
    }),
    recoveryPath: "If push or PR creation/update fails, leave the local branch and manifest in place, preserve command output, and rerun finish-pr after fixing the gate.",
    metadataOnly: true,
  };
}

function shapeAntiChurnEvidencePacket(record = {}, options = {}) {
  const filesChanged = uniqueTextValues(record.files_changed);
  return {
    mode: valueOrNone(record.mode),
    status: valueOrNone(record.status),
    event_store_references: shapeEventStoreReferences(record.local_event_storage),
    lessons_evaluated: Number(record.lessons_evaluated || 0),
    applied_edits: shapeAppliedEditEvidence(record.applied),
    proposals: shapeProposalEvidence(record),
    no_op_reasons: shapeNoOpReasonEvidence(record),
    verification: shapeVerificationEvidence(record.verification),
    residual_risks: uniqueTextValues(record.residual_risks),
    next_safe_action: record.next_safe_action || null,
    source_edit_delivery: {
      files_changed: filesChanged,
      included_in_lane_pr: filesChanged.length ? "governed-by-finish-pr-staging-policy" : "none",
      local_only_telemetry_or_proposals: filesChanged.length === 0,
      rollback_or_recovery_path: antiChurnRecoveryPath(record),
      current_worktree_paths: statusPaths(options.worktreeStatus),
    },
  };
}

function shapeEventStoreReferences(value) {
  return copyJsonArray(value).map((entry) => ({
    lane: fieldValue(entry, ["lane"]) || null,
    eventStore: fieldValue(entry, ["eventStore", "path"]) || null,
    eventCount: Number.isFinite(Number(entry?.eventCount)) ? Number(entry.eventCount) : null,
  }));
}

function shapeAppliedEditEvidence(value) {
  return copyJsonArray(value).map((entry) => ({
    candidateId: fieldValue(entry, ["candidateId"]) || null,
    targetFile: fieldValue(entry, ["targetFile", "file", "target"]) || null,
    transactionId: fieldValue(entry, ["transactionId"]) || null,
    status: fieldValue(entry, ["status"]) || null,
  }));
}

function shapeProposalEvidence(record = {}) {
  return [
    ...copyJsonArray(record.proposals),
    ...copyJsonArray(record.skipped).filter((entry) => entry?.noOpReason === "requires-higher-authority" || entry?.noOpReason === "proposal-only"),
  ].map((entry) => ({
    candidateId: fieldValue(entry, ["candidateId"]) || null,
    sourceEventId: fieldValue(entry, ["sourceEventId"]) || null,
    decision: fieldValue(entry, ["decision"]) || "proposal-only",
    noOpReason: fieldValue(entry, ["noOpReason"]) || null,
    proposedTarget: fieldValue(entry, ["proposedTarget", "durableTarget", "targetFile", "target"]) || null,
    requiredAuthority: fieldList(entry, ["requiredAuthority", "requiresAuthority", "authority"]) || null,
    requiredAuthorityFamily: fieldList(entry, ["requiredAuthorityFamily"]) || null,
    evidenceReferences: fieldList(entry, ["evidenceReferences", "evidenceRefs", "collapsedSourceEventIds", "sourceEventId"]) || null,
    reviewPath: fieldValue(entry, ["reviewPath", "approvalGuidance", "verificationIdea"]) || "local-only proposal review",
    locality: "local-only",
    approval: "not-approved",
  }));
}

function shapeNoOpReasonEvidence(record = {}) {
  const counts = new Map();
  const reasons = [
    record.omitted_reason,
    ...(["proposal-only", "requires-higher-authority"].includes(record.status) ? [record.status] : []),
    ...copyJsonArray(record.proposals).map((entry) => entry?.noOpReason || entry?.decision || "proposal-only"),
    ...copyJsonArray(record.skipped).map((entry) => entry?.noOpReason || entry?.decision || entry?.status),
  ].filter(Boolean);
  for (const reason of reasons) {
    counts.set(reason, (counts.get(reason) || 0) + 1);
  }
  return [...counts.entries()].map(([reason, count]) => ({ reason, count }));
}

function shapeVerificationEvidence(value) {
  return copyJsonArray(value).map((entry) => ({
    target: fieldValue(entry, ["target"]) || null,
    command: fieldValue(entry, ["command"]) || null,
    status: fieldValue(entry, ["status"]) || null,
    result: fieldValue(entry, ["result"]) || null,
    exitCode: fieldValue(entry, ["exitCode"]) || null,
  }));
}

function antiChurnRecoveryPath(record = {}) {
  const transactionIds = uniqueTextValues(copyJsonArray(record.applied).map((entry) => fieldValue(entry, ["transactionId"])));
  if (transactionIds.length) {
    return `inspect hook transaction ${transactionIds.join(", ")} or revert the lane PR source edit`;
  }
  if (record.status === "verification-failed") {
    return "inspect verification failure proposal; hook-owned source patch should already be rolled back";
  }
  if (record.status === "verification-pending-approval") {
    return "request verification approval before restoring or including any hook source edit";
  }
  return "not-required";
}

function closeMissingWorktree(argv) {
  assertMissingWorktreeCloseoutMainCheckout();
  assertMissingWorktreeCloseoutOptionSyntax(argv);
  const { positional, options } = parseOptions(argv);
  if (positional.length !== 1) {
    throw new Error("close-missing-worktree requires exactly one explicit allowlisted task id.");
  }
  const taskId = positional[0];
  assertSafeTaskId(taskId);
  if (!Object.hasOwn(missingWorktreeCloseoutTargets, taskId)) {
    throw new Error(`close-missing-worktree only permits the approved exact task ids; refused ${taskId}.`);
  }
  if (options.apply && options.dryRun) {
    throw new Error("close-missing-worktree accepts either --dry-run or --apply, not both.");
  }
  if (options.summaryJson && options.apply) {
    throw new Error("close-missing-worktree --summary-json is only supported without --apply.");
  }
  const approval = normalizedMissingWorktreeApproval(options.approval);
  if (options.apply && !approval) {
    throw new Error("close-missing-worktree --apply requires --approval with at least 10 non-whitespace characters.");
  }

  const state = workspaceState(options);
  const record = findMissingWorktreeManifestByExactTaskId(state, taskId);
  requireGh("close-missing-worktree");
  const staleAfterSeconds = positiveInteger(options.staleAfterSeconds, 86_400);
  const packet = buildMissingWorktreeCloseoutPacket(record, state, {
    staleAfterSeconds,
    approval,
    currentOwner: currentLaneOwner(options),
  });

  if (options.summaryJson) {
    console.log(JSON.stringify(packet, null, 2));
    return;
  }
  if (!packet.ready) {
    printBlocked("close-missing-worktree", packet.blockers);
    throw new Error(`Missing-worktree closeout is blocked: ${packet.blockers.join("; ")}`);
  }
  if (!options.apply) {
    printPlan("close-missing-worktree", [
      `exact task ${taskId}`,
      "all absence and live GitHub evidence matched",
      "no worktree, local branch, remote branch, assignment, or PR mutation is planned",
      "pass --apply with explicit --approval to close only the manifest",
    ]);
    return;
  }

  let appliedPacket = null;
  withAssignmentsIndexLock(state, () => withManifestLock(state, taskId, ({ token }) => {
    const lockedRecord = findMissingWorktreeManifestByExactTaskId(state, taskId);
    const lockedPacket = buildMissingWorktreeCloseoutPacket(lockedRecord, state, {
      staleAfterSeconds,
      approval,
      applying: true,
      currentOwner: currentLaneOwner(options),
      preLockEvidence: packet.proof.taskLock,
      heldLockToken: token,
    });
    if (!lockedPacket.ready) {
      throw new Error(`Missing-worktree closeout changed under lock: ${lockedPacket.blockers.join("; ")}`);
    }

    const manifest = lockedRecord.manifest;
    const closedAt = new Date().toISOString();
    manifest.missing_worktree_closeout = {
      schemaVersion: 1,
      appliedAt: closedAt,
      taskId: manifest.task_id,
      approval,
      proof: lockedPacket.proof,
      authorityDecision: lockedPacket.authorityDecision,
      mutation: "manifest metadata and status only; no worktree or branch deletion",
      remoteBranchPolicy: "verified absent; never deleted",
      recoveryPath: `Restore manifest status if needed; no worktree or branch resource was removed by this command.`,
    };
    appendAuthorityDecision(manifest, lockedPacket.authorityDecision);
    manifest.status = "closed";
    manifest.closed_at = closedAt;
    manifest.updated_at = closedAt;
    manifest.closed_reason = lockedPacket.proof.github.kind === "superseded-no-pr"
      ? `approved missing managed worktree recovery superseded by PR #${lockedPacket.proof.github.supersededBy.prNumber}`
      : "approved missing managed worktree recovery";
    appendTaskEvent(manifest, "missing_worktree_closeout_verified", "all required absent-resource and GitHub evidence matched under manifest and assignment-index locks");
    appendTaskEvent(manifest, "closed", "approved missing-worktree metadata-only closeout");
    writeManifest(lockedRecord.path, manifest);
    appliedPacket = lockedPacket;
  }, { recoverStale: false }));

  printApplied("close-missing-worktree", [
    `closed manifest ${taskId}`,
    "recorded bounded recovery and authority evidence",
    "no worktree, local branch, remote branch, assignment, or PR was mutated",
    `recovery: ${appliedPacket?.authorityDecision?.recoveryPath || "restore manifest status from recorded evidence"}`,
  ]);
}

function assertMissingWorktreeCloseoutMainCheckout() {
  const expected = canonicalExistingPath(mainWorktreePath());
  const current = canonicalExistingPath(currentGitRoot());
  if (!expected || !current || expected !== current) {
    throw new Error("close-missing-worktree must be invoked from the repository main checkout.");
  }
}

function assertMissingWorktreeCloseoutOptionSyntax(argv) {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const option = ["--apply", "--dry-run", "--summary-json"].find((name) => arg === name || arg.startsWith(`${name}=`));
    if (!option) continue;
    if (arg !== option || (index + 1 < argv.length && !argv[index + 1].startsWith("--"))) {
      throw new Error(`close-missing-worktree ${option} must be a bare flag without a value.`);
    }
  }
}

function normalizedMissingWorktreeApproval(value) {
  if (value === undefined) return null;
  if (value === true || typeof value !== "string") return null;
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized.replace(/\s/g, "").length >= 10 ? normalized.slice(0, 256) : null;
}

function findMissingWorktreeManifestByExactTaskId(state, taskId) {
  assertSafeTaskId(taskId);
  const path = manifestPath(state, taskId);
  if (!existsSync(path)) {
    throw new Error(`close-missing-worktree requires the exact manifest ${taskId}.`);
  }
  const manifest = readManifest(path);
  validateManifest(manifest, path);
  if (manifest.task_id !== taskId) {
    throw new Error(`close-missing-worktree manifest identity mismatch for ${taskId}.`);
  }
  return { path, manifest };
}

function manifestPath(state, taskId) {
  assertSafeTaskId(taskId);
  return join(state.tasksDir, `${taskId}.json`);
}

function buildMissingWorktreeCloseoutPacket(record, state, context) {
  const { manifest } = record;
  const target = missingWorktreeCloseoutTargets[manifest.task_id];
  const checkedAt = new Date().toISOString();
  const blockers = [];
  if (!target) blockers.push("manifest task id is not an approved missing-worktree closeout target");
  if (manifest.status === "closed") blockers.push("manifest is already closed");
  if (manifest.status === "cleanup_partial" || manifest.cleanup_started_at) blockers.push("manifest has started cleanup evidence and requires its existing recovery path");
  if (target && (manifest.branch !== target.branch || basename(resolve(manifest.worktree_path || "")) !== target.worktreeName)) blockers.push("manifest branch or managed worktree path does not match the immutable allowlisted target");
  if (manifest.source_assignment_id) blockers.push("manifest retains a linked assignment id");
  if (typeof manifest.owner !== "string" || !manifest.owner.trim()) blockers.push("manifest has no owner to prove stale");

  const repository = missingWorktreeRepositoryEvidence(manifest);
  if (repository.status !== "matched") blockers.push(repository.reason);

  const owner = missingWorktreeOwnerEvidence(manifest, context.staleAfterSeconds, checkedAt);
  if (owner.status !== "stale") blockers.push(owner.reason);
  const taskLock = missingWorktreeLockEvidence(state, manifest.task_id, context);
  if (taskLock.status !== "absent" && taskLock.status !== "self_held_after_absent_precheck") blockers.push(taskLock.reason);
  const worktree = missingWorktreeRegistrationEvidence(manifest, state, target);
  if (worktree.status !== "absent_unregistered") blockers.push(worktree.reason);
  const localBranch = missingWorktreeLocalBranchEvidence(manifest);
  if (localBranch.status !== "absent") blockers.push(localBranch.reason);
  const remoteBranch = missingWorktreeRemoteBranchEvidence(manifest);
  if (remoteBranch.status !== "absent") blockers.push(remoteBranch.reason);
  const assignments = missingWorktreeAssignmentEvidence(state, manifest);
  if (assignments.status !== "absent") blockers.push(assignments.reason);

  const github = target?.supersededBy
    ? missingWorktreeSupersessionEvidence(manifest, target.supersededBy)
    : target?.prNumber === null
      ? missingWorktreeNoPrEvidence(manifest)
    : missingWorktreeMergedPrEvidence(manifest, target?.prNumber, target);
  if (github.status !== "matched") blockers.push(github.reason);

  const requiredGates = [
    "exact allowlisted task manifest",
    "stale manifest owner evidence",
    "no retained task lock before closeout lock acquisition",
    "managed worktree path is absent and unregistered",
    "local and remote branch refs are absent",
    "no linked assignment metadata exists",
    target?.supersededBy ? `live GitHub confirms no source PR and exact merged successor PR #${target.supersededBy.prNumber}` : target?.prNumber === null ? "live GitHub exact branch query contains no PR" : `live GitHub PR #${target?.prNumber} is merged to dev with an exact head`,
    "explicit approval is required for apply",
  ];
  const ready = blockers.length === 0;
  const authorityDecision = shapeAuthorityDecisionEvidence({
    operation: "close-missing-worktree",
    authorityFamily: "metadata-only-recovery-closeout",
    decision: ready ? (context.applying ? "applied" : "ready_for_apply") : "blocked",
    allowed: ready,
    requiredGates,
    satisfiedGates: ready ? (context.applying ? requiredGates : requiredGates.slice(0, -1)) : [],
    blockedReasons: blockers,
    stopLines: [
      "exact three-task allowlist only",
      "no closeout on ambiguous lock, worktree, branch, assignment, or GitHub evidence",
      "never delete a worktree, local branch, remote branch, assignment, or PR",
      "apply writes only the selected manifest after a fresh locked re-proof",
    ],
    evidenceRefs: [
      `task:${manifest.task_id}`,
      target?.prNumber ? `pr:${target.prNumber}` : "github:no-pr",
      `owner:${safeMetadataText(manifest.owner || "unknown", 160)}`,
    ],
    nextSafeAction: ready
      ? "Run close-missing-worktree --apply with an explicit approval to close only this manifest."
      : "Preserve the manifest and resolve the listed evidence blockers before retrying.",
    recoveryPath: "No resource is deleted. Restore manifest status from the bounded closeout record if a later recovery decision requires it.",
    generatedAt: checkedAt,
  });
  return {
    schemaVersion: 1,
    operation: "close-missing-worktree",
    checkedAt,
    taskId: manifest.task_id,
    ready,
    status: ready ? "ready" : "blocked",
    blockers,
    proof: {
      owner,
      repository,
      taskLock,
      worktree,
      localBranch,
      remoteBranch,
      assignments,
      github,
    },
    authorityDecision,
    mutation: "none; preview only",
  };
}

function missingWorktreeOwnerEvidence(manifest, staleAfterSeconds, checkedAt) {
  const timestamp = [manifest.last_heartbeat_at, manifest.owner_updated_at, manifest.owner_acquired_at, manifest.updated_at]
    .filter((value) => typeof value === "string" && Number.isFinite(Date.parse(value)))
    .sort((left, right) => Date.parse(right) - Date.parse(left))[0] || null;
  const recordedAt = timestamp && Number.isFinite(Date.parse(timestamp)) ? new Date(timestamp).toISOString() : null;
  if (typeof manifest.owner !== "string" || !manifest.owner.trim()) return { status: "blocked", owner: null, recordedAt, ageSeconds: null, reason: "manifest owner is missing" };
  if (!recordedAt) return { status: "blocked", owner: safeMetadataText(manifest.owner, 160), recordedAt: null, ageSeconds: null, reason: "manifest owner heartbeat timestamp is missing or invalid" };
  const ageSeconds = Math.max(0, Math.floor((Date.parse(checkedAt) - Date.parse(recordedAt)) / 1000));
  if (ageSeconds < staleAfterSeconds) {
    return { status: "blocked", owner: safeMetadataText(manifest.owner, 160), recordedAt, ageSeconds, staleAfterSeconds, reason: `manifest owner heartbeat is not stale (age ${ageSeconds}s, threshold ${staleAfterSeconds}s)` };
  }
  return { status: "stale", owner: safeMetadataText(manifest.owner, 160), recordedAt, ageSeconds, staleAfterSeconds, reason: "manifest owner heartbeat is stale" };
}

function missingWorktreeRepositoryEvidence(manifest) {
  const expected = canonicalExistingPath(mainWorktreePath());
  const recorded = canonicalExistingPath(manifest.repo_root);
  if (!expected || !recorded || recorded !== expected) {
    return {
      status: "blocked",
      recordedRepoRoot: typeof manifest.repo_root === "string" ? manifest.repo_root : null,
      currentRepoRoot: mainWorktreePath(),
      reason: "manifest repo_root does not match the current repository root",
    };
  }
  return { status: "matched", recordedRepoRoot: recorded, currentRepoRoot: expected, reason: "manifest repo_root matches the current repository root" };
}

function missingWorktreeLockEvidence(state, taskId, context) {
  const rawObserved = inspectTaskLock(state, taskId);
  const observed = redactTaskLockInspection(rawObserved);
  if (!context.heldLockToken) return observed;
  const preLock = context.preLockEvidence;
  if (preLock?.status !== "absent") {
    return { ...observed, status: "blocked", reason: "task lock was not absent before manifest lock acquisition" };
  }
  if (rawObserved.status !== "active" || rawObserved.metadata?.token !== context.heldLockToken) {
    return { ...observed, status: "blocked", reason: "manifest lock is not actively held for locked re-proof" };
  }
  return {
    ...observed,
    status: "self_held_after_absent_precheck",
    reason: "task lock was absent before this command acquired its manifest lock",
    preLockStatus: preLock.status,
  };
}

function missingWorktreeRegistrationEvidence(manifest, state, target) {
  const path = manifest.worktree_path;
  try {
    const absentTarget = target?.legacyWorktreeRelativePath
      ? assertExactLegacyAbsentWorktreePath(manifest, target)
      : assertManagedAbsentWorktreePath(path, state);
    const registered = managedWorktreeRegistry(manifest, state)
      .some((entry) => resolve(entry.path) === absentTarget.target);
    return registered
      ? { status: "blocked", path: absentTarget.target, exists: false, listed: true, reason: "managed worktree path is still registered" }
      : { status: "absent_unregistered", path: absentTarget.target, exists: false, listed: false, reason: "managed worktree path is absent and unregistered" };
  } catch (error) {
    const message = safeMetadataText(error.message || error, 500);
    return { status: "blocked", path, exists: null, listed: null, reason: message.includes("is present") ? "managed worktree path still exists" : `managed worktree absence or registration evidence is unavailable: ${message}` };
  }
}

function assertExactLegacyAbsentWorktreePath(manifest, target) {
  const repository = canonicalExistingPath(manifest.repo_root);
  const configuredRelativePath = target?.legacyWorktreeRelativePath;
  if (!repository || typeof configuredRelativePath !== "string" || !configuredRelativePath.trim()) {
    throw new Error("legacy managed worktree configuration is invalid");
  }
  const expected = resolve(repository, configuredRelativePath);
  const actual = resolve(manifest.worktree_path || "");
  if (actual !== expected) {
    throw new Error(`legacy managed worktree path does not match the exact approved target: ${manifest.worktree_path}`);
  }
  const rel = relative(repository, actual);
  if (!rel || rel.startsWith("..") || resolve(repository, rel) !== actual) {
    throw new Error(`legacy managed worktree path escapes the repository root: ${manifest.worktree_path}`);
  }
  let inspected = repository;
  for (const segment of rel.split(sep)) {
    inspected = join(inspected, segment);
    try {
      const stat = lstatSync(inspected);
      if (stat.isSymbolicLink()) {
        throw new Error(`legacy managed worktree path traverses a symlink: ${manifest.worktree_path}`);
      }
      const canonical = canonicalExistingPath(inspected);
      if (!canonical || (canonical !== repository && !canonical.startsWith(`${repository}${sep}`))) {
        throw new Error(`legacy managed worktree path is outside the repository root: ${manifest.worktree_path}`);
      }
    } catch (error) {
      if (error?.code === "ENOENT") return { target: actual, managedRoot: repository, legacy: true };
      throw error;
    }
  }
  throw new Error(`legacy managed worktree path is present: ${manifest.worktree_path}`);
}

function missingWorktreeLocalBranchEvidence(manifest) {
  const result = git(["rev-parse", "--verify", "--quiet", manifest.branch], { cwd: mainWorktreePath() });
  if (result.code === 1 && !result.stdout && !result.stderr) {
    return { status: "absent", branch: manifest.branch, headSha: null, reason: "local branch is absent" };
  }
  if (result.code === 0 && exactGitObjectIdOrNull(result.stdout)) {
    return { status: "blocked", branch: manifest.branch, headSha: result.stdout, reason: "local branch is still present" };
  }
  return { status: "blocked", branch: manifest.branch, headSha: null, reason: `local branch absence is ambiguous: ${safeMetadataText(result.stderr || result.stdout || `git exited ${result.code}`, 500)}` };
}

function missingWorktreeRemoteBranchEvidence(manifest) {
  try {
    const headSha = originBranchSha(manifest.branch, mainWorktreePath()) || null;
    return headSha
      ? { status: "blocked", branch: manifest.branch, headSha, reason: "remote branch is still present" }
      : { status: "absent", branch: manifest.branch, headSha: null, reason: "remote branch is absent" };
  } catch (error) {
    return { status: "blocked", branch: manifest.branch, headSha: null, reason: `remote branch absence is ambiguous: ${safeMetadataText(error.message || error, 500)}` };
  }
}

function missingWorktreeAssignmentEvidence(state, manifest) {
  if (!existsSync(state.assignmentsDir)) return { status: "absent", ids: [], reason: "no assignment metadata directory exists" };
  try {
    const linked = [];
    for (const name of readdirSync(state.assignmentsDir).filter((entry) => entry.endsWith(".json")).sort()) {
      const path = join(state.assignmentsDir, name);
      const assignment = readAssignment(path);
      validateAssignment(assignment, path);
      const values = [
        assignment.task_id,
        assignment.lane_slug,
        assignment.branch,
        assignment.source_backlog_item?.item_id,
        assignment.source_backlog_item?.branch_name,
      ].filter(Boolean).map(String);
      const matchingWorktreePath = sameAbsentPath(assignment.worktree_path, manifest.worktree_path);
      if (values.includes(manifest.task_id) || values.includes(manifest.branch) || matchingWorktreePath) linked.push(assignment.assignment_id);
    }
    return linked.length
      ? { status: "blocked", ids: linked.slice(0, 10), reason: `linked assignment metadata exists: ${linked.join(", ")}` }
      : { status: "absent", ids: [], reason: "no linked assignment metadata exists" };
  } catch (error) {
    return { status: "blocked", ids: [], reason: `assignment absence is ambiguous: ${safeMetadataText(error.message || error, 500)}` };
  }
}

function missingWorktreeNoPrEvidence(manifest, expectedHistoricalHead = null) {
  if (manifest.pr_number !== undefined && manifest.pr_number !== null) {
    return { status: "blocked", kind: "no-pr", reason: "no-PR manifest retains PR number metadata" };
  }
  if (typeof manifest.pr_url === "string" && manifest.pr_url.trim()) {
    return { status: "blocked", kind: "no-pr", reason: "no-PR manifest retains PR URL metadata" };
  }
  const recordedHistoricalHead = exactGitObjectIdOrNull(manifest.historical_source_head_sha);
  const historicalHeadWasRecorded = manifest.historical_source_head_sha !== undefined && manifest.historical_source_head_sha !== null;
  const expectedHead = expectedHistoricalHead === null ? null : exactGitObjectIdOrNull(expectedHistoricalHead);
  if (expectedHistoricalHead !== null && !expectedHead) {
    return { status: "blocked", kind: "no-pr", reason: "approved no-PR supersession source head is invalid" };
  }
  if (historicalHeadWasRecorded && !recordedHistoricalHead) {
    return { status: "blocked", kind: "no-pr", reason: "no-PR manifest historical source head is invalid" };
  }
  if (recordedHistoricalHead && expectedHead && recordedHistoricalHead !== expectedHead) {
    return { status: "blocked", kind: "no-pr", reason: "manifest historical source head does not match the approved supersession source head" };
  }
  const historicalHead = expectedHead || recordedHistoricalHead;
  if (!historicalHead) {
    return { status: "blocked", kind: "no-pr", reason: "no-PR manifest historical source head is missing or invalid" };
  }
  const result = run("gh", ["pr", "list", "--head", manifest.branch, "--state", "all", "--json", "number,url,state,mergedAt,baseRefName,headRefName,headRefOid"], { cwd: mainWorktreePath() });
  if (result.code !== 0) return { status: "blocked", kind: "no-pr", reason: "live GitHub no-PR proof is unavailable" };
  try {
    const entries = JSON.parse(result.stdout);
    if (!Array.isArray(entries)) throw new Error("GitHub response is not an array");
    for (const entry of entries) {
      const liveHead = exactGitObjectIdOrNull(entry?.headRefOid);
      if (liveHead !== historicalHead) {
        return { status: "blocked", kind: "no-pr", count: entries.length, historicalHead, reason: "live GitHub no-PR proof found PR evidence with a head that does not match the immutable historical source head" };
      }
    }
    if (entries.length > 0) return { status: "blocked", kind: "no-pr", count: entries.length, historicalHead, reason: "live GitHub no-PR proof found PR evidence matching the immutable historical source head" };
    return { status: "matched", kind: "no-pr", count: 0, historicalHead, reason: "live GitHub no-PR proof matched" };
  } catch {
    return { status: "blocked", kind: "no-pr", reason: "live GitHub no-PR proof is unavailable" };
  }
}

function missingWorktreeSupersessionEvidence(manifest, target) {
  const recoveredSourceCommit = exactGitObjectIdOrNull(target?.recoveredSourceCommit);
  const sourceTree = exactGitObjectIdOrNull(target?.sourceTree);
  const sourceParent = exactGitObjectIdOrNull(target?.sourceParent);
  const prHead = exactGitObjectIdOrNull(target?.prHead);
  const mergeCommit = exactGitObjectIdOrNull(target?.mergeCommit);
  const prNumber = Number(target?.prNumber);
  const scope = Array.isArray(target?.scope) ? [...target.scope].sort() : [];
  if (!recoveredSourceCommit || !sourceTree || !sourceParent || !prHead || !mergeCommit || !Number.isSafeInteger(prNumber) || prNumber <= 0 || scope.length === 0 || scope.some((path) => typeof path !== "string" || !path)) {
    return { status: "blocked", kind: "superseded-no-pr", reason: "approved supersession target is malformed" };
  }
  const noPr = missingWorktreeNoPrEvidence(manifest, recoveredSourceCommit);
  if (noPr.status !== "matched") return { ...noPr, kind: "superseded-no-pr" };
  const cwd = mainWorktreePath();
  if (![sourceParent, prHead, mergeCommit].every((commit) => gitCommitExists(commit, cwd))) {
    return { status: "blocked", kind: "superseded-no-pr", reason: "approved supersession commit evidence is unavailable locally" };
  }
  if (!sameStringList(gitCommitParents(prHead, cwd), [sourceParent])) {
    return { status: "blocked", kind: "superseded-no-pr", reason: "approved supersession PR head does not retain the exact immutable source parent" };
  }
  const reachableTree = git(["rev-parse", `${prHead}^{tree}`], { cwd });
  const headScope = scopedChangedPaths(sourceParent, prHead, [], cwd);
  if (reachableTree.code !== 0 || exactGitObjectIdOrNull(reachableTree.stdout.trim()) !== sourceTree || headScope.error || !sameStringList(headScope.paths, scope)) {
    return { status: "blocked", kind: "superseded-no-pr", reason: "approved supersession reachable PR-head tree or scoped change evidence does not match the recovered source evidence" };
  }
  const result = run("gh", ["pr", "view", String(prNumber), "--json", "number,mergedAt,state,baseRefName,headRefOid,mergeCommit"], { cwd });
  if (result.code !== 0) return { status: "blocked", kind: "superseded-no-pr", reason: "live GitHub successor PR proof is unavailable" };
  try {
    const pr = parseGhJson(result.stdout, `superseding PR #${prNumber}`);
    const liveHead = exactGitObjectIdOrNull(pr?.headRefOid);
    const liveMerge = exactGitObjectIdOrNull(pr?.mergeCommit?.oid);
    if (Number(pr?.number) !== prNumber || String(pr?.state || "").toUpperCase() !== "MERGED" || String(pr?.baseRefName || "") !== defaultBaseBranch || liveHead !== prHead || liveMerge !== mergeCommit || !pr?.mergedAt) {
      return { status: "blocked", kind: "superseded-no-pr", reason: "live GitHub successor PR does not match the approved immutable PR #710 evidence" };
    }
    const headToMerge = git(["diff", "--quiet", prHead, mergeCommit], { cwd });
    let liveBaseHead;
    try {
      liveBaseHead = originBranchSha(defaultBaseBranch, cwd) || null;
    } catch {
      return { status: "blocked", kind: "superseded-no-pr", reason: "live canonical origin/dev evidence is unavailable" };
    }
    const localBaseHead = branchSha(`origin/${defaultBaseBranch}`, cwd) || null;
    if (headToMerge.code > 1 || headToMerge.code !== 0 || !gitCommitParents(mergeCommit, cwd).includes(prHead) || !liveBaseHead || liveBaseHead !== localBaseHead || !gitCommitIsAncestor(mergeCommit, localBaseHead, cwd)) {
      return { status: "blocked", kind: "superseded-no-pr", reason: "approved successor merge is not exactly retained in canonical dev" };
    }
    return {
      status: "matched",
      kind: "superseded-no-pr",
      historicalHead: recoveredSourceCommit,
      count: noPr.count,
      supersededBy: { prNumber, recoveredSourceCommit, sourceTree, sourceParent, prHead, mergeCommit, scope, liveBaseHead },
      reason: `live no-PR source proof and immutable PR #${prNumber} supersession proof matched`,
    };
  } catch {
    return { status: "blocked", kind: "superseded-no-pr", reason: "live GitHub successor PR proof is unavailable" };
  }
}

function missingWorktreeMergedPrEvidence(manifest, expectedNumber, target) {
  if (manifest.pr_number !== expectedNumber) {
    return { status: "blocked", kind: "merged-pr", expectedNumber, reason: `manifest PR number must exactly equal ${expectedNumber}` };
  }
  if (manifest.pr_url && prNumberFromUrl(manifest.pr_url) !== expectedNumber) {
    return { status: "blocked", kind: "merged-pr", expectedNumber, reason: "manifest PR URL does not match the approved PR number" };
  }
  const result = run("gh", ["pr", "view", String(expectedNumber), "--json", "number,url,mergedAt,state,baseRefName,headRefName,headRefOid"], { cwd: mainWorktreePath() });
  if (result.code !== 0) return { status: "blocked", kind: "merged-pr", expectedNumber, reason: "live GitHub merged-PR proof is unavailable" };
  try {
    const pr = JSON.parse(result.stdout);
    if (!pr || typeof pr !== "object" || Array.isArray(pr)) throw new Error("malformed PR response");
    if (pr.number !== expectedNumber) throw new Error("PR number mismatch");
    if (pr.state !== "MERGED" || !isIsoTimestamp(pr.mergedAt)) throw new Error("PR is not merged with mergedAt evidence");
    if (pr.baseRefName !== "dev") throw new Error("PR base is not dev");
    if (pr.headRefName !== manifest.branch) throw new Error("PR head branch does not match manifest branch");
    const recordedHead = exactGitObjectIdOrNull(manifest.pr_delivery_head_sha) || exactGitObjectIdOrNull(manifest.historical_pr_head_sha);
    if (!recordedHead) throw new Error("immutable recorded PR head is missing or invalid");
    const headSha = exactGitObjectIdOrNull(pr.headRefOid);
    if (!headSha) throw new Error("PR head is not an exact Git object id");
    if (recordedHead !== headSha) {
      const approvedPair = target?.approvedAncestorDeliveryHeadPair;
      if (!approvedPair || recordedHead !== approvedPair.recordedHead || headSha !== approvedPair.livePrHead) {
        throw new Error("recorded delivery head does not match the approved immutable ancestor delivery pair");
      }
      return {
        status: "matched",
        kind: "merged-pr",
        number: pr.number,
        url: safeMetadataText(pr.url || "", 500) || null,
        mergedAt: pr.mergedAt,
        baseRefName: pr.baseRefName,
        headRefName: pr.headRefName,
        headRefOid: headSha,
        recordedHead,
        headRelation: "approved_recorded_head_is_known_ancestor_of_live_pr_head",
        reason: "live merged PR proof matched the approved immutable recorded ancestor pair",
      };
    }
    return {
      status: "matched",
      kind: "merged-pr",
      number: pr.number,
      url: safeMetadataText(pr.url || "", 500) || null,
      mergedAt: pr.mergedAt,
      baseRefName: pr.baseRefName,
      headRefName: pr.headRefName,
      headRefOid: headSha,
      recordedHead,
      reason: "live merged PR proof matched",
    };
  } catch (error) {
    return { status: "blocked", kind: "merged-pr", expectedNumber, reason: `live GitHub merged-PR proof is unavailable or mismatched: ${safeMetadataText(error.message || error, 500)}` };
  }
}

function cleanupMerged(argv, mode = {}) {
  const { positional, options } = parseOptions(argv);
  if (options.summaryJson && options.apply) {
    throw new Error("cleanup-merged --summary-json is only supported without --apply.");
  }
  const state = workspaceState(options);
  const records = mode.currentOnly
    ? [findCleanupManifest(state, positional.join(" "), { preferCurrentWorktree: true })]
    : positional.length > 0
      ? [findCleanupManifest(state, positional.join(" "))]
      : readCleanupManifests(state);
  const deleteRemote = Boolean(options.deleteRemote);
  const apply = Boolean(options.apply);
  const currentOwner = currentLaneOwner(options);
  const summaryResults = [];
  let ghChecked = false;

  for (const record of records) {
    const { manifest, path: manifestPath } = record;
    if (manifest.status === "closed") {
      if (options.summaryJson) {
        summaryResults.push(cleanupMergedSkipSummary(manifest, "skipped_closed", "workspace manifest is already closed", { deleteRemote }));
      }
      continue;
    }
    assertLaneOwner(manifest, options);
    const cleanupTarget = assertCleanupWorktreeForMerged(manifest, state);
    if (!ghChecked) {
      requireGh("cleanup-merged");
      ghChecked = true;
    }
    reconcileManifest(manifest, { refreshPr: true });

    const pr = prView(manifest);
    if (!pr || !pr.mergedAt) {
      if (options.summaryJson) {
        summaryResults.push(cleanupMergedSkipSummary(manifest, "skipped_unmerged_pr", "PR is not merged", { pr, deleteRemote }));
        continue;
      }
      console.log(`SKIP ${manifest.task_id}: PR is not merged.`);
      continue;
    }
    if (pr.baseRefName && pr.baseRefName !== manifest.base_branch) {
      if (options.summaryJson) {
        summaryResults.push(
          cleanupMergedSkipSummary(manifest, "skipped_pr_base_mismatch", `PR base is ${pr.baseRefName}, expected ${manifest.base_branch}`, {
            pr,
            deleteRemote,
          }),
        );
        continue;
      }
      console.log(`SKIP ${manifest.task_id}: PR base is ${pr.baseRefName}, expected ${manifest.base_branch}.`);
      continue;
    }

    const cleanupCwd = cleanupRepositoryRoot(manifest.worktree_path, state, cleanupTarget);
    const worktreeStatus = worktreeCleanupStatus(manifest, cleanupCwd);
    if (worktreeStatus.dirty) {
      if (options.summaryJson) {
        summaryResults.push(cleanupMergedSkipSummary(manifest, "skipped_dirty_worktree", "worktree is not clean", { pr, worktreeStatus, deleteRemote }));
        continue;
      }
      console.log(`SKIP ${manifest.task_id}: worktree is not clean.`);
      continue;
    }

    let cleanupHeadBlocker = "";
    try {
      preflightCleanupBranchHeads(manifest, cleanupCwd, requireCleanupHeadSha(manifest, pr), deleteRemote);
    } catch (error) {
      cleanupHeadBlocker = error.message;
    }
    if (cleanupHeadBlocker && (options.summaryJson || options.dryRun || !apply)) {
      if (options.summaryJson) {
        summaryResults.push(
          cleanupMergedSkipSummary(manifest, "skipped_head_mismatch", cleanupHeadBlocker, {
            pr,
            worktreeStatus,
            deleteRemote,
          }),
        );
        continue;
      }
      console.log(`SKIP ${manifest.task_id}: ${cleanupHeadBlocker}`);
      continue;
    }

    const remoteResumeBlocker = cleanupRemoteResumeBlocker(manifest, deleteRemote);
    if (remoteResumeBlocker && (options.summaryJson || options.dryRun || !apply)) {
      if (options.summaryJson) {
        summaryResults.push(
          cleanupMergedSkipSummary(manifest, "skipped_remote_cleanup_required", remoteResumeBlocker, {
            pr,
            worktreeStatus,
            deleteRemote,
          }),
        );
        continue;
      }
      console.log(`SKIP ${manifest.task_id}: ${remoteResumeBlocker}`);
      continue;
    }

    const cleanupAuditBlocker = cleanupDeliverySubagentAuditBlocker(manifest, pr, { options });
    if (cleanupAuditBlocker && (options.summaryJson || options.dryRun || !apply)) {
      if (options.summaryJson) {
        summaryResults.push(
          cleanupMergedSkipSummary(manifest, "skipped_delivery_audit_missing", cleanupAuditBlocker, {
            pr,
            worktreeStatus,
            deleteRemote,
          }),
        );
        continue;
      }
      console.log(`SKIP ${manifest.task_id}: ${cleanupAuditBlocker}`);
      continue;
    }

    const plan = cleanupMergedPlan(manifest, pr, { cleanupCwd, deleteRemote });
    if (options.summaryJson) {
      summaryResults.push(cleanupMergedReadySummary(manifest, pr, { cleanupCwd, deleteRemote, plan, worktreeStatus }));
      continue;
    }

    if (options.dryRun || !apply) {
      printPlan(`cleanup-merged ${manifest.task_id}`, plan);
      if (!apply) {
        console.log("Add --apply to remove the worktree and local branch.");
      }
      continue;
    }

    withManifestLock(state, manifest.task_id, () => {
      const lockedManifest = readManifest(manifestPath);
      validateManifest(lockedManifest, manifestPath);
      assertLaneOwner(lockedManifest, options);
      claimLaneOwner(lockedManifest, options);
      Object.assign(manifest, lockedManifest);
      const lockedCleanupTarget = assertCleanupWorktreeForMerged(manifest, state);
      try {
        // Capture target state as soon as this worker owns the lock. Every
        // later lock-time hold must leave cleanup_partial with current,
        // target-specific resume evidence rather than a generic error alone.
        const lockedCleanupCwd = cleanupRepositoryRoot(manifest.worktree_path, state, lockedCleanupTarget);
        recordCleanupTargetEvidence(manifest, lockedCleanupCwd, { deleteRemote });
        const lockedRemoteResumeBlocker = cleanupRemoteResumeBlocker(manifest, deleteRemote);
        if (lockedRemoteResumeBlocker) {
          throw new Error(lockedRemoteResumeBlocker);
        }
        const lockedPr = prView(manifest);
        if (!lockedPr?.mergedAt) {
          throw new Error(`Could not refresh merged PR evidence under cleanup lock for ${manifest.task_id}.`);
        }
        if (lockedPr.baseRefName && lockedPr.baseRefName !== manifest.base_branch) {
          throw new Error(`Existing PR base is ${lockedPr.baseRefName}, expected ${manifest.base_branch}.`);
        }
        const lockedWorktreeStatus = worktreeCleanupStatus(manifest, lockedCleanupCwd);
        if (lockedWorktreeStatus.dirty) {
          throw new Error("Worktree is not clean after acquiring cleanup lock.");
        }
        const lockedAuditBlocker = cleanupDeliverySubagentAuditBlocker(manifest, lockedPr, { options });
        if (lockedAuditBlocker) {
          throw new Error(lockedAuditBlocker);
        }
        preflightAssignmentClosureForCleanedManifest(state, manifest, options);
        recordCleanupDeliverySubagentAudit(manifest, lockedPr, options);
        cleanupMergedResources(manifest, state, { cleanupCwd: lockedCleanupCwd, deleteRemote, pr: lockedPr });
        assertCleanupTargetsAbsent(manifest, lockedCleanupCwd, { deleteRemote });
        finalizeMergedCleanupResources(manifest, lockedPr, { deleteRemote });
        appendAuthorityDecision(manifest, manifest.cleanup_authority_decision);
        manifest.lane_evidence_packet = buildLaneEvidencePacket(manifest, manifest.anti_churn_finalization || {}, {
          worktreeStatus: lockedWorktreeStatus.status || null,
          prDeliveryEvidence: manifest.pr_delivery_evidence,
          prGateEvidence: manifest.pr_gate_evidence,
          cleanupAuthorityDecision: manifest.cleanup_authority_decision,
        });
        manifest.status = "closed";
        manifest.pr_url = lockedPr.url || manifest.pr_url;
        manifest.pr_number = lockedPr.number || manifest.pr_number;
        manifest.merged_at = lockedPr.mergedAt;
        manifest.closed_at = new Date().toISOString();
        manifest.updated_at = manifest.closed_at;
        manifest.cleanup_error = null;
        const assignmentClosure = closeAssignmentForCleanedManifest(state, manifest, options);
        if (assignmentClosure?.closed) {
          manifest.source_assignment_closed_at = assignmentClosure.closedAt;
          appendTaskEvent(manifest, "assignment_closed", assignmentClosure.assignmentId);
        }
        appendTaskEvent(manifest, "closed", `cleaned merged PR ${manifest.pr_url || manifest.pr_number}`);
      } catch (error) {
        manifest.status = "cleanup_partial";
        manifest.cleanup_error = error.message;
        manifest.updated_at = new Date().toISOString();
        appendTaskEvent(manifest, "cleanup_partial", error.message);
        writeManifest(manifestPath, manifest);
        throw error;
      }
      writeManifest(manifestPath, manifest);
    });
    console.log(`Closed ${manifest.task_id}`);
  }

  if (options.summaryJson) {
    console.log(
      JSON.stringify(
        buildCleanupMergedSummary({
          state,
          currentOwner,
          mode,
          deleteRemote,
          results: summaryResults,
        }),
        null,
        2,
      ),
    );
  }
}

function buildCleanupMergedSummary({ state, currentOwner, mode, deleteRemote, results }) {
  return {
    generatedAt: new Date().toISOString(),
    stateRoot: state.root,
    currentOwner,
    mode: mode.currentOnly ? "cleanup-current" : "cleanup-merged",
    deleteRemote,
    counts: {
      total: results.length,
      cleanupReady: results.filter((result) => result.status === "ready").length,
      skipped: results.filter((result) => result.status !== "ready").length,
    },
    statusCounts: countByField(results, "status"),
    results: results.slice(0, 10),
    resultsTruncated: results.length > 10,
    mutation: "none; summary only",
  };
}

function cleanupMergedReadySummary(manifest, pr, options) {
  const authorityDecision = shapeCleanupAuthorityDecision(manifest, pr, {
    deleteRemote: Boolean(options.deleteRemote),
    decision: "ready_for_apply",
    allowed: true,
    generatedAt: new Date().toISOString(),
    evidenceRefs: [
      `task:${manifest.task_id}`,
      pr?.number ? `pr:${pr.number}` : "",
      expectedCleanupHeadSha(manifest, pr) ? `expected-head:${expectedCleanupHeadSha(manifest, pr)}` : "",
    ],
  });
  return {
    taskId: manifest.task_id,
    status: "ready",
    reason: "PR is merged and worktree is clean",
    branch: manifest.branch,
    owner: manifest.owner || null,
    worktreePath: manifest.worktree_path,
    worktree: cleanupWorktreeSummary(options.worktreeStatus),
    pr: cleanupPrSummary(manifest, pr),
    cleanupCwd: options.cleanupCwd,
    expectedHeadSha: expectedCleanupHeadSha(manifest, pr) || null,
    localBranchSha: branchSha(manifest.branch, options.cleanupCwd) || null,
    remoteBranchSha: options.deleteRemote ? originBranchSha(manifest.branch, options.cleanupCwd) || null : null,
    plan: options.plan,
    authorityDecision,
  };
}

function cleanupMergedSkipSummary(manifest, status, reason, options = {}) {
  return {
    taskId: manifest.task_id,
    status,
    reason,
    branch: manifest.branch,
    owner: manifest.owner || null,
    worktreePath: manifest.worktree_path,
    worktree: options.worktreeStatus ? cleanupWorktreeSummary(options.worktreeStatus) : null,
    pr: cleanupPrSummary(manifest, options.pr),
    authorityDecision: shapeCleanupAuthorityDecision(manifest, options.pr, {
      deleteRemote: Boolean(options.deleteRemote),
      decision: "blocked",
      allowed: false,
      blockedReasons: [reason],
      evidenceRefs: [`task:${manifest.task_id}`],
    }),
  };
}

function shapeCleanupAuthorityDecision(manifest, pr, options = {}) {
  const deleteRemote = Boolean(options.deleteRemote);
  const requiredGates = [
    "PR is merged",
    "expected base branch",
    "worktree is clean",
    "exact PR head evidence exists",
    "delivery subagent audit recommends cleanup-ready for exact head",
    "local branch head matches expected head before deletion",
    deleteRemote ? "remote branch head matches expected head before deletion" : "",
    "cleanup mutation requires --apply",
  ];
  const stopLines = [
    "no cleanup without merged PR evidence",
    "no branch deletion without exact-head match",
    "no remote branch deletion unless --delete-remote is explicit",
    "no provider/model calls",
  ];
  const decision = options.decision || "ready_for_apply";
  const satisfiedGates = options.allowed
    ? requiredGates.filter((gate) => decision === "applied" || gate !== "cleanup mutation requires --apply")
    : [];
  return shapeAuthorityDecisionEvidence({
    operation: deleteRemote ? "cleanup-merged-delete-remote" : "cleanup-merged",
    authorityFamily: "cleanup",
    decision,
    allowed: Boolean(options.allowed),
    requiredGates,
    satisfiedGates: options.satisfiedGates || satisfiedGates,
    blockedReasons: options.blockedReasons || [],
    stopLines,
    evidenceRefs: options.evidenceRefs || [
      `task:${manifest.task_id}`,
      pr?.number ? `pr:${pr.number}` : "",
      expectedCleanupHeadSha(manifest, pr) ? `expected-head:${expectedCleanupHeadSha(manifest, pr)}` : "",
    ],
    nextSafeAction: options.allowed
      ? "Run cleanup-merged --apply only after reviewing the dry-run packet."
      : "Resolve cleanup blockers before applying cleanup.",
    recoveryPath: "If cleanup fails, keep cleanup_partial evidence in the manifest and rerun cleanup-merged after branch-head evidence is fixed.",
    generatedAt: options.generatedAt,
  });
}

function cleanupPrSummary(manifest, pr) {
  return {
    number: pr?.number || manifest.pr_number || null,
    url: pr?.url || manifest.pr_url || null,
    mergedAt: pr?.mergedAt || manifest.merged_at || null,
    baseRefName: pr?.baseRefName || null,
    headRefOid: pr?.headRefOid || manifest.pr_delivery_head_sha || null,
  };
}

function cleanupWorktreeSummary(worktreeStatus) {
  if (!worktreeStatus) {
    return null;
  }
  return {
    exists: Boolean(worktreeStatus.exists),
    listed: Boolean(worktreeStatus.listed),
    dirty: Boolean(worktreeStatus.dirty),
  };
}

function preflightAssignmentClosureForCleanedManifest(state, manifest, options = {}) {
  const assignmentId = String(manifest.source_assignment_id || "").trim();
  if (!assignmentId) {
    return null;
  }
  assertSafeTaskId(assignmentId);
  const path = assignmentPath(state, assignmentId);
  if (!existsSync(path)) {
    return null;
  }
  const assignment = readAssignment(path);
  validateAssignment(assignment, path);
  if (options.requireNoPrEvidence && supersededAssignmentHasPrEvidence(assignment)) {
    throw new Error(`Assignment ${assignmentId} has PR or delivery evidence; superseded cleanup requires a no-PR source lane.`);
  }
  if (options.requireExactAssignmentIdentity) {
    if (assignment.task_id !== manifest.task_id) {
      throw new Error(`Assignment ${assignmentId} task ${assignment.task_id || "missing"} does not exactly match source task ${manifest.task_id}.`);
    }
    const backlogItemId = String(assignment.source_backlog_item?.item_id || "").trim();
    if (backlogItemId && backlogItemId !== manifest.task_id) {
      throw new Error(`Assignment ${assignmentId} backlog item ${backlogItemId} does not exactly match source task ${manifest.task_id}.`);
    }
  }
  if (options.requireKnownAssignmentOwner && !String(assignment.owner || "").trim()) {
    throw new Error(`Assignment ${assignmentId} owner is required for superseded cleanup.`);
  }
  if (assignment.status === "closed") {
    return { closeable: false, assignmentId };
  }
  const assignmentBranch = assignment.branch || assignment.source_backlog_item?.branch_name || "";
  if (assignmentBranch !== manifest.branch) {
    throw new Error(`Assignment ${assignmentId} branch ${assignmentBranch || "missing"} does not match cleaned branch ${manifest.branch}.`);
  }
  if (assignment.owner && manifest.owner && assignment.owner !== manifest.owner) {
    if (!options.takeOwnership || !validTakeoverReason(options.takeoverReason)) {
      throw new Error(`Assignment ${assignmentId} is owned by ${assignment.owner}, expected ${manifest.owner}.`);
    }
  }
  return { closeable: true, assignmentId };
}

function closeAssignmentForCleanedManifest(state, manifest, options = {}) {
  const assignmentId = String(manifest.source_assignment_id || "").trim();
  if (!assignmentId) {
    return null;
  }
  assertSafeTaskId(assignmentId);
  const path = assignmentPath(state, assignmentId);
  if (!existsSync(path)) {
    return null;
  }

  const close = () => {
    const assignment = readAssignment(path);
    validateAssignment(assignment, path);
    if (assignment.status === "closed") {
      return { closed: false, assignmentId };
    }
    const assignmentBranch = assignment.branch || assignment.source_backlog_item?.branch_name || "";
    if (assignmentBranch !== manifest.branch) {
      throw new Error(`Assignment ${assignmentId} branch ${assignmentBranch || "missing"} does not match cleaned branch ${manifest.branch}.`);
    }
    if (assignment.owner && manifest.owner && assignment.owner !== manifest.owner) {
      if (!options.takeOwnership || !validTakeoverReason(options.takeoverReason)) {
        throw new Error(`Assignment ${assignmentId} is owned by ${assignment.owner}, expected ${manifest.owner}.`);
      }
      const previousOwner = assignment.owner;
      assignment.owner = manifest.owner;
      assignment.owner_updated_at = new Date().toISOString();
      assignment.events = [
        ...(Array.isArray(assignment.events) ? assignment.events : []),
        taskEvent("cleanup_takeover_applied", `owner ${previousOwner} -> ${manifest.owner}: ${String(options.takeoverReason || "").trim()}`),
      ];
    }

    const closedAt = new Date().toISOString();
    assignment.status = "closed";
    assignment.phase = "closed";
    assignment.updated_at = closedAt;
    assignment.closed_at = closedAt;
    assignment.current_command = null;
    assignment.last_result = options.lastResult || `closed after cleanup of ${manifest.task_id}`;
    assignment.events = [
      ...(Array.isArray(assignment.events) ? assignment.events : []),
      taskEvent("closed", options.eventMessage || `cleaned merged workspace ${manifest.task_id}`),
    ];
    writeAssignment(path, assignment);
    return { closed: true, assignmentId, closedAt };
  };
  return options.assignmentLockHeld ? close() : withAssignmentLock(state, assignmentId, close);
}

function assignmentCloseoutPlan(record, manifests, currentOwner, options = {}) {
  const assignment = record.assignment;
  validateAssignment(assignment, record.path);
  const assignmentId = assignment.assignment_id;
  const manifestRecord = closedManifestForAssignment(assignment, manifests);
  const delegatedCleanup = delegatedCleanupEvidence(assignment, currentOwner, options);
  const base = {
    assignmentId,
    assignmentPath: record.path,
    taskId: assignment.task_id || null,
    manifest: manifestRecord?.manifest || null,
    manifestPath: manifestRecord?.path || null,
    alreadyClosed: assignment.status === "closed",
    closeable: false,
    closeoutMode: "blocked",
    staleRecordCleanupEligible: false,
    staleRecordCleanupEvidence: null,
    delegatedCleanup,
    delegatedCleanupOwner: delegatedCleanup?.owner || null,
    delegationEvidence: delegatedCleanup?.evidence || null,
    reason: "",
  };

  if (assignment.status === "closed") {
    return { ...base, reason: "assignment already closed" };
  }
  if (!manifestRecord) {
    return { ...base, reason: "no matching closed workspace manifest" };
  }
  const manifest = manifestRecord.manifest;
  const assignmentBranch = assignment.branch || assignment.source_backlog_item?.branch_name || "";
  if (assignmentBranch !== manifest.branch) {
    return {
      ...base,
      reason: `assignment branch ${assignmentBranch || "missing"} does not match closed workspace branch ${manifest.branch}`,
    };
  }
  if (assignment.owner && assignment.owner !== currentOwner) {
    const staleRecordCleanupEvidence = staleRecordCleanupCloseoutEvidence(assignment, manifest);
    if (staleRecordCleanupEvidence.eligible) {
      const staleBase = {
        ...base,
        closeoutMode: "stale_record_cleanup",
        staleRecordCleanupEligible: true,
        staleRecordCleanupEvidence,
      };
      if (!options.allowStaleRecordCleanup) {
        return {
          ...staleBase,
          reason: `assignment owner ${assignment.owner} does not match ${currentOwner}; pass --allow-stale-record-cleanup with explicit approval after inspecting abandonment evidence`,
        };
      }
      if (!validTakeoverReason(options.approval)) {
        return {
          ...staleBase,
          reason: "stale record cleanup requires --approval evidence in at least 10 non-whitespace characters",
        };
      }
      if (managerStaleCleanupDelegationRequired(assignment.owner, currentOwner) && !delegatedCleanup?.valid) {
        return {
          ...staleBase,
          reason: delegatedCleanup?.reason || `manager-owned worker ${currentOwner} requires delegated cleanup owner evidence for assignment owner ${assignment.owner}`,
        };
      }
      if (options.delegatedCleanupOwner && !delegatedCleanup.valid) {
        return {
          ...staleBase,
          reason: delegatedCleanup.reason,
        };
      }
      return {
        ...staleBase,
        closeable: true,
        reason: delegatedCleanup?.valid
          ? `approved stale record cleanup delegated from ${delegatedCleanup.owner} to ${currentOwner}; worktree, branch, and PR evidence absent`
          : `approved stale record cleanup; assignment owner ${assignment.owner} does not match ${currentOwner}; worktree, branch, and PR evidence absent`,
      };
    }

    const staleMergedPrCleanupEvidence = staleMergedPrRecordCleanupEvidence(assignment, manifest);
    if (staleMergedPrCleanupEvidence.eligible) {
      const staleBase = {
        ...base,
        closeoutMode: "stale_merged_pr_record_cleanup",
        staleRecordCleanupEligible: true,
        staleRecordCleanupEvidence: staleMergedPrCleanupEvidence,
      };
      if (!options.allowStaleRecordCleanup) {
        return {
          ...staleBase,
          reason: `assignment owner ${assignment.owner} does not match ${currentOwner}; pass --allow-stale-record-cleanup with explicit approval after inspecting merged PR closeout evidence`,
        };
      }
      if (!validTakeoverReason(options.approval)) {
        return {
          ...staleBase,
          reason: "stale merged PR record cleanup requires --approval evidence in at least 10 non-whitespace characters",
        };
      }
      if (managerStaleCleanupDelegationRequired(assignment.owner, currentOwner) && !delegatedCleanup?.valid) {
        return {
          ...staleBase,
          reason: delegatedCleanup?.reason || `manager-owned worker ${currentOwner} requires delegated cleanup owner evidence for assignment owner ${assignment.owner}`,
        };
      }
      if (options.delegatedCleanupOwner && !delegatedCleanup.valid) {
        return {
          ...staleBase,
          reason: delegatedCleanup.reason,
        };
      }
      return {
        ...staleBase,
        closeable: true,
        reason: delegatedCleanup?.valid
          ? `approved stale merged PR record cleanup delegated from ${delegatedCleanup.owner} to ${currentOwner}; merged PR evidence retained and worktree/branches absent`
          : `approved stale merged PR record cleanup; assignment owner ${assignment.owner} does not match ${currentOwner}; merged PR evidence retained and worktree/branches absent`,
      };
    }
    return { ...base, reason: `assignment owner ${assignment.owner} does not match ${currentOwner}` };
  }

  return {
    ...base,
    closeable: true,
    closeoutMode: "closed_workspace",
    reason: `closed workspace evidence ${manifest.task_id}`,
  };
}

function delegatedCleanupEvidence(assignment, currentOwner, options = {}) {
  const owner = String(options.delegatedCleanupOwner || "").trim();
  if (!owner) return null;
  const evidence = String(options.delegationEvidence || "").trim();
  if (!options.allowStaleRecordCleanup) {
    return { owner, evidence, valid: false, reason: "--delegated-cleanup-owner is only supported with --allow-stale-record-cleanup" };
  }
  if (!validTakeoverReason(options.approval)) {
    return { owner, evidence, valid: false, reason: "delegated stale cleanup requires explicit --approval evidence" };
  }
  if (!validTakeoverReason(evidence)) {
    return { owner, evidence, valid: false, reason: "--delegation-evidence must cite stable owner delegation in at least 10 non-whitespace characters" };
  }
  if (!assignment.owner) {
    return { owner, evidence, valid: false, reason: "delegated stale cleanup requires assignment owner evidence" };
  }
  if (assignment.owner !== owner) {
    return { owner, evidence, valid: false, reason: `delegated cleanup owner ${owner} does not match assignment owner ${assignment.owner}` };
  }
  if (owner === currentOwner) {
    return { owner, evidence, valid: false, reason: "delegated cleanup owner matches current owner; use normal closeout or stale cleanup without delegation" };
  }
  return { owner, evidence, valid: true, reason: "delegated stable owner evidence matches assignment owner" };
}

function managerStaleCleanupDelegationRequired(assignmentOwner, currentOwner) {
  return Boolean(assignmentOwner && currentOwner && assignmentOwner !== currentOwner && isManagerOwner(assignmentOwner) && isManagerOwner(currentOwner));
}

function staleRecordCleanupCloseoutEvidence(assignment, manifest) {
  const branch = assignment.branch || assignment.source_backlog_item?.branch_name || manifest.branch || "";
  const worktreePaths = [
    manifest.worktree_path || "",
    assignment.worktree_path || "",
  ].filter(Boolean);
  const uniqueWorktreePaths = [...new Set(worktreePaths.map((path) => resolve(path)))];
  const existingWorktreePaths = uniqueWorktreePaths.filter((path) => existsSync(path));
  const worktreeMissing = uniqueWorktreePaths.length > 0 && existingWorktreePaths.length === 0;
  const localBranchSha = branch ? branchSha(branch) || null : null;
  const remoteBranch = branch ? staleRecordRemoteBranchEvidence(branch) : { status: "missing", sha: null };
  const githubPr = branch ? staleRecordGithubPrEvidence(branch) : { status: "missing", refs: [] };
  const prEvidence = Boolean(
    assignment.pr_url ||
      assignment.pr_number ||
      manifest.pr_url ||
      manifest.pr_number ||
      manifest.pr_state ||
      manifest.pr_delivery_head_sha ||
      githubPr.status === "present",
  );
  const eligible = Boolean(
    manifest.status === "closed" &&
      branch &&
      worktreeMissing &&
      !localBranchSha &&
      remoteBranch.status === "absent" &&
      !prEvidence &&
      githubPr.status === "none",
  );
  return {
    eligible,
    branch: branch || null,
    worktreePath: uniqueWorktreePaths[0] || null,
    worktreePaths: uniqueWorktreePaths,
    existingWorktreePaths,
    worktreeStatus: worktreeMissing ? "missing" : uniqueWorktreePaths.length > 0 ? "present" : "missing_path",
    localBranchSha,
    remoteBranchSha: remoteBranch.sha,
    remoteBranchStatus: remoteBranch.status,
    remoteBranchError: remoteBranch.error || null,
    prStatus: prEvidence ? "present" : githubPr.status,
    githubPrRefs: githubPr.refs || [],
    githubPrError: githubPr.error || null,
  };
}

function staleMergedPrRecordCleanupEvidence(assignment, manifest) {
  const branch = assignment.branch || assignment.source_backlog_item?.branch_name || manifest.branch || "";
  const worktreePaths = [
    manifest.worktree_path || "",
    assignment.worktree_path || "",
  ].filter(Boolean);
  const uniqueWorktreePaths = [...new Set(worktreePaths.map((path) => resolve(path)))];
  const existingWorktreePaths = uniqueWorktreePaths.filter((path) => existsSync(path));
  const worktreeMissing = uniqueWorktreePaths.length > 0 && existingWorktreePaths.length === 0;
  const localBranchSha = branch ? branchSha(branch) || null : null;
  const remoteBranch = branch ? staleRecordRemoteBranchEvidence(branch) : { status: "missing", sha: null };
  const githubPr = branch ? staleRecordGithubPrEvidence(branch) : { status: "missing", refs: [] };
  const mergedAt = assignment.merged_at || manifest.merged_at || assignment.cleanup_merged_at || manifest.cleanup_merged_at || null;
  const prNumber = assignment.pr_number || manifest.pr_number || assignment.cleanup_pr_number || manifest.cleanup_pr_number || null;
  const prUrl = assignment.pr_url || manifest.pr_url || assignment.cleanup_pr_url || manifest.cleanup_pr_url || null;
  const openGithubPrRefs = (githubPr.refs || []).filter((pr) => String(pr.state || "").toUpperCase() === "OPEN");
  const eligible = Boolean(
    manifest.status === "closed" &&
      branch &&
      worktreeMissing &&
      !localBranchSha &&
      remoteBranch.status === "absent" &&
      mergedAt &&
      (prNumber || prUrl) &&
      openGithubPrRefs.length === 0,
  );
  return {
    eligible,
    branch: branch || null,
    worktreePath: uniqueWorktreePaths[0] || null,
    worktreePaths: uniqueWorktreePaths,
    existingWorktreePaths,
    worktreeStatus: worktreeMissing ? "missing" : uniqueWorktreePaths.length > 0 ? "present" : "missing_path",
    localBranchSha,
    remoteBranchSha: remoteBranch.sha,
    remoteBranchStatus: remoteBranch.status,
    remoteBranchError: remoteBranch.error || null,
    prStatus: "merged",
    prNumber,
    prUrl,
    mergedAt,
    githubPrRefs: githubPr.refs || [],
    githubPrError: githubPr.error || null,
    openGithubPrRefs,
  };
}

function staleRecordRemoteBranchEvidence(branch) {
  if (
    process.env.CODEX_WORKSPACE_TEST_MODE === "1" &&
    process.env.CODEX_WORKSPACE_TEST_STALE_REMOTE_BRANCHES !== undefined
  ) {
    const fixtureBranches = String(process.env.CODEX_WORKSPACE_TEST_STALE_REMOTE_BRANCHES || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    return fixtureBranches.includes(branch)
      ? { status: "present", sha: "test-remote-branch-sha" }
      : { status: "absent", sha: null };
  }

  try {
    const sha = originBranchSha(branch) || null;
    return sha ? { status: "present", sha } : { status: "absent", sha: null };
  } catch (error) {
    return { status: "unverified", sha: null, error: error.message };
  }
}

function staleRecordGithubPrEvidence(branch) {
  const result = run("gh", ["pr", "list", "--head", branch, "--state", "all", "--json", "number,url,state,headRefName"], {
    cwd: repoRoot,
  });
  if (result.code !== 0) {
    return { status: "unverified", refs: [], error: result.stderr || result.stdout || "GitHub PR lookup failed" };
  }
  const prs = parseGhJson(result.stdout || "[]", `PR list for ${branch}`);
  if (!Array.isArray(prs)) {
    return { status: "unverified", refs: [], error: "GitHub PR lookup returned a non-array payload" };
  }
  const refs = prs
    .map((pr) => ({
      number: pr.number || null,
      url: pr.url || null,
      state: pr.state || null,
      headRefName: pr.headRefName || null,
    }))
    .filter((pr) => pr.number || pr.url || pr.state || pr.headRefName)
    .slice(0, 5);
  return refs.length > 0 ? { status: "present", refs } : { status: "none", refs: [] };
}

function closedManifestForAssignment(assignment, manifests) {
  const exactTaskMatch = assignment.task_id
    ? manifests.find(({ manifest }) => manifest.status === "closed" && manifest.task_id === assignment.task_id)
    : null;
  if (exactTaskMatch) {
    return exactTaskMatch;
  }
  return manifests.find(({ manifest }) => {
    if (manifest.status !== "closed") {
      return false;
    }
    return (
      manifest.source_assignment_id === assignment.assignment_id ||
      (assignment.task_id && manifest.task_id === assignment.task_id)
    );
  }) || null;
}

function renderAssignmentCloseoutPlan(plan) {
  const state = plan.closeable ? "close" : plan.alreadyClosed ? "skip" : "blocked";
  const target = plan.manifest?.task_id || plan.taskId || "none";
  return `${state} ${plan.assignmentId} | workspace=${target} | reason=${plan.reason}`;
}

function applyAssignmentCloseout(state, assignmentId, currentOwner, options = {}) {
  assertSafeTaskId(assignmentId);
  const targetAssignmentPath = assignmentPath(state, assignmentId);

  return withAssignmentLock(state, assignmentId, () => {
    const assignment = readAssignment(targetAssignmentPath);
    validateAssignment(assignment, targetAssignmentPath);
    const manifests = readManifests(state);
    const plan = assignmentCloseoutPlan({ path: targetAssignmentPath, assignment }, manifests, currentOwner, options);
    if (plan.alreadyClosed) {
      return { closed: false, assignmentId };
    }
    if (!plan.closeable) {
      throw new Error(`Assignment ${assignmentId} is not closeable: ${plan.reason}`);
    }

    const closedAt = new Date().toISOString();
    assignment.status = "closed";
    assignment.phase = "closed";
    assignment.updated_at = closedAt;
    assignment.closed_at = closedAt;
    assignment.current_command = null;
    assignment.last_result =
      plan.closeoutMode === "stale_record_cleanup"
        ? `operator-approved stale record cleanup from closed workspace ${plan.manifest.task_id}`
        : plan.closeoutMode === "stale_merged_pr_record_cleanup"
          ? `operator-approved stale merged PR record cleanup from closed workspace ${plan.manifest.task_id}`
          : `closed from completed workspace ${plan.manifest.task_id}`;
    assignment.closeout_mode = plan.closeoutMode;
    assignment.closeout_handoff_evidence = closeAssignmentsEvidenceSummary({
      currentOwner,
      counts: { total: 1, closeable: 1, alreadyClosed: 0, blocked: 0 },
      results: [shapeAssignmentCloseoutPlan(plan)],
      mode: "apply",
      closedAt,
    });
    if (["stale_record_cleanup", "stale_merged_pr_record_cleanup"].includes(plan.closeoutMode)) {
      assignment.closeout_approval_evidence = String(options.approval || "").trim();
      assignment.closeout_abandonment_evidence = plan.staleRecordCleanupEvidence;
      if (plan.delegatedCleanup?.valid) {
        assignment.closeout_delegated_owner = plan.delegatedCleanup.owner;
        assignment.closeout_delegation_evidence = plan.delegatedCleanup.evidence;
      }
    }
    assignment.events = [
      ...(Array.isArray(assignment.events) ? assignment.events : []),
      taskEvent("closed", assignment.last_result),
    ];
    writeAssignment(targetAssignmentPath, assignment);

    withManifestLock(state, plan.manifest.task_id, () => {
      const manifest = readManifest(plan.manifestPath);
      validateManifest(manifest, plan.manifestPath);
      if (manifest.status !== "closed") {
        throw new Error(`Workspace ${manifest.task_id} is no longer closed.`);
      }
      manifest.source_assignment_closed_at = closedAt;
      manifest.updated_at = closedAt;
      appendTaskEvent(manifest, "assignment_closed", assignmentId);
      writeManifest(plan.manifestPath, manifest);
    });

    return { closed: true, assignmentId, closedAt };
  });
}

function cleanupCurrent(argv) {
  cleanupMerged(argv, { currentOnly: true });
}

function cleanupIntegrated(argv) {
  const { positional, options } = parseOptions(argv);
  if (options.summaryJson && options.apply) {
    throw new Error("cleanup-integrated --summary-json is only supported without --apply.");
  }

  const state = workspaceState(options);
  const query = positional.join(" ").trim();
  const apply = Boolean(options.apply);
  const baseRef = String(options.base || cleanupIntegratedDefaultBaseRef);
  const exactTreeCloseout = exactTreeCloseoutInput({ positional, options, baseRef });
  const closedPrIntegrated = closedPrIntegratedInput({ positional, options, baseRef, exactTreeCloseout });
  if (!refExists(baseRef)) {
    throw new Error(`Base ref not found locally: ${baseRef}`);
  }

  const records = query ? [exactTreeCloseout ? findCleanupManifestByExactTaskId(state, query) : findCleanupManifest(state, query)] : readCleanupManifests(state);
  const currentOwner = currentLaneOwner(options);
  const results = records.map((record) => cleanupIntegratedPlan(record, state, { baseRef, currentOwner, options, exactTreeCloseout, closedPrIntegrated }));

  if (options.summaryJson) {
    console.log(JSON.stringify(buildCleanupIntegratedSummary({ state, currentOwner, baseRef, query, results }), null, 2));
    return;
  }

  const ready = results.filter((result) => result.status === "ready");
  const skipped = results.filter((result) => result.status !== "ready");
  for (const skip of skipped) {
    console.log(`SKIP ${skip.taskId}: ${skip.reason}`);
  }

  if (ready.length === 0) {
    console.log(query ? `No integrated workspace cleanup matched: ${query}` : "No integrated workspace cleanup found.");
    return;
  }

  const plan = ready.flatMap((result) => cleanupIntegratedPlanLines(result));
  if (options.dryRun || !apply) {
    printPlan("cleanup-integrated", plan);
    if (!apply) {
      console.log("Add --apply to remove the clean integrated worktree(s), delete local branch(es), and close manifest(s).");
    }
    return;
  }

  for (const result of ready) {
    applyCleanupIntegrated(state, result, options);
    console.log(`Closed ${result.taskId}`);
  }
}

function exactTreeCloseoutInput({ positional, options, baseRef }) {
  if (!options.exactTreeCloseout) return null;
  if (positional.length !== 1) throw new Error("cleanup-integrated --exact-tree-closeout requires exactly one explicit task id.");
  if (positional[0] !== strictExactTreeCloseoutTaskId) throw new Error(`cleanup-integrated --exact-tree-closeout is restricted to ${strictExactTreeCloseoutTaskId}.`);
  if (baseRef !== "origin/dev") throw new Error("cleanup-integrated --exact-tree-closeout requires --base origin/dev.");
  if (options.deleteRemote) throw new Error("cleanup-integrated --exact-tree-closeout forbids remote deletion.");
  const provenance = String(options.supersessionProvenance || "").trim();
  const closeoutReason = String(options.closeoutReason || "").trim();
  if (!validSupersessionApplyEvidence(provenance)) throw new Error("cleanup-integrated --exact-tree-closeout requires --supersession-provenance with at least 10 non-whitespace characters.");
  if (!validSupersessionApplyEvidence(closeoutReason)) throw new Error("cleanup-integrated --exact-tree-closeout requires --closeout-reason with at least 10 non-whitespace characters.");
  return { provenance, closeoutReason };
}

function closedPrIntegratedInput({ positional, options, baseRef, exactTreeCloseout }) {
  if (!options.allowClosedPrIntegrated) return null;
  if (exactTreeCloseout) throw new Error("cleanup-integrated --allow-closed-pr-integrated cannot be combined with --exact-tree-closeout.");
  if (positional.length !== 1) throw new Error("cleanup-integrated --allow-closed-pr-integrated requires exactly one explicit task id.");
  if (!String(baseRef || "").startsWith("origin/")) throw new Error("cleanup-integrated --allow-closed-pr-integrated requires an origin/* base ref.");
  const approval = String(options.approval || "").trim();
  if (!validSupersessionApplyEvidence(approval)) throw new Error("cleanup-integrated --allow-closed-pr-integrated requires --approval with at least 10 non-whitespace characters.");
  if (options.deleteRemote) throw new Error("cleanup-integrated --allow-closed-pr-integrated forbids remote deletion.");
  return { approval };
}

function cleanupIntegratedPlan(record, state, context) {
  const { manifest } = record;
  const strict = context.exactTreeCloseout;
  const closedPrIntegrated = context.closedPrIntegrated;
  const strictResume = strict && strictPartialCloseoutMatches(manifest, strict, context.baseRef);
  const closedPrResume = closedPrIntegrated && closedPrIntegratedPartialResume(manifest, closedPrIntegrated, context.baseRef);
  const partialResume = Boolean(strictResume || closedPrResume);
  const base = {
    taskId: manifest.task_id,
    status: "skipped",
    reason: "",
    branch: manifest.branch,
    owner: manifest.owner || null,
    worktreePath: manifest.worktree_path,
    baseRef: context.baseRef,
    baseSha: branchSha(context.baseRef) || null,
    expectedHeadSha: null,
    localBranchSha: null,
    remoteBranchSha: null,
    cleanupCwd: null,
    worktree: null,
    manifestPath: record.path,
    exactTreeCloseout: Boolean(strict),
    closedPrIntegrated: Boolean(closedPrIntegrated),
    proof: strict ? { tree: { status: "unverified", source: null, base: null }, originDev: { status: "unverified" }, remoteBranch: { status: "unverified", state: null }, githubNoPr: { status: "unverified" }, assignmentCloseout: { status: "unverified" }, evidence: { status: "unverified" } } : null,
  };

  if (manifest.status === "closed") {
    return { ...base, reason: "workspace manifest is already closed" };
  }
  if (manifest.mode === "epic-batch") {
    return { ...base, reason: "epic-batch workspace requires finish-epic closeout; integrated cleanup is disabled" };
  }
  if (strict ? supersededSourceHasPrEvidence(manifest) || (hasStrictCloseoutEvidence(manifest) && !strictResume) : !closedPrIntegrated && (manifest.pr_url || manifest.pr_number || ["pr_open", "merged", "cleanup_partial"].includes(String(manifest.status || "")))) {
    return { ...base, reason: strict ? "source workspace has PR or cleanup evidence" : "workspace has PR/merged cleanup evidence; use cleanup-merged" };
  }
  const ownerWarning = laneOwnerWarning(manifest, context.options);
  if (ownerWarning && !context.options.takeOwnership) {
    return {
      ...base,
      reason: `workspace is owned by ${manifest.owner}; pass --take-ownership with --takeover-reason after confirming it is idle`,
    };
  }
  if (ownerWarning && context.options.takeOwnership && !validTakeoverReason(context.options.takeoverReason)) {
    return { ...base, reason: "--takeover-reason must explain the takeover in at least 10 non-whitespace characters" };
  }

  assertSafeBranch(manifest.branch);
  const cleanupTarget = assertCleanupWorktreeForIntegrated(manifest, state, { strict, strictResume: partialResume, closedPrIntegrated, baseRef: context.baseRef });
  const cleanupCwd = cleanupRepositoryRoot(manifest.worktree_path, state, cleanupTarget);
  const worktreeStatus = worktreeCleanupStatus(manifest, cleanupCwd);
  const strictRegistration = strict ? strictWorktreeRegistration(manifest, cleanupCwd) : null;
  if (strict && strictRegistration.status !== "matched") {
    return { ...base, cleanupCwd, worktree: cleanupWorktreeSummary(worktreeStatus), reason: strictRegistration.reason };
  }
  if (strict && !strictResume && (!worktreeStatus.exists || !strictRegistration.listed)) {
    return { ...base, cleanupCwd, worktree: cleanupWorktreeSummary(worktreeStatus), reason: "strict exact-tree closeout requires a present registered worktree" };
  }
  if (!partialResume && !worktreeStatus.exists && !worktreeStatus.listed) {
    return { ...base, cleanupCwd, worktree: cleanupWorktreeSummary(worktreeStatus), reason: "worktree is already absent; inspect manifest before no-PR cleanup" };
  }
  if (worktreeStatus.dirty) {
    return { ...base, cleanupCwd, worktree: cleanupWorktreeSummary(worktreeStatus), reason: "worktree is not clean" };
  }

  const localBranchSha = branchSha(manifest.branch, cleanupCwd);
  if (!localBranchSha && !partialResume) {
    return { ...base, cleanupCwd, worktree: cleanupWorktreeSummary(worktreeStatus), reason: "local branch is absent; inspect manifest before no-PR cleanup" };
  }
  const expectedHeadSha = localBranchSha || manifest.cleanup_expected_head_sha || null;
  if (strict) {
    if (worktreeStatus.exists && !strictWorktreeOnManifestBranch(manifest, cleanupCwd)) {
      return { ...base, cleanupCwd, worktree: cleanupWorktreeSummary(worktreeStatus), localBranchSha, expectedHeadSha: localBranchSha, reason: "registered worktree is not checked out on the manifest branch" };
    }
    const sourceTree = gitTreeSha(manifest.branch, cleanupCwd);
    const baseTree = gitTreeSha(context.baseRef, cleanupCwd);
    const recordedTree = manifest.supersession_closeout_evidence?.sourceTree || null;
    const strictTree = sourceTree || recordedTree;
    base.proof.tree = { status: strictTree && baseTree && strictTree === baseTree ? "matched" : "mismatch", source: strictTree, base: baseTree };
    if (base.proof.tree.status !== "matched") return { ...base, cleanupCwd, worktree: cleanupWorktreeSummary(worktreeStatus), localBranchSha, expectedHeadSha: localBranchSha, reason: `branch tree does not exactly equal ${context.baseRef}` };
    let remoteBranchSha;
    try {
      remoteBranchSha = originBranchSha(manifest.branch, cleanupCwd) || null;
    } catch (error) {
      return { ...base, cleanupCwd, worktree: cleanupWorktreeSummary(worktreeStatus), localBranchSha, expectedHeadSha: localBranchSha, reason: `source remote branch evidence is unavailable: ${error.message}` };
    }
    base.proof.remoteBranch = { status: remoteBranchSha ? "mismatch" : "matched", state: remoteBranchSha ? "present" : "absent", sha: remoteBranchSha };
    if (remoteBranchSha) return { ...base, cleanupCwd, worktree: cleanupWorktreeSummary(worktreeStatus), localBranchSha, expectedHeadSha: localBranchSha, reason: "source remote branch is present" };
    base.proof.originDev = strictLiveOriginDevProof(cleanupCwd);
    if (base.proof.originDev.status !== "matched") {
      return { ...base, cleanupCwd, worktree: cleanupWorktreeSummary(worktreeStatus), localBranchSha, expectedHeadSha: localBranchSha, reason: base.proof.originDev.reason };
    }
    base.proof.githubNoPr = strictGithubNoPrProof(manifest, cleanupCwd);
    if (base.proof.githubNoPr.status !== "matched") {
      return { ...base, cleanupCwd, worktree: cleanupWorktreeSummary(worktreeStatus), localBranchSha, expectedHeadSha: localBranchSha, reason: base.proof.githubNoPr.reason };
    }
    base.proof.assignmentCloseout = strictAssignmentCloseoutPlan(state, manifest, context.options);
    if (base.proof.assignmentCloseout.status === "blocked") {
      return { ...base, cleanupCwd, worktree: cleanupWorktreeSummary(worktreeStatus), localBranchSha, expectedHeadSha: localBranchSha, reason: base.proof.assignmentCloseout.reason };
    }
    base.proof.worktree = { registered: strictRegistration.listed, clean: !worktreeStatus.dirty, branch: worktreeStatus.exists ? manifest.branch : "absent-after-partial" };
    base.proof.noPrCleanupEvidence = { status: "matched" };
    base.proof.evidence = { status: "matched", supersessionProvenance: strict.provenance, closeoutReason: strict.closeoutReason };
    return { ...base, status: "ready", reason: `clean no-PR workspace has an exact ${context.baseRef} tree and explicit closeout evidence`, cleanupCwd, worktree: cleanupWorktreeSummary(worktreeStatus), localBranchSha, expectedHeadSha: localBranchSha || manifest.cleanup_expected_head_sha || null, remoteBranchSha: null, strictResume };
  }
  // A closed-PR partial cleanup may legitimately have removed both branch refs
  // before its durable completion write. Its journal pins the commit that was
  // previously proven safe to close; use that immutable object for the resume
  // proof rather than guessing that a retained origin ref still exists.
  const journaledSourceHead = closedPrIntegrated && partialResume
    ? exactGitObjectIdOrNull(expectedHeadSha)
    : null;
  const sourceRef = localBranchSha
    ? manifest.branch
    : journaledSourceHead || `origin/${manifest.branch}`;
  if (journaledSourceHead && git(["cat-file", "-e", `${journaledSourceHead}^{commit}`], { cwd: cleanupCwd }).code !== 0) {
    return {
      ...base,
      cleanupCwd,
      worktree: cleanupWorktreeSummary(worktreeStatus),
      localBranchSha,
      expectedHeadSha,
      reason: "closed-PR partial cleanup requires the journaled source commit object to remain locally available",
    };
  }
  const integrated = git(["merge-base", "--is-ancestor", sourceRef, context.baseRef], { cwd: cleanupCwd });
  const baseSha = closedPrIntegrated ? branchSha(context.baseRef, cleanupCwd) || null : null;
  const sourceTree = closedPrIntegrated ? (gitTreeSha(sourceRef, cleanupCwd) || manifest.closed_pr_integrated_cleanup?.integration?.sourceTree || null) : null;
  const baseTree = closedPrIntegrated && baseSha ? gitTreeSha(baseSha, cleanupCwd) : null;
  const exactTreeIntegrated = Boolean(closedPrIntegrated && sourceTree && baseTree && sourceTree === baseTree);
  if (integrated.code !== 0 && !exactTreeIntegrated) {
    return {
      ...base,
      cleanupCwd,
      worktree: cleanupWorktreeSummary(worktreeStatus),
      localBranchSha,
      expectedHeadSha: localBranchSha,
        reason: closedPrIntegrated ? `branch is not an ancestor of ${context.baseRef} and does not have an exact base tree match` : `branch is not an ancestor of ${context.baseRef}`,
    };
  }

  let closedPrProof = null;
  let liveBaseProof = null;
  if (closedPrIntegrated) {
    closedPrProof = closedPrIntegratedProof(manifest, cleanupCwd);
    if (closedPrProof.status !== "matched") {
      return {
        ...base,
        cleanupCwd,
        worktree: cleanupWorktreeSummary(worktreeStatus),
        localBranchSha,
        expectedHeadSha,
        reason: closedPrProof.reason,
        proof: { closedPr: closedPrProof },
      };
    }
    if (exactTreeIntegrated && integrated.code !== 0) {
      liveBaseProof = closedPrIntegratedLiveBaseProof(context.baseRef, baseSha, baseTree, cleanupCwd);
      if (liveBaseProof.status !== "matched") {
        return {
          ...base,
          cleanupCwd,
          worktree: cleanupWorktreeSummary(worktreeStatus),
          localBranchSha,
          expectedHeadSha,
          reason: liveBaseProof.reason,
          proof: {
            closedPr: closedPrProof,
            integration: { mode: "exact-tree", sourceTree, baseSha, baseTree, liveBase: liveBaseProof },
          },
        };
      }
    }
  }

  return {
    ...base,
    status: "ready",
    reason: closedPrIntegrated ? `clean non-open PR workspace already integrated into ${context.baseRef} by ${exactTreeIntegrated && integrated.code !== 0 ? "exact tree" : "ancestry"}` : `clean no-PR workspace already integrated into ${context.baseRef}`,
    cleanupCwd,
    worktree: cleanupWorktreeSummary(worktreeStatus),
    localBranchSha,
    expectedHeadSha,
    remoteBranchSha: branchSha(`origin/${manifest.branch}`, cleanupCwd) || null,
    proof: closedPrIntegrated ? { closedPr: closedPrProof, integration: { mode: exactTreeIntegrated && integrated.code !== 0 ? "exact-tree" : "ancestry", sourceTree, baseSha, baseTree, liveBase: liveBaseProof }, approval: closedPrIntegrated.approval, metadataOnly: true } : null,
  };
}

function closedPrIntegratedLiveBaseProof(baseRef, expectedLocalSha, expectedTree, cleanupCwd) {
  const baseBranch = String(baseRef || "").startsWith("origin/") ? String(baseRef).slice("origin/".length) : "";
  try {
    assertSafeBaseBranch(baseBranch);
  } catch {
    return {
      status: "unavailable",
      localSha: null,
      liveSha: null,
      reason: "exact-tree closed-PR cleanup requires a safe origin/* base ref",
      metadataOnly: true,
      rawPayloadRetained: false,
    };
  }
  const localSha = branchSha(baseRef, cleanupCwd) || null;
  if (!localSha) {
    return {
      status: "unavailable",
      localSha: null,
      liveSha: null,
      reason: `exact-tree closed-PR cleanup requires local ${baseRef} evidence`,
      metadataOnly: true,
      rawPayloadRetained: false,
    };
  }
  if (!expectedLocalSha || localSha !== expectedLocalSha || gitTreeSha(localSha, cleanupCwd) !== expectedTree) {
    return {
      status: "mismatch",
      localSha,
      liveSha: null,
      reason: `local ${baseRef} changed after its exact-tree snapshot; rerun the proof`,
      metadataOnly: true,
      rawPayloadRetained: false,
    };
  }
  let liveSha;
  try {
    liveSha = originBranchSha(baseBranch, cleanupCwd) || null;
  } catch {
    return {
      status: "unavailable",
      localSha,
      liveSha: null,
      reason: `exact-tree closed-PR cleanup could not read live ${baseRef}`,
      metadataOnly: true,
      rawPayloadRetained: false,
    };
  }
  if (!liveSha) {
    return {
      status: "unavailable",
      localSha,
      liveSha: null,
      reason: `exact-tree closed-PR cleanup requires live ${baseRef} evidence`,
      metadataOnly: true,
      rawPayloadRetained: false,
    };
  }
  if (liveSha !== localSha) {
    return {
      status: "mismatch",
      localSha,
      liveSha,
      reason: `live ${baseRef} differs from local ${baseRef}; fetch explicitly and rerun the proof`,
      metadataOnly: true,
      rawPayloadRetained: false,
    };
  }
  return {
    status: "matched",
    localSha,
    liveSha,
    treeSha: expectedTree,
    checkedAt: new Date().toISOString(),
    metadataOnly: true,
    rawPayloadRetained: false,
  };
}

function closedPrIntegratedProof(manifest, cleanupCwd) {
  if (!Number.isInteger(manifest.pr_number) || manifest.pr_number < 1 || typeof manifest.pr_url !== "string" || !manifest.pr_url) {
    return { status: "blocked", reason: "closed-PR integrated cleanup requires a retained PR number and URL", metadataOnly: true };
  }
  const result = run("gh", ["pr", "list", "--head", manifest.branch, "--state", "all", "--json", "number,state,mergedAt,closedAt,headRefName,headRefOid,baseRefName"], { cwd: cleanupCwd });
  if (result.code !== 0) return { status: "unavailable", reason: `live GitHub PR proof is unavailable: gh pr list exited ${result.code}`, metadataOnly: true, rawPayloadRetained: false };
  let pullRequests;
  try {
    pullRequests = parseGhJson(result.stdout, "closed-PR integrated cleanup proof");
  } catch (error) {
    return { status: "unavailable", reason: `live GitHub PR proof is unavailable: ${error.message}`, metadataOnly: true, rawPayloadRetained: false };
  }
  if (!Array.isArray(pullRequests) || pullRequests.some((pr) => !pr || typeof pr !== "object" || pr.headRefName !== manifest.branch || !Number.isInteger(pr.number) || typeof pr.state !== "string")) {
    return { status: "unavailable", reason: "live GitHub PR proof is unavailable: malformed or non-exact source branch record", metadataOnly: true, rawPayloadRetained: false };
  }
  if (pullRequests.some((pr) => pr.state === "OPEN")) return { status: "blocked", reason: "live GitHub PR proof found an open PR for the source branch", metadataOnly: true, rawPayloadRetained: false };
  const retained = pullRequests.find((pr) => pr.number === manifest.pr_number);
  if (!retained) return { status: "blocked", reason: `live GitHub PR proof did not return retained PR #${manifest.pr_number} for the source branch`, metadataOnly: true, rawPayloadRetained: false };
  if (!["CLOSED", "MERGED"].includes(retained.state)) return { status: "blocked", reason: `retained PR #${manifest.pr_number} is not closed`, metadataOnly: true, rawPayloadRetained: false };
  return {
    status: "matched",
    retainedPr: { number: retained.number, state: retained.state, headRefName: retained.headRefName, headRefOid: typeof retained.headRefOid === "string" ? retained.headRefOid : null, baseRefName: typeof retained.baseRefName === "string" ? retained.baseRefName : null, mergedAt: typeof retained.mergedAt === "string" ? retained.mergedAt : null, closedAt: typeof retained.closedAt === "string" ? retained.closedAt : null },
    checkedAt: new Date().toISOString(),
    metadataOnly: true,
    rawPayloadRetained: false,
  };
}

function strictGithubNoPrProof(manifest, cleanupCwd) {
  const result = run("gh", ["pr", "list", "--head", manifest.branch, "--state", "all", "--json", "number,state,mergedAt,headRefName,headRefOid"], { cwd: cleanupCwd });
  if (result.code !== 0) {
    return {
      status: "unavailable",
      branch: manifest.branch,
      reason: `live GitHub no-PR proof is unavailable: gh pr list exited ${result.code}`,
      metadataOnly: true,
      rawPayloadRetained: false,
    };
  }
  let pullRequests;
  try {
    pullRequests = parseGhJson(result.stdout, "strict exact-tree no-PR proof");
  } catch (error) {
    return {
      status: "unavailable",
      branch: manifest.branch,
      reason: `live GitHub no-PR proof is unavailable: ${error.message}`,
      metadataOnly: true,
      rawPayloadRetained: false,
    };
  }
  if (!Array.isArray(pullRequests)) {
    return {
      status: "unavailable",
      branch: manifest.branch,
      reason: "live GitHub no-PR proof is unavailable: gh pr list did not return an array",
      metadataOnly: true,
      rawPayloadRetained: false,
    };
  }
  if (pullRequests.some((pullRequest) => !pullRequest || typeof pullRequest !== "object" || typeof pullRequest.headRefName !== "string" || pullRequest.headRefName !== manifest.branch)) {
    return {
      status: "unavailable",
      branch: manifest.branch,
      reason: "live GitHub no-PR proof is unavailable: gh pr list returned a malformed or non-exact head branch record",
      metadataOnly: true,
      rawPayloadRetained: false,
    };
  }
  if (pullRequests.length > 0) {
    return {
      status: "mismatch",
      branch: manifest.branch,
      count: pullRequests.length,
      reason: "live GitHub no-PR proof found PR evidence for the source branch",
      metadataOnly: true,
      rawPayloadRetained: false,
    };
  }
  return {
    status: "matched",
    branch: manifest.branch,
    count: 0,
    checkedAt: new Date().toISOString(),
    metadataOnly: true,
    rawPayloadRetained: false,
  };
}

function strictLiveOriginDevProof(cleanupCwd) {
  const localSha = branchSha("origin/dev", cleanupCwd) || null;
  if (!localSha) {
    return {
      status: "unavailable",
      localSha: null,
      liveSha: null,
      reason: "live origin/dev proof is unavailable: local origin/dev is missing",
      metadataOnly: true,
      rawPayloadRetained: false,
    };
  }
  let liveSha;
  try {
    liveSha = originBranchSha("dev", cleanupCwd) || null;
  } catch {
    return {
      status: "unavailable",
      localSha,
      liveSha: null,
      reason: "live origin/dev proof is unavailable: could not read origin/dev",
      metadataOnly: true,
      rawPayloadRetained: false,
    };
  }
  if (!liveSha) {
    return {
      status: "unavailable",
      localSha,
      liveSha: null,
      reason: "live origin/dev proof is unavailable: origin/dev is absent",
      metadataOnly: true,
      rawPayloadRetained: false,
    };
  }
  if (liveSha !== localSha) {
    return {
      status: "mismatch",
      localSha,
      liveSha,
      reason: "live origin/dev differs from local origin/dev; fetch explicitly and rerun the proof",
      metadataOnly: true,
      rawPayloadRetained: false,
    };
  }
  return {
    status: "matched",
    localSha,
    liveSha,
    checkedAt: new Date().toISOString(),
    metadataOnly: true,
    rawPayloadRetained: false,
  };
}

function strictAssignmentCloseoutPlan(state, manifest, options = {}) {
  const assignmentId = String(manifest.source_assignment_id || "").trim();
  if (!assignmentId) {
    return { status: "not_required", assignmentId: null, reason: "no linked assignment record", metadataOnly: true };
  }
  assertSafeTaskId(assignmentId);
  if (!existsSync(assignmentPath(state, assignmentId))) {
    return { status: "blocked", assignmentId, reason: `linked assignment ${assignmentId} is missing`, metadataOnly: true };
  }
  try {
    const preflight = preflightAssignmentClosureForCleanedManifest(state, manifest, {
      ...options,
      requireNoPrEvidence: true,
      requireExactAssignmentIdentity: true,
      requireKnownAssignmentOwner: true,
    });
    return {
      status: preflight?.closeable ? "ready" : "already_closed",
      assignmentId,
      dryRunCommand: `node ./scripts/codex-workspace.mjs close-assignments --ids ${assignmentId} --summary-json`,
      action: preflight?.closeable ? "locked_local_assignment_metadata_close_before_manifest_close" : "no_assignment_mutation_required",
      metadataOnly: true,
    };
  } catch (error) {
    return { status: "blocked", assignmentId, reason: `linked assignment closeout preflight failed: ${error.message}`, metadataOnly: true };
  }
}

function strictAssignmentCloseoutEvidence(manifest, assignmentCloseout) {
  const prior = manifest.supersession_closeout_evidence?.assignmentCloseout;
  if (assignmentCloseout?.status === "already_closed" && prior?.status === "closed" && typeof prior.closedAt === "string" && prior.closedAt) {
    return prior;
  }
  return assignmentCloseout;
}

function gitTreeSha(ref, cwd) {
  const result = git(["rev-parse", `${ref}^{tree}`], { cwd });
  return result.code === 0 ? result.stdout.trim() : null;
}

function hasStrictCloseoutEvidence(manifest) {
  return Boolean(manifest.pr_delivery_evidence || manifest.pr_gate_evidence || manifest.cleanup_started_at || manifest.cleanup_target_evidence || manifest.cleanup_supersession_evidence || manifest.supersession_closeout_evidence);
}

function strictPartialCloseoutMatches(manifest, strict, baseRef) {
  const evidence = manifest.supersession_closeout_evidence;
  return manifest.status === "cleanup_partial" && evidence?.mode === "exact-tree-closeout/v1" && evidence.baseRef === baseRef && evidence.supersessionProvenance === strict.provenance && evidence.closeoutReason === strict.closeoutReason;
}

function closedPrIntegratedPartialResume(manifest, closedPrIntegrated, baseRef) {
  const evidence = manifest.closed_pr_integrated_cleanup;
  return Boolean(exactCleanupPartialJournal(manifest, manifest.cleanup_expected_head_sha) &&
    evidence?.mode === "closed-pr-integrated-cleanup/v1" &&
    evidence.baseRef === baseRef &&
    evidence.approval === closedPrIntegrated.approval &&
    evidence.retainedPr && Number.isInteger(evidence.retainedPr.number) &&
    exactGitObjectIdOrNull(evidence.expectedHeadSha));
}

function strictWorktreeOnManifestBranch(manifest, cleanupCwd) {
  const branch = git(["-C", manifest.worktree_path, "branch", "--show-current"], { cwd: cleanupCwd });
  return branch.code === 0 && branch.stdout.trim() === manifest.branch;
}

function strictWorktreeRegistration(manifest, cleanupCwd) {
  const result = git(["worktree", "list", "--porcelain"], { cwd: cleanupCwd });
  if (result.code !== 0) return { status: "blocked", listed: false, reason: `worktree registration evidence is unavailable: ${result.stderr || result.stdout || "git worktree list failed"}` };
  return { status: "matched", listed: parseWorktreePorcelain(result.stdout).some((record) => samePath(record.path, manifest.worktree_path)), reason: null };
}

function cleanupIntegratedPlanLines(result) {
  return [
    `${result.taskId}: integrated into ${result.baseRef}`,
    `owner ${result.owner || "unowned"}`,
    `local branch ${result.branch} (${result.localBranchSha || "absent"})`,
    result.exactTreeCloseout ? `remote branch origin/${result.branch} (verified absent; no remote mutation)` : `remote branch origin/${result.branch} (${result.remoteBranchSha || "absent"}; not deleted by cleanup-integrated)`,
    ...(result.exactTreeCloseout ? [`registered clean worktree proof: registered=${result.proof.worktree.registered}; clean=${result.proof.worktree.clean}; branch=${result.proof.worktree.branch}`, `live origin/dev proof: ${result.proof.originDev.status}`, `no PR/cleanup evidence proof: ${result.proof.noPrCleanupEvidence.status}`, `live GitHub no-PR proof: ${result.proof.githubNoPr.status}`, `exact tree ${result.proof.tree.source} equals ${result.proof.tree.base}`, `supersession evidence: ${result.proof.evidence.supersessionProvenance}`, `closeout reason: ${result.proof.evidence.closeoutReason}`, ...(result.proof.assignmentCloseout.status === "ready" ? [`assignment closeout dry-run: ${result.proof.assignmentCloseout.dryRunCommand}`, `locked local assignment metadata close before manifest close: ${result.proof.assignmentCloseout.assignmentId}`] : [`assignment closeout: ${result.proof.assignmentCloseout.status}`])] : []),
    `clean generated artifacts under ${result.worktreePath}`,
    `git worktree remove ${result.worktreePath}`,
    `git update-ref -d refs/heads/${result.branch} ${result.expectedHeadSha}`,
    `close manifest ${result.taskId}`,
  ];
}

function buildCleanupIntegratedSummary({ state, currentOwner, baseRef, query, results }) {
  return {
    generatedAt: new Date().toISOString(),
    stateRoot: state.root,
    currentOwner,
    mode: "cleanup-integrated",
    baseRef,
    query: query || null,
    counts: {
      total: results.length,
      cleanupReady: results.filter((result) => result.status === "ready").length,
      skipped: results.filter((result) => result.status !== "ready").length,
    },
    statusCounts: countByField(results, "status"),
    skippedReasonCounts: countByField(results.filter((result) => result.status !== "ready"), "reason"),
    results: results.slice(0, 10),
    resultsTruncated: results.length > 10,
    mutation: "none; summary only",
    remoteBranchPolicy: "remote branches are reported but not deleted by cleanup-integrated",
  };
}

function applyCleanupIntegrated(state, plan, options) {
  withManifestLock(state, plan.taskId, () => {
    const manifest = readManifest(plan.manifestPath);
    validateManifest(manifest, plan.manifestPath);
    assertLaneOwner(manifest, options);
    claimLaneOwner(manifest, options);
    const assignmentId = plan.exactTreeCloseout ? String(manifest.source_assignment_id || "").trim() : "";
    const runWithAssignmentLock = assignmentId
      ? (callback) => withAssignmentLock(state, assignmentId, callback)
      : (callback) => callback();
    return runWithAssignmentLock(() => {
    const freshPlan = cleanupIntegratedPlan({ manifest, path: plan.manifestPath }, state, {
      baseRef: plan.baseRef,
      currentOwner: currentLaneOwner(options),
      options,
      exactTreeCloseout: plan.exactTreeCloseout ? exactTreeCloseoutInput({ positional: [plan.taskId], options, baseRef: plan.baseRef }) : null,
      closedPrIntegrated: plan.closedPrIntegrated ? closedPrIntegratedInput({ positional: [plan.taskId], options, baseRef: plan.baseRef, exactTreeCloseout: null }) : null,
    });
    if (freshPlan.status !== "ready") {
      throw new Error(`${plan.taskId} is no longer cleanup-ready: ${freshPlan.reason}`);
    }
    if (freshPlan.exactTreeCloseout && freshPlan.proof.assignmentCloseout.status === "ready") {
      preflightAssignmentClosureForCleanedManifest(state, manifest, {
        ...options,
        requireNoPrEvidence: true,
        requireExactAssignmentIdentity: true,
        requireKnownAssignmentOwner: true,
      });
    }

    try {
      const cleanupStartedAt = new Date().toISOString();
      manifest.cleanup_started_at = manifest.cleanup_started_at || cleanupStartedAt;
      manifest.cleanup_owner = manifest.owner || null;
      manifest.cleanup_branch = manifest.branch;
      manifest.cleanup_base_ref = plan.baseRef;
      manifest.cleanup_expected_head_sha = freshPlan.expectedHeadSha;
      manifest.cleanup_local_branch_sha = freshPlan.localBranchSha;
      manifest.cleanup_remote_branch_sha = freshPlan.remoteBranchSha || null;
      manifest.cleanup_remote_branch_deleted_at = null;
      manifest.cleanup_remote_branch_policy = "not-deleted-no-pr-integrated-cleanup";
      if (freshPlan.closedPrIntegrated) {
        manifest.closed_pr_integrated_cleanup = {
          mode: "closed-pr-integrated-cleanup/v1",
          appliedAt: cleanupStartedAt,
          baseRef: freshPlan.baseRef,
          expectedHeadSha: freshPlan.expectedHeadSha,
          retainedPr: freshPlan.proof.closedPr.retainedPr,
          integration: freshPlan.proof.integration,
          approval: freshPlan.proof.approval,
          metadataOnly: true,
          rawPayloadRetained: false,
        };
        manifest.cleanup_remote_branch_policy = "not-deleted-closed-pr-integrated-cleanup";
        appendTaskEvent(manifest, "closed_pr_integrated_cleanup_started", `non-open PR #${freshPlan.proof.closedPr.retainedPr.number} rechecked against ${freshPlan.baseRef}`);
        manifest.status = "cleanup_partial";
        manifest.cleanup_error = "closed-PR integrated cleanup journal persisted; resume only with the same locked proof after interruption";
        manifest.updated_at = cleanupStartedAt;
        appendTaskEvent(manifest, "cleanup_journal_started", "durable closed-PR integrated cleanup journal persisted before local target deletion");
        writeManifest(plan.manifestPath, manifest);
      }
      if (freshPlan.exactTreeCloseout) {
        manifest.supersession_closeout_evidence = {
          mode: "exact-tree-closeout/v1",
          appliedAt: cleanupStartedAt,
          baseRef: freshPlan.baseRef,
          sourceTree: freshPlan.proof.tree.source,
          baseTree: freshPlan.proof.tree.base,
          originDev: freshPlan.proof.originDev,
          remoteBranch: "absent",
          githubNoPr: freshPlan.proof.githubNoPr,
          assignmentCloseout: strictAssignmentCloseoutEvidence(manifest, freshPlan.proof.assignmentCloseout),
          supersessionProvenance: freshPlan.proof.evidence.supersessionProvenance,
          closeoutReason: freshPlan.proof.evidence.closeoutReason,
          metadataOnly: true,
          rawPayloadRetained: false,
        };
        manifest.cleanup_remote_branch_policy = "verified-absent-no-remote-mutation-exact-tree-closeout";
        manifest.status = "cleanup_partial";
        manifest.cleanup_error = "exact-tree closeout journal persisted; resume only with the same locked proof after interruption";
        manifest.updated_at = cleanupStartedAt;
        appendTaskEvent(manifest, "cleanup_journal_started", "durable exact-tree closeout journal persisted before local target deletion");
        appendTaskEvent(manifest, "assignment_closeout_planned", freshPlan.proof.assignmentCloseout.dryRunCommand || freshPlan.proof.assignmentCloseout.reason);
        writeManifest(plan.manifestPath, manifest);

        if (assignmentId && freshPlan.proof.assignmentCloseout.status === "ready") {
          const assignmentClosure = closeAssignmentForCleanedManifest(state, manifest, {
            ...options,
            assignmentLockHeld: true,
            lastResult: `closed with exact-tree local cleanup of ${manifest.task_id}`,
            eventMessage: `closed by locked exact-tree closeout of ${manifest.task_id} before local target deletion`,
          });
          if (assignmentClosure?.closed) {
            manifest.source_assignment_closed_at = assignmentClosure.closedAt;
            manifest.supersession_closeout_evidence.assignmentCloseout = {
              ...freshPlan.proof.assignmentCloseout,
              status: "closed",
              closedAt: assignmentClosure.closedAt,
              action: "locked_local_assignment_metadata_closed_before_local_target_deletion",
            };
            appendTaskEvent(manifest, "assignment_closed", assignmentClosure.assignmentId);
            writeManifest(plan.manifestPath, manifest);
          }
        }
      }

      removeWorktreeIfPresent(manifest, state, freshPlan.cleanupCwd);
      if (freshPlan.exactTreeCloseout || freshPlan.closedPrIntegrated) writeManifest(plan.manifestPath, manifest);
      deleteLocalBranchIfPresent(manifest, freshPlan.cleanupCwd, freshPlan.expectedHeadSha);
      if (freshPlan.exactTreeCloseout || freshPlan.closedPrIntegrated) writeManifest(plan.manifestPath, manifest);

      if (freshPlan.exactTreeCloseout) {
        const finalRemoteAbsence = assertStrictExactTreeRemoteAbsent(manifest, freshPlan.cleanupCwd);
        manifest.supersession_closeout_evidence.finalRemoteAbsence = finalRemoteAbsence;
        appendTaskEvent(manifest, "source_remote_absent_revalidated", manifest.branch);
        const finalOriginDev = strictLiveOriginDevProof(freshPlan.cleanupCwd);
        manifest.supersession_closeout_evidence.finalOriginDev = finalOriginDev;
        appendTaskEvent(manifest, "origin_dev_revalidated", finalOriginDev.status);
        if (finalOriginDev.status !== "matched") {
          throw new Error(`final live origin/dev proof failed: ${finalOriginDev.reason}`);
        }
        const finalGithubNoPr = strictGithubNoPrProof(manifest, freshPlan.cleanupCwd);
        manifest.supersession_closeout_evidence.finalGithubNoPr = finalGithubNoPr;
        appendTaskEvent(manifest, "source_github_no_pr_revalidated", `${finalGithubNoPr.status}:${finalGithubNoPr.count ?? "unavailable"}`);
        if (finalGithubNoPr.status !== "matched") {
          throw new Error(`final live GitHub no-PR proof failed: ${finalGithubNoPr.reason}`);
        }
      }

      manifest.status = "closed";
      manifest.closed_at = new Date().toISOString();
      manifest.updated_at = manifest.closed_at;
      manifest.cleanup_completed_at = manifest.closed_at;
      manifest.cleanup_error = null;
      const assignmentClosure = freshPlan.exactTreeCloseout ? null : closeAssignmentForCleanedManifest(state, manifest, {
        ...options,
        lastResult: `closed after integrated cleanup of ${manifest.task_id}`,
        eventMessage: `cleaned integrated workspace ${manifest.task_id}`,
      });
      if (assignmentClosure?.closed) {
        manifest.source_assignment_closed_at = assignmentClosure.closedAt;
        appendTaskEvent(manifest, "assignment_closed", assignmentClosure.assignmentId);
      }
      appendTaskEvent(manifest, "closed", freshPlan.closedPrIntegrated ? `cleaned non-open PR integrated workspace against ${plan.baseRef}` : `cleaned no-PR integrated workspace against ${plan.baseRef}`);
    } catch (error) {
      manifest.status = "cleanup_partial";
      manifest.cleanup_error = error.message;
      manifest.updated_at = new Date().toISOString();
      appendTaskEvent(manifest, "cleanup_partial", error.message);
      writeManifest(plan.manifestPath, manifest);
      throw error;
    }
    writeManifest(plan.manifestPath, manifest);
    });
  });
}

function assertStrictExactTreeRemoteAbsent(manifest, cleanupCwd) {
  let remoteBranchSha;
  try {
    remoteBranchSha = originBranchSha(manifest.branch, cleanupCwd) || null;
  } catch (error) {
    throw new Error(`final source remote absence re-probe is unavailable: ${error.message}`);
  }
  if (remoteBranchSha) {
    throw new Error(`final source remote absence re-probe found origin/${manifest.branch} at ${remoteBranchSha}`);
  }
  return {
    state: "absent",
    branch: manifest.branch,
    checkedAt: new Date().toISOString(),
    metadataOnly: true,
    rawPayloadRetained: false,
  };
}

function cleanupSuperseded(argv) {
  const { positional, options } = parseOptions(argv);
  if (positional.length !== 1) {
    throw new Error("cleanup-superseded requires exactly one explicit source task id.");
  }
  if (options.summaryJson && options.apply) {
    throw new Error("cleanup-superseded --summary-json is only supported without --apply.");
  }
  if (options.deleteRemote) {
    throw new Error("cleanup-superseded retains remote branches; --delete-remote is forbidden.");
  }

  const proofInput = cleanupSupersessionInput(options);
  const state = workspaceState(options);
  const record = findCleanupManifest(state, positional[0]);
  assertCleanupWorktreeForSuperseded(record.manifest, state, proofInput);
  requireGh("cleanup-superseded");
  const plan = cleanupSupersededPlan(record, state, { options, proofInput, currentOwner: currentLaneOwner(options) });

  if (options.summaryJson) {
    console.log(JSON.stringify(buildCleanupSupersededSummary({ state, plan, proofInput, currentOwner: currentLaneOwner(options) }), null, 2));
    return;
  }
  if (plan.status !== "ready") {
    console.log(`BLOCKED ${plan.taskId}: ${plan.reason}`);
    return;
  }
  if (!options.apply) {
    printPlan("cleanup-superseded", cleanupSupersededPlanLines(plan));
    console.log("Add --apply --approval <operator evidence> --reason <reviewed reason> only after reviewing this proof packet.");
    return;
  }
  if (!validSupersessionApplyEvidence(options.approval) || !validSupersessionApplyEvidence(options.reason)) {
    throw new Error("cleanup-superseded --apply requires --approval and --reason with at least 10 non-whitespace characters each.");
  }

  applyCleanupSuperseded(state, plan, { options, proofInput });
  console.log(`Closed ${plan.taskId}`);
}

function cleanupSupersessionInput(options) {
  const sourceHead = requireExactGitObjectId(options.sourceHead, "--source-head");
  const carryForwardCommit = requireExactGitObjectId(options.carryForwardCommit, "--carry-forward-commit");
  const carryForwardPr = String(options.carryForwardPr || "").trim();
  const carryForwardPrNumber = Number(carryForwardPr);
  if (!/^\d+$/.test(carryForwardPr) || !Number.isSafeInteger(carryForwardPrNumber) || carryForwardPrNumber <= 0) {
    throw new Error("cleanup-superseded --carry-forward-pr must be a positive safe integer PR number.");
  }
  const closedSourcePr = options.closedSourcePr === undefined
    ? null
    : parsePositiveSafePrNumber(options.closedSourcePr, "--closed-source-pr");
  if (closedSourcePr !== null) {
    if (options.firstUseRepair || options.scope !== undefined || options.canonicalBase !== undefined || options.supersessionProvenance !== undefined || options.sourceRemote !== undefined || options.legacyUnassigned !== undefined || options.successorHardeningCommits !== undefined || options.successorHardeningScope !== undefined || options.successorHardeningEvidence !== undefined) {
      throw new Error("cleanup-superseded closed-source PR patch-equivalence mode cannot be combined with scope or legacy repair options.");
    }
    const sourceCommits = parseSupersessionCommitList(options.sourcePatchCommits, "--source-patch-commits");
    const carryForwardCommits = parseSupersessionCommitList(options.carryForwardPatchCommits, "--carry-forward-patch-commits");
    if (sourceCommits.length !== carryForwardCommits.length) {
      throw new Error("cleanup-superseded closed-source PR patch-equivalence mode requires equally sized source and carry-forward commit lists.");
    }
    return {
      sourceHead,
      carryForwardPr: carryForwardPrNumber,
      carryForwardCommit,
      scope: [],
      repair: null,
      closedSourcePr: { number: closedSourcePr, sourceCommits, carryForwardCommits },
    };
  }
  if (options.sourcePatchCommits !== undefined || options.carryForwardPatchCommits !== undefined) {
    throw new Error("cleanup-superseded --source-patch-commits and --carry-forward-patch-commits require --closed-source-pr.");
  }
  const scope = parseSupersessionScope(options.scope);
  const firstUseRepair = options.firstUseRepair === true;
  const firstUseOptionsPresent = [
    options.canonicalBase,
    options.supersessionProvenance,
    options.sourceRemote,
    options.legacyUnassigned,
    options.successorHardeningCommits,
    options.successorHardeningScope,
    options.successorHardeningEvidence,
  ].some((value) => value !== undefined);
  if (!firstUseRepair && firstUseOptionsPresent) {
    throw new Error("cleanup-superseded legacy repair options require explicit --first-use-repair.");
  }
  if (!firstUseRepair) return { sourceHead, carryForwardPr: carryForwardPrNumber, carryForwardCommit, scope, repair: null };

  const canonicalBase = String(options.canonicalBase || "").trim();
  if (canonicalBase !== defaultBaseBranch) {
    throw new Error(`cleanup-superseded --first-use-repair requires --canonical-base ${defaultBaseBranch}.`);
  }
  const provenance = String(options.supersessionProvenance || "").trim();
  if (!validSupersessionApplyEvidence(provenance)) {
    throw new Error("cleanup-superseded --first-use-repair requires --supersession-provenance with at least 10 non-whitespace characters.");
  }
  if (String(options.sourceRemote || "").trim() !== "absent") {
    throw new Error("cleanup-superseded --first-use-repair requires --source-remote absent; remote lookup errors are never treated as absent.");
  }
  if (options.legacyUnassigned !== true) {
    throw new Error("cleanup-superseded --first-use-repair requires explicit --legacy-unassigned.");
  }
  const hardeningCommits = parseSupersessionCommitList(options.successorHardeningCommits, "--successor-hardening-commits");
  const hardeningScope = parseSupersessionScope(options.successorHardeningScope);
  const hardeningEvidence = String(options.successorHardeningEvidence || "").trim();
  if (!validSupersessionApplyEvidence(hardeningEvidence)) {
    throw new Error("cleanup-superseded --first-use-repair requires --successor-hardening-evidence with at least 10 non-whitespace characters.");
  }
  return {
    sourceHead,
    carryForwardPr: carryForwardPrNumber,
    carryForwardCommit,
    scope,
    repair: {
      mode: "first-use-legacy",
      canonicalBase,
      provenance,
      sourceRemote: "absent",
      legacyUnassigned: true,
      hardeningCommits,
      hardeningScope,
      hardeningEvidence,
    },
  };
}

function parsePositiveSafePrNumber(value, optionName) {
  const raw = String(value || "").trim();
  const number = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(number) || number <= 0) {
    throw new Error(`cleanup-superseded ${optionName} must be a positive safe integer PR number.`);
  }
  return number;
}

function requireExactGitObjectId(value, optionName) {
  const normalized = String(value || "").trim();
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(normalized)) {
    throw new Error(`cleanup-superseded ${optionName} must be an exact 40- or 64-character Git object id.`);
  }
  return normalized.toLowerCase();
}

function parseSupersessionScope(value) {
  if (value === true || value === undefined || value === null) {
    throw new Error("cleanup-superseded --scope requires a value.");
  }
  const paths = String(value || "").split(",");
  if (paths.length === 0 || paths.length > 64) {
    throw new Error("cleanup-superseded --scope requires between 1 and 64 comma-separated paths.");
  }
  if (new Set(paths).size !== paths.length) {
    throw new Error("cleanup-superseded --scope must not repeat a path.");
  }
  for (const path of paths) {
    if (
      path !== path.trim() ||
      path.startsWith("/") ||
      path.startsWith(":") ||
      path.includes("\\") ||
      /[*?\[\]{}!]/.test(path) ||
      /[\x00-\x1f\x7f]/.test(path) ||
      path.split("/").some((segment) => !segment || segment === "." || segment === "..") ||
      path.startsWith(".git/") ||
      path === ".git"
    ) {
      throw new Error(`cleanup-superseded --scope contains an unsafe repository-relative path: ${path}`);
    }
  }
  return [...paths].sort();
}

function parseSupersessionCommitList(value, optionName) {
  if (value === true || value === undefined || value === null) {
    throw new Error(`cleanup-superseded ${optionName} requires a value.`);
  }
  const commits = String(value || "").split(",");
  if (commits.length === 0 || commits.length > 32 || new Set(commits).size !== commits.length) {
    throw new Error(`cleanup-superseded ${optionName} requires between 1 and 32 unique exact Git object ids.`);
  }
  const normalized = commits.map((commit) => {
    if (commit !== commit.trim()) throw new Error(`cleanup-superseded ${optionName} must not normalize whitespace.`);
    return requireExactGitObjectId(commit, optionName);
  });
  if (new Set(normalized).size !== normalized.length) throw new Error(`cleanup-superseded ${optionName} must not repeat a Git object id.`);
  return normalized;
}

function validSupersessionApplyEvidence(value) {
  return String(value || "").replace(/\s+/g, "").length >= 10;
}

function cleanupSupersededPlan(record, state, context) {
  const { manifest } = record;
  const { proofInput, options } = context;
  // This is a preliminary identity check so only an already-recorded partial
  // cleanup may proceed past the intentionally absent local targets.  The
  // first-use base proof is rechecked after its live evidence is available.
  const partialResume = sameSupersessionPartialResume(manifest, proofInput);
  const base = {
    taskId: manifest.task_id,
    status: "blocked",
    reason: "",
    branch: manifest.branch,
    sourceStatus: manifest.status,
    owner: manifest.owner || null,
    worktreePath: manifest.worktree_path,
    manifestPath: record.path,
    proof: {
      source: { requestedHead: proofInput.sourceHead, localBranchHead: null, remoteBranchHead: null, status: "unverified" },
      carryForward: { prNumber: proofInput.carryForwardPr, requestedCommit: proofInput.carryForwardCommit, status: "unverified" },
      scope: { paths: proofInput.scope, status: "unverified", sourceEntries: [], carryForwardEntries: [] },
      worktree: null,
      assignment: { status: "unverified" },
      sourcePullRequests: { status: "unverified", count: null },
      currentBase: { manifestRef: manifest.base_ref || null, canonicalRef: null, headSha: null, status: "unverified", scopeStatus: "unverified" },
      repair: proofInput.repair ? { mode: proofInput.repair.mode, canonicalBase: proofInput.repair.canonicalBase, sourceRemote: proofInput.repair.sourceRemote, legacyUnassigned: proofInput.repair.legacyUnassigned, provenance: proofInput.repair.provenance, hardeningEvidence: proofInput.repair.hardeningEvidence, hardeningCommits: proofInput.repair.hardeningCommits, hardeningScope: proofInput.repair.hardeningScope, status: "unverified" } : null,
    },
    remoteBranchPolicy: "remote branches are retained by cleanup-superseded",
  };

  if (manifest.status === "closed") return { ...base, reason: "workspace manifest is already closed" };
  if (/(?:hold|held)/i.test(String(manifest.status || ""))) return { ...base, reason: "held workspace deletion is forbidden" };
  if (manifest.mode === "epic-batch") return { ...base, reason: "epic-batch workspace requires finish-epic closeout" };
  if (supersededSourceHasPrEvidence(manifest) && !proofInput.closedSourcePr) {
    return { ...base, reason: "source workspace has PR or prior cleanup evidence; cleanup-superseded accepts only no-PR source lanes" };
  }
  const ownerGate = supersededManifestOwnerGate(manifest, options);
  if (ownerGate.status !== "matched") return { ...base, reason: ownerGate.reason };
  base.proof.owner = ownerGate;
  if (manifest.cleanup_target_evidence?.remoteBranch?.required) {
    return { ...base, reason: "source manifest retains a prior required remote cleanup target; local-only superseded cleanup refuses to alter it" };
  }

  assertSafeBranch(manifest.branch);
  const cleanupTarget = assertCleanupWorktreeForSuperseded(manifest, state, proofInput);
  let cleanupCwd;
  try {
    cleanupCwd = cleanupRepositoryRoot(manifest.worktree_path, state, cleanupTarget);
  } catch (error) {
    return { ...base, reason: error.message };
  }
  // Treat PR-returned lineage ids as untrusted metadata.  Normalize them before
  // any cleanup proof can use them as a Git revision.
  const carryForward = mergedCarryForwardPr(proofInput.carryForwardPr, cleanupCwd);
  base.proof.carryForward = {
    prNumber: proofInput.carryForwardPr,
    requestedCommit: proofInput.carryForwardCommit,
    mergedAt: carryForward?.mergedAt || null,
    mergeCommit: carryForward?.mergeCommit?.oid || null,
    headCommit: carryForward?.headRefOid || null,
    baseRefOidSource: carryForward?.baseRefOidSource || null,
    baseRefOidError: carryForward?.baseRefOidError || null,
    lineageError: carryForward?.lineageError || null,
    status: "unverified",
  };
  if (carryForward?.lineageError) {
    return { ...base, cleanupCwd, reason: carryForward.lineageError };
  }
  if (carryForward?.baseRefOidError) {
    return { ...base, cleanupCwd, reason: carryForward.baseRefOidError };
  }

  const worktreeStatus = worktreeCleanupStatus(manifest, cleanupCwd);
  base.proof.worktree = cleanupWorktreeSummary(worktreeStatus);
  if ((!worktreeStatus.exists || !worktreeStatus.listed) && !partialResume) return { ...base, cleanupCwd, reason: "source worktree must exist and remain registered" };
  if (partialResume && (worktreeStatus.exists || worktreeStatus.listed)) return { ...base, cleanupCwd, reason: "partial supersession resume requires the source worktree to remain absent" };
  if (worktreeStatus.dirty) return { ...base, cleanupCwd, reason: "source worktree is not clean" };

  const localBranchHead = branchSha(manifest.branch, cleanupCwd) || null;
  let remoteBranchHead = null;
  try {
    remoteBranchHead = originBranchSha(manifest.branch, cleanupCwd) || null;
  } catch (error) {
    return { ...base, cleanupCwd, reason: `source remote branch evidence is unavailable: ${error.message}` };
  }
  base.proof.source = {
    requestedHead: proofInput.sourceHead,
    localBranchHead,
    remoteBranchHead,
    expectedRemoteState: proofInput.repair?.sourceRemote === "absent" ? "absent" : "present",
    status: supersededSourceHeadMatches({ partialResume, localBranchHead, remoteBranchHead, sourceHead: proofInput.sourceHead, expectedRemoteState: proofInput.repair?.sourceRemote === "absent" ? "absent" : "present" }) ? "matched" : "mismatch",
  };
  if (base.proof.source.status !== "matched") return { ...base, cleanupCwd, reason: supersededSourceMismatchReason({ partialResume, expectedRemoteState: proofInput.repair?.sourceRemote === "absent" ? "absent" : "present" }) };

  const sourcePullRequests = proofInput.closedSourcePr
    ? { status: "not_queried", count: null, reason: "exact closed source PR identity is proved separately" }
    : sourceBranchPullRequestProof(manifest.branch, cleanupCwd);
  base.proof.sourcePullRequests = sourcePullRequests;
  if (!proofInput.closedSourcePr && sourcePullRequests.status !== "matched") return { ...base, cleanupCwd, reason: sourcePullRequests.reason };

  if (proofInput.closedSourcePr) {
    const closedSource = closedUnmergedSourcePr(proofInput.closedSourcePr.number, cleanupCwd);
    base.proof.closedSourcePr = closedSource;
    const patchProof = closedPrPatchEquivalenceProof(manifest, proofInput, carryForward, closedSource, cleanupCwd);
    base.proof.patchEquivalence = patchProof;
    if (patchProof.status !== "matched") return { ...base, cleanupCwd, reason: patchProof.reason };
    const currentBase = closedPrPatchEquivalentCurrentBaseProof(manifest, carryForward, cleanupCwd);
    base.proof.currentBase = currentBase;
    if (currentBase.status !== "matched") return { ...base, cleanupCwd, reason: currentBase.reason };
    if (partialResume && !sameSupersessionPartialResume(manifest, proofInput, { carryForward, currentBase })) {
      return { ...base, cleanupCwd, reason: "partial supersession resume requires the recorded closed-PR patch-equivalence proof to exactly match current evidence" };
    }
    return {
      ...base,
      status: "ready",
      cleanupCwd,
      expectedHeadSha: proofInput.sourceHead,
      localBranchSha: localBranchHead,
      remoteBranchSha: remoteBranchHead,
      partialResume,
      reason: partialResume ? "same-proof closed-PR patch-equivalent partial is safe to resume" : "closed source PR is exactly patch-equivalent to the named merged successor",
    };
  }

  const assignmentGate = supersededAssignmentGate(state, manifest, options, proofInput);
  base.proof.assignment = assignmentGate;
  if (assignmentGate.status !== "matched") return { ...base, cleanupCwd, reason: assignmentGate.reason };

  if (!carryForward?.mergedAt || String(carryForward.state || "").toUpperCase() !== "MERGED") {
    return { ...base, cleanupCwd, reason: "named carry-forward PR is not merged" };
  }
  const expectedPrBase = proofInput.repair?.canonicalBase || manifest.base_branch;
  if (String(carryForward.baseRefName || "") !== String(expectedPrBase || "")) return { ...base, cleanupCwd, reason: "named carry-forward PR base does not match the required canonical/source base branch" };
  if (!proofInput.repair && carryForward.mergeCommit?.oid !== proofInput.carryForwardCommit) return { ...base, cleanupCwd, reason: "named carry-forward PR merge commit does not exactly match --carry-forward-commit" };
  if (!gitCommitExists(proofInput.carryForwardCommit, cleanupCwd)) {
    return { ...base, cleanupCwd, reason: "named carry-forward commit is unavailable in the local repository" };
  }
  if (proofInput.repair && (!carryForward.mergeCommit?.oid || !carryForward.headRefOid || !gitCommitIsAncestor(proofInput.carryForwardCommit, carryForward.headRefOid, cleanupCwd) || !gitCommitIsAncestor(proofInput.carryForwardCommit, carryForward.mergeCommit.oid, cleanupCwd) || !gitCommitIsAncestor(carryForward.headRefOid, carryForward.mergeCommit.oid, cleanupCwd) || (carryForward.mergeCommit.oid !== carryForward.headRefOid && !gitCommitParents(carryForward.mergeCommit.oid, cleanupCwd).includes(carryForward.headRefOid)))) {
    return { ...base, cleanupCwd, reason: "named carried-forward commit is not proven within the named merged PR lineage" };
  }
  base.proof.carryForward.status = "matched";

  const currentBase = supersededCurrentBaseProof(manifest, carryForward, proofInput, cleanupCwd);
  base.proof.currentBase = currentBase;
  if (currentBase.status !== "matched") {
    return { ...base, cleanupCwd, reason: currentBase.reason };
  }
  if (partialResume && !sameSupersessionPartialResume(manifest, proofInput, { carryForward, currentBase })) {
    return { ...base, cleanupCwd, reason: "partial supersession resume requires the recorded first-use canonical base proof to exactly match current evidence" };
  }

  const scopeProof = compareScopedTreeEntries(proofInput.sourceHead, proofInput.carryForwardCommit, proofInput.scope, cleanupCwd);
  base.proof.scope = scopeProof;
  if (scopeProof.status !== "matched") return { ...base, cleanupCwd, reason: "scoped source and carry-forward trees are not exactly equivalent" };
  const currentBaseScope = proofInput.repair
    ? supersededFirstUseHardeningProof(proofInput, carryForward, currentBase, cleanupCwd)
    : compareScopedTreeEntries(proofInput.sourceHead, currentBase.canonicalRef, proofInput.scope, cleanupCwd);
  base.proof.currentBase.scopeStatus = currentBaseScope.status;
  base.proof.currentBase.scopeEntries = currentBaseScope.carryForwardEntries || currentBaseScope.canonicalEntries || [];
  if (currentBaseScope.status !== "matched") return { ...base, cleanupCwd, reason: proofInput.repair ? currentBaseScope.reason : "scoped source content is not exactly retained in the current canonical base" };
  if (!scopeCoversSourceDelta(currentBase.canonicalRef, proofInput.sourceHead, proofInput.scope, cleanupCwd)) {
    return { ...base, cleanupCwd, reason: "bounded scope does not cover every source-lane tree delta" };
  }
  if (proofInput.repair) {
    // The value was normalized as an exact Git object ID and matched against
    // the canonical head above; retain it only in a fully ready repair proof.
    base.proof.carryForward.baseRefOid = carryForward.baseRefOid;
    base.proof.repair = { ...base.proof.repair, status: "matched", hardeningProof: currentBaseScope };
  }

  return { ...base, status: "ready", cleanupCwd, expectedHeadSha: proofInput.sourceHead, localBranchSha: localBranchHead, remoteBranchSha: remoteBranchHead, partialResume, reason: partialResume ? "same-proof supersession partial is safe to resume" : proofInput.repair ? "explicit legacy first-use repair proof is safe to apply locally" : "clean no-PR source is exactly carried by the named merged successor scope" };
}

function supersededSourceHeadMatches({ partialResume, localBranchHead, remoteBranchHead, sourceHead, expectedRemoteState }) {
  const localMatches = partialResume ? !localBranchHead : localBranchHead === sourceHead;
  const remoteMatches = expectedRemoteState === "absent" ? remoteBranchHead === null : remoteBranchHead === sourceHead;
  return localMatches && remoteMatches;
}

function supersededSourceMismatchReason({ partialResume, expectedRemoteState }) {
  if (expectedRemoteState === "absent") return partialResume ? "first-use partial resume requires an absent local branch and a successfully verified absent source remote" : "first-use repair requires local source head at --source-head and a successfully verified absent source remote";
  return partialResume ? "partial supersession resume requires an absent local branch and retained remote branch at --source-head" : "source local and remote branch heads must exactly match --source-head";
}

function sameSupersessionPartialResume(manifest, proofInput, liveEvidence = null) {
  const proof = manifest.cleanup_supersession_evidence?.proof;
  const requestedClosedSourcePr = proofInput.closedSourcePr ? {
    number: proofInput.closedSourcePr.number,
    sourceCommits: proofInput.closedSourcePr.sourceCommits,
    carryForwardCommits: proofInput.closedSourcePr.carryForwardCommits,
  } : null;
  const recordedClosedSourcePr = proof?.patchEquivalence?.status === "matched" ? {
    number: proof.patchEquivalence.sourcePr,
    sourceCommits: proof.patchEquivalence.sourceCommits,
    carryForwardCommits: proof.patchEquivalence.carryForwardCommits,
  } : null;
  const recordedRepair = proof?.repair ? {
    mode: proof.repair.mode,
    canonicalBase: proof.repair.canonicalBase,
    sourceRemote: proof.repair.sourceRemote,
    legacyUnassigned: proof.repair.legacyUnassigned,
    provenance: proof.repair.provenance,
    hardeningEvidence: proof.repair.hardeningEvidence,
    hardeningCommits: proof.repair.hardeningCommits,
    hardeningScope: proof.repair.hardeningScope,
  } : null;
  const requestedRepair = proofInput.repair ? {
    mode: proofInput.repair.mode,
    canonicalBase: proofInput.repair.canonicalBase,
    sourceRemote: proofInput.repair.sourceRemote,
    legacyUnassigned: proofInput.repair.legacyUnassigned,
    provenance: proofInput.repair.provenance,
    hardeningEvidence: proofInput.repair.hardeningEvidence,
    hardeningCommits: proofInput.repair.hardeningCommits,
    hardeningScope: proofInput.repair.hardeningScope,
  } : null;
  const expectedRemotePolicy = proofInput.repair ? "absent" : "retained";
  const sameRecordedInput = manifest.status === "cleanup_partial" && manifest.cleanup_supersession_evidence?.remoteBranchPolicy === expectedRemotePolicy && proof?.source?.requestedHead === proofInput.sourceHead && proof?.carryForward?.prNumber === proofInput.carryForwardPr && proof?.carryForward?.requestedCommit === proofInput.carryForwardCommit && Array.isArray(proof?.scope?.paths) && JSON.stringify(proof.scope.paths) === JSON.stringify(proofInput.scope) && JSON.stringify(recordedRepair) === JSON.stringify(requestedRepair) && JSON.stringify(recordedClosedSourcePr) === JSON.stringify(requestedClosedSourcePr);
  if (proofInput.closedSourcePr) {
    if (!sameRecordedInput) return false;
    if (!liveEvidence) return true;
    return liveEvidence.carryForward?.mergeCommit?.oid === proofInput.carryForwardCommit && liveEvidence.currentBase?.status === "matched";
  }
  if (!sameRecordedInput || !proofInput.repair) return sameRecordedInput;

  // A first-use resume has no local targets left to bind it to the original
  // proof. Require the exact normalized PR base OID and canonical base head
  // that were persisted while the initial ready proof still had those targets.
  const recordedBaseRefOid = exactGitObjectIdOrNull(proof?.carryForward?.baseRefOid);
  const recordedCurrentBaseHead = exactGitObjectIdOrNull(proof?.currentBase?.headSha);
  if (!recordedBaseRefOid || !recordedCurrentBaseHead || recordedBaseRefOid !== recordedCurrentBaseHead) return false;
  if (!liveEvidence) return true;
  return liveEvidence.carryForward?.baseRefOid === recordedBaseRefOid && liveEvidence.currentBase?.headSha === recordedCurrentBaseHead;
}

function supersededCurrentBaseProof(manifest, carryForward, proofInput, cwd) {
  const baseBranch = String(proofInput.repair?.canonicalBase || manifest.base_branch || "").trim();
  const canonicalRef = baseBranch ? `origin/${baseBranch}` : "";
  const manifestRef = String(manifest.base_ref || "").trim();
  const base = { manifestRef: manifestRef || null, canonicalRef: canonicalRef || null, headSha: null, status: "unverified", scopeStatus: "unverified" };
  if (!baseBranch || (!proofInput.repair && manifestRef !== canonicalRef)) {
    return { ...base, status: "mismatch", reason: "source manifest base_ref must exactly name the canonical origin/<base_branch> ref" };
  }
  if (proofInput.repair && (!manifestRef || manifestRef === canonicalRef)) {
    return { ...base, status: "mismatch", reason: "first-use repair requires an explicitly stale legacy manifest base_ref distinct from canonical origin/dev" };
  }
  if (proofInput.repair) {
    if (String(manifest.base_branch || "").trim() === proofInput.repair.canonicalBase || manifestRef !== `origin/${String(manifest.base_branch || "").trim()}`) {
      return { ...base, status: "mismatch", reason: "first-use repair requires the deleted manifest base_ref to exactly match its noncanonical legacy base_branch" };
    }
    const legacyBase = supersededLegacyBaseAbsenceProof(manifestRef, cwd);
    if (legacyBase.status !== "matched") return { ...base, status: legacyBase.status, reason: legacyBase.reason, legacyBase };
    base.legacyBase = legacyBase;
  }
  const headSha = branchSha(canonicalRef, cwd);
  if (!headSha) {
    return { ...base, status: "blocked", reason: "current canonical base ref is unavailable locally" };
  }
  if (carryForward.baseRefOidError) {
    return { ...base, headSha, status: "blocked", reason: carryForward.baseRefOidError };
  }
  if (proofInput.repair) {
    let remoteHeadSha;
    try {
      remoteHeadSha = originBranchSha(baseBranch, cwd) || null;
    } catch (error) {
      return { ...base, headSha, status: "blocked", reason: `canonical origin/${baseBranch} evidence is unavailable: ${error.message}` };
    }
    if (remoteHeadSha !== headSha) {
      return { ...base, headSha, remoteHeadSha, status: "mismatch", reason: `local canonical ${canonicalRef} does not exactly match live origin/${baseBranch}` };
    }
    base.remoteHeadSha = remoteHeadSha;
  }
  if (!carryForward.baseRefOid || carryForward.baseRefOid !== headSha) {
    return { ...base, headSha, status: "mismatch", reason: "current canonical base head does not exactly match GitHub carry-forward PR base evidence" };
  }
  if (!gitCommitIsAncestor(proofInput.carryForwardCommit, canonicalRef, cwd) || (proofInput.repair && !carryForward.mergeCommit?.oid) || (proofInput.repair && !gitCommitIsAncestor(carryForward.mergeCommit.oid, canonicalRef, cwd))) {
    return { ...base, headSha, status: "mismatch", reason: "named carry-forward commit is not retained in the current canonical base" };
  }
  return { ...base, headSha, status: "matched", reason: proofInput.repair ? "canonical origin/dev retains the named merged successor despite the recorded legacy base migration" : "current canonical base exactly retains the named carry-forward commit" };
}

function supersededLegacyBaseAbsenceProof(manifestRef, cwd) {
  if (!manifestRef.startsWith("origin/") || manifestRef === "origin/") return { status: "mismatch", reason: "first-use repair requires a deleted origin/<branch> legacy manifest base_ref" };
  const legacyBranch = manifestRef.slice("origin/".length);
  try {
    assertSafeBranch(legacyBranch);
  } catch (error) {
    return { status: "mismatch", reason: `legacy manifest base_ref is unsafe: ${error.message}` };
  }
  if (branchSha(manifestRef, cwd)) return { status: "mismatch", reason: "first-use repair requires the legacy manifest base_ref to be absent locally" };
  try {
    if (originBranchSha(legacyBranch, cwd)) return { status: "mismatch", reason: "first-use repair requires the legacy manifest base_ref to be absent from origin" };
  } catch (error) {
    return { status: "blocked", reason: `legacy manifest base_ref absence is unavailable: ${error.message}` };
  }
  return { status: "matched", manifestRef, remoteState: "absent", localState: "absent" };
}

function supersededFirstUseHardeningProof(proofInput, carryForward, currentBase, cwd) {
  const repair = proofInput.repair;
  const mergeCommit = carryForward.mergeCommit?.oid;
  const headCommit = carryForward.headRefOid;
  if (!mergeCommit || !headCommit) return { status: "blocked", reason: "named merged PR is missing exact head or merge commit evidence" };
  const mergeHeadTree = git(["diff", "--quiet", headCommit, mergeCommit], { cwd });
  if (mergeHeadTree.code > 1) return { status: "blocked", reason: mergeHeadTree.stderr || mergeHeadTree.stdout || "cannot compare merged PR result to its named head tree" };
  if (mergeHeadTree.code !== 0) return { status: "mismatch", reason: "named merge commit contains tree changes not present at the named PR head" };
  const carryToMerge = scopedChangedPaths(proofInput.carryForwardCommit, mergeCommit, proofInput.scope, cwd);
  const allCarryToMerge = scopedChangedPaths(proofInput.carryForwardCommit, mergeCommit, [], cwd);
  const mergeToCanonical = compareScopedTreeEntries(mergeCommit, currentBase.canonicalRef, proofInput.scope, cwd);
  if (carryToMerge.error || allCarryToMerge.error || mergeToCanonical.status === "blocked") return { status: "blocked", reason: carryToMerge.error || allCarryToMerge.error || mergeToCanonical.reason || "cannot inspect bounded successor hardening" };
  if (mergeToCanonical.status !== "matched") return { status: "mismatch", reason: "current canonical scoped tree differs from the named merged PR tree", canonicalEntries: mergeToCanonical.carryForwardEntries };
  if (!sameStringList(carryToMerge.paths, repair.hardeningScope)) return { status: "mismatch", reason: "named successor hardening scope does not exactly cover carried-to-merged scoped differences", changedPaths: carryToMerge.paths, canonicalEntries: mergeToCanonical.carryForwardEntries };
  if (!sameStringList(allCarryToMerge.paths, repair.hardeningScope)) return { status: "mismatch", reason: "named successor hardening scope does not exactly cover every carried-to-merged PR difference", changedPaths: allCarryToMerge.paths, canonicalEntries: mergeToCanonical.carryForwardEntries };

  const lineage = gitCommitList(`${proofInput.carryForwardCommit}..${headCommit}`, cwd);
  if (lineage.error || lineage.commits.length === 0) return { status: "blocked", reason: lineage.error || "merged PR lineage after carried-forward commit is unavailable" };
  if (!sameStringSet(repair.hardeningCommits, lineage.commits)) return { status: "mismatch", reason: "named successor hardening commits do not exactly match the carried-to-PR-head lineage", lineageCommits: lineage.commits, canonicalEntries: mergeToCanonical.carryForwardEntries };
  for (const commit of repair.hardeningCommits) {
    if (!gitCommitIsAncestor(proofInput.carryForwardCommit, commit, cwd) || !gitCommitIsAncestor(commit, headCommit, cwd)) return { status: "mismatch", reason: "named successor hardening commit is outside the carried-to-PR-head lineage", canonicalEntries: mergeToCanonical.carryForwardEntries };
  }
  const lineagePaths = scopedChangedPathsForCommits(lineage.commits, [], cwd);
  if (lineagePaths.error || !sameStringList(lineagePaths.paths, repair.hardeningScope)) return { status: lineagePaths.error ? "blocked" : "mismatch", reason: lineagePaths.error || "successor hardening commits changed scope outside the explicit bounded hardening paths", changedPaths: lineagePaths.paths, canonicalEntries: mergeToCanonical.carryForwardEntries };
  return { status: "matched", changedPaths: carryToMerge.paths, lineageCommits: lineage.commits, canonicalEntries: mergeToCanonical.carryForwardEntries, carryForwardEntries: mergeToCanonical.sourceEntries, mergeCommit };
}

function scopedChangedPaths(left, right, scope, cwd) {
  const result = git(["diff", "--name-only", "--no-renames", "-z", left, right, "--", ...scope], { cwd });
  if (result.code !== 0) return { paths: [], error: result.stderr || result.stdout || "cannot inspect scoped path changes" };
  return { paths: [...new Set(String(result.stdout || "").split("\0").filter(Boolean))].sort() };
}

function gitCommitList(range, cwd) {
  const result = git(["rev-list", "--reverse", range], { cwd });
  if (result.code !== 0) return { commits: [], error: result.stderr || result.stdout || "cannot inspect commit lineage" };
  const commits = String(result.stdout || "").trim().split("\n").filter(Boolean);
  if (commits.some((commit) => !/^[a-f0-9]{40,64}$/i.test(commit))) return { commits: [], error: "commit lineage contains an invalid object id" };
  return { commits };
}

function scopedChangedPathsForCommits(commits, scope, cwd) {
  const paths = new Set();
  for (const commit of commits) {
    const result = git(["diff-tree", "--no-commit-id", "--name-only", "--no-renames", "-r", "-z", commit, "--", ...scope], { cwd });
    if (result.code !== 0) return { paths: [], error: result.stderr || result.stdout || `cannot inspect successor hardening commit ${commit}` };
    for (const path of String(result.stdout || "").split("\0").filter(Boolean)) paths.add(path);
  }
  return { paths: [...paths].sort() };
}

function sameStringList(left, right) {
  return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameStringSet(left, right) {
  return Array.isArray(left) && Array.isArray(right) && left.length === right.length && new Set(left).size === left.length && left.every((value) => right.includes(value));
}

function scopeCoversSourceDelta(baseRef, sourceHead, scope, cwd) {
  if (!baseRef || !branchSha(baseRef, cwd)) return false;
  const result = git(["diff", "--name-only", "--no-renames", "-z", `${baseRef}...${sourceHead}`], { cwd });
  if (result.code !== 0) return false;
  const changed = result.stdout.split("\0").filter(Boolean);
  return changed.length > 0 && changed.every((path) => scope.some((entry) => path === entry || path.startsWith(`${entry}/`)));
}

function supersededSourceHasPrEvidence(manifest) {
  return [
    manifest.pr_url,
    manifest.pr_number,
    manifest.pr_delivery_head_sha,
    manifest.pr_state,
    manifest.merged_at,
    manifest.pr_merged_at,
    manifest.cleanup_pr_number,
    manifest.cleanup_pr_url,
    manifest.cleanup_merged_at,
  ].some((value) => value !== null && value !== undefined && String(value).trim() !== "") || ["pr_open", "merged"].includes(String(manifest.status || ""));
}

function sourceBranchPullRequestProof(branch, cwd) {
  // This is an existence proof, not an inventory: one matching PR is enough
  // to block cleanup, so a one-record bound cannot hide a nonzero result.
  const result = run("gh", ["pr", "list", "--head", branch, "--state", "all", "--json", "number", "--limit", "1"], { cwd });
  if (result.code !== 0) {
    return { status: "blocked", count: null, reason: `source branch PR evidence is unavailable: ${result.stderr || result.stdout || "GitHub CLI failed"}` };
  }
  let pullRequests;
  try {
    pullRequests = parseGhJson(result.stdout, `source branch ${branch} PR evidence`);
  } catch (error) {
    return { status: "blocked", count: null, reason: error.message };
  }
  if (!Array.isArray(pullRequests)) {
    return { status: "blocked", count: null, reason: "source branch PR evidence is malformed" };
  }
  if (pullRequests.length > 0) {
    return { status: "blocked", count: pullRequests.length, reason: "source branch has GitHub PR evidence; cleanup-superseded accepts only no-PR source lanes" };
  }
  return { status: "matched", count: 0 };
}

function closedUnmergedSourcePr(prNumber, cwd) {
  const fields = "number,url,state,mergedAt,baseRefName,headRefName,headRefOid";
  const result = run("gh", ["pr", "view", String(prNumber), "--json", fields], { cwd });
  if (result.code !== 0) return { status: "blocked", reason: "closed source PR metadata is unavailable" };
  let parsed;
  try {
    parsed = parseGhJson(result.stdout, `closed source PR ${prNumber}`);
  } catch (error) {
    return { status: "blocked", reason: error.message };
  }
  const baseProof = carryForwardPrBaseRefOidFromGraphql(prNumber, cwd);
  const number = positiveSafePrNumberOrNull(parsed?.number);
  const headRefOid = exactGitObjectIdOrNull(parsed?.headRefOid);
  const baseRefOid = exactGitObjectIdOrNull(baseProof.baseRefOid);
  const status = number === prNumber && String(parsed?.state || "").toUpperCase() === "CLOSED" && !parsed?.mergedAt && headRefOid && baseRefOid && !baseProof.error
    ? "matched"
    : "mismatch";
  return {
    status,
    number,
    url: typeof parsed?.url === "string" ? parsed.url : null,
    state: typeof parsed?.state === "string" ? parsed.state : null,
    mergedAt: parsed?.mergedAt || null,
    baseRefName: typeof parsed?.baseRefName === "string" ? parsed.baseRefName : null,
    baseRefOid,
    headRefName: typeof parsed?.headRefName === "string" ? parsed.headRefName : null,
    headRefOid,
    reason: status === "matched" ? null : baseProof.error || "source PR must be the exact closed-unmerged PR with valid base and head identities",
  };
}

function closedPrPatchEquivalenceProof(manifest, proofInput, carryForward, sourcePr, cwd) {
  const requested = proofInput.closedSourcePr;
  const sourcePrNumber = positiveSafePrNumberOrNull(manifest.pr_number);
  if (sourcePrNumber !== requested.number) return { status: "mismatch", reason: "source manifest PR number does not exactly match --closed-source-pr" };
  if (sourcePr.status !== "matched") return { status: sourcePr.status === "blocked" ? "blocked" : "mismatch", reason: sourcePr.reason || "source PR closed-unmerged evidence did not match" };
  if (sourcePr.headRefName !== manifest.branch) return { status: "mismatch", reason: "source PR head branch does not exactly match the source manifest branch" };
  if (sourcePr.baseRefName !== manifest.base_branch) return { status: "mismatch", reason: "source PR base branch does not exactly match the source manifest base branch" };
  if (!carryForward?.mergedAt || String(carryForward.state || "").toUpperCase() !== "MERGED" || carryForward.mergeCommit?.oid !== proofInput.carryForwardCommit) {
    return { status: "mismatch", reason: "named carry-forward PR is not merged at the exact requested merge commit" };
  }
  if (String(carryForward.baseRefName || "") !== String(manifest.base_branch || "")) return { status: "mismatch", reason: "named carry-forward PR base does not exactly match the source base branch" };
  if (!sourcePr.baseRefOid || !sourcePr.headRefOid || !carryForward.baseRefOid || !carryForward.headRefOid || !gitCommitExists(sourcePr.baseRefOid, cwd) || !gitCommitExists(sourcePr.headRefOid, cwd) || !gitCommitExists(carryForward.baseRefOid, cwd) || !gitCommitExists(carryForward.headRefOid, cwd)) {
    return { status: "blocked", reason: "closed source or merged successor PR commit evidence is unavailable locally" };
  }
  if (!gitCommitIsAncestor(sourcePr.headRefOid, proofInput.sourceHead, cwd)) return { status: "mismatch", reason: "closed source PR head is not retained by the recorded source branch head" };
  const sourceCommits = gitFirstParentNonMergeCommitList(sourcePr.baseRefOid, sourcePr.headRefOid, cwd);
  const successorCommits = gitFirstParentNonMergeCommitList(carryForward.baseRefOid, carryForward.headRefOid, cwd);
  if (sourceCommits.error || successorCommits.error) return { status: "blocked", reason: sourceCommits.error || successorCommits.error };
  if (!sameStringList(sourceCommits.commits, requested.sourceCommits)) return { status: "mismatch", reason: "named source patch commits do not exactly match the closed source PR first-parent lineage", sourceCommits: sourceCommits.commits };
  if (!orderedCommitSubsequence(requested.carryForwardCommits, successorCommits.commits)) return { status: "mismatch", reason: "named carry-forward patch commits are not an ordered exact subset of the merged successor PR first-parent lineage", carryForwardCommits: successorCommits.commits };
  const tail = gitFirstParentCommits(sourcePr.headRefOid, proofInput.sourceHead, cwd);
  if (tail.error) return { status: "blocked", reason: tail.error };
  if (!tail.commits.every((commit) => gitMergeCommitHasNoResolutionDelta(commit, cwd))) return { status: "mismatch", reason: "source branch has a post-PR merge commit with an unproven resolution delta" };
  const patchIds = [];
  for (let index = 0; index < requested.sourceCommits.length; index += 1) {
    const sourcePatch = gitStablePatchId(requested.sourceCommits[index], cwd);
    const successorPatch = gitStablePatchId(requested.carryForwardCommits[index], cwd);
    if (sourcePatch.error || successorPatch.error) return { status: "blocked", reason: sourcePatch.error || successorPatch.error };
    if (sourcePatch.patchId !== successorPatch.patchId) return { status: "mismatch", reason: "source and successor patch IDs differ", pair: { source: requested.sourceCommits[index], carryForward: requested.carryForwardCommits[index] } };
    patchIds.push({ source: requested.sourceCommits[index], carryForward: requested.carryForwardCommits[index], patchId: sourcePatch.patchId });
  }
  return { status: "matched", sourcePr: requested.number, sourceCommits: requested.sourceCommits, carryForwardCommits: requested.carryForwardCommits, patchIds, sourceTailMergeCommits: tail.commits };
}

function orderedCommitSubsequence(expected, actual) {
  let next = 0;
  for (const commit of actual) {
    if (commit === expected[next]) next += 1;
  }
  return next === expected.length;
}

function closedPrPatchEquivalentCurrentBaseProof(manifest, carryForward, cwd) {
  const baseBranch = String(manifest.base_branch || "").trim();
  const canonicalRef = baseBranch ? `origin/${baseBranch}` : "";
  const localHeadSha = canonicalRef ? branchSha(canonicalRef, cwd) : null;
  if (!baseBranch || !localHeadSha) return { status: "blocked", canonicalRef: canonicalRef || null, reason: "current canonical base ref is unavailable locally" };
  let remoteHeadSha;
  try {
    remoteHeadSha = originBranchSha(baseBranch, cwd) || null;
  } catch (error) {
    return { status: "blocked", canonicalRef, headSha: localHeadSha, reason: `current canonical base remote evidence is unavailable: ${error.message}` };
  }
  if (remoteHeadSha !== localHeadSha) return { status: "mismatch", canonicalRef, headSha: localHeadSha, remoteHeadSha, reason: "local canonical base does not exactly match live origin evidence" };
  if (!carryForward?.mergeCommit?.oid || !gitCommitIsAncestor(carryForward.mergeCommit.oid, canonicalRef, cwd)) return { status: "mismatch", canonicalRef, headSha: localHeadSha, remoteHeadSha, reason: "named merged successor is not retained by the current canonical base" };
  return { status: "matched", canonicalRef, headSha: localHeadSha, remoteHeadSha, reason: "current canonical base retains the named merged successor" };
}

function gitFirstParentNonMergeCommitList(base, head, cwd) {
  const result = git(["rev-list", "--first-parent", "--reverse", "--no-merges", `${base}..${head}`], { cwd });
  if (result.code !== 0) return { commits: [], error: result.stderr || result.stdout || "cannot inspect first-parent non-merge lineage" };
  const commits = String(result.stdout || "").split(/\r?\n/).filter(Boolean);
  return commits.every((commit) => exactGitObjectIdOrNull(commit)) ? { commits } : { commits: [], error: "first-parent non-merge lineage contains an invalid object id" };
}

function gitFirstParentCommits(base, head, cwd) {
  const result = git(["rev-list", "--first-parent", "--reverse", `${base}..${head}`], { cwd });
  if (result.code !== 0) return { commits: [], error: result.stderr || result.stdout || "cannot inspect source post-PR lineage" };
  const commits = String(result.stdout || "").split(/\r?\n/).filter(Boolean);
  if (!commits.every((commit) => exactGitObjectIdOrNull(commit))) return { commits: [], error: "source post-PR lineage contains an invalid object id" };
  return { commits };
}

function gitMergeCommitHasNoResolutionDelta(commit, cwd) {
  const parents = gitCommitParents(commit, cwd);
  if (parents.length < 2) return false;
  const result = git(["diff-tree", "--cc", "--quiet", commit], { cwd });
  return result.code === 0;
}

function gitStablePatchId(commit, cwd) {
  const patch = git(["show", "--format=", "--binary", commit], { cwd, preserveStdout: true });
  if (patch.code !== 0) return { patchId: null, error: patch.stderr || patch.stdout || `cannot render patch for ${commit}` };
  const result = spawnSync("git", ["patch-id", "--stable"], { cwd, input: patch.stdout, encoding: "utf8", stdio: "pipe", timeout: defaultVerificationTimeoutMs });
  if (result.status !== 0) return { patchId: null, error: result.stderr || result.stdout || `cannot calculate stable patch ID for ${commit}` };
  const patchId = String(result.stdout || "").trim().split(/\s+/)[0] || "";
  return /^[a-f0-9]{40}$/i.test(patchId) ? { patchId: patchId.toLowerCase(), error: null } : { patchId: null, error: `stable patch ID for ${commit} is malformed` };
}

function supersededAssignmentGate(state, manifest, options, proofInput) {
  const assignmentId = String(manifest.source_assignment_id || "").trim();
  if (proofInput.repair?.mode === "first-use-legacy" && assignmentId) {
    return { status: "blocked", reason: "first-use legacy-unassigned repair requires the source manifest to have no source_assignment_id" };
  }
  if (!assignmentId) {
    if (proofInput.repair?.mode === "first-use-legacy" && proofInput.repair.legacyUnassigned === true) {
      const legacyUnassigned = supersededLegacyUnassignedProof(state, manifest);
      if (legacyUnassigned.status !== "matched") return legacyUnassigned;
      return { status: "matched", mode: "legacy-unassigned", assignmentId: null, owner: null, inventory: legacyUnassigned };
    }
    return { status: "blocked", reason: "source assignment evidence is required unless explicit first-use legacy-unassigned repair is selected" };
  }
  const path = assignmentPath(state, assignmentId);
  if (!existsSync(path)) return { status: "blocked", reason: `source assignment ${assignmentId} is missing` };
  try {
    const assignment = readAssignment(path);
    validateAssignment(assignment, path);
    if (assignment.status === "closed" && manifest.status !== "cleanup_partial") return { status: "blocked", reason: `source assignment ${assignmentId} is already closed` };
    if (supersededAssignmentHasPrEvidence(assignment)) return { status: "blocked", reason: `source assignment ${assignmentId} has PR or delivery evidence` };
    if (assignment.task_id !== manifest.task_id) return { status: "blocked", reason: `source assignment ${assignmentId} task does not exactly match source task` };
    const backlogItemId = String(assignment.source_backlog_item?.item_id || "").trim();
    if (backlogItemId && backlogItemId !== manifest.task_id) return { status: "blocked", reason: `source assignment ${assignmentId} backlog item does not exactly match source task` };
    const matchingWorktree = samePath(assignment.worktree_path, manifest.worktree_path) ||
      (manifest.status === "cleanup_partial" && sameAbsentPath(assignment.worktree_path, manifest.worktree_path));
    if (assignment.branch !== manifest.branch || !matchingWorktree) {
      return { status: "blocked", reason: `source assignment ${assignmentId} does not exactly match source branch and worktree` };
    }
    if (!String(assignment.owner || "").trim()) return { status: "blocked", reason: `source assignment ${assignmentId} owner is required` };
    if (assignment.owner !== manifest.owner && (!options.takeOwnership || !validTakeoverReason(options.takeoverReason))) {
      return { status: "blocked", reason: `source assignment ${assignmentId} owner does not match source lane owner` };
    }
    return { status: "matched", assignmentId, owner: assignment.owner || null };
  } catch (error) {
    return { status: "blocked", reason: `source assignment evidence is invalid: ${error.message}` };
  }
}

function supersededLegacyUnassignedProof(state, manifest) {
  if (!existsSync(state.assignmentsDir)) return { status: "matched", scanned: 0, matchingOpenAssignments: [] };
  const matchingOpenAssignments = [];
  const records = readdirSync(state.assignmentsDir).filter((name) => name.endsWith(".json")).sort((left, right) => left.localeCompare(right));
  for (const name of records) {
    const path = join(state.assignmentsDir, name);
    let assignment;
    try {
      assignment = readAssignment(path);
      validateAssignment(assignment, path);
    } catch (error) {
      return { status: "blocked", reason: `legacy-unassigned repair cannot verify assignment inventory: ${name}: ${error.message}` };
    }
    if (assignment.status === "closed") continue;
    if (assignment.task_id === manifest.task_id || assignment.source_backlog_item?.item_id === manifest.task_id || assignment.branch === manifest.branch || samePath(assignment.worktree_path, manifest.worktree_path)) {
      matchingOpenAssignments.push(assignment.assignment_id);
    }
  }
  if (matchingOpenAssignments.length > 0) return { status: "blocked", reason: `legacy-unassigned repair found matching open assignment evidence: ${matchingOpenAssignments.join(",")}` };
  return { status: "matched", scanned: records.length, matchingOpenAssignments };
}

function supersededManifestOwnerGate(manifest, options) {
  const owner = String(manifest.owner || "").trim();
  if (!owner && (!options.takeOwnership || !validTakeoverReason(options.takeoverReason))) {
    return { status: "blocked", reason: "source lane owner is required; use explicit --take-ownership with --takeover-reason for a legacy unowned lane" };
  }
  const warning = laneOwnerWarning(manifest, options);
  if (warning && !options.takeOwnership) return { status: "blocked", reason: warning };
  if ((warning || !owner) && !validTakeoverReason(options.takeoverReason)) {
    return { status: "blocked", reason: "--takeover-reason must explain the takeover in at least 10 non-whitespace characters" };
  }
  return { status: "matched", owner: owner || null, currentOwner: currentLaneOwner(options), takeover: Boolean(options.takeOwnership && owner !== currentLaneOwner(options)) };
}

function supersededAssignmentHasPrEvidence(assignment) {
  return [assignment.pr_url, assignment.pr_number, assignment.pr_state, assignment.merged_at, assignment.pr_merged_at, assignment.pr_delivery_head_sha].some((value) => value !== null && value !== undefined && String(value).trim() !== "");
}

function mergedCarryForwardPr(prNumber, cwd) {
  const modernFields = "number,url,mergedAt,state,baseRefName,baseRefOid,headRefOid,mergeCommit";
  const result = run("gh", ["pr", "view", String(prNumber), "--json", modernFields], { cwd });
  if (result.code === 0) {
    let carryForward;
    try {
      carryForward = parseGhJson(result.stdout, `carry-forward PR ${prNumber}`);
    } catch {
      return unavailableCarryForwardPrView("gh-pr-view", "carry-forward PR view returned invalid JSON");
    }
    const modernPrNumber = positiveSafePrNumberOrNull(carryForward?.number);
    if (modernPrNumber !== prNumber) {
      return {
        ...carryForward,
        baseRefOid: null,
        baseRefOidSource: "gh-pr-view",
        baseRefOidError: "carry-forward PR view did not return the exact requested positive safe integer PR number",
      };
    }
    return normalizeCarryForwardPrMetadata(carryForward, "gh-pr-view");
  }
  if (!ghRejectedBaseRefOidField(result)) return null;

  const legacyFields = "number,url,mergedAt,state,baseRefName,headRefOid,mergeCommit";
  const legacyResult = run("gh", ["pr", "view", String(prNumber), "--json", legacyFields], { cwd });
  if (legacyResult.code !== 0) return null;
  let carryForward;
  try {
    carryForward = parseGhJson(legacyResult.stdout, `carry-forward PR ${prNumber}`);
  } catch {
    return unavailableCarryForwardPrView("gh-pr-view-legacy", "legacy carry-forward PR view returned invalid JSON");
  }
  const legacyPrNumber = positiveSafePrNumberOrNull(carryForward?.number);
  if (legacyPrNumber !== prNumber) {
    return {
      ...carryForward,
      baseRefOid: null,
      baseRefOidSource: "gh-pr-view-legacy",
      baseRefOidError: "legacy carry-forward PR view did not return the exact requested positive safe integer PR number",
    };
  }
  const normalizedLineage = normalizeCarryForwardPrLineage(carryForward);
  if (normalizedLineage.lineageError) {
    return {
      ...normalizedLineage,
      baseRefOid: null,
      baseRefOidSource: "gh-pr-view-legacy",
      baseRefOidError: null,
    };
  }
  const baseProof = carryForwardPrBaseRefOidFromGraphql(prNumber, cwd);
  return {
    ...normalizedLineage,
    baseRefOid: baseProof.baseRefOid,
    baseRefOidSource: baseProof.source,
    baseRefOidError: baseProof.error || null,
  };
}

function unavailableCarryForwardPrView(baseRefOidSource, baseRefOidError) {
  return {
    number: null,
    url: null,
    mergedAt: null,
    state: null,
    baseRefName: null,
    headRefOid: null,
    mergeCommit: null,
    baseRefOid: null,
    baseRefOidSource,
    baseRefOidError,
    lineageError: null,
  };
}

function ghRejectedBaseRefOidField(result) {
  const message = `${result.stderr || ""}\n${result.stdout || ""}`;
  return /\bbaseRefOid\b/i.test(message) && /\b(?:unknown|unsupported|invalid)\s+(?:JSON\s+)?field\b/i.test(message);
}

function normalizeCarryForwardPrMetadata(carryForward, source) {
  const normalizedLineage = normalizeCarryForwardPrLineage(carryForward);
  const baseRefOid = exactGitObjectIdOrNull(carryForward?.baseRefOid);
  return {
    ...normalizedLineage,
    baseRefOid,
    baseRefOidSource: source,
    baseRefOidError: baseRefOid ? null : "carry-forward PR base head is missing or is not an exact Git object id",
  };
}

function normalizeCarryForwardPrLineage(carryForward) {
  const headRefOid = exactGitObjectIdOrNull(carryForward?.headRefOid);
  const mergeCommitOid = exactGitObjectIdOrNull(carryForward?.mergeCommit?.oid);
  const invalidFields = [
    !headRefOid ? "headRefOid" : null,
    !mergeCommitOid ? "mergeCommit.oid" : null,
  ].filter(Boolean);
  return {
    ...carryForward,
    headRefOid,
    mergeCommit: mergeCommitOid ? { oid: mergeCommitOid } : null,
    lineageError: invalidFields.length > 0
      ? `carry-forward PR lineage ${invalidFields.join(" and ")} is missing or is not an exact Git object id`
      : null,
  };
}

function positiveSafePrNumberOrNull(value) {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function carryForwardPrBaseRefOidFromGraphql(prNumber, cwd) {
  const repository = carryForwardGithubRepository(cwd);
  if (!repository) {
    return { baseRefOid: null, source: "gh-api-graphql", error: "GitHub repository identity is unavailable for carry-forward PR base lookup" };
  }
  const query = [
    "query($owner:String!,$name:String!,$number:Int!){",
    "repository(owner:$owner,name:$name){",
    "pullRequest(number:$number){number baseRefOid}",
    "}",
    "}",
  ].join("");
  const result = run(
    "gh",
    [
      "api",
      "graphql",
      "-f",
      `query=${query}`,
      "-F",
      `owner=${repository.owner}`,
      "-F",
      `name=${repository.name}`,
      "-F",
      `number=${prNumber}`,
    ],
    { cwd },
  );
  if (result.code !== 0) {
    return { baseRefOid: null, source: "gh-api-graphql", error: "GitHub GraphQL carry-forward PR base lookup failed" };
  }
  let parsed;
  try {
    parsed = parseGhJson(result.stdout, "carry-forward PR base lookup");
  } catch {
    return { baseRefOid: null, source: "gh-api-graphql", error: "GitHub GraphQL carry-forward PR base lookup returned invalid JSON" };
  }
  if (parsed?.errors !== undefined && !Array.isArray(parsed.errors)) {
    return { baseRefOid: null, source: "gh-api-graphql", error: "GitHub GraphQL carry-forward PR base lookup returned a malformed errors field" };
  }
  const errors = parsed?.errors || [];
  const pullRequest = parsed?.data?.repository?.pullRequest;
  if (errors.length > 0) {
    return { baseRefOid: null, source: "gh-api-graphql", error: `GitHub GraphQL carry-forward PR base lookup returned ${errors.length} error(s)` };
  }
  if (!pullRequest || positiveSafePrNumberOrNull(pullRequest.number) !== prNumber) {
    return { baseRefOid: null, source: "gh-api-graphql", error: "GitHub GraphQL carry-forward PR base lookup did not return the exact requested PR" };
  }
  const baseRefOid = exactGitObjectIdOrNull(pullRequest.baseRefOid);
  if (!baseRefOid) {
    return { baseRefOid: null, source: "gh-api-graphql", error: "GitHub GraphQL carry-forward PR base lookup omitted an exact Git object id" };
  }
  return { baseRefOid, source: "gh-api-graphql", error: null };
}

function carryForwardGithubRepository(cwd) {
  const result = run("gh", ["repo", "view", "--json", "owner,name"], { cwd });
  if (result.code !== 0) return null;
  try {
    const parsed = parseGhJson(result.stdout, "carry-forward repository metadata");
    const owner = typeof parsed?.owner === "string" ? parsed.owner : parsed?.owner?.login;
    const name = typeof parsed?.name === "string" ? parsed.name : "";
    return owner && name ? { owner, name } : null;
  } catch {
    return null;
  }
}

function exactGitObjectIdOrNull(value) {
  const normalized = String(value || "").trim();
  return /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(normalized) ? normalized.toLowerCase() : null;
}

function gitCommitExists(commit, cwd) {
  return git(["cat-file", "-e", `${commit}^{commit}`], { cwd }).code === 0;
}

function gitCommitIsAncestor(ancestor, descendant, cwd) {
  return git(["merge-base", "--is-ancestor", ancestor, descendant], { cwd }).code === 0;
}

function gitCommitParents(commit, cwd) {
  const result = git(["show", "-s", "--format=%P", commit], { cwd });
  if (result.code !== 0) return [];
  const parents = String(result.stdout || "").trim().split(/\s+/).filter(Boolean);
  return parents.every((parent) => /^[a-f0-9]{40,64}$/i.test(parent)) ? parents : [];
}

function compareScopedTreeEntries(sourceHead, carryForwardCommit, scope, cwd) {
  const sourceEntries = scopedTreeEntries(sourceHead, scope, cwd);
  const carryForwardEntries = scopedTreeEntries(carryForwardCommit, scope, cwd);
  if (sourceEntries.error || carryForwardEntries.error) {
    return { paths: scope, status: "blocked", sourceEntries: sourceEntries.entries || [], carryForwardEntries: carryForwardEntries.entries || [], reason: sourceEntries.error || carryForwardEntries.error };
  }
  const sourceSignature = JSON.stringify(sourceEntries.entries);
  const carryForwardSignature = JSON.stringify(carryForwardEntries.entries);
  // The object-entry comparison is the proof record. Keep Git's own scoped
  // tree comparison as an independent fail-closed guard against parser or
  // pathspec surprises, including deletes, modes, renames, and type changes.
  const scopedDiff = git(["diff", "--quiet", sourceHead, carryForwardCommit, "--", ...scope], { cwd });
  if (scopedDiff.code > 1) {
    return {
      paths: scope,
      status: "blocked",
      sourceEntries: sourceEntries.entries,
      carryForwardEntries: carryForwardEntries.entries,
      reason: scopedDiff.stderr || scopedDiff.stdout || "cannot compare scoped source and carry-forward trees",
    };
  }
  return {
    paths: scope,
    status: sourceSignature === carryForwardSignature && scopedDiff.code === 0 ? "matched" : "mismatch",
    sourceEntries: sourceEntries.entries,
    carryForwardEntries: carryForwardEntries.entries,
  };
}

function scopedTreeEntries(commit, scope, cwd) {
  const result = git(["ls-tree", "-r", "-z", "--full-tree", commit, "--", ...scope], { cwd });
  if (result.code !== 0) return { entries: [], error: result.stderr || result.stdout || `cannot inspect tree ${commit}` };
  const entries = [];
  for (const entry of String(result.stdout || "").split("\0").filter(Boolean)) {
    const tab = entry.indexOf("\t");
    const header = tab >= 0 ? entry.slice(0, tab).split(" ") : [];
    const path = tab >= 0 ? entry.slice(tab + 1) : "";
    if (header.length !== 3 || !/^\d+$/.test(header[0]) || !/^\w+$/.test(header[1]) || !/^[a-f0-9]+$/i.test(header[2]) || !path) {
      return { entries, error: `unexpected ls-tree entry for ${commit}` };
    }
    entries.push({ path, mode: header[0], type: header[1], objectId: header[2] });
  }
  entries.sort((left, right) => left.path.localeCompare(right.path));
  return { entries };
}

function cleanupSupersededPlanLines(plan) {
  return [
    `${plan.taskId}: superseded by merged PR #${plan.proof.carryForward.prNumber} at ${plan.proof.carryForward.mergeCommit}`,
    plan.proof.source.expectedRemoteState === "absent" ? `source head ${plan.expectedHeadSha} matches local ${plan.branch}; source remote absence verified` : `source head ${plan.expectedHeadSha} matches local and remote ${plan.branch}`,
    `scope (${plan.proof.scope.paths.join(", ")}): exact tree entries matched`,
    `owner ${plan.owner || "unowned"}; assignment ${plan.proof.assignment.assignmentId}`,
    `git worktree remove ${plan.worktreePath}`,
    `git update-ref -d refs/heads/${plan.branch} ${plan.expectedHeadSha}`,
    plan.proof.source.expectedRemoteState === "absent" ? `source remote origin/${plan.branch} was verified absent; do not create or mutate it` : `retain remote branch origin/${plan.branch}`,
    plan.proof.assignment.mode === "legacy-unassigned" ? `close manifest ${plan.taskId}; no source assignment exists to close` : `close manifest and source assignment ${plan.taskId}`,
  ];
}

function buildCleanupSupersededSummary({ state, plan, proofInput, currentOwner }) {
  return {
    generatedAt: new Date().toISOString(),
    stateRoot: state.root,
    currentOwner,
    mode: "cleanup-superseded",
    sourceTask: plan.taskId,
    requestedProof: proofInput,
    counts: { total: 1, cleanupReady: plan.status === "ready" ? 1 : 0, blocked: plan.status === "ready" ? 0 : 1 },
    results: [plan],
    mutation: "none; preview proof only",
    remoteBranchPolicy: plan.proof.source.expectedRemoteState === "absent" ? "source remote absence was verified; no remote mutation" : "remote branches are retained by cleanup-superseded",
  };
}

function applyCleanupSuperseded(state, plan, context) {
  withManifestLock(state, plan.taskId, () => {
    const manifest = readManifest(plan.manifestPath);
    validateManifest(manifest, plan.manifestPath);
    assertLaneOwner(manifest, context.options);
    claimLaneOwner(manifest, context.options);
    const assignmentId = String(manifest.source_assignment_id || "").trim();
    const runWithAssignmentLock = assignmentId
      ? (callback) => withAssignmentLock(state, assignmentId, callback)
      : plan.proof.assignment.mode === "legacy-unassigned" || context.proofInput.closedSourcePr
        ? (callback) => withAssignmentsIndexLock(state, callback)
        : (callback) => callback();
    return runWithAssignmentLock(() => {
    const freshPlan = cleanupSupersededPlan({ manifest, path: plan.manifestPath }, state, {
      options: context.options,
      proofInput: context.proofInput,
      currentOwner: currentLaneOwner(context.options),
    });
    if (freshPlan.status !== "ready") throw new Error(`${plan.taskId} supersession proof changed under lock: ${freshPlan.reason}`);
    if (!assignmentId && freshPlan.proof.assignment.mode !== "legacy-unassigned" && !context.proofInput.closedSourcePr) throw new Error("cleanup-superseded requires a linked assignment unless the locked proof is explicit legacy-unassigned repair or closed-PR patch-equivalence cleanup.");
    assertSupersededRemoteState(manifest, freshPlan.cleanupCwd, freshPlan.expectedHeadSha, freshPlan.proof.source.expectedRemoteState);
    if (assignmentId) {
      preflightAssignmentClosureForCleanedManifest(state, manifest, {
        ...context.options,
        requireNoPrEvidence: true,
        requireExactAssignmentIdentity: true,
        requireKnownAssignmentOwner: true,
      });
    }

    try {
      const appliedAt = new Date().toISOString();
      manifest.cleanup_started_at = manifest.cleanup_started_at || appliedAt;
      manifest.cleanup_owner = manifest.owner || null;
      manifest.cleanup_branch = manifest.branch;
      manifest.cleanup_expected_head_sha = freshPlan.expectedHeadSha;
      manifest.cleanup_local_branch_sha = freshPlan.localBranchSha;
      manifest.cleanup_remote_branch_sha = freshPlan.remoteBranchSha;
      manifest.cleanup_remote_branch_deleted_at = null;
      manifest.cleanup_remote_branch_policy = freshPlan.proof.source.expectedRemoteState === "absent"
        ? (context.proofInput.closedSourcePr ? "absent-closed-pr-patch-equivalent-cleanup" : "absent-first-use-superseded-cleanup")
        : "retained-superseded-cleanup";
      manifest.cleanup_supersession_evidence = {
        schemaVersion: 1,
        appliedAt,
        approval: String(context.options.approval).trim(),
        reason: String(context.options.reason).trim(),
        proof: freshPlan.proof,
        remoteBranchPolicy: freshPlan.proof.source.expectedRemoteState === "absent" ? "absent" : "retained",
        metadataOnly: true,
        rawPayloadRetained: false,
      };
      manifest.cleanup_supersession_rollback = freshPlan.proof.source.expectedRemoteState === "absent"
        ? `Restore local branch ${manifest.branch} at ${freshPlan.expectedHeadSha} and recreate ${manifest.worktree_path}; origin/${manifest.branch} was verified absent and remains untouched.`
        : `Restore local branch ${manifest.branch} at ${freshPlan.expectedHeadSha} and recreate ${manifest.worktree_path}; remote origin/${manifest.branch} is retained at the proven source head.`;
      appendTaskEvent(manifest, "cleanup_supersession_proved", `merged PR #${freshPlan.proof.carryForward.prNumber}; scope:${freshPlan.proof.scope.paths.join(",")}`);
      manifest.status = "cleanup_partial";
      manifest.cleanup_error = "superseded cleanup journal started; inspect recorded targets before resuming after interruption";
      manifest.updated_at = appliedAt;
      appendTaskEvent(manifest, "cleanup_journal_started", "durable superseded cleanup journal persisted before local target deletion");
      writeManifest(plan.manifestPath, manifest);

      removeWorktreeIfPresent(manifest, state, freshPlan.cleanupCwd);
      writeManifest(plan.manifestPath, manifest);
      deleteLocalBranchIfPresent(manifest, freshPlan.cleanupCwd, freshPlan.expectedHeadSha);
      writeManifest(plan.manifestPath, manifest);
      const targets = recordCleanupTargetEvidence(manifest, freshPlan.cleanupCwd, { deleteRemote: false });
      writeManifest(plan.manifestPath, manifest);
      assertCleanupTargetsAbsent(manifest, freshPlan.cleanupCwd, { deleteRemote: false });
      if (targets.remoteBranch.state !== "not-requested") throw new Error("superseded cleanup remote branch retention evidence is invalid");
      if (freshPlan.proof.source.expectedRemoteState === "absent") {
        manifest.cleanup_source_remote_absent_verified_at = new Date().toISOString();
        manifest.cleanup_source_remote_absent = assertSupersededRemoteState(manifest, freshPlan.cleanupCwd, freshPlan.expectedHeadSha, "absent");
        appendTaskEvent(manifest, "source_remote_absent_revalidated", manifest.branch);
      } else {
        manifest.cleanup_retained_remote_verified_at = new Date().toISOString();
        manifest.cleanup_retained_remote_branch_sha = assertSupersededRemoteState(manifest, freshPlan.cleanupCwd, freshPlan.expectedHeadSha, "present");
        appendTaskEvent(manifest, "retained_remote_revalidated", `${manifest.branch}@${manifest.cleanup_retained_remote_branch_sha}`);
      }

      manifest.status = "closed";
      manifest.closed_at = new Date().toISOString();
      manifest.updated_at = manifest.closed_at;
      manifest.cleanup_completed_at = manifest.closed_at;
      manifest.cleanup_error = null;
      const assignmentClosure = assignmentId ? closeAssignmentForCleanedManifest(state, manifest, {
        ...context.options,
        assignmentLockHeld: true,
        lastResult: `closed after superseded cleanup of ${manifest.task_id}`,
        eventMessage: `cleaned superseded workspace ${manifest.task_id}`,
      }) : null;
      if (assignmentClosure?.closed) {
        manifest.source_assignment_closed_at = assignmentClosure.closedAt;
        appendTaskEvent(manifest, "assignment_closed", assignmentClosure.assignmentId);
      }
      appendTaskEvent(manifest, "cleanup_supersession_applied", freshPlan.proof.source.expectedRemoteState === "absent" ? "local worktree and branch removed; source remote was proven absent and untouched" : "local worktree and branch removed; remote branch retained");
      appendTaskEvent(manifest, "closed", `cleaned superseded ${context.proofInput.closedSourcePr ? "closed-PR patch-equivalent" : "no-PR"} workspace carried by PR #${freshPlan.proof.carryForward.prNumber}`);
    } catch (error) {
      manifest.status = "cleanup_partial";
      manifest.cleanup_error = error.message;
      manifest.updated_at = new Date().toISOString();
      appendTaskEvent(manifest, "cleanup_partial", error.message);
      writeManifest(plan.manifestPath, manifest);
      throw error;
    }
    writeManifest(plan.manifestPath, manifest);
    });
  });
}

function assertSupersededRemoteState(manifest, cleanupCwd, expectedHeadSha, expectedRemoteState) {
  const actualHeadSha = originBranchSha(manifest.branch, cleanupCwd) || null;
  if (expectedRemoteState === "absent") {
    if (actualHeadSha !== null) throw new Error(`Source remote branch origin/${manifest.branch} is ${actualHeadSha}; explicit first-use repair requires it to remain absent.`);
    return "absent";
  }
  if (!actualHeadSha || actualHeadSha !== expectedHeadSha) {
    throw new Error(`Retained remote branch origin/${manifest.branch} head ${actualHeadSha || "absent"} does not match proven source head ${expectedHeadSha}.`);
  }
  return actualHeadSha;
}


function cleanupRepositoryRoot(worktreePath, state = null, validatedTarget = null) {
  if (state && !validatedTarget) {
    assertManagedWorktreePath(worktreePath, state);
  }
  const main = mainWorktreePath();
  if (main && !samePath(main, worktreePath) && existsSync(main)) {
    return main;
  }
  if (!samePath(repoRoot, worktreePath) && existsSync(repoRoot)) {
    return repoRoot;
  }
  throw new Error(`No stable repository worktree is available to clean up ${worktreePath}.`);
}

function worktreeCleanupStatus(manifest, cleanupCwd) {
  const exists = existsSync(manifest.worktree_path) && statSync(manifest.worktree_path).isDirectory();
  if (!exists) {
    return { exists: false, listed: worktreeListed(manifest.worktree_path, cleanupCwd), dirty: false };
  }
  const status = parseStatus(manifest.worktree_path);
  return { exists: true, listed: worktreeListed(manifest.worktree_path, cleanupCwd), dirty: status.any, status };
}

function cleanupMergedPlan(manifest, pr, options) {
  const localBranchSha = branchSha(manifest.branch, options.cleanupCwd);
  const remoteRequired = remoteCleanupTargetRequired(manifest, options.deleteRemote);
  const remoteBranchSha = remoteRequired ? originBranchSha(manifest.branch, options.cleanupCwd) : "";
  const expectedHeadSha = expectedCleanupHeadSha(manifest, pr);
  const lines = [
    `PR #${pr.number || manifest.pr_number || "unknown"} merged at ${pr.mergedAt}`,
    `expected head ${expectedHeadSha || "missing"}`,
    `owner ${manifest.owner || "unowned"}`,
    `local branch ${manifest.branch} (${localBranchSha || "absent"})`,
  ];
  if (remoteRequired) {
    lines.push(`remote branch origin/${manifest.branch} (${remoteBranchSha || "absent"})`);
  }
  lines.push(`clean generated artifacts under ${manifest.worktree_path}`);
  lines.push(`git worktree remove ${manifest.worktree_path}`);
  lines.push(`git branch -d ${manifest.branch}`);
  if (remoteRequired) {
    lines.push(`git push origin --delete ${manifest.branch}`);
  }
  return lines;
}

function cleanupMergedResources(manifest, state, options) {
  const cleanupStartedAt = new Date().toISOString();
  // Refresh target state immediately before resource mutation. The caller
  // already records a lock-acquisition snapshot for earlier holds; this one
  // captures the exact state before exact-head and deletion operations.
  const initialTargets = recordCleanupTargetEvidence(manifest, options.cleanupCwd, { deleteRemote: options.deleteRemote });
  assertCleanupTargetsInspectable(initialTargets);
  const expectedHeadSha = requireCleanupHeadSha(manifest, options.pr);
  const auditBlocker = cleanupDeliverySubagentAuditBlocker(manifest, options.pr);
  if (auditBlocker) {
    throw new Error(auditBlocker);
  }
  preflightCleanupBranchHeads(manifest, options.cleanupCwd, expectedHeadSha, options.deleteRemote);
  manifest.cleanup_started_at = manifest.cleanup_started_at || cleanupStartedAt;
  manifest.cleanup_owner = manifest.owner || null;
  manifest.cleanup_branch = manifest.branch;
  manifest.cleanup_expected_head_sha = expectedHeadSha;
  manifest.cleanup_pr_number = options.pr.number || manifest.pr_number || null;
  manifest.cleanup_pr_url = options.pr.url || manifest.pr_url || null;
  manifest.cleanup_merged_at = options.pr.mergedAt || manifest.merged_at || null;
  manifest.cleanup_local_branch_sha = branchSha(manifest.branch, options.cleanupCwd) || manifest.cleanup_local_branch_sha || null;
  if (options.deleteRemote) {
    manifest.cleanup_remote_branch_sha =
      originBranchSha(manifest.branch, options.cleanupCwd) || manifest.cleanup_remote_branch_sha || null;
  }
  try {
    removeWorktreeIfPresent(manifest, state, options.cleanupCwd);
    deleteLocalBranchIfPresent(manifest, options.cleanupCwd, expectedHeadSha);
    if (options.deleteRemote) {
      deleteRemoteBranchIfPresent(manifest, options.cleanupCwd, expectedHeadSha);
    }
  } finally {
    // Preserve exactly which registered targets remain if a later cleanup step
    // fails. This makes cleanup_partial safe to resume from a stable worktree.
    recordCleanupTargetEvidence(manifest, options.cleanupCwd, { deleteRemote: options.deleteRemote });
  }
}

function finalizeMergedCleanupResources(manifest, pr, options = {}) {
  const cleanupCompletedAt = new Date().toISOString();
  manifest.cleanup_completed_at = cleanupCompletedAt;
  manifest.cleanup_authority_decision = shapeCleanupAuthorityDecision(manifest, pr, {
    deleteRemote: Boolean(options.deleteRemote),
    decision: "applied",
    allowed: true,
    generatedAt: cleanupCompletedAt,
    evidenceRefs: [
      `task:${manifest.task_id}`,
      pr.number ? `pr:${pr.number}` : "",
      `expected-head:${manifest.cleanup_expected_head_sha}`,
    ],
  });
}

function cleanupTargetEvidence(manifest, cleanupCwd, options = {}) {
  const checkedAt = new Date().toISOString();
  const worktreeExists = existsSync(manifest.worktree_path);
  const worktreeListed = worktreeListedSafe(manifest.worktree_path, cleanupCwd);
  const localBranch = cleanupLocalTargetEvidence(manifest, cleanupCwd);
  const remote = cleanupRemoteTargetEvidence(manifest, cleanupCwd, Boolean(options.deleteRemote));
  return {
    checkedAt,
    worktree: {
      required: true,
      path: manifest.worktree_path,
      state: worktreeExists || worktreeListed ? "present" : "absent",
      exists: worktreeExists,
      listed: worktreeListed,
    },
    localBranch: {
      required: true,
      branch: manifest.branch,
      ...localBranch,
    },
    remoteBranch: remote,
  };
}

function cleanupLocalTargetEvidence(manifest, cleanupCwd) {
  const result = git(["rev-parse", "--verify", "--quiet", manifest.branch], { cwd: cleanupCwd });
  if (result.code === 0) {
    return { state: "present", sha: result.stdout || null, error: null };
  }
  // `rev-parse --verify --quiet` reports a genuinely absent ref as exit 1
  // with no output. Any other failure is an inspection failure, never absence.
  if (result.code === 1 && !result.stdout && !result.stderr) {
    return { state: "absent", sha: null, error: null };
  }
  return {
    state: "unknown",
    sha: null,
    error: (result.stderr || result.stdout || `git rev-parse exited ${result.code}`).slice(0, 500),
  };
}

function worktreeListedSafe(worktreePath, cleanupCwd) {
  const result = git(["worktree", "list", "--porcelain"], { cwd: cleanupCwd });
  if (result.code !== 0) {
    return true;
  }
  return parseWorktreePorcelain(result.stdout).some((record) => samePath(record.path, worktreePath));
}

function cleanupRemoteTargetEvidence(manifest, cleanupCwd, deleteRemote) {
  const required = remoteCleanupTargetRequired(manifest, deleteRemote);
  if (!required) {
    return {
      required: false,
      deleteRequested: false,
      branch: manifest.branch,
      state: "not-requested",
      sha: null,
      error: null,
    };
  }
  try {
    const sha = originBranchSha(manifest.branch, cleanupCwd);
    return {
      required: true,
      deleteRequested: Boolean(deleteRemote),
      branch: manifest.branch,
      state: sha ? "present" : "absent",
      sha: sha || null,
      error: null,
    };
  } catch (error) {
    return {
      required: true,
      deleteRequested: Boolean(deleteRemote),
      branch: manifest.branch,
      state: "unknown",
      sha: null,
      error: String(error.message || error).slice(0, 500),
    };
  }
}

function remoteCleanupTargetRequired(manifest, deleteRemote) {
  return Boolean(deleteRemote || manifest.cleanup_target_evidence?.remoteBranch?.required);
}

function cleanupRemoteResumeBlocker(manifest, deleteRemote) {
  const remote = manifest.cleanup_target_evidence?.remoteBranch;
  if (remote?.required && !deleteRemote && remote.state !== "absent") {
    return "Cleanup resume requires --delete-remote while a previously registered remote branch target remains.";
  }
  return "";
}

function recordCleanupTargetEvidence(manifest, cleanupCwd, options = {}) {
  const targets = cleanupTargetEvidence(manifest, cleanupCwd, options);
  manifest.cleanup_target_evidence = targets;
  appendTaskEvent(
    manifest,
    "cleanup_targets_checked",
    `worktree:${targets.worktree.state}; local_branch:${targets.localBranch.state}; remote_branch:${targets.remoteBranch.state}`,
  );
  return targets;
}

function assertCleanupTargetsAbsent(manifest, cleanupCwd, options = {}) {
  const targets = recordCleanupTargetEvidence(manifest, cleanupCwd, options);
  const remaining = [
    ["worktree", targets.worktree],
    ["local_branch", targets.localBranch],
    ["remote_branch", targets.remoteBranch],
  ].filter(([, target]) => target.required && target.state !== "absent");
  if (remaining.length) {
    throw new Error(`Cleanup cannot close manifest while registered targets remain: ${remaining.map(([name, target]) => `${name}:${target.state}`).join(", ")}.`);
  }
  return targets;
}

function assertCleanupTargetsInspectable(targets) {
  const unknown = [
    ["worktree", targets.worktree],
    ["local_branch", targets.localBranch],
    ["remote_branch", targets.remoteBranch],
  ].filter(([, target]) => target.required && target.state === "unknown");
  if (unknown.length) {
    throw new Error(`Cleanup cannot mutate while registered target inspection is unknown: ${unknown.map(([name]) => name).join(", ")}.`);
  }
}

function cleanupDeliverySubagentAuditBlocker(manifest, pr, context = {}) {
  const expectedHeadSha = expectedCleanupHeadSha(manifest, pr);
  const audit = shapeCleanupDeliverySubagentAuditEvidence(manifest, pr, context.options || {}, {
    expectedHeadSha,
    checkedAt: new Date().toISOString(),
  });
  return audit.blockers.length ? audit.blockers.join("; ") : "";
}

function shapeCleanupDeliverySubagentAuditEvidence(manifest, pr, options = {}, context = {}) {
  return shapeDeliverySubagentAuditEvidence(manifest, options, {
    ...context,
    expectedHeadSha: context.expectedHeadSha || expectedCleanupHeadSha(manifest, pr),
    acceptableStatuses: ["cleanup-ready"],
  });
}

function recordCleanupDeliverySubagentAudit(manifest, pr, options = {}) {
  const checkedAt = new Date().toISOString();
  const audit = shapeCleanupDeliverySubagentAuditEvidence(manifest, pr, options, { checkedAt });
  if (audit.blockers.length) {
    throw new Error(audit.blockers.join("; "));
  }
  manifest.delivery_subagent_audit = audit;
  manifest.delivery_subagent_audit_checked_at = checkedAt;
  appendTaskEvent(manifest, "cleanup_delivery_audit_revalidated", `${audit.status} ${audit.headSha || "unknown-head"}`);
}

function preflightCleanupBranchHeads(manifest, cleanupCwd, expectedHeadSha, deleteRemote) {
  assertExpectedBranchHead(`Local branch ${manifest.branch}`, branchSha(manifest.branch, cleanupCwd), expectedHeadSha);
  if (deleteRemote) {
    assertExpectedBranchHead(
      `Remote branch origin/${manifest.branch}`,
      originBranchSha(manifest.branch, cleanupCwd),
      expectedHeadSha,
    );
  }
}

function expectedCleanupHeadSha(manifest, pr) {
  return String(pr?.headRefOid || manifest.pr_delivery_head_sha || "").trim();
}

function requireCleanupHeadSha(manifest, pr) {
  const expectedHeadSha = expectedCleanupHeadSha(manifest, pr);
  if (!expectedHeadSha) {
    throw new Error("Cleanup requires exact PR head evidence before deleting lane branches.");
  }
  return expectedHeadSha;
}

function assertExpectedBranchHead(label, actualSha, expectedSha) {
  if (!actualSha) {
    return;
  }
  if (actualSha !== expectedSha) {
    throw new Error(`${label} head ${actualSha} does not match expected cleanup head ${expectedSha}.`);
  }
}

function removeWorktreeIfPresent(manifest, state, cleanupCwd) {
  const exists = existsSync(manifest.worktree_path);
  const listed = worktreeListed(manifest.worktree_path, cleanupCwd);
  if (!exists && listed) {
    runChecked("git", ["worktree", "prune"], { cwd: cleanupCwd });
  }
  const wasPresent = exists || listed;
  if (wasPresent) {
    if (exists) {
      removeWorktree(manifest.worktree_path, state, { cwd: cleanupCwd });
      appendTaskEvent(manifest, "worktree_removed", manifest.worktree_path);
    } else {
      appendTaskEvent(manifest, "worktree_registration_pruned", manifest.worktree_path);
    }
  } else {
    appendTaskEvent(manifest, "worktree_already_absent", manifest.worktree_path);
  }
  if (existsSync(manifest.worktree_path) || worktreeListed(manifest.worktree_path, cleanupCwd)) {
    throw new Error(`Worktree still exists after cleanup: ${manifest.worktree_path}`);
  }
  manifest.worktree_removed_at = manifest.worktree_removed_at || new Date().toISOString();
}

function deleteLocalBranchIfPresent(manifest, cleanupCwd, expectedHeadSha) {
  const localSha = branchSha(manifest.branch, cleanupCwd);
  assertExpectedBranchHead(`Local branch ${manifest.branch}`, localSha, expectedHeadSha);
  if (localSha) {
    const branchDelete = git(["update-ref", "-d", `refs/heads/${manifest.branch}`, expectedHeadSha], { cwd: cleanupCwd });
    if (branchDelete.code !== 0) {
      throw new Error(branchDelete.stderr || branchDelete.stdout);
    }
    appendTaskEvent(manifest, "local_branch_deleted", manifest.branch);
  } else {
    appendTaskEvent(manifest, "local_branch_already_absent", manifest.branch);
  }
  if (branchExists(manifest.branch, cleanupCwd)) {
    throw new Error(`Local branch still exists after cleanup: ${manifest.branch}`);
  }
  manifest.local_branch_deleted_at = manifest.local_branch_deleted_at || new Date().toISOString();
}

function deleteRemoteBranchIfPresent(manifest, cleanupCwd, expectedHeadSha) {
  const remoteSha = originBranchSha(manifest.branch, cleanupCwd);
  assertExpectedBranchHead(`Remote branch origin/${manifest.branch}`, remoteSha, expectedHeadSha);
  if (remoteSha) {
    runChecked(
      "git",
      ["push", `--force-with-lease=refs/heads/${manifest.branch}:${expectedHeadSha}`, "origin", `:refs/heads/${manifest.branch}`],
      { cwd: cleanupCwd },
    );
    appendTaskEvent(manifest, "remote_branch_deleted", manifest.branch);
  } else {
    appendTaskEvent(manifest, "remote_branch_already_absent", manifest.branch);
  }
  if (originBranchSha(manifest.branch, cleanupCwd)) {
    throw new Error(`Remote branch still exists after cleanup: origin/${manifest.branch}`);
  }
  manifest.remote_branch_deleted_at = manifest.remote_branch_deleted_at || new Date().toISOString();
}

function cleanupOrphans(argv) {
  const { positional, options } = parseOptions(argv);
  const state = workspaceState(options);
  const query = positional.join(" ").trim().toLowerCase();
  const apply = Boolean(options.apply);
  if (options.summaryJson && apply) {
    throw new Error("cleanup-orphans --summary-json is only supported without --apply.");
  }

  const managedRoot = assertManagedWorktreeRoot(state);
  const entries = readdirSync(managedRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isSymbolicLink()) {
      throw new Error(`Refusing to inspect managed worktree root: ${state.worktreesDir} (cleanup target must not be a symlink: ${entry.name}).`);
    }
  }
  const directoryEntries = entries.filter((entry) => entry.isDirectory());
  const hiddenMetadataSkipped = directoryEntries.filter((entry) => hiddenWorkspaceMetadataEntry(entry.name)).length;
  const directories = directoryEntries
    .filter((entry) => !hiddenWorkspaceMetadataEntry(entry.name))
    .map((entry) => join(managedRoot, entry.name))
    .map((worktreePath) => {
      assertManagedWorktreePath(worktreePath, state);
      return worktreePath;
    })
    .filter((worktreePath) => !worktreeListed(worktreePath))
    .filter((worktreePath) => !query || basename(worktreePath).toLowerCase().includes(query));

  if (options.summaryJson) {
    console.log(
      JSON.stringify(
        buildCleanupOrphansSummary({ state, query, all: Boolean(options.all), directories, hiddenMetadataSkipped }),
        null,
        2,
      ),
    );
    return;
  }

  if (directories.length === 0) {
    console.log(query ? `No orphan worktree directories matched: ${query}` : "No orphan worktree directories found.");
    return;
  }
  if (!query && !options.all) {
    printPlan("cleanup-orphans", directories.map((worktreePath) => `orphan directory: ${worktreePath}`));
    console.log("Pass a query to target one orphan, or pass --all to include every orphan directory.");
    console.log("Add --apply to remove matched orphan directories.");
    return;
  }

  const plan = directories.flatMap((worktreePath) => [
    `clean generated artifacts under ${worktreePath}`,
    `remove orphan directory ${worktreePath}`,
  ]);

  if (options.dryRun || !apply) {
    printPlan("cleanup-orphans", plan);
    if (!apply) {
      console.log("Add --apply to remove matched orphan directories.");
    }
    return;
  }

  for (const worktreePath of directories) {
    removeManagedDirectory(worktreePath, state);
    console.log(`Removed orphan directory ${worktreePath}`);
  }
}

function buildCleanupOrphansSummary({ state, query, all, directories, hiddenMetadataSkipped }) {
  return {
    generatedAt: new Date().toISOString(),
    worktreesDir: state.worktreesDir,
    query: query || null,
    all,
    counts: {
      matchedOrphans: directories.length,
      hiddenMetadataSkipped,
    },
    orphanDirectories: directories.slice(0, 10).map((worktreePath) => ({
      name: basename(worktreePath),
      path: worktreePath,
    })),
    orphanDirectoriesTruncated: directories.length > 10,
    requiresTarget: directories.length > 0 && !query && !all,
    mutation: "none; summary only",
  };
}

function hiddenWorkspaceMetadataEntry(name) {
  return String(name || "").startsWith(".");
}

function cleanupBranches(argv) {
  const { positional, options } = parseOptions(argv);
  const query = positional.join(" ").trim().toLowerCase();
  const apply = Boolean(options.apply);
  const baseRef = String(options.base || cleanupBranchesDefaultBaseRef);
  if (options.summaryJson && apply) {
    throw new Error("cleanup-branches --summary-json is only supported without --apply.");
  }

  if (!refExists(baseRef)) {
    throw new Error(`Base ref not found locally: ${baseRef}`);
  }
  const baseSha = git(["rev-parse", "--short", baseRef], { cwd: repoRoot }).stdout.trim() || "unknown";
  if (!options.summaryJson) {
    console.log(`Base: ${baseRef} (${baseSha})`);
  }

  const branches = localCodexBranches().filter((branch) => !query || branch.toLowerCase().includes(query));
  if (branches.length === 0) {
    if (options.summaryJson) {
      console.log(JSON.stringify(buildCleanupBranchesSummary({ baseRef, baseSha, query, branches, eligible: [], skipped: [] }), null, 2));
      return;
    }
    console.log(query ? `No local codex/* branches matched: ${query}` : "No local codex/* branches found.");
    return;
  }

  const activeWorktreeBranches = new Set(
    parseWorktreePorcelain(git(["worktree", "list", "--porcelain"], { cwd: repoRoot }).stdout || "")
      .map((record) => record.branch?.replace(/^refs\/heads\//, ""))
      .filter(Boolean),
  );
  const eligible = [];
  const skipped = [];

  for (const branch of branches) {
    assertSafeBranch(branch);
    if (activeWorktreeBranches.has(branch)) {
      skipped.push({ branch, reason: "branch is checked out in a worktree" });
      if (!options.summaryJson) {
        console.log(`SKIP ${branch}: branch is checked out in a worktree.`);
      }
      continue;
    }

    const safety = branchCleanupSafety(branch, baseRef);
    if (!safety.safe) {
      skipped.push({ branch, reason: safety.reason });
      if (!options.summaryJson) {
        console.log(`SKIP ${branch}: ${safety.reason}`);
      }
      continue;
    }
    eligible.push({ branch, reason: safety.reason });
  }

  if (options.summaryJson) {
    console.log(JSON.stringify(buildCleanupBranchesSummary({ baseRef, baseSha, query, branches, eligible, skipped }), null, 2));
    return;
  }

  if (eligible.length === 0) {
    console.log(query ? `No safe local codex/* branch cleanup matched: ${query}` : "No safe local codex/* branch cleanup found.");
    return;
  }

  const plan = eligible.map(({ branch, reason }) => `delete local branch ${branch} (${reason})`);
  if (options.dryRun || !apply) {
    printPlan("cleanup-branches", plan);
    if (!apply) {
      console.log("Add --apply to delete the safe local branches.");
    }
    return;
  }

  for (const { branch } of eligible) {
    runChecked("git", ["branch", "-D", branch], { cwd: repoRoot });
    console.log(`Deleted local branch ${branch}`);
  }
  console.log(`Deleted ${eligible.length} safe local codex/* branch(es).`);
}

function buildCleanupBranchesSummary({ baseRef, baseSha, query, branches, eligible, skipped }) {
  return {
    generatedAt: new Date().toISOString(),
    baseRef,
    baseSha,
    query: query || null,
    counts: {
      total: branches.length,
      safe: eligible.length,
      skipped: skipped.length,
    },
    skippedReasonCounts: countByField(skipped, "reason"),
    safeBranches: eligible.slice(0, 10),
    safeBranchesTruncated: eligible.length > 10,
    skippedBranches: skipped.slice(0, 10),
    skippedBranchesTruncated: skipped.length > 10,
    mutation: "none; summary only",
  };
}

function rebuildIndex(argv) {
  const { options } = parseOptions(argv);
  const state = workspaceState(options);
  const worktrees = git(["worktree", "list", "--porcelain"], { cwd: repoRoot });
  if (worktrees.code !== 0) {
    throw new Error(worktrees.stderr || "Could not list Git worktrees.");
  }

  const records = parseWorktreePorcelain(worktrees.stdout)
    .filter((record) => record.branch && record.path && !samePath(record.path, mainWorktreePath()))
    .filter((record) => record.branch.startsWith("refs/heads/codex/"));

  if (records.length === 0) {
    if (options.summaryJson) {
      console.log(JSON.stringify(buildRebuildIndexSummary({ state, records, planned: [], skipped: [] }), null, 2));
      return;
    }
    console.log("No Codex worktrees found to index.");
    return;
  }

  if (!options.summaryJson) {
    mkdirSync(state.tasksDir, { recursive: true });
  }
  const existingManifests = readManifests(state).map(({ manifest }) => manifest);
  const planned = [];
  const skipped = [];
  for (const record of records) {
    const branch = record.branch.replace(/^refs\/heads\//, "");
    const existingManifest = existingManifests.find(
      (manifest) => manifest.branch === branch || samePath(manifest.worktree_path, record.path),
    );
    if (existingManifest) {
      skipped.push({
        branch,
        path: record.path,
        reason: "existing manifest already indexes worktree",
        taskId: existingManifest.task_id,
      });
      if (options.summaryJson) {
        continue;
      }
      console.log(`SKIP ${existingManifest.task_id}: manifest already indexes ${record.path}.`);
      continue;
    }

    const slug = slugify(branch.replace(/^codex\//, ""));
    const taskId = uniqueTaskId(state.tasksDir, `${dateStamp()}-${slug}`);
    const manifestPath = join(state.tasksDir, `${taskId}.json`);
    if (existsSync(manifestPath)) {
      skipped.push({ branch, path: record.path, reason: "manifest path already exists", taskId });
      if (options.summaryJson) {
        continue;
      }
      console.log(`SKIP ${taskId}: manifest already exists.`);
      continue;
    }

    const manifest = {
      schema_version: 1,
      task_id: taskId,
      title: titleFromDescription(slug.replace(/-/g, " ")),
      description: `Rebuilt from Git worktree ${record.path}`,
      repo_name: workspaceKey(),
      repo_root: repoRoot,
      state_root: state.root,
      base_branch: rebuildIndexBaseBranch,
      base_ref: rebuildIndexBaseBranch,
      branch,
      worktree_path: record.path,
      status: "active",
      owner: null,
      owner_thread_id: null,
      owner_acquired_at: null,
      owner_updated_at: null,
      pr_url: null,
      pr_number: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_verified_at: null,
      last_verification_command: null,
      last_commit: record.head || null,
      events: [taskEvent("rebuilt", "manifest rebuilt from git worktree list")],
    };
    reconcileManifest(manifest, { refreshPr: true });
    planned.push({ taskId, branch, path: record.path, manifestPath, head: record.head || null });

    if (options.summaryJson) {
      continue;
    }

    if (options.dryRun) {
      printPlan(`rebuild-index ${taskId}`, [`write ${manifestPath}`]);
      printManifestSummary(manifest);
      continue;
    }

    withManifestLock(state, taskId, () => writeManifest(manifestPath, manifest));
    console.log(`Rebuilt manifest ${taskId}`);
  }

  if (options.summaryJson) {
    console.log(JSON.stringify(buildRebuildIndexSummary({ state, records, planned, skipped }), null, 2));
  }
}

function buildRebuildIndexSummary({ state, records, planned, skipped }) {
  return {
    generatedAt: new Date().toISOString(),
    tasksDir: state.tasksDir,
    counts: {
      totalCodexWorktrees: records.length,
      planned: planned.length,
      skipped: skipped.length,
    },
    skippedReasonCounts: countByField(skipped, "reason"),
    plannedManifests: planned.slice(0, 10),
    plannedManifestsTruncated: planned.length > 10,
    skippedWorktrees: skipped.slice(0, 10),
    skippedWorktreesTruncated: skipped.length > 10,
    mutation: "none; summary only",
  };
}

function assertBaseCheckoutRecoveryClearForDelivery(state) {
  const markerPath = baseCheckoutRecoveryMarkerPath(state);
  const recoveryMarker = readBaseCheckoutRecoveryMarker(markerPath);
  const recovery = inspectBaseCheckoutRecovery(baseCheckoutRecoveryInput(state, recoveryMarker), { cwd: repoRoot });
  if (recovery.status !== "clear") {
    throw new Error(`Base Checkout recovery prevents delivery (${recovery.reasonCode}). ${recovery.nextSafeAction}`);
  }
  return recovery;
}

function baseCheckoutRecoveryInput(state, recoveryMarker) {
  const managedWorktreePaths = readManifests(state)
    .map((record) => record.manifest)
    .filter((manifest) => manifest.status !== "closed" && typeof manifest.worktree_path === "string" && manifest.worktree_path.length > 0)
    .map((manifest) => manifest.worktree_path);
  return { recoveryMarker, managedWorktreePaths };
}

function doctor(argv) {
  const { options } = parseOptions(argv);
  const requiresRecoveryMarkerWrite = options.breakGlass === true || options.resolveBreakGlass === true;
  const state = requiresRecoveryMarkerWrite
    ? assertWorkspaceStateStorage(options, { repoRoot }).state
    : workspaceState(options);
  const findings = [];
  if (options.breakGlass === true && options.resolveBreakGlass === true) {
    throw new Error("doctor --break-glass and --resolve-break-glass cannot be used together.");
  }

  const markerPath = baseCheckoutRecoveryMarkerPath(state);
  let recoveryMarker = readBaseCheckoutRecoveryMarker(markerPath);
  let baseCheckoutRecovery = inspectBaseCheckoutRecovery(baseCheckoutRecoveryInput(state, recoveryMarker), { cwd: repoRoot });
  let recoveryMutation = "none; inspection only";
  if (options.breakGlass === true) {
    if (!baseCheckoutRecovery.checkout) {
      throw new Error("Cannot record Base Checkout break-glass recovery without trusted checkout metadata.");
    }
    recoveryMarker = activeBreakGlassMarker(baseCheckoutRecovery.checkout);
    writeJsonAtomic(markerPath, recoveryMarker);
    baseCheckoutRecovery = inspectBaseCheckoutRecovery(baseCheckoutRecoveryInput(state, recoveryMarker), { cwd: repoRoot });
    recoveryMutation = "metadata-only break-glass recovery marker recorded";
  } else if (options.resolveBreakGlass === true) {
    const resolution = boundedRecoveryResolution(options.resolution);
    if (!resolution) throw new Error("doctor --resolve-break-glass requires --resolution with at least 10 non-whitespace characters.");
    if (!isActiveBreakGlassMarker(recoveryMarker)) throw new Error("No active Base Checkout break-glass recovery marker is available to resolve.");
    recoveryMarker = {
      ...recoveryMarker,
      status: "resolved",
      resolvedAt: new Date().toISOString(),
      resolution,
    };
    writeJsonAtomic(markerPath, recoveryMarker);
    baseCheckoutRecovery = inspectBaseCheckoutRecovery(baseCheckoutRecoveryInput(state, recoveryMarker), { cwd: repoRoot });
    recoveryMutation = "metadata-only break-glass recovery marker resolved";
  }

  collectCommand(findings, "git", ["--version"]);
  collectCommand(findings, "node", ["--version"]);
  collectCommand(findings, "gh", ["--version"], { optional: true });

  const inside = git(["rev-parse", "--is-inside-work-tree"], { cwd: repoRoot });
  addFinding(findings, inside.code === 0 && inside.stdout.trim() === "true", "Repository worktree detected.");

  const origin = git(["remote", "get-url", "origin"], { cwd: repoRoot });
  addFinding(findings, origin.code === 0, origin.code === 0 ? "origin remote configured." : "origin remote missing.");

  const hooksPath = git(["config", "--get", "core.hooksPath"], { cwd: repoRoot });
  addFinding(
    findings,
    hooksPath.stdout.trim() === ".githooks",
    hooksPath.stdout.trim() === ".githooks"
      ? "core.hooksPath is .githooks."
      : "core.hooksPath is not .githooks.",
  );

  const prunableWorktrees = prunableGitWorktrees(repoRoot);
  if (prunableWorktrees.length === 0) {
    addFinding(findings, true, "No prunable git worktree registrations detected.");
  } else {
    for (const worktreePath of prunableWorktrees) {
      addFinding(
        findings,
        false,
        "",
        `Prunable git worktree registration blocks branch cleanup: ${worktreePath}. Run git worktree prune before retrying branch cleanup.`,
        true,
      );
    }
  }

  addFinding(findings, existsSync(join(repoRoot, ".githooks", "pre-push")), "pre-push guard exists.");
  addFinding(
    findings,
    existsSync(state.root),
    `state root exists: ${state.root}`,
    "state root does not exist yet; it will be created by the first `start` command.",
    true,
  );

  const manifests = readManifests(state);
  for (const { manifest } of manifests) {
    const worktreeOk = existsSync(manifest.worktree_path);
    addFinding(
      findings,
      worktreeOk || manifest.status === "closed",
      `${manifest.task_id}: worktree state is consistent.`,
      `${manifest.task_id}: worktree path missing for non-closed task.`,
    );
  }

  if (options.summaryJson) {
    console.log(JSON.stringify(buildDoctorSummary({ state, findings, baseCheckoutRecovery, recoveryMutation }), null, 2));
  } else {
    for (const finding of findings) {
      console.log(`${finding.ok ? "OK" : finding.optional ? "WARN" : "FAIL"}: ${finding.message}`);
    }
    if (baseCheckoutRecovery.status === "recovery_required") {
      console.log(`WARN: Base Checkout recovery needed: ${baseCheckoutRecovery.reasonCode}. ${baseCheckoutRecovery.nextSafeAction}`);
    } else if (baseCheckoutRecovery.status === "inspection_unknown") {
      console.log(`WARN: Base Checkout recovery inspection unavailable. ${baseCheckoutRecovery.nextSafeAction}`);
    }
  }

  if (findings.some((finding) => !finding.ok && !finding.optional)) {
    process.exit(1);
  }
}

function buildDoctorSummary({ state, findings, baseCheckoutRecovery = null, recoveryMutation = "none; inspection only" }) {
  const failures = findings.filter((finding) => !finding.ok && !finding.optional);
  const warnings = findings.filter((finding) => !finding.ok && finding.optional);
  const ok = findings.filter((finding) => finding.ok);
  return {
    generatedAt: new Date().toISOString(),
    stateRoot: state.root,
    status: failures.length > 0 ? "fail" : warnings.length > 0 ? "warn" : "ok",
    counts: {
      total: findings.length,
      ok: ok.length,
      warnings: warnings.length,
      failures: failures.length,
    },
    failures: failures.slice(0, 10),
    failuresTruncated: failures.length > 10,
    warnings: warnings.slice(0, 10),
    warningsTruncated: warnings.length > 10,
    okFindings: ok.slice(0, 10),
    okFindingsTruncated: ok.length > 10,
    baseCheckoutRecovery,
    mutation: recoveryMutation === "none; inspection only" ? "none; summary only" : recoveryMutation,
  };
}

function baseCheckoutRecoveryMarkerPath(state) {
  return join(state.root, "recovery", "base-checkout.json");
}

function readBaseCheckoutRecoveryMarker(path) {
  if (!existsSync(path)) return null;
  try {
    const value = JSON.parse(readFileSync(path, "utf8"));
    return value && typeof value === "object" && !Array.isArray(value) ? value : { status: "invalid" };
  } catch {
    return { status: "invalid" };
  }
}

function activeBreakGlassMarker(checkout) {
  return {
    schema_version: 1,
    status: "active",
    reasonCode: "recovery.break_glass_edit",
    recordedAt: new Date().toISOString(),
    checkout: {
      identity: checkout.identity,
      path: checkout.path,
      branch: checkout.branch,
      head: checkout.head,
      changedPathCount: checkout.changedPathCount,
    },
    mutation: "metadata-only recovery marker",
  };
}

function isActiveBreakGlassMarker(marker) {
  return marker?.status === "active"
    && marker.reasonCode === "recovery.break_glass_edit"
    && typeof marker.recordedAt === "string"
    && marker.recordedAt.length > 0;
}

function boundedRecoveryResolution(value) {
  const normalized = String(value || "").trim().replace(/\s+/g, " ");
  return normalized.replace(/\s/g, "").length >= 10 ? normalized.slice(0, 256) : null;
}

function readManifests(state) {
  return readManifestRecords(state)
    .map((record) => {
      if (record.error) {
        return record;
      }
      const path = record.path;
      try {
        const manifest = record.manifest;
        validateManifest(manifest, path);
        reconcileManifest(manifest);
        return { path, manifest };
      } catch (error) {
        return { path, error };
      }
    })
    .filter((record) => {
      if (record.error) {
        console.error(`WARN: skipping invalid manifest ${record.path}: ${record.error.message}`);
        return false;
      }
      return true;
    })
    .sort((left, right) => left.manifest.task_id.localeCompare(right.manifest.task_id));
}

function readCleanupManifests(state) {
  return readManifestRecords(state)
    .map((record) => {
      if (record.error) return record;
      try {
        validateManifest(record.manifest, record.path);
        return record;
      } catch (error) {
        return { path: record.path, error };
      }
    })
    .filter((record) => {
      if (!record.error) return true;
      console.error(`WARN: skipping invalid cleanup manifest ${record.path}: ${record.error.message}`);
      return false;
    })
    .sort((left, right) => left.manifest.task_id.localeCompare(right.manifest.task_id));
}

function findCleanupManifest(state, query, options = {}) {
  const manifests = readCleanupManifests(state);
  if (manifests.length === 0) {
    throw new Error(`No Codex workspace manifests found under ${state.tasksDir}`);
  }

  if (options.preferCurrentWorktree) {
    const currentRoot = currentGitRoot();
    const current = manifests.find((record) => samePath(record.manifest.worktree_path, currentRoot));
    if (current && !query.trim()) return current;
  }

  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    const active = manifests.filter((record) => record.manifest.status !== "closed");
    if (active.length === 1) return active[0];
    throw new Error("Specify a task query; multiple active workspaces exist.");
  }

  const searchableValues = (manifest) =>
    [manifest.task_id, manifest.title, manifest.description, manifest.branch].filter(Boolean);
  const exactMatches = manifests.filter(({ manifest }) =>
    searchableValues(manifest).some((value) => String(value).toLowerCase() === normalized),
  );
  if (exactMatches.length === 1) return exactMatches[0];
  if (exactMatches.length > 1) {
    throw new Error(`Query matched multiple workspaces: ${exactMatches.map((match) => match.manifest.task_id).join(", ")}`);
  }

  const matches = manifests.filter(({ manifest }) =>
    searchableValues(manifest).some((value) => String(value).toLowerCase().includes(normalized)),
  );
  if (matches.length === 0) throw new Error(`No workspace matched query: ${query}`);
  if (matches.length > 1) {
    throw new Error(`Query matched multiple workspaces: ${matches.map((match) => match.manifest.task_id).join(", ")}`);
  }
  return matches[0];
}

function findCleanupManifestByExactTaskId(state, taskId) {
  assertSafeTaskId(taskId);
  const matches = readCleanupManifests(state).filter(({ manifest }) => manifest.task_id === taskId);
  if (matches.length === 1) return matches[0];
  if (matches.length === 0) {
    throw new Error(`Strict exact-tree closeout requires a manifest whose task_id exactly equals ${taskId}.`);
  }
  throw new Error(`Strict exact-tree closeout found multiple manifests with task_id ${taskId}.`);
}

function repairManifests(argv) {
  const { options } = parseOptions(argv);
  const state = workspaceState(options);
  const apply = Boolean(options.apply);
  if (options.summaryJson && apply) {
    throw new Error("repair-manifests --summary-json is only supported without --apply.");
  }

  const records = readManifestRecords(state);
  const plans = [];
  const blocked = [];

  for (const record of records) {
    const plan = closedManifestRepairPlan(record, state);
    if (plan.repairable) {
      plans.push(plan);
    } else if (plan.reason) {
      blocked.push(plan);
    }
  }

  if (options.summaryJson) {
    console.log(JSON.stringify(buildRepairManifestsSummary({ state, records, plans, blocked }), null, 2));
    return;
  }

  const lines = [];
  if (plans.length === 0) {
    lines.push("no repairable closed legacy manifests found");
  } else {
    for (const plan of plans) {
      lines.push(`${plan.taskId}: add ${plan.fields.join(", ")} to closed manifest ${plan.path}`);
    }
  }
  for (const plan of blocked) {
    lines.push(`blocked ${plan.name}: ${plan.reason}`);
  }

  if (!apply) {
    printPlan("repair-manifests", [...lines, "preview only; pass --apply to write repairable closed manifests"]);
    return;
  }

  for (const plan of plans) {
    withManifestLock(state, plan.taskId, () => {
      const freshRecord = { path: plan.path, manifest: readManifest(plan.path) };
      const freshPlan = closedManifestRepairPlan(freshRecord, state);
      if (!freshPlan.repairable) {
        throw new Error(`Repair target changed for ${plan.taskId}; rerun repair-manifests.`);
      }
      const repaired = {
        ...freshRecord.manifest,
        ...freshPlan.patch,
        updated_at: new Date().toISOString(),
      };
      const fields = freshPlan.fields.join(", ");
      repaired.events = Array.isArray(repaired.events) ? repaired.events : [];
      repaired.events.push(taskEvent("manifest_repaired", `closed legacy manifest repaired: ${fields}`));
      validateManifest(repaired, plan.path);
      writeManifest(plan.path, repaired);
    });
  }

  printApplied("repair-manifests", lines);
}

function buildRepairManifestsSummary({ state, records, plans, blocked }) {
  return {
    generatedAt: new Date().toISOString(),
    tasksDir: state.tasksDir,
    counts: {
      total: records.length,
      repairable: plans.length,
      blocked: blocked.length,
    },
    blockedReasonCounts: countByField(blocked, "reason"),
    repairableManifests: plans.slice(0, 10).map((plan) => ({
      taskId: plan.taskId,
      name: plan.name,
      path: plan.path,
      fields: plan.fields,
    })),
    repairableManifestsTruncated: plans.length > 10,
    blockedManifests: blocked.slice(0, 10).map((plan) => ({
      taskId: plan.taskId || null,
      name: plan.name,
      path: plan.path,
      reason: plan.reason,
    })),
    blockedManifestsTruncated: blocked.length > 10,
    mutation: "none; summary only",
  };
}

function closedManifestRepairPlan(record, state) {
  const name = basename(record.path);
  if (record.error) {
    return { name, path: record.path, repairable: false, reason: record.error.message };
  }

  const manifest = record.manifest;
  const taskId = String(manifest.task_id || "").trim();
  const branch = String(manifest.branch || "").trim();
  const status = String(manifest.status || "").trim();
  if (!taskId || !branch || !status) {
    return { name, path: record.path, repairable: false, reason: "missing task_id, branch, or status" };
  }

  const patch = {};
  const fields = [];
  if (!manifest.worktree_path) {
    patch.worktree_path = join(state.worktreesDir, taskId);
    fields.push("worktree_path");
  }
  if (!manifest.base_branch) {
    patch.base_branch = defaultBaseBranch;
    fields.push("base_branch");
  }

  if (fields.length === 0) {
    return { name, path: record.path, taskId, repairable: false };
  }

  if (status !== "closed") {
    return { name, path: record.path, taskId, repairable: false, reason: "only closed legacy manifests can be repaired" };
  }

  return {
    name,
    path: record.path,
    taskId,
    repairable: true,
    fields,
    patch,
  };
}

function readManifest(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function readManifestRecords(state) {
  if (!existsSync(state.tasksDir)) {
    return [];
  }

  return readdirSync(state.tasksDir)
    .filter((name) => name.endsWith(".json"))
    .sort((left, right) => left.localeCompare(right))
    .map((name) => {
      const path = join(state.tasksDir, name);
      try {
        const manifest = readManifest(path);
        return { path, manifest };
      } catch (error) {
        return { path, error };
      }
    });
}

function readAssignments(state) {
  if (!existsSync(state.assignmentsDir)) {
    return [];
  }

  return readdirSync(state.assignmentsDir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => {
      const path = join(state.assignmentsDir, name);
      try {
        const assignment = readAssignment(path);
        validateAssignment(assignment, path);
        return { path, assignment };
      } catch (error) {
        return { path, error };
      }
    })
    .filter((record) => {
      if (record.error) {
        console.error(`WARN: skipping invalid assignment ${record.path}: ${record.error.message}`);
        return false;
      }
      return true;
    })
    .sort((left, right) => left.assignment.assignment_id.localeCompare(right.assignment.assignment_id));
}

function readAssignment(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function findAssignment(state, query) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  const records = readAssignments(state);
  const searchableValues = (assignment) =>
    [
      assignment.assignment_id,
      assignment.task_id,
      assignment.lane_slug,
      assignment.branch,
      assignment.source_backlog_item?.item_id,
      assignment.source_backlog_item?.branch_name,
    ].filter(Boolean);

  const exactMatches = records.filter(({ assignment }) =>
    searchableValues(assignment).some((value) => String(value).toLowerCase() === normalized),
  );
  if (exactMatches.length === 1) {
    return exactMatches[0];
  }
  if (exactMatches.length > 1) {
    throw new Error(`Query matched multiple assignments: ${exactMatches.map((m) => m.assignment.assignment_id).join(", ")}`);
  }

  const matches = records.filter(({ assignment }) =>
    searchableValues(assignment).some((value) => String(value).toLowerCase().includes(normalized)),
  );

  if (matches.length === 0) {
    return null;
  }
  if (matches.length > 1) {
    throw new Error(`Query matched multiple assignments: ${matches.map((m) => m.assignment.assignment_id).join(", ")}`);
  }
  return matches[0];
}

function findManifest(state, query, options = {}) {
  const manifests = readManifests(state);
  if (manifests.length === 0) {
    throw new Error(`No Codex workspace manifests found under ${state.tasksDir}`);
  }

  if (options.preferCurrentWorktree) {
    const currentRoot = currentGitRoot();
    const current = manifests.find((record) => samePath(record.manifest.worktree_path, currentRoot));
    if (current && !query.trim()) {
      return current;
    }
  }

  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    const active = manifests.filter((record) => record.manifest.status !== "closed");
    if (active.length === 1) {
      return active[0];
    }
    throw new Error("Specify a task query; multiple active workspaces exist.");
  }

  const searchableValues = (manifest) =>
    [manifest.task_id, manifest.title, manifest.description, manifest.branch].filter(Boolean);
  const exactMatches = manifests.filter(({ manifest }) =>
    searchableValues(manifest).some((value) => String(value).toLowerCase() === normalized),
  );
  if (exactMatches.length === 1) {
    return exactMatches[0];
  }
  if (exactMatches.length > 1) {
    throw new Error(`Query matched multiple workspaces: ${exactMatches.map((m) => m.manifest.task_id).join(", ")}`);
  }

  const matches = manifests.filter(({ manifest }) =>
    searchableValues(manifest).some((value) => String(value).toLowerCase().includes(normalized)),
  );

  if (matches.length === 0) {
    throw new Error(`No workspace matched query: ${query}`);
  }
  if (matches.length > 1) {
    throw new Error(`Query matched multiple workspaces: ${matches.map((m) => m.manifest.task_id).join(", ")}`);
  }
  return matches[0];
}

function findManifestByExactTaskId(state, taskId) {
  assertSafeTaskId(taskId);
  const matches = readManifests(state).filter(({ manifest }) => manifest.task_id === taskId);
  if (matches.length === 1) {
    return matches[0];
  }
  if (matches.length === 0) {
    throw new Error(`Strict exact-tree closeout requires a manifest whose task_id exactly equals ${taskId}.`);
  }
  throw new Error(`Strict exact-tree closeout found multiple manifests with task_id ${taskId}.`);
}

function writeManifest(path, manifest, options = {}) {
  const serialized = `${JSON.stringify(manifest, null, 2)}\n`;
  const context = activeTaskLeaseWriteContext;
  let intent = null;
  if (context && manifest?.task_id === context.taskId) {
    assertActiveTaskLeaseWriteOwnership(context);
    // Reserve both immutable sides before the manifest rename.  A completion
    // record is required to make this write releasable after the callback.
    assertTaskLeaseIntentPairCapacity(context, "manifest");
    intent = {
      schema_version: taskLeaseSchemaVersion,
      task_id: context.taskId,
      generation: context.generation,
      token_digest: taskLeaseTokenDigest(context.token),
      intent_id: randomUUID(),
      manifest_path_digest: createHash("sha256").update(resolve(path)).digest("hex"),
      manifest_digest: createHash("sha256").update(serialized).digest("hex"),
      started_at: new Date().toISOString(),
    };
    writeNewJson(taskLeasePath(context.state, context.taskId, "manifest-intents", intent.intent_id), intent);
  }
  atomicDurableWrite(path, serialized);
  if (options.testHardCrashAfterRename && process.env[options.testHardCrashAfterRename] === "1") {
    // Test-only process termination models the window where no JavaScript
    // catch/finally handler can roll back the durable staging rename.
    process.exit(86);
  }
  if (options.testCrashAfterRename && process.env[options.testCrashAfterRename] === "1") {
    const error = new Error(`injected crash after durable manifest rename before ${options.testCrashAfterRename}`);
    error.taskLeaseManifestIntent = intent;
    throw error;
  }
  if (process.env.CODEX_WORKSPACE_TEST_CRASH_AFTER_MANIFEST_RENAME === "1") {
    const error = new Error("injected crash after durable manifest rename before commit evidence");
    error.taskLeaseManifestIntent = intent;
    throw error;
  }
  if (intent) {
    completeTaskLeaseManifestIntent(context, intent);
  }
}

function completeTaskLeaseManifestIntent(context, intent) {
  assertActiveTaskLeaseWriteOwnership(context);
  writeNewJson(taskLeasePath(context.state, context.taskId, "manifest-commits", intent.intent_id), {
    schema_version: taskLeaseSchemaVersion,
    task_id: context.taskId,
    generation: context.generation,
    token_digest: taskLeaseTokenDigest(context.token),
    intent_id: intent.intent_id,
    committed_at: new Date().toISOString(),
  });
}

function atomicDurableWrite(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  const tempPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  let fd;
  try {
    fd = openSync(tempPath, "wx", 0o600);
    writeFileSync(fd, content);
    fsyncSync(fd);
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
  if (process.env.CODEX_WORKSPACE_TEST_CRASH_BEFORE_MANIFEST_RENAME === "1") {
    throw new Error("injected crash before durable manifest rename");
  }
  renameSync(tempPath, path);
  let directoryFd;
  try {
    directoryFd = openSync(dirname(path), "r");
    fsyncSync(directoryFd);
  } finally {
    if (directoryFd !== undefined) closeSync(directoryFd);
  }
}

function writeAssignment(path, assignment) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(assignment, null, 2)}\n`);
}

function fetchBaseBranch(baseBranch, options = {}) {
  assertSafeBaseBranch(baseBranch);
  const result = git(["fetch", "origin", baseBranch], { cwd: repoRoot });
  if (result.code === 0) {
    return;
  }
  if (
    options.usingDefaultBase &&
    baseBranch === defaultBaseBranch &&
    !baseRefAvailable(baseBranch) &&
    fetchFailureLooksMissingRemoteRef(result)
  ) {
    throw new Error(branchFoundationDefaultBaseMessage(baseBranch));
  }
  throw new Error(result.stderr || `git fetch origin ${baseBranch} failed`);
}

function resolveBaseRef(baseBranch, options = {}) {
  assertSafeBaseBranch(baseBranch);
  const originRef = `origin/${baseBranch}`;
  if (git(["rev-parse", "--verify", "--quiet", originRef], { cwd: repoRoot }).code === 0) {
    return originRef;
  }
  if (git(["rev-parse", "--verify", "--quiet", baseBranch], { cwd: repoRoot }).code === 0) {
    return baseBranch;
  }
  if (options.usingDefaultBase && baseBranch === defaultBaseBranch) {
    throw new Error(branchFoundationDefaultBaseMessage(baseBranch));
  }
  throw new Error(`Base branch not found locally: ${baseBranch}`);
}

function assertSafeExplicitBasePair(baseBranch, baseRef) {
  assertSafeBaseBranch(baseBranch);
  const ref = String(baseRef || "");
  if (!ref || ref !== baseRef) {
    throw new Error(`Invalid explicit base ref for ${baseBranch}: ${baseRef}`);
  }
  if (ref.length > MAX_BASE_REF_LENGTH) {
    throw new Error(`Explicit base ref exceeds maximum length ${MAX_BASE_REF_LENGTH}: ${ref.length}`);
  }
  if (ref !== baseBranch && ref !== `origin/${baseBranch}`) {
    throw new Error(`Invalid explicit base ref for ${baseBranch}: ${baseRef}`);
  }
}

function assertExplicitBaseRefAvailable(baseRef) {
  if (!refExists(baseRef)) {
    throw new Error(`Explicit base ref not found locally: ${baseRef}`);
  }
}

function baseRefAvailable(baseBranch) {
  return refExists(`origin/${baseBranch}`) || refExists(baseBranch);
}

function fetchFailureLooksMissingRemoteRef(result) {
  return /could(n't| not) find remote ref|fatal: couldn't find remote ref/i.test(result.stderr || "");
}

function branchFoundationDefaultBaseMessage(baseBranch) {
  return [
    `Branch foundation default base ${baseBranch} was not found locally or as origin/${baseBranch}.`,
    "Run node ./scripts/branch-foundation.mjs report to inspect branch foundation state.",
    "Create or push the missing branch only through the approval-gated branch foundation setup flow.",
  ].join(" ");
}

function branchExists(branch, cwd = repoRoot) {
  return git(["rev-parse", "--verify", "--quiet", branch], { cwd }).code === 0;
}

function remoteBranchExists(branch) {
  return git(["rev-parse", "--verify", "--quiet", `origin/${branch}`], { cwd: repoRoot }).code === 0;
}

function branchSha(branch, cwd = repoRoot) {
  const result = git(["rev-parse", "--verify", "--quiet", branch], { cwd });
  return result.code === 0 ? result.stdout.trim() : "";
}

function originBranchSha(branch, cwd = repoRoot) {
  const exactRef = `refs/heads/${branch}`;
  const result = git(["ls-remote", "--heads", "origin", exactRef], { cwd });
  if (result.code !== 0) {
    throw new Error(result.stderr || `Could not inspect remote branch: origin/${branch}`);
  }
  if (!result.stdout) {
    return "";
  }
  const rows = result.stdout.trim().split("\n").filter(Boolean);
  if (rows.length !== 1) {
    throw new Error(`Could not uniquely inspect remote branch: origin/${branch}`);
  }
  const [sha, ref] = rows[0].split(/\s+/);
  if (!exactGitObjectIdOrNull(sha) || ref !== exactRef) {
    throw new Error(`Could not exactly inspect remote branch: origin/${branch}`);
  }
  return sha;
}

function refExists(ref) {
  return git(["rev-parse", "--verify", "--quiet", ref], { cwd: repoRoot }).code === 0;
}

function assertSafeBranch(branch) {
  const short = branch.replace(/^refs\/heads\//, "");
  if (protectedBranches.has(short)) {
    throw new Error(`Refusing to operate on protected branch: ${branch}`);
  }
}

function assertSafeBaseBranch(branch) {
  const value = String(branch || "").trim();
  if (value === "HEAD") return;
  if (
    !value ||
    value !== branch ||
    value.length > MAX_BASE_BRANCH_LENGTH ||
    value.startsWith("-") ||
    value.startsWith("refs/") ||
    /[\s:*]/.test(value) ||
    value.includes("..") ||
    value.includes("@{") ||
    git(["check-ref-format", "--branch", value], { cwd: repoRoot }).code !== 0
  ) {
    throw new Error(`Invalid base branch: ${branch}`);
  }
}

function assertSafeTaskId(taskId) {
  if (taskId !== basename(taskId) || taskId.includes("..") || !/^[a-zA-Z0-9._-]+$/.test(taskId)) {
    throw new Error(`Invalid task id: ${taskId}`);
  }
}

function uniqueTaskId(tasksDir, baseTaskId) {
  assertSafeTaskId(baseTaskId);
  let candidate = baseTaskId;
  let index = 2;
  while (existsSync(join(tasksDir, `${candidate}.json`))) {
    candidate = `${baseTaskId}-${index}`;
    index += 1;
  }
  return candidate;
}

function assertCurrentBranch(manifest) {
  const result = git(["branch", "--show-current"], { cwd: manifest.worktree_path });
  if (result.code !== 0 || result.stdout.trim() !== manifest.branch) {
    throw new Error(`Worktree is on ${result.stdout.trim() || "unknown branch"}, expected ${manifest.branch}.`);
  }
}

function resolveVerificationPlan(profile, manifest, worktreeStatus) {
  const requestedProfile = String(profile || "").trim();
  if (!requestedProfile) {
    return { profile: "", resolvedProfile: "", command: [], changedFiles: [], reason: "no-verification-profile" };
  }
  const changedFiles = verificationChangedFiles(manifest, worktreeStatus);
  const resolvedProfile = requestedProfile === "scoped" || requestedProfile === "auto"
    ? scopedVerificationProfile(changedFiles)
    : requestedProfile;
  return {
    profile: requestedProfile,
    resolvedProfile,
    command: verificationCommand(resolvedProfile),
    changedFiles,
    reason: requestedProfile === resolvedProfile ? "explicit-profile" : "changed-file-scope",
  };
}

function assertKnownVerificationProfile(profile) {
  const requestedProfile = String(profile || "").trim();
  if (!requestedProfile) return;
  if (requestedProfile === "scoped" || requestedProfile === "auto") return;
  verificationCommand(requestedProfile);
}

function scopedVerificationProfile(changedFiles = []) {
  const files = uniqueTextValues(changedFiles);
  if (files.length === 0) return "check-fast";
  if (files.every((file) => isDocsOnlyVerificationPath(file))) return "docs";
  if (files.every((file) => isManagerControlPlaneVerificationPath(file))) return "manager-control-plane";
  if (files.every((file) => isCodexWorkspaceVerificationPath(file))) return "codex-workspace";
  if (files.every((file) => isDashboardDeliveryVerificationPath(file))) return "dashboard";
  return "check-fast";
}

function isDocsOnlyVerificationPath(file) {
  return /^(AGENTS\.md|README\.md|docs\/.*\.md|docs\/.*\.json|docs\/.*\.ya?ml)$/.test(file);
}

function isManagerControlPlaneVerificationPath(file) {
  return (
    /^scripts\/manager-[^/]+\.mjs$/.test(file) ||
    /^scripts\/check-manager-control-plane\.mjs$/.test(file) ||
    /^scripts\/run-manager-control-plane-[^/]+\.mjs$/.test(file) ||
    /^scripts\/lib\/manager-control-plane(?:\/|\.mjs$)/.test(file) ||
    /^tests\/manager-control-plane(?:[./-]|$)/.test(file) ||
    /^tests\/helpers\/manager-control-plane(?:\/|$)/.test(file) ||
    /^\.agents\/skills\/kendall-manager-control-plane(?:\/|$)/.test(file)
  );
}

function isCodexWorkspaceVerificationPath(file) {
  return (
    file === "scripts/codex-workspace.mjs" ||
    file === "scripts/test-codex-workspace.mjs" ||
    /^scripts\/lib\/codex-workspace/.test(file) ||
    /^tests\/codex-workspace/.test(file) ||
    file === "AGENTS.md"
  );
}

function isDashboardDeliveryVerificationPath(file) {
  return (
    /^apps\/dashboard\//.test(file) ||
    /^tests\/dashboard-[^/]+\.test\.(?:mjs|ts)$/.test(file) ||
    /^tests\/e2e\/dashboard[^/]*\.ts$/.test(file) ||
    file === "tests/gate4-bmad-dashboard-e2e.test.mjs" ||
    file === "tests/fixtures/pipeline/gate4-bmad-dashboard-e2e-proof-2026-07-12.json" ||
    /^scripts\/(?:check-dashboard-[^/]+|dashboard-[^/]+|run-(?:controls|detail|mobile|managed(?:-mobile-recipe)?|provider-raw-output-ui)-e2e)\.mjs$/.test(file) ||
    file === "scripts/gate4-bmad-dashboard-e2e.mjs" ||
    /^playwright\.config\.(?:ts|mjs)$/.test(file) ||
    /^docs\/.*\.md$/.test(file)
  );
}

function verificationChangedFiles(manifest, worktreeStatus) {
  const files = new Set(statusPaths(worktreeStatus));
  for (const file of committedChangedFiles(manifest)) {
    files.add(file);
  }
  return [...files].sort();
}

function committedChangedFiles(manifest) {
  const baseRef = String(manifest.base_ref || `origin/${manifest.base_branch || ""}` || manifest.base_branch || "").trim();
  if (!baseRef) return [];
  const base = git(["merge-base", "HEAD", baseRef], { cwd: manifest.worktree_path });
  if (base.code !== 0 || !base.stdout.trim()) return [];
  const result = git(["diff", "--name-only", `${base.stdout.trim()}..HEAD`], { cwd: manifest.worktree_path });
  if (result.code !== 0) return [];
  return result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function verificationCommand(profile) {
  const profiles = {
    preflight: ["node", "./scripts/preflight.mjs"],
    check: ["pnpm", "run", "check"],
    "check-fast": ["pnpm", "run", "check:fast"],
    dashboard: ["pnpm", "run", "check:dashboard-delivery"],
    "workspace-fast": ["pnpm", "run", "check:workspace-fast"],
    "manager-control-plane": ["pnpm", "run", "check:manager-control-plane:delivery"],
    docs: ["pnpm", "run", "check:docs"],
    "codex-workspace": ["node", "./scripts/test-codex-workspace.mjs"],
  };
  if (!profiles[profile]) {
    throw new Error(`Unknown verification profile: ${profile}. Use scoped, preflight, check, check-fast, dashboard, workspace-fast, manager-control-plane, docs, or codex-workspace.`);
  }
  return profiles[profile];
}

function verificationTimeoutMs(profile) {
  if (profile === "check") return checkVerificationTimeoutMs;
  if (profile === "codex-workspace") return codexWorkspaceVerificationTimeoutMs;
  return profile === "dashboard" ? dashboardVerificationTimeoutMs : defaultVerificationTimeoutMs;
}

function resumableCheckPlan(cwd) {
  const scripts = JSON.parse(readFileSync(join(cwd, "package.json"), "utf8")).scripts || {};
  const check = scripts.check;
  const sourceStages = String(check || "")
    .split("&&")
    .map((part) => part.trim())
    .map((part) => /^pnpm run ([A-Za-z0-9:_-]+)$/.exec(part)?.[1]);
  if (!sourceStages.length || sourceStages.some((stage) => !stage)) throw new Error("check profile stage plan is not allowlisted.");
  const stages = [];
  const legacyStages = [...sourceStages];
  const firstSourceByStage = new Map();
  for (const sourceStage of sourceStages) {
    if (typeof scripts[sourceStage] !== "string") throw new Error("check profile stage plan is not allowlisted.");
    for (const stage of expandResumableCheckStage(sourceStage)) {
      if (typeof scripts[stage] !== "string") throw new Error("check profile stage plan is not allowlisted.");
      const firstSource = firstSourceByStage.get(stage);
      if (firstSource) {
        const isIntentionalTrailingWorkspaceDuplicate = sourceStage === stage && firstSource === "check:fast" && resumableCheckTrailingWorkspaceDuplicates.has(stage);
        if (isIntentionalTrailingWorkspaceDuplicate) continue;
        throw new Error("check profile stage plan contains duplicate stages.");
      }
      firstSourceByStage.set(stage, sourceStage);
      stages.push(stage);
    }
  }
  const digest = resumableCheckPlanDigest(stages);
  return { stages, digest, legacyStages };
}

function resumableCheckPlanDigest(stages) {
  return createHash("sha256").update(stages.join("\n")).digest("hex");
}

function resumableCheckObsoleteSupervisorAggregatePlan(plan) {
  const firstLeaf = plan.stages.indexOf(resumableCheckSupervisorLeaves[0]);
  const lastLeaf = plan.stages.lastIndexOf(resumableCheckSupervisorLeaves.at(-1));
  if (firstLeaf < 0 || lastLeaf < firstLeaf) return null;
  return [...plan.stages.slice(0, firstLeaf), "test:supervisor", ...plan.stages.slice(lastLeaf + 1)];
}

function resumableCheckPriorWorkspaceFastExpandedPlan(plan) {
  const stages = plan.stages;
  const focusedDeliveryIndex = stages.indexOf("test:codex-workspace:delivery");
  const profileContractIndex = focusedDeliveryIndex + 1;
  const laterRawFixtureIndex = stages.indexOf("test:codex-workspace", profileContractIndex + 1);
  if (
    focusedDeliveryIndex < 1 ||
    stages[focusedDeliveryIndex - 1] !== "test:mutation-admission-prewrite-guard" ||
    stages[profileContractIndex] !== "test:workspace-fast-profile" ||
    laterRawFixtureIndex <= profileContractIndex
  ) {
    return null;
  }
  return [
    ...stages.slice(0, focusedDeliveryIndex),
    "test:codex-workspace",
    ...stages.slice(profileContractIndex + 1, laterRawFixtureIndex),
    ...stages.slice(laterRawFixtureIndex + 1),
  ];
}

function expandResumableCheckStage(stage) {
  const expansion = resumableCheckNestedStageExpansions[stage];
  return expansion ? expansion.flatMap((nestedStage) => expandResumableCheckStage(nestedStage)) : [stage];
}

function runResumableCheckVerification(manifest, manifestPath, verificationPlan, options) {
  const plan = resumableCheckPlan(options.cwd);
  const head = git(["rev-parse", "HEAD"], { cwd: options.cwd }).stdout.trim();
  const stagedInputDigest = stagedInputDigestForWorktree(options.cwd);
  const prior = manifest.check_verification_packet;
  let packet = prior;
  let environmentPreflightRetry = null;
  if (options.allowEnvironmentPreflightRetry) {
    // This flag is a narrowly bounded retry of an already-recorded terminal
    // packet. It must never bootstrap a new check packet, even if the prior
    // manifest state is absent or malformed.
    if (!prior) {
      validatedEnvironmentPreflightRetryHistory(manifest.environment_preflight_retry_history);
      throw new Error("environment preflight retry requires an existing terminal failed initial-preflight check packet.");
    }
    const expected = { taskId: manifest.task_id, owner: options.owner, head, plan, stagedInputDigest };
    environmentPreflightRetry = prepareExactEnvironmentPreflightRetry(manifest, manifestPath, prior, expected, options);
    packet = prior;
  } else if (prior) {
    try {
      validateResumableCheckPacket(prior, { taskId: manifest.task_id, owner: options.owner, head, plan, stagedInputDigest });
    } catch (error) {
      const expected = { taskId: manifest.task_id, owner: options.owner, head, plan, stagedInputDigest };
      environmentPreflightRetry = prepareExactEnvironmentPreflightRetry(manifest, manifestPath, prior, expected, options);
      if (environmentPreflightRetry) {
        packet = prior;
      } else if (discardRecoverableTerminalCheckPacket(manifest, manifestPath, prior, expected, options)) {
        packet = null;
      } else {
        throw error;
      }
    }
  }
  if (!packet) {
    packet = createResumableCheckPacket({ taskId: manifest.task_id, owner: options.owner, head, planDigest: plan.digest, stagedInputDigest, nextStage: plan.stages[0] });
    manifest.check_verification_packet = packet;
    writeManifest(manifestPath, manifest);
  }
  const started = Date.now();
  if (environmentPreflightRetry) {
    runExactEnvironmentPreflightRetry(manifest, manifestPath, packet, environmentPreflightRetry, options, started);
  }
  for (let index = packet.stages.length; index < plan.stages.length; index += 1) {
    const stage = plan.stages[index];
    const invocationBudgetMs = resumableCheckLongLeafStages.has(stage) ? resumableCheckLongLeafBudgetMs : resumableCheckInvocationBudgetMs;
    const remainingMs = invocationBudgetMs - (Date.now() - started);
    const needsSupervisorLeafReserve = resumableCheckSupervisorLeafSet.has(stage);
    const executionReserveMs = needsSupervisorLeafReserve
      ? resumableCheckSupervisorLeafExecutionReserveMs
      : resumableCheckDefaultLeafExecutionReserveMs;
    if (remainingMs < executionReserveMs) {
      packet.status = "partial"; packet.next_stage = stage; packet.updated_at = new Date().toISOString(); manifest.check_verification_packet = packet; writeManifest(manifestPath, manifest);
      throw new Error(`Check verification packet paused before ${packet.next_stage}; resume finish-pr to continue.`);
    }
    const timeout = needsSupervisorLeafReserve ? resumableCheckSupervisorLeafExecutionReserveMs : remainingMs;
    const result = run("pnpm", ["run", stage], { cwd: options.cwd, timeout, killSignal: "SIGKILL" });
    const evidence = { stage, completed_at: new Date().toISOString(), status: result.status ?? null, signal: result.signal || null, error_code: result.errorCode || null, output: "omitted" };
    if (verificationOutcome(result) !== "success") { packet.status = "failed"; packet.failed_stage = stage; packet.stages.push(evidence); manifest.check_verification_packet = packet; writeManifest(manifestPath, manifest); const diagnostic = persistVerificationDiagnostic({ context: { state: options.state, taskId: manifest.task_id }, profile: "check", command: ["pnpm", "run", "check"], elapsedMs: Date.now() - started, timeoutMs: checkVerificationTimeoutMs, outcome: verificationOutcome(result), result }); throw new Error(`Verification ${verificationOutcome(result)}: profile=check; check stage=${stage}; timeout_ms=${checkVerificationTimeoutMs}; child_output=omitted; diagnostic=${diagnostic.status}.`); }
    packet.stages.push(evidence);
    packet.updated_at = new Date().toISOString();
    if (index + 1 === plan.stages.length) {
      packet.status = "passed";
      packet.next_stage = null;
      packet.completed_at = packet.updated_at;
    } else {
      packet.status = "partial";
      packet.next_stage = plan.stages[index + 1];
    }
    manifest.check_verification_packet = packet;
    writeManifest(manifestPath, manifest);
  }
}

function prepareExactEnvironmentPreflightRetry(manifest, manifestPath, packet, expected, options = {}) {
  if (!options.allowEnvironmentPreflightRetry) return false;
  validateTerminalCheckPacketForDiscard(packet, expected);
  if (
    packet.status !== "failed" ||
    packet.task_id !== expected.taskId ||
    packet.owner !== expected.owner ||
    packet.head !== expected.head ||
    packet.plan_digest !== expected.plan.digest ||
    packet.staged_input_digest !== expected.stagedInputDigest
  ) {
    throw new Error("environment preflight retry requires an unchanged task, owner, head, plan, and staged input binding.");
  }
  const preflightStage = expected.plan.stages[0];
  if (
    preflightStage !== "preflight" ||
    packet.failed_stage !== preflightStage ||
    packet.next_stage !== preflightStage ||
    packet.stages.length !== 1 ||
    packet.stages[0]?.stage !== preflightStage
  ) {
    throw new Error("environment preflight retry accepts only a failed initial preflight stage.");
  }
  const history = validatedEnvironmentPreflightRetryHistory(manifest.environment_preflight_retry_history);
  if (history.some((record) => record.status === "started")) {
    throw new Error("environment preflight retry history contains an unfinished retry; refusing concurrent recovery.");
  }
  if ((history || []).some((record) => environmentPreflightRetryMatchesBinding(record, expected))) {
    throw new Error("environment preflight retry was already consumed for this exact source and staged-input binding.");
  }
  if (history.length >= environmentPreflightRetryHistoryLimit) {
    throw new Error("environment preflight retry history is full; refusing recovery.");
  }
  const priorCompletedAt = history.length > 0 ? Date.parse(history.at(-1).completed_at) : 0;
  const startedAt = new Date(Math.max(Date.now(), priorCompletedAt + 1)).toISOString();
  manifest.environment_preflight_retry_history = [
    ...(history || []),
    {
      schema_version: 1,
      started_at: startedAt,
      task_id: expected.taskId,
      owner: expected.owner,
      profile: "check",
      failed_stage: preflightStage,
      head: expected.head,
      plan_digest: expected.plan.digest,
      staged_input_digest: expected.stagedInputDigest,
      status: "started",
      delivery: "none; verification retry only",
    },
  ];
  appendTaskEvent(manifest, "environment_preflight_retry_started", "exact check preflight retry authorized without source or staged-input mutation");
  writeManifest(manifestPath, manifest);
  return { expected, startedAt };
}

function validatedEnvironmentPreflightRetryHistory(history) {
  if (history === undefined) return [];
  if (!Array.isArray(history) || history.length > environmentPreflightRetryHistoryLimit) {
    throw new Error("environment preflight retry history is malformed or exceeds its bounded retention; refusing recovery.");
  }
  const bindings = new Set();
  let priorCompletedAt = null;
  for (let index = 0; index < history.length; index += 1) {
    const record = history[index];
    if (!validEnvironmentPreflightRetryHistoryRecord(record)) {
      throw new Error("environment preflight retry history contains a malformed or ambiguous record; refusing recovery.");
    }
    const binding = environmentPreflightRetryBindingKey(record);
    if (bindings.has(binding)) {
      throw new Error("environment preflight retry history contains a duplicate retry binding; refusing recovery.");
    }
    bindings.add(binding);
    const startedAt = Date.parse(record.started_at);
    if (priorCompletedAt !== null && startedAt <= priorCompletedAt) {
      throw new Error("environment preflight retry history is not in strict chronological order; refusing recovery.");
    }
    if (record.status === "started") {
      if (index !== history.length - 1) {
        throw new Error("environment preflight retry history contains an unfinished nonterminal record; refusing recovery.");
      }
      priorCompletedAt = null;
    } else {
      priorCompletedAt = Date.parse(record.completed_at);
    }
  }
  return history;
}

function environmentPreflightRetryBindingKey(record) {
  return [
    record.task_id,
    record.owner,
    record.profile,
    record.failed_stage,
    record.head,
    record.plan_digest,
    record.staged_input_digest,
  ].join("\u0000");
}

function validEnvironmentPreflightRetryHistoryRecord(record) {
  if (!record || typeof record !== "object" || Array.isArray(record) || Object.getPrototypeOf(record) !== Object.prototype) return false;
  if (Object.keys(record).some((field) => !environmentPreflightRetryHistoryFields.has(field))) return false;
  const completed = record.completed_at;
  const completedStatus = record.status !== "started";
  const now = Date.now();
  const startedAt = isCanonicalIsoTimestamp(record.started_at) ? Date.parse(record.started_at) : null;
  const completedAt = completedStatus && isCanonicalIsoTimestamp(completed) ? Date.parse(completed) : null;
  return Boolean(
    record.schema_version === 1 &&
      typeof record.task_id === "string" && record.task_id.length > 0 && record.task_id.length <= 120 &&
      typeof record.owner === "string" && record.owner.length > 0 && record.owner.length <= 240 &&
      record.profile === "check" &&
      record.failed_stage === "preflight" &&
      typeof record.head === "string" && /^[0-9a-f]{40}$/i.test(record.head) &&
      typeof record.plan_digest === "string" && /^[0-9a-f]{64}$/i.test(record.plan_digest) &&
      typeof record.staged_input_digest === "string" && /^[0-9a-f]{64}$/i.test(record.staged_input_digest) &&
      record.delivery === "none; verification retry only" &&
      environmentPreflightRetryStatuses.has(record.status) &&
      startedAt !== null &&
      startedAt <= now + environmentPreflightRetryHistoryFutureSkewMs &&
      (completedStatus
        ? completedAt !== null && completedAt >= startedAt && completedAt <= now + environmentPreflightRetryHistoryFutureSkewMs
        : completed === undefined),
  );
}

function environmentPreflightRetryMatchesBinding(record, expected) {
  return Boolean(
    validEnvironmentPreflightRetryHistoryRecord(record) &&
      record.schema_version === 1 &&
      record.task_id === expected.taskId &&
      record.owner === expected.owner &&
      record.profile === "check" &&
      record.failed_stage === "preflight" &&
      record.head === expected.head &&
      record.plan_digest === expected.plan.digest &&
      record.staged_input_digest === expected.stagedInputDigest &&
      record.delivery === "none; verification retry only" &&
      isCanonicalIsoTimestamp(record.started_at),
  );
}

function runExactEnvironmentPreflightRetry(manifest, manifestPath, packet, retry, options, started) {
  const result = run("pnpm", ["run", "preflight"], {
    cwd: options.cwd,
    timeout: Math.max(1, resumableCheckInvocationBudgetMs - (Date.now() - started)),
    killSignal: "SIGKILL",
  });
  const outcome = verificationOutcome(result);
  if (outcome !== "success") {
    completeEnvironmentPreflightRetry(manifest, manifestPath, retry.expected, "failed");
    const diagnostic = persistVerificationDiagnostic({
      context: { state: options.state, taskId: manifest.task_id }, profile: "check", command: ["pnpm", "run", "check"],
      elapsedMs: Date.now() - started, timeoutMs: checkVerificationTimeoutMs, outcome, result,
    });
    throw new Error(`Verification ${outcome}: profile=check; check stage=preflight; timeout_ms=${checkVerificationTimeoutMs}; child_output=omitted; diagnostic=${diagnostic.status}.`);
  }
  const currentHead = git(["rev-parse", "HEAD"], { cwd: options.cwd }).stdout.trim();
  const currentPlan = resumableCheckPlan(options.cwd);
  const currentStagedInputDigest = stagedInputDigestForWorktree(options.cwd);
  const currentStatus = parseStatus(options.cwd);
  if (
    currentHead !== retry.expected.head ||
    currentPlan.digest !== retry.expected.plan.digest ||
    currentStagedInputDigest !== retry.expected.stagedInputDigest ||
    currentStatus.unstaged
  ) {
    completeEnvironmentPreflightRetry(manifest, manifestPath, retry.expected, "blocked_snapshot_changed");
    throw new Error("environment preflight retry changed or lost the exact source, plan, or staged-input snapshot; refusing continuation or delivery.");
  }
  validateTerminalCheckPacketForDiscard(packet, retry.expected);
  if (
    packet.status !== "failed" ||
    packet.failed_stage !== "preflight" ||
    packet.next_stage !== "preflight" ||
    packet.stages.length !== 1 ||
    packet.stages[0]?.stage !== "preflight"
  ) {
    completeEnvironmentPreflightRetry(manifest, manifestPath, retry.expected, "blocked_packet_changed");
    throw new Error("environment preflight retry packet changed before the retry could be recorded; refusing continuation or delivery.");
  }
  const completedAt = new Date().toISOString();
  packet.stages = [{ stage: "preflight", completed_at: completedAt, status: 0, signal: null, error_code: null, output: "omitted" }];
  packet.updated_at = completedAt;
  packet.status = retry.expected.plan.stages.length === 1 ? "passed" : "partial";
  packet.next_stage = retry.expected.plan.stages[1] || null;
  delete packet.failed_stage;
  if (packet.status === "passed") packet.completed_at = completedAt;
  manifest.check_verification_packet = packet;
  completeEnvironmentPreflightRetry(manifest, manifestPath, retry.expected, "preflight_passed", { write: false });
  appendTaskEvent(manifest, "environment_preflight_retry_passed", "exact check preflight passed and the unchanged packet resumed at its original next stage");
  writeManifest(manifestPath, manifest);
}

function completeEnvironmentPreflightRetry(manifest, manifestPath, expected, status, options = {}) {
  const history = validatedEnvironmentPreflightRetryHistory(manifest.environment_preflight_retry_history);
  const index = history.findLastIndex((record) => environmentPreflightRetryMatchesBinding(record, expected) && record.status === "started");
  if (index < 0) throw new Error("environment preflight retry audit record changed before completion; refusing continuation.");
  const completedAt = new Date(Math.max(Date.now(), Date.parse(history[index].started_at))).toISOString();
  history[index] = { ...history[index], status, completed_at: completedAt };
  manifest.environment_preflight_retry_history = history;
  if (options.write !== false) writeManifest(manifestPath, manifest);
}

function discardRecoverableTerminalCheckPacket(manifest, manifestPath, packet, expected, options = {}) {
  if (!options.allowTerminalPacketRecovery) return false;
  validateTerminalCheckPacketForDiscard(packet, expected);
  if (packet.head === expected.head && packet.plan_digest === expected.plan.digest && packet.staged_input_digest === expected.stagedInputDigest) return false;
  appendTaskEvent(
    manifest,
    "check_verification_packet_discarded",
    `explicit-stage-all terminal ${packet.status} packet discarded after head-plan-or-staged-input binding changed`,
  );
  manifest.check_verification_packet = null;
  writeManifest(manifestPath, manifest);
  return true;
}

function validateTerminalCheckPacketForDiscard(packet, expected) {
  const invalid = (reason) => { throw new Error(`check verification packet is invalid: ${reason}.`); };
  if (!packet || typeof packet !== "object" || Array.isArray(packet)) invalid("packet must be an object");
  const allowedPacketKeys = ["schema_version", "task_id", "owner", "head", "plan_digest", "staged_input_digest", "stages", "status", "next_stage", "created_at", "updated_at", "expires_at", "completed_at", "failed_stage"];
  if (Object.keys(packet).some((key) => !allowedPacketKeys.includes(key))) invalid("packet contains unbounded fields");
  if (packet.schema_version !== resumableCheckPacketSchemaVersion) invalid("schema version is unsupported");
  if (packet.task_id !== expected.taskId || packet.owner !== expected.owner) invalid("binding changed");
  if (typeof packet.head !== "string" || !/^[a-f0-9]{40,64}$/i.test(packet.head) || typeof packet.plan_digest !== "string" || !/^[a-f0-9]{64}$/i.test(packet.plan_digest)) invalid("packet binding is malformed");
  if (Object.hasOwn(packet, "staged_input_digest") && (typeof packet.staged_input_digest !== "string" || !/^[a-f0-9]{64}$/i.test(packet.staged_input_digest))) invalid("staged input binding is malformed");
  if (!["passed", "failed"].includes(packet.status)) invalid("explicit recovery requires a terminal packet");
  const now = Date.now();
  const timestamp = (value, label, { allowFuture = false } = {}) => {
    if (typeof value !== "string" || value.length > 80 || !Number.isFinite(Date.parse(value))) invalid(`${label} is malformed`);
    const parsed = Date.parse(value);
    if (!allowFuture && parsed > now + resumableCheckPacketFutureSkewMs) invalid(`${label} is in the future`);
    return parsed;
  };
  const createdAt = timestamp(packet.created_at, "created_at");
  const updatedAt = timestamp(packet.updated_at, "updated_at");
  const expiresAt = timestamp(packet.expires_at, "expires_at", { allowFuture: true });
  if (updatedAt < createdAt || expiresAt <= createdAt || expiresAt - createdAt > resumableCheckPacketTtlMs + resumableCheckPacketFutureSkewMs) invalid("timestamp ordering is invalid");
  if (!Array.isArray(packet.stages) || packet.stages.length > 256) invalid("stage evidence is malformed");
  const seenStages = new Set();
  const history = [];
  let previousCompletedAt = createdAt;
  for (let index = 0; index < packet.stages.length; index += 1) {
    const evidence = packet.stages[index];
    if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) invalid("stage evidence is malformed");
    const allowedEvidenceKeys = ["completed_at", "error_code", "output", "signal", "stage", "status"];
    if (Object.keys(evidence).some((key) => !allowedEvidenceKeys.includes(key))) invalid("stage evidence contains unbounded fields");
    if (typeof evidence.stage !== "string" || !/^[A-Za-z0-9:_-]{1,120}$/.test(evidence.stage) || seenStages.has(evidence.stage)) invalid("stage evidence stage is malformed");
    seenStages.add(evidence.stage);
    history.push(evidence.stage);
    const completedAt = timestamp(evidence.completed_at, "stage completed_at");
    const legacyTerminalFailureTimestamp = packet.status === "failed" && index === packet.stages.length - 1 && completedAt > updatedAt;
    if (completedAt < previousCompletedAt || completedAt > expiresAt || (completedAt > updatedAt && !legacyTerminalFailureTimestamp) || evidence.output !== "omitted") invalid("stage evidence is malformed");
    previousCompletedAt = completedAt;
    if (!(evidence.status === null || Number.isInteger(evidence.status)) || !(evidence.signal === null || (typeof evidence.signal === "string" && evidence.signal.length <= 120)) || !(evidence.error_code === null || (typeof evidence.error_code === "string" && evidence.error_code.length <= 120))) invalid("stage evidence is malformed");
  }
  const baseCandidatePlans = [expected.plan.stages, expected.plan.legacyStages, resumableCheckPriorWorkspaceFastExpandedPlan(expected.plan)]
    .filter((plan, index, all) => Array.isArray(plan) && plan.length > 0 && all.findIndex((other) => sameStringList(other, plan)) === index);
  const candidatePlans = [...baseCandidatePlans, ...baseCandidatePlans.map((stages) => resumableCheckObsoleteSupervisorAggregatePlan({ stages }))]
    .filter((plan, index, all) => Array.isArray(plan) && plan.length > 0 && all.findIndex((other) => sameStringList(other, plan)) === index);
  const digestMatchedPlans = candidatePlans.filter((plan) => resumableCheckPlanDigest(plan) === packet.plan_digest);
  if (digestMatchedPlans.length === 0) invalid("plan digest is not current or a recognized legacy plan");
  const matchingPlans = digestMatchedPlans.filter((plan) => history.every((stage, index) => plan[index] === stage));
  if (matchingPlans.length === 0) invalid("stage evidence is not an ordered plan prefix");
  if (packet.status === "passed") {
    if (packet.stages.length === 0 || !matchingPlans.some((plan) => plan.length === history.length) || packet.next_stage !== null || !Object.hasOwn(packet, "completed_at")) invalid("passed packet completion is invalid");
    const completedAt = timestamp(packet.completed_at, "completed_at");
    if (completedAt < createdAt || completedAt > updatedAt || packet.stages.some((evidence) => evidence.status !== 0 || evidence.signal !== null || evidence.error_code !== null)) invalid("passed packet completion is invalid");
  } else {
    const failedEvidence = packet.stages.at(-1);
    if (typeof packet.failed_stage !== "string" || packet.stages.length === 0 || packet.next_stage !== packet.failed_stage || failedEvidence.stage !== packet.failed_stage || (failedEvidence.status === 0 && failedEvidence.signal === null && failedEvidence.error_code === null) || packet.stages.slice(0, -1).some((evidence) => evidence.status !== 0 || evidence.signal !== null || evidence.error_code !== null)) invalid("failed packet stage is malformed");
  }
}

function stagedInputDigestForWorktree(cwd) {
  const indexTree = git(["write-tree"], { cwd });
  const tree = indexTree.stdout.trim();
  if (indexTree.code !== 0 || !/^[a-f0-9]{40,64}$/i.test(tree)) throw new Error("Cannot bind check verification packet to the staged input snapshot.");
  return createHash("sha256").update(`index-tree:${tree}`).digest("hex");
}

function createResumableCheckPacket({ taskId, owner, head, planDigest, stagedInputDigest, nextStage }) {
  const createdAt = new Date();
  return {
    schema_version: resumableCheckPacketSchemaVersion,
    task_id: taskId,
    owner,
    head,
    plan_digest: planDigest,
    staged_input_digest: stagedInputDigest,
    stages: [],
    status: "partial",
    next_stage: nextStage,
    created_at: createdAt.toISOString(),
    updated_at: createdAt.toISOString(),
    expires_at: new Date(createdAt.getTime() + resumableCheckPacketTtlMs).toISOString(),
  };
}

function validateResumableCheckPacket(packet, expected) {
  const invalid = (reason) => { throw new Error(`check verification packet is invalid: ${reason}.`); };
  if (!packet || typeof packet !== "object" || Array.isArray(packet)) invalid("packet must be an object");
  const allowedPacketKeys = ["schema_version", "task_id", "owner", "head", "plan_digest", "staged_input_digest", "stages", "status", "next_stage", "created_at", "updated_at", "expires_at", "completed_at", "failed_stage"];
  if (Object.keys(packet).some((key) => !allowedPacketKeys.includes(key))) invalid("packet contains unbounded fields");
  if (packet.schema_version !== resumableCheckPacketSchemaVersion) invalid("schema version is unsupported");
  if (typeof packet.staged_input_digest !== "string" || !/^[a-f0-9]{64}$/i.test(packet.staged_input_digest)) invalid("staged input binding is malformed");
  if (packet.task_id !== expected.taskId || packet.owner !== expected.owner || packet.head !== expected.head || packet.plan_digest !== expected.plan.digest || packet.staged_input_digest !== expected.stagedInputDigest) {
    invalid("binding changed");
  }
  if (!["partial", "passed", "failed"].includes(packet.status)) invalid("status is unsupported");
  if (packet.status === "failed") throw new Error("check verification packet previously failed; refusing to resume.");
  if (!Array.isArray(packet.stages) || packet.stages.length > expected.plan.stages.length) invalid("stage evidence is not an ordered plan prefix");

  const now = Date.now();
  const timestamp = (value, label, { allowNull = false, allowFuture = false } = {}) => {
    if (allowNull && value === null) return null;
    if (typeof value !== "string" || value.length > 80) invalid(`${label} is malformed`);
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed)) invalid(`${label} is malformed`);
    if (!allowFuture && parsed > now + resumableCheckPacketFutureSkewMs) invalid(`${label} is in the future`);
    return parsed;
  };
  const createdAt = timestamp(packet.created_at, "created_at");
  const updatedAt = timestamp(packet.updated_at, "updated_at");
  const expiresAt = timestamp(packet.expires_at, "expires_at", { allowFuture: true });
  if (updatedAt < createdAt || expiresAt <= createdAt) invalid("timestamp ordering is invalid");
  if (expiresAt <= now) invalid("packet expired");
  if (expiresAt - createdAt > resumableCheckPacketTtlMs + resumableCheckPacketFutureSkewMs) invalid("expiry exceeds packet lifetime");

  for (let index = 0; index < packet.stages.length; index += 1) {
    const evidence = packet.stages[index];
    if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) invalid("stage evidence is malformed");
    const allowedKeys = ["completed_at", "error_code", "output", "signal", "stage", "status"];
    if (Object.keys(evidence).some((key) => !allowedKeys.includes(key))) invalid("stage evidence contains unbounded fields");
    if (evidence.stage !== expected.plan.stages[index]) invalid("stage evidence is not an ordered plan prefix");
    const completedAt = timestamp(evidence.completed_at, `stage ${index} completed_at`);
    if (completedAt < createdAt || completedAt > updatedAt) invalid("stage evidence timestamp is invalid");
    if (evidence.status !== 0 || evidence.signal !== null || evidence.error_code !== null || evidence.output !== "omitted") invalid("stage evidence is not a successful metadata-only result");
  }
  if (packet.status === "partial") {
    if (packet.stages.length >= expected.plan.stages.length || packet.next_stage !== expected.plan.stages[packet.stages.length]) invalid("partial packet next stage is invalid");
    if (Object.hasOwn(packet, "completed_at")) invalid("partial packet cannot be complete");
  } else {
    if (packet.stages.length !== expected.plan.stages.length || packet.next_stage !== null) invalid("passed packet completion is invalid");
    const completedAt = timestamp(packet.completed_at, "completed_at");
    if (completedAt < createdAt || completedAt > updatedAt) invalid("completion timestamp is invalid");
  }
}

function runBoundedVerification(verificationPlan, options = {}) {
  const command = Array.isArray(verificationPlan?.command) ? verificationPlan.command : [];
  if (command.length === 0) {
    throw new Error("Verification command is missing or ambiguous.");
  }
  const profile = String(verificationPlan.resolvedProfile || verificationPlan.profile || "unknown");
  const timeoutMs = verificationTimeoutMs(profile);
  const startedAt = Date.now();
  const result = run(command[0], command.slice(1), {
    ...options,
    timeout: timeoutMs,
    killSignal: "SIGKILL",
    preserveChildOutput: profile === "codex-workspace",
    maxBuffer: profile === "codex-workspace" ? verificationDiagnosticCaptureMaxBytes : undefined,
  });
  const elapsedMs = Math.max(0, Date.now() - startedAt);
  const outcome = verificationOutcome(result);
  if (outcome === "success") {
    return result;
  }

  const diagnostic = persistVerificationDiagnostic({
    context: options.diagnosticContext,
    profile,
    command,
    elapsedMs,
    timeoutMs,
    outcome,
    result,
  });

  throw new Error(
    `Verification ${outcome}: profile=${profile}; command=${command.join(" ")}; elapsed_ms=${elapsedMs}; timeout_ms=${timeoutMs}; child_output=omitted; diagnostic=${diagnostic.status}${diagnostic.id ? `:${diagnostic.id}` : ""}. ` +
      "No verification or PR delivery evidence was recorded. Inspect the bounded child diagnostic, then rerun the selected verification after the cause is resolved.",
  );
}

function persistVerificationDiagnostic({ context, profile, command, elapsedMs, timeoutMs, outcome, result }) {
  if (!context?.state || !context?.taskId) return { status: "unavailable" };
  try {
    assertSafeTaskId(context.taskId);
    const diagnosticsDir = join(context.state.tasksDir, ".diagnostics");
    mkdirSync(diagnosticsDir, { recursive: true });
    const child = boundedVerificationDiagnosticChild(profile, result);
    const record = {
      schema_version: verificationDiagnosticSchemaVersion,
      recorded_at: new Date().toISOString(),
      operation: "finish-pr-verification",
      task_id: context.taskId,
      profile,
      command: command.map((value) => String(value)),
      outcome,
      elapsed_ms: elapsedMs,
      timeout_ms: timeoutMs,
      execution: {
        outcome,
        elapsed_ms: elapsedMs,
        timeout_ms: timeoutMs,
        timed_out: outcome === "timeout",
      },
      child: {
        ...child,
        process: {
          status: Number.isInteger(result?.status) ? result.status : null,
          signal: result?.signal || null,
          error_code: result?.errorCode || null,
          error_message: sanitizeVerificationDiagnosticText(result?.errorMessage || "", 320).value || null,
          output_capture_limited: result?.errorCode === "ENOBUFS",
          max_buffer_bytes: profile === "codex-workspace" ? verificationDiagnosticCaptureMaxBytes : null,
        },
      },
      check_projection: boundedCheckProjection(profile, result),
      lock: redactTaskLockInspection(inspectTaskLock(context.state, context.taskId)),
    };
    const fileName = `${context.taskId}-${record.recorded_at.replace(/[:.]/g, "-")}-${randomUUID()}.json`;
    writeFileSync(join(diagnosticsDir, fileName), `${JSON.stringify(record, null, 2)}\n`, { flag: "wx" });
    return { status: "recorded", id: fileName };
  } catch {
    return { status: "unavailable" };
  }
}

function boundedVerificationDiagnosticChild(profile, result) {
  const child = {
    status: Number.isInteger(result?.status) ? result.status : null,
    signal: result?.signal || null,
    error_code: result?.errorCode || null,
    stdout_bytes: Buffer.byteLength(String(result?.stdout || "")),
    stderr_bytes: Buffer.byteLength(String(result?.stderr || "")),
    output: "omitted",
  };
  if (profile !== "codex-workspace") return child;
  return {
    ...child,
    output: "sanitized-tail-v1",
    stdout_tail: sanitizeVerificationDiagnosticText(result?.stdout || "", verificationDiagnosticTailMaxBytes),
    stderr_tail: sanitizeVerificationDiagnosticText(result?.stderr || "", verificationDiagnosticTailMaxBytes),
  };
}

function sanitizeVerificationDiagnosticText(value, maxBytes) {
  const source = String(value || "");
  const sourceBytes = Buffer.byteLength(source);
  let sanitized = source.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
  let redactionCount = sanitized === source ? 0 : 1;
  const redact = (pattern, replacement) => {
    sanitized = sanitized.replace(pattern, () => {
      redactionCount += 1;
      return replacement;
    });
  };
  redact(/(?:github_pat_|sk-|gh[pousr]_)[A-Za-z0-9_-]+/gi, "[redacted-token]");
  redact(/\b[A-Za-z][A-Za-z0-9+.-]*:\/\/[^\s\/@]*@/g, "[redacted-url-userinfo]@");
  redact(/-----BEGIN(?: [A-Z0-9_-]+)? PRIVATE KEY-----[\s\S]*?-----END(?: [A-Z0-9_-]+)? PRIVATE KEY-----/gi, "[redacted-private-key]");
  redact(/(?:["']?[A-Za-z0-9._-]*(?:private[_-]?key|ssh[_-]?private[_-]?key)[A-Za-z0-9._-]*["']?)\s*[:=]\s*(?:"[^"]*"|'[^']*'|\S+)/gi, "[redacted-private-key]");
  redact(/(?:["']?(?:authorization|proxy-authorization|x-api-key)["']?)\s*[:=]\s*(?:"(?:basic|bearer)\s+[^"]*"|'(?:basic|bearer)\s+[^']*'|(?:basic|bearer)\s+\S+|\S+)/gi, "[redacted-credential]");
  redact(/\b(?:basic|bearer)\s+[A-Za-z0-9._~+/=-]+/gi, "[redacted-credential]");
  redact(/(?:["']?[A-Za-z0-9._-]*(?:secret|token|password|credential|api[_-]?key)[A-Za-z0-9._-]*["']?)\s*[:=]\s*(?:"[^"]*"|'[^']*'|\S+)/gi, "[redacted-credential]");
  redact(/\b[A-Za-z0-9._-]*(?:secret|token|password|credential|api[_-]?key)[A-Za-z0-9._-]*\b/gi, "[redacted-sensitive]");
  const rawTail = Buffer.byteLength(sanitized) > maxBytes
    ? Buffer.from(sanitized).subarray(-maxBytes).toString("utf8")
    : sanitized;
  const retained = boundedUtf8Tail(rawTail, maxBytes);
  return {
    bytes: sourceBytes,
    retained_bytes: Buffer.byteLength(retained),
    truncated: sourceBytes > maxBytes,
    redacted: redactionCount > 0,
    redaction_count: redactionCount,
    value: retained,
  };
}

function boundedUtf8Tail(value, maxBytes) {
  let retained = String(value || "");
  while (Buffer.byteLength(retained) > maxBytes) retained = retained.slice(1);
  return retained;
}

function boundedCheckProjection(profile, result) {
  if (profile !== "check") return null;
  const output = `${String(result?.stdout || "")}\n${String(result?.stderr || "")}`;
  let stage = null;
  for (const match of output.matchAll(/(?:^|\n)\s*>\s+pnpm run ([A-Za-z0-9:_-]+)/g)) {
    stage = match[1];
  }
  return {
    stage,
    stage_observed: Boolean(stage),
    result_status: Number.isInteger(result?.status) ? result.status : null,
    raw_output: "omitted",
  };
}

function verificationOutcome(result) {
  if (!result || typeof result !== "object") return "ambiguous-result";
  if (result.errorCode === "ETIMEDOUT") return "timeout";
  if (result.errorCode === "ENOBUFS") return "output-limit";
  if (result.signal) return "signal";
  if (result.errorCode) return "launch-error";
  if (!Number.isInteger(result.status)) return "ambiguous-result";
  if (result.status !== 0) return "nonzero-exit";
  return "success";
}

function requireGh(commandName) {
  const result = run("gh", ["--version"], { cwd: repoRoot });
  if (result.code !== 0) {
    throw new Error(`${commandName} requires GitHub CLI 'gh' to be installed and available on PATH.`);
  }
}

function validateManifest(manifest, path) {
  for (const key of ["task_id", "branch", "worktree_path", "base_branch", "status"]) {
    if (!manifest[key]) {
      throw new Error(`Manifest ${path} is missing required field: ${key}`);
    }
  }
  assertSafeBranch(manifest.branch);
}

function validateAssignment(assignment, path) {
  for (const key of ["assignment_id", "branch", "status"]) {
    if (!assignment[key]) {
      throw new Error(`Assignment ${path} is missing required field: ${key}`);
    }
  }
  assertSafeTaskId(String(assignment.assignment_id));
  assertSafeBranch(String(assignment.branch));
}

function currentLaneOwner(options = {}) {
  const configured = options.owner || process.env.CODEX_WORKSPACE_OWNER || process.env.CODEX_THREAD_ID;
  const owner = configured ? String(configured).trim() : `${process.env.USER || "unknown"}@${hostname() || "unknown-host"}`;
  return owner || "unknown-owner";
}

function laneOwnerWarning(manifest, options = {}) {
  if (!manifest.owner) {
    return "";
  }
  const currentOwner = currentLaneOwner(options);
  if (manifest.owner === currentOwner) {
    return "";
  }
  return [
    `Owner warning: lane is owned by ${manifest.owner}.`,
    `Current runner owner is ${currentOwner}.`,
    "Do not mutate this lane unless the operator confirms it is idle and you pass --take-ownership.",
  ].join(" ");
}

function assertLaneOwner(manifest, options = {}) {
  const warning = laneOwnerWarning(manifest, options);
  if (warning && !options.takeOwnership) {
    throw new Error(
      `${manifest.task_id} is owned by ${manifest.owner}; current runner is ${currentLaneOwner(
        options,
      )}. Use --take-ownership only after confirming the lane is idle.`,
    );
  }
  if (warning && options.takeOwnership && !validTakeoverReason(options.takeoverReason)) {
    throw new Error("--takeover-reason must explain the takeover in at least 10 non-whitespace characters.");
  }
}

function assertExactReconciliationOwner(manifest, options = {}) {
  const recordedOwner = String(manifest.owner || "").trim();
  const currentOwner = String(currentLaneOwner(options) || "").trim();
  if (!recordedOwner) {
    throw new Error(`${manifest.task_id} has no recorded owner; reconcile-merged-pr requires the exact current lane owner.`);
  }
  if (recordedOwner !== currentOwner) {
    throw new Error(`${manifest.task_id} is owned by ${safeMetadataText(recordedOwner, 160)}; reconcile-merged-pr requires exact current-owner match (${safeMetadataText(currentOwner, 160) || "missing"}).`);
  }
}

function assertReconciliationManifestState(manifest) {
  const status = safeMetadataText(manifest.status, 80);
  if (["active", "pr_open", "merged"].includes(status)) {
    return;
  }
  throw new Error(`${manifest.task_id} has unsafe status ${status || "missing"}; reconcile-merged-pr only accepts active, pr_open, or merged manifests.`);
}

function applyVerifiedMergedPrStatus(manifest) {
  assertReconciliationManifestState(manifest);
  if (manifest.status === "merged") {
    return;
  }
  manifest.status = "merged";
}

function validTakeoverReason(value) {
  return String(value || "").replace(/\s+/g, "").length >= 10;
}

function classifyWorkspaceAssignment(manifest, context) {
  if (manifest.status === "closed") {
    return {
      status: "closed",
      reason: "workspace manifest is closed",
      nextAction: "no assignment action",
    };
  }

  if (String(manifest.status || "").startsWith("blocked_authority")) {
    return {
      status: "blocked_authority",
      reason: "manifest is authority-blocked",
      nextAction: "wait for explicit authority approval",
    };
  }

  if (!manifest.worktree_path || !existsSync(manifest.worktree_path)) {
    return {
      status: "ambiguous",
      reason: "worktree path is missing",
      nextAction: "run workspace doctor or rebuild-index before assignment",
    };
  }

  if (manifest.owner && manifest.owner !== context.currentOwner) {
    if (laneOwnerIsStale(manifest, context)) {
      return {
        status: "blocked_stale_owner_needs_takeover",
        reason: `owner heartbeat older than ${context.staleAfterSeconds} seconds`,
        nextAction: "prepare takeover evidence and ask operator before mutation",
      };
    }
    return {
      status: "blocked_owned_active",
      reason: `owned by ${manifest.owner}`,
      nextAction: "do not mutate without explicit takeover approval",
    };
  }

  if (manifest.status === "merged") {
    return {
      status: "cleanup",
      reason: "PR is merged but cleanup is not closed",
      nextAction: "run cleanup-merged dry-run before cleanup",
    };
  }

  if (manifest.status === "cleanup_partial") {
    return {
      status: "cleanup",
      reason: manifest.cleanup_error || "cleanup is partial",
      nextAction: "resume cleanup-merged after confirming branch head evidence",
    };
  }

  if (manifest.status === "pr_open") {
    return {
      status: "delivery",
      reason: "PR is open",
      nextAction: "check PR review, checks, exact head, and merge evidence",
    };
  }

  if (!manifest.owner) {
    return {
      status: "assignable",
      reason: "active workspace has no owner",
      nextAction: "eligible for future claim-next only after dry-run evidence",
    };
  }

  return {
    status: "active",
    reason: "owned by current runner",
    nextAction: "continue lane or update heartbeat in a future phase",
  };
}

function laneOwnerIsStale(manifest, context) {
  const timestamp = Date.parse(manifest.last_heartbeat_at || manifest.owner_updated_at || manifest.updated_at || manifest.created_at || "");
  if (!Number.isFinite(timestamp)) {
    return true;
  }
  return context.generatedAt.getTime() - timestamp > context.staleAfterSeconds * 1000;
}

function classifyBacklogItem(item, manifestBranchStates, assignmentBranchStates = new Map(), manifests = [], assignments = []) {
  if (item.status === "closed" || item.recommendedSliceSize === "complete") {
    return {
      status: "closed",
      reason: "safe backlog item is already complete and must not be requeued",
    };
  }

  if (item.status !== "ready" || item.recommendedSliceSize === "do_not_start") {
    return {
      status: "blocked_authority",
      reason: "safe backlog item is not dispatchable from generic continuation",
    };
  }
  if (!item.startCommand && !item.branchName) {
    return {
      status: "ambiguous",
      reason: "ready item has no source-owned lane start command and branch",
    };
  }
  if (!item.startCommand) {
    return {
      status: "ambiguous",
      reason: "ready item has no source-owned lane start command",
    };
  }
  if (!item.branchName) {
    return {
      status: "ambiguous",
      reason: "ready item has no source-owned lane branch",
    };
  }
  const closedCompletionEvidence = closedSourceCompletionEvidence(item, manifests, assignments);
  if (closedCompletionEvidence) {
    return {
      status: "closed",
      reason: closedCompletionEvidence,
    };
  }
  const branchNameError = item.branchName ? claimBranchNameBlocker(item.branchName) : "";
  if (branchNameError) {
    return {
      status: "ambiguous",
      reason: branchNameError,
    };
  }
  const assignmentState = item.branchName ? assignmentBranchStates.get(item.branchName) : null;
  if (assignmentState === "active") {
    return {
      status: "claimed",
      reason: "lane assignment already exists for branch",
    };
  }
  if (assignmentState === "ambiguous") {
    return {
      status: "ambiguous",
      reason: "multiple active assignment records exist for branch",
    };
  }
  const branchState = item.branchName ? manifestBranchStates.get(item.branchName) : null;
  if (branchState === "active") {
    return {
      status: "active",
      reason: "workspace manifest already exists for branch",
    };
  }
  if (branchState === "closed") {
    return {
      status: "assignable",
      reason: "only closed workspace manifests exist for branch",
    };
  }
  const branchAvailabilityError = item.branchName ? claimBranchAvailabilityBlocker(item.branchName) : "";
  if (branchAvailabilityError) {
    return {
      status: "ambiguous",
      reason: branchAvailabilityError,
    };
  }
  return {
    status: "assignable",
    reason: "ready safe backlog item has no active workspace conflict",
  };
}

function classifyLaneAssignment(assignment, context) {
  if (assignment.status === "closed") {
    return {
      status: "closed",
      reason: "assignment is closed",
      nextAction: "no assignment action",
    };
  }

  if (String(assignment.status || "").startsWith("blocked_authority")) {
    return {
      status: "blocked_authority",
      reason: "assignment is authority-blocked",
      nextAction: "wait for explicit authority approval",
    };
  }

  if (!assignment.owner) {
    return {
      status: "ambiguous",
      reason: "assignment has no owner",
      nextAction: "inspect assignment metadata before mutation",
    };
  }

  if (assignment.owner !== context.currentOwner) {
    if (laneAssignmentIsStale(assignment, context)) {
      return {
        status: "blocked_stale_owner_needs_takeover",
        reason: `assignment heartbeat older than ${context.staleAfterSeconds} seconds`,
        nextAction: "prepare takeover evidence and ask operator before mutation",
      };
    }
    return {
      status: "blocked_owned_active",
      reason: `assigned to ${assignment.owner}`,
      nextAction: "do not mutate without explicit takeover approval",
    };
  }

  return {
    status: "claimed",
    reason: "assignment is owned by current runner",
    nextAction: "continue lane or refresh claim evidence",
  };
}

function laneAssignmentIsStale(assignment, context) {
  const timestamp = Date.parse(
    assignment.last_heartbeat_at || assignment.updated_at || assignment.assigned_at || assignment.created_at || "",
  );
  if (!Number.isFinite(timestamp)) {
    return true;
  }
  return context.generatedAt.getTime() - timestamp > context.staleAfterSeconds * 1000;
}

function evaluateClaimCandidate(item, manifests, assignments, context) {
  const base = {
    item,
    claimable: false,
    action: "",
    mutation: "",
    status: "ambiguous",
    reason: "",
    nextAction: "inspect safe backlog evidence before claiming",
  };

  if (item.status === "closed" || item.recommendedSliceSize === "complete") {
    return {
      ...base,
      status: "closed",
      reason: "safe backlog item is already complete and must not be requeued",
      nextAction: "choose the next ready safe backlog lane",
    };
  }

  if (item.status !== "ready" || item.recommendedSliceSize === "do_not_start") {
    return {
      ...base,
      status: "blocked_authority",
      reason: "safe backlog item is not dispatchable from generic continuation",
      nextAction: "wait for explicit authority approval",
    };
  }

  if (!item.startCommand || !item.branchName) {
    return {
      ...base,
      status: "ambiguous",
      reason: "ready item has no source-owned lane start command and branch",
      nextAction: "add source-owned nextLane metadata before claim",
    };
  }

  const closedCompletionEvidence = closedSourceCompletionEvidence(item, manifests, assignments);
  if (closedCompletionEvidence) {
    return {
      ...base,
      status: "closed",
      reason: closedCompletionEvidence,
      nextAction: "choose the next ready safe backlog lane",
    };
  }

  const branchNameError = claimBranchNameBlocker(item.branchName);
  if (branchNameError) {
    return {
      ...base,
      status: "ambiguous",
      reason: branchNameError,
      nextAction: "resolve branch evidence before claim",
    };
  }

  const branchManifests = manifests.filter((manifest) => manifest.branch === item.branchName);
  const activeManifests = branchManifests.filter((manifest) => manifest.status !== "closed");
  if (activeManifests.length > 1) {
    return {
      ...base,
      status: "ambiguous",
      reason: `multiple active workspace manifests exist for ${item.branchName}`,
      nextAction: "run workspace doctor and resolve duplicate manifests before claim",
    };
  }

  if (activeManifests.length === 1) {
    const manifest = activeManifests[0];
    const assignment = classifyWorkspaceAssignment(manifest, context);
    if (!manifest.owner && assignment.status === "assignable") {
      return {
        ...base,
        claimable: true,
        action: `claim existing unowned workspace ${manifest.task_id}`,
        mutation: "manifest_owner_claim",
        targetTaskId: manifest.task_id,
        status: "assignable",
        reason: "ready safe backlog lane has an unowned active workspace",
        nextAction: "--apply may write owner evidence to the existing manifest",
      };
    }
    return {
      ...base,
      status: assignment.status,
      reason: assignment.reason,
      nextAction: assignment.nextAction,
    };
  }

  const openAssignments = activeAssignmentsForBranch(assignments, item.branchName);
  if (openAssignments.length > 1) {
    return {
      ...base,
      status: "ambiguous",
      reason: `multiple active lane assignments exist for ${item.branchName}`,
      nextAction: "inspect assignment metadata before claim",
    };
  }

  if (openAssignments.length === 1) {
    const assignment = openAssignments[0];
    const classification = classifyLaneAssignment(assignment, context);
    if (assignment.owner === context.currentOwner && classification.status === "claimed") {
      return {
        ...base,
        claimable: true,
        action: `refresh existing assignment ${assignment.assignment_id}`,
        mutation: "assignment_refresh",
        targetAssignmentId: assignment.assignment_id,
        status: "claimed",
        reason: "ready safe backlog lane is already claimed by current runner",
        nextAction: "--apply may refresh assignment evidence",
      };
    }
    return {
      ...base,
      status: classification.status,
      reason: classification.reason,
      nextAction: classification.nextAction,
    };
  }

  const branchAvailabilityError = claimBranchAvailabilityBlocker(item.branchName);
  if (branchAvailabilityError) {
    return {
      ...base,
      status: "ambiguous",
      reason: branchAvailabilityError,
      nextAction: "resolve branch evidence before claim",
    };
  }

  return {
    ...base,
    claimable: true,
    action: "claim ready safe backlog lane",
    mutation: "assignment_write",
    targetAssignmentId: item.itemId,
    status: "assignable",
    reason:
      branchManifests.length > 0
        ? "only closed workspace manifests exist for branch"
        : "ready safe backlog lane has no workspace conflict",
    nextAction: "--apply may write assignment evidence only",
  };
}

function activeAssignmentsForBranch(assignments, branchName) {
  return assignments.filter((assignment) => assignment.branch === branchName && assignment.status !== "closed");
}

function closedSourceCompletionEvidence(item, manifests, assignments) {
  const itemId = String(item.itemId || "").trim();
  if (!itemId) {
    return "";
  }
  const branchName = String(item.branchName || "").trim();
  const assignment = assignments.find((record) => {
    if (record.status !== "closed") return false;
    if (record.assignment_id === itemId || record.lane_slug === itemId || record.source_backlog_item?.item_id === itemId) {
      return true;
    }
    return Boolean(branchName && record.branch === branchName && record.source_backlog_item?.item_id === itemId);
  });
  if (assignment) {
    return `closed assignment evidence exists for ${itemId}`;
  }

  const manifest = manifests.find((record) => {
    if (record.status !== "closed") return false;
    if (record.source_assignment_id === itemId || record.source_backlog_item?.item_id === itemId) {
      return true;
    }
    return Boolean(
      branchName &&
        record.branch === branchName &&
        (record.source_assignment_id === itemId || record.source_backlog_item?.item_id === itemId),
    );
  });
  if (manifest) {
    return `closed workspace evidence exists for ${itemId}`;
  }

  return "";
}

function assignmentBranchStatesByBranch(assignments) {
  const grouped = new Map();
  for (const assignment of assignments) {
    if (!assignment.branch || assignment.status === "closed") {
      continue;
    }
    const count = grouped.get(assignment.branch) || 0;
    grouped.set(assignment.branch, count + 1);
  }

  const states = new Map();
  for (const [branch, count] of grouped) {
    states.set(branch, count > 1 ? "ambiguous" : "active");
  }
  return states;
}

function applyClaimNext(selected, context) {
  const applyMutation = () => {
    assertNoActiveEmergencyStop(context.state, "claim-next");
    if (selected.mutation === "manifest_owner_claim") {
      return applyManifestOwnerClaim(selected, context);
    }

    if (selected.mutation === "assignment_write" || selected.mutation === "assignment_refresh") {
      return applyAssignmentClaim(selected, context);
    }

    throw new Error(`Unsupported claim mutation: ${selected.mutation || "unknown"}`);
  };
  return context.emergencyStopLockHeld === true ? applyMutation() : withEmergencyStopLock(context.state, applyMutation);
}

function emergencyStopCheckpointPath(state) {
  return join(state.root, "emergency-stop.json");
}

function emergencyStopLockPath(state) {
  return join(state.root, "emergency-stop.lock");
}

function readEmergencyStopCheckpoint(state) {
  const path = emergencyStopCheckpointPath(state);
  if (!existsSync(path)) {
    return null;
  }
  let packet;
  try {
    packet = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`Emergency stop checkpoint is invalid JSON: ${path}: ${error.message}`);
  }
  if (!isEmergencyStopCheckpoint(packet)) {
    throw new Error(`Emergency stop checkpoint is invalid: ${path}`);
  }
  return packet;
}

function isEmergencyStopCheckpoint(packet) {
  if (!packet || typeof packet !== "object" || Array.isArray(packet)) return false;
  if (packet.schema_version !== 1) return false;
  if (!["apply", "clear"].includes(packet.action)) return false;
  if (!["active", "cleared"].includes(packet.status)) return false;
  if (typeof packet.checkpoint_id !== "string" || packet.checkpoint_id.trim().length === 0) return false;
  if (packet.status === "active" && !["pause", "drain", "kill"].includes(packet.mode)) return false;
  if (typeof packet.owner !== "string" || packet.owner.trim().length === 0) return false;
  if (typeof packet.state_root !== "string" || packet.state_root.trim().length === 0) return false;
  if (!packet.controls || typeof packet.controls !== "object" || Array.isArray(packet.controls)) return false;
  if (!Array.isArray(packet.stop_lines)) return false;
  return true;
}

function activeEmergencyStop(state) {
  const packet = readEmergencyStopCheckpoint(state);
  return packet?.status === "active" ? packet : null;
}

function assertNoActiveEmergencyStop(state, commandName) {
  const packet = activeEmergencyStop(state);
  if (packet) {
    throw new Error(emergencyStopBlocker(packet, commandName));
  }
}

function emergencyStopBlocker(packet, commandName = "workspace mutation") {
  const checkpointId = packet?.checkpoint_id || "unknown";
  const mode = packet?.mode || "unknown";
  return `${commandName} blocked by active emergency stop ${checkpointId} (${mode}); clear the checkpoint before new claim, dispatch, provider, worker, branch, PR, or cleanup mutation.`;
}

function buildEmergencyStopApplyPacket({ state, currentOwner, generatedAt, options, existing }) {
  const mode = normalizeEmergencyStopMode(options.mode || "pause");
  const reason = String(options.reason || "").trim();
  const blockers = [];
  if (mode === "kill" && options.apply && !validEmergencyStopReason(options.approval)) {
    blockers.push("--approval must record operator approval for --mode kill --apply");
  }

  const checkpointId = `emergency-stop-${generatedAt.toISOString().replace(/[-:.]/g, "").replace("T", "-").replace("Z", "z")}`;
  return {
    schema_version: 1,
    action: "apply",
    status: "active",
    checkpoint_id: checkpointId,
    owner: currentOwner,
    mode,
    reason,
    approval: mode === "kill" ? String(options.approval || "").trim() : null,
    acknowledged_at: generatedAt.toISOString(),
    state_root: state.root,
    previous_checkpoint: existing ? summarizeEmergencyStop(existing) : null,
    controls: emergencyStopControls(mode),
    resume_checkpoint: emergencyStopResumeCheckpoint(),
    stop_lines: emergencyStopStopLines(mode),
    mutation: "metadata checkpoint only; no worker, provider, branch, PR, cleanup, external, or process mutation",
    allowed: blockers.length === 0,
    blockers,
  };
}

function buildEmergencyStopClearPacket({ state, currentOwner, generatedAt, options, existing }) {
  const blockers = [];
  if (existing?.status !== "active") {
    blockers.push("no active emergency stop checkpoint to clear");
  }
  if (options.apply && !validEmergencyStopReason(options.approval)) {
    blockers.push("--approval must record operator approval for --clear --apply");
  }
  return {
    schema_version: 1,
    action: "clear",
    status: "cleared",
    checkpoint_id: existing?.checkpoint_id || `emergency-stop-clear-${generatedAt.toISOString().replace(/[-:.]/g, "").replace("T", "-").replace("Z", "z")}`,
    owner: currentOwner,
    mode: existing?.mode || null,
    reason: String(options.reason || "").trim(),
    approval: String(options.approval || "").trim(),
    cleared_at: generatedAt.toISOString(),
    state_root: state.root,
    previous_checkpoint: existing ? summarizeEmergencyStop(existing) : null,
    controls: {
      new_claim_allowed: true,
      new_dispatch_allowed: true,
      provider_or_external_mutation_allowed: false,
      worker_process_mutation_allowed: false,
      branch_pr_cleanup_mutation_allowed: false,
    },
    resume_checkpoint: {
      next_safe_action: "rerun claim-next or dispatch-next dry-run before applying new work",
      required_evidence: [
        "operator-approved resume or clear reason",
        "fresh dry-run packet after clear",
        "normal lane authority gates still apply",
      ],
    },
    stop_lines: emergencyStopClearStopLines(),
    mutation: "metadata checkpoint clear only; no worker, provider, branch, PR, cleanup, external, or process mutation",
    allowed: blockers.length === 0,
    blockers,
  };
}

function applyEmergencyStopCheckpoint(state, packet) {
  return withEmergencyStopLock(state, () => {
    const fresh = readEmergencyStopCheckpoint(state);
    const previousCheckpointId = packet.previous_checkpoint?.checkpointId || null;
    if (packet.action === "clear" && (fresh?.status !== "active" || fresh?.checkpoint_id !== previousCheckpointId)) {
      throw new Error("Emergency stop clear target changed; rerun emergency-stop --dry-run.");
    }
    if (packet.action === "apply" && fresh?.status === "active" && fresh.checkpoint_id !== previousCheckpointId) {
      throw new Error("Emergency stop checkpoint changed; rerun emergency-stop --dry-run.");
    }
    const path = emergencyStopCheckpointPath(state);
    const written = { ...packet, written_at: new Date().toISOString() };
    writeJsonAtomic(path, written);
    return { path, packet: written };
  });
}

function withEmergencyStopLock(state, fn) {
  mkdirSync(state.root, { recursive: true });
  const lockPath = emergencyStopLockPath(state);
  clearStaleEmergencyStopLock(lockPath);
  let fd;
  try {
    fd = openSync(lockPath, "wx");
  } catch (error) {
    if (error?.code !== "EEXIST") {
      throw error;
    }
    throw new Error(`Emergency stop checkpoint is locked by another session: ${lockPath}`);
  }

  try {
    return fn();
  } finally {
    closeSync(fd);
    rmSync(lockPath, { force: true });
  }
}

function clearStaleEmergencyStopLock(lockPath) {
  if (!existsSync(lockPath)) return;
  const staleAfterMs = 5 * 60 * 1000;
  const stats = statSync(lockPath);
  if (Date.now() - stats.mtimeMs > staleAfterMs) {
    rmSync(lockPath, { force: true });
  }
}

function writeJsonAtomic(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const tempPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(tempPath, path);
}

function normalizeEmergencyStopMode(value) {
  const mode = String(value || "pause").trim();
  if (!["pause", "drain", "kill"].includes(mode)) {
    throw new Error("--mode must be one of: pause, drain, kill.");
  }
  return mode;
}

function validEmergencyStopReason(value) {
  return String(value || "").replace(/\s+/g, "").length >= 10;
}

function emergencyStopControls(mode) {
  return {
    new_claim_allowed: false,
    new_dispatch_allowed: false,
    provider_or_external_mutation_allowed: false,
    worker_process_mutation_allowed: false,
    branch_pr_cleanup_mutation_allowed: false,
    requested_worker_posture: mode,
    worker_process_action: "none; process pause, drain, or kill must be performed by a separately approved operator action",
  };
}

function emergencyStopResumeCheckpoint() {
  return {
    clear_command:
      "node ./scripts/codex-workspace.mjs emergency-stop --clear --apply --reason '<operator-approved resume reason>' --approval '<operator approval evidence>'",
    next_safe_action: "clear only after operator-approved resume, then rerun claim-next or dispatch-next dry-run",
    required_evidence: [
      "active emergency stop checkpoint id",
      "operator-approved resume or clear reason",
      "fresh dry-run packet after clear",
      "normal lane authority gates still apply",
    ],
  };
}

function emergencyStopStopLines(mode) {
  const lines = [
    "no new claim-next --apply while checkpoint is active",
    "no new dispatch-next --apply while checkpoint is active",
    "no provider/model calls or paid usage while checkpoint is active",
    "no branch, PR, merge, cleanup, or delivery mutation while checkpoint is active",
    "no worker/process mutation from this command",
  ];
  if (mode === "kill") {
    lines.push("kill mode records intent only; process termination requires separate explicit operator action");
  }
  return lines;
}

function emergencyStopClearStopLines() {
  return [
    "clear only resumes eligibility for normal dry-run and authority gates",
    "no provider/model calls, worker/process mutation, branch, PR, merge, cleanup, or delivery mutation from clear",
  ];
}

function summarizeEmergencyStop(packet) {
  if (!packet) {
    return null;
  }
  return {
    checkpointId: packet.checkpoint_id || null,
    status: packet.status || null,
    mode: packet.mode || null,
    owner: packet.owner || null,
    acknowledgedAt: packet.acknowledged_at || null,
    clearedAt: packet.cleared_at || null,
  };
}

function summarizeEmergencyStopPacket(packet, { dryRun = false } = {}) {
  return {
    action: packet.action,
    status: packet.status,
    checkpointId: packet.checkpoint_id,
    owner: packet.owner,
    mode: packet.mode,
    stateRoot: packet.state_root,
    allowed: packet.allowed,
    blockers: packet.blockers,
    controls: packet.controls,
    resumeCheckpoint: packet.resume_checkpoint,
    stopLines: packet.stop_lines,
    previousCheckpoint: packet.previous_checkpoint,
    mutation: dryRun ? "none; dry-run summary only" : packet.mutation,
  };
}

function printEmergencyStopPacket(label, packet) {
  console.log(`${label}: emergency-stop`);
  console.log(`- action ${packet.action}`);
  console.log(`- checkpoint ${packet.checkpoint_id}`);
  console.log(`- status ${packet.status}`);
  console.log(`- mode ${packet.mode || "none"}`);
  console.log(`- owner ${packet.owner}`);
  console.log(`- allowed ${packet.allowed !== false}`);
  console.log(`- mutation ${packet.mutation}`);
  for (const line of packet.stop_lines || []) {
    console.log(`- stop line ${line}`);
  }
  if (packet.blockers?.length) {
    for (const blocker of packet.blockers) {
      console.log(`- blocker ${blocker}`);
    }
  } else {
    console.log("- blockers none");
  }
}

function dispatchPlan(context) {
  const { evaluations, manifests, assignments } = dispatchCandidateEvaluations(context);
  const deliveryWorkspaceCount = openDeliveryWorkspaceCount(context);
  const bounded = applyCurrentOwnerSessionBounds({
    evaluations,
    manifests,
    assignments,
    currentOwner: context.currentOwner,
    generatedAt: context.generatedAt,
    staleAfterSeconds: context.staleAfterSeconds,
    mode: "dispatch-next",
  });
  const selected = deliveryWorkspaceCount > 0 ? null : bounded.selected;
  const packet = dispatchPacket(selected, bounded.evaluations, context);
  return {
    evaluations: bounded.evaluations,
    selected,
    packet,
  };
}

function dispatchCandidateEvaluations(context) {
  const manifests = readManifests(context.state).map(({ manifest }) => manifest);
  const assignments = readAssignments(context.state).map(({ assignment }) => assignment);
  const backlogItems = readSafeBacklogItems({ stateRootPath: context.state.root });
  const evaluations = backlogItems.map((item) =>
    evaluateClaimCandidate(item, manifests, assignments, {
      currentOwner: context.currentOwner,
      generatedAt: context.generatedAt,
      staleAfterSeconds: context.staleAfterSeconds,
    }),
  );
  return { evaluations, manifests, assignments };
}

function dispatchCandidateStateCounts(context) {
  return queueCandidateStateCounts(dispatchCandidateEvaluations(context).evaluations);
}

function dispatchPacket(selected, evaluations, context) {
  const blockers = [];
  const stop = activeEmergencyStop(context.state);
  if (!selected) {
    blockers.push("no dispatchable safe backlog lane found");
  }
  if (stop) {
    blockers.push(emergencyStopBlocker(stop, "dispatch-next"));
  }
  const candidateStateCounts = queueCandidateStateCounts(evaluations);
  const deliveryWorkspaceCount = openDeliveryWorkspaceCount(context);
  if (deliveryWorkspaceCount > 0) {
    candidateStateCounts.delivery = Math.max(candidateStateCounts.delivery || 0, deliveryWorkspaceCount);
  }
  if (stop) {
    candidateStateCounts.emergency_stop = 1;
  }
  const nextActionGuidance = stop
    ? "clear the active emergency stop checkpoint only after operator-approved resume, then rerun dispatch-next dry-run"
    : dispatchNextActionGuidance(selected, candidateStateCounts);
  const stopLines = stopLinesForSafeBacklogItem(selected?.item, defaultDispatchStopLines());
  const blockedCandidates = evaluations
    .filter((evaluation) => !evaluation.claimable)
    .map((evaluation) => ({
      item_id: evaluation.item.itemId,
      status: evaluation.status,
      reason_code: reasonCodeForClassification(evaluation),
      reason: evaluation.reason,
      next_action: evaluation.nextAction,
    }));
  const allowed = blockers.length === 0;

  return {
    schema_version: 1,
    selected_lane: selected?.item.itemId || null,
    owner: context.currentOwner,
    branch: selected?.item.branchName || null,
    base_branch: selected ? dispatchPacketBaseBranch(selected, context) : null,
    claim_action: selected?.action || null,
    claim_mutation: selected?.mutation || null,
    workspace_action: selected ? dispatchWorkspaceAction(selected) : null,
    readiness_profile: context.readinessProfile,
    next_command: selected ? dispatchNextCommand(selected, context.readinessProfile) : null,
    handoff: selected ? "runner may resume prepared worktree; no worker or provider process launched" : null,
    stop_lines: stopLines,
    allowed,
    blockers,
    next_action_guidance: nextActionGuidance,
    generated_at: context.generatedAt.toISOString(),
    candidate_state_counts: candidateStateCounts,
    authority_decision: shapeAuthorityDecisionEvidence({
      operation: "dispatch-next",
      authorityFamily: "worker-mutation",
      decision: allowed ? "allowed_for_apply_review" : "blocked",
      allowed,
      requiredGates: [
        "source-owned safe backlog item is ready",
        "no active delivery lane blocks dispatch",
        "no authority-blocked lane mutation",
        "no provider/model calls",
        "no automatic worker process launch",
      ],
      satisfiedGates: selected
        ? [
            "source-owned safe backlog item is ready",
            "no active delivery lane blocks dispatch",
            "no authority-blocked lane mutation",
            "no provider/model calls",
            "no automatic worker process launch",
          ]
        : [],
      blockedReasons: dispatchNextBlockedReasons({
        next_action_guidance: nextActionGuidance,
        blockers,
        blocked_candidates: blockedCandidates,
      }),
      stopLines,
      evidenceRefs: selected
        ? [`lane:${selected.item.itemId}`, `branch:${selected.item.branchName || "unknown"}`]
        : ["dispatch:blockers"],
      nextSafeAction: nextActionGuidance,
      recoveryPath: "Resolve blocked candidates or review the dry-run packet before rerunning dispatch-next --apply.",
      generatedAt: context.generatedAt.toISOString(),
    }),
    blocked_candidates: blockedCandidates,
  };
}

function buildDispatchNextSummary({ state, currentOwner, staleAfterSeconds, readinessProfile, plan }) {
  const blockedCandidates = plan.evaluations.filter((evaluation) => !evaluation.claimable);
  const targetComponents = dispatchContinuousTargetComponents(plan.packet);
  return {
    currentOwner,
    stateRoot: state.root,
    staleAfterSeconds,
    readinessProfile,
    selected: plan.selected ? summarizeClaimEvaluation(plan.selected) : null,
    laneAssignmentPreview: buildAssignmentPreview({
      selected: plan.selected,
      currentOwner,
      mode: "dispatch-next",
      blockedReasons: dispatchNextBlockedReasons(plan.packet),
      blockedRequiredEvidence: dispatchNextBlockedRequiredEvidence(),
    }),
    dispatch: {
      allowed: plan.packet.allowed,
      selectedLane: plan.packet.selected_lane,
      branch: plan.packet.branch,
      baseBranch: plan.packet.base_branch,
      claimAction: plan.packet.claim_action,
      claimMutation: plan.packet.claim_mutation,
      workspaceAction: plan.packet.workspace_action,
      nextCommand: plan.packet.next_command,
      nextActionGuidance: plan.packet.next_action_guidance,
      blockers: plan.packet.blockers,
      stopLines: plan.packet.stop_lines,
      authorityDecision: plan.packet.authority_decision,
      generatedAt: plan.packet.generated_at,
    },
    continuousSelection: {
      code: "continuous-dispatch-apply",
      mutationClass: "assignment_workspace_claim_only",
      targetComponents,
      targetKey: targetComponents.join("|"),
      allowed: plan.packet.allowed === true,
      status: plan.packet.allowed === true ? "ready" : "blocked",
    },
    counts: {
      total: plan.evaluations.length,
      dispatchable: plan.evaluations.filter((evaluation) => evaluation.claimable).length,
      blocked: blockedCandidates.length,
    },
    candidateStateCounts: plan.packet.candidate_state_counts,
    blockedCandidateReasonCodeCounts: countByField(plan.packet.blocked_candidates, "reason_code"),
    blockedCandidates: plan.packet.blocked_candidates.slice(0, 10),
    blockedCandidatesTruncated: plan.packet.blocked_candidates.length > 10,
    mutation: "none; dry-run summary only",
  };
}

function buildDispatchNextApplySummary({ state, currentOwner, staleAfterSeconds, readinessProfile, plan, applied }) {
  return {
    ok: true,
    status: "applied",
    currentOwner,
    stateRoot: state.root,
    staleAfterSeconds,
    readinessProfile,
    selected: plan.selected ? summarizeClaimEvaluation(plan.selected) : null,
    dispatch: {
      allowed: true,
      selectedLane: applied.packet.lane,
      branch: applied.packet.branch,
      workspaceAction: applied.packet.workspace_action,
      worktreePath: applied.packet.worktree_path,
      taskId: applied.packet.task_id,
      nextCommand: applied.packet.next_command,
      handoff: applied.packet.handoff,
      readiness: applied.packet.readiness,
      localArtifactSeed: applied.packet.local_artifact_seed,
      stopLines: applied.packet.stop_lines,
      authorityDecision: applied.packet.authority_decision,
      generatedAt: applied.packet.generated_at,
    },
    assignmentPath: applied.assignmentPath || null,
    manifestPath: applied.manifestPath || applied.path || null,
    mutation: "assignment claim and workspace handoff metadata written; no worker/provider process launched",
    mutationClass: "assignment_workspace_claim_and_handoff_metadata",
    rawPayloadRetained: false,
  };
}

function buildDispatchNextBlockedApplySummary({ state, currentOwner, staleAfterSeconds, readinessProfile, plan }) {
  return {
    ok: false,
    status: "blocked",
    ...buildDispatchNextSummary({ state, currentOwner, staleAfterSeconds, readinessProfile, plan }),
    mutation: "none; blocked apply made no assignment/workspace mutation",
    rawPayloadRetained: false,
  };
}

function dispatchContinuousTargetComponents(packet = {}) {
  return [
    packet.selected_lane ? `assignment:${packet.selected_lane}` : "",
    packet.branch ? `branch:${packet.branch}` : "",
  ].filter(Boolean).sort();
}

function dispatchNextBlockedReasons(packet) {
  const blockers = Array.isArray(packet.blockers) ? packet.blockers : [];
  if (packet.selected_lane && blockers.length === 0) {
    return [];
  }
  const blockedCandidates = Array.isArray(packet.blocked_candidates) ? packet.blocked_candidates : [];
  const reasons = [
    packet.next_action_guidance,
    ...blockers,
    ...blockedCandidates.slice(0, 10).map((candidate) => {
      const reason = candidate.reason || candidate.next_action || "no reason recorded";
      return `${candidate.item_id}: ${candidate.status} - ${reason}`;
    }),
  ].filter(Boolean);
  return [...new Set(reasons)];
}

function dispatchNextBlockedRequiredEvidence() {
  return ["resolve blockers before applying dispatch-next"];
}

function dispatchNextActionGuidance(selected, counts = {}) {
  if (selected) {
    return "run dispatch-next --apply with the same --owner after reviewing the dry-run packet";
  }
  if (counts.delivery > 0) {
    return "finish open delivery lanes first: verify PR checks, review threads, exact head, merge evidence, then run merged-lane cleanup";
  }
  if (counts.cleanup > 0) {
    return "run cleanup-merged dry-run for merged lanes before claiming more work";
  }
  if (counts.blocked_stale_owner_needs_takeover > 0) {
    return "prepare takeover evidence for stale owned lanes and ask the operator before mutation";
  }
  if (counts.blocked_owned_active > 0) {
    return "wait for active owned lanes or get explicit takeover approval before mutation";
  }
  if (counts.blocked_authority > 0) {
    return "wait for explicit authority approval before starting blocked-authority work";
  }
  if (counts.ambiguous > 0) {
    return "resolve ambiguous workspace or assignment evidence before claiming another lane";
  }
  return "add or refresh source-owned safe backlog next-lane metadata";
}

function queueCandidateStateCounts(evaluations) {
  const counts = {};
  for (const evaluation of evaluations) {
    if (typeof evaluation.status !== "string" || !evaluation.status.trim()) {
      const itemId = evaluation.item?.itemId || "unknown";
      throw new Error(`Dispatch candidate ${itemId} is missing a status.`);
    }
    const status = evaluation.status;
    counts[status] = (counts[status] || 0) + 1;
  }
  return counts;
}

function selectClaimableEvaluation(evaluations) {
  const claimedByCurrentRunner = evaluations.find(
    (evaluation) => evaluation.claimable && evaluation.status === "claimed" && evaluation.mutation === "assignment_refresh",
  );
  if (claimedByCurrentRunner) {
    return claimedByCurrentRunner;
  }
  return evaluations.reduce((selected, evaluation) => {
    if (!evaluation.claimable) {
      return selected;
    }
    if (!selected) {
      return evaluation;
    }
    const selectedPriority = safeBacklogPriorityRank(selected.item);
    const candidatePriority = safeBacklogPriorityRank(evaluation.item);
    return candidatePriority < selectedPriority ? evaluation : selected;
  }, null);
}

function safeBacklogPriorityRank(item) {
  const priority = String(item?.priority || "").trim().toUpperCase();
  const match = priority.match(/^P(\d+)$/);
  return match ? Number(match[1]) : 99;
}

function openDeliveryWorkspaceCount(context) {
  return readManifests(context.state).filter(({ manifest }) => manifest.status === "pr_open").length;
}

function formatQueueCandidateStateCounts(counts = {}) {
  const preferredOrder = [
    "assignable",
    "active",
    "claimed",
    "ambiguous",
    "blocked_authority",
    "blocked_owned_active",
    "blocked_stale_owner_needs_takeover",
    "closed",
  ];
  const keys = [
    ...preferredOrder.filter((key) => Object.hasOwn(counts, key)),
    ...Object.keys(counts)
      .filter((key) => !preferredOrder.includes(key))
      .sort(),
  ];
  return keys.map((key) => `${key}=${counts[key]}`).join(" ");
}

function applyDispatchNext(plan, context) {
  return withEmergencyStopLock(context.state, () => {
    assertNoActiveEmergencyStop(context.state, "dispatch-next");
    if (!plan.selected) {
      throw new Error("No dispatchable safe backlog lane found.");
    }
    preflightDispatchWorkspaceBase(plan.selected, context);

    const claim = applyClaimNext(plan.selected, {
      state: context.state,
      options: context.options,
      currentOwner: context.currentOwner,
      staleAfterSeconds: context.staleAfterSeconds,
      emergencyStopLockHeld: true,
    });

    if (plan.selected.mutation === "manifest_owner_claim") {
      return applyManifestDispatch(plan.selected, claim.path, context, {
        assignmentPath: null,
        workspaceAction: "claim_existing_workspace",
      });
    }

    const assignmentPathForClaim = claim.path;
    const assignment = readAssignment(assignmentPathForClaim);
    validateAssignment(assignment, assignmentPathForClaim);
    const existingManifest = dispatchManifestForAssignment(context.state, assignment);
    const manifestResult = existingManifest
      ? { path: existingManifest.path, manifest: existingManifest.manifest, workspaceAction: "resume_existing_workspace" }
      : createDispatchWorkspace(plan.selected.item, assignment, context);

    const readiness = runDispatchReadiness(manifestResult.manifest.worktree_path, context);
    const candidateStateCounts = dispatchCandidateStateCounts(context);
    const packet = dispatchHandoffPacket(
      plan.selected,
      context,
      manifestResult.manifest,
      readiness,
      manifestResult.workspaceAction,
      candidateStateCounts,
    );

    withManifestLock(context.state, manifestResult.manifest.task_id, () => {
      const manifest = readManifest(manifestResult.path);
      validateManifest(manifest, manifestResult.path);
      recordManifestDispatchHandoff(manifest, packet, context);
      writeManifest(manifestResult.path, manifest);
    });

    withAssignmentLock(context.state, assignment.assignment_id, () => {
      const freshAssignment = readAssignment(assignmentPathForClaim);
      validateAssignment(freshAssignment, assignmentPathForClaim);
      recordAssignmentDispatchHandoff(freshAssignment, packet, manifestResult.manifest, context);
      writeAssignment(assignmentPathForClaim, freshAssignment);
    });

    if (readiness.status === "failed") {
      throw new Error(`Dispatch readiness failed for ${manifestResult.manifest.task_id}.`);
    }

    return {
      path: manifestResult.path,
      assignmentPath: assignmentPathForClaim,
      manifestPath: manifestResult.path,
      packet,
    };
  });
}

function applyManifestDispatch(selected, manifestPath, context, { assignmentPath, workspaceAction }) {
  const manifest = readManifest(manifestPath);
  validateManifest(manifest, manifestPath);
  const readiness = runDispatchReadiness(manifest.worktree_path, context);
  const packet = dispatchHandoffPacket(
    selected,
    context,
    manifest,
    readiness,
    workspaceAction,
    dispatchCandidateStateCounts(context),
  );

  withManifestLock(context.state, manifest.task_id, () => {
    const freshManifest = readManifest(manifestPath);
    validateManifest(freshManifest, manifestPath);
    recordManifestDispatchHandoff(freshManifest, packet, context);
    writeManifest(manifestPath, freshManifest);
  });

  if (readiness.status === "failed") {
    throw new Error(`Dispatch readiness failed for ${manifest.task_id}.`);
  }

  return {
    path: manifestPath,
    assignmentPath,
    manifestPath,
    packet,
  };
}

function dispatchManifestForAssignment(state, assignment) {
  if (!assignment.worktree_path) {
    return null;
  }
  const matches = readManifests(state).filter(
    ({ manifest }) =>
      manifest.status !== "closed" &&
      manifest.branch === assignment.branch &&
      manifest.worktree_path === assignment.worktree_path,
  );
  if (matches.length > 1) {
    throw new Error(`Multiple active manifests match assignment ${assignment.assignment_id}.`);
  }
  return matches[0] || null;
}

function createDispatchWorkspace(item, assignment, context) {
  const branch = String(item.branchName || assignment.branch || "");
  assertSafeBranch(branch);
  const usingDefaultBase = !context.options.base;
  const baseBranch = String(context.options.base || defaultBaseBranch);
  assertSafeBaseBranch(baseBranch);
  const taskId = String(context.options.taskId || nextDispatchTaskId(context.state, laneSlugFromBranch(branch)));
  assertSafeTaskId(taskId);
  const worktreePath = resolve(String(context.options.worktree || join(context.state.worktreesDir, taskId)));
  const manifestPath = join(context.state.tasksDir, `${taskId}.json`);
  const shouldFetch = !context.options.noFetch;

  if (existsSync(manifestPath)) {
    throw new Error(`Task manifest already exists: ${manifestPath}`);
  }
  if (existsSync(worktreePath)) {
    throw new Error(`Worktree path already exists: ${worktreePath}`);
  }
  const useDetachedTestWorktree = shouldUseDetachedTestWorktreeForExistingSafeBacklogBranch(item, branch, context.state.root);
  if (!useDetachedTestWorktree && branchExists(branch)) {
    throw new Error(`Branch already exists: ${branch}`);
  }
  if (!useDetachedTestWorktree && remoteBranchExists(branch)) {
    throw new Error(`Remote branch already exists: origin/${branch}`);
  }
  if (shouldFetch) {
    fetchBaseBranch(baseBranch, { usingDefaultBase });
  }
  const baseRef = resolveBaseRef(baseBranch, { usingDefaultBase });

  const now = new Date().toISOString();
  const manifest = {
    schema_version: 1,
    task_id: taskId,
    title: titleFromDescription(laneSlugFromBranch(branch).replace(/-/g, " ")),
    description: `Dispatch workspace for ${item.itemId}`,
    repo_name: workspaceKey(),
    repo_root: repoRoot,
    state_root: context.state.root,
    base_branch: baseBranch,
    base_ref: baseRef,
    branch,
    worktree_path: worktreePath,
    status: "active",
    owner: context.currentOwner,
    owner_thread_id: process.env.CODEX_THREAD_ID || null,
    owner_acquired_at: now,
    owner_updated_at: now,
    mode: "pr",
    pr_url: null,
    pr_number: null,
    source_assignment_id: assignment.assignment_id,
    source_backlog_item: assignment.source_backlog_item || sourceBacklogItemRecord(item),
    created_at: now,
    updated_at: now,
    last_verified_at: null,
    last_verification_command: null,
    last_commit: null,
    events: [taskEvent("dispatch_workspace_created", `dispatch prepared workspace for ${item.itemId}`)],
  };

  mkdirSync(context.state.tasksDir, { recursive: true });
  mkdirSync(context.state.worktreesDir, { recursive: true });
  withManifestLock(context.state, taskId, () => {
    const worktreeArgs = useDetachedTestWorktree
      ? ["worktree", "add", "--detach", worktreePath, baseRef]
      : ["worktree", "add", "-b", branch, worktreePath, baseRef];
    runChecked("git", worktreeArgs, { cwd: repoRoot });
    const localArtifactSeed = seedDispatchLocalBmadArtifacts(item, worktreePath);
    if (localArtifactSeed.paths.length > 0) {
      manifest.local_artifact_seed = localArtifactSeed;
      manifest.events.push(taskEvent("local_bmad_artifacts_seeded", `${localArtifactSeed.paths.length} selected BMAD artifact(s) seeded locally`));
    }
    writeManifest(manifestPath, manifest);
  });

  return {
    path: manifestPath,
    manifest,
    workspaceAction: "create_workspace",
  };
}

function shouldUseDetachedTestWorktreeForExistingSafeBacklogBranch(item, branch, stateRootPath) {
  if (process.env.CODEX_WORKSPACE_TEST_MODE !== "1") {
    return false;
  }
  if (!isTemporaryWorkspaceTestState(stateRootPath)) {
    return false;
  }
  if (process.env.CODEX_WORKSPACE_TEST_IGNORE_SAFE_BACKLOG_LOCAL_BRANCHES !== "1") {
    return false;
  }
  if (String(item.branchName || "") !== branch) {
    return false;
  }
  if (!String(item.itemId || "").startsWith("bmad-")) {
    return false;
  }
  return branchExists(branch);
}

function isTemporaryWorkspaceTestState(stateRootPath) {
  if (!stateRootPath) {
    return false;
  }
  const relativeToTmp = relative(resolve(tmpdir()), resolve(stateRootPath));
  return relativeToTmp === "" || (relativeToTmp.length > 0 && !relativeToTmp.startsWith("..") && !relativeToTmp.startsWith("/"));
}

function nextDispatchTaskId(state, laneSlug) {
  const base = `${dateStamp()}-${laneSlug}`;
  let candidate = base;
  let suffix = 2;
  while (existsSync(join(state.tasksDir, `${candidate}.json`)) || existsSync(join(state.worktreesDir, candidate))) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function dispatchWorkspaceAction(selected) {
  if (selected.mutation === "manifest_owner_claim") {
    return "claim_existing_workspace";
  }
  if (selected.mutation === "assignment_refresh") {
    return "resume_or_prepare_workspace";
  }
  return "claim_and_create_workspace";
}

function dispatchNextCommand(selected, readinessProfile) {
  const lane = selected?.item?.itemId || "selected lane";
  if (readinessProfile === "none") {
    return `resume prepared workspace for ${lane}`;
  }
  return `resume prepared workspace for ${lane} after ${readinessProfile} readiness`;
}

function normalizeDispatchReadinessProfile(value) {
  const profile = String(value || "doctor").trim();
  if (!["doctor", "preflight", "none"].includes(profile)) {
    throw new Error("--readiness must be one of: doctor, preflight, none.");
  }
  return profile;
}

function runDispatchReadiness(worktreePath, context) {
  if (!worktreePath || !existsSync(worktreePath)) {
    return {
      profile: context.readinessProfile,
      status: "failed",
      command: null,
      exit_code: 1,
      summary: "worktree is missing",
    };
  }

  if (context.readinessProfile === "none") {
    return {
      profile: "none",
      status: "skipped",
      command: "none",
      exit_code: 0,
      summary: "readiness skipped by explicit profile",
    };
  }

  const command =
    context.readinessProfile === "preflight"
      ? [process.execPath, ["./scripts/preflight.mjs"]]
      : [process.execPath, ["./scripts/codex-workspace.mjs", "doctor", "--state-root", context.state.root]];
  const result = spawnSync(command[0], command[1], {
    cwd: worktreePath,
    encoding: "utf8",
    stdio: "pipe",
  });
  const output = [result.stdout || "", result.stderr || ""].join("\n").trim();
  const exitCode = result.status ?? 1;
  return {
    profile: context.readinessProfile,
    status: exitCode === 0 ? "passed" : "failed",
    command: [basename(command[0]), ...command[1]].join(" "),
    exit_code: exitCode,
    summary: summarizeCommandOutput(output),
  };
}

function summarizeCommandOutput(output) {
  const lines = String(output || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.slice(0, 12).join(" | ") || "no output";
}

function dispatchHandoffPacket(selected, context, manifest, readiness, workspaceAction, candidateStateCounts = {}) {
  const generatedAt = new Date().toISOString();
  const stopLines = stopLinesForSafeBacklogItem(selected.item, defaultDispatchStopLines());
  const localArtifactSeed = manifest.local_artifact_seed || localBmadArtifactSeedNone();
  return {
    schema_version: 1,
    lane: selected.item.itemId,
    owner: context.currentOwner,
    branch: manifest.branch,
    workspace_action: workspaceAction,
    worktree_path: manifest.worktree_path,
    task_id: manifest.task_id,
    readiness,
    local_artifact_seed: localArtifactSeed,
    next_command: `cd ${manifest.worktree_path}`,
    handoff: localArtifactSeed.paths.length > 0
      ? "resume this prepared worktree; selected local BMAD story artifacts were seeded; no worker or provider process launched"
      : "resume this prepared worktree; no worker or provider process launched",
    stop_lines: stopLines,
    candidate_state_counts: candidateStateCounts,
    authority_decision: shapeAuthorityDecisionEvidence({
      operation: "dispatch-next-apply",
      authorityFamily: "worker-mutation",
      decision: readiness.status === "failed" ? "readiness_failed" : "handoff_recorded",
      allowed: readiness.status !== "failed",
      requiredGates: [
        "dry-run dispatch selected a safe lane",
        "claim or workspace preparation completed",
        "readiness completed or was explicitly skipped",
        "no provider/model calls",
        "no automatic worker process launch",
      ],
      satisfiedGates:
        readiness.status === "failed"
          ? ["dry-run dispatch selected a safe lane", "claim or workspace preparation completed"]
          : [
              "dry-run dispatch selected a safe lane",
              "claim or workspace preparation completed",
              "readiness completed or was explicitly skipped",
              "no provider/model calls",
              "no automatic worker process launch",
            ],
      blockedReasons: readiness.status === "failed" ? [readiness.summary || "readiness failed"] : [],
      stopLines,
      evidenceRefs: [
        `lane:${selected.item.itemId}`,
        `task:${manifest.task_id}`,
        `branch:${manifest.branch}`,
        `readiness:${readiness.status}`,
        ...(localArtifactSeed.paths.length > 0 ? [`local-bmad-artifact-seed:${localArtifactSeed.paths.length}`] : []),
      ],
      nextSafeAction:
        readiness.status === "failed"
          ? "Fix readiness failure before handing the lane to a worker."
          : localArtifactSeed.paths.length > 0
            ? "Resume the prepared worktree with the selected local BMAD story artifacts already seeded; no worker was launched by dispatch-next."
            : "Resume the prepared worktree; no worker was launched by dispatch-next.",
      recoveryPath: "Re-run dispatch-next dry-run before another apply if readiness or ownership evidence changes.",
      generatedAt,
    }),
    generated_at: generatedAt,
  };
}

function localBmadArtifactSeedNone() {
  return {
    mode: "none",
    paths: [],
    retention: "metadata_only",
    rawPayloadRetained: false,
  };
}

function seedDispatchLocalBmadArtifacts(item = {}, worktreePath = "") {
  const selected = [
    { kind: "sprint_status", path: item.sourcePath },
    { kind: "story", path: item.storyPath },
  ]
    .map((entry) => ({ kind: entry.kind, path: normalizeSelectedBmadArtifactPath(entry.path) }))
    .filter((entry) => entry.path);
  const unique = [];
  const seen = new Set();
  for (const entry of selected) {
    if (seen.has(entry.path)) continue;
    seen.add(entry.path);
    unique.push(entry);
  }
  if (unique.length === 0) return localBmadArtifactSeedNone();
  const copied = [];
  const exclude = ensureWorktreeLocalBmadExclude(worktreePath);
  if (!exclude.ok) {
    throw new Error(`BMAD artifact ignore setup failed: ${exclude.reason}`);
  }
  for (const entry of unique) {
    const sourceAbsolute = join(mainWorktreePath(), entry.path);
    if (!existsSync(sourceAbsolute)) {
      throw new Error(`Selected BMAD artifact is missing: ${entry.path}`);
    }
    const content = readFileSync(sourceAbsolute, "utf8");
    const targetAbsolute = join(worktreePath, entry.path);
    mkdirSync(dirname(targetAbsolute), { recursive: true });
    writeFileSync(targetAbsolute, content, "utf8");
    copied.push({
      path: entry.path,
      kind: entry.kind,
      bytes: Buffer.byteLength(content, "utf8"),
    });
  }
  if (copied.length === 0) return localBmadArtifactSeedNone();
  return {
    mode: "selected_local_bmad_story_artifacts",
    paths: copied,
    retention: "metadata_only",
    rawPayloadRetained: false,
    source: "dispatch-selected-safe-backlog-item",
    copiedAt: new Date().toISOString(),
  };
}

function normalizeSelectedBmadArtifactPath(path = "") {
  const normalized = String(path || "").replace(/\\/g, "/").replace(/^\.\//, "");
  if (!normalized.startsWith("_bmad-output/implementation-artifacts/") || normalized.includes("..")) return "";
  if (!/^_bmad-output\/implementation-artifacts\/(?:sprint-status[^/]*\.ya?ml|\d+-\d+-[a-z0-9-]+\.md)$/i.test(normalized)) return "";
  const absolute = resolve(repoRoot, normalized);
  const rel = relative(repoRoot, absolute);
  if (!rel || rel.startsWith("..") || resolve(repoRoot, rel) !== absolute) return "";
  return normalized;
}

function ensureWorktreeLocalBmadExclude(worktreePath = "") {
  const result = git(["rev-parse", "--git-path", "info/exclude"], { cwd: worktreePath });
  if (result.code !== 0 || !result.stdout.trim()) {
    return { ok: false, reason: result.stderr || result.stdout || "git-exclude-path-unavailable" };
  }
  const excludePath = resolve(worktreePath, result.stdout.trim());
  mkdirSync(dirname(excludePath), { recursive: true });
  const existing = existsSync(excludePath) ? readFileSync(excludePath, "utf8") : "";
  if (/^_bmad-output\/\s*$/m.test(existing)) return { ok: true, path: excludePath };
  const next = `${existing.replace(/\s*$/u, "")}${existing.trim() ? "\n" : ""}_bmad-output/\n`;
  writeFileSync(excludePath, next, "utf8");
  const verify = spawnSync("git", ["check-ignore", "-q", "--", "_bmad-output/implementation-artifacts/seed-check.md"], {
    cwd: worktreePath,
    encoding: "utf8",
    stdio: "pipe",
  });
  if (verify.status !== 0) {
    return { ok: false, reason: "git-ignore-verification-failed" };
  }
  return { ok: true, path: excludePath };
}

function recordManifestDispatchHandoff(manifest, packet, context) {
  const now = packet.generated_at;
  manifest.owner = context.currentOwner;
  manifest.owner_thread_id = process.env.CODEX_THREAD_ID || null;
  manifest.owner_updated_at = now;
  manifest.updated_at = now;
  manifest.phase = "handoff";
  manifest.runner_kind = "codex-cli";
  manifest.current_command = "handoff ready";
  manifest.last_result = packet.readiness.summary;
  writeClaimHeartbeatEvidence(manifest, context.options, now);
  manifest.dispatch_handoffs = [...(Array.isArray(manifest.dispatch_handoffs) ? manifest.dispatch_handoffs : []), packet];
  appendAuthorityDecision(manifest, packet.authority_decision);
  appendTaskEvent(manifest, "heartbeat", `owner ${context.currentOwner} phase ${manifest.phase}`);
  appendTaskEvent(manifest, "dispatch_handoff", `${packet.lane} ${packet.workspace_action} readiness ${packet.readiness.status}`);
}

function recordAssignmentDispatchHandoff(assignment, packet, manifest, context) {
  const now = packet.generated_at;
  assignment.owner = context.currentOwner;
  assignment.owner_thread_id = process.env.CODEX_THREAD_ID || null;
  assignment.task_id = manifest.task_id;
  assignment.branch = manifest.branch;
  assignment.worktree_path = manifest.worktree_path;
  assignment.status = "active";
  assignment.phase = "handoff";
  assignment.runner_kind = "codex-cli";
  assignment.updated_at = now;
  assignment.current_command = "handoff ready";
  assignment.last_result = packet.readiness.summary;
  writeClaimHeartbeatEvidence(assignment, context.options, now);
  assignment.dispatch_handoffs = [
    ...(Array.isArray(assignment.dispatch_handoffs) ? assignment.dispatch_handoffs : []),
    packet,
  ];
  appendAuthorityDecision(assignment, packet.authority_decision);
  assignment.events = [
    ...(Array.isArray(assignment.events) ? assignment.events : []),
    taskEvent("heartbeat", `owner ${context.currentOwner} phase ${assignment.phase}`),
    taskEvent("dispatch_handoff", `${packet.lane} ${packet.workspace_action} readiness ${packet.readiness.status}`),
  ];
}

function defaultDispatchStopLines() {
  return [
    "no provider/model calls",
    "no paid usage",
    "no automatic worker or external process launch",
    "no automatic takeover without evidence and approval",
    "no authority-blocked work mutation",
    "no PR, merge, or cleanup mutation from dispatch-next",
  ];
}

function dispatchPacketBaseBranch(selected, context) {
  if (dispatchWorkspaceAction(selected) === "claim_and_create_workspace") {
    return String(context.options.base || defaultBaseBranch);
  }
  const taskId = String(selected.targetTaskId || "");
  if (taskId) {
    const record = readManifests(context.state).find(({ manifest }) => manifest.task_id === taskId);
    return record?.manifest?.base_branch || null;
  }
  const assignmentId = String(selected.targetAssignmentId || "");
  if (assignmentId) {
    const assignmentRecord = readAssignments(context.state).find(
      ({ assignment }) => assignment.assignment_id === assignmentId,
    );
    if (assignmentRecord) {
      const manifestRecord = dispatchManifestForAssignment(context.state, assignmentRecord.assignment);
      return manifestRecord?.manifest?.base_branch || null;
    }
  }
  return null;
}

function preflightDispatchWorkspaceBase(selected, context) {
  if (dispatchWorkspaceAction(selected) !== "claim_and_create_workspace") {
    return;
  }
  const usingDefaultBase = !context.options.base;
  const baseBranch = String(context.options.base || defaultBaseBranch);
  assertSafeBaseBranch(baseBranch);
  if (!context.options.noFetch) {
    fetchBaseBranch(baseBranch, { usingDefaultBase });
  }
  resolveBaseRef(baseBranch, { usingDefaultBase });
}

function printDispatchPacket(label, packet) {
  console.log(`${label}: dispatch-next`);
  console.log(`- owner ${packet.owner}`);
  console.log(`- selected lane ${packet.selected_lane || packet.lane || "none"}`);
  console.log(`- branch ${packet.branch || "none"}`);
  console.log(`- base branch ${packet.base_branch || "none"}`);
  console.log(`- claim action ${packet.claim_action || "none"}`);
  console.log(`- workspace action ${packet.workspace_action || "none"}`);
  console.log(`- readiness ${packet.readiness_profile || packet.readiness?.profile || "none"}`);
  console.log(`- next ${packet.next_command || "none"}`);
  console.log(`- allowed ${packet.allowed !== false}`);
  console.log(`- queue states ${formatQueueCandidateStateCounts(packet.candidate_state_counts) || "none"}`);
  if (packet.next_action_guidance) {
    console.log(`- next action guidance ${packet.next_action_guidance}`);
  }
  if (packet.blockers?.length) {
    for (const blocker of packet.blockers) {
      console.log(`- blocker ${blocker}`);
    }
  } else {
    console.log("- blockers none");
  }
}

function applyManifestOwnerClaim(selected, { state, options, currentOwner, staleAfterSeconds }) {
  const taskId = String(selected.targetTaskId || "");
  assertSafeTaskId(taskId);
  const manifestPath = join(state.tasksDir, `${taskId}.json`);

  return withManifestLock(state, taskId, () => {
    const manifest = readManifest(manifestPath);
    validateManifest(manifest, manifestPath);
    reconcileManifest(manifest);
    const manifests = readManifests(state).map(({ manifest: recordManifest }) =>
      recordManifest.task_id === manifest.task_id ? manifest : recordManifest,
    );
    const assignments = readAssignments(state).map(({ assignment }) => assignment);
    const freshEvaluation = evaluateClaimCandidate(selected.item, manifests, assignments, {
      currentOwner,
      generatedAt: new Date(),
      staleAfterSeconds,
    });
    if (!freshEvaluation.claimable || freshEvaluation.mutation !== "manifest_owner_claim") {
      throw new Error(`Claim target changed for ${selected.item.itemId}; rerun claim-next --dry-run.`);
    }

    claimLaneOwner(manifest, options);
    manifest.updated_at = new Date().toISOString();
    writeManifest(manifestPath, manifest);
    return {
      path: manifestPath,
      message: `claimed existing unowned workspace ${taskId} for ${currentOwner}`,
    };
  });
}

function applyAssignmentClaim(selected, { state, options, currentOwner, staleAfterSeconds }) {
  const assignmentId = String(selected.targetAssignmentId || selected.item.itemId || "");
  assertSafeTaskId(assignmentId);

  return withAssignmentLock(state, assignmentId, () => {
    const manifests = readManifests(state).map(({ manifest }) => manifest);
    const assignments = readAssignments(state);
    const freshEvaluation = evaluateClaimCandidate(
      selected.item,
      manifests,
      assignments.map(({ assignment }) => assignment),
      {
        currentOwner,
        generatedAt: new Date(),
        staleAfterSeconds,
      },
    );
    if (
      !freshEvaluation.claimable ||
      !["assignment_write", "assignment_refresh"].includes(freshEvaluation.mutation)
    ) {
      throw new Error(`Claim target changed for ${selected.item.itemId}; rerun claim-next --dry-run.`);
    }
    if (freshEvaluation.targetAssignmentId && freshEvaluation.targetAssignmentId !== assignmentId) {
      throw new Error(`Assignment target changed for ${selected.item.itemId}; rerun claim-next --dry-run.`);
    }

    const existing = activeAssignmentsForBranch(
      assignments.map(({ assignment }) => assignment),
      selected.item.branchName,
    )[0];
    const path = existing ? assignmentPath(state, existing.assignment_id) : assignmentPath(state, assignmentId);
    const assignment = buildLaneAssignment(selected.item, existing, options);
    writeAssignment(path, assignment);
    return {
      path,
      message: existing
        ? `refreshed existing assignment ${assignment.assignment_id} for ${currentOwner}`
        : `claimed ready lane ${selected.item.itemId} for ${currentOwner}`,
    };
  });
}

function buildLaneAssignment(item, existingAssignment, options = {}) {
  const now = new Date().toISOString();
  const currentOwner = currentLaneOwner(options);
  const isRefresh = Boolean(existingAssignment);
  const assignmentId = String(existingAssignment?.assignment_id || item.itemId);
  assertSafeTaskId(assignmentId);

  return {
    schema_version: 1,
    assignment_id: assignmentId,
    task_id: existingAssignment?.task_id || item.itemId,
    lane_slug: existingAssignment?.lane_slug || laneSlugFromBranch(item.branchName),
    branch: item.branchName,
    worktree_path: existingAssignment?.worktree_path || null,
    status: "claimed",
    owner: currentOwner,
    owner_thread_id: process.env.CODEX_THREAD_ID || null,
    assigned_at: existingAssignment?.assigned_at || now,
    updated_at: now,
    phase: existingAssignment?.phase || "claimed",
    runner_kind: existingAssignment?.runner_kind || "codex-cli",
    last_heartbeat_at: now,
    stale_after_seconds: positiveInteger(options.staleAfterSeconds, 86_400),
    current_command: existingAssignment?.current_command || null,
    last_result: existingAssignment?.last_result || null,
    heartbeat_count: Number.isInteger(existingAssignment?.heartbeat_count) ? existingAssignment.heartbeat_count + 1 : 1,
    source_backlog_item: sourceBacklogItemRecord(item),
    authority_profile: existingAssignment?.authority_profile || "standard-delivery",
    stop_lines: existingAssignment?.stop_lines || stopLinesForSafeBacklogItem(item, defaultAssignmentStopLines()),
    events: [
      ...(Array.isArray(existingAssignment?.events) ? existingAssignment.events : []),
      taskEvent(
        isRefresh ? "claim_refreshed" : "claimed",
        `${item.itemId} claimed by ${currentOwner}; metadata only, no dispatch`,
      ),
      taskEvent("heartbeat", `owner ${currentOwner} phase ${existingAssignment?.phase || "claimed"}`),
    ],
  };
}

function sourceBacklogItemRecord(item) {
  return {
    item_id: item.itemId,
    title: item.title || null,
    status: item.status || null,
    priority: item.priority || null,
    recommended_slice_size: item.recommendedSliceSize || null,
    branch_name: item.branchName || null,
    start_command: item.startCommand || null,
    source_type: item.sourceType || null,
    source_key: item.sourceKey || null,
    source_ref: item.sourceRef || null,
    source_path: item.sourcePath || null,
    story_path: item.storyPath || null,
  };
}

function defaultAssignmentStopLines() {
  return [
    "no provider/model calls",
    "no paid usage",
    "no worker or process launch",
    "no automatic takeover without evidence and approval",
    "no authority-blocked work mutation",
    "no branch, PR, merge, cleanup, or implementation mutation from claim-next --apply",
  ];
}

function stopLinesForSafeBacklogItem(item, defaults) {
  const lines = Array.isArray(defaults) ? [...defaults] : [];
  for (const line of Array.isArray(item?.stopLines) ? item.stopLines : []) {
    if (typeof line === "string" && line && !lines.includes(line)) {
      lines.push(line);
    }
  }
  return lines;
}

function laneSlugFromBranch(branchName) {
  return String(branchName || "").replace(/^codex\//, "") || "unknown-lane";
}

function assignmentPath(state, assignmentId) {
  assertSafeTaskId(assignmentId);
  return join(state.assignmentsDir, `${assignmentId}.json`);
}

function normalizeHeartbeatOptions(options = {}) {
  const decision = optionalHeartbeatText(options.decision);
  const decisionRationale = optionalHeartbeatText(options.decisionRationale);
  const nextSafeAction = optionalHeartbeatText(options.nextSafeAction);
  if (decision || decisionRationale || nextSafeAction) {
    const missing = [
      decision ? null : "--decision",
      decisionRationale ? null : "--decision-rationale",
      nextSafeAction ? null : "--next-safe-action",
    ].filter(Boolean);
    if (missing.length > 0) {
      throw new Error(`Best-judgment decision evidence requires ${missing.join(", ")}.`);
    }
  }
  return {
    phase: safeHeartbeatToken(options.phase || "active", "phase"),
    runnerKind: safeHeartbeatToken(options.runnerKind || "codex-cli", "runner kind"),
    currentCommand: optionalHeartbeatText(options.currentCommand),
    currentCommandProvided: options.currentCommand !== undefined && options.currentCommand !== true,
    lastResult: optionalHeartbeatText(options.lastResult),
    lastResultProvided: options.lastResult !== undefined && options.lastResult !== true,
    decision,
    decisionRationale,
    nextSafeAction,
    staleAfterSeconds: positiveInteger(options.staleAfterSeconds, 86_400),
  };
}

function safeHeartbeatToken(value, label) {
  const text = String(value || "").trim();
  if (!text || !/^[a-zA-Z0-9._/-]+$/.test(text)) {
    throw new Error(`Invalid heartbeat ${label}: ${value}`);
  }
  return text;
}

function optionalHeartbeatText(value) {
  if (value === undefined || value === true) {
    return null;
  }
  const text = String(value).trim();
  return text || null;
}

function heartbeatAssignment(state, assignmentRecord, { currentOwner, options, heartbeatOptions }) {
  const assignmentId = String(assignmentRecord.assignment.assignment_id || "");
  assertSafeTaskId(assignmentId);
  const path = assignmentRecord.path;
  return withAssignmentLock(state, assignmentId, () => {
    const assignment = readAssignment(path);
    validateAssignment(assignment, path);
    assertAssignmentOwner(assignment, options);
    updateHeartbeatFields(assignment, heartbeatOptions);
    assignment.updated_at = assignment.last_heartbeat_at;
    assignment.events = [
      ...(Array.isArray(assignment.events) ? assignment.events : []),
      taskEvent("heartbeat", `owner ${currentOwner} phase ${heartbeatOptions.phase}`),
    ];
    if (heartbeatOptions.decision) {
      assignment.events.push(taskEvent("best_judgment_decision", `owner ${currentOwner} phase ${heartbeatOptions.phase}`));
    }
    writeAssignment(path, assignment);
    return {
      path,
      target: assignment.assignment_id,
    };
  });
}

function heartbeatManifest(state, taskId, { currentOwner, options, heartbeatOptions }) {
  assertSafeTaskId(taskId);
  const path = join(state.tasksDir, `${taskId}.json`);
  return withManifestLock(state, taskId, () => {
    const manifest = readManifest(path);
    validateManifest(manifest, path);
    assertManifestHeartbeatOwner(manifest, options);
    updateHeartbeatFields(manifest, heartbeatOptions);
    manifest.owner_updated_at = manifest.last_heartbeat_at;
    manifest.updated_at = manifest.last_heartbeat_at;
    appendTaskEvent(manifest, "heartbeat", `owner ${currentOwner} phase ${heartbeatOptions.phase}`);
    if (heartbeatOptions.decision) {
      appendTaskEvent(manifest, "best_judgment_decision", `owner ${currentOwner} phase ${heartbeatOptions.phase}`);
    }
    writeManifest(path, manifest);
    return {
      path,
      target: manifest.task_id,
    };
  });
}

function updateHeartbeatFields(target, heartbeatOptions) {
  const now = new Date().toISOString();
  target.last_heartbeat_at = now;
  target.stale_after_seconds = heartbeatOptions.staleAfterSeconds;
  target.phase = heartbeatOptions.phase;
  target.runner_kind = heartbeatOptions.runnerKind;
  if (heartbeatOptions.currentCommandProvided) {
    target.current_command = heartbeatOptions.currentCommand;
  }
  if (heartbeatOptions.lastResultProvided) {
    target.last_result = heartbeatOptions.lastResult;
  }
  if (heartbeatOptions.decision) {
    target.best_judgment_decisions = [
      ...(Array.isArray(target.best_judgment_decisions) ? target.best_judgment_decisions : []),
      {
        recorded_at: now,
        owner: target.owner || null,
        phase: heartbeatOptions.phase,
        runner_kind: heartbeatOptions.runnerKind,
        current_command: target.current_command || null,
        last_result: target.last_result || null,
        decision: heartbeatOptions.decision,
        rationale: heartbeatOptions.decisionRationale,
        next_safe_action: heartbeatOptions.nextSafeAction,
      },
    ];
  }
  target.heartbeat_count = Number.isInteger(target.heartbeat_count) ? target.heartbeat_count + 1 : 1;
}

function assertAssignmentOwner(assignment, options = {}) {
  const currentOwner = currentLaneOwner(options);
  if (!assignment.owner) {
    throw new Error(`${assignment.assignment_id} has no assignment owner; claim it before heartbeat.`);
  }
  if (assignment.owner !== currentOwner) {
    throw new Error(
      `${assignment.assignment_id} is assigned to ${assignment.owner}; current runner is ${currentOwner}. Heartbeat is owner-only.`,
    );
  }
}

function assertManifestHeartbeatOwner(manifest, options = {}) {
  const currentOwner = currentLaneOwner(options);
  if (!manifest.owner) {
    throw new Error(`${manifest.task_id} has no workspace owner; claim it before heartbeat.`);
  }
  if (manifest.owner !== currentOwner) {
    throw new Error(
      `${manifest.task_id} is owned by ${manifest.owner}; current runner is ${currentOwner}. Heartbeat is owner-only.`,
    );
  }
}

function resolveTakeoverTarget(state, query) {
  const assignmentRecord = findAssignment(state, query);
  if (assignmentRecord) {
    return {
      kind: "assignment",
      path: assignmentRecord.path,
      record: assignmentRecord.assignment,
    };
  }

  const manifestRecord = findManifest(state, query, { preferCurrentWorktree: true });
  return {
    kind: "workspace",
    path: manifestRecord.path,
    record: manifestRecord.manifest,
  };
}

function takeoverPacket(target, context) {
  const record = target.record;
  const previousOwner = record.owner || "";
  const stale = takeoverHeartbeatEvidence(record, context);
  const worktree = takeoverWorktreeEvidence(target);
  const branch = takeoverBranchEvidence(record, worktree);
  const pr = takeoverPrEvidence(record);
  const dirty = takeoverDirtyStateEvidence(worktree);
  const dirtyInLane = takeoverDirtyInLaneEvidence(target, context, { stale, worktree, branch, pr, dirty });
  const blockers = takeoverBlockers(target, context, {
    stale,
    worktree,
    branch,
    pr,
    dirty,
    dirtyInLane,
  });
  const allowed = blockers.length === 0;

  return {
    schema_version: 1,
    target_kind: target.kind,
    target_id: target.kind === "assignment" ? record.assignment_id : record.task_id,
    previous_owner: previousOwner || "unowned",
    requesting_owner: context.currentOwner,
    reason: context.reason,
    heartbeat_evidence: stale,
    worktree_evidence: worktree,
    branch_evidence: branch,
    pr_evidence: pr,
    dirty_state_evidence: dirty,
    dirty_in_lane_evidence: dirtyInLane,
    approval_evidence: context.approval || null,
    decision: allowed ? "approved_for_apply" : "blocked",
    allowed,
    blockers,
    authority_decision: shapeAuthorityDecisionEvidence({
      operation: "takeover",
      authorityFamily: "worker-mutation",
      decision: allowed ? "approved_for_apply" : "blocked",
      allowed,
      requiredGates: [
        "target has a previous owner",
        "owner heartbeat is stale",
        "worktree exists when required",
        context.allowDirtyInLane ? "explicit dirty in-lane takeover evidence is complete" : "worktree is clean",
        "takeover reason is present",
        "explicit operator approval evidence is present for apply",
      ],
      satisfiedGates: allowed
        ? [
            "target has a previous owner",
            "owner heartbeat is stale",
            "worktree exists when required",
            context.allowDirtyInLane ? "explicit dirty in-lane takeover evidence is complete" : "worktree is clean",
            "takeover reason is present",
            "explicit operator approval evidence is present for apply",
          ]
        : [],
      blockedReasons: blockers,
      stopLines: [
        "no automatic takeover without stale-owner evidence",
        "no takeover apply without explicit operator approval evidence",
        context.allowDirtyInLane ? "dirty path content must remain stable while the exact manifest lock is held" : "no dirty worktree mutation",
        "no provider/model calls",
      ],
      evidenceRefs: [
        `${target.kind}:${target.kind === "assignment" ? record.assignment_id : record.task_id}`,
        branch.branch ? `branch:${branch.branch}` : "",
        stale.timestamp ? `heartbeat:${stale.source}` : "",
      ],
      nextSafeAction: allowed ? "Apply takeover under lock if --apply was requested." : "Fix blockers or ask the operator for explicit approval before takeover apply.",
      recoveryPath: "Leave the previous owner intact until takeover gates pass; rerun takeover dry-run after evidence changes.",
      generatedAt: context.generatedAt.toISOString(),
    }),
    generated_at: context.generatedAt.toISOString(),
  };
}

function buildTakeoverSummary(packet) {
  return {
    schemaVersion: packet.schema_version,
    targetKind: packet.target_kind,
    targetId: packet.target_id,
    previousOwner: packet.previous_owner,
    requestingOwner: packet.requesting_owner,
    decision: packet.decision,
    allowed: packet.allowed,
    reason: packet.reason,
    generatedAt: packet.generated_at,
    heartbeat: {
      source: packet.heartbeat_evidence.source,
      timestamp: packet.heartbeat_evidence.timestamp,
      ageSeconds: packet.heartbeat_evidence.age_seconds,
      staleAfterSeconds: packet.heartbeat_evidence.stale_after_seconds,
      isStale: packet.heartbeat_evidence.is_stale,
    },
    worktree: {
      path: packet.worktree_evidence.path,
      exists: packet.worktree_evidence.exists,
      required: packet.worktree_evidence.required,
      status: packet.worktree_evidence.status,
    },
    branch: {
      branch: packet.branch_evidence.branch,
      status: packet.branch_evidence.status,
      localSha: packet.branch_evidence.local_sha,
      remoteSha: packet.branch_evidence.remote_sha,
    },
    pr: packet.pr_evidence,
    dirtyState: {
      status: packet.dirty_state_evidence.status,
      dirty: packet.dirty_state_evidence.dirty,
      dirtyLineCount: packet.dirty_state_evidence.lines?.length || 0,
    },
    dirtyInLane: packet.dirty_in_lane_evidence,
    approval: {
      present: Boolean(packet.approval_evidence),
    },
    authorityDecision: packet.authority_decision,
    blockers: packet.blockers,
    mutation: "none; dry-run summary only",
  };
}

function takeoverHeartbeatEvidence(record, context) {
  const source = record.last_heartbeat_at
    ? "last_heartbeat_at"
    : record.owner_updated_at
      ? "owner_updated_at"
      : record.updated_at
        ? "updated_at"
        : record.assigned_at
          ? "assigned_at"
          : "created_at";
  const value = record[source] || "";
  const timestamp = Date.parse(value);
  const ageSeconds = Number.isFinite(timestamp)
    ? Math.max(0, Math.floor((context.generatedAt.getTime() - timestamp) / 1000))
    : null;
  return {
    source,
    timestamp: value || null,
    age_seconds: ageSeconds,
    stale_after_seconds: context.staleAfterSeconds,
    is_stale: ageSeconds !== null && ageSeconds > context.staleAfterSeconds,
  };
}

function takeoverWorktreeEvidence(target) {
  const worktreePath = target.record.worktree_path || null;
  if (!worktreePath) {
    return {
      path: null,
      exists: target.kind === "assignment",
      required: target.kind === "workspace",
      status: target.kind === "assignment" ? "not_applicable" : "missing",
    };
  }
  if (!existsSync(worktreePath)) {
    return {
      path: worktreePath,
      exists: false,
      required: true,
      status: "missing",
    };
  }
  const status = parseStatus(worktreePath);
  const registration = takeoverRegisteredWorktreeEvidence(worktreePath);
  return {
    path: worktreePath,
    exists: true,
    required: true,
    status: status.any ? "dirty" : "clean",
    dirty_lines: status.lines,
    registration,
  };
}

function canonicalGitCommonDir(cwd) {
  const result = git(["rev-parse", "--git-common-dir"], { cwd });
  if (result.code !== 0 || !result.stdout.trim()) return null;
  const candidate = result.stdout.trim();
  return canonicalExistingPath(candidate.startsWith("/") ? candidate : resolve(cwd, candidate));
}

function takeoverRegisteredWorktreeEvidence(worktreePath) {
  const primaryWorktree = canonicalExistingPath(mainWorktreePath());
  const canonicalWorktree = canonicalExistingPath(worktreePath);
  if (!primaryWorktree || !canonicalWorktree) {
    return { status: "unavailable", reason: "primary or recorded worktree canonical identity is unavailable" };
  }
  const listing = git(["worktree", "list", "--porcelain"], { cwd: primaryWorktree });
  if (listing.code !== 0) {
    return { status: "unavailable", reason: "primary Git worktree registration is unavailable" };
  }
  const registered = parseWorktreePorcelain(listing.stdout)
    .map((entry) => canonicalExistingPath(entry.path))
    .filter(Boolean);
  const primaryCommonDir = canonicalGitCommonDir(primaryWorktree);
  const worktreeCommonDir = canonicalGitCommonDir(canonicalWorktree);
  if (!primaryCommonDir || !worktreeCommonDir) {
    return { status: "unavailable", reason: "Git common-directory identity is unavailable" };
  }
  if (!registered.includes(canonicalWorktree)) {
    return {
      status: "mismatch",
      reason: "recorded worktree is not registered by the primary repository",
      metadata_only: true,
    };
  }
  if (primaryCommonDir !== worktreeCommonDir) {
    return {
      status: "mismatch",
      reason: "recorded worktree does not share the primary repository Git common directory",
      metadata_only: true,
    };
  }
  return {
    status: "matched",
    metadata_only: true,
  };
}

function takeoverBranchEvidence(record, worktreeEvidence) {
  const branch = record.branch || null;
  if (!branch) {
    return {
      branch: null,
      checkout_branch: null,
      local_sha: null,
      manifest_branch_sha: null,
      remote_sha: null,
      status: "missing",
    };
  }
  if (!worktreeEvidence.exists) {
    return {
      branch,
      checkout_branch: null,
      local_sha: null,
      manifest_branch_sha: null,
      remote_sha: null,
      status: "worktree_missing",
    };
  }
  const worktreePath = worktreeEvidence.path;
  const checkout = git(["symbolic-ref", "--short", "HEAD"], { cwd: worktreePath });
  const checkoutBranch = checkout.code === 0 ? checkout.stdout.trim() : null;
  const localSha = branchSha("HEAD", worktreePath) || null;
  const manifestBranchSha = branchSha(branch, worktreePath) || null;
  const remoteSha = remoteBranchExists(branch) ? originBranchSha(branch) : null;
  return {
    branch,
    checkout_branch: checkoutBranch,
    local_sha: localSha,
    manifest_branch_sha: manifestBranchSha,
    remote_sha: remoteSha,
    status: checkoutBranch === branch && localSha && manifestBranchSha === localSha ? "matched" : "mismatch",
  };
}

function takeoverPrEvidence(record) {
  return {
    pr_url: record.pr_url || null,
    pr_number: record.pr_number || null,
    status: record.pr_url || record.pr_number ? "present_unverified" : "none",
  };
}

function takeoverDirtyStateEvidence(worktreeEvidence) {
  if (!worktreeEvidence.required) {
    return {
      status: "not_applicable",
      dirty: false,
    };
  }
  return {
    status: worktreeEvidence.status,
    dirty: worktreeEvidence.status === "dirty",
    lines: worktreeEvidence.dirty_lines || [],
  };
}

function dirtyInLaneRequestedPaths(rawValue) {
  const requested = (Array.isArray(rawValue) ? rawValue : [rawValue])
    .map((value) => String(value || ""))
    .filter((value) => value.trim().length > 0);
  const unique = [...new Set(requested)];
  const invalid = unique.filter(
    (path) =>
      path.startsWith("/") ||
      path.includes("\\") ||
      path.includes("\0") ||
      path.split("/").some((segment) => !segment || segment === "." || segment === ".."),
  );
  return { paths: unique, invalid };
}

function dirtyInLanePathSnapshot(worktreePath, requestedPaths) {
  const canonicalWorktree = canonicalExistingPath(worktreePath);
  if (!canonicalWorktree) {
    throw new Error("worktree canonical identity is unavailable");
  }
  const requested = dirtyInLaneRequestedPaths(requestedPaths);
  if (requested.paths.length === 0) {
    throw new Error("--dirty-paths must name every dirty path");
  }
  if (requested.invalid.length > 0) {
    throw new Error(`--dirty-paths contains unsafe relative path(s): ${requested.invalid.join(", ")}`);
  }

  const status = git(["status", "--porcelain=v1", "-z", "--untracked-files=all"], { cwd: canonicalWorktree, preserveStdout: true });
  if (status.code !== 0) {
    throw new Error(status.stderr || "could not inspect dirty paths");
  }
  const records = status.stdout ? status.stdout.split("\0").filter(Boolean) : [];
  const observed = [];
  for (const record of records) {
    if (record.length < 4 || record[2] !== " ") {
      throw new Error("dirty status record is malformed");
    }
    const statusCode = record.slice(0, 2);
    const path = record.slice(3);
    if (!path || /[RC]/.test(statusCode)) {
      throw new Error("renamed, copied, or malformed dirty paths are not eligible for dirty in-lane takeover");
    }
    observed.push({ path, status_code: statusCode });
  }
  assertNoHiddenDirtyInLanePaths(canonicalWorktree, requested.paths);

  if (observed.length === 0) {
    throw new Error("dirty in-lane takeover requires a currently dirty worktree");
  }

  const observedPaths = observed.map((entry) => entry.path);
  const unexpected = observedPaths.filter((path) => !requested.paths.includes(path));
  const missing = requested.paths.filter((path) => !observedPaths.includes(path));
  if (unexpected.length > 0 || missing.length > 0) {
    const details = [];
    if (unexpected.length > 0) details.push(`unexpected dirty paths: ${unexpected.join(", ")}`);
    if (missing.length > 0) details.push(`named paths not dirty: ${missing.join(", ")}`);
    throw new Error(details.join("; "));
  }

  const paths = observed
    .map((entry) => {
      const resolvedPath = resolve(canonicalWorktree, entry.path);
      const relativePath = relative(canonicalWorktree, resolvedPath);
      if (!relativePath || relativePath.startsWith(`..${sep}`) || relativePath === "..") {
        throw new Error(`dirty path is outside the recorded worktree: ${entry.path}`);
      }
      const stat = lstatSync(resolvedPath);
      if (!stat.isFile() || stat.isSymbolicLink()) {
        throw new Error(`dirty path is unreadable or not a regular file: ${entry.path}`);
      }
      const canonicalPath = canonicalExistingPath(resolvedPath);
      const canonicalRelative = canonicalPath ? relative(canonicalWorktree, canonicalPath) : "..";
      if (!canonicalPath || canonicalRelative.startsWith(`..${sep}`) || canonicalRelative === "..") {
        throw new Error(`dirty path resolves outside the recorded worktree: ${entry.path}`);
      }
      const index = git(["ls-files", "--stage", "--", entry.path], { cwd: canonicalWorktree });
      if (index.code !== 0) {
        throw new Error(`could not inspect index state for dirty path: ${entry.path}`);
      }
      const indexFlags = git(["ls-files", "-v", "--", entry.path], { cwd: canonicalWorktree });
      if (indexFlags.code !== 0) {
        throw new Error(`could not inspect index flags for dirty path: ${entry.path}`);
      }
      const indexEntry = dirtyInLaneIndexEntry(index.stdout, entry.path);
      const hiddenIndexFlags = dirtyInLaneHiddenIndexFlags(indexFlags.stdout, entry.path);
      if (indexEntry && hiddenIndexFlags.length > 0) {
        const worktreeBlob = git(["hash-object", "--no-filters", "--", entry.path], { cwd: canonicalWorktree });
        if (worktreeBlob.code !== 0 || !/^[0-9a-f]{40,64}$/i.test(worktreeBlob.stdout.trim())) {
          throw new Error(`could not compare hidden index state for dirty path: ${entry.path}`);
        }
        if (worktreeBlob.stdout.trim() !== indexEntry.object_id) {
          throw new Error(`hidden assume-unchanged or skip-worktree edit differs from the index: ${entry.path}`);
        }
      }
      return {
        path: entry.path,
        status_code: entry.status_code,
        mode: stat.mode & 0o7777,
        sha256: streamingFileSha256(canonicalPath),
        index_sha256: createHash("sha256").update(index.stdout).digest("hex"),
      };
    })
    .sort((left, right) => left.path.localeCompare(right.path));

  return {
    captured_at: new Date().toISOString(),
    paths,
  };
}

function dirtyInLaneIndexEntry(rawIndex, path) {
  const entries = String(rawIndex || "").split(/\r?\n/).filter(Boolean);
  if (entries.length === 0) return null;
  if (entries.length !== 1) {
    throw new Error(`index state for dirty path is ambiguous: ${path}`);
  }
  const match = entries[0].match(/^(\d{6}) ([0-9a-f]{40,64}) 0\t/);
  if (!match) {
    throw new Error(`index state for dirty path is malformed: ${path}`);
  }
  return { mode: match[1], object_id: match[2] };
}

function assertNoHiddenDirtyInLanePaths(worktreePath, requestedPaths) {
  for (const path of requestedPaths) {
    const index = git(["ls-files", "--stage", "--", path], { cwd: worktreePath });
    if (index.code !== 0) {
      throw new Error(`could not inspect index state for dirty path: ${path}`);
    }
    const indexEntry = dirtyInLaneIndexEntry(index.stdout, path);
    if (!indexEntry) continue;
    const indexFlags = git(["ls-files", "-v", "--", path], { cwd: worktreePath });
    if (indexFlags.code !== 0) {
      throw new Error(`could not inspect index flags for dirty path: ${path}`);
    }
    if (dirtyInLaneHiddenIndexFlags(indexFlags.stdout, path).length === 0) continue;
    const worktreeBlob = git(["hash-object", "--no-filters", "--", path], { cwd: worktreePath });
    if (worktreeBlob.code !== 0 || !/^[0-9a-f]{40,64}$/i.test(worktreeBlob.stdout.trim())) {
      throw new Error(`could not compare hidden index state for dirty path: ${path}`);
    }
    if (worktreeBlob.stdout.trim() !== indexEntry.object_id) {
      throw new Error(`hidden assume-unchanged or skip-worktree edit differs from the index: ${path}`);
    }
  }
}

function dirtyInLaneHiddenIndexFlags(rawFlags, path) {
  const entries = String(rawFlags || "").split(/\r?\n/).filter(Boolean);
  if (entries.length === 0) return [];
  if (entries.length !== 1 || entries[0].length < 3 || entries[0][1] !== " ") {
    throw new Error(`index flags for dirty path are malformed: ${path}`);
  }
  const flag = entries[0][0];
  return flag === "h" || flag === "S" ? [flag] : [];
}

function streamingFileSha256(path) {
  const hash = createHash("sha256");
  const chunk = Buffer.allocUnsafe(64 * 1024);
  let descriptor = null;
  try {
    descriptor = openSync(path, "r");
    while (true) {
      const bytesRead = readSync(descriptor, chunk, 0, chunk.length, null);
      if (bytesRead === 0) break;
      hash.update(chunk.subarray(0, bytesRead));
    }
    return hash.digest("hex");
  } finally {
    if (descriptor !== null) closeSync(descriptor);
  }
}

function takeoverDirtyInLaneEvidence(target, context, evidence) {
  const requested = Boolean(context.allowDirtyInLane);
  const lock = target.kind === "workspace" && context.preflightLockInspection
    ? redactTaskLockInspection(context.preflightLockInspection)
    : null;
  const result = {
    mode: requested ? "requested" : "not_requested",
    manifest_path: target.kind === "workspace" ? target.path : null,
    requested_paths: dirtyInLaneRequestedPaths(context.dirtyPaths).paths,
    lock_evidence: lock,
    before: null,
    errors: [],
  };
  if (!requested) return result;
  if (target.kind !== "workspace") result.errors.push("dirty in-lane takeover is limited to workspace manifests");
  if (!evidence.dirty.dirty) result.errors.push("dirty in-lane takeover requires a dirty workspace worktree");
  if (evidence.worktree.registration?.status !== "matched") result.errors.push(evidence.worktree.registration?.reason || "recorded worktree registration is unavailable");
  if (evidence.branch.status !== "matched") result.errors.push("manifest branch does not exactly match the worktree checkout");
  if (evidence.pr.status !== "none") result.errors.push("dirty in-lane takeover is forbidden when a PR is recorded");
  if (!validTakeoverReason(context.approval)) result.errors.push("explicit operator approval evidence is required");
  if (evidence.worktree.exists && evidence.branch.branch) {
    result.live_no_pr_evidence = strictGithubNoPrProof({ branch: evidence.branch.branch }, evidence.worktree.path);
    if (result.live_no_pr_evidence.status !== "matched") {
      result.errors.push(result.live_no_pr_evidence.reason || "live GitHub no-PR proof did not match");
    }
  } else {
    result.errors.push("live GitHub no-PR proof requires an existing branch worktree");
  }
  const malformedLockRecovery = malformedZeroByteDirtyLockRecoveryEvidence(target, context, evidence, lock, result.live_no_pr_evidence);
  const interruptedTakeoverRecovery = interruptedDirtyTakeoverLeaseEvidence(context, lock);
  if (lock?.status !== "absent") {
    result.malformed_lock_recovery = malformedLockRecovery;
    result.interrupted_takeover_recovery = interruptedTakeoverRecovery;
  }
  if (!lock || (lock.status !== "absent" && malformedLockRecovery.status !== "eligible" && interruptedTakeoverRecovery.status !== "eligible")) {
    result.errors.push(malformedLockRecovery.reason || "dirty in-lane takeover requires proof that no task lock is active or retained");
  }
  if (target.kind === "workspace" && evidence.worktree.exists) {
    try {
      result.before = dirtyInLanePathSnapshot(evidence.worktree.path, context.dirtyPaths);
    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  return result;
}

function interruptedDirtyTakeoverLeaseEvidence(context, lock) {
  const recovered = context.recoveredDirtyTakeoverLease;
  if (lock?.protocol === "versioned_lease" && lock.status === "released" && lock.generation) {
    return {
      status: "eligible",
      reason: "released versioned lease is an immutable safe predecessor for a dirty takeover handoff",
      generation: lock.generation,
      transaction_id: null,
    };
  }
  if (
    recovered?.recovered === true &&
    lock?.protocol === "versioned_lease" &&
    lock.status === "stale" &&
    lock.generation === recovered.generation
  ) {
    return {
      status: "eligible",
      reason: "stale versioned lease was recovered from a digest-bound pending dirty takeover before handoff",
      generation: recovered.generation,
      transaction_id: recovered.transactionId,
    };
  }
  return { status: "not_needed", reason: null };
}

function malformedZeroByteDirtyLockRecoveryEvidence(target, context, evidence, lock, liveNoPr) {
  const result = {
    status: "not_needed",
    classification: lock?.status || "missing",
    lock_path: lock?.lockPath || null,
    owner_process_identity: {
      status: lock?.metadata ? "recorded" : "absent_from_malformed_lock",
      matching_live_process: false,
      matching_descendant_process: false,
    },
    reason: null,
  };
  if (!context.allowDirtyInLane || !lock || lock.status === "absent") return result;
  void target;
  void evidence;
  void liveNoPr;
  result.status = "blocked";
  result.reason = "legacy task locks are inspection-only; dirty in-lane takeover requires a task with no retained legacy lock";
  return result;
}

function finalizeDirtyInLaneTakeover(packet) {
  const evidence = packet.dirty_in_lane_evidence;
  if (!evidence || evidence.mode !== "requested") return;
  if (evidence.errors.length > 0 || !evidence.before) {
    throw new Error("Dirty in-lane takeover evidence is incomplete.");
  }
  const finalBranch = takeoverBranchEvidence({ branch: packet.branch_evidence.branch }, packet.worktree_evidence);
  if (
    finalBranch.status !== "matched" ||
    finalBranch.local_sha !== packet.branch_evidence.local_sha ||
    finalBranch.manifest_branch_sha !== packet.branch_evidence.manifest_branch_sha
  ) {
    throw new Error("Dirty in-lane takeover branch or HEAD changed while the manifest lock was held.");
  }
  const after = dirtyInLanePathSnapshot(packet.worktree_evidence.path, evidence.requested_paths);
  const beforePaths = JSON.stringify(evidence.before.paths);
  const afterPaths = JSON.stringify(after.paths);
  if (beforePaths !== afterPaths) {
    throw new Error("Dirty in-lane takeover paths or fingerprints changed while the manifest lock was held.");
  }
  evidence.after = after;
  evidence.status = "stable";
}

function takeoverBlockers(target, context, evidence) {
  const blockers = [];
  const record = target.record;
  if (!record.owner) {
    blockers.push("target has no current owner; use claim flow instead");
  }
  if (record.owner === context.currentOwner) {
    blockers.push("target is already owned by current runner");
  }
  if (!evidence.stale.is_stale) {
    blockers.push("owner heartbeat is not stale");
  }
  if (target.kind === "workspace" && !evidence.worktree.exists) {
    blockers.push("workspace worktree is missing");
  }
  if (target.kind === "assignment" && evidence.worktree.required && !evidence.worktree.exists) {
    blockers.push("assignment worktree is missing");
  }
  if (evidence.dirty.dirty && !context.allowDirtyInLane) {
    blockers.push("workspace worktree is dirty");
  }
  if (context.allowDirtyInLane) {
    blockers.push(...(evidence.dirtyInLane?.errors || []));
  }
  if (!validTakeoverReason(context.reason)) {
    blockers.push("takeover reason is missing or too short");
  }
  if (context.approval !== undefined && context.approval !== "" && !validTakeoverReason(context.approval)) {
    blockers.push("approval evidence is too short");
  }
  if (!context.approval) {
    blockers.push("explicit operator approval evidence is required for apply");
  }
  return blockers;
}

function applyTakeover(state, target, { currentOwner, options, staleAfterSeconds, preflightLockInspection = null, interruptedRecovery = null }) {
  if (target.kind === "assignment") {
    const assignmentId = String(target.record.assignment_id || "");
    return withAssignmentLock(state, assignmentId, () => {
      const path = target.path;
      const assignment = readAssignment(path);
      validateAssignment(assignment, path);
      const packet = takeoverPacket(
        {
          kind: "assignment",
          path,
          record: assignment,
        },
        {
          currentOwner,
          generatedAt: new Date(),
          staleAfterSeconds,
          reason: String(options.takeoverReason || "").trim(),
          approval: String(options.approval || "").trim(),
          allowDirtyInLane: options.allowDirtyInLane === true,
          dirtyPaths: options.dirtyPaths === undefined ? [] : options.dirtyPaths,
          preflightLockInspection: null,
        },
      );
      if (!packet.allowed) {
        throw new Error(`Takeover blocked for ${packet.target_id}: ${packet.blockers.join("; ")}`);
      }
      applyAssignmentTakeover(assignment, packet);
      writeAssignment(path, assignment);
      return { path, packet };
    });
  }

  const taskId = String(target.record.task_id || "");
  const recoveredDirtyTakeoverLease = interruptedRecovery || (options.allowDirtyInLane === true
    ? recoverInterruptedDirtyTakeover(state, target)
    : null);
  const postRecoveryLockInspection = inspectTaskLock(state, taskId);
  return withManifestLock(state, taskId, () => {
    const path = target.path;
    const manifest = readManifest(path);
    validateManifest(manifest, path);
    const packet = takeoverPacket(
      {
        kind: "workspace",
        path,
        record: manifest,
      },
      {
        currentOwner,
        state,
        generatedAt: new Date(),
        staleAfterSeconds,
        reason: String(options.takeoverReason || "").trim(),
          approval: String(options.approval || "").trim(),
          allowDirtyInLane: options.allowDirtyInLane === true,
          dirtyPaths: options.dirtyPaths === undefined ? [] : options.dirtyPaths,
          preflightLockInspection: postRecoveryLockInspection,
          recoveredDirtyTakeoverLease,
        },
      );
    if (!packet.allowed) {
      throw new Error(`Takeover blocked for ${packet.target_id}: ${packet.blockers.join("; ")}`);
    }
    finalizeDirtyInLaneTakeover(packet);
    // The first durable write is a transaction staging record: it retains the
    // prior visible owner until the final in-lane snapshot passes.  A crash at
    // this point therefore cannot publish a new owner with an unresolved
    // takeover intent.  The record contains enough digests for a later stale
    // generation recovery to prove and remove the stage before retrying.
    const manifestBeforeTakeover = JSON.parse(JSON.stringify(manifest));
    const pendingTakeover = pendingDirtyTakeover(manifestBeforeTakeover, packet);
    try {
      manifest.pending_dirty_takeover = pendingTakeover;
      writeManifest(path, manifest, {
        testCrashAfterRename: "CODEX_WORKSPACE_TEST_CRASH_AFTER_DIRTY_TAKEOVER_STAGE_RENAME",
        testHardCrashAfterRename: "CODEX_WORKSPACE_TEST_HARD_CRASH_AFTER_DIRTY_TAKEOVER_STAGE_RENAME",
      });
      finalizeDirtyInLaneTakeover(packet);
      // Keep the immutable, digest-bound transaction state on the owner write.
      // A hard crash after this rename can therefore prove exactly which prior
      // manifest to restore; clearing this state before final revalidation
      // would strand a newly published owner with no recoverable rollback.
      applyManifestTakeover(manifest, packet, { dirtyTakeoverTransactionId: pendingTakeover.transaction_id });
      writeManifest(path, manifest, {
        testHardCrashAfterRename: "CODEX_WORKSPACE_TEST_HARD_CRASH_AFTER_DIRTY_TAKEOVER_FINAL_OWNER_RENAME",
      });
      // The owner change is now durable, so re-read the exact dirty-path
      // fingerprints once more before treating the transaction as complete.
      // If the worktree drifted during that final manifest write, the catch
      // block restores the prior owner and records the compensating manifest
      // write under this same lease generation.
      finalizeDirtyInLaneTakeover(packet);
      delete manifest.pending_dirty_takeover;
      writeManifest(path, manifest);
    } catch (error) {
      for (const key of Object.keys(manifest)) delete manifest[key];
      Object.assign(manifest, manifestBeforeTakeover);
      writeManifest(path, manifest);
      // An injected post-rename interruption has already published and fsynced
      // the staged bytes.  Once the prior manifest is durably restored, record
      // that exact staged write as observed so it cannot strand this generation.
      if (error?.taskLeaseManifestIntent) {
        completeTaskLeaseManifestIntent(activeTaskLeaseWriteContext, error.taskLeaseManifestIntent);
      }
      throw error;
    }
    return { path, packet };
  }, { recoverStale: recoveredDirtyTakeoverLease?.recovered === true || options.allowDirtyInLane !== true });
}

function canonicalManifestBytes(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function pendingDirtyTakeover(manifest, packet) {
  const priorBytes = canonicalManifestBytes(manifest);
  return {
    schema_version: taskLeaseSchemaVersion,
    transaction_id: randomUUID(),
    previous_owner: manifest.owner,
    requesting_owner: packet.requesting_owner,
    prior_manifest_digest: createHash("sha256").update(priorBytes).digest("hex"),
    // This exact JSON value is deliberately retained through the final owner
    // write.  Its digest binds a later crash recovery to the old owner state
    // without relying on a mutable filename or a best-effort inverse patch.
    prior_manifest: manifest,
    staged_at: new Date().toISOString(),
  };
}

function validPendingDirtyTakeover(record) {
  return Boolean(
    record &&
      record.schema_version === taskLeaseSchemaVersion &&
      isUuid(record.transaction_id) &&
      typeof record.previous_owner === "string" && record.previous_owner.trim() &&
      typeof record.requesting_owner === "string" && record.requesting_owner.trim() &&
      typeof record.prior_manifest_digest === "string" && /^[a-f0-9]{64}$/i.test(record.prior_manifest_digest) &&
      record.prior_manifest && typeof record.prior_manifest === "object" && !Array.isArray(record.prior_manifest) &&
      isIsoTimestamp(record.staged_at),
  );
}

function recoverInterruptedDirtyTakeover(state, target) {
  if (target.kind !== "workspace") return null;
  const taskId = String(target.record.task_id || "");
  const inspection = inspectTaskLease(state, taskId);
  if (inspection.status !== "ambiguous" || inspection.reason !== "manifest_write_intent_unresolved") return null;
  if (!inspection.metadata || !inspection.generation) {
    throw new Error("Interrupted dirty takeover recovery lacks an inspectable stale generation.");
  }
  const tokenDigest = taskLeaseTokenDigest(inspection.metadata.token);
  const intent = unresolvedTaskLeaseManifestIntent(state, taskId, inspection.metadata, tokenDigest);
  const manifest = readManifest(target.path);
  validateManifest(manifest, target.path);
  const pending = manifest.pending_dirty_takeover;
  if (
    !intent ||
    !validPendingDirtyTakeover(pending) ||
    (manifest.owner !== pending.previous_owner && manifest.owner !== pending.requesting_owner)
  ) {
    throw new Error("Interrupted dirty takeover is ambiguous; preserving the stale lease and manifest without mutation.");
  }
  const stagedBytes = canonicalManifestBytes(manifest);
  const stagedDigest = createHash("sha256").update(stagedBytes).digest("hex");
  if (intent.manifest_digest !== stagedDigest) {
    throw new Error("Interrupted dirty takeover staged manifest does not match its immutable write intent.");
  }
  const restored = JSON.parse(JSON.stringify(pending.prior_manifest));
  const restoredBytes = canonicalManifestBytes(restored);
  if (createHash("sha256").update(restoredBytes).digest("hex") !== pending.prior_manifest_digest) {
    throw new Error("Interrupted dirty takeover rollback manifest does not match its recorded prior digest.");
  }
  if (restored.task_id !== taskId || restored.owner !== pending.previous_owner) {
    throw new Error("Interrupted dirty takeover prior manifest is not bound to its recorded task and owner.");
  }
  if (manifest.owner === pending.requesting_owner) {
    const decision = Array.isArray(manifest.takeover_decisions)
      ? manifest.takeover_decisions.find((entry) => entry?.dirty_takeover_transaction_id === pending.transaction_id)
      : null;
    if (!decision || decision.requesting_owner !== pending.requesting_owner || decision.previous_owner !== pending.previous_owner) {
      throw new Error("Interrupted final-owner dirty takeover lacks its exact transaction-bound decision.");
    }
    // Do not roll back a post-owner-write crash if the preserved dirty input
    // changed.  The recovery must stay fail-closed rather than erasing either
    // owner evidence or a concurrent lane edit.
    finalizeDirtyInLaneTakeover(decision);
  }
  atomicDurableWrite(target.path, restoredBytes);
  writeNewJson(taskLeasePath(state, taskId, "manifest-commits", intent.intent_id), {
    schema_version: taskLeaseSchemaVersion,
    task_id: taskId,
    generation: inspection.generation,
    token_digest: tokenDigest,
    intent_id: intent.intent_id,
    committed_at: new Date().toISOString(),
  });
  return { recovered: true, generation: inspection.generation, transactionId: pending.transaction_id };
}

function applyAssignmentTakeover(assignment, packet) {
  const now = new Date().toISOString();
  assignment.owner = packet.requesting_owner;
  assignment.owner_thread_id = process.env.CODEX_THREAD_ID || null;
  assignment.owner_acquired_at = now;
  assignment.updated_at = now;
  assignment.status = assignment.status === "closed" ? "closed" : "claimed";
  assignment.phase = "claimed";
  if (!Array.isArray(assignment.takeover_decisions)) {
    assignment.takeover_decisions = [];
  }
  const appliedAuthorityDecision = normalizeAuthorityDecision(packet.authority_decision, {
    decision: "applied",
    allowed: true,
    recordedAt: now,
    nextSafeAction: "Continue with the newly owned lane under normal gates.",
  });
  assignment.takeover_decisions.push({ ...packet, decision: "applied", applied_at: now, authority_decision: appliedAuthorityDecision });
  appendAuthorityDecision(assignment, appliedAuthorityDecision);
  assignment.events = [
    ...(Array.isArray(assignment.events) ? assignment.events : []),
    taskEvent("takeover_applied", `owner ${packet.previous_owner} -> ${packet.requesting_owner}: ${packet.reason}`),
  ];
}

function applyManifestTakeover(manifest, packet, { dirtyTakeoverTransactionId = null } = {}) {
  const now = new Date().toISOString();
  manifest.owner = packet.requesting_owner;
  manifest.owner_thread_id = process.env.CODEX_THREAD_ID || null;
  manifest.owner_acquired_at = now;
  manifest.owner_updated_at = now;
  manifest.updated_at = now;
  if (!Array.isArray(manifest.takeover_decisions)) {
    manifest.takeover_decisions = [];
  }
  const appliedAuthorityDecision = normalizeAuthorityDecision(packet.authority_decision, {
    decision: "applied",
    allowed: true,
    recordedAt: now,
    nextSafeAction: "Continue with the newly owned lane under normal gates.",
  });
  manifest.takeover_decisions.push({
    ...packet,
    decision: "applied",
    applied_at: now,
    authority_decision: appliedAuthorityDecision,
    ...(dirtyTakeoverTransactionId ? { dirty_takeover_transaction_id: dirtyTakeoverTransactionId } : {}),
  });
  appendAuthorityDecision(manifest, appliedAuthorityDecision);
  if (!Array.isArray(manifest.ownership_takeovers)) {
    manifest.ownership_takeovers = [];
  }
  manifest.ownership_takeovers.push({
    at: now,
    previous_owner: packet.previous_owner,
    new_owner: packet.requesting_owner,
    reason: packet.reason,
    approval_evidence: packet.approval_evidence,
    dirty_in_lane_evidence: packet.dirty_in_lane_evidence?.mode === "requested"
      ? packet.dirty_in_lane_evidence
      : null,
  });
  appendTaskEvent(manifest, "takeover_applied", `owner ${packet.previous_owner} -> ${packet.requesting_owner}: ${packet.reason}`);
}

function printTakeoverPacket(label, packet) {
  console.log(`${label}: takeover`);
  console.log(`- target ${packet.target_kind} ${packet.target_id}`);
  console.log(`- previous owner ${packet.previous_owner}`);
  console.log(`- requesting owner ${packet.requesting_owner}`);
  console.log(`- decision ${packet.decision}`);
  console.log(`- heartbeat stale ${packet.heartbeat_evidence.is_stale}`);
  console.log(`- heartbeat age ${packet.heartbeat_evidence.age_seconds ?? "unknown"} seconds`);
  console.log(`- worktree ${packet.worktree_evidence.status}`);
  console.log(`- branch ${packet.branch_evidence.branch || "none"}`);
  console.log(`- pr ${packet.pr_evidence.status}`);
  console.log(`- approval ${packet.approval_evidence ? "present" : "missing"}`);
  if (packet.blockers.length === 0) {
    console.log("- blockers none");
  } else {
    for (const blocker of packet.blockers) {
      console.log(`- blocker ${blocker}`);
    }
  }
}

function claimBranchNameBlocker(branchName) {
  try {
    assertSafeBranch(branchName);
  } catch (error) {
    return error.message;
  }
  return "";
}

function claimBranchAvailabilityBlocker(branchName) {
  const ignoreFixtureBranches = process.env.CODEX_WORKSPACE_TEST_IGNORE_SAFE_BACKLOG_LOCAL_BRANCHES === "1";
  if (!ignoreFixtureBranches && branchExists(branchName)) {
    return `local branch already exists: ${branchName}`;
  }
  if (!ignoreFixtureBranches && remoteBranchExists(branchName)) {
    return `remote branch already exists: origin/${branchName}`;
  }
  return "";
}

function workspaceBranchStates(manifests) {
  const states = new Map();
  for (const manifest of manifests) {
    if (!manifest.branch) {
      continue;
    }
    const existing = states.get(manifest.branch);
    if (existing === "active") {
      continue;
    }
    states.set(manifest.branch, manifest.status === "closed" ? "closed" : "active");
  }
  return states;
}

function readSafeBacklogItems({ stateRootPath = null } = {}) {
  const servicePath = join(repoRoot, "services", "supervisor", "src", "supervisor", "application", "service.py");
  if (!existsSync(servicePath)) {
    return [];
  }

  const source = readFileSync(servicePath, "utf8");
  const reportMatch = source.match(/def get_safe_development_backlog_report[\s\S]*?return SafeDevelopmentBacklogReportView/);
  if (!reportMatch) {
    return [];
  }

  const nextLanes = readSafeBacklogNextLanes(source);
  const staticItems = reportMatch[0]
    .split("SafeDevelopmentBacklogItemView(")
    .slice(1)
    .map((block) => {
      const item = {
        itemId: pythonStringField(block, "itemId"),
        status: pythonStringField(block, "status"),
        priority: pythonStringField(block, "priority"),
        recommendedSliceSize: pythonStringField(block, "recommendedSliceSize"),
        branchName: "",
        startCommand: "",
        stopLines: [],
      };
      const nextLaneVariable = pythonIdentifierField(block, "nextLane");
      const nextLane = nextLanes.get(nextLaneVariable);
      if (nextLane) {
        item.branchName = nextLane.branchName;
        item.startCommand = nextLane.startCommand;
        item.stopLines = nextLane.stopLines;
      }
      return item;
    })
    .filter((item) => item.itemId);
  const itemIds = new Set(staticItems.map((item) => item.itemId));
  const bmadItems = isTemporaryWorkspaceTestState(stateRootPath)
    ? []
    : readBmadReadyStoryBacklogItems().filter((item) => !itemIds.has(item.itemId));
  return [...staticItems, ...bmadItems];
}

function readBmadReadyStoryBacklogItems() {
  const sourcePath = "_bmad-output/implementation-artifacts/sprint-status.yaml";
  const sourceRoot = mainWorktreePath();
  if (authoritativePlanningIsTerminal(sourceRoot)) {
    return [];
  }
  const sprintStatusPath = join(sourceRoot, sourcePath);
  if (!existsSync(sprintStatusPath)) {
    return [];
  }
  let content = "";
  try {
    content = readFileSync(sprintStatusPath, "utf8");
  } catch {
    return [];
  }
  const sourceKey = yamlScalar(content, "source_key") || "local-bmad-sprint-status";
  const sourceRef = yamlScalar(content, "source_ref") || sourcePath;

  const storyStatuses = parseSprintDevelopmentStatuses(content);
  return Object.entries(storyStatuses)
    .filter(([storyKey, status]) => /^\d+-\d+-[a-z0-9-]+$/.test(storyKey) && normalizeYamlStatus(status) === "ready-for-dev")
    .map(([storyKey]) => {
      const storyPath = `_bmad-output/implementation-artifacts/${storyKey}.md`;
      const absoluteStoryPath = join(sourceRoot, storyPath);
      const itemSlug = `bmad-${storyKey}`;
      if (!existsSync(absoluteStoryPath)) {
        return null;
      }
      let storyContent = "";
      try {
        storyContent = readFileSync(absoluteStoryPath, "utf8");
      } catch {
        return null;
      }
      return {
        itemId: itemSlug,
        status: "ready",
        priority: "P3",
        recommendedSliceSize: "story",
        branchName: `codex/${itemSlug}`,
        startCommand: `node ./scripts/codex-workspace.mjs start "${storyKey.replace(/-/g, " ")}" --task-id "${itemSlug}" --branch "codex/${itemSlug}"`,
        stopLines: [
          "no provider calls outside the active lane authority",
          "no raw prompts, completions, reasoning traces, provider payloads, secrets, or tmux scrollback retention",
          "no GitHub delivery mutation without the existing lane delivery gates",
        ],
        sourceType: "bmad_sprint_status",
        sourceKey,
        sourceRef,
        sourcePath,
        storyPath,
        title: titleFromBmadStory(storyContent, storyKey),
      };
    })
    .filter(Boolean);
}

function authoritativePlanningIsTerminal(sourceRoot = repoRoot) {
  const epicsPath = join(sourceRoot, "_bmad-output", "planning-artifacts", "epics.md");
  if (!existsSync(epicsPath)) return false;
  let epicsContent = "";
  try {
    epicsContent = readFileSync(epicsPath, "utf8");
  } catch {
    return false;
  }
  if (normalizeYamlStatus(yamlScalar(epicsContent, "status")) !== "complete") return false;
  const authoritativePrd = yamlScalar(epicsContent, "authoritative_prd").replaceAll("\\", "/");
  if (!authoritativePrd || authoritativePrd.startsWith("/") || authoritativePrd.includes("..") || !authoritativePrd.startsWith("_bmad-output/")) {
    return false;
  }
  const prdPath = join(sourceRoot, authoritativePrd);
  if (!existsSync(prdPath)) return false;
  let prdContent = "";
  try {
    prdContent = readFileSync(prdPath, "utf8");
  } catch {
    return false;
  }
  return normalizeYamlStatus(yamlScalar(prdContent, "status")) === "final";
}

function yamlScalar(content, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(content || "").match(new RegExp(`^\\s*${escaped}\\s*:\\s*(.*?)\\s*$`, "im"));
  return match ? parseYamlScalarValue(match[1]) : "";
}

function parseYamlScalarValue(rawValue) {
  const value = String(rawValue || "").trim();
  if (!value) {
    return "";
  }
  const quote = value[0];
  if (quote === "'" || quote === '"') {
    let parsed = "";
    for (let index = 1; index < value.length; index += 1) {
      const char = value[index];
      if (char === quote && value[index - 1] !== "\\") {
        return parsed.replaceAll(`\\${quote}`, quote).trim();
      }
      parsed += char;
    }
    return parsed.trim();
  }
  let end = value.length;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === "#" && (index === 0 || /\s/.test(value[index - 1]))) {
      end = index;
      break;
    }
  }
  return value.slice(0, end).trim();
}

function normalizeYamlStatus(status) {
  return parseYamlScalarValue(status).toLowerCase();
}

function parseSprintDevelopmentStatuses(content) {
  return {
    ...parseSprintStatusMapping(content, "stories"),
    ...parseSprintStatusMapping(content, "development_status"),
  };
}

function parseSprintStatusMapping(content, mappingName) {
  const statuses = {};
  let mappingIndent = null;
  const escaped = mappingName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const headerPattern = new RegExp(`^(\\s*)${escaped}\\s*:\\s*$`);
  for (const line of String(content || "").split(/\r?\n/)) {
    const headerMatch = line.match(headerPattern);
    if (headerMatch) {
      mappingIndent = headerMatch[1].length;
      continue;
    }
    if (mappingIndent === null) {
      continue;
    }
    if (!line.trim()) {
      continue;
    }
    const itemMatch = line.match(/^(\s*)([A-Za-z0-9._-]+)\s*:\s*(.*?)\s*$/);
    if (!itemMatch || itemMatch[1].length <= mappingIndent) {
      break;
    }
    statuses[itemMatch[2]] = parseYamlScalarValue(itemMatch[3]);
  }
  return statuses;
}

function titleFromBmadStory(content, storyKey) {
  const header = String(content || "").match(/^#\s+Story\s+[^:]+:\s+(.+)$/m);
  return header ? header[1].trim() : titleFromDescription(storyKey.replace(/-/g, " "));
}

function readSafeBacklogNextLanes(source) {
  const nextLanes = new Map();
  const reportMatch = source.match(/def get_safe_development_backlog_report[\s\S]*?return SafeDevelopmentBacklogReportView/);
  const reportSource = reportMatch?.[0] || "";
  const laneAssignmentPattern =
    /(\w+)\s*=\s*self\._safe_backlog_next_lane\(\s*lane_slug="([^"]+)"[\s\S]*?\n\s*\)/g;

  for (const match of reportSource.matchAll(laneAssignmentPattern)) {
    const variableName = match[1];
    const laneSlug = match[2];
    nextLanes.set(variableName, {
      branchName: `codex/${laneSlug}`,
      startCommand: `node ./scripts/codex-workspace.mjs start "${laneSlug.replace(/-/g, " ")}"`,
      stopLines: pythonStringListField(match[0], "stop_lines"),
    });
  }

  const legacyMatch = source.match(
    /def _report_evidence_navigation_next_lane[\s\S]*?return NextLaneRecommendationView\(([\s\S]*?)\n\s*\)/,
  );
  if (legacyMatch) {
    const functionSource = legacyMatch[0] || "";
    const block = legacyMatch[1] || "";
    const laneSlug = pythonStringField(functionSource, "lane_slug");
    nextLanes.set("report_navigation_lane", {
      branchName: pythonStringField(block, "branchName"),
      startCommand: interpolatePythonTemplate(pythonStringField(block, "startCommand"), { lane_slug: laneSlug }),
      stopLines: pythonStringListField(block, "stopLines"),
    });
  }

  return nextLanes;
}

function pythonStringField(source, fieldName) {
  const match = source.match(new RegExp(`${fieldName}\\s*=\\s*[fF]?(['"])([\\s\\S]*?)\\1`));
  return match?.[2] || "";
}

function pythonStringListField(source, fieldName) {
  const match = source.match(new RegExp(`${fieldName}\\s*=\\s*\\[([\\s\\S]*?)\\]`));
  if (!match) {
    return [];
  }
  return [...match[1].matchAll(/(['"])([\s\S]*?)\1/g)].map((item) => item[2]).filter(Boolean);
}

function pythonIdentifierField(source, fieldName) {
  const match = source.match(new RegExp(`${fieldName}\\s*=\\s*([A-Za-z_][A-Za-z0-9_]*)`));
  return match?.[1] || "";
}

function interpolatePythonTemplate(value, variables) {
  return String(value || "")
    .replace(/\{lane_slug\.replace\("-", " "\)\}/g, String(variables.lane_slug || "").replace(/-/g, " "))
    .replace(/\{lane_slug\}/g, String(variables.lane_slug || ""));
}

function positiveInteger(value, fallback) {
  if (value === undefined || value === true || value === "") {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Expected positive integer but received: ${value}`);
  }
  return parsed;
}

function claimLaneOwner(manifest, options = {}) {
  const currentOwner = currentLaneOwner(options);
  if (manifest.owner === currentOwner) {
    const now = new Date().toISOString();
    manifest.owner_updated_at = now;
    writeClaimHeartbeatEvidence(manifest, options, now);
    appendTaskEvent(manifest, "heartbeat", `owner ${currentOwner} phase ${manifest.phase || "claimed"}`);
    return;
  }

  if (manifest.owner && !options.takeOwnership) {
    return;
  }

  const previousOwner = manifest.owner || "unowned";
  const reason = String(options.takeoverReason || "").trim();
  manifest.owner = currentOwner;
  manifest.owner_thread_id = process.env.CODEX_THREAD_ID || null;
  manifest.owner_acquired_at = new Date().toISOString();
  manifest.owner_updated_at = manifest.owner_acquired_at;
  writeClaimHeartbeatEvidence(manifest, options, manifest.owner_acquired_at);
  appendTaskEvent(manifest, "heartbeat", `owner ${currentOwner} phase ${manifest.phase || "claimed"}`);
  if (!manifest.ownership_takeovers) {
    manifest.ownership_takeovers = [];
  }
  manifest.ownership_takeovers.push({
    at: manifest.owner_acquired_at,
    previous_owner: previousOwner,
    new_owner: currentOwner,
    reason: reason || "unowned legacy lane claimed",
  });
  appendTaskEvent(
    manifest,
    "ownership_claimed",
    `owner ${previousOwner} -> ${currentOwner}${reason ? `: ${reason}` : ""}`,
  );
}

function writeClaimHeartbeatEvidence(record, options = {}, timestamp = new Date().toISOString()) {
  record.last_heartbeat_at = timestamp;
  record.stale_after_seconds = positiveInteger(options.staleAfterSeconds, 86_400);
  record.phase = record.phase || "claimed";
  record.runner_kind = record.runner_kind || "codex-cli";
  record.heartbeat_count = Number.isInteger(record.heartbeat_count) ? record.heartbeat_count + 1 : 1;
}

function reconcileManifest(manifest, options = {}) {
  if (!manifest.events) {
    manifest.events = [];
  }

  if (!options.refreshPr) {
    return manifest;
  }

  const pr = manifest.pr_url || manifest.pr_number ? prView(manifest) : prView({ ...manifest, pr_number: null });
  if (pr) {
    manifest.pr_url = pr.url || manifest.pr_url;
    manifest.pr_number = pr.number || manifest.pr_number;
    if (pr.mergedAt) {
      manifest.status = manifest.status === "closed" ? "closed" : "merged";
      manifest.merged_at = pr.mergedAt;
    } else if (pr.state === "OPEN") {
      manifest.status = "pr_open";
    }
  }

  return manifest;
}

function parseStatus(cwd) {
  const result = git(["status", "--porcelain"], { cwd });
  if (result.code !== 0) {
    throw new Error(result.stderr || "Could not inspect worktree status.");
  }

  const lines = result.stdout ? result.stdout.split(/\r?\n/).filter(Boolean) : [];
  const staged = lines.some((line) => line[0] !== " " && line[0] !== "?");
  const unstaged = lines.some((line) => line[1] !== " " || line.startsWith("??"));
  return {
    any: lines.length > 0,
    staged,
    unstaged,
    lines,
  };
}

function reconcileExistingTaskCommit(manifest, worktreeStatus) {
  if (manifest.last_commit || worktreeStatus.any) {
    return null;
  }

  const baseRef = String(manifest.base_ref || manifest.base_branch || "").trim();
  if (!baseRef) {
    return null;
  }

  const base = git(["rev-parse", "--verify", "--quiet", baseRef], { cwd: manifest.worktree_path });
  if (base.code !== 0 || !base.stdout.trim()) {
    return null;
  }

  const ahead = git(["rev-list", "--count", `${baseRef}..HEAD`], { cwd: manifest.worktree_path });
  const commitsAhead = Number.parseInt(ahead.stdout.trim(), 10);
  if (ahead.code !== 0 || !Number.isFinite(commitsAhead) || commitsAhead <= 0) {
    return null;
  }

  const shortHead = git(["rev-parse", "--short", "HEAD"], { cwd: manifest.worktree_path });
  if (shortHead.code !== 0 || !shortHead.stdout.trim()) {
    return null;
  }

  const short = shortHead.stdout.trim();
  manifest.last_commit = short;
  return { short, baseRef, commitsAhead };
}

function localCodexBranches() {
  const result = git(["for-each-ref", "--format=%(refname:short)", "refs/heads/codex"], { cwd: repoRoot });
  if (result.code !== 0 || !result.stdout) {
    return [];
  }
  return result.stdout.split(/\r?\n/).filter(Boolean).sort();
}

function branchCleanupSafety(branch, baseRef) {
  const merged = git(["merge-base", "--is-ancestor", branch, baseRef], { cwd: repoRoot });
  if (merged.code === 0) {
    return { safe: true, reason: `merged into ${baseRef}` };
  }

  const cherry = git(["cherry", baseRef, branch], { cwd: repoRoot });
  if (cherry.code !== 0) {
    return { safe: false, reason: cherry.stderr || `could not compare with ${baseRef}` };
  }

  const lines = cherry.stdout.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) {
    return { safe: true, reason: `no commits beyond ${baseRef}` };
  }

  const unapplied = lines.filter((line) => line.startsWith("+"));
  if (unapplied.length > 0) {
    return { safe: false, reason: `${unapplied.length} commit(s) not present in ${baseRef}` };
  }

  return { safe: true, reason: `patch-equivalent to ${baseRef}` };
}

function taskLockPath(state, taskId) {
  assertSafeTaskId(taskId);
  return join(state.tasksDir, `${taskId}.lock`);
}

/*
 * Task leases deliberately do not replace or remove a pathname owned by a
 * previous runner.  Every generation, heartbeat, release, and handoff is an
 * append-only record.  The only contended write is a handoff record named for
 * the immutable predecessor generation, published with link(2) no-replace
 * compare-and-set.  A second contender cannot replace either the predecessor
 * or the first successor after inspecting them.
 *
 * The old <task>.lock shape remains inspection-only.  It has no generation in
 * its name, so a check-then-rename recovery cannot be made safe against a
 * replacement between those operations.
 */
function taskLeaseRoot(state, taskId) {
  assertSafeTaskId(taskId);
  return join(state.tasksDir, ".leases", taskId);
}

function taskLeasePath(state, taskId, kind, name = null) {
  const root = taskLeaseRoot(state, taskId);
  const directory = join(root, kind);
  return name ? join(directory, `${name}.json`) : directory;
}

function taskLeaseRootRecordPath(state, taskId) {
  return join(taskLeaseRoot(state, taskId), "root.json");
}

function taskLeaseTokenDigest(token) {
  return createHash("sha256").update(String(token)).digest("hex");
}

function isUuid(value) {
  return typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value);
}

function writeNewJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  // A direct O_EXCL create makes the final .json name visible before its bytes
  // are durable.  ENOSPC or a hard termination in that window leaves a zero
  // length record which correctly fences recovery, but needlessly bricks the
  // task.  Keep the incomplete inode under a non-record suffix and publish
  // the completed inode with link(2), which is an atomic no-replace operation.
  const directory = dirname(path);
  const candidatePath = join(directory, `.${basename(path)}.${randomUUID()}.pending`);
  let fd;
  try {
    fd = openSync(candidatePath, "wx", 0o600);
    writeFileSync(fd, `${JSON.stringify(value)}\n`);
    fsyncSync(fd);
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
  try {
    linkSync(candidatePath, path);
    fsyncDirectory(directory);
  } finally {
    // The final record owns a second link after successful publication.  The
    // private candidate has no protocol meaning and can be removed; a crash
    // before this point leaves it ignored because it is not a .json record.
    try { rmSync(candidatePath, { force: true }); } catch { /* leave ignored candidate on cleanup failure */ }
  }
}

function fsyncDirectory(path) {
  let fd;
  try {
    fd = openSync(path, "r");
    fsyncSync(fd);
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function ensureDurableDirectory(path, durableAncestor) {
  const ancestor = resolve(durableAncestor);
  const target = resolve(path);
  const suffix = relative(ancestor, target);
  if (!suffix || suffix === ".." || suffix.startsWith(`..${sep}`) || resolve(join(ancestor, suffix)) !== target) {
    throw new Error(`Task lease directory escapes its durable tasks boundary: ${path}`);
  }
  // Do not use recursive mkdir here: it follows a symlink in an intermediate
  // path before lstat can inspect the final directory.  Every component below
  // tasksDir is created and verified one at a time, so .leases (or any child)
  // cannot redirect immutable lease records outside the managed state root.
  const parts = suffix.split(sep).filter(Boolean);
  let current = ancestor;
  for (const part of parts) {
    const next = join(current, part);
    if (!existsSync(next)) mkdirSync(next, { mode: 0o700 });
    const stats = lstatSync(next);
    if (!stats.isDirectory() || stats.isSymbolicLink()) {
      throw new Error(`Task lease directory is not a regular directory: ${next}`);
    }
    current = next;
  }
  for (;;) {
    const stats = lstatSync(current);
    if (!stats.isDirectory() || stats.isSymbolicLink()) {
      throw new Error(`Task lease directory is not a regular directory: ${current}`);
    }
    fsyncDirectory(current);
    if (current === ancestor) break;
    const parent = dirname(current);
    if (parent === current) throw new Error(`Task lease directory durability boundary is unavailable: ${path}`);
    current = parent;
  }
}

function readRegularJson(path, maximumSize = 16_384) {
  const stats = lstatSync(path);
  if (!stats.isFile() || stats.isSymbolicLink() || stats.size === 0 || stats.size > maximumSize) {
    throw new Error("record_not_regular_bounded_json");
  }
  return JSON.parse(readFileSync(path, "utf8"));
}

function validTaskLeaseRecord(record, taskId) {
  return Boolean(
    record &&
      record.schema_version === taskLeaseSchemaVersion &&
      record.task_id === taskId &&
      isUuid(record.generation) &&
      typeof record.owner === "string" && record.owner.trim() &&
      Number.isInteger(record.pid) && record.pid > 0 &&
      typeof record.process_start_identity === "string" && record.process_start_identity &&
      isIsoTimestamp(record.acquired_at) &&
      isUuid(record.token),
  );
}

function validTaskLeaseRootRecord(record, taskId) {
  return Boolean(
    record &&
      record.schema_version === taskLeaseSchemaVersion &&
      record.task_id === taskId &&
      isUuid(record.initial_generation) &&
      isIsoTimestamp(record.created_at),
  );
}

function validTaskLeaseHeartbeat(record, taskId, generation, tokenDigest) {
  return Boolean(
    record &&
      record.schema_version === taskLeaseSchemaVersion &&
      record.task_id === taskId &&
      record.generation === generation &&
      record.token_digest === tokenDigest &&
      isIsoTimestamp(record.heartbeat_at),
  );
}

function validTaskLeaseRelease(record, taskId, generation, tokenDigest) {
  return Boolean(
    record &&
      record.schema_version === taskLeaseSchemaVersion &&
      record.task_id === taskId &&
      record.generation === generation &&
      record.token_digest === tokenDigest &&
      isIsoTimestamp(record.released_at),
  );
}

function validTaskLeaseHandoff(record, taskId, generation, tokenDigest) {
  return Boolean(
    record &&
      record.schema_version === taskLeaseSchemaVersion &&
      record.task_id === taskId &&
      record.from_generation === generation &&
      isUuid(record.to_generation) &&
      record.to_generation !== generation &&
      record.from_token_digest === tokenDigest &&
      (record.reason === "released" || record.reason === "stale_owner_process_absent") &&
      isIsoTimestamp(record.handed_off_at),
  );
}

function validTaskLeaseEpoch(record, taskId, generation, tokenDigest, epoch) {
  return validTaskLeaseHandoff(record, taskId, generation, tokenDigest)
    && record.epoch === epoch + 1;
}

function validTaskLeaseExternalIntent(record, taskId, generation, tokenDigest) {
  return Boolean(
    record &&
      record.schema_version === taskLeaseSchemaVersion &&
      record.task_id === taskId &&
      record.generation === generation &&
      record.token_digest === tokenDigest &&
      isUuid(record.intent_id) &&
      Number.isInteger(record.runner_pid) && record.runner_pid > 0 &&
      typeof record.runner_process_start_identity === "string" && record.runner_process_start_identity &&
      typeof record.command_digest === "string" && /^[a-f0-9]{64}$/i.test(record.command_digest) &&
      isIsoTimestamp(record.started_at),
  );
}

function validTaskLeaseExternalCompletion(record, taskId, generation, tokenDigest, intentId) {
  return Boolean(
    record &&
      record.schema_version === taskLeaseSchemaVersion &&
      record.task_id === taskId &&
      record.generation === generation &&
      record.token_digest === tokenDigest &&
      record.intent_id === intentId &&
      isIsoTimestamp(record.completed_at) &&
      Number.isInteger(record.status),
  );
}

function validTaskLeaseManifestIntent(record, taskId, generation, tokenDigest) {
  return Boolean(
    record &&
      record.schema_version === taskLeaseSchemaVersion &&
      record.task_id === taskId &&
      record.generation === generation &&
      record.token_digest === tokenDigest &&
      isUuid(record.intent_id) &&
      typeof record.manifest_path_digest === "string" && /^[a-f0-9]{64}$/i.test(record.manifest_path_digest) &&
      typeof record.manifest_digest === "string" && /^[a-f0-9]{64}$/i.test(record.manifest_digest) &&
      isIsoTimestamp(record.started_at),
  );
}

function validTaskLeaseManifestCommit(record, taskId, generation, tokenDigest, intentId) {
  return Boolean(
    record &&
      record.schema_version === taskLeaseSchemaVersion &&
      record.task_id === taskId &&
      record.generation === generation &&
      record.token_digest === tokenDigest &&
      record.intent_id === intentId &&
      isIsoTimestamp(record.committed_at),
  );
}

function ensureTaskLeaseDirectories(state, taskId) {
  const root = taskLeaseRoot(state, taskId);
  const directories = [
    root,
    taskLeasePath(state, taskId, "generations"),
    taskLeasePath(state, taskId, "heartbeats"),
    taskLeasePath(state, taskId, "releases"),
    taskLeasePath(state, taskId, "handoffs"),
    taskLeasePath(state, taskId, "epochs"),
    taskLeasePath(state, taskId, "epoch-candidates"),
    taskLeasePath(state, taskId, "handoff-candidates"),
    taskLeasePath(state, taskId, "root-candidates"),
    taskLeasePath(state, taskId, "external-intents"),
    taskLeasePath(state, taskId, "external-completions"),
    taskLeasePath(state, taskId, "manifest-intents"),
    taskLeasePath(state, taskId, "manifest-commits"),
    taskLeasePath(state, taskId, "legacy-adoptions"),
    taskLeasePath(state, taskId, "legacy-adoption-candidates"),
  ];
  for (const directory of directories) {
    ensureDurableDirectory(directory, state.tasksDir);
  }
  return root;
}

function publishImmutableLeaseRecord(candidatePath, fixedPath, value) {
  writeNewJson(candidatePath, value);
  // link(2) is an atomic no-replace compare-and-swap when fixedPath is absent.
  // The fixed record and its candidate are the same inode, so inspection never
  // follows a mutable current pointer or a renamed predecessor pathname.
  linkSync(candidatePath, fixedPath);
  // The candidate was synced before link(2).  The fixed pathname is only a
  // durable publication after its containing directory has been synced too.
  fsyncDirectory(dirname(fixedPath));
  return { candidatePath, fixedPath };
}

function publishTaskLeaseRoot(state, taskId, record) {
  return publishImmutableLeaseRecord(
    taskLeasePath(state, taskId, "root-candidates", `${record.initial_generation}-${randomUUID()}`),
    taskLeaseRootRecordPath(state, taskId),
    record,
  );
}

function publishTaskLeaseHandoff(state, taskId, record) {
  return publishImmutableLeaseRecord(
    taskLeasePath(state, taskId, "handoff-candidates", `${record.from_generation}-${record.to_generation}`),
    taskLeasePath(state, taskId, "handoffs", record.from_generation),
    record,
  );
}

function publishTaskLeaseEpoch(state, taskId, record) {
  return publishImmutableLeaseRecord(
    taskLeasePath(state, taskId, "epoch-candidates", `${record.from_generation}-${record.to_generation}`),
    taskLeasePath(state, taskId, "epochs", record.from_generation),
    record,
  );
}

function leaseRecord(state, taskId, generation) {
  return readRegularJson(taskLeasePath(state, taskId, "generations", generation));
}

function latestLeaseHeartbeat(state, taskId, generation, tokenDigest) {
  const heartbeatDir = join(taskLeasePath(state, taskId, "heartbeats"), generation);
  if (!existsSync(heartbeatDir)) return null;
  const stats = lstatSync(heartbeatDir);
  if (!stats.isDirectory() || stats.isSymbolicLink()) throw new Error("heartbeat_directory_invalid");
  const names = readdirSync(heartbeatDir).filter((name) => name.endsWith(".json")).sort();
  if (names.length === 0 || names.length > taskLeaseMaximumHeartbeatHistoryRecords) throw new Error("heartbeat_history_invalid");
  let latest = null;
  for (const name of names) {
    const record = readRegularJson(join(heartbeatDir, name));
    if (!validTaskLeaseHeartbeat(record, taskId, generation, tokenDigest)) throw new Error("heartbeat_record_invalid");
    if (!latest || record.heartbeat_at > latest.heartbeat_at) latest = record;
  }
  return latest;
}

function appendTaskLeaseHeartbeat(state, taskId, record) {
  const directory = join(taskLeasePath(state, taskId, "heartbeats"), record.generation);
  // A generation directory can be newly created by this first heartbeat.  Its
  // name must be durable before the heartbeat record makes the generation
  // inspectable; otherwise a power loss can retain the record while dropping
  // an ancestor entry.  This also validates every lease ancestor to tasksDir.
  ensureDurableDirectory(directory, state.tasksDir);
  // Heartbeats are immutable inspection evidence.  Refuse the next append
  // before publication so the final release inspection remains bounded.
  const heartbeatCount = readdirSync(directory).filter((name) => name.endsWith(".json")).length;
  if (heartbeatCount >= taskLeaseMaximumHeartbeatHistoryRecords) {
    throw new Error(
      `Task lease heartbeat history capacity is exhausted: task_id=${taskId}; generation=${record.generation}; ` +
      `maximum_heartbeat_records=${taskLeaseMaximumHeartbeatHistoryRecords}; mutation=none.`,
    );
  }
  if (process.env.CODEX_WORKSPACE_TEST_CRASH_AFTER_HEARTBEAT_DIRECTORY_DURABLE === "1") {
    throw new Error("injected crash after durable heartbeat directory creation before heartbeat publication");
  }
  const heartbeat = {
    schema_version: taskLeaseSchemaVersion,
    task_id: taskId,
    generation: record.generation,
    token_digest: taskLeaseTokenDigest(record.token),
    heartbeat_at: new Date().toISOString(),
  };
  writeNewJson(join(directory, `${heartbeat.heartbeat_at.replace(/[:.]/g, "-")}-${randomUUID()}.json`), heartbeat);
  return heartbeat;
}

function leaseJsonRecords(directory) {
  if (!existsSync(directory)) return [];
  const stats = lstatSync(directory);
  if (!stats.isDirectory() || stats.isSymbolicLink()) throw new Error("lease_record_directory_invalid");
  const names = readdirSync(directory).filter((name) => name.endsWith(".json")).sort();
  if (names.length > taskLeaseMaximumHistoryRecords) throw new Error("lease_history_depth_exceeded");
  return names.map((name) => ({ name, path: join(directory, name), record: readRegularJson(join(directory, name)) }));
}

function leaseJsonRecordCount(directory, label) {
  if (!existsSync(directory)) return 0;
  const stats = lstatSync(directory);
  if (!stats.isDirectory() || stats.isSymbolicLink()) throw new Error(`${label}_directory_invalid`);
  const count = readdirSync(directory).filter((name) => name.endsWith(".json")).length;
  if (count > taskLeaseMaximumHistoryRecords) {
    throw new Error(`${label}_history_capacity_exhausted`);
  }
  return count;
}

function assertTaskLeaseIntentPairCapacity(context, kind) {
  const pair = kind === "external"
    ? ["external-intents", "external-completions", "external_intent"]
    : ["manifest-intents", "manifest-commits", "manifest_intent"];
  const [intentKind, completionKind, label] = pair;
  const intentCount = leaseJsonRecordCount(taskLeasePath(context.state, context.taskId, intentKind), label);
  const completionCount = leaseJsonRecordCount(taskLeasePath(context.state, context.taskId, completionKind), `${label}_completion`);
  if (intentCount >= taskLeaseMaximumHistoryRecords || completionCount >= taskLeaseMaximumHistoryRecords) {
    throw new Error(
      `Task lease ${label} capacity is exhausted: task_id=${context.taskId}; generation=${context.generation}; ` +
      `maximum_history_records=${taskLeaseMaximumHistoryRecords}; mutation=none.`,
    );
  }
}

function assertTaskLeaseReleaseCapacity(state, taskId, metadata) {
  const tokenDigest = taskLeaseTokenDigest(metadata.token);
  // Validate the current generation's complete heartbeat history before its
  // callback is admitted.  A release record itself does not consume either
  // history budget, so a bounded snapshot is a durable release reservation.
  const heartbeat = latestLeaseHeartbeat(state, taskId, metadata.generation, tokenDigest);
  if (!heartbeat) throw new Error("Task lease release capacity is not provable: heartbeat evidence is missing.");
  for (const [kind, label] of [
    ["external-intents", "external_intent"],
    ["external-completions", "external_completion"],
    ["manifest-intents", "manifest_intent"],
    ["manifest-commits", "manifest_commit"],
  ]) {
    leaseJsonRecordCount(taskLeasePath(state, taskId, kind), label);
  }
  const fence = leaseGenerationFence(state, taskId, metadata, tokenDigest);
  if (fence) {
    throw new Error(`Task lease release capacity is blocked by unresolved ${fence.kind} intent; refusing callback execution.`);
  }
}

function assertTaskLeaseCallbackAdmissionCapacity(state, taskId, metadata) {
  const tokenDigest = taskLeaseTokenDigest(metadata.token);
  // The initial heartbeat has already been published when this guard runs.
  // Keep one further heartbeat slot available for the protected callback to
  // prove liveness before its mandatory release.  Release itself is a single
  // generation-addressed immutable record, so validate that its exact slot is
  // still unclaimed rather than relying on an unrelated global count.
  const heartbeat = latestLeaseHeartbeat(state, taskId, metadata.generation, tokenDigest);
  if (!heartbeat) throw new Error("Task lease callback admission is not provable: heartbeat evidence is missing.");
  const heartbeatCount = leaseJsonRecordCount(
    join(taskLeasePath(state, taskId, "heartbeats"), metadata.generation),
    "heartbeat",
  );
  if (heartbeatCount >= taskLeaseMaximumHeartbeatHistoryRecords) {
    throw new Error(
      `Task lease heartbeat callback reservation capacity is exhausted: task_id=${taskId}; generation=${metadata.generation}; ` +
      `maximum_heartbeat_records=${taskLeaseMaximumHeartbeatHistoryRecords}; mutation=none.`,
    );
  }
  if (existsSync(taskLeasePath(state, taskId, "releases", metadata.generation))) {
    throw new Error("Task lease callback admission is not provable: release record already exists.");
  }

  // Every callback can persist a durable manifest update and can begin an
  // external action.  Reserve both sides of each immutable intent/completion
  // pair before publishing root.json: once root is visible, rejecting a full
  // ledger would otherwise enter the callback and strand an active lease.
  for (const [kind, label] of [
    ["external-intents", "external_intent"],
    ["external-completions", "external_completion"],
    ["manifest-intents", "manifest_intent"],
    ["manifest-commits", "manifest_commit"],
  ]) {
    const count = leaseJsonRecordCount(taskLeasePath(state, taskId, kind), label);
    if (count >= taskLeaseMaximumHistoryRecords) {
      throw new Error(
        `Task lease ${label} callback reservation capacity is exhausted: task_id=${taskId}; generation=${metadata.generation}; ` +
        `maximum_history_records=${taskLeaseMaximumHistoryRecords}; mutation=none.`,
      );
    }
  }
  assertTaskLeaseReleaseCapacity(state, taskId, metadata);
}

function unresolvedTaskLeaseExternalIntent(state, taskId, metadata, tokenDigest) {
  const intents = leaseJsonRecords(taskLeasePath(state, taskId, "external-intents"));
  const completions = new Map(
    leaseJsonRecords(taskLeasePath(state, taskId, "external-completions"))
      .filter(({ record }) => record?.generation === metadata.generation)
      .map(({ record }) => [record?.intent_id, record]),
  );
  for (const { record } of intents) {
    if (record?.generation !== metadata.generation) continue;
    if (!validTaskLeaseExternalIntent(record, taskId, metadata.generation, tokenDigest)) {
      throw new Error("external_intent_record_invalid");
    }
    const completion = completions.get(record.intent_id);
    if (!completion) return record;
    if (!validTaskLeaseExternalCompletion(completion, taskId, metadata.generation, tokenDigest, record.intent_id)) {
      throw new Error("external_completion_record_invalid");
    }
  }
  return null;
}

function unresolvedTaskLeaseManifestIntent(state, taskId, metadata, tokenDigest) {
  const intents = leaseJsonRecords(taskLeasePath(state, taskId, "manifest-intents"));
  const commits = new Map(
    leaseJsonRecords(taskLeasePath(state, taskId, "manifest-commits"))
      .filter(({ record }) => record?.generation === metadata.generation)
      .map(({ record }) => [record?.intent_id, record]),
  );
  for (const { record } of intents) {
    if (record?.generation !== metadata.generation) continue;
    if (!validTaskLeaseManifestIntent(record, taskId, metadata.generation, tokenDigest)) {
      throw new Error("manifest_intent_record_invalid");
    }
    const commit = commits.get(record.intent_id);
    if (!commit) return record;
    if (!validTaskLeaseManifestCommit(commit, taskId, metadata.generation, tokenDigest, record.intent_id)) {
      throw new Error("manifest_commit_record_invalid");
    }
  }
  return null;
}

function leaseGenerationFence(state, taskId, metadata, tokenDigest) {
  const external = unresolvedTaskLeaseExternalIntent(state, taskId, metadata, tokenDigest);
  if (external) return { kind: "external", intent: external };
  const manifest = unresolvedTaskLeaseManifestIntent(state, taskId, metadata, tokenDigest);
  if (manifest) return { kind: "manifest", intent: manifest };
  return null;
}

function taskLeaseExternalIntent(context, commandName, commandArguments) {
  // Reserve both immutable sides before publishing an intent.  Otherwise a
  // full completion history could strand a protected callback at release.
  assertTaskLeaseIntentPairCapacity(context, "external");
  const intent = {
    schema_version: taskLeaseSchemaVersion,
    task_id: context.taskId,
    generation: context.generation,
    token_digest: taskLeaseTokenDigest(context.token),
    intent_id: randomUUID(),
    runner_pid: process.pid,
    runner_process_start_identity: context.processStart,
    command_digest: createHash("sha256").update(JSON.stringify([commandName, ...commandArguments])).digest("hex"),
    started_at: new Date().toISOString(),
  };
  writeNewJson(taskLeasePath(context.state, context.taskId, "external-intents", intent.intent_id), intent);
  return intent;
}

function completeTaskLeaseExternalIntent(context, intent, result) {
  writeNewJson(taskLeasePath(context.state, context.taskId, "external-completions", intent.intent_id), {
    schema_version: taskLeaseSchemaVersion,
    task_id: context.taskId,
    generation: context.generation,
    token_digest: taskLeaseTokenDigest(context.token),
    intent_id: intent.intent_id,
    completed_at: new Date().toISOString(),
    status: Number.isInteger(result.status) ? result.status : 1,
  });
}

function inspectLegacyTaskLock(state, taskId) {
  const lockPath = taskLockPath(state, taskId);
  if (!existsSync(lockPath)) return null;
  let metadata = null;
  let legacyReason = "legacy_lock_metadata_unreadable";
  try {
    const stats = lstatSync(lockPath);
    if (!stats.isFile() || stats.isSymbolicLink()) legacyReason = "legacy_lock_not_regular_file";
    else if (stats.size === 0) legacyReason = "legacy_lock_zero_bytes";
    else if (stats.size > 16_384) legacyReason = "legacy_lock_metadata_too_large";
    else {
      const candidate = JSON.parse(readFileSync(lockPath, "utf8"));
      if (validTaskLockMetadata(candidate, taskId)) {
        metadata = candidate;
        legacyReason = "legacy_lock_inspection_only";
      } else {
        legacyReason = "legacy_lock_metadata_invalid";
      }
    }
  } catch {
    // The legacy pathname is intentionally never reopened for recovery.
  }
  return { taskId, lockPath, status: "legacy_retained", reason: legacyReason, metadata, protocol: "legacy_lock" };
}

function legacyLockSnapshot(lockPath) {
  const stats = lstatSync(lockPath);
  if (!stats.isFile() || stats.isSymbolicLink() || stats.size === 0 || stats.size > 16_384) {
    throw new Error("legacy_snapshot_requires_regular_bounded_file");
  }
  const raw = readFileSync(lockPath);
  return {
    device: String(stats.dev),
    inode: String(stats.ino),
    size: stats.size,
    sha256: createHash("sha256").update(raw).digest("hex"),
  };
}

function sameLegacyLockSnapshot(left, right) {
  return Boolean(
    left && right &&
      left.device === right.device &&
      left.inode === right.inode &&
      left.size === right.size &&
      left.sha256 === right.sha256,
  );
}

function validLegacyAdoption(record, taskId) {
  return Boolean(
    record &&
      record.schema_version === taskLeaseSchemaVersion &&
      record.task_id === taskId &&
      record.protocol === "legacy-v1-to-v2-adoption" &&
      typeof record.legacy_lock_path === "string" && record.legacy_lock_path &&
      record.snapshot && typeof record.snapshot.device === "string" && typeof record.snapshot.inode === "string" &&
      Number.isInteger(record.snapshot.size) && record.snapshot.size > 0 &&
      typeof record.snapshot.sha256 === "string" && /^[a-f0-9]{64}$/i.test(record.snapshot.sha256) &&
      Number.isInteger(record.dead_pid) && record.dead_pid > 0 &&
      typeof record.dead_process_start_identity === "string" && record.dead_process_start_identity &&
      isIsoTimestamp(record.adopted_at),
  );
}

function legacyAdoptionRecordPath(state, taskId) {
  return taskLeasePath(state, taskId, "legacy-adoptions", "adoption");
}

function inspectLegacyAdoption(state, taskId) {
  const path = legacyAdoptionRecordPath(state, taskId);
  if (!existsSync(path)) return null;
  const record = readRegularJson(path);
  if (!validLegacyAdoption(record, taskId)) throw new Error("legacy_adoption_record_invalid");
  if (resolve(record.legacy_lock_path) !== resolve(taskLockPath(state, taskId))) throw new Error("legacy_adoption_lock_path_invalid");
  const candidatePath = taskLeasePath(state, taskId, "legacy-adoption-candidates", record.snapshot.sha256);
  const current = legacyLockSnapshot(taskLockPath(state, taskId));
  const candidate = legacyLockSnapshot(candidatePath);
  if (!sameLegacyLockSnapshot(record.snapshot, current) || !sameLegacyLockSnapshot(record.snapshot, candidate)) {
    throw new Error("legacy_adoption_snapshot_mismatch");
  }
  return record;
}

function legacyRecoveryAdoptionPacket(state, taskId) {
  const blockers = [];
  const lockPath = taskLockPath(state, taskId);
  let metadata = null;
  let snapshot = null;
  let candidateMatches = false;
  if (taskId !== legacyRecoveryAdoptionTaskId) blockers.push("task is not the exact governed recovery target");
  try {
    metadata = readRegularJson(lockPath);
    if (!validTaskLockMetadata(metadata, taskId)) blockers.push("legacy lock metadata is invalid");
  } catch {
    blockers.push("legacy lock is not a readable regular bounded record");
  }
  try {
    snapshot = legacyLockSnapshot(lockPath);
  } catch {
    blockers.push("legacy lock has no safe inode/hash snapshot");
  }
  if (metadata && validTaskLockMetadata(metadata, taskId)) {
    const observed = processStartIdentity(metadata.pid);
    if (observed !== null) blockers.push("legacy owner PID/start identity is still observable or reused");
    try {
      process.kill(metadata.pid, 0);
      blockers.push("legacy owner PID is still live or not probeable as absent");
    } catch (error) {
      if (error?.code !== "ESRCH") blockers.push("legacy owner PID absence could not be proven");
    }
  }
  if (snapshot) {
    const candidatePath = taskLeasePath(state, taskId, "legacy-adoption-candidates", snapshot.sha256);
    if (existsSync(candidatePath)) {
      try { candidateMatches = sameLegacyLockSnapshot(snapshot, legacyLockSnapshot(candidatePath)); } catch { candidateMatches = false; }
      if (!candidateMatches) blockers.push("existing adoption candidate inode/hash does not match legacy lock");
    }
  }
  try {
    const existing = inspectLegacyAdoption(state, taskId);
    if (existing) candidateMatches = true;
  } catch {
    blockers.push("existing adoption evidence no longer exactly matches the retained legacy lock");
  }
  return {
    taskId,
    protocol: "legacy-v1-to-v2-adoption",
    lockPath,
    owner: metadata?.owner || null,
    deadPid: metadata?.pid || null,
    deadProcessStartIdentity: metadata?.process_start_identity || null,
    snapshot,
    candidateMatches,
    allowed: blockers.length === 0,
    blockers,
  };
}

function applyLegacyRecoveryAdoption(state, packet, approval) {
  const taskId = packet.taskId;
  ensureTaskLeaseDirectories(state, taskId);
  const fresh = legacyRecoveryAdoptionPacket(state, taskId);
  if (!fresh.allowed || !sameLegacyLockSnapshot(packet.snapshot, fresh.snapshot)) {
    throw new Error("legacy recovery adoption evidence drifted; rerun dry-run.");
  }
  const candidatePath = taskLeasePath(state, taskId, "legacy-adoption-candidates", fresh.snapshot.sha256);
  const candidateWasAbsent = !existsSync(candidatePath);
  if (candidateWasAbsent) {
    linkSync(taskLockPath(state, taskId), candidatePath);
  }
  // A hard link is not durable until its parent directory is synced.  Sync on
  // replay too: a candidate that survived an earlier interrupted publication
  // must be made durable before an adoption record is allowed to reference it.
  fsyncDirectory(dirname(candidatePath));
  if (candidateWasAbsent && process.env.CODEX_WORKSPACE_TEST_CRASH_AFTER_DURABLE_LEGACY_ADOPTION_CANDIDATE === "1") {
    throw new Error("injected crash after durable legacy adoption candidate publication before adoption record");
  }
  const afterLink = legacyRecoveryAdoptionPacket(state, taskId);
  if (!afterLink.allowed || !sameLegacyLockSnapshot(fresh.snapshot, afterLink.snapshot)) {
    throw new Error("legacy recovery adoption lost its exact inode/hash proof after candidate publication.");
  }
  const record = {
    schema_version: taskLeaseSchemaVersion,
    task_id: taskId,
    protocol: "legacy-v1-to-v2-adoption",
    legacy_lock_path: taskLockPath(state, taskId),
    dead_pid: afterLink.deadPid,
    dead_process_start_identity: afterLink.deadProcessStartIdentity,
    snapshot: afterLink.snapshot,
    approval_digest: createHash("sha256").update(approval).digest("hex"),
    adopted_at: new Date().toISOString(),
  };
  try {
    writeNewJson(legacyAdoptionRecordPath(state, taskId), record);
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    const existing = inspectLegacyAdoption(state, taskId);
    if (!existing || !sameLegacyLockSnapshot(existing.snapshot, record.snapshot)) throw new Error("legacy adoption record conflicts with current proof.");
  }
  return { ...legacyRecoveryAdoptionPacket(state, taskId), adoptionPath: legacyAdoptionRecordPath(state, taskId) };
}

function processStartIdentity(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return null;
  try {
    const raw = readFileSync(`/proc/${pid}/stat`, "utf8");
    const close = raw.lastIndexOf(")");
    if (close < 0) return null;
    const fields = raw.slice(close + 1).trim().split(/\s+/);
    const startTicks = fields[19];
    return /^\d+$/.test(startTicks || "") ? `linux-proc-start-ticks:${startTicks}` : null;
  } catch {
    return null;
  }
}

function isIsoTimestamp(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isCanonicalIsoTimestamp(value) {
  if (typeof value !== "string") return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function validTaskLockMetadata(metadata, taskId) {
  return Boolean(
    metadata &&
      metadata.schema_version === taskLockSchemaVersion &&
      metadata.task_id === taskId &&
      typeof metadata.owner === "string" && metadata.owner.trim() &&
      Number.isInteger(metadata.pid) && metadata.pid > 0 &&
      typeof metadata.process_start_identity === "string" && metadata.process_start_identity &&
      isIsoTimestamp(metadata.acquired_at) &&
      isIsoTimestamp(metadata.heartbeat_at) &&
      typeof metadata.token === "string" && /^[0-9a-f-]{36}$/i.test(metadata.token),
  );
}

function inspectTaskLease(state, taskId) {
  const root = taskLeaseRoot(state, taskId);
  if (!existsSync(root)) return { taskId, lockPath: root, status: "absent", reason: "lease_not_present", metadata: null, protocol: "versioned_lease" };
  try {
    const rootStats = lstatSync(root);
    if (!rootStats.isDirectory() || rootStats.isSymbolicLink()) {
      return { taskId, lockPath: root, status: "ambiguous", reason: "lease_root_invalid", metadata: null, protocol: "versioned_lease" };
    }
    // A crash before root publication can leave durable candidate generation
    // directories behind.  They own no lease until root.json exists; treat the
    // tree as absent so acquisition can inspect their bounded ledgers before
    // publishing a new root.
    if (!existsSync(taskLeaseRootRecordPath(state, taskId))) {
      return { taskId, lockPath: root, status: "absent", reason: "lease_root_record_absent", metadata: null, protocol: "versioned_lease" };
    }
    const rootRecord = readRegularJson(taskLeaseRootRecordPath(state, taskId));
    if (!validTaskLeaseRootRecord(rootRecord, taskId)) {
      return { taskId, lockPath: root, status: "ambiguous", reason: "lease_root_record_invalid", metadata: null, protocol: "versioned_lease" };
    }
    let generation = rootRecord.initial_generation;
    let epoch = 0;
    const seen = new Set();
    for (let depth = 0; depth < taskLeaseMaximumGenerationChainLength; depth += 1) {
      if (seen.has(generation)) return { taskId, lockPath: root, status: "ambiguous", reason: "lease_handoff_cycle", metadata: null, protocol: "versioned_lease" };
      seen.add(generation);
      const metadata = leaseRecord(state, taskId, generation);
      if (!validTaskLeaseRecord(metadata, taskId) || metadata.generation !== generation) {
        return { taskId, lockPath: root, status: "ambiguous", reason: "lease_generation_record_invalid", metadata: null, protocol: "versioned_lease" };
      }
      const tokenDigest = taskLeaseTokenDigest(metadata.token);
      const handoffPath = taskLeasePath(state, taskId, "handoffs", generation);
      const releasePath = taskLeasePath(state, taskId, "releases", generation);
      const handoff = existsSync(handoffPath) ? readRegularJson(handoffPath) : null;
      const release = existsSync(releasePath) ? readRegularJson(releasePath) : null;
      if (handoff && !validTaskLeaseHandoff(handoff, taskId, generation, tokenDigest)) {
        return { taskId, lockPath: root, status: "ambiguous", reason: "lease_handoff_record_invalid", metadata: null, protocol: "versioned_lease" };
      }
      if (release && !validTaskLeaseRelease(release, taskId, generation, tokenDigest)) {
        return { taskId, lockPath: root, status: "ambiguous", reason: "lease_release_record_invalid", metadata: null, protocol: "versioned_lease" };
      }
      if (handoff) {
        if ((release && handoff.reason !== "released") || (!release && handoff.reason !== "stale_owner_process_absent")) {
          return { taskId, lockPath: root, status: "ambiguous", reason: "lease_handoff_predecessor_state_invalid", metadata: null, protocol: "versioned_lease" };
        }
        generation = handoff.to_generation;
        continue;
      }
      if (release) {
        const epochPath = taskLeasePath(state, taskId, "epochs", generation);
        const epochRecord = existsSync(epochPath) ? readRegularJson(epochPath) : null;
        if (epochRecord) {
          if (!validTaskLeaseEpoch(epochRecord, taskId, generation, tokenDigest, epoch) || epochRecord.reason !== "released") {
            return { taskId, lockPath: root, status: "ambiguous", reason: "lease_epoch_record_invalid", metadata: null, protocol: "versioned_lease" };
          }
          if (epoch >= taskLeaseMaximumEpochCount) {
            return { taskId, lockPath: root, status: "ambiguous", reason: "lease_epoch_capacity_exceeded", metadata: null, protocol: "versioned_lease" };
          }
          generation = epochRecord.to_generation;
          epoch += 1;
          seen.clear();
          depth = -1;
          continue;
        }
        return {
          taskId,
          lockPath: root,
          status: "released",
          reason: "owner_released_generation",
          metadata,
          generation,
          release,
          chainDepth: depth + 1,
          epoch,
          protocol: "versioned_lease",
        };
      }
      const heartbeat = latestLeaseHeartbeat(state, taskId, generation, tokenDigest);
      if (!heartbeat) {
        return { taskId, lockPath: root, status: "ambiguous", reason: "lease_heartbeat_missing", metadata: null, protocol: "versioned_lease" };
      }
      const observedStart = processStartIdentity(metadata.pid);
      if (observedStart === metadata.process_start_identity) {
        return {
          taskId,
          lockPath: root,
          status: "active",
          reason: "owner_process_identity_matches",
          metadata,
          generation,
          heartbeat,
          chainDepth: depth + 1,
          protocol: "versioned_lease",
        };
      }
      if (observedStart) {
        return { taskId, lockPath: root, status: "ambiguous", reason: "pid_start_identity_mismatch", metadata, generation, heartbeat, protocol: "versioned_lease" };
      }
      try {
        process.kill(metadata.pid, 0);
        return { taskId, lockPath: root, status: "ambiguous", reason: "owner_process_identity_unavailable", metadata, generation, heartbeat, protocol: "versioned_lease" };
      } catch (error) {
        if (error?.code === "ESRCH") {
          const fence = leaseGenerationFence(state, taskId, metadata, tokenDigest);
          if (fence) {
            return {
              taskId,
              lockPath: root,
              status: "ambiguous",
              reason: fence.kind === "external" ? "external_command_fence_unresolved" : "manifest_write_intent_unresolved",
              metadata,
              generation,
              heartbeat,
              protocol: "versioned_lease",
            };
          }
          const epochPath = taskLeasePath(state, taskId, "epochs", generation);
          const epochRecord = existsSync(epochPath) ? readRegularJson(epochPath) : null;
          if (epochRecord) {
            if (!validTaskLeaseEpoch(epochRecord, taskId, generation, tokenDigest, epoch) || epochRecord.reason !== "stale_owner_process_absent") {
              return { taskId, lockPath: root, status: "ambiguous", reason: "lease_epoch_record_invalid", metadata: null, protocol: "versioned_lease" };
            }
            if (epoch >= taskLeaseMaximumEpochCount) {
              return { taskId, lockPath: root, status: "ambiguous", reason: "lease_epoch_capacity_exceeded", metadata: null, protocol: "versioned_lease" };
            }
            generation = epochRecord.to_generation;
            epoch += 1;
            seen.clear();
            depth = -1;
            continue;
          }
          return {
            taskId,
            lockPath: root,
            status: "stale",
            reason: "owner_process_not_present",
            metadata,
            generation,
            heartbeat,
            chainDepth: depth + 1,
            epoch,
            protocol: "versioned_lease",
          };
        }
        return { taskId, lockPath: root, status: "ambiguous", reason: "owner_process_probe_denied", metadata, generation, heartbeat, protocol: "versioned_lease" };
      }
    }
    return {
      taskId,
      lockPath: root,
      status: "ambiguous",
      reason: "lease_handoff_depth_exceeded",
      metadata: null,
      chainDepth: taskLeaseMaximumGenerationChainLength,
      epoch,
      protocol: "versioned_lease",
    };
  } catch {
    return { taskId, lockPath: root, status: "ambiguous", reason: "lease_record_unreadable", metadata: null, protocol: "versioned_lease" };
  }
}

function inspectTaskLock(state, taskId) {
  // A retained v1 pathname blocks the task even if a partial v2 lease tree is
  // also present.  Returning it first keeps read-only inspection aligned with
  // the acquire path's fail-closed compatibility rule.
  const legacy = inspectLegacyTaskLock(state, taskId);
  if (!legacy) return inspectTaskLease(state, taskId);
  try {
    const adoption = inspectLegacyAdoption(state, taskId);
    if (adoption) {
      const v2 = inspectTaskLease(state, taskId);
      return {
        ...v2,
        legacyAdoption: {
          protocol: adoption.protocol,
          snapshot: adoption.snapshot,
          adoptedAt: adoption.adopted_at,
        },
      };
    }
  } catch {
    return { ...legacy, status: "legacy_retained", reason: "legacy_adoption_evidence_invalid", protocol: "legacy_lock" };
  }
  return legacy;
}

function redactTaskLockInspection(inspection) {
  const metadata = inspection?.metadata;
  return {
    taskId: inspection?.taskId || null,
    lockPath: inspection?.lockPath || null,
    status: inspection?.status || "ambiguous",
    reason: inspection?.reason || "lock_inspection_unavailable",
    owner: metadata?.owner || null,
    pid: metadata?.pid ?? null,
    processStartIdentityPresent: Boolean(metadata?.process_start_identity),
    acquiredAt: metadata?.acquired_at || null,
    heartbeatAt: inspection?.heartbeat?.heartbeat_at || metadata?.heartbeat_at || null,
    tokenPresent: Boolean(metadata?.token),
    protocol: inspection?.protocol || "unknown",
    generation: inspection?.generation || null,
    mutation: "none; read-only lock inspection",
  };
}

function assertTaskLeaseAcquisitionCapacity(inspection, taskId, options = {}) {
  const mayRecoverStale = inspection.status === "stale" && options.recoverStale !== false;
  if (inspection.status === "absent") return;
  if (inspection.status !== "released" && !mayRecoverStale) {
    const inspected = redactTaskLockInspection(inspection);
    throw new Error(`Task lease cannot be handed off: task_id=${taskId}; status=${inspected.status}; reason=${inspected.reason}; mutation=none.`);
  }
  if (!Number.isInteger(inspection.chainDepth) || inspection.chainDepth < 1) {
    throw new Error(`Task lease chain depth is not provable: task_id=${taskId}; mutation=none.`);
  }
  if (inspection.chainDepth >= taskLeaseMaximumGenerationChainLength
    && (!Number.isInteger(inspection.epoch) || inspection.epoch >= taskLeaseMaximumEpochCount)) {
    throw new Error(
      `Task lease handoff capacity is exhausted: task_id=${taskId}; chain_depth=${inspection.chainDepth}; ` +
      `maximum_chain_length=${taskLeaseMaximumGenerationChainLength}; mutation=none.`,
    );
  }
}

function withManifestLock(state, taskId, fn, options = {}) {
  mkdirSync(state.tasksDir, { recursive: true });
  const lockInspection = inspectTaskLock(state, taskId);
  if (lockInspection.protocol === "legacy_lock") {
    const inspected = redactTaskLockInspection(lockInspection);
    throw new Error(`Legacy task lock is retained: task_id=${taskId}; status=${inspected.status}; reason=${inspected.reason}; mutation=none.`);
  }
  // Validate both eligibility and capacity before publishing a generation.  A
  // generation that cannot later be traversed must never own a callback.
  assertTaskLeaseAcquisitionCapacity(lockInspection, taskId, options);
  const processStart = processStartIdentity(process.pid);
  if (!processStart) {
    throw new Error("Task lease ownership cannot be established because the current process start identity is unavailable.");
  }
  const metadata = {
    schema_version: taskLeaseSchemaVersion,
    task_id: taskId,
    generation: randomUUID(),
    owner: String(options.owner || currentLaneOwner(options)),
    pid: process.pid,
    process_start_identity: processStart,
    acquired_at: new Date().toISOString(),
    token: randomUUID(),
  };
  ensureTaskLeaseDirectories(state, taskId);
  writeNewJson(taskLeasePath(state, taskId, "generations", metadata.generation), metadata);
  appendTaskLeaseHeartbeat(state, taskId, metadata);
  // Check immediately after the initial heartbeat but before publishing this
  // generation as a root or successor.  A full history therefore leaves no
  // active lease behind and cannot enter the protected callback.
  assertTaskLeaseCallbackAdmissionCapacity(state, taskId, metadata);
  const rootRecord = {
    schema_version: taskLeaseSchemaVersion,
    task_id: taskId,
    initial_generation: metadata.generation,
    created_at: new Date().toISOString(),
  };
  let inspection;
  try {
    publishTaskLeaseRoot(state, taskId, rootRecord);
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    inspection = inspectTaskLease(state, taskId);
    // A competing immutable handoff can consume the final safe slot after our
    // first inspection.  Re-reserve capacity before linking our successor.
    assertTaskLeaseAcquisitionCapacity(inspection, taskId, options);
    const handoff = {
      schema_version: taskLeaseSchemaVersion,
      task_id: taskId,
      from_generation: inspection.generation,
      to_generation: metadata.generation,
      from_token_digest: taskLeaseTokenDigest(inspection.metadata.token),
      reason: inspection.status === "released" ? "released" : "stale_owner_process_absent",
      handed_off_at: new Date().toISOString(),
    };
    try {
      if (inspection.chainDepth >= taskLeaseMaximumGenerationChainLength) {
        handoff.reason = inspection.status === "released" ? "released" : "stale_owner_process_absent";
        handoff.epoch = (inspection.epoch || 0) + 1;
        publishTaskLeaseEpoch(state, taskId, handoff);
      } else {
        publishTaskLeaseHandoff(state, taskId, handoff);
      }
    } catch (retryError) {
      const current = redactTaskLockInspection(inspectTaskLease(state, taskId));
      throw new Error(`Task lease handoff could not acquire immutable predecessor generation: status=${current.status}; reason=${current.reason}; mutation=none; error=${retryError?.code || "unknown"}.`);
    }
  }

  const acquired = inspectTaskLease(state, taskId);
  if (
    acquired.status !== "active" ||
    acquired.generation !== metadata.generation ||
    acquired.metadata?.token !== metadata.token ||
    acquired.chainDepth > taskLeaseMaximumGenerationChainLength
  ) {
    throw new Error("Task lease acquisition could not prove a releasable active generation; refusing callback execution.");
  }

  const heartbeat = () => {
    const current = inspectTaskLease(state, taskId);
    if (
      current.status !== "active" ||
      current.generation !== metadata.generation ||
      current.metadata?.token !== metadata.token ||
      current.metadata?.pid !== process.pid ||
      current.metadata?.process_start_identity !== processStart
    ) {
      throw new Error("Task lease ownership changed before heartbeat; refusing to continue.");
    }
    appendTaskLeaseHeartbeat(state, taskId, metadata);
  };

  const release = () => {
    const current = inspectTaskLease(state, taskId);
    if (
      current.status !== "active" ||
      current.generation !== metadata.generation ||
      current.metadata?.token !== metadata.token ||
      current.metadata?.owner !== metadata.owner ||
      current.metadata?.pid !== process.pid ||
      current.metadata?.process_start_identity !== processStart
    ) {
      throw new Error("Task lease owner identity changed before release; refusing to release another generation.");
    }
    assertTaskLeaseReleaseCapacity(state, taskId, metadata);
    try {
      writeNewJson(taskLeasePath(state, taskId, "releases", metadata.generation), {
        schema_version: taskLeaseSchemaVersion,
        task_id: taskId,
        generation: metadata.generation,
        token_digest: taskLeaseTokenDigest(metadata.token),
        released_at: new Date().toISOString(),
      });
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      throw new Error("Task lease release record already exists; refusing to overwrite immutable release evidence.");
    }
  };

  const priorWriteContext = activeTaskLeaseWriteContext;
  const writeContext = {
    state,
    taskId,
    generation: metadata.generation,
    token: metadata.token,
    processStart,
  };
  try {
    activeTaskLeaseWriteContext = writeContext;
    return fn({ token: metadata.token, generation: metadata.generation, heartbeat, release });
  } finally {
    activeTaskLeaseWriteContext = priorWriteContext;
    release();
  }
}

function assertActiveTaskLeaseWriteOwnership(context) {
  const current = inspectTaskLease(context.state, context.taskId);
  if (
    current.status !== "active" ||
    current.generation !== context.generation ||
    current.metadata?.token !== context.token ||
    current.metadata?.pid !== process.pid ||
    current.metadata?.process_start_identity !== context.processStart
  ) {
    throw new Error("Task lease ownership changed before durable manifest write; refusing to publish an unbound manifest.");
  }
}

function withAssignmentsIndexLock(state, fn) {
  mkdirSync(state.assignmentsDir, { recursive: true });
  const lockPath = join(state.assignmentsDir, ".assignment-index.lock");
  let fd;
  try {
    fd = openSync(lockPath, "wx");
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    throw new Error(`Assignment index is locked by another session: ${lockPath}`);
  }
  try {
    return fn();
  } finally {
    closeSync(fd);
    rmSync(lockPath, { force: true });
  }
}

function withAssignmentLock(state, assignmentId, fn) {
  assertSafeTaskId(assignmentId);
  return withAssignmentsIndexLock(state, () => withAssignmentLockUnsafe(state, assignmentId, fn));
}

function withAssignmentLockUnsafe(state, assignmentId, fn) {
  mkdirSync(state.assignmentsDir, { recursive: true });
  const lockPath = join(state.assignmentsDir, `${assignmentId}.lock`);
  let fd;
  try {
    fd = openSync(lockPath, "wx");
  } catch (error) {
    if (error?.code !== "EEXIST") {
      throw error;
    }
    throw new Error(`Assignment is locked by another session: ${lockPath}`);
  }

  try {
    return fn();
  } finally {
    closeSync(fd);
    rmSync(lockPath, { force: true });
  }
}

function taskEvent(type, message) {
  return {
    at: new Date().toISOString(),
    type,
    message,
  };
}

function appendTaskEvent(manifest, type, message) {
  if (!manifest.events) {
    manifest.events = [];
  }
  manifest.events.push(taskEvent(type, message));
}

function removeWorktree(worktreePath, state, options = {}) {
  const cwd = options.cwd || repoRoot;
  assertManagedWorktreePath(worktreePath, state);
  cleanupGeneratedArtifacts(worktreePath);
  const result = git(["worktree", "remove", worktreePath], { cwd });
  if (result.code === 0) {
    if (existsSync(worktreePath)) {
      removeManagedDirectory(worktreePath, state);
    }
    return true;
  }

  if (worktreeListed(worktreePath, cwd)) {
    throw new Error(result.stderr || result.stdout || `Could not remove worktree: ${worktreePath}`);
  }

  removeManagedDirectory(worktreePath, state);
  return true;
}

function removeManagedDirectory(worktreePath, state) {
  assertManagedWorktreePath(worktreePath, state);
  cleanupGeneratedArtifacts(worktreePath);
  rmSync(worktreePath, { recursive: true, force: true });
  if (existsSync(worktreePath)) {
    throw new Error(`Worktree path still exists after cleanup: ${worktreePath}`);
  }
}

function cleanupGeneratedArtifacts(worktreePath) {
  if (!existsSync(worktreePath)) {
    return;
  }
  for (const artifact of generatedCleanupArtifacts()) {
    const artifactPath = join(worktreePath, artifact);
    if (existsSync(artifactPath)) {
      try {
        rmSync(artifactPath, { recursive: true, force: true });
      } catch {
        throw new Error(`Could not remove generated cleanup artifact: ${artifactPath}`);
      }
    }
  }
}

function generatedCleanupArtifacts() {
  return [
    ".pytest_cache",
    ".mypy_cache",
    ".ruff_cache",
    "services/supervisor/.pytest_cache",
    "services/supervisor/.mypy_cache",
    "services/supervisor/.ruff_cache",
    "services/supervisor/.venv",
  ];
}

function assertManagedWorktreeRoot(state) {
  if (typeof state?.worktreesDir !== "string" || !state.worktreesDir.trim()) {
    throw new Error("Refusing to inspect managed worktree root: missing managed root target.");
  }
  const managedRootPath = resolve(state.worktreesDir);
  let managedRootStat;
  try {
    managedRootStat = lstatSync(managedRootPath);
  } catch {
    throw new Error(`Refusing to inspect managed worktree root: ${state.worktreesDir} (canonical identity is unavailable).`);
  }
  if (managedRootStat.isSymbolicLink()) {
    throw new Error(`Refusing to inspect managed worktree root: ${state.worktreesDir} (managed root must not be a symlink).`);
  }
  const managedRoot = canonicalExistingPath(managedRootPath);
  if (!managedRoot) {
    throw new Error(`Refusing to inspect managed worktree root: ${state.worktreesDir} (canonical identity is unavailable).`);
  }
  return managedRoot;
}

function assertManagedWorktreePath(worktreePath, state) {
  if (typeof worktreePath !== "string" || !worktreePath.trim()) {
    throw new Error("Refusing to remove unmanaged worktree path: missing worktree target.");
  }
  const targetPath = resolve(worktreePath);
  const managedRoot = assertManagedWorktreeRoot(state);
  let targetStat;
  try {
    targetStat = lstatSync(targetPath);
  } catch {
    throw new Error(`Refusing to remove unmanaged worktree path: ${worktreePath} (target identity is unavailable).`);
  }
  if (targetStat.isSymbolicLink()) {
    throw new Error(`Refusing to remove unmanaged worktree path: ${worktreePath} (cleanup target must not be a symlink).`);
  }
  const target = canonicalExistingPath(targetPath);
  if (!target) {
    throw new Error(`Refusing to remove unmanaged worktree path: ${worktreePath} (canonical identity is unavailable).`);
  }
  const rel = relative(managedRoot, target);
  if (!rel || rel.startsWith("..") || resolve(managedRoot, rel) !== target) {
    throw new Error(`Refusing to remove unmanaged worktree path: ${worktreePath}`);
  }
  const trustedBase = canonicalExistingPath(mainWorktreePath());
  if (trustedBase && target === trustedBase) {
    throw new Error(`Refusing to remove unmanaged worktree path: ${worktreePath} (target resolves to the trusted Base Checkout).`);
  }
  return { target, managedRoot };
}

function assertRegisteredManagedWorktree(manifest, state) {
  assertSafeBranch(manifest.branch);
  const target = assertManagedWorktreePath(manifest.worktree_path, state);
  const registryCwd = mainWorktreePath();
  const result = git(["worktree", "list", "--porcelain"], { cwd: registryCwd });
  if (result.code !== 0) {
    throw new Error(`Refusing cleanup: managed worktree registration evidence is unavailable for ${manifest.task_id}.`);
  }
  const expectedBranch = `refs/heads/${manifest.branch}`;
  const match = parseWorktreePorcelain(result.stdout).find(
    (record) => record.branch === expectedBranch && samePath(record.path, target.target),
  );
  if (!match) {
    throw new Error(`Refusing cleanup: ${manifest.task_id} target is not a registered managed worktree on ${manifest.branch}.`);
  }
  return target;
}

function assertCleanupWorktreeForMerged(manifest, state) {
  return assertCleanupWorktreeTarget(manifest, state, {
    absentPartial: () => exactMergedCleanupPartialResume(manifest),
  });
}

function assertCleanupWorktreeForIntegrated(manifest, state, context) {
  return assertCleanupWorktreeTarget(manifest, state, {
    absentPartial: () => context.strictResume && (
      context.strict
        ? exactIntegratedCleanupPartialResume(manifest, context.strict)
        : closedPrIntegratedPartialResume(manifest, context.closedPrIntegrated, context.baseRef)
    ),
  });
}

function assertCleanupWorktreeForSuperseded(manifest, state, proofInput) {
  return assertCleanupWorktreeTarget(manifest, state, {
    absentPartial: () => exactSupersededCleanupPartialResume(manifest, proofInput),
  });
}

function assertCleanupWorktreeTarget(manifest, state, options = {}) {
  assertSafeBranch(manifest.branch);
  const targetPath = resolve(manifest.worktree_path);
  if (!managedWorktreePathAbsent(targetPath)) {
    return assertRegisteredManagedWorktree(manifest, state);
  }
  if (!options.absentPartial?.()) {
    throw new Error(`Refusing cleanup: ${manifest.task_id} absent worktree target requires an exact cleanup_partial journal with expected branch/head evidence.`);
  }
  const target = assertManagedAbsentWorktreePath(manifest.worktree_path, state);
  const registry = managedWorktreeRegistry(manifest, state);
  if (registry.some((record) => resolve(record.path) === target.target)) {
    throw new Error(`Refusing cleanup: ${manifest.task_id} absent worktree target remains registered and must be repaired before resuming.`);
  }
  return { ...target, absent: true };
}

function managedWorktreePathAbsent(targetPath) {
  try {
    lstatSync(targetPath);
    return false;
  } catch (error) {
    if (error?.code === "ENOENT") return true;
    throw new Error(`Refusing to remove unmanaged worktree path: ${targetPath} (target identity is unavailable).`);
  }
}

function sameAbsentPath(left, right) {
  if (typeof left !== "string" || typeof right !== "string" || !left.trim() || !right.trim()) return false;
  return resolve(left) === resolve(right) && managedWorktreePathAbsent(resolve(left));
}

function assertManagedAbsentWorktreePath(worktreePath, state) {
  if (typeof worktreePath !== "string" || !worktreePath.trim()) {
    throw new Error("Refusing to remove unmanaged worktree path: missing worktree target.");
  }
  const target = resolve(worktreePath);
  const managedRoot = assertManagedWorktreeRoot(state);
  const rel = relative(managedRoot, target);
  if (!rel || rel.startsWith("..") || resolve(managedRoot, rel) !== target) {
    throw new Error(`Refusing to remove unmanaged worktree path: ${worktreePath}`);
  }
  let inspected = managedRoot;
  for (const segment of rel.split(sep)) {
    inspected = join(inspected, segment);
    try {
      const stat = lstatSync(inspected);
      if (stat.isSymbolicLink()) {
        throw new Error(`Refusing to remove unmanaged worktree path: ${worktreePath} (cleanup target must not traverse a symlink).`);
      }
      const canonical = canonicalExistingPath(inspected);
      if (!canonical || (canonical !== managedRoot && !canonical.startsWith(`${managedRoot}${sep}`))) {
        throw new Error(`Refusing to remove unmanaged worktree path: ${worktreePath}`);
      }
    } catch (error) {
      if (error?.code === "ENOENT") return { target, managedRoot };
      throw error;
    }
  }
  throw new Error(`Refusing cleanup: ${worktreePath} is present and must have registered worktree evidence.`);
}

function exactCleanupPartialJournal(manifest, expectedHead) {
  const expected = exactGitObjectIdOrNull(expectedHead);
  return manifest.status === "cleanup_partial" &&
    typeof manifest.cleanup_started_at === "string" && Boolean(manifest.cleanup_started_at) &&
    manifest.cleanup_branch === manifest.branch &&
    exactGitObjectIdOrNull(manifest.cleanup_expected_head_sha) === expected;
}

function exactMergedCleanupPartialResume(manifest) {
  const expectedHead = exactGitObjectIdOrNull(manifest.pr_delivery_head_sha);
  const targets = manifest.cleanup_target_evidence;
  return exactCleanupPartialJournal(manifest, expectedHead) &&
    targets?.worktree?.required === true &&
    targets.worktree.state === "absent" &&
    targets.worktree.exists === false &&
    targets.worktree.listed === false &&
    resolve(targets.worktree.path || "") === resolve(manifest.worktree_path) &&
    (targets.localBranch?.state === "absent" ||
      (targets.localBranch?.state === "present" && exactGitObjectIdOrNull(targets.localBranch.sha) === expectedHead));
}

function exactIntegratedCleanupPartialResume(manifest, strict) {
  const evidence = manifest.supersession_closeout_evidence;
  return exactCleanupPartialJournal(manifest, manifest.cleanup_expected_head_sha) &&
    evidence?.mode === "exact-tree-closeout/v1" &&
    evidence.baseRef === "origin/dev" &&
    evidence.supersessionProvenance === strict.provenance &&
    evidence.closeoutReason === strict.closeoutReason &&
    exactGitObjectIdOrNull(evidence.sourceTree) &&
    exactGitObjectIdOrNull(evidence.baseTree);
}

function exactSupersededCleanupPartialResume(manifest, proofInput) {
  return exactCleanupPartialJournal(manifest, proofInput.sourceHead) &&
    sameSupersessionPartialResume(manifest, proofInput) &&
    exactGitObjectIdOrNull(manifest.cleanup_supersession_evidence?.proof?.source?.requestedHead) === proofInput.sourceHead;
}

function managedWorktreeRegistry(manifest, state) {
  const registryCwd = mainWorktreePath();
  const result = git(["worktree", "list", "--porcelain"], { cwd: registryCwd });
  if (result.code !== 0) {
    throw new Error(`Refusing cleanup: managed worktree registration evidence is unavailable for ${manifest.task_id}.`);
  }
  return parseWorktreePorcelain(result.stdout);
}

function worktreeListed(worktreePath, cwd = repoRoot) {
  const result = git(["worktree", "list", "--porcelain"], { cwd });
  if (result.code !== 0) {
    return true;
  }
  return parseWorktreePorcelain(result.stdout).some((record) => samePath(record.path, worktreePath));
}

function prunableGitWorktrees(cwd = repoRoot) {
  const result = git(["worktree", "list", "--porcelain"], { cwd });
  if (result.code !== 0) {
    return [];
  }
  return parseWorktreePorcelain(result.stdout)
    .filter((record) => record.prunable)
    .map((record) => record.path);
}

function parseWorktreePorcelain(value) {
  const records = [];
  let current = null;
  for (const line of String(value || "").split(/\r?\n/)) {
    if (!line.trim()) {
      if (current) {
        records.push(current);
      }
      current = null;
      continue;
    }
    const [key, ...rest] = line.split(" ");
    const data = rest.join(" ");
    if (key === "worktree") {
      current = { path: data };
    } else if (current && key === "HEAD") {
      current.head = data;
    } else if (current && key === "branch") {
      current.branch = data;
    } else if (current && key === "prunable") {
      current.prunable = true;
    }
  }
  if (current) {
    records.push(current);
  }
  return records;
}

function mainWorktreePath() {
  const result = git(["worktree", "list", "--porcelain"], { cwd: repoRoot });
  if (result.code !== 0) {
    return repoRoot;
  }
  const first = parseWorktreePorcelain(result.stdout)[0];
  return first?.path || repoRoot;
}

function assertWorktreeExists(manifest) {
  if (!existsSync(manifest.worktree_path) || !statSync(manifest.worktree_path).isDirectory()) {
    throw new Error(`Worktree path is missing: ${manifest.worktree_path}`);
  }
}

function assertCleanManagedResolutionWorktree(manifest) {
  const status = parseStatus(manifest.worktree_path);
  if (status.any) {
    throw new Error("Managed review-thread adjudication and resolution require a clean worktree.");
  }
}

function prView(manifest, repository = null) {
  const selector = manifest.pr_number ? String(manifest.pr_number) : manifest.branch;
  const args = ["pr", "view", selector, "--json", "number,url,mergedAt,state,baseRefName,headRefName,headRefOid"];
  if (repository?.owner && repository?.name) args.push("--repo", `${repository.owner}/${repository.name}`);
  const result = run("gh", args, {
    cwd: manifest.worktree_path && existsSync(manifest.worktree_path) ? manifest.worktree_path : repoRoot,
  });
  if (result.code !== 0) {
    return null;
  }
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error(`GitHub CLI returned invalid JSON for PR selector ${selector}.`);
  }
}

function prViewForGates(manifest) {
  const selector = manifest.pr_number ? String(manifest.pr_number) : manifest.branch;
  const result = run("gh", [
    "pr",
    "view",
    selector,
    "--json",
    "number,url,mergedAt,state,baseRefName,headRefName,headRefOid,changedFiles,mergeStateStatus,isDraft,statusCheckRollup,reviewDecision",
  ], {
    cwd: manifest.worktree_path && existsSync(manifest.worktree_path) ? manifest.worktree_path : repoRoot,
  });
  if (result.code !== 0) {
    return null;
  }
  const pr = parseGhJson(result.stdout, `PR selector ${selector}`);
  const prNumber = positiveSafePrNumberOrNull(pr?.number);
  if (!prNumber) {
    return { ...pr, baseRefOid: null, baseRefOidSource: "gh-api-graphql", baseRefOidError: "PR gate view did not return an exact positive PR number for base lookup" };
  }
  // `gh pr view` does not expose baseRefOid in all supported CLI versions.
  // Resolve the immutable base commit through the narrow GraphQL field instead
  // of treating a branch-name snapshot as exact base evidence.
  const baseProof = carryForwardPrBaseRefOidFromGraphql(prNumber, manifest.worktree_path && existsSync(manifest.worktree_path) ? manifest.worktree_path : repoRoot);
  return { ...pr, baseRefOid: baseProof.baseRefOid, baseRefOidSource: baseProof.source, baseRefOidError: baseProof.error };
}

function prNumberFromUrl(url) {
  const match = String(url || "").match(/\/pull\/(\d+)/);
  return match ? Number(match[1]) : null;
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "") || "task";
}

function titleFromDescription(value) {
  const trimmed = String(value).trim();
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function dateStamp() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, "");
}

function printManifestSummary(manifest) {
  console.log(`Task: ${manifest.task_id}`);
  console.log(`Owner: ${manifest.owner || "unowned"}`);
  console.log(`Branch: ${manifest.branch}`);
  console.log(`Base branch: ${manifest.base_branch}`);
  console.log(`Base ref: ${manifest.base_ref}`);
  console.log(`Worktree: ${manifest.worktree_path}`);
  console.log(`Manifest: ${join(manifest.state_root, "tasks", `${manifest.task_id}.json`)}`);
}

function printPlan(name, lines) {
  console.log(`DRY RUN: ${name}`);
  for (const line of lines) {
    console.log(`- ${line}`);
  }
}

function printApplied(name, lines) {
  console.log(`APPLY: ${name}`);
  for (const line of lines) {
    console.log(`- ${line}`);
  }
}

function printBlocked(name, lines) {
  console.log(`BLOCKED: ${name}`);
  for (const line of lines) {
    console.log(`- ${line}`);
  }
}

function printClaimBlockers(evaluations, selected) {
  for (const evaluation of evaluations) {
    if (evaluation === selected) {
      continue;
    }
    console.log(
      [
        `- ${evaluation.item.itemId}`,
        evaluation.status,
        `source_status=${evaluation.item.status || "unknown"}`,
        `branch=${evaluation.item.branchName || "none"}`,
        `reason_code=${reasonCodeForClassification(evaluation)}`,
        `reason=${evaluation.reason}`,
        `next=${evaluation.nextAction}`,
      ].join(" | "),
    );
  }
}

function collectCommand(findings, commandName, commandArguments, options = {}) {
  const result = run(commandName, commandArguments, { cwd: repoRoot });
  addFinding(
    findings,
    result.code === 0,
    result.code === 0 ? `${commandName}: ${result.stdout.split(/\r?\n/)[0]}` : `${commandName} unavailable.`,
    `${commandName} unavailable.`,
    options.optional,
  );
}

function addFinding(findings, ok, okMessage, failMessage = okMessage, optional = false) {
  findings.push({ ok, optional, message: ok ? okMessage : failMessage });
}

function git(commandArguments, options = {}) {
  return run("git", commandArguments, options);
}

function runChecked(commandName, commandArguments, options = {}) {
  const result = run(commandName, commandArguments, options);
  if (result.code !== 0) {
    throw new Error(result.stderr || result.stdout || `${commandName} failed`);
  }
  return result;
}

function runShellChecked(commandText, options = {}) {
  const result = spawnSync(commandText, {
    cwd: options.cwd || repoRoot,
    encoding: "utf8",
    shell: true,
    stdio: "pipe",
  });
  if ((result.status ?? 1) !== 0) {
    throw new Error((result.stderr || result.stdout || commandText).trim());
  }
  return {
    code: result.status ?? 1,
    stdout: options.preserveStdout ? (result.stdout || "") : (result.stdout || "").trim(),
    stderr: (result.stderr || "").trim(),
  };
}

function run(commandName, commandArguments, options = {}) {
  const resolved = resolveWorkspaceCommand(commandName, commandArguments);
  const spawnOptions = {
    cwd: options.cwd || repoRoot,
    encoding: "utf8",
    env: resolved.env ?? process.env,
    stdio: "pipe",
    timeout: options.timeout || defaultVerificationTimeoutMs,
  };
  // Bounded verification must own an entire process group. `spawnSync` kills
  // only its direct child on timeout; pnpm can otherwise leave test fixtures
  // behind after the lease is released.
  if (process.platform !== "win32") spawnOptions.detached = true;
  if (options.killSignal) {
    spawnOptions.killSignal = options.killSignal;
  }
  if (Number.isSafeInteger(options.maxBuffer) && options.maxBuffer > 0) {
    spawnOptions.maxBuffer = options.maxBuffer;
  }
  const leaseContext = activeTaskLeaseWriteContext;
  const intent = leaseContext ? taskLeaseExternalIntent(leaseContext, resolved.command, resolved.args) : null;
  let result;
  try {
    result = spawnSync(resolved.command, resolved.args, spawnOptions);
    if (["ETIMEDOUT", "ENOBUFS"].includes(result?.error?.code) && process.platform !== "win32" && Number.isInteger(result.pid) && result.pid > 0) {
      try { process.kill(-result.pid, "SIGKILL"); } catch (error) { if (error?.code !== "ESRCH") throw error; }
    }
  } finally {
    // Completion is intentionally appended even for a launch error.  If this
    // process disappears before here, the immutable intent fences stale
    // takeover until an operator can prove the external command is gone.
    if (intent) completeTaskLeaseExternalIntent(leaseContext, intent, result || { status: 1 });
  }

  return {
    code: result.status ?? 1,
    status: result.status,
    signal: result.signal || null,
    errorCode: result.error?.code || null,
    errorMessage: result.error?.message || "",
    stdout: options.preserveStdout || options.preserveChildOutput ? (result.stdout || "") : (result.stdout || "").trim(),
    stderr: options.preserveChildOutput ? (result.stderr || result.error?.message || "") : (result.stderr || result.error?.message || "").trim(),
  };
}

function samePath(left, right) {
  const leftCanonical = canonicalExistingPath(left);
  const rightCanonical = canonicalExistingPath(right);
  return Boolean(leftCanonical && rightCanonical && leftCanonical === rightCanonical);
}

function canonicalExistingPath(path) {
  if (typeof path !== "string" || !path.trim()) return null;
  try {
    return resolve(realpathSync.native(path));
  } catch {
    return null;
  }
}
