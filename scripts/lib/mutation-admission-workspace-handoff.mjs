import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const LANE_OUTCOMES = new Set(["create_managed_lane", "resume_managed_lane"]);
const NON_LANE_OUTCOMES = new Set(["read_only", "recovery_required", "decision_needed"]);

/**
 * Starts or resumes only a lane already selected by mutation admission.
 *
 * The adapter intentionally has no request classification logic. It accepts a
 * completed admission result, delegates lifecycle state to codex-workspace,
 * and returns bounded CWD evidence for the next worker handoff.
 */
export function handoffAdmittedManagedLane(admission = {}, context = {}) {
  const outcome = boundedText(admission.outcome);
  if (NON_LANE_OUTCOMES.has(outcome)) return notApplicable(admission);
  if (!LANE_OUTCOMES.has(outcome)) return blocked("handoff.admission_outcome_unknown", "Inspect the admission result before any workspace lifecycle command.");

  const expected = laneEvidence(admission.laneEvidence);
  const stateRoot = stateRootFor(expected);
  if (!expected || !stateRoot) {
    return blocked("handoff.lane_evidence_invalid", "Inspect the codex-workspace admission evidence before any workspace lifecycle command.");
  }

  const runner = context.runner || defaultRunner;
  const commandContext = { runner, stateRoot, owner: expected.owner };
  let lifecycleMutation = "none; codex-workspace resume only";
  if (outcome === "create_managed_lane") {
    const description = boundedText(context.description, 512);
    if (!description) {
      return blocked("handoff.start_description_missing", "Provide the bounded lane description used for the approved codex-workspace start request.");
    }
    const startResult = run(commandContext, startArgs(expected, description, context));
    if (!succeeded(startResult)) {
      return blocked(
        "handoff.workspace_start_failed",
        "Inspect codex-workspace start evidence before resuming or retrying lane setup.",
        "codex-workspace start attempted; inspect lifecycle state before retrying",
      );
    }
    lifecycleMutation = "codex-workspace start completed; no source write";
  }

  const resumeResult = run(commandContext, resumeArgs(expected, stateRoot));
  const packet = parsePacket(resumeResult);
  const packetFailure = packetFailureReason(packet, expected);
  if (packetFailure) return blocked(packetFailure.code, packetFailure.nextSafeAction, lifecycleMutation);

  const exists = context.exists || existsSync;
  const worktreePath = resolve(packet.worktreePath);
  if (!exists(worktreePath) || packet.worktreeExists !== true) {
    return blocked("handoff.worktree_missing", "Inspect the managed-lane worktree before any implementation worker is started.", lifecycleMutation);
  }
  const registry = registeredWorktreeRegistry(worktreePath, context);
  if (!registry.ok || !registry.primaryPath) {
    return blocked("handoff.worktree_registry_unavailable", "Inspect Git primary-worktree metadata before any implementation worker is started.", lifecycleMutation);
  }
  const worktreeIdentity = pathIdentity(worktreePath, context);
  const baseIdentity = pathIdentity(registry.primaryPath, context);
  if (!worktreeIdentity || !baseIdentity) {
    return blocked("handoff.path_identity_unavailable", "Inspect the managed worktree and Base Checkout path identity before any implementation worker is started.", lifecycleMutation);
  }
  if (samePathIdentity(worktreeIdentity, baseIdentity)) {
    return blocked("handoff.base_checkout_target", "Start or resume a distinct managed worktree; the Base Checkout is not a write target.", lifecycleMutation);
  }
  const manifest = readManifest(expected.manifestPath, context);
  if (!hasMatchingManifestProvenance(manifest, expected, worktreeIdentity.realPath)) {
    return blocked("handoff.manifest_provenance_invalid", "Inspect the codex-workspace manifest before any implementation worker is started.", lifecycleMutation);
  }
  const expectedBranchRef = `refs/heads/${expected.branch}`;
  if (!registry.entries.some((entry) =>
    entry.detached !== true &&
    entry.branch === expectedBranchRef &&
    samePathIdentity(pathIdentity(entry.path, context), worktreeIdentity)
  )) {
    return blocked("handoff.worktree_unregistered", "Inspect the Git worktree registry; the admitted managed worktree is not registered.", lifecycleMutation);
  }

  const admittedLaneEvidence = Object.freeze({
    taskId: boundedText(packet.taskId),
    branch: boundedText(packet.branch),
    baseBranch: expected.baseBranch,
    baseRef: expected.baseRef,
    worktreePath: worktreeIdentity.realPath,
    manifestPath: resolve(packet.manifestPath),
    owner: boundedText(packet.owner),
  });

  return Object.freeze({
    status: "ready",
    outcome,
    reasonCode: outcome === "create_managed_lane" ? "handoff.managed_lane_created" : "handoff.managed_lane_resumed",
    nextSafeAction: "Launch the implementation worker in the managed worktree CWD.",
    canonicalStage: "route",
    canonicalStatus: "active",
    canonicalOwner: "kendall",
    projection: Object.freeze({ column: "Prepare", attentionKind: null, derived: true }),
    laneEvidence: admittedLaneEvidence,
    workerHandoff: Object.freeze({ cwd: worktreeIdentity.realPath }),
    preWriteGuardEvidence: Object.freeze({
      baseCheckoutPath: baseIdentity.realPath,
      worktreePath: worktreeIdentity.realPath,
      laneEvidence: admittedLaneEvidence,
    }),
    mutation: outcome === "create_managed_lane"
      ? "codex-workspace start only; no source write"
      : "none; codex-workspace resume only",
  });
}

