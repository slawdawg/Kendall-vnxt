import { spawnSync } from "node:child_process";

export const requiredBranchLanes = Object.freeze([
  Object.freeze({ branch: "dev", role: "development" }),
  Object.freeze({ branch: "staging", role: "release_candidate" }),
  Object.freeze({ branch: "main", role: "human_gate" }),
  Object.freeze({ branch: "prod", role: "production" }),
]);

export const protectedBranches = Object.freeze(["main", "master", "prod"]);
export const setupBranchNames = Object.freeze(["dev", "staging", "prod"]);

const protectedBranchSet = new Set(protectedBranches);
const setupBranchSet = new Set(setupBranchNames);
const knownDirtyStates = new Set(["clean", "dirty", "unknown"]);
const safeRefPattern = /^[A-Za-z0-9._/-]+$/;

export function isProtectedBranch(branchName) {
  return protectedBranchSet.has(metadataString(branchName) || "");
}

export function buildBranchFoundationReport(evidence = {}, options = {}) {
  evidence = objectOrEmpty(evidence);
  options = objectOrEmpty(options);

  const expectedBase = safeRefName(evidence.expectedBase) || "main";
  const localBranchesProvided = evidence.localBranches && typeof evidence.localBranches === "object";
  const remoteBranchesProvided = evidence.remoteBranches && typeof evidence.remoteBranches === "object";
  const requiredBranches = requiredBranchLanes.map(({ branch, role }) => {
    const local = branchRecord(evidence.localBranches, branch);
    const remote = branchRecord(evidence.remoteBranches, branch);
    const localExists = localBranchesProvided ? local.exists : "unknown";
    const remoteExists = remoteBranchesProvided ? remote.exists : "unknown";
    return omitUndefined({
      branch,
      role,
      localExists,
      remoteExists,
      expectedBase,
      currentHeadSha: localExists === true ? local.sha : undefined,
      remoteHeadSha: remoteExists === "unknown" ? undefined : remote.sha,
    });
  });

  return {
    generatedAt: safeMetadataString(options.generatedAt) || new Date().toISOString(),
    repoRoot: safeMetadataString(evidence.repoRoot) || "",
    currentBranch: safeMetadataString(evidence.currentBranch),
    upstream: safeMetadataString(evidence.upstream),
    aheadBehind: aheadBehind(evidence.aheadBehind),
    dirtyState: dirtyState(evidence.dirtyState),
    defaultTaskTarget: safeMetadataString(evidence.defaultTaskTarget) || "dev",
    requiredBranches,
    protectedBranchWarnings: protectedBranchWarnings(evidence),
    plannedMutations: plannedMutations(requiredBranches),
    authorityState: authorityState(options.authorityState),
  };
}

export function loadBranchFoundationGitEvidence(options = {}, context = {}) {
  options = objectOrEmpty(options);
  context = objectOrEmpty(context);

  const cwd = context.cwd || process.cwd();
  const env = gitInspectionEnv(context.env || process.env);
  const repoRootResult = git(["rev-parse", "--show-toplevel"], { cwd, env });
  if (repoRootResult.code !== 0 || !repoRootResult.stdout) {
    return {
      repoRoot: "",
      currentBranch: null,
      upstream: null,
      aheadBehind: null,
      dirtyState: "unknown",
      defaultTaskTarget: options.defaultTaskTarget || "dev",
      expectedBase: options.expectedBase || "main",
    };
  }

  const repoRoot = repoRootResult.stdout;
  const statusResult = git(["-c", "status.refreshIndex=false", "status", "--porcelain=v2", "--branch"], {
    cwd: repoRoot,
    env,
  });
  const status = statusResult.code === 0 ? parseStatusPorcelainV2(statusResult.stdout) : unknownStatus();
  const localBranches = {};
  const remoteBranches = {};

  for (const { branch } of requiredBranchLanes) {
    const localRef = `refs/heads/${branch}`;
    const remoteRef = `refs/remotes/origin/${branch}`;
    const localExists = refExists(localRef, { cwd: repoRoot, env });
    const remoteExists = refExists(remoteRef, { cwd: repoRoot, env });
    localBranches[branch] = omitUndefined({
      exists: localExists,
      sha: localExists === true ? refSha(localRef, { cwd: repoRoot, env }) : undefined,
    });
    remoteBranches[branch] = omitUndefined({
      exists: remoteExists,
      sha: remoteExists === true ? refSha(remoteRef, { cwd: repoRoot, env }) : undefined,
    });
  }

  return {
    repoRoot,
    currentBranch: status.currentBranch,
    upstream: status.upstream,
    aheadBehind: status.aheadBehind,
    dirtyState: status.dirtyState,
    defaultTaskTarget: options.defaultTaskTarget || "dev",
    expectedBase: options.expectedBase || "main",
    localBranches,
    remoteBranches,
  };
}

