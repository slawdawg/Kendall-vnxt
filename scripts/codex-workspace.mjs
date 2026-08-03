import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
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
const resumableCheckInvocationBudgetMs = 180_000;
const resumableCheckSupervisorLeafTimeoutMs = 150_000;
const resumableCheckSupervisorLeafExecutionReserveMs = 170_000;
const resumableCheckPacketSchemaVersion = 1;
const resumableCheckPacketTtlMs = 30 * 60 * 1000;
const resumableCheckPacketFutureSkewMs = 30_000;
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
const taskLockSchemaVersion = 1;
const cleanupBranchesDefaultBaseRef = "origin/main";
const cleanupIntegratedDefaultBaseRef = "origin/dev";
const strictExactTreeCloseoutTaskId = "20260723-tailnet-authenticated-dashboard-persistence-and";
const rebuildIndexBaseBranch = "main";
const protectedBranches = new Set(branchFoundationProtectedBranches);
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
    case "finish-epic":
      finishEpic(commandArgs);
      break;
    case "verify-pr-gates":
      verifyPrGates(commandArgs);
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
  finish-epic [query]       Plan final epic-batch closeout without delivery mutation.
  verify-pr-gates [query]   Record exact-head checks and review-thread PR gate evidence.
  reconcile-merged-pr <query> Record verified merged-PR metadata before cleanup.
  cleanup-merged [query]    Remove clean worktrees whose PRs are merged.
  cleanup-current           Remove the current clean worktree after its PR is merged.
  cleanup-integrated [query] Remove clean no-PR worktrees already integrated into a base ref.
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

finish-epic options:
  --summary-json            Print a bounded closeout plan without mutation.
  --verification-ref <ref>  Existing final verification evidence reference.
  --review-ref <ref>        Existing final review evidence reference.
  --age-business-days <n>   Elapsed UTC business days; stale batches hold.

verify-pr-gates options:
  --apply                   Record gate evidence in the manifest. Without this, gate check is dry-run.
  --summary-json            Without --apply, print a compact JSON gate packet.
  --delivery-audit-agent <id> Agent or reviewer id for independent delivery audit evidence.
  --delivery-audit-status <status> Delivery audit recommendation. Must be merge-ready for low-risk merge.
  --delivery-audit-summary <text> Metadata-only delivery audit summary for the exact PR head.