function notApplicable(admission) {
  return Object.freeze({
    status: "not_applicable",
    outcome: boundedText(admission.outcome),
    reasonCode: boundedText(admission.reasonCode),
    nextSafeAction: boundedText(admission.nextSafeAction),
    canonicalStage: boundedText(admission.canonicalStage),
    canonicalStatus: boundedText(admission.canonicalStatus),
    canonicalOwner: boundedText(admission.canonicalOwner),
    projection: Object.freeze({
      column: boundedText(admission.projection?.column),
      attentionKind: boundedText(admission.projection?.attentionKind),
      derived: admission.projection?.derived === true,
    }),
    mutation: "none; no workspace lifecycle command invoked",
  });
}

function startArgs(expected, description, context) {
  const args = [
    "./scripts/codex-workspace.mjs", "start", description,
    "--task-id", expected.taskId,
    "--branch", expected.branch,
    "--worktree", expected.worktreePath,
    "--state-root", stateRootFor(expected),
    "--owner", expected.owner,
  ];
  if (context.noFetch !== false) args.push("--no-fetch");
  args.push("--base", expected.baseBranch);
  return args;
}

function resumeArgs(expected, stateRoot) {
  return [
    "./scripts/codex-workspace.mjs", "resume", expected.taskId, "--json",
    "--state-root", stateRoot, "--owner", expected.owner,
  ];
}

function run(context, args) {
  return context.runner(process.execPath, args, { cwd: repoRoot, encoding: "utf8", stdio: "pipe" }) || {};
}

function defaultRunner(command, args, options) {
  const result = spawnSync(command, args, options);
  return {
    code: result.status ?? 1,
    stdout: String(result.stdout || ""),
    stderr: String(result.stderr || result.error?.message || ""),
  };
}

function succeeded(result) {
  return Number(result?.code) === 0;
}

function parsePacket(result) {
  if (!succeeded(result)) return null;
  try {
    const packet = JSON.parse(String(result.stdout || ""));
    return packet && typeof packet === "object" && !Array.isArray(packet) ? packet : null;
  } catch {
    return null;
  }
}

function packetFailureReason(packet, expected) {
  if (!packet) return { code: "handoff.resume_packet_invalid", nextSafeAction: "Inspect codex-workspace resume evidence before any implementation worker is started." };
  if (packet.owner !== expected.owner || packet.currentOwner !== expected.owner || packet.ownerMatches !== true || packet.ownerWarning !== null) {
    return { code: "handoff.owner_mismatch", nextSafeAction: "Inspect lane ownership and use the existing explicit takeover route if it is authorized." };
  }
  if (packet.status !== "active" || packet.mutation !== "none; resume only") {
    return { code: "handoff.resume_packet_invalid", nextSafeAction: "Inspect codex-workspace resume evidence before any implementation worker is started." };
  }
  for (const key of ["taskId", "branch", "baseBranch", "baseRef", "worktreePath", "manifestPath"]) {
    if (resolve(String(packet[key] || "")) !== resolve(String(expected[key] || "")) && key.endsWith("Path")) {
      return { code: "handoff.resume_packet_invalid", nextSafeAction: "Inspect codex-workspace resume evidence before any implementation worker is started." };
    }
    if (!key.endsWith("Path") && packet[key] !== expected[key]) {
      return { code: "handoff.resume_packet_invalid", nextSafeAction: "Inspect codex-workspace resume evidence before any implementation worker is started." };
    }
  }
  return null;
}

function laneEvidence(value) {
  const lane = value && typeof value === "object" ? value : {};
  const expected = {
    taskId: boundedText(lane.taskId),
    branch: boundedText(lane.branch),
    baseBranch: boundedText(lane.baseBranch),
    baseRef: boundedText(lane.baseRef),
    worktreePath: boundedText(lane.worktreePath),
    manifestPath: boundedText(lane.manifestPath),
    owner: boundedText(lane.owner),
  };
  return Object.values(expected).every(Boolean) && hasProducerCompatibleBasePair(expected) ? expected : null;
}