export function buildBranchFoundationReportFromGit(options = {}, context = {}) {
  return buildBranchFoundationReport(loadBranchFoundationGitEvidence(options, context), options);
}

export function buildBranchFoundationReadinessEvidence(report = {}, options = {}) {
  report = objectOrEmpty(report);
  options = objectOrEmpty(options);

  const branchLanes = (Array.isArray(report.requiredBranches) ? report.requiredBranches : []).map((status) => ({
    branch: safeMetadataString(status?.branch) || "unknown",
    role: safeMetadataString(status?.role) || "unknown",
    localExists: existsValue(status?.localExists),
    remoteExists: existsValue(status?.remoteExists),
  }));
  const protectedBranchWarningEntries = (Array.isArray(report.protectedBranchWarnings)
    ? report.protectedBranchWarnings
    : []
  )
    .map((warning) =>
      omitUndefined({
        branch: safeMetadataString(warning?.branch),
        severity: safeMetadataString(warning?.severity) || "warning",
        reason: safeMetadataString(warning?.reason) || "unknown",
      }),
    )
    .filter((warning) => warning.branch || warning.reason);

  const plannedNextActions =
    protectedBranchWarningEntries.length > 0
      ? protectedBranchWarningEntries.map((warning) =>
          omitUndefined({
            operation: "resolve_protected_branch_warning",
            branch: warning.branch,
            reason: warning.reason,
            requiresApproval: false,
          }),
        )
      : (Array.isArray(report.plannedMutations) ? report.plannedMutations : [])
          .map((mutation) =>
            omitUndefined({
              operation: safeMetadataString(mutation?.operation),
              branch: safeMetadataString(mutation?.branch),
              fromRef: safeMetadataString(mutation?.fromRef),
              requiresApproval: mutation?.requiresApproval === true,
              authorityFamily: safeMetadataString(mutation?.authorityFamily),
              protectedBranch: mutation?.protectedBranch === true,
            }),
          )
          .filter((mutation) => mutation.operation);

  return {
    generatedAt: safeMetadataString(options.generatedAt) || new Date().toISOString(),
    status: branchFoundationReadinessStatus(branchLanes, protectedBranchWarningEntries),
    currentBranch: safeMetadataString(report.currentBranch),
    dirtyState: dirtyState(report.dirtyState),
    defaultTaskTarget: safeMetadataString(report.defaultTaskTarget) || "dev",
    branchLanes,
    protectedBranchWarnings: protectedBranchWarningEntries,
    plannedNextActions,
    frCoverage: sliceAFunctionalRequirementEvidence(),
  };
}

export function formatBranchFoundationReadinessEvidence(evidence = {}) {
  evidence = objectOrEmpty(evidence);
  const branchLanes = Array.isArray(evidence.branchLanes) ? evidence.branchLanes : [];
  const warnings = Array.isArray(evidence.protectedBranchWarnings) ? evidence.protectedBranchWarnings : [];
  const actions = Array.isArray(evidence.plannedNextActions) ? evidence.plannedNextActions : [];
  const frCoverage = Array.isArray(evidence.frCoverage) ? evidence.frCoverage : [];

  const lines = [
    "Branch Foundation Slice A Readiness",
    `Generated: ${safeMetadataString(evidence.generatedAt) || "unknown"}`,
    `Readiness status: ${safeMetadataString(evidence.status) || "unknown"}`,
    `Current branch: ${safeMetadataString(evidence.currentBranch) || "unknown"}`,
    `Dirty state: ${dirtyState(evidence.dirtyState)}`,
    `Default task target: ${safeMetadataString(evidence.defaultTaskTarget) || "unknown"}`,
    "",
    "Branch lanes:",
  ];

  if (branchLanes.length === 0) {
    lines.push("- none");
  } else {
    for (const lane of branchLanes) {
      lines.push(
        `- ${safeMetadataString(lane.branch) || "unknown"} (${safeMetadataString(lane.role) || "unknown"}): ` +
          `local=${formatExists(lane.localExists)} remote=${formatExists(lane.remoteExists)}`,
      );
    }
  }

  lines.push("", "Protected branch warnings:");
  if (warnings.length === 0) {
    lines.push("- none");
  } else {
    for (const warning of warnings) {
      lines.push(
        `- ${safeMetadataString(warning.severity) || "warning"} ` +
          `${safeMetadataString(warning.branch) || "unknown"}: ${safeMetadataString(warning.reason) || "unknown"}`,
      );
    }
  }

  lines.push("", "Planned next actions:");
  if (actions.length === 0) {
    lines.push("- none");
  } else {
    for (const action of actions) {
      lines.push(
        `- ${safeMetadataString(action.operation) || "unknown"} ${safeMetadataString(action.branch) || "unknown"} ` +
          `(approval required: ${action.requiresApproval === true ? "yes" : "no"})`,
      );
    }
  }

  lines.push("", "FR coverage:");
  for (const entry of frCoverage) {
    const storyCount = Array.isArray(entry.storyEvidence) ? entry.storyEvidence.length : 0;
    const implementationCount = Array.isArray(entry.implementationEvidence) ? entry.implementationEvidence.length : 0;
    const verificationCount = Array.isArray(entry.verificationEvidence) ? entry.verificationEvidence.length : 0;
    lines.push(
      `- ${safeMetadataString(entry.id) || "unknown"}: ${storyCount} story refs, ${implementationCount} implementation refs, ` +
        `${verificationCount} verification refs`,
    );
  }

  return lines.join("\n");
}

