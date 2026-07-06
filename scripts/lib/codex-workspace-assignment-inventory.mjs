const ASSIGNMENT_INVENTORY_SCHEMA_VERSION = "manager-assignment-inventory/v0";
const DEFAULT_STALE_AFTER_SECONDS = 86_400;

export function buildAssignmentInventory({
  assignments = [],
  manifests = [],
  currentOwner = "",
  generatedAt = new Date(),
  staleAfterSeconds = DEFAULT_STALE_AFTER_SECONDS,
  stateRoot = "",
} = {}) {
  const generatedDate = normalizeGeneratedAt(generatedAt);
  const context = {
    currentOwner: String(currentOwner || ""),
    generatedAt: generatedDate,
    staleAfterSeconds: positiveInteger(staleAfterSeconds, DEFAULT_STALE_AFTER_SECONDS),
  };
  const laneAssignments = asArray(assignments).map((assignment) => normalizeLaneAssignment(assignment, context));
  const workspaceAssignments = asArray(manifests).map((manifest) => normalizeWorkspaceAssignment(manifest, context));
  const staleOwnerTargets = [...laneAssignments, ...workspaceAssignments].filter((row) => row.status === "blocked_stale_owner_needs_takeover");
  const ownedActiveTargets = [...laneAssignments, ...workspaceAssignments].filter((row) =>
    row.owner === context.currentOwner && ["active", "claimed", "delivery", "cleanup"].includes(row.status),
  );

  return {
    schemaVersion: ASSIGNMENT_INVENTORY_SCHEMA_VERSION,
    generatedAt: generatedDate.toISOString(),
    stateRoot: String(stateRoot || ""),
    currentOwner: context.currentOwner,
    staleAfterSeconds: context.staleAfterSeconds,
    complete: true,
    blockers: [],
    counts: {
      laneAssignments: laneAssignments.length,
      workspaceAssignments: workspaceAssignments.length,
      staleOwnerTargets: staleOwnerTargets.length,
      ownedActiveTargets: ownedActiveTargets.length,
      blockers: 0,
    },
    laneAssignments,
    workspaceAssignments,
    staleOwnerTargets,
    ownedActiveTargets,
    activeLaneEvidence: buildActiveLaneEvidence(ownedActiveTargets),
    legacyMapping: {
      laneAssignments: "assignmentInventory.laneAssignments",
      workspaceAssignments: "assignmentInventory.workspaceAssignments",
      blockedLaneAssignments: "assignmentInventory.staleOwnerTargets[kind=lane_assignment]",
      blockedWorkspaceAssignments: "assignmentInventory.staleOwnerTargets[kind=workspace_assignment]",
    },
  };
}

function normalizeLaneAssignment(assignment = {}, context) {
  const classification = classifyLaneAssignment(assignment, context);
  return stableAssignmentRow({
    kind: "lane_assignment",
    id: assignment.assignment_id || assignment.assignmentId || assignment.task_id || assignment.taskId || assignment.lane_slug,
    assignmentId: assignment.assignment_id || assignment.assignmentId,
    taskId: assignment.task_id || assignment.taskId,
    branch: assignment.branch,
    owner: assignment.owner,
    status: classification.status,
    phase: assignment.phase,
    reasonCode: reasonCodeForClassification(classification),
    reason: classification.reason,
    heartbeat: assignment.last_heartbeat_at || assignment.lastHeartbeatAt || assignment.updated_at || assignment.updatedAt || assignment.assigned_at || assignment.assignedAt || assignment.created_at || assignment.createdAt,
    nextAction: classification.nextAction,
    source: "assignment",
  });
}

function normalizeWorkspaceAssignment(manifest = {}, context) {
  const classification = classifyWorkspaceAssignment(manifest, context);
  return stableAssignmentRow({
    kind: "workspace_assignment",
    id: manifest.task_id || manifest.taskId,
    assignmentId: manifest.assignment_id || manifest.assignmentId,
    taskId: manifest.task_id || manifest.taskId,
    branch: manifest.branch,
    owner: manifest.owner,
    status: classification.status,
    phase: manifest.phase,
    reasonCode: reasonCodeForClassification(classification),
    reason: classification.reason,
    heartbeat: manifest.last_heartbeat_at || manifest.lastHeartbeatAt || manifest.owner_updated_at || manifest.ownerUpdatedAt || manifest.updated_at || manifest.updatedAt || manifest.created_at || manifest.createdAt,
    nextAction: classification.nextAction,
    source: "workspace",
    manifestStatus: manifest.status || "",
    worktreePath: manifest.worktree_path || manifest.worktreePath || "",
  });
}

