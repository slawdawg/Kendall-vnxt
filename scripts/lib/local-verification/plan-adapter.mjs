import { buildCheckPlan } from "../../check-plan.mjs";
import { LocalVerificationError, sha256 } from "./contracts.mjs";

const GOVERNED_CONTROL = Object.freeze(["pnpm", "run", "check"]);

const COMMAND_SURFACES = new Map([
  ["pnpm run check:docs", ["docs"]],
  ["pnpm run check:github-workflow-policy", ["workflow"]],
  ["pnpm run check:workspace-coordination", ["workflow", "workspace"]],
  ["pnpm run check:manager-control-plane", ["manager"]],
  ["pnpm run test:manager-control-plane:preflight", ["manager"]],
  ["pnpm run test:manager-control-plane:full", ["manager"]],
  ["pnpm run test:manager-control-plane-dispatcher-port", ["managerDispatcherPort"]],
  ["pnpm run check:workspace-fast", ["workspace"]],
  ["pnpm run build:dashboard", ["dashboard"]],
  ["pnpm run test:dashboard-pipeline-fixtures", ["dashboard", "pipeline"]],
  ["pnpm run test:dashboard-memory-proposals", ["dashboard"]],
  ["pnpm run test:pipeline-implementation-readiness", ["pipeline"]],
  ["pnpm run check:dashboard-pipeline-boundary", ["pipeline"]],
  ["pnpm run test:supervisor-runner", ["supervisor"]],
  ["pnpm run test:supervisor:preflight", ["supervisor"]],
  ["pnpm run test:supervisor:profile", ["supervisor"]],
  ["pnpm run test:sandbox-boundary-classifier", ["antiChurn"]],
  ["pnpm run test:anti-churn-event-writer", ["antiChurn"]],
  ["pnpm run test:anti-churn-signature-classifier", ["antiChurn"]],
  ["pnpm run test:check-plan", ["ciAcceleration"]],
  ["pnpm run test:local-verification-contracts", ["localVerification"]],
  ["pnpm run test:local-verification-state-store", ["localVerification"]],
  ["pnpm run test:local-verification-lifecycle", ["localVerification"]],
  ["pnpm run test:static-bundles", ["ciAcceleration"]],
  ["pnpm run check:static", ["package"]],
]);

function inputDigest({ command, kind, sourceIdentity, surfaces = [] }) {
  const scoped = Object.fromEntries([...new Set(surfaces)].sort().map((surface) => [surface, sourceIdentity.surfaceFingerprints?.[surface] || "missing"]));
  return sha256({
    command,
    kind,
    commit: sourceIdentity.commit,
    plannerDigest: sourceIdentity.plannerDigest,
    environmentDigest: sourceIdentity.environmentDigest,
    // Quick-fail recipes inspect repository-wide Git state, so they are never
    // safely reusable across an edit. Focused recipes bind only their mapped
    // classified input surfaces.
    ...(kind === "quick-fail" ? { worktreeFingerprint: sourceIdentity.worktreeFingerprint } : {}),
    scoped,
  });
}

function hasValidPlannerShape(checkPlan, canonicalPlan) {
  if (!checkPlan || !canonicalPlan) return false;
  const normalized = {
    requiresFullStatic: checkPlan.requiresFullStatic,
    reasons: checkPlan.reasons,
    surfaces: checkPlan.surfaces,
    quickFailCommands: checkPlan.quickFailCommands,
    commands: checkPlan.commands,
    jsonParseFiles: checkPlan.jsonParseFiles,
  };
  const canonical = {
    requiresFullStatic: canonicalPlan.requiresFullStatic,
    reasons: canonicalPlan.reasons,
    surfaces: canonicalPlan.surfaces,
    quickFailCommands: canonicalPlan.quickFailCommands,
    commands: canonicalPlan.commands,
    jsonParseFiles: canonicalPlan.jsonParseFiles,
  };
  return JSON.stringify(normalized) === JSON.stringify(canonical);
}

function createNode({ command, commandText, rationale, kind, sourceIdentity, surfaces, dependsOn = [] }) {
  if (!Array.isArray(command) || command.length === 0 || !command.every((part) => typeof part === "string")) {
    throw new LocalVerificationError("unapproved-command", "Planner returned an invalid verification command.", "Use only checked-in approved check-plan command definitions.");
  }
  const node = {
    command: [...command],
    commandText,
    resourceClass: "default",
    dependsOn: [...dependsOn],
    rationale: [rationale],
    inputDigest: `sha256:${inputDigest({ command, kind, sourceIdentity, surfaces })}`,
  };
  return { nodeId: `node_${sha256(node)}`, ...node };
}

export function createLocalVerificationPlan({ changedFiles = [], sourceIdentity, buildPlan = buildCheckPlan, canonicalPlan } = {}) {
  if (!sourceIdentity || typeof sourceIdentity !== "object") {
    throw new LocalVerificationError("missing-source-identity", "Local verification plans require source identity.", "Create the source identity before adapting the check plan.");
  }
  let checkPlan;
  let malformedPlanner = false;
  try {
    checkPlan = buildPlan(changedFiles);
    malformedPlanner = !hasValidPlannerShape(checkPlan, canonicalPlan || buildCheckPlan(changedFiles));
  } catch {
    malformedPlanner = true;
  }
  if (malformedPlanner || checkPlan.requiresFullStatic) {
    const reasons = malformedPlanner
      ? ["planner-malformed"]
      : [...new Set(checkPlan.reasons)];
    const node = createNode({
      command: GOVERNED_CONTROL,
      commandText: "pnpm run check",
      rationale: reasons.join("; ") || "uncertain impact requires the governed control",
      kind: "governed-control",
      sourceIdentity,
      surfaces: ["governed-control"],
    });
    const plan = {
      nodes: [node],
      requiresFullStatic: true,
      surfaces: malformedPlanner ? [] : checkPlan.surfaces,
      reasons,
      jsonParseFiles: [],
      broadening: { mode: "governed-full", reasons, fallback: "pnpm run check" },
      nextAction: "start-governed-control",
    };
    return { planId: `plan_${sha256({ sourceIdentity, ...plan })}`, ...plan };
  }
  const quickFailNodes = checkPlan.quickFailCommands.map((command) => createNode({
    command: command.command,
    commandText: command.commandText,
    rationale: command.reason,
    kind: "quick-fail",
    sourceIdentity,
    surfaces: [],
  }));
  const selectedNodes = checkPlan.commands.map((command) => createNode({
    command: command.command,
    commandText: command.commandText,
    rationale: checkPlan.reasons.join("; ") || "approved affected-check selection",
    kind: "check",
    sourceIdentity,
    surfaces: COMMAND_SURFACES.get(command.commandText) || ["unknown"],
    dependsOn: quickFailNodes.map((node) => node.nodeId),
  }));
  const nodes = [...quickFailNodes, ...selectedNodes];
  const plan = {
    nodes,
    requiresFullStatic: checkPlan.requiresFullStatic,
    surfaces: checkPlan.surfaces,
    reasons: checkPlan.reasons,
    jsonParseFiles: checkPlan.jsonParseFiles,
    broadening: { mode: "focused", reasons: [], fallback: null },
    nextAction: "start",
  };
  return { planId: `plan_${sha256({ sourceIdentity, ...plan })}`, ...plan };
}