export function runBranchFoundationApplyLocal(options = {}, context = {}) {
  options = objectOrEmpty(options);
  context = objectOrEmpty(context);

  const approval = approvalEvidence(options.approval);
  const report = buildBranchFoundationReportFromGit({ authorityState: "local_apply_requested" }, context);
  if (!approval.present) {
    return mutationResult(1, report, "local_apply_requested", [
      refusedAction("apply-local", "approval_required", "apply-local requires --approval before creating branches"),
    ]);
  }

  const cwd = report.repoRoot || context.cwd || process.cwd();
  const env = gitInspectionEnv(context.env || process.env);
  const actions = preflightApplyLocal(report, { cwd, env });

  if (report.protectedBranchWarnings?.length > 0) {
    return mutationResult(1, report, "local_apply_requested", [
      ...protectedWarningActions(report.protectedBranchWarnings),
      ...actions,
    ]);
  }
  if (actions.some((action) => action.status === "refused")) {
    return mutationResult(1, report, "local_apply_requested", actions);
  }

  for (const [index, action] of actions.entries()) {
    if (action.status !== "pending") {
      continue;
    }
    const command = ["branch", action.branch, action.fromRef];
    if (!validateBranchFoundationMutationCommand("create_local_branch", command)) {
      return mutationResult(1, report, "local_apply_requested", [
        refusedAction("create_local_branch", "disallowed_git_command", action.branch, action.branch),
      ]);
    }

    const result = git(command, { cwd, env });
    if (result.code !== 0) {
      action.status = "refused";
      action.reason = "git_branch_failed";
      action.detail = safeMetadataString(result.stderr) || "git branch failed";
      markLaterPendingActionsNotRun(actions, index);
      return mutationResult(1, report, "local_apply_requested", actions);
    }
    action.status = "created";
    action.headSha = refSha(`refs/heads/${action.branch}`, { cwd, env });
  }

  return mutationResult(0, report, "local_apply_requested", actions);
}

export function runBranchFoundationPushRemote(options = {}, context = {}) {
  options = objectOrEmpty(options);
  context = objectOrEmpty(context);

  const approval = approvalEvidence(options.approval);
  const report = buildBranchFoundationReportFromGit({ authorityState: "remote_apply_requested" }, context);
  if (!approval.present) {
    return mutationResult(1, report, "remote_apply_requested", [
      refusedAction("push-remote", "approval_required", "push-remote requires --approval before pushing branches"),
    ]);
  }

  const cwd = report.repoRoot || context.cwd || process.cwd();
  const env = gitInspectionEnv(context.env || process.env);
  const actions = preflightPushRemote(report, { cwd, env });

  if (report.protectedBranchWarnings?.length > 0) {
    return mutationResult(1, report, "remote_apply_requested", [
      ...protectedWarningActions(report.protectedBranchWarnings),
      ...actions,
    ]);
  }
  if (actions.some((action) => action.status === "refused")) {
    return mutationResult(1, report, "remote_apply_requested", actions);
  }

  for (const [index, action] of actions.entries()) {
    if (action.status !== "pending") {
      continue;
    }
    const command = ["push", "-u", "origin", action.refspec];
    if (!validateBranchFoundationMutationCommand("push_remote_branch", command)) {
      return mutationResult(1, report, "remote_apply_requested", [
        refusedAction("push_remote_branch", "disallowed_git_command", action.branch, action.branch),
      ]);
    }

    const result = git(command, { cwd, env });
    if (result.code !== 0) {
      action.status = "refused";
      action.reason = "git_push_failed";
      action.detail = safeMetadataString(result.stderr) || "git push failed";
      markLaterPendingActionsNotRun(actions, index);
      return mutationResult(1, report, "remote_apply_requested", actions);
    }
    action.status = "pushed";
  }

  return mutationResult(0, report, "remote_apply_requested", actions);
}