reconcile-merged-pr options:
  --apply                   Record verified merged-PR metadata only. Without this, inspect only.
  --summary-json            Without --apply, print a compact reconciliation packet.
  --delivery-audit-agent <id> Agent or reviewer id for an independent cleanup audit.
  --delivery-audit-status <status> Cleanup audit recommendation. Must be cleanup-ready.
  --delivery-audit-summary <text> Metadata-only cleanup audit summary for the exact PR head.
  --delivery-audit-head-sha <sha> Optional exact head override; must match the merged PR head.

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
  --apply                   Apply local-only cleanup after a fresh locked re-proof.
  --approval <text>         Required with --apply; records operator approval evidence.
  --reason <text>           Required with --apply; records the reviewed cleanup reason.
  --summary-json            Without --apply, print a compact metadata-only proof packet.

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
      options[key] = key === "dirtyPaths" ? [...(options[key] || []), inlineValue] : inlineValue;
      continue;
    }

    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      options[key] = true;
      continue;
    }

    options[key] = key === "dirtyPaths" ? [...(options[key] || []), next] : next;
    index += 1;
  }

  return { positional, options };
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
  const target = resolveTakeoverTarget(state, query);
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
    throw new Error(`Takeover blocked for ${packet.target_id}.`);
  }

  const applied = applyTakeover(state, target, {
    currentOwner,
    options,
    staleAfterSeconds,
    preflightLockInspection,
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

function buildMergedPrReconciliationEvidence(manifest, context = {}) {
  const checkedAt = new Date().toISOString();
  const blockers = [];
  const livePr = prView(manifest);
  const { pr, blockers: providerFieldBlockers } = shapeMergedPrReconciliationPr(livePr);
  blockers.push(...providerFieldBlockers);
  let localHeadSha = "";
  let remoteHeadSha = null;
  let remoteInspectionError = null;
  let rawRemoteHeadSha = "";

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
    if (manifest.pr_delivery_head_sha && manifest.pr_delivery_head_sha !== pr.headRefOid) {
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
    "independent cleanup audit recommends cleanup-ready for the exact merged head",
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
    `deliveryAudit status=${packet.deliverySubagentAudit?.status || "unknown"} agent=${packet.deliverySubagentAudit?.agent || "unknown"}`,
    `status ${packet.status || "unknown"}`,
  ];
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
  if (!validMergedPrUrl(pr.url, pr.number)) {
    addReconciliationBlocker(blockers, "Live PR URL is not a valid HTTPS pull-request URL for the reported PR number.");
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

function validMergedPrUrl(value, number) {
  if (!value || !Number.isSafeInteger(number) || number <= 0) {
    return false;
  }
  try {
    const parsed = new URL(value);
    const match = parsed.pathname.match(/\/pull\/(\d+)\/?$/);
    return parsed.protocol === "https:" && Boolean(parsed.hostname) && !parsed.username && !parsed.password && !parsed.search && !parsed.hash && Boolean(match) && Number(match[1]) === number;
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
  const checkedAt = new Date().toISOString();
  const pr = prViewForGates(manifest);
  if (!pr) {
    throw new Error("Could not load PR state for gate evidence.");
  }
  const headState = prGateHeadState(manifest);
  const repository = githubRepository(manifest);
  const reviewThreadState = fetchReviewThreadState(manifest, repository, pr.number);
  const checks = normalizeStatusCheckRollup(pr.statusCheckRollup);
  const deliverySubagentAudit = shapeDeliverySubagentAuditEvidence(manifest, context.options || {}, {
    checkedAt,
    expectedHeadSha: headState.expectedHeadSha,
  });
  const blockers = prGateBlockers(manifest, pr, {
    headState,
    checks,
    reviewThreadState,
    deliverySubagentAudit,
  });
  const requiredGates = [
    "PR open and non-draft",
    "expected base branch",
    "exact PR head matches local delivery head",
    "GitHub merge state clean",
    "all reported checks completed successfully",
    "thread-aware review query returned no unresolved non-outdated threads",
    "delivery subagent audit recommends merge-ready for exact head",
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
    authorityProfile: "standard-delivery",
    taskId: manifest.task_id,
    branch: manifest.branch,
    baseBranch: manifest.base_branch || null,
    expectedHeadSha: headState.expectedHeadSha,
    localHeadSha: headState.localHeadSha,
    pr: {
      number: pr.number || manifest.pr_number || null,
      url: pr.url || manifest.pr_url || null,
      state: pr.state || null,
      isDraft: Boolean(pr.isDraft),
      mergedAt: pr.mergedAt || null,
      baseRefName: pr.baseRefName || null,
      headRefOid: pr.headRefOid || null,
      mergeStateStatus: pr.mergeStateStatus || null,
      reviewDecision: pr.reviewDecision || null,
    },
    checks,
    reviewThreads: reviewThreadState,
    deliverySubagentAudit,
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
  if (!context.headState.localMatchesExpected) {
    blockers.push(`Local HEAD ${context.headState.localHeadSha} does not match recorded delivery head ${context.headState.expectedHeadSha}`);
  }
  if (!pr.mergeStateStatus) {
    blockers.push("PR mergeStateStatus missing");
  } else if (pr.mergeStateStatus !== "CLEAN") {
    blockers.push(`PR mergeStateStatus is ${pr.mergeStateStatus}`);
  }
  if (pr.reviewDecision === "CHANGES_REQUESTED") {
    blockers.push("PR reviewDecision is CHANGES_REQUESTED");
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
  blockers.push(...(context.deliverySubagentAudit?.blockers || []));
  return blockers;
}

function renderPrGateEvidence(packet = {}) {
  return [
    `PR ${packet.pr?.number || "unknown"}`,
    `head ${packet.pr?.headRefOid || "unknown"}`,
    `expected ${packet.expectedHeadSha || "unknown"}`,
    `mergeStateStatus ${packet.pr?.mergeStateStatus || "unknown"}`,
    `checks total=${packet.checks?.total ?? 0} passed=${packet.checks?.passed?.length ?? 0} pending=${packet.checks?.pending?.length ?? 0} failing=${packet.checks?.failing?.length ?? 0}`,
    `reviewThreads unresolvedNonOutdated=${packet.reviewThreads?.unresolvedNonOutdatedCount ?? "unknown"} outdated=${packet.reviewThreads?.outdatedCount ?? "unknown"}`,
    `deliveryAudit status=${packet.deliverySubagentAudit?.status || "unknown"} agent=${packet.deliverySubagentAudit?.agent || "unknown"}`,
    `status ${packet.status || "unknown"}`,
  ];
}

function normalizeStatusCheckRollup(rollup) {
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
  });
  const passed = checks.filter((check) => ["SUCCESS", "SKIPPED", "NEUTRAL"].includes(check.conclusion));
  const pending = checks.filter((check) => !check.conclusion && pendingCheckStatus(check.status));
  const failing = checks.filter((check) => check.conclusion && !["SUCCESS", "SKIPPED", "NEUTRAL"].includes(check.conclusion));
  const unknown = checks.filter((check) => !check.conclusion && !pendingCheckStatus(check.status));
  return {
    total: checks.length,
    passed,
    pending,
    failing: [...failing, ...unknown],
    checks,
  };
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
    "query($owner:String!,$name:String!,$number:Int!){",
    "repository(owner:$owner,name:$name){",
    "pullRequest(number:$number){",
    "reviewThreads(first:100){",
    "nodes{id,isResolved,isOutdated,comments(first:1){nodes{url}}}",
    "pageInfo{hasNextPage,endCursor}",
    "}",
    "}",
    "}",
    "}",
  ].join("");
  const result = runChecked(
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
    { cwd: manifest.worktree_path },
  );
  const parsed = parseGhJson(result.stdout, "review-thread state");
  const errors = Array.isArray(parsed?.errors) ? parsed.errors : [];
  const connection = parsed?.data?.repository?.pullRequest?.reviewThreads;
  const nodes = Array.isArray(connection?.nodes) ? connection.nodes : [];
  const threadRefs = nodes.map((thread) => ({
    id: thread.id || null,
    isResolved: Boolean(thread.isResolved),
    isOutdated: Boolean(thread.isOutdated),
    url: thread.comments?.nodes?.[0]?.url || null,
  }));
  const unresolvedNonOutdated = threadRefs.filter((thread) => !thread.isResolved && !thread.isOutdated);
  return {
    querySucceeded: Boolean(connection),
    errorCount: errors.length,
    errorMessages: errors.map((error) => String(error?.message || "GraphQL error")).filter(Boolean).slice(0, 5),
    totalCount: threadRefs.length,
    unresolvedNonOutdatedCount: unresolvedNonOutdated.length,
    outdatedCount: threadRefs.filter((thread) => thread.isOutdated).length,
    resolvedCount: threadRefs.filter((thread) => thread.isResolved).length,
    hasNextPage: Boolean(connection?.pageInfo?.hasNextPage),
    unresolvedNonOutdatedRefs: unresolvedNonOutdated.map((thread) => thread.url || thread.id).filter(Boolean),
    threadRefs,
  };
}

function parseGhJson(stdout, label) {
  try {
    return JSON.parse(stdout);
  } catch {
    throw new Error(`GitHub CLI returned invalid JSON for ${label}.`);
  }
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
  if (!refExists(baseRef)) {
    throw new Error(`Base ref not found locally: ${baseRef}`);
  }

  const records = query ? [exactTreeCloseout ? findCleanupManifestByExactTaskId(state, query) : findCleanupManifest(state, query)] : readCleanupManifests(state);
  const currentOwner = currentLaneOwner(options);
  const results = records.map((record) => cleanupIntegratedPlan(record, state, { baseRef, currentOwner, options, exactTreeCloseout }));

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

function cleanupIntegratedPlan(record, state, context) {
  const { manifest } = record;
  const strict = context.exactTreeCloseout;
  const strictResume = strict && strictPartialCloseoutMatches(manifest, strict, context.baseRef);
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
    proof: strict ? { tree: { status: "unverified", source: null, base: null }, originDev: { status: "unverified" }, remoteBranch: { status: "unverified", state: null }, githubNoPr: { status: "unverified" }, assignmentCloseout: { status: "unverified" }, evidence: { status: "unverified" } } : null,
  };

  if (manifest.status === "closed") {
    return { ...base, reason: "workspace manifest is already closed" };
  }
  if (manifest.mode === "epic-batch") {
    return { ...base, reason: "epic-batch workspace requires finish-epic closeout; integrated cleanup is disabled" };
  }
  if (strict ? supersededSourceHasPrEvidence(manifest) || (hasStrictCloseoutEvidence(manifest) && !strictResume) : manifest.pr_url || manifest.pr_number || ["pr_open", "merged", "cleanup_partial"].includes(String(manifest.status || ""))) {
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
  const cleanupTarget = assertCleanupWorktreeForIntegrated(manifest, state, { strict, strictResume });
  const cleanupCwd = cleanupRepositoryRoot(manifest.worktree_path, state, cleanupTarget);
  const worktreeStatus = worktreeCleanupStatus(manifest, cleanupCwd);
  const strictRegistration = strict ? strictWorktreeRegistration(manifest, cleanupCwd) : null;
  if (strict && strictRegistration.status !== "matched") {
    return { ...base, cleanupCwd, worktree: cleanupWorktreeSummary(worktreeStatus), reason: strictRegistration.reason };
  }
  if (strict && !strictResume && (!worktreeStatus.exists || !strictRegistration.listed)) {
    return { ...base, cleanupCwd, worktree: cleanupWorktreeSummary(worktreeStatus), reason: "strict exact-tree closeout requires a present registered worktree" };
  }
  if (!strictResume && !worktreeStatus.exists && !worktreeStatus.listed) {
    return { ...base, cleanupCwd, worktree: cleanupWorktreeSummary(worktreeStatus), reason: "worktree is already absent; inspect manifest before no-PR cleanup" };
  }
  if (worktreeStatus.dirty) {
    return { ...base, cleanupCwd, worktree: cleanupWorktreeSummary(worktreeStatus), reason: "worktree is not clean" };
  }

  const localBranchSha = branchSha(manifest.branch, cleanupCwd);
  if (!localBranchSha && !strictResume) {
    return { ...base, cleanupCwd, worktree: cleanupWorktreeSummary(worktreeStatus), reason: "local branch is absent; inspect manifest before no-PR cleanup" };
  }
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
  const integrated = git(["merge-base", "--is-ancestor", manifest.branch, context.baseRef], { cwd: cleanupCwd });
  if (integrated.code !== 0) {
    return {
      ...base,
      cleanupCwd,
      worktree: cleanupWorktreeSummary(worktreeStatus),
      localBranchSha,
      expectedHeadSha: localBranchSha,
      reason: `branch is not an ancestor of ${context.baseRef}`,
    };
  }

  return {
    ...base,
    status: "ready",
    reason: `clean no-PR workspace already integrated into ${context.baseRef}`,
    cleanupCwd,
    worktree: cleanupWorktreeSummary(worktreeStatus),
    localBranchSha,
    expectedHeadSha: localBranchSha,
    remoteBranchSha: branchSha(`origin/${manifest.branch}`, cleanupCwd) || null,
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
      if (freshPlan.exactTreeCloseout) writeManifest(plan.manifestPath, manifest);
      deleteLocalBranchIfPresent(manifest, freshPlan.cleanupCwd, freshPlan.expectedHeadSha);
      if (freshPlan.exactTreeCloseout) writeManifest(plan.manifestPath, manifest);

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
      appendTaskEvent(manifest, "closed", `cleaned no-PR integrated workspace against ${plan.baseRef}`);
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
  if (supersededSourceHasPrEvidence(manifest)) {
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
    expectedRemoteState: proofInput.repair?.sourceRemote || "present",
    status: supersededSourceHeadMatches({ partialResume, localBranchHead, remoteBranchHead, sourceHead: proofInput.sourceHead, expectedRemoteState: proofInput.repair?.sourceRemote || "present" }) ? "matched" : "mismatch",
  };
  if (base.proof.source.status !== "matched") return { ...base, cleanupCwd, reason: supersededSourceMismatchReason({ partialResume, expectedRemoteState: proofInput.repair?.sourceRemote || "present" }) };

  const sourcePullRequests = sourceBranchPullRequestProof(manifest.branch, cleanupCwd);
  base.proof.sourcePullRequests = sourcePullRequests;
  if (sourcePullRequests.status !== "matched") return { ...base, cleanupCwd, reason: sourcePullRequests.reason };

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
  const sameRecordedInput = manifest.status === "cleanup_partial" && manifest.cleanup_supersession_evidence?.remoteBranchPolicy === expectedRemotePolicy && proof?.source?.requestedHead === proofInput.sourceHead && proof?.carryForward?.prNumber === proofInput.carryForwardPr && proof?.carryForward?.requestedCommit === proofInput.carryForwardCommit && Array.isArray(proof?.scope?.paths) && JSON.stringify(proof.scope.paths) === JSON.stringify(proofInput.scope) && JSON.stringify(recordedRepair) === JSON.stringify(requestedRepair);
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
    remoteBranchPolicy: plan.proof.source.expectedRemoteState === "absent" ? "first-use repair verified source remote absence; no remote mutation" : "remote branches are retained by cleanup-superseded",
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
      : plan.proof.assignment.mode === "legacy-unassigned"
        ? (callback) => withAssignmentsIndexLock(state, callback)
        : (callback) => callback();
    return runWithAssignmentLock(() => {
    const freshPlan = cleanupSupersededPlan({ manifest, path: plan.manifestPath }, state, {
      options: context.options,
      proofInput: context.proofInput,
      currentOwner: currentLaneOwner(context.options),
    });
    if (freshPlan.status !== "ready") throw new Error(`${plan.taskId} supersession proof changed under lock: ${freshPlan.reason}`);
    if (!assignmentId && freshPlan.proof.assignment.mode !== "legacy-unassigned") throw new Error("cleanup-superseded requires a linked assignment unless the locked proof is explicit legacy-unassigned repair.");
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
      manifest.cleanup_remote_branch_policy = freshPlan.proof.source.expectedRemoteState === "absent" ? "absent-first-use-superseded-cleanup" : "retained-superseded-cleanup";
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
        eventMessage: `cleaned superseded no-PR workspace ${manifest.task_id}`,
      }) : null;
      if (assignmentClosure?.closed) {
        manifest.source_assignment_closed_at = assignmentClosure.closedAt;
        appendTaskEvent(manifest, "assignment_closed", assignmentClosure.assignmentId);
      }
      appendTaskEvent(manifest, "cleanup_supersession_applied", freshPlan.proof.source.expectedRemoteState === "absent" ? "local worktree and branch removed; source remote was proven absent and untouched" : "local worktree and branch removed; remote branch retained");
      appendTaskEvent(manifest, "closed", `cleaned superseded no-PR workspace carried by PR #${freshPlan.proof.carryForward.prNumber}`);
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

function writeManifest(path, manifest) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
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
  const result = git(["ls-remote", "--heads", "origin", branch], { cwd });
  if (result.code !== 0) {
    throw new Error(result.stderr || `Could not inspect remote branch: origin/${branch}`);
  }
  if (!result.stdout) {
    return "";
  }
  return result.stdout.split(/\s+/)[0] || "";
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
  if (prior) {
    try {
      validateResumableCheckPacket(prior, { taskId: manifest.task_id, owner: options.owner, head, plan, stagedInputDigest });
    } catch (error) {
      if (!discardRecoverableTerminalCheckPacket(manifest, manifestPath, prior, { taskId: manifest.task_id, owner: options.owner, head, plan, stagedInputDigest }, options)) throw error;
      packet = null;
    }
  }
  if (!packet) {
    packet = createResumableCheckPacket({ taskId: manifest.task_id, owner: options.owner, head, planDigest: plan.digest, stagedInputDigest, nextStage: plan.stages[0] });
    manifest.check_verification_packet = packet;
    writeManifest(manifestPath, manifest);
  }
  const started = Date.now();
  for (let index = packet.stages.length; index < plan.stages.length; index += 1) {
    const stage = plan.stages[index];
    const remainingMs = resumableCheckInvocationBudgetMs - (Date.now() - started);
    const needsSupervisorLeafReserve = resumableCheckSupervisorLeafSet.has(stage);
    if (remainingMs <= 0 || (needsSupervisorLeafReserve && remainingMs < resumableCheckSupervisorLeafExecutionReserveMs)) {
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
  const priorWorkspaceFastExpandedPlan = resumableCheckPriorWorkspaceFastExpandedPlan(expected.plan);
  const candidatePlans = [expected.plan.stages, expected.plan.legacyStages, priorWorkspaceFastExpandedPlan]
    .filter((plan, index, all) => Array.isArray(plan) && plan.length > 0 && all.findIndex((other) => sameStringList(other, plan)) === index);
  const digestMatchedPlans = candidatePlans.filter((plan) => resumableCheckPlanDigest(plan) === packet.plan_digest);
  const obsoleteSupervisorAggregatePlan = resumableCheckObsoleteSupervisorAggregatePlan(expected.plan);
  const obsoletePlanMatches = Array.isArray(obsoleteSupervisorAggregatePlan) && packet.plan_digest === resumableCheckPlanDigest(obsoleteSupervisorAggregatePlan) && history.every((stage, index) => obsoleteSupervisorAggregatePlan[index] === stage);
  if (digestMatchedPlans.length === 0 && !obsoletePlanMatches) invalid("plan digest is not current or a recognized legacy plan");
  const matchingPlans = [...digestMatchedPlans, ...(digestMatchedPlans.length === 0 && obsoletePlanMatches ? [obsoleteSupervisorAggregatePlan] : [])].filter((plan) => history.every((stage, index) => plan[index] === stage));
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
  const result = run(command[0], command.slice(1), { ...options, timeout: timeoutMs, killSignal: "SIGKILL" });
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
    const record = {
      schema_version: 1,
      recorded_at: new Date().toISOString(),
      operation: "finish-pr-verification",
      task_id: context.taskId,
      profile,
      command: command.map((value) => String(value)),
      outcome,
      elapsed_ms: elapsedMs,
      timeout_ms: timeoutMs,
      child: {
        status: Number.isInteger(result?.status) ? result.status : null,
        signal: result?.signal || null,
        error_code: result?.errorCode || null,
        stdout_bytes: Buffer.byteLength(String(result?.stdout || "")),
        stderr_bytes: Buffer.byteLength(String(result?.stderr || "")),
        output: "omitted",
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
  if (lock?.status !== "absent") {
    result.malformed_lock_recovery = malformedLockRecovery;
  }
  if (!lock || (lock.status !== "absent" && malformedLockRecovery.status !== "eligible")) {
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
  if (lock.status !== "malformed_zero_byte") {
    result.status = "blocked";
    result.reason = "dirty in-lane takeover requires proof that no task lock is active or retained";
    return result;
  }
  const expectedLockPath = target.kind === "workspace" && context.state
    ? taskLockPath(context.state, String(target.record.task_id || ""))
    : null;
  if (!expectedLockPath || resolve(lock.lockPath) !== resolve(expectedLockPath) || dirname(resolve(lock.lockPath)) !== resolve(context.state.tasksDir)) {
    result.status = "blocked";
    result.reason = "zero-byte lock recovery requires the exact contained task lock path";
    return result;
  }
  if (!evidence.stale.is_stale || !target.record.owner || target.record.owner === context.currentOwner) {
    result.status = "blocked";
    result.reason = "zero-byte lock recovery requires a stale foreign manifest owner";
    return result;
  }
  if (
    evidence.worktree.registration?.status !== "matched" ||
    evidence.branch.status !== "matched" ||
    evidence.pr.status !== "none" ||
    liveNoPr?.status !== "matched" ||
    !validTakeoverReason(context.approval)
  ) {
    result.status = "blocked";
    result.reason = "zero-byte lock recovery requires matching worktree/branch, no PR, and explicit approval";
    return result;
  }
  result.status = "eligible";
  result.reason = "exact contained zero-byte lock has no recorded live owner or descendant identity";
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

function applyTakeover(state, target, { currentOwner, options, staleAfterSeconds, preflightLockInspection = null }) {
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
  const recovery = preflightLockInspection?.status === "malformed_zero_byte"
    ? recoverApprovedZeroByteDirtyTaskLock(state, target, {
        currentOwner,
        options,
        staleAfterSeconds,
      })
    : null;
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
      },
    );
    if (!packet.allowed) {
      throw new Error(`Takeover blocked for ${packet.target_id}: ${packet.blockers.join("; ")}`);
    }
    if (recovery) {
      packet.dirty_in_lane_evidence.malformed_lock_recovery = recovery;
    }
    finalizeDirtyInLaneTakeover(packet);
    const manifestBeforeTakeover = JSON.stringify(manifest);
    applyManifestTakeover(manifest, packet);
    writeManifest(path, manifest);
    try {
      finalizeDirtyInLaneTakeover(packet);
      writeManifest(path, manifest);
    } catch (error) {
      writeFileSync(path, `${manifestBeforeTakeover}\n`);
      throw error;
    }
    return { path, packet };
  }, { recoverStale: options.allowDirtyInLane !== true });
}

function recoverApprovedZeroByteDirtyTaskLock(state, target, { currentOwner, options, staleAfterSeconds }) {
  if (target.kind !== "workspace" || options.allowDirtyInLane !== true) return null;
  const taskId = String(target.record.task_id || "");
  const path = target.path;
  const manifest = readManifest(path);
  validateManifest(manifest, path);
  const packet = takeoverPacket(
    { kind: "workspace", path, record: manifest },
    {
      state,
      currentOwner,
      generatedAt: new Date(),
      staleAfterSeconds,
      reason: String(options.takeoverReason || "").trim(),
      approval: String(options.approval || "").trim(),
      allowDirtyInLane: true,
      dirtyPaths: options.dirtyPaths === undefined ? [] : options.dirtyPaths,
      preflightLockInspection: inspectTaskLock(state, taskId),
    },
  );
  const eligibility = packet.dirty_in_lane_evidence?.malformed_lock_recovery;
  if (eligibility?.status !== "eligible") return null;
  if (!packet.allowed) {
    throw new Error(`Takeover blocked for ${packet.target_id}: ${packet.blockers.join("; ")}`);
  }
  return archiveApprovedZeroByteTaskLock(state, taskId, eligibility);
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

function applyManifestTakeover(manifest, packet) {
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
  manifest.takeover_decisions.push({ ...packet, decision: "applied", applied_at: now, authority_decision: appliedAuthorityDecision });
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

function inspectTaskLock(state, taskId) {
  const lockPath = taskLockPath(state, taskId);
  if (!existsSync(lockPath)) {
    return { taskId, lockPath, status: "absent", reason: "lock_not_present", metadata: null };
  }
  try {
    const stats = lstatSync(lockPath);
    if (!stats.isFile() || stats.isSymbolicLink()) {
      return { taskId, lockPath, status: "ambiguous", reason: "lock_not_regular_file", metadata: null };
    }
    if (stats.size > 16_384) {
      return { taskId, lockPath, status: "ambiguous", reason: "lock_metadata_too_large", metadata: null };
    }
    if (stats.size === 0) {
      return { taskId, lockPath, status: "malformed_zero_byte", reason: "lock_file_zero_bytes", metadata: null };
    }
    const metadata = JSON.parse(readFileSync(lockPath, "utf8"));
    if (!validTaskLockMetadata(metadata, taskId)) {
      return { taskId, lockPath, status: "ambiguous", reason: "lock_metadata_invalid", metadata: null };
    }
    const observedStart = processStartIdentity(metadata.pid);
    if (observedStart === metadata.process_start_identity) {
      return { taskId, lockPath, status: "active", reason: "owner_process_identity_matches", metadata };
    }
    if (observedStart) {
      return { taskId, lockPath, status: "ambiguous", reason: "pid_start_identity_mismatch", metadata };
    }
    try {
      process.kill(metadata.pid, 0);
      return { taskId, lockPath, status: "ambiguous", reason: "owner_process_identity_unavailable", metadata };
    } catch (error) {
      if (error?.code === "ESRCH") {
        return { taskId, lockPath, status: "stale", reason: "owner_process_not_present", metadata };
      }
      return { taskId, lockPath, status: "ambiguous", reason: "owner_process_probe_denied", metadata };
    }
  } catch {
    return { taskId, lockPath, status: "ambiguous", reason: "lock_metadata_unreadable", metadata: null };
  }
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
    heartbeatAt: metadata?.heartbeat_at || null,
    tokenPresent: Boolean(metadata?.token),
    mutation: "none; read-only lock inspection",
  };
}

function recoverStaleTaskLock(state, taskId) {
  const before = inspectTaskLock(state, taskId);
  if (before.status !== "stale" || !before.metadata?.token) {
    return { recovered: false, inspection: before };
  }
  const reread = inspectTaskLock(state, taskId);
  if (reread.status !== "stale" || reread.metadata?.token !== before.metadata.token) {
    return { recovered: false, inspection: reread };
  }
  const historyDir = join(state.tasksDir, ".lock-history");
  mkdirSync(historyDir, { recursive: true });
  const archivePath = join(historyDir, `${taskId}-${before.metadata.token}.stale-lock`);
  try {
    renameSync(before.lockPath, archivePath);
    return { recovered: true, inspection: before, archivePath };
  } catch {
    return { recovered: false, inspection: inspectTaskLock(state, taskId) };
  }
}

function archiveApprovedZeroByteTaskLock(state, taskId, eligibility) {
  const expectedLockPath = taskLockPath(state, taskId);
  const containedTasksDir = resolve(state.tasksDir);
  if (
    eligibility?.status !== "eligible" ||
    resolve(eligibility.lock_path || "") !== resolve(expectedLockPath) ||
    dirname(resolve(expectedLockPath)) !== containedTasksDir
  ) {
    throw new Error("Zero-byte lock recovery proof is incomplete; mutation refused.");
  }
  const before = inspectTaskLock(state, taskId);
  if (before.status !== "malformed_zero_byte" || resolve(before.lockPath) !== resolve(expectedLockPath)) {
    throw new Error("Zero-byte lock changed before approved recovery; mutation refused.");
  }
  const stats = lstatSync(expectedLockPath);
  if (!stats.isFile() || stats.isSymbolicLink() || stats.size !== 0) {
    throw new Error("Zero-byte lock file changed shape before approved recovery; mutation refused.");
  }
  const reread = inspectTaskLock(state, taskId);
  if (reread.status !== "malformed_zero_byte" || resolve(reread.lockPath) !== resolve(expectedLockPath)) {
    throw new Error("Zero-byte lock changed during approved recovery proof; mutation refused.");
  }
  const historyDir = join(state.tasksDir, ".lock-history");
  mkdirSync(historyDir, { recursive: true });
  const archivePath = join(historyDir, `${taskId}-${randomUUID()}.zero-byte-lock`);
  try {
    renameSync(expectedLockPath, archivePath);
  } catch (error) {
    throw new Error(`Zero-byte lock archival failed without ownership mutation: ${error?.code || "unknown"}.`);
  }
  return {
    status: "recovered",
    classification: "zero_byte",
    lock_path: expectedLockPath,
    archive_name: basename(archivePath),
    recovered_at: new Date().toISOString(),
    owner_process_identity: {
      status: "absent_from_malformed_lock",
      matching_live_process: false,
      matching_descendant_process: false,
    },
    reason: "approved exact-task zero-byte lock archived before dirty in-lane takeover",
  };
}

function withManifestLock(state, taskId, fn, options = {}) {
  mkdirSync(state.tasksDir, { recursive: true });
  const lockPath = taskLockPath(state, taskId);
  const processStart = processStartIdentity(process.pid);
  if (!processStart) {
    throw new Error("Task lock ownership cannot be established because the current process start identity is unavailable.");
  }
  const metadata = {
    schema_version: taskLockSchemaVersion,
    task_id: taskId,
    owner: String(options.owner || currentLaneOwner(options)),
    pid: process.pid,
    process_start_identity: processStart,
    acquired_at: new Date().toISOString(),
    heartbeat_at: new Date().toISOString(),
    token: randomUUID(),
  };
  let fd;
  try {
    fd = openSync(lockPath, "wx");
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    if (options.recoverStale === false) {
      const inspected = redactTaskLockInspection(inspectTaskLock(state, taskId));
      throw new Error(`Task lock is retained during dirty in-lane takeover: task_id=${taskId}; status=${inspected.status}; reason=${inspected.reason}; mutation=none.`);
    }
    const recovery = recoverStaleTaskLock(state, taskId);
    if (!recovery.recovered) {
      const inspected = redactTaskLockInspection(recovery.inspection);
      throw new Error(`Task lock cannot be recovered: task_id=${taskId}; status=${inspected.status}; reason=${inspected.reason}; mutation=none.`);
    }
    try {
      fd = openSync(lockPath, "wx");
    } catch (retryError) {
      throw new Error(`Task lock could not be acquired after exact-task stale recovery: ${retryError?.code || "unknown"}.`);
    }
  }

  try {
    writeFileSync(fd, `${JSON.stringify(metadata)}\n`);
  } catch (error) {
    closeSync(fd);
    rmSync(lockPath, { force: true });
    throw error;
  }

  const heartbeat = () => {
    const current = inspectTaskLock(state, taskId);
    if (current.status !== "active" || current.metadata?.token !== metadata.token) {
      throw new Error("Task lock ownership changed before heartbeat; refusing to continue.");
    }
    metadata.heartbeat_at = new Date().toISOString();
    writeFileSync(lockPath, `${JSON.stringify(metadata)}\n`);
  };

  try {
    return fn({ token: metadata.token, heartbeat });
  } finally {
    closeSync(fd);
    const current = inspectTaskLock(state, taskId);
    if (current.metadata?.token === metadata.token) {
      rmSync(lockPath, { force: true });
    }
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
    absentPartial: () => context.strictResume && exactIntegratedCleanupPartialResume(manifest, context.strict),
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

function prView(manifest) {
  const selector = manifest.pr_number ? String(manifest.pr_number) : manifest.branch;
  const result = run("gh", ["pr", "view", selector, "--json", "number,url,mergedAt,state,baseRefName,headRefName,headRefOid"], {
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
    "number,url,mergedAt,state,baseRefName,headRefOid,mergeStateStatus,isDraft,statusCheckRollup,reviewDecision",
  ], {
    cwd: manifest.worktree_path && existsSync(manifest.worktree_path) ? manifest.worktree_path : repoRoot,
  });
  if (result.code !== 0) {
    return null;
  }
  return parseGhJson(result.stdout, `PR selector ${selector}`);
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
  if (options.killSignal) {
    spawnOptions.killSignal = options.killSignal;
  }
  const result = spawnSync(resolved.command, resolved.args, spawnOptions);

  return {
    code: result.status ?? 1,
    status: result.status,
    signal: result.signal || null,
    errorCode: result.error?.code || null,
    errorMessage: result.error?.message || "",
    stdout: options.preserveStdout ? (result.stdout || "") : (result.stdout || "").trim(),
    stderr: (result.stderr || result.error?.message || "").trim(),
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
