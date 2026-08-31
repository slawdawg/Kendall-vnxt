import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { workspaceState } from "./codex-workspace-state.mjs";

const REQUIRED_EVENT_FIELDS = [
  "schemaVersion",
  "eventId",
  "lane",
  "phase",
  "failureClass",
  "signature",
  "attemptedCommand",
  "evidenceSummary",
  "wrongRetryPattern",
  "nextSafeAction",
  "createdAt",
];

export function readLaneChurnEvents(input = {}, options = {}) {
  const lane = normalizeLane(input.laneId || input.lane);
  const state = workspaceState({ stateRoot: options.stateRoot }, {
    repoRoot: options.repoRoot,
    cwd: options.cwd,
    env: options.env,
  });
  const eventStore = join(state.root, "churn-events", `${lane}.jsonl`);
  const warnings = [];

  if (!existsSync(eventStore)) {
    return {
      status: "insufficient-evidence",
      lane,
      eventStore,
      events: [],
      warnings: ["missing-event-store"],
      metadata: input.includeMetadata ? readLaneMetadata(lane, state) : null,
      requiresAuthority: requiresAuthority(),
      chatFallbackUsed: false,
    };
  }

  const raw = readFileSync(eventStore, "utf8");
  if (!raw.trim()) {
    return {
      status: "insufficient-evidence",
      lane,
      eventStore,
      events: [],
      warnings: ["empty-event-store"],
      metadata: input.includeMetadata ? readLaneMetadata(lane, state) : null,
      requiresAuthority: requiresAuthority(),
      chatFallbackUsed: false,
    };
  }

  const events = [];
  const lines = raw.split("\n");
  for (const [index, line] of lines.entries()) {
    if (!line.trim()) {
      continue;
    }
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      warnings.push(`malformed-event-line:${index + 1}`);
      continue;
    }
    if (!isValidEvent(parsed, lane)) {
      warnings.push(`invalid-event-line:${index + 1}`);
      continue;
    }
    events.push(parsed);
  }

  if (events.length === 0) {
    return {
      status: "insufficient-evidence",
      lane,
      eventStore,
      events,
      warnings: [...warnings, "no-valid-events"],
      metadata: input.includeMetadata ? readLaneMetadata(lane, state) : null,
      requiresAuthority: requiresAuthority(),
      chatFallbackUsed: false,
    };
  }

  return {
    status: "success",
    lane,
    eventStore,
    events,
    warnings,
    metadata: input.includeMetadata ? readLaneMetadata(lane, state) : null,
    requiresAuthority: requiresAuthority(),
    chatFallbackUsed: false,
  };
}

function normalizeLane(value) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error("Lane id is required.");
  }
  const lane = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(lane) || lane.includes("..")) {
    throw new Error(`Lane id is not safe for local event storage: ${lane}`);
  }
  return lane;
}

function isValidEvent(event, lane) {
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    return false;
  }
  if (event.lane !== lane) {
    return false;
  }
  return REQUIRED_EVENT_FIELDS.every((field) => event[field] !== undefined && event[field] !== null && event[field] !== "");
}

function readLaneMetadata(lane, state) {
  const manifestPath = join(state.tasksDir, `${lane}.json`);
  if (!existsSync(manifestPath)) {
    return {
      available: false,
      manifestPath,
      worktreeExists: false,
    };
  }
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const worktree = manifest.worktree || manifest.worktree_path || manifest.path || null;
    return {
      available: true,
      manifestPath,
      taskId: manifest.task_id || manifest.id || lane,
      branch: manifest.branch || null,
      owner: manifest.owner || null,
      worktree,
      worktreeExists: worktree ? existsSync(worktree) : false,
      pr: manifest.pr || manifest.pr_url || null,
      cleanupState: manifest.cleanup_state || manifest.cleanup?.state || null,
    };
  } catch {
    return {
      available: false,
      manifestPath,
      worktreeExists: false,
      warning: "malformed-lane-metadata",
    };
  }
}

function requiresAuthority() {
  return [
    {
      reason: "pr-state-not-read-in-local-backfill",
      behavior: "proposal-only",
    },
  ];
}