export function validateBranchFoundationMutationCommand(operation, commandArguments) {
  if (!Array.isArray(commandArguments)) {
    return false;
  }
  if (operation === "create_local_branch") {
    const [command, branch, startPoint, ...rest] = commandArguments;
    return (
      command === "branch" &&
      rest.length === 0 &&
      setupBranchSet.has(branch) &&
      typeof startPoint === "string" &&
      startPoint.length > 0 &&
      !commandArguments.some((arg, index) => index > 0 && String(arg).startsWith("-"))
    );
  }
  if (operation === "push_remote_branch") {
    const [command, upstreamFlag, remote, refspec, ...rest] = commandArguments;
    if (command !== "push" || upstreamFlag !== "-u" || remote !== "origin" || rest.length > 0) {
      return false;
    }
    if (typeof refspec !== "string" || refspec.startsWith("+") || refspec.includes("*")) {
      return false;
    }
    const match = refspec.match(/^refs\/heads\/([^:]+):refs\/heads\/([^:]+)$/);
    return Boolean(match && match[1] === match[2] && setupBranchSet.has(match[1]));
  }
  return false;
}

export function formatBranchFoundationReport(report = {}) {
  report = objectOrEmpty(report);

  const lines = [
    "Branch Foundation Report",
    `Generated: ${safeMetadataString(report.generatedAt) || "unknown"}`,
    `Repo root: ${safeMetadataString(report.repoRoot) || "unknown"}`,
    `Current branch: ${safeMetadataString(report.currentBranch) || "unknown"}`,
    `Upstream: ${safeMetadataString(report.upstream) || "unknown"}`,
    `Dirty state: ${dirtyState(report.dirtyState)}`,
    `Default task target: ${safeMetadataString(report.defaultTaskTarget) || "unknown"}`,
    `Authority state: ${authorityState(report.authorityState)}`,
    "",
    "Required branches:",
  ];

  for (const status of Array.isArray(report.requiredBranches) ? report.requiredBranches : []) {
    if (!status || typeof status !== "object") {
      continue;
    }
    const state = laneState(status);
    lines.push(
      `- ${safeMetadataString(status.branch) || "unknown"} (${safeMetadataString(status.role) || "unknown"}, ${state}): ` +
        `local=${formatExists(status.localExists)} remote=${formatExists(status.remoteExists)} ` +
        `base=${safeMetadataString(status.expectedBase) || "unknown"}`,
    );
  }

  lines.push("", "Protected branch warnings:");
  const warnings = Array.isArray(report.protectedBranchWarnings) ? report.protectedBranchWarnings : [];
  if (warnings.length === 0) {
    lines.push("- none");
  } else {
    for (const warning of warnings) {
      if (!warning || typeof warning !== "object") {
        continue;
      }
      lines.push(
        `- ${safeMetadataString(warning.severity) || "warning"} ` +
          `${safeMetadataString(warning.branch) || "unknown"}: ${safeMetadataString(warning.reason) || "unknown"} ` +
          `(${safeMetadataString(warning.evidence) || "metadata unavailable"})`,
      );
    }
  }

  lines.push("", "Planned mutations:");
  const mutations = Array.isArray(report.plannedMutations) ? report.plannedMutations : [];
  if (mutations.length === 0) {
    lines.push("- none");
  } else {
    for (const mutation of mutations) {
      if (!mutation || typeof mutation !== "object") {
        continue;
      }
      lines.push(
        `- ${safeMetadataString(mutation.operation) || "unknown"} ` +
          `${safeMetadataString(mutation.branch) || "unknown"} from ${safeMetadataString(mutation.fromRef) || "unknown"} ` +
          `(approval required: ${mutation.requiresApproval === true ? "yes" : "unknown"})`,
      );
    }
  }

  return lines.join("\n");
}

function branchRecord(branches, branch) {
  if (!branches || typeof branches !== "object") {
    return { exists: false, sha: undefined };
  }

  const record = branches[branch];
  if (record && typeof record === "object") {
    const exists = record.exists === "unknown" ? "unknown" : record.exists === true;
    return {
      exists,
      sha: exists === true ? safeMetadataString(record.sha) : undefined,
    };
  }

  if (record === true) {
    return { exists: true, sha: undefined };
  }

  return { exists: false, sha: undefined };
}