function stableAssignmentRow(fields = {}) {
  return {
    kind: stringField(fields.kind),
    id: stringField(fields.id, "unknown"),
    assignmentId: stringField(fields.assignmentId),
    taskId: stringField(fields.taskId),
    branch: stringField(fields.branch),
    owner: stringField(fields.owner),
    status: stringField(fields.status, "unknown"),
    phase: stringField(fields.phase),
    reasonCode: stringField(fields.reasonCode),
    reason: stringField(fields.reason),
    heartbeat: stringField(fields.heartbeat),
    nextAction: stringField(fields.nextAction),
    source: stringField(fields.source),
    ...(fields.manifestStatus !== undefined ? { manifestStatus: stringField(fields.manifestStatus) } : {}),
    ...(fields.worktreePath !== undefined ? { worktreePath: stringField(fields.worktreePath) } : {}),
  };
}

function classifyLaneAssignment(assignment = {}, context) {
  if (assignment.status === "closed") {
    return {
      status: "closed",
      reason: "assignment is closed",
      nextAction: "no assignment action",
    };
  }
  if (["done", "merged"].includes(String(assignment.status || ""))) {
    return {
      status: String(assignment.status),
      reason: "assignment is terminal",
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
    if (ownerTimestampIsStale(
      assignment.last_heartbeat_at ||
        assignment.lastHeartbeatAt ||
        assignment.updated_at ||
        assignment.updatedAt ||
        assignment.assigned_at ||
        assignment.assignedAt ||
        assignment.created_at ||
        assignment.createdAt,
      context,
    )) {
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

function classifyWorkspaceAssignment(manifest = {}, context) {
  if (manifest.status === "closed") {
    return {
      status: "closed",
      reason: "workspace manifest is closed",
      nextAction: "no assignment action",
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
  if (String(manifest.status || "").startsWith("blocked_authority")) {
    return {
      status: "blocked_authority",
      reason: "manifest is authority-blocked",
      nextAction: "wait for explicit authority approval",
    };
  }
  if (!manifest.worktree_path && !manifest.worktreePath) {
    return {
      status: "ambiguous",
      reason: "worktree path is missing",
      nextAction: "run workspace doctor or rebuild-index before assignment",
    };
  }
  if (manifest.owner && manifest.owner !== context.currentOwner) {
    if (ownerTimestampIsStale(
      manifest.owner_updated_at ||
        manifest.ownerUpdatedAt ||
        manifest.updated_at ||
        manifest.updatedAt ||
        manifest.created_at ||
        manifest.createdAt,
      context,
    )) {
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

function ownerTimestampIsStale(value, context) {
  const timestamp = Date.parse(String(value || ""));
  if (!Number.isFinite(timestamp)) {
    return true;
  }
  return context.generatedAt.getTime() - timestamp > context.staleAfterSeconds * 1000;
}

function reasonCodeForClassification(classification = {}) {
  const status = String(classification.status || "unknown").trim() || "unknown";
  const reason = String(classification.reason || "").trim();

  if (reason === "workspace manifest is closed") return "workspace_manifest_closed";
  if (reason === "manifest is authority-blocked") return "manifest_authority_blocked";
  if (reason === "worktree path is missing") return "worktree_path_missing";
  if (reason.startsWith("owner heartbeat older than ")) return "owner_heartbeat_stale";
  if (reason.startsWith("owned by ")) return "owned_by_other_runner";
  if (reason === "PR is merged but cleanup is not closed") return "pr_merged_cleanup_pending";
  if (reason === "cleanup is partial" || status === "cleanup") return "cleanup_partial";
  if (reason === "PR is open") return "pr_open_delivery";
  if (reason === "active workspace has no owner") return "active_workspace_unowned";
  if (reason === "owned by current runner") return "active_current_owner";
  if (reason === "assignment is closed") return "assignment_closed";
  if (reason === "assignment is terminal") return "assignment_terminal";
  if (reason === "assignment is authority-blocked") return "assignment_authority_blocked";
  if (reason === "assignment has no owner") return "assignment_missing_owner";
  if (reason.startsWith("assignment heartbeat older than ")) return "assignment_heartbeat_stale";
  if (reason.startsWith("assigned to ")) return "assignment_owned_by_other_runner";
  if (reason === "assignment is owned by current runner") return "assignment_current_owner";
  return status;
}

function buildActiveLaneEvidence(rows = []) {
  return rows.reduce((evidence, row) => {
    evidence[`${row.kind}:${row.id}`] = {
      kind: row.kind,
      id: row.id,
      taskId: row.taskId || null,
      assignmentId: row.assignmentId || null,
      branch: row.branch || null,
      status: row.status,
      source: row.source,
    };
    return evidence;
  }, {});
}

function normalizeGeneratedAt(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value;
  }
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : new Date();
}

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function stringField(value, fallback = "") {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}