function stateRootFor(expected) {
  if (!expected) return null;
  const manifestPath = resolve(expected.manifestPath);
  const tasksDir = dirname(manifestPath);
  if (basename(tasksDir) !== "tasks" || basename(manifestPath) !== `${expected.taskId}.json`) return null;
  return dirname(tasksDir);
}

function readManifest(path, context = {}) {
  try {
    const value = context.readManifest
      ? context.readManifest(path)
      : JSON.parse(readFileSync(path, "utf8"));
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

function hasMatchingManifestProvenance(manifest, expected, worktreePath) {
  return Boolean(manifest)
    && manifest.task_id === expected.taskId
    && manifest.status === "active"
    && manifest.branch === expected.branch
    && manifest.base_branch === expected.baseBranch
    && manifest.base_ref === expected.baseRef
    && manifest.owner === expected.owner
    && resolve(String(manifest.worktree_path || manifest.worktreePath || "")) === resolve(worktreePath);
}

function hasProducerCompatibleBasePair(value) {
  const branch = boundedText(value.baseBranch);
  const ref = boundedText(value.baseRef);
  if (!branch || !ref || (ref !== branch && ref !== `origin/${branch}`)) return false;
  if (branch === "HEAD") return true;
  if (
    branch !== branch.trim()
    || branch.startsWith("-")
    || branch.startsWith("refs/")
    || /[\s\u0000-\u001f\u007f]/.test(branch)
    || ["~", "^", ":", "?", "*", "[", "\\"].some((character) => branch.includes(character))
    || branch.includes("..")
    || branch.includes("@{")
    || branch === "@"
    || branch.endsWith(".")
    || branch.endsWith("/")
    || branch.includes("//")
  ) return false;
  return branch.split("/").every((component) => component.length > 0 && !component.startsWith(".") && !component.endsWith(".lock"));
}

function registeredWorktreeRegistry(worktreePath, context = {}) {
  if (typeof context.worktreeRegistry === "function") {
    try {
      const rows = context.worktreeRegistry(worktreePath);
      if (!Array.isArray(rows)) return { ok: false, entries: [], primaryPath: null };
      const entries = rows
        .map((row) => typeof row === "string" ? { path: row, branch: null, detached: false } : row)
        .filter((row) => row && typeof row.path === "string" && row.path.trim())
        .map((row) => ({ path: row.path.trim(), branch: typeof row.branch === "string" ? row.branch : null, detached: row.detached === true }));
      return { ok: entries.length > 0, entries, primaryPath: entries[0]?.path || null };
    } catch {
      return { ok: false, entries: [], primaryPath: null };
    }
  }
  const runner = context.gitRunner || spawnSync;
  const result = runner("git", ["-C", worktreePath, "worktree", "list", "--porcelain"], { encoding: "utf8", stdio: "pipe" });
  if ((result?.status ?? result?.code ?? 1) !== 0) return { ok: false, entries: [], primaryPath: null };
  const entries = String(result.stdout || "")
    .trim()
    .split(/\r?\n\r?\n/)
    .map((block) => {
      const lines = block.split(/\r?\n/);
      const worktree = lines.find((line) => line.startsWith("worktree "))?.slice("worktree ".length).trim();
      const branch = lines.find((line) => line.startsWith("branch "))?.slice("branch ".length).trim() || null;
      return worktree ? { path: worktree, branch, detached: lines.includes("detached") } : null;
    })
    .filter(Boolean);
  return { ok: entries.length > 0, entries, primaryPath: entries[0]?.path || null };
}

function pathIdentity(path, context = {}) {
  try {
    const realpath = context.realpath || realpathSync.native;
    const stat = context.stat || statSync;
    const realPath = resolve(realpath(path));
    const result = stat(realPath);
    return Number.isSafeInteger(result?.dev) && Number.isSafeInteger(result?.ino)
      ? { realPath, dev: result.dev, ino: result.ino }
      : null;
  } catch {
    return null;
  }
}

function samePathIdentity(left, right) {
  return Boolean(left && right) && (left.realPath === right.realPath || (left.dev === right.dev && left.ino === right.ino));
}

function blocked(reasonCode, nextSafeAction, mutation = "none; worker handoff blocked") {
  return Object.freeze({
    status: "blocked",
    outcome: "decision_needed",
    reasonCode,
    nextSafeAction,
    canonicalStage: "human_gate",
    canonicalStatus: "waiting",
    canonicalOwner: "operator",
    projection: Object.freeze({ column: "Needs attention", attentionKind: "operator_decision", derived: true }),
    mutation,
  });
}

function boundedText(value, limit = 256) {
  const text = typeof value === "string" ? value.trim() : "";
  return text && text.length <= limit ? text : null;
}