function aheadBehind(value) {
  if (!value || typeof value !== "object") {
    return null;
  }
  if (!Number.isFinite(value.ahead) || !Number.isFinite(value.behind) || value.ahead < 0 || value.behind < 0) {
    return null;
  }
  return {
    ahead: Math.trunc(value.ahead),
    behind: Math.trunc(value.behind),
  };
}

function dirtyState(value) {
  const normalized = metadataString(value);
  return knownDirtyStates.has(normalized) ? normalized : "unknown";
}

function existsValue(value) {
  if (value === true) {
    return true;
  }
  if (value === false) {
    return false;
  }
  return "unknown";
}

function branchFoundationReadinessStatus(branchLanes, warnings) {
  if (
    branchLanes.length === 0 ||
    !requiredBranchLanes.every(({ branch }) => branchLanes.some((lane) => lane.branch === branch))
  ) {
    return "unknown_evidence";
  }
  if (branchLanes.some((lane) => lane.localExists === "unknown" || lane.remoteExists === "unknown")) {
    return "unknown_evidence";
  }
  if (warnings.length > 0) {
    return "warnings_present";
  }
  if (branchLanes.some((lane) => lane.localExists === false)) {
    return "needs_local_setup";
  }
  if (branchLanes.some((lane) => lane.remoteExists === false)) {
    return "needs_remote_setup";
  }
  return "established";
}

function sliceAFunctionalRequirementEvidence() {
  return [
    {
      id: "FR1",
      requirement: "Define branch roles",
      storyEvidence: ["_bmad-output/implementation-artifacts/1-1-define-branch-foundation-policy-and-report-model.md"],
      implementationEvidence: ["scripts/lib/branch-foundation.mjs:requiredBranchLanes"],
      verificationEvidence: ["tests/branch-foundation.test.mjs:defines required branch roles and protected branch policy"],
    },
    {
      id: "FR2",
      requirement: "Default Codex task target is dev",
      storyEvidence: ["_bmad-output/implementation-artifacts/1-4-move-codex-workspace-defaults-toward-dev.md"],
      implementationEvidence: ["scripts/codex-workspace.mjs:defaultBaseBranch"],
      verificationEvidence: ["scripts/test-codex-workspace.mjs:start dry-run defaults new work to dev when branch foundation exists"],
    },
    {
      id: "FR3",
      requirement: "Support promotion path visibility",
      storyEvidence: [
        "_bmad-output/implementation-artifacts/1-1-define-branch-foundation-policy-and-report-model.md",
        "_bmad-output/implementation-artifacts/1-5-produce-slice-a-readiness-evidence.md",
      ],
      implementationEvidence: [
        "scripts/lib/branch-foundation.mjs:requiredBranchLanes",
        "scripts/lib/branch-foundation.mjs:buildBranchFoundationReadinessEvidence",
      ],
      verificationEvidence: [
        "tests/branch-foundation.test.mjs:builds Slice A readiness evidence with FR coverage and metadata-only planned actions",
      ],
    },
    {
      id: "FR12",
      requirement: "Verify or create required branch lanes",
      storyEvidence: [
        "_bmad-output/implementation-artifacts/1-2-add-branch-foundation-cli-report-plan-and-check.md",
        "_bmad-output/implementation-artifacts/1-3-add-explicit-local-and-remote-branch-setup-commands.md",
      ],
      implementationEvidence: [
        "scripts/branch-foundation.mjs:apply-local",
        "scripts/branch-foundation.mjs:push-remote",
      ],
      verificationEvidence: [
        "tests/branch-foundation.test.mjs:apply-local with approval creates only missing local setup branches and skips existing branches",
        "tests/branch-foundation.test.mjs:push-remote with approval pushes only missing setup branch refs",
      ],
    },
    {
      id: "FR13",
      requirement: "Establish dev as the default normal work target",
      storyEvidence: ["_bmad-output/implementation-artifacts/1-4-move-codex-workspace-defaults-toward-dev.md"],
      implementationEvidence: ["scripts/codex-workspace.mjs:defaultBaseBranch"],
      verificationEvidence: ["scripts/test-codex-workspace.mjs:start dry-run defaults new work to dev when branch foundation exists"],
    },
    {
      id: "FR14",
      requirement: "Add protected-branch misuse checks",
      storyEvidence: [
        "_bmad-output/implementation-artifacts/1-1-define-branch-foundation-policy-and-report-model.md",
        "_bmad-output/implementation-artifacts/1-4-move-codex-workspace-defaults-toward-dev.md",
        "_bmad-output/implementation-artifacts/1-5-produce-slice-a-readiness-evidence.md",
      ],
      implementationEvidence: [
        "scripts/lib/branch-foundation.mjs:protectedBranches",
        "scripts/lib/branch-foundation.mjs:protectedBranchWarnings",
      ],
      verificationEvidence: [
        "tests/branch-foundation.test.mjs:reports protected branch misuse warnings",
        "scripts/test-codex-workspace.mjs:start refuses protected branch overrides",
      ],
    },
    {
      id: "FR15",
      requirement: "Produce a branch foundation readiness report",
      storyEvidence: [
        "_bmad-output/implementation-artifacts/1-2-add-branch-foundation-cli-report-plan-and-check.md",
        "_bmad-output/implementation-artifacts/1-5-produce-slice-a-readiness-evidence.md",
      ],
      implementationEvidence: [
        "scripts/lib/branch-foundation.mjs:buildBranchFoundationReadinessEvidence",
        "scripts/check-branch-foundation.mjs:runBranchFoundationChecks",
      ],
      verificationEvidence: [
        "tests/branch-foundation.test.mjs:branch foundation package scripts and check script are wired",
      ],
    },
  ];
}

function authorityState(value) {
  const normalized = metadataString(value);
  if (["report_only", "local_apply_requested", "remote_apply_requested"].includes(normalized)) {
    return normalized;
  }
  return "report_only";
}

function protectedBranchWarnings(evidence) {
  const currentBranch = safeMetadataString(evidence.currentBranch);
  const state = dirtyState(evidence.dirtyState);
  const warnings = [];

  if (currentBranch === "main" && state !== "clean") {
    warnings.push({
      branch: "main",
      severity: "warning",
      reason: state === "unknown" ? "unknown_human_gate_cleanliness" : "dirty_human_gate",
      evidence: `current branch is main and dirtyState is ${state}`,
    });
  }

  if (currentBranch === "master" && state !== "clean") {
    warnings.push({
      branch: "master",
      severity: "warning",
      reason: state === "unknown" ? "unknown_protected_branch_cleanliness" : "dirty_protected_branch",
      evidence: `current branch is master and dirtyState is ${state}`,
    });
  }

  if (currentBranch === "prod") {
    warnings.push({
      branch: "prod",
      severity: "critical",
      reason: "current_branch_is_production",
      evidence: "current branch is prod",
    });
    if (state === "dirty") {
      warnings.push({
        branch: "prod",
        severity: "critical",
        reason: "dirty_production_branch",
        evidence: "current branch is prod and dirtyState is dirty",
      });
    }
  }

  return warnings;
}

function plannedMutations(requiredBranches) {
  const mutations = [];
  for (const status of requiredBranches) {
    const fromRef = status.localExists === false ? localCreationSource(status, requiredBranches) : null;
    if (status.localExists === false) {
      if (fromRef && setupBranchSet.has(status.branch)) {
        mutations.push({
          operation: "create_local_branch",
          branch: status.branch,
          fromRef,
          commandPreview: `git branch ${quoteShellArg(status.branch)} ${quoteShellArg(fromRef)}`,
          requiresApproval: true,
          authorityFamily: mutationAuthorityFamily(status.branch),
          protectedBranch: isProtectedBranch(status.branch),
        });
      }
    }
    if (
      status.remoteExists === false &&
      status.localExists !== "unknown" &&
      (status.localExists === true || fromRef) &&
      status.branch !== "main"
    ) {
      mutations.push({
        operation: "push_remote_branch",
        branch: status.branch,
        fromRef: status.branch,
        commandPreview: `git push -u origin ${quoteShellArg(`refs/heads/${status.branch}:refs/heads/${status.branch}`)}`,
        requiresApproval: true,
        authorityFamily: mutationAuthorityFamily(status.branch),
        protectedBranch: isProtectedBranch(status.branch),
      });
    }
  }
  return mutations;
}

function localCreationSource(status, requiredBranches) {
  if (status.remoteExists === true) {
    return safeRefName(`origin/${status.branch}`);
  }
  if (status.remoteExists === "unknown") {
    return null;
  }
  if (status.branch === "main") {
    return null;
  }
  if (!baseRefExists(status.expectedBase, requiredBranches)) {
    return null;
  }
  return safeRefName(status.expectedBase);
}

function baseRefExists(expectedBase, requiredBranches) {
  const base = safeRefName(expectedBase);
  if (!base) {
    return false;
  }
  const status = requiredBranches.find((branchStatus) => branchStatus.branch === base);
  return status?.localExists === true || status?.remoteExists === true;
}

function mutationAuthorityFamily(branch) {
  return isProtectedBranch(branch) ? "protected_branch_setup" : "branch_foundation_setup";
}

function preflightApplyLocal(report, options) {
  const actions = [];
  for (const status of report.requiredBranches || []) {
    if (!setupBranchSet.has(status.branch)) {
      continue;
    }
    if (!validBranchName(status.branch, options)) {
      actions.push(refusedAction("create_local_branch", "invalid_branch_name", status.branch, status.branch));
      continue;
    }
    if (!localBranchNamespaceAvailable(status.branch, options)) {
      actions.push(refusedAction("create_local_branch", "local_branch_namespace_conflict", status.branch, status.branch));
      continue;
    }
    if (status.localExists === "unknown") {
      actions.push(refusedAction("create_local_branch", "unknown_local_evidence", status.branch, status.branch));
      continue;
    }
    if (status.localExists === true) {
      actions.push({
        operation: "create_local_branch",
        branch: status.branch,
        status: "skipped",
        reason: "local_branch_exists",
        headSha: status.currentHeadSha,
      });
      continue;
    }
    if (status.remoteExists === "unknown") {
      actions.push(refusedAction("create_local_branch", "unknown_remote_evidence", status.branch, status.branch));
      continue;
    }
    const mutation = report.plannedMutations.find(
      (planned) => planned.operation === "create_local_branch" && planned.branch === status.branch,
    );
    if (!mutation?.fromRef) {
      actions.push(refusedAction("create_local_branch", "missing_proven_base_ref", status.branch, status.branch));
      continue;
    }
    actions.push({
      operation: "create_local_branch",
      branch: status.branch,
      status: "pending",
      fromRef: mutation.fromRef,
    });
  }
  return actions;
}

function preflightPushRemote(report, options) {
  const actions = [];
  for (const status of report.requiredBranches || []) {
    if (!setupBranchSet.has(status.branch)) {
      continue;
    }
    if (!validBranchName(status.branch, options)) {
      actions.push(refusedAction("push_remote_branch", "invalid_branch_name", status.branch, status.branch));
      continue;
    }
    if (status.localExists === "unknown") {
      actions.push(refusedAction("push_remote_branch", "unknown_local_evidence", status.branch, status.branch));
      continue;
    }
    if (status.localExists !== true) {
      actions.push(refusedAction("push_remote_branch", "local_branch_missing", status.branch, status.branch));
      continue;
    }
    if (status.remoteExists === "unknown") {
      actions.push(refusedAction("push_remote_branch", "unknown_remote_evidence", status.branch, status.branch));
      continue;
    }
    if (status.remoteExists === true) {
      actions.push({
        operation: "push_remote_branch",
        branch: status.branch,
        status: "skipped",
        reason: "remote_branch_exists",
        headSha: status.remoteHeadSha,
      });
      continue;
    }
    const liveRemote = liveRemoteBranchExists(status.branch, options);
    if (liveRemote === "unknown") {
      actions.push(refusedAction("push_remote_branch", "unknown_live_remote_evidence", status.branch, status.branch));
      continue;
    }
    if (liveRemote === true) {
      actions.push(refusedAction("push_remote_branch", "live_remote_branch_exists", status.branch, status.branch));
      continue;
    }
    actions.push({
      operation: "push_remote_branch",
      branch: status.branch,
      status: "pending",
      refspec: `refs/heads/${status.branch}:refs/heads/${status.branch}`,
    });
  }
  return actions;
}

function protectedWarningActions(warnings) {
  return warnings.map((warning) =>
    refusedAction(
      "protected_branch_warning",
      warning.reason || "protected_branch_warning",
      `protected branch warning blocks mutation: ${warning.reason || "unknown"}`,
      warning.branch,
    ),
  );
}

function markLaterPendingActionsNotRun(actions, failedIndex) {
  for (const action of actions.slice(failedIndex + 1)) {
    if (action.status === "pending") {
      action.status = "not_run";
      action.reason = "prior_failure";
    }
  }
}

function liveRemoteBranchExists(branch, options) {
  const result = git(["ls-remote", "--exit-code", "--heads", "origin", branch], options);
  if (result.code === 0) {
    return true;
  }
  if (result.code === 2) {
    return false;
  }
  return "unknown";
}

function mutationResult(status, report, authorityStateValue, actions) {
  return {
    status,
    authorityState: authorityStateValue,
    approvalPresent: status === 0 || actions.some((action) => action.reason !== "approval_required"),
    report,
    protectedBranchWarnings: report.protectedBranchWarnings || [],
    actions,
  };
}

function refusedAction(operation, reason, detail, branch) {
  return omitUndefined({
    operation,
    branch: setupBranchSet.has(branch) ? branch : undefined,
    status: "refused",
    reason,
    detail: safeMetadataString(detail) || reason,
  });
}

function approvalEvidence(value) {
  return { present: Boolean(metadataString(value)) };
}

function validBranchName(branch, options) {
  return git(["check-ref-format", "--branch", branch], options).code === 0;
}

function localBranchNamespaceAvailable(branch, options) {
  const result = git(["for-each-ref", "--format=%(refname)", `refs/heads/${branch}/`], options);
  return result.code === 0 && !result.stdout;
}

function metadataString(value) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed || null;
}

function safeMetadataString(value) {
  const normalized = metadataString(value);
  if (!normalized || looksSensitive(normalized)) {
    return null;
  }
  return normalized;
}

function safeRefName(value) {
  const normalized = safeMetadataString(value);
  if (!normalized || !safeRefPattern.test(normalized) || normalized.includes("..") || normalized.includes("@{")) {
    return null;
  }
  return normalized;
}

function omitUndefined(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

function formatExists(value) {
  if (value === true) {
    return "yes";
  }
  if (value === false) {
    return "no";
  }
  return "unknown";
}

function objectOrEmpty(value) {
  return value && typeof value === "object" ? value : {};
}

function quoteShellArg(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function looksSensitive(value) {
  return /(:\/\/|authorization|bearer|token|secret|password|credential|github_pat|ghp_|gho_|ghu_|ghs_|ghr_|sk-[a-z0-9])/i.test(
    value,
  );
}

function parseStatusPorcelainV2(stdout) {
  const lines = String(stdout || "").split(/\r?\n/).filter(Boolean);
  let currentBranch = null;
  let upstream = null;
  let aheadBehind = null;
  let dirtyState = "clean";

  for (const line of lines) {
    if (line.startsWith("# branch.head ")) {
      const value = line.slice("# branch.head ".length).trim();
      currentBranch = value && value !== "(detached)" ? value : null;
      continue;
    }
    if (line.startsWith("# branch.upstream ")) {
      upstream = line.slice("# branch.upstream ".length).trim() || null;
      continue;
    }
    if (line.startsWith("# branch.ab ")) {
      const match = line.match(/\+(\d+)\s+-(\d+)/);
      aheadBehind = match ? { ahead: Number(match[1]), behind: Number(match[2]) } : null;
      continue;
    }
    if (!line.startsWith("#")) {
      dirtyState = "dirty";
    }
  }

  return {
    currentBranch,
    upstream,
    aheadBehind,
    dirtyState,
  };
}

function unknownStatus() {
  return {
    currentBranch: null,
    upstream: null,
    aheadBehind: null,
    dirtyState: "unknown",
  };
}

function refExists(ref, options) {
  const result = git(["show-ref", "--verify", "--quiet", ref], options);
  if (result.code === 0) {
    return true;
  }
  if (result.code === 1) {
    return false;
  }
  return "unknown";
}

function refSha(ref, options) {
  const result = git(["rev-parse", ref], options);
  return result.code === 0 ? result.stdout : null;
}

function git(commandArguments, options = {}) {
  const result = spawnSync("git", commandArguments, {
    cwd: options.cwd || process.cwd(),
    encoding: "utf8",
    env: options.env || process.env,
    stdio: "pipe",
  });
  return {
    code: result.status ?? 1,
    stdout: (result.stdout || "").trim(),
    stderr: (result.stderr || result.error?.message || "").trim(),
  };
}

function gitInspectionEnv(env) {
  const cleanEnv = { ...env };
  const blockedKeys = new Set([
    "GIT_DIR",
    "GIT_WORK_TREE",
    "GIT_INDEX_FILE",
    "GIT_OBJECT_DIRECTORY",
    "GIT_ALTERNATE_OBJECT_DIRECTORIES",
    "GIT_COMMON_DIR",
    "GIT_NAMESPACE",
    "GIT_CONFIG",
    "GIT_CONFIG_GLOBAL",
    "GIT_CONFIG_NOSYSTEM",
    "GIT_SSH",
    "GIT_SSH_COMMAND",
    "GIT_ASKPASS",
    "SSH_ASKPASS",
  ]);
  for (const key of Object.keys(cleanEnv)) {
    if (blockedKeys.has(key) || key.startsWith("GIT_CONFIG_")) {
      delete cleanEnv[key];
    }
  }
  return cleanEnv;
}

function laneState(status) {
  if (status.localExists === "unknown" || status.remoteExists === "unknown") {
    return "unknown";
  }
  if (status.localExists === true && status.remoteExists === true) {
    return "present";
  }
  return "missing";
}
